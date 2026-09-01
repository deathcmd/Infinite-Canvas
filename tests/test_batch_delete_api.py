"""Regression coverage for the editable-content bulk deletion APIs."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def request_with_user(user="bulk-test"):
    # Starlette's Request only needs this small ASGI scope for safe_user_id.
    return main.Request({
        "type": "http",
        "headers": [(b"x-user-id", user.encode("utf-8"))],
        "client": ("127.0.0.1", 12345),
        "scheme": "http",
        "server": ("127.0.0.1", 3000),
        "method": "POST",
        "path": "/api/conversations/batch-delete",
        "query_string": b"",
    })


class BatchDeleteApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.canvas_dir = self.root / "canvases"
        self.conversation_dir = self.root / "conversations"
        self.asset_dir = self.root / "assets"
        self.library_dir = self.asset_dir / "library"
        self.output_dir = self.asset_dir / "output"
        self.media_preview_dir = self.root / "media_previews"
        for path in (self.canvas_dir, self.conversation_dir, self.library_dir, self.output_dir, self.media_preview_dir):
            path.mkdir(parents=True, exist_ok=True)
        self.history_file = self.root / "history.json"
        self.asset_library_path = self.root / "asset_library.json"
        self.prompt_library_path = self.root / "prompt_libraries.json"
        self.workflow_dir = self.root / "workflows"
        self.workflow_dir.mkdir()
        self.patches = [
            patch.object(main, "CANVAS_DIR", str(self.canvas_dir)),
            patch.object(main, "CONVERSATION_DIR", str(self.conversation_dir)),
            patch.object(main, "ASSETS_DIR", str(self.asset_dir)),
            patch.object(main, "ASSET_LIBRARY_DIR", str(self.library_dir)),
            patch.object(main, "OUTPUT_DIR", str(self.root / "output")),
            patch.object(main, "OUTPUT_OUTPUT_DIR", str(self.output_dir)),
            patch.object(main, "OUTPUT_INPUT_DIR", str(self.asset_dir / "input")),
            patch.object(main, "LOCAL_UPLOAD_DIR", str(self.asset_dir / "uploads")),
            patch.object(main, "MEDIA_PREVIEW_DIR", str(self.media_preview_dir)),
            patch.object(main, "HISTORY_FILE", str(self.history_file)),
            patch.object(main, "ASSET_LIBRARY_PATH", str(self.asset_library_path)),
            patch.object(main, "PROMPT_LIBRARY_PATH", str(self.prompt_library_path)),
            patch.object(main, "WORKFLOW_DIR", str(self.workflow_dir)),
            patch.object(main.manager, "broadcast_canvas_updated", new=AsyncMock()),
            patch.object(main.manager, "broadcast_asset_library_updated", new=AsyncMock()),
            patch.object(main, "delete_media_preview_cache", return_value=0),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    async def test_canvas_trash_restore_and_purge_report_skips(self):
        write_json(self.canvas_dir / "canvas-one.json", {"id": "canvas-one", "title": "one", "nodes": []})
        write_json(self.canvas_dir / "canvas-two.json", {"id": "canvas-two", "title": "two", "nodes": [], "deleted_at": main.now_ms()})
        write_json(self.canvas_dir / "broken.json", {"id": "other"})

        result = await main.batch_delete_canvases(
            main.CanvasBatchDeleteRequest(ids=["canvas-one", "canvas-two", "missing"], action="trash")
        )
        self.assertEqual(result["removed"], ["canvas-one"])
        self.assertEqual({entry["reason"] for entry in result["skipped"]}, {"already_trashed", "not_found"})
        self.assertTrue(json.loads((self.canvas_dir / "canvas-one.json").read_text())["deleted_at"])

        restored = await main.batch_delete_canvases(
            main.CanvasBatchDeleteRequest(ids=["canvas-one", "canvas-two"], action="restore")
        )
        self.assertEqual(set(restored["removed"]), {"canvas-one", "canvas-two"})
        purged = await main.batch_delete_canvases(
            main.CanvasBatchDeleteRequest(ids=["canvas-one", "canvas-two"], action="trash")
        )
        self.assertEqual(set(purged["removed"]), {"canvas-one", "canvas-two"})
        final = await main.batch_delete_canvases(
            main.CanvasBatchDeleteRequest(ids=["canvas-one", "canvas-two"], action="purge")
        )
        self.assertEqual(set(final["removed"]), {"canvas-one", "canvas-two"})
        self.assertFalse((self.canvas_dir / "canvas-one.json").exists())
        self.assertFalse((self.canvas_dir / "canvas-two.json").exists())

    async def test_canvas_ids_are_rejected_without_path_normalization(self):
        with self.assertRaises(main.HTTPException) as ctx:
            await main.batch_delete_canvases(
                main.CanvasBatchDeleteRequest(ids=["../canvas-one"], action="trash")
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_single_canvas_purge_requires_recycle_bin_marker(self):
        """The legacy single-item purge route must not bypass the trash step."""
        active = self.canvas_dir / "active-canvas.json"
        trashed = self.canvas_dir / "trashed-canvas.json"
        write_json(active, {"id": "active-canvas", "title": "active", "nodes": []})
        write_json(trashed, {
            "id": "trashed-canvas",
            "title": "trashed",
            "nodes": [],
            "deleted_at": main.now_ms(),
        })

        with self.assertRaises(main.HTTPException) as ctx:
            await main.purge_canvas("active-canvas")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertTrue(active.exists(), "an active canvas must survive a direct purge request")

        result = await main.purge_canvas("trashed-canvas")
        self.assertEqual(result, {"ok": True, "removed": True})
        self.assertFalse(trashed.exists(), "a canvas already in trash may be purged")
        main.manager.broadcast_canvas_updated.assert_awaited_once_with("trashed-canvas", 0, "")

    async def test_single_canvas_purge_missing_record_is_idempotent(self):
        result = await main.purge_canvas("missing-canvas")
        self.assertEqual(result, {"ok": True, "removed": False})
        main.manager.broadcast_canvas_updated.assert_not_awaited()

    async def test_asset_batch_delete_keeps_referenced_file(self):
        shared = self.library_dir / "shared.png"
        shared.write_bytes(b"png")
        write_json(self.asset_library_path, {
            "active_library_id": "default",
            "libraries": [{
                "id": "default", "name": "Default", "categories": [{
                    "id": "characters", "name": "Characters", "type": "image",
                    "items": [{"id": "asset-one", "name": "shared", "url": "/assets/library/shared.png"}],
                }],
            }],
        })
        write_json(self.canvas_dir / "uses-it.json", {
            "id": "uses-it", "nodes": [{"type": "image", "url": "/assets/library/shared.png"}],
        })
        result = await main.batch_delete_asset_library_items(
            main.AssetLibraryBatchDeleteRequest(ids=["asset-one", "asset-missing"])
        )
        self.assertIsInstance(result["library"], dict)
        self.assertEqual(result["removed"], 1)
        self.assertEqual(result["removed_ids"], ["asset-one"])
        self.assertEqual(result["skipped"][0]["reason"], "not_found")
        self.assertTrue(shared.exists(), "referenced library files must not be removed")

    async def test_single_asset_delete_keeps_referenced_file(self):
        """The legacy DELETE endpoint must enforce the same reference guard."""
        shared = self.library_dir / "shared-single.png"
        shared.write_bytes(b"png")
        write_json(self.asset_library_path, {
            "active_library_id": "default",
            "libraries": [{
                "id": "default", "name": "Default", "categories": [{
                    "id": "characters", "name": "Characters", "type": "image",
                    "items": [{"id": "asset-single", "name": "shared", "url": "/assets/library/shared-single.png"}],
                }],
            }],
        })
        write_json(self.canvas_dir / "uses-it.json", {
            "id": "uses-it", "nodes": [{"type": "image", "url": "/assets/library/shared-single.png"}],
        })
        result = await main.delete_asset_library_item("asset-single")
        self.assertEqual(result["file_cleanup"], "referenced")
        self.assertTrue(shared.exists(), "single-item deletion must not remove referenced files")
        library = json.loads(self.asset_library_path.read_text(encoding="utf-8"))
        self.assertEqual(library["libraries"][0]["categories"][0]["items"], [])

    async def test_conversation_batch_isolated_by_user(self):
        own = self.conversation_dir / "alice"
        other = self.conversation_dir / "bob"
        write_json(own / "conv-one.json", {"id": "conv-one", "title": "one", "messages": []})
        write_json(other / "conv-one.json", {"id": "conv-one", "title": "other", "messages": []})
        result = await main.batch_delete_conversations(
            main.ConversationBatchDeleteRequest(ids=["conv-one", "missing"]),
            request_with_user("alice"),
            "alice",
        )
        self.assertEqual(result["removed"], ["conv-one"])
        self.assertFalse((own / "conv-one.json").exists())
        self.assertTrue((other / "conv-one.json").exists())
        self.assertEqual(result["user_id"], "alice")

    async def test_history_batch_delete_is_atomic_and_cleans_generated_file(self):
        generated = self.output_dir / "generated.png"
        generated.write_bytes(b"generated")
        write_json(self.history_file, [
            {"timestamp": 1.25, "images": ["/assets/output/generated.png"]},
            {"timestamp": 2.5, "images": []},
        ])
        result = await main.batch_delete_history(
            main.HistoryBatchDeleteRequest(timestamps=[1.25, 9.0])
        )
        self.assertEqual(result["removed"], [1.25])
        self.assertEqual(result["skipped"][0]["reason"], "not_found")
        self.assertFalse(generated.exists())
        remaining = json.loads(self.history_file.read_text(encoding="utf-8"))
        self.assertEqual([item["timestamp"] for item in remaining], [2.5])

    def test_workflow_batch_delete_removes_config_but_skips_builtin(self):
        custom = self.workflow_dir / "custom"
        custom.mkdir()
        write_json(custom / "one.json", {"1": {"class_type": "SaveImage", "inputs": {}}})
        write_json(custom / "one.config.json", {"title": "One"})
        write_json(self.workflow_dir / "Z-Image.json", {"1": {"class_type": "SaveImage", "inputs": {}}})
        result = main.batch_delete_workflows(
            main.WorkflowBatchDeleteRequest(names=["custom/one.json", "Z-Image.json"])
        )
        self.assertEqual(result["removed"], ["custom/one.json"])
        self.assertFalse((custom / "one.json").exists())
        self.assertFalse((custom / "one.config.json").exists())
        self.assertEqual(result["skipped"][0]["reason"], "builtin")


if __name__ == "__main__":
    unittest.main()
