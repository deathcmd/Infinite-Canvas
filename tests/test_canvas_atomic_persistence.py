"""Regression tests for crash-safe canvas/project JSON persistence."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class AtomicPersistenceTests(unittest.TestCase):
    def test_atomic_json_write_replaces_complete_document_and_cleans_temp_files(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "canvas.json"
            target.write_text(json.dumps({"revision": 1}), encoding="utf-8")

            main._atomic_json_write(str(target), {"revision": 2, "nodes": [{"id": "n1"}]})

            self.assertEqual(
                json.loads(target.read_text(encoding="utf-8")),
                {"revision": 2, "nodes": [{"id": "n1"}]},
            )
            self.assertEqual(list(Path(root).glob(".canvas.json.*.tmp")), [])

    def test_failed_serialization_keeps_previous_document(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "canvas.json"
            original = {"revision": 7, "keep": True}
            target.write_text(json.dumps(original), encoding="utf-8")

            with self.assertRaises(TypeError):
                main._atomic_json_write(str(target), {"bad": object()})

            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), original)
            self.assertEqual(list(Path(root).glob(".canvas.json.*.tmp")), [])

    def test_canvas_and_project_writers_share_atomic_replace_contract(self):
        source = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
        helper_start = source.index("def _atomic_json_write(")
        canvas_start = source.index("def _write_canvas_locked(")
        project_start = source.index("def save_projects(")
        helper = source[helper_start:canvas_start]
        canvas_writer = source[canvas_start:project_start]
        self.assertIn("os.replace(temporary_path, target)", helper)
        self.assertIn("_atomic_json_write(canvas_path(canvas[\"id\"]), canvas)", canvas_writer)
        self.assertIn("_atomic_json_write(PROJECTS_PATH", source[project_start:])
        # Metadata patches must use the same primitive while retaining their
        # intentional non-version-bumping semantics.
        meta_start = source.index("async def update_canvas_meta(")
        meta_end = source.index('\n@app.get("/api/canvases/{canvas_id}")', meta_start)
        metadata_route = source[meta_start:meta_end]
        self.assertIn("_atomic_json_write(canvas_path(canvas[\"id\"]), canvas)", metadata_route)

    def test_replace_failure_does_not_leave_a_new_temp_file(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "canvas.json"
            target.write_text("{\"revision\": 3}", encoding="utf-8")
            with patch.object(main.os, "replace", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    main._atomic_json_write(str(target), {"revision": 4})
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"revision": 3})
            self.assertEqual(list(Path(root).glob(".canvas.json.*.tmp")), [])


if __name__ == "__main__":
    unittest.main()
