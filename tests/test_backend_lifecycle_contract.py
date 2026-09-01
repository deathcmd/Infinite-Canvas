"""Backend lifecycle and crash-safe settings regression coverage."""

import asyncio
import ast
import json
from unittest.mock import patch
from pathlib import Path

import main


def test_fastapi_uses_supported_lifespan_without_on_event_deprecation():
    source = Path(main.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    on_event_calls = []
    for node in ast.walk(tree):
        for decorator in getattr(node, "decorator_list", []):
            if isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute):
                if isinstance(decorator.func.value, ast.Name) and decorator.func.value.id == "app":
                    if decorator.func.attr == "on_event":
                        on_event_calls.append(node.lineno)
    assert not on_event_calls
    assert main.app.router.lifespan_context is main.app_lifespan


def test_storage_settings_round_trip_uses_atomic_document(tmp_path, monkeypatch):
    settings_path = tmp_path / "storage_settings.json"
    data_dir = tmp_path / "data"
    defaults = {
        "upload": tmp_path / "default-upload",
        "generated": tmp_path / "default-generated",
        "local": tmp_path / "default-local",
    }
    monkeypatch.setattr(main, "STORAGE_SETTINGS_FILE", str(settings_path))
    monkeypatch.setattr(main, "DATA_DIR", str(data_dir))
    monkeypatch.setattr(main, "DEFAULT_STORAGE_DIRS", {k: str(v) for k, v in defaults.items()})
    for attr in ("OUTPUT_INPUT_DIR", "OUTPUT_OUTPUT_DIR", "LOCAL_UPLOAD_DIR"):
        monkeypatch.setattr(main, attr, str(tmp_path / attr.lower()))

    expected = {
        "upload": str(tmp_path / "upload"),
        "generated": str(tmp_path / "generated"),
        "local": str(tmp_path / "local"),
    }
    result = main.save_storage_settings(expected)

    assert result == {"dirs": expected}
    assert json.loads(settings_path.read_text(encoding="utf-8")) == expected
    assert not list(tmp_path.glob(".storage_settings.json.*.tmp"))
    assert main.load_storage_settings()["dirs"] == expected


def test_update_backup_manifest_uses_atomic_json_and_normalizes_payload(tmp_path):
    backup_dir = tmp_path / "restore-point"

    # The helper is also safe for a direct caller before the backup directory
    # has been created; malformed payloads must never produce invalid JSON.
    main.write_update_backup_manifest(str(backup_dir), ["not", "a", "mapping"])

    manifest_path = backup_dir / main.UPDATE_BACKUP_MANIFEST
    assert json.loads(manifest_path.read_text(encoding="utf-8")) == {}
    assert not list(backup_dir.glob(".*.tmp"))


def test_malformed_storage_settings_shape_falls_back_to_defaults(tmp_path, monkeypatch):
    settings_path = tmp_path / "storage_settings.json"
    settings_path.write_text("[]", encoding="utf-8")
    defaults = {
        "upload": str(tmp_path / "default-upload"),
        "generated": str(tmp_path / "default-generated"),
        "local": str(tmp_path / "default-local"),
    }
    monkeypatch.setattr(main, "STORAGE_SETTINGS_FILE", str(settings_path))
    monkeypatch.setattr(main, "DEFAULT_STORAGE_DIRS", defaults)
    assert main.load_storage_settings()["dirs"] == {
        key: str(Path(value).resolve()) for key, value in defaults.items()
    }


def test_lifespan_executes_startup_hook(monkeypatch):
    called = []
    monkeypatch.setattr(main, "migrate_asset_library_into_dirs", lambda: called.append("assets"))
    monkeypatch.setattr(main, "migrate_double_extension_uploads", lambda: called.append("double"))
    monkeypatch.setattr(main, "migrate_mislabeled_image_extensions", lambda: called.append("labels"))

    async def run():
        async with main.app.router.lifespan_context(main.app):
            assert main.GLOBAL_LOOP is asyncio.get_running_loop()

    asyncio.run(run())
    assert called == ["assets", "double", "labels"]
    # The shutdown half of the lifespan must release the loop reference so a
    # later synchronous mutation cannot schedule onto a closed test loop.
    assert main.GLOBAL_LOOP is None


def test_history_batch_write_failure_is_stable_and_non_destructive(tmp_path, monkeypatch):
    history_path = tmp_path / "history.json"
    original = [
        {"timestamp": 1.0, "images": []},
        {"timestamp": 2.0, "images": []},
    ]
    history_path.write_text(json.dumps(original), encoding="utf-8")
    monkeypatch.setattr(main, "HISTORY_FILE", str(history_path))

    async def run():
        with patch.object(main, "_atomic_json_write", side_effect=OSError("disk full")):
            return await main.batch_delete_history(
                main.HistoryBatchDeleteRequest(timestamps=[1.0])
            )

    result = __import__("asyncio").run(run())
    assert result["removed"] == []
    assert result["skipped"][0]["reason"] == "write_failed"
    assert json.loads(history_path.read_text(encoding="utf-8")) == original


