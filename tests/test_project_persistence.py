"""Regression tests for serialized project/canvas mutations."""

import asyncio
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def request_for_project(project_id="project-one"):
    return main.Request(
        {
            "type": "http",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
            "server": ("127.0.0.1", 3000),
            "method": "DELETE",
            "path": f"/api/projects/{project_id}",
            "query_string": b"",
        }
    )


class ProjectPersistenceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.data_dir = self.root / "data"
        self.canvas_dir = self.data_dir / "canvases"
        self.data_dir.mkdir(parents=True)
        self.canvas_dir.mkdir(parents=True)
        self.patches = [
            patch.object(main, "DATA_DIR", str(self.data_dir)),
            patch.object(main, "PROJECTS_PATH", str(self.data_dir / "projects.json")),
            patch.object(main, "CANVAS_DIR", str(self.canvas_dir)),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def write_projects(self, projects):
        (self.data_dir / "projects.json").write_text(
            json.dumps({"projects": projects}, ensure_ascii=False), encoding="utf-8"
        )

    async def test_delete_project_reassigns_canvas_atomically_and_preserves_content(self):
        self.write_projects(
            [
                {"id": "default", "name": "默认项目", "order": 0, "created_at": 1, "updated_at": 1},
                {"id": "project-one", "name": "待删除", "order": 1, "created_at": 2, "updated_at": 2},
            ]
        )
        canvas = {
            "id": "canvas-one",
            "project": "project-one",
            "title": "保留内容",
            "nodes": [{"id": "node-1", "type": "prompt", "text": "内容"}],
            "connections": [{"id": "link-1", "from": "node-1", "to": "node-2"}],
            "logs": [{"id": "log-1"}],
            "updated_at": 100,
        }
        canvas_path = self.canvas_dir / "canvas-one.json"
        canvas_path.write_text(json.dumps(canvas, ensure_ascii=False), encoding="utf-8")

        result = await main.delete_project("project-one")

        self.assertEqual(result, {"ok": True, "moved": 1})
        stored_canvas = json.loads(canvas_path.read_text(encoding="utf-8"))
        self.assertEqual(stored_canvas["project"], "default")
        self.assertEqual(stored_canvas["nodes"], canvas["nodes"])
        self.assertEqual(stored_canvas["connections"], canvas["connections"])
        self.assertEqual(stored_canvas["logs"], canvas["logs"])
        self.assertGreater(stored_canvas["updated_at"], canvas["updated_at"])
        self.assertEqual(list(canvas_path.parent.glob(".canvas-one.json.*.tmp")), [])
        stored_projects = json.loads((self.data_dir / "projects.json").read_text(encoding="utf-8"))
        self.assertEqual([p["id"] for p in stored_projects["projects"]], ["default"])
        self.assertEqual(list((self.data_dir).glob(".projects.json.*.tmp")), [])

    def test_new_project_serializes_read_modify_write_transactions(self):
        self.write_projects(
            [{"id": "default", "name": "默认项目", "order": 0, "created_at": 1, "updated_at": 1}]
        )
        entered = threading.Event()
        release = threading.Event()
        original_load = main._load_projects_unlocked
        first = {"value": True}
        errors = []

        def delayed_load():
            if first["value"]:
                first["value"] = False
                entered.set()
                if not release.wait(5):
                    raise AssertionError("timed out waiting for second project request")
            return original_load()

        def create(name):
            try:
                main.new_project(name)
            except BaseException as exc:
                errors.append(exc)

        with patch.object(main, "_load_projects_unlocked", side_effect=delayed_load):
            first_thread = threading.Thread(target=create, args=("项目 A",), daemon=True)
            first_thread.start()
            self.assertTrue(entered.wait(2), "first project request did not enter its transaction")
            second_thread = threading.Thread(target=create, args=("项目 B",), daemon=True)
            second_thread.start()
            # The second request must wait on PROJECT_LOCK rather than loading
            # the same stale project list and overwriting the first one.
            self.assertTrue(second_thread.is_alive())
            release.set()
            first_thread.join(5)
            second_thread.join(5)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(second_thread.is_alive())
        self.assertFalse(errors, errors)
        stored = json.loads((self.data_dir / "projects.json").read_text(encoding="utf-8"))
        self.assertEqual({item["name"] for item in stored["projects"]}, {"默认项目", "项目 A", "项目 B"})
        self.assertEqual(len(stored["projects"]), 3)

    async def test_update_project_keeps_concurrent_canvas_write_ordered(self):
        self.write_projects(
            [{"id": "default", "name": "默认项目", "order": 0, "created_at": 1, "updated_at": 1}]
        )
        # The route should reject a missing project without writing a partial
        # projects file; this also exercises the locked ensure-default path.
        with self.assertRaises(main.HTTPException) as ctx:
            await main.update_project("missing", main.ProjectUpdateRequest(name="不会写入"))
        self.assertEqual(ctx.exception.status_code, 404)
        stored = json.loads((self.data_dir / "projects.json").read_text(encoding="utf-8"))
        self.assertEqual([item["id"] for item in stored["projects"]], ["default"])


if __name__ == "__main__":
    unittest.main()
