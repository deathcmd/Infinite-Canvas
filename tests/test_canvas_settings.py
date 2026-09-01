"""Regression coverage for canvas-level settings round trips.

The editor has older clients that omit ``settings`` from PUT payloads.  Such
payloads must not erase settings written by a newer client; an explicit empty
object remains a valid way to clear them.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class CanvasSettingsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.canvas_dir = self.root / "canvases"
        self.canvas_dir.mkdir(parents=True)
        self.canvas_id = "settings-regression"
        self.path = self.canvas_dir / f"{self.canvas_id}.json"
        self.path.write_text(
            json.dumps(
                {
                    "id": self.canvas_id,
                    "title": "settings test",
                    "icon": "layers",
                    "kind": "classic",
                    "nodes": [],
                    "connections": [],
                    "viewport": {"x": 0, "y": 0, "scale": 1},
                    "logs": [],
                    "settings": {"theme": "dark", "custom": {"grid": False}},
                    "updated_at": 100,
                }
            ),
            encoding="utf-8",
        )
        self.patch = patch.object(main, "CANVAS_DIR", str(self.canvas_dir))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    async def test_omitted_settings_are_preserved(self):
        payload = main.CanvasSaveRequest(
            title="settings test",
            icon="layers",
            nodes=[],
            connections=[],
            viewport={"x": 0, "y": 0, "scale": 1},
            logs=[],
        )
        self.assertIsNone(payload.settings)
        result = await main.update_canvas(self.canvas_id, payload)
        self.assertEqual(
            result["canvas"]["settings"],
            {"theme": "dark", "custom": {"grid": False}},
        )
        stored = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(stored["settings"]["theme"], "dark")

    async def test_explicit_empty_settings_clear_value(self):
        payload = main.CanvasSaveRequest(
            title="settings test",
            nodes=[],
            connections=[],
            viewport={},
            logs=[],
            settings={},
        )
        result = await main.update_canvas(self.canvas_id, payload)
        self.assertEqual(result["canvas"]["settings"], {})


if __name__ == "__main__":
    unittest.main()