def test_malformed_asset_library_entries_are_quarantined_in_memory(tmp_path, monkeypatch):
    path = tmp_path / "asset_library.json"
    path.write_text(
        json.dumps({"libraries": [{"id": "broken", "categories": ["bad", {"id": "ok", "items": [None, {"id": "asset"}]}]}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "ASSET_LIBRARY_PATH", str(path))

    library = main.load_asset_library()

    assert isinstance(library["libraries"], list)
    categories = library["libraries"][0]["categories"]
    assert [category["id"] for category in categories] == ["ok"]
    assert [item["id"] for item in categories[0]["items"]] == ["asset"]


def test_asset_classification_parser_returns_stable_shape_for_invalid_embedded_json():
    parsed = main.parse_asset_classification_text("caption before {not: valid json} caption after")

    assert parsed["categories"] == {}
    assert parsed["tags"] == []
    assert parsed["flat"] == []
    assert isinstance(parsed["updated_at"], int)


def test_asset_classification_prompt_is_atomic_and_preserves_previous_on_write_failure(tmp_path, monkeypatch):
    prompt_path = tmp_path / "asset_classification_prompt.txt"
    monkeypatch.setattr(main, "ASSET_CLASSIFICATION_PROMPT_FILE", str(prompt_path))
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path / "data"))

    assert main.save_asset_classification_prompt("first prompt") == "first prompt"
    assert prompt_path.read_text(encoding="utf-8") == "first prompt"
    assert main.load_asset_classification_prompt() == "first prompt"
    assert not list(tmp_path.glob(".asset_classification_prompt.txt.*.tmp"))

    # A failed replacement must not truncate the last known-good prompt.
    import pytest
    with patch.object(main, "_atomic_text_write", side_effect=OSError("disk full")):
        with pytest.raises(OSError):
            main.save_asset_classification_prompt("second prompt")
    assert prompt_path.read_text(encoding="utf-8") == "first prompt"


def test_workflow_read_errors_are_stable_and_sidecar_shape_is_checked(tmp_path, monkeypatch):
    workflow_root = tmp_path / "workflows"
    custom = workflow_root / "custom"
    custom.mkdir(parents=True)
    bad = custom / "broken.json"
    bad.write_text("{broken", encoding="utf-8")
    monkeypatch.setattr(main, "WORKFLOW_DIR", str(workflow_root))

    import pytest
    with pytest.raises(main.HTTPException) as exc_info:
        main.get_workflow("custom/broken.json")
    assert exc_info.value.status_code == 409

    good = custom / "good.json"
    good.write_text(json.dumps({"1": {"class_type": "SaveImage", "inputs": {}}}), encoding="utf-8")
    (custom / "good.config.json").write_text(json.dumps(["not", "a", "mapping"]), encoding="utf-8")
    result = main.get_workflow("custom/good.json")
    assert isinstance(result["config"], dict)
    assert result["config"]["title"] == "custom/good"


def test_canvas_read_errors_are_stable_and_record_identity_is_checked(tmp_path, monkeypatch):
    canvas_root = tmp_path / "canvases"
    canvas_root.mkdir()
    monkeypatch.setattr(main, "CANVAS_DIR", str(canvas_root))
    (canvas_root / "broken.json").write_text("{broken", encoding="utf-8")
    import pytest
    with pytest.raises(main.HTTPException) as exc_info:
        main.load_canvas("broken")
    assert exc_info.value.status_code == 409

    (canvas_root / "mismatch.json").write_text(json.dumps({"id": "other"}), encoding="utf-8")
    with pytest.raises(main.HTTPException) as exc_info:
        main.load_canvas_any("mismatch")
    assert exc_info.value.status_code == 409


def test_conversation_listing_skips_malformed_shapes_and_id_mismatches(tmp_path, monkeypatch):
    conversation_root = tmp_path / "conversations" / "alice"
    conversation_root.mkdir(parents=True)
    monkeypatch.setattr(main, "CONVERSATION_DIR", str(tmp_path / "conversations"))
    (conversation_root / "valid-one.json").write_text(
        json.dumps({"id": "valid-one", "title": "ok", "messages": ["bad", {"role": "user", "content": "hello"}]}),
        encoding="utf-8",
    )
    (conversation_root / "not-a-list.json").write_text(json.dumps({"id": "not-a-list", "messages": {"role": "user"}}), encoding="utf-8")
    (conversation_root / "mismatch.json").write_text(json.dumps({"id": "other", "messages": []}), encoding="utf-8")
    (conversation_root / "scalar.json").write_text(json.dumps("bad"), encoding="utf-8")

    listed = main._list_conversations_unlocked("alice")

    assert {item["id"] for item in listed} == {"valid-one", "not-a-list"}
    valid = next(item for item in listed if item["id"] == "valid-one")
    malformed_messages = next(item for item in listed if item["id"] == "not-a-list")
    assert valid["last_message"] == "hello"
    assert malformed_messages["last_message"] == ""


def test_canvas_listing_skips_bad_json_arrays_and_id_mismatches(tmp_path, monkeypatch):
    canvas_root = tmp_path / "canvases"
    canvas_root.mkdir()
    monkeypatch.setattr(main, "CANVAS_DIR", str(canvas_root))
    (canvas_root / "valid.json").write_text(
        json.dumps({"id": "valid", "title": "ok", "nodes": []}), encoding="utf-8"
    )
    (canvas_root / "array.json").write_text("[]", encoding="utf-8")
    (canvas_root / "mismatch.json").write_text(json.dumps({"id": "other", "nodes": []}), encoding="utf-8")
    (canvas_root / "broken.json").write_text("{broken", encoding="utf-8")
    (canvas_root / "odd.json").write_text(
        json.dumps({"id": "odd", "title": 123, "nodes": {"not": "a-list"}, "updated_at": "nan"}),
        encoding="utf-8",
    )

    listed = main.list_canvases()

    assert {item["id"] for item in listed} == {"valid", "odd"}
    odd = next(item for item in listed if item["id"] == "odd")
    assert odd["node_count"] == 0
    assert odd["updated_at"] == 0
