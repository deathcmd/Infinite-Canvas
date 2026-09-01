"""Regression coverage for conversation file integrity and single-item CRUD.

Conversation records live in JSON files and are shared by the chat page, the
conversation list and batch cleanup.  These tests pin the same atomic/locked
contract used by canvas persistence so a concurrent delete cannot remove a
record that was recreated after the delete began.
"""

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


def request_for_user(user="conversation-test"):
    return main.Request(
        {
            "type": "http",
            "headers": [(b"x-user-id", user.encode("utf-8"))],
            "client": ("127.0.0.1", 12345),
            "scheme": "http",
            "server": ("127.0.0.1", 3000),
            "method": "DELETE",
            "path": "/api/conversations/conv-one",
            "query_string": b"",
        }
    )


class ConversationPersistenceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.conversation_dir = self.root / "conversations"
        self.conversation_dir.mkdir(parents=True)
        self.patch = patch.object(main, "CONVERSATION_DIR", str(self.conversation_dir))
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def write_record(self, user, conversation_id, **extra):
        directory = self.conversation_dir / user
        directory.mkdir(parents=True, exist_ok=True)
        record = {
            "id": conversation_id,
            "title": "测试对话",
            "created_at": 1,
            "updated_at": 1,
            "messages": [],
        }
        record.update(extra)
        path = directory / f"{conversation_id}.json"
        path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return path

    def test_save_conversation_is_atomic_and_load_validates_record_identity(self):
        conversation = {
            "id": "conv-one",
            "title": "稳定保存",
            "updated_at": 2,
            "messages": [{"role": "user", "content": "保留"}],
        }
        main.save_conversation("alice", conversation)
        path = self.conversation_dir / "alice" / "conv-one.json"
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), conversation)
        self.assertEqual(list(path.parent.glob(".conv-one.json.*.tmp")), [])
        self.assertEqual(main.load_conversation("alice", "conv-one"), conversation)

        # A file-name/record-ID mismatch must not be exposed as the requested
        # conversation; this also protects legacy files from accidental edits.
        path.write_text(json.dumps({"id": "other", "messages": []}), encoding="utf-8")
        with self.assertRaises(main.HTTPException) as ctx:
            main.load_conversation("alice", "conv-one")
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_single_delete_rejects_normalization_and_keeps_other_record(self):
        path = self.write_record("alice", "conv-one")
        with self.assertRaises(main.HTTPException) as ctx:
            await main.delete_conversation("conv-one!", request_for_user("alice"), "alice")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertTrue(path.exists(), "an invalid ID must not be normalized to a real record")

    def test_canvas_path_rejects_normalization_too(self):
        # Canvas single-item routes use the same filesystem-backed ID contract;
        # punctuation must not be stripped into another existing filename.
        for invalid in ("canvas-one!", " canvas-one", "../canvas-one", ""):
            with self.subTest(invalid=invalid), self.assertRaises(main.HTTPException) as ctx:
                main.canvas_path(invalid)
            self.assertEqual(ctx.exception.status_code, 400)

    def test_delete_waits_for_inflight_save_before_removing_record(self):
        """The old unlocked delete could remove a record recreated mid-delete."""
        path = self.write_record("alice", "conv-one")
        entered_remove = threading.Event()
        release_remove = threading.Event()
        original_remove = main.os.remove
        delete_errors = []

        def blocking_remove(candidate):
            if Path(candidate) == path:
                entered_remove.set()
                if not release_remove.wait(5):
                    raise AssertionError("timed out waiting for concurrent save")
            return original_remove(candidate)

        def run_delete():
            try:
                asyncio.run(main.delete_conversation("conv-one", request_for_user("alice"), "alice"))
            except BaseException as exc:  # surface worker failures below
                delete_errors.append(exc)

        replacement = {
            "id": "conv-one",
            "title": "删除后重新创建",
            "updated_at": 3,
            "messages": [{"role": "user", "content": "新记录"}],
        }
        with patch.object(main.os, "remove", side_effect=blocking_remove):
            delete_thread = threading.Thread(target=run_delete, daemon=True)
            delete_thread.start()
            self.assertTrue(entered_remove.wait(2), "delete did not reach its locked remove phase")

            save_thread = threading.Thread(
                target=main.save_conversation,
                args=("alice", replacement),
                daemon=True,
            )
            save_thread.start()
            # The save must wait for the delete's lock.  With the old unlocked
            # route it ran here and the subsequent remove erased the new file.
            self.assertTrue(save_thread.is_alive(), "save unexpectedly bypassed delete lock")
            release_remove.set()
            delete_thread.join(5)
            save_thread.join(5)

        self.assertFalse(delete_thread.is_alive())
        self.assertFalse(save_thread.is_alive())
        self.assertFalse(delete_errors, delete_errors)
        self.assertTrue(path.exists(), "a save that starts after delete must survive")
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["title"], "删除后重新创建")


if __name__ == "__main__":
    unittest.main()
