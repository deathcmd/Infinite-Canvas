"""Regression tests for crash-safe, non-destructive history writes."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


class HistoryPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.history_path = Path(self.temp.name) / "history.json"
        self.patch = patch.object(main, "HISTORY_FILE", str(self.history_path))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def test_malformed_history_is_preserved_instead_of_being_cleared(self):
        original = b'{"truncated": '
        self.history_path.write_bytes(original)

        result = main.save_to_history({"type": "zimage", "images": ["/assets/output/new.png"]})

        self.assertFalse(result)
        self.assertEqual(self.history_path.read_bytes(), original)

    def test_prune_uses_atomic_replace_and_preserves_malformed_history(self):
        generated = Path(self.temp.name) / "output" / "generated.png"
        generated.parent.mkdir(parents=True, exist_ok=True)
        generated.write_bytes(b"generated")
        history = [
            {"timestamp": 1, "images": ["/output/generated.png"]},
            {"timestamp": 2, "images": ["/output/other.png"]},
        ]
        self.history_path.write_text(json.dumps(history), encoding="utf-8")
        with patch.object(main, "OUTPUT_DIR", str(generated.parent)):
            removed = main.prune_generation_history_for_media([str(generated)])
        self.assertEqual(removed, 1)
        stored = json.loads(self.history_path.read_text(encoding="utf-8"))
        self.assertEqual([item["timestamp"] for item in stored], [2])
        self.assertEqual(list(self.history_path.parent.glob(".history.json.*.tmp")), [])

        original = b'{"broken": '
        self.history_path.write_bytes(original)
        with patch.object(main, "OUTPUT_DIR", str(generated.parent)):
            self.assertEqual(main.prune_generation_history_for_media([str(generated)]), 0)
        self.assertEqual(self.history_path.read_bytes(), original)
        self.assertEqual(list(self.history_path.parent.glob(".history.json.*.tmp")), [])

    def test_utf8_bom_history_is_loaded_and_new_record_is_atomically_added(self):
        old = [{"timestamp": 1, "images": ["/assets/output/old.png"]}]
        self.history_path.write_bytes(
            b"\xef\xbb\xbf" + json.dumps(old, ensure_ascii=False).encode("utf-8")
        )

        result = main.save_to_history({"timestamp": 2, "images": ["/assets/output/new.png"]})

        self.assertTrue(result)
        stored = json.loads(self.history_path.read_text(encoding="utf-8-sig"))
        self.assertEqual([item["timestamp"] for item in stored], [2, 1])
        self.assertEqual(list(self.history_path.parent.glob(".history.json.*.tmp")), [])

    def test_non_list_history_is_preserved(self):
        original = b'{"records": []}'
        self.history_path.write_bytes(original)

        result = main.save_to_history({"timestamp": 3, "images": []})

        self.assertFalse(result)
        self.assertEqual(self.history_path.read_bytes(), original)


class HistoryMutationApiTests(unittest.IsolatedAsyncioTestCase):
    """Regression coverage for the legacy single-card history endpoint."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.history_path = self.root / "history.json"
        self.assets_dir = self.root / "assets"
        self.output_dir = self.assets_dir / "output"
        self.input_dir = self.assets_dir / "input"
        self.canvas_dir = self.root / "canvases"
        self.conversation_dir = self.root / "conversations"
        self.asset_library_path = self.root / "asset_library.json"
        for path in (
            self.output_dir,
            self.input_dir,
            self.canvas_dir,
            self.conversation_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)
        self.patches = [
            patch.object(main, "HISTORY_FILE", str(self.history_path)),
            patch.object(main, "ASSETS_DIR", str(self.assets_dir)),
            patch.object(main, "OUTPUT_DIR", str(self.root / "legacy-output")),
            patch.object(main, "OUTPUT_OUTPUT_DIR", str(self.output_dir)),
            patch.object(main, "CANVAS_DIR", str(self.canvas_dir)),
            patch.object(main, "CONVERSATION_DIR", str(self.conversation_dir)),
            patch.object(main, "ASSET_LIBRARY_PATH", str(self.asset_library_path)),
            patch.object(main, "MEDIA_PREVIEW_DIR", str(self.root / "previews")),
            patch.object(main, "delete_media_preview_cache", return_value=0),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def write_history(self, value, *, bom=False):
        encoded = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
        self.history_path.write_bytes((b"\xef\xbb\xbf" if bom else b"") + encoded)

    async def test_single_delete_atomically_removes_unreferenced_generated_media(self):
        generated = self.output_dir / "single.png"
        generated.write_bytes(b"generated")
        self.write_history([
            {"timestamp": 10.0, "images": ["/assets/output/single.png"]},
            {"timestamp": 20.0, "images": []},
        ], bom=True)

        result = await main.delete_history(main.DeleteHistoryRequest(timestamp=10.0))

        self.assertTrue(result["success"])
        self.assertEqual(result["removed_files"], ["single.png"])
        self.assertEqual(result["skipped_files"], [])
        self.assertFalse(generated.exists())
        stored = json.loads(self.history_path.read_text(encoding="utf-8-sig"))
        self.assertEqual([item["timestamp"] for item in stored], [20.0])
        self.assertEqual(list(self.history_path.parent.glob(".history.json.*.tmp")), [])

    async def test_single_delete_keeps_media_referenced_by_canvas_or_remaining_history(self):
        generated = self.output_dir / "shared.png"
        generated.write_bytes(b"generated")
        self.write_history([
            {"timestamp": 1.0, "images": ["/assets/output/shared.png"]},
            {"timestamp": 2.0, "images": ["/assets/output/shared.png"]},
        ])
        (self.canvas_dir / "uses-it.json").write_text(
            json.dumps({"id": "uses-it", "nodes": [{"url": "/assets/output/shared.png"}]}),
            encoding="utf-8",
        )

        result = await main.delete_history(main.DeleteHistoryRequest(timestamp=1.0))

        self.assertTrue(result["success"])
        self.assertEqual(result["removed_files"], [])
        self.assertEqual(result["skipped_files"], ["shared.png"])
        self.assertTrue(generated.exists())
        stored = json.loads(self.history_path.read_text(encoding="utf-8"))
        self.assertEqual([item["timestamp"] for item in stored], [2.0])

    async def test_single_delete_never_removes_input_uploads(self):
        uploaded = self.input_dir / "keep.png"
        uploaded.write_bytes(b"input")
        self.write_history([
            {"timestamp": 3.0, "images": ["/assets/input/keep.png"]},
        ])

        result = await main.delete_history(main.DeleteHistoryRequest(timestamp=3.0))

        self.assertTrue(result["success"])
        self.assertEqual(result["removed_files"], [])
        self.assertTrue(uploaded.exists())

    async def test_single_delete_preserves_malformed_history_and_returns_stable_error(self):
        original = b'{"truncated": '
        self.history_path.write_bytes(original)

        result = await main.delete_history(main.DeleteHistoryRequest(timestamp=4.0))

        self.assertEqual(result, {"success": False, "message": "History file unreadable"})
        self.assertEqual(self.history_path.read_bytes(), original)
        self.assertEqual(list(self.history_path.parent.glob(".history.json.*.tmp")), [])

    async def test_single_delete_keeps_original_when_atomic_write_fails(self):
        original_history = [{"timestamp": 5.0, "images": ["/assets/output/five.png"]}]
        self.write_history(original_history)
        with patch.object(main, "_atomic_json_write", side_effect=OSError("disk full")):
            result = await main.delete_history(main.DeleteHistoryRequest(timestamp=5.0))

        self.assertEqual(result, {"success": False, "message": "History file could not be saved"})
        self.assertEqual(json.loads(self.history_path.read_text(encoding="utf-8")), original_history)

    async def test_get_history_reads_bom_and_ignores_malformed_entries(self):
        self.write_history([
            {"timestamp": 1, "images": ["/assets/output/one.png"]},
            "legacy scalar",
            {"timestamp": 2, "images": []},
        ], bom=True)

        result = await main.get_history_api()

        self.assertEqual([item["timestamp"] for item in result], [1])


if __name__ == "__main__":
    unittest.main()
