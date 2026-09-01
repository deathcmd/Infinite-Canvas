"""Regression tests for metadata-only edits from the canvas manager.

The manager's rename/icon controls used to issue a partial ``PUT
/api/canvases/{id}``.  ``CanvasSaveRequest`` fills omitted ``logs`` with an
empty list, so changing an icon or title from the list silently deleted every
generation-log entry.  These tests pin the narrow ``/meta`` contract both in
the browser code and at the API boundary.
"""

import json
import re
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


ROOT = Path(__file__).resolve().parents[1]
CANVAS_JS = (ROOT / "static" / "js" / "canvas.js").read_text(encoding="utf-8")
MAIN_PY = (ROOT / "main.py").read_text(encoding="utf-8")


def function_source(name: str, next_name: str) -> str:
    """Return one top-level JS function body for focused source assertions."""
    pattern = rf"async function {re.escape(name)}\([\s\S]*?(?=\n(?:async )?function {re.escape(next_name)}\()"
    match = re.search(pattern, CANVAS_JS)
    if not match:
        raise AssertionError(f"could not locate {name} in canvas.js")
    return match.group(0)


class CanvasMetadataPatchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.canvas_dir = Path(self.temp.name) / "canvases"
        self.canvas_dir.mkdir(parents=True)
        self.canvas_id = "metadata-regression"
        self.canvas_path = self.canvas_dir / f"{self.canvas_id}.json"
        self.canvas_path.write_text(
            json.dumps(
                {
                    "id": self.canvas_id,
                    "title": "原始标题",
                    "icon": "layers",
                    "kind": "classic",
                    "nodes": [{"id": "node-1", "type": "prompt", "text": "保留"}],
                    "connections": [{"id": "link-1", "from": "node-1", "to": "node-2"}],
                    "logs": [{"id": "log-1", "outputs": ["/output/keep.png"]}],
                    "settings": {"theme": "dark"},
                    "viewport": {"x": 12, "y": 18, "scale": 0.8},
                    "updated_at": 100,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        self.patch = patch.object(main, "CANVAS_DIR", str(self.canvas_dir))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_manager_metadata_controls_use_narrow_meta_endpoint(self):
        icon_fn = function_source("setCanvasIcon", "startTitleEdit")
        title_fn = function_source("setCanvasTitle", "openCanvas")

        self.assertIn("patchCanvasMeta(id, {icon: nextIcon})", icon_fn)
        self.assertIn("patchCanvasMeta(id, {title: nextTitle})", title_fn)
        self.assertNotIn("method:'PUT'", icon_fn)
        self.assertNotIn("method:'PUT'", title_fn)
        self.assertNotIn("/api/canvases/${id}`", icon_fn)
        self.assertNotIn("/api/canvases/${id}`", title_fn)

    def test_metadata_route_takes_lock_before_reading_snapshot(self):
        """Keep the read/modify/write transaction atomic against editor PUTs."""
        start = MAIN_PY.index("async def update_canvas_meta(")
        end = MAIN_PY.index("\n@app.get(\"/api/canvases/{canvas_id}\")", start)
        route = MAIN_PY[start:end]
        self.assertLess(route.index("with CANVAS_LOCK:"), route.index("canvas = load_canvas(canvas_id)"))

        save_start = MAIN_PY.index("async def update_canvas(")
        save_end = MAIN_PY.index("\n@app.delete(\"/api/canvases/{canvas_id}\")", save_start)
        save_route = MAIN_PY[save_start:save_end]
        self.assertLess(save_route.index("with CANVAS_LOCK:"), save_route.index("canvas = load_canvas(canvas_id)"))
        self.assertIn("_write_canvas_locked(canvas)", save_route)

        for name, marker in (
            ("touch_canvas", "\n@app.post(\"/api/canvases/{canvas_id}/logs/delete\")"),
            ("delete_canvas", "\n@app.post(\"/api/canvases/{canvas_id}/restore\")"),
            ("restore_canvas", "\n@app.delete(\"/api/canvases/{canvas_id}/purge\")"),
        ):
            route_start = MAIN_PY.index(f"async def {name}(")
            route_end = MAIN_PY.index(marker, route_start)
            route = MAIN_PY[route_start:route_end]
            self.assertLess(route.index("with CANVAS_LOCK:"), route.index("load_canvas"))
            self.assertIn("_write_canvas_locked(canvas)", route)

    async def test_metadata_and_content_saves_do_not_lose_each_other(self):
        """A metadata request blocked in its read phase must not write a stale document."""
        original_load = main.load_canvas
        entered = threading.Event()
        release = threading.Event()
        first_call = {"value": True}

        def delayed_load(canvas_id):
            if first_call["value"]:
                first_call["value"] = False
                entered.set()
                if not release.wait(5):
                    raise AssertionError("timed out waiting for metadata transaction")
            return original_load(canvas_id)

        errors = []

        def run(coro_factory):
            try:
                import asyncio

                asyncio.run(coro_factory())
            except BaseException as exc:  # report thread failures in the test thread
                errors.append(exc)

        with patch.object(main, "load_canvas", side_effect=delayed_load), patch.object(
            main.manager, "broadcast_canvas_updated", new=AsyncMock()
        ):
            metadata_thread = threading.Thread(
                target=run,
                args=(lambda: main.update_canvas_meta(self.canvas_id, main.CanvasMetaUpdate(owner="Alice")),),
                daemon=True,
            )
            metadata_thread.start()
            self.assertTrue(entered.wait(2), "metadata route did not enter its locked read phase")

            content_thread = threading.Thread(
                target=run,
                args=(
                    lambda: main.update_canvas(
                        self.canvas_id,
                        main.CanvasSaveRequest(
                            title="内容保存",
                            icon="layers",
                            nodes=[{"id": "new-node", "type": "prompt"}],
                            connections=[],
                            viewport={"x": 0, "y": 0, "scale": 1},
                            logs=[{"id": "new-log"}],
                        ),
                    ),
                ),
                daemon=True,
            )
            content_thread.start()
            # The content writer must wait for the metadata transaction's
            # lock; this is the regression that the old read-before-lock
            # implementation could not guarantee.
            self.assertTrue(content_thread.is_alive())
            release.set()
            metadata_thread.join(5)
            content_thread.join(5)

        self.assertFalse(metadata_thread.is_alive())
        self.assertFalse(content_thread.is_alive())
        self.assertFalse(errors, errors)
        stored = json.loads(self.canvas_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["owner"], "Alice")
        self.assertEqual(stored["nodes"], [{"id": "new-node", "type": "prompt"}])
        self.assertEqual(stored["logs"], [{"id": "new-log"}])

    async def test_touch_trash_and_restore_preserve_the_document(self):
        """Single-item CRUD mutations must not drop editable content."""
        with patch.object(main.manager, "broadcast_canvas_updated", new=AsyncMock()):
            touched = await main.touch_canvas(self.canvas_id)
            self.assertEqual(touched["canvas"]["id"], self.canvas_id)
            touched_record = json.loads(self.canvas_path.read_text(encoding="utf-8"))
            self.assertEqual(touched_record["nodes"], [{"id": "node-1", "type": "prompt", "text": "保留"}])
            self.assertEqual(touched_record["logs"], [{"id": "log-1", "outputs": ["/output/keep.png"]}])

            deleted = await main.delete_canvas(self.canvas_id)
            self.assertTrue(deleted["ok"])
            trashed = json.loads(self.canvas_path.read_text(encoding="utf-8"))
            self.assertTrue(trashed.get("deleted_at"))
            self.assertEqual(trashed["nodes"], [{"id": "node-1", "type": "prompt", "text": "保留"}])
            self.assertEqual(trashed["logs"], [{"id": "log-1", "outputs": ["/output/keep.png"]}])

            restored = await main.restore_canvas(self.canvas_id)
            self.assertNotIn("deleted_at", restored["canvas"])
            self.assertEqual(restored["canvas"]["nodes"], [{"id": "node-1", "type": "prompt", "text": "保留"}])
            self.assertEqual(restored["canvas"]["logs"], [{"id": "log-1", "outputs": ["/output/keep.png"]}])

    async def test_meta_update_preserves_editable_document_and_logs(self):
        result = await main.update_canvas_meta(
            self.canvas_id,
            main.CanvasMetaUpdate(title="新标题", icon="film"),
        )
        self.assertEqual(result["canvas"]["title"], "新标题")
        self.assertEqual(result["canvas"]["icon"], "film")

        stored = json.loads(self.canvas_path.read_text(encoding="utf-8"))
        self.assertEqual(stored["nodes"], [{"id": "node-1", "type": "prompt", "text": "保留"}])
        self.assertEqual(stored["connections"], [{"id": "link-1", "from": "node-1", "to": "node-2"}])
        self.assertEqual(stored["logs"], [{"id": "log-1", "outputs": ["/output/keep.png"]}])
        self.assertEqual(stored["settings"], {"theme": "dark"})
        self.assertEqual(stored["viewport"], {"x": 12, "y": 18, "scale": 0.8})


if __name__ == "__main__":
    unittest.main()
