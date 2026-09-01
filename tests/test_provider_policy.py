"""Regression tests for the open-source provider/model policy.

The tests use in-memory provider dictionaries only.  They intentionally never
open ``API/.env`` or print credential values.
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import pytest

import main


ROOT = Path(__file__).resolve().parents[1]


def test_blocked_provider_and_model_markers_are_narrow() -> None:
    assert main.is_open_source_blocked_model("grok-imagine-image")
    assert main.is_open_source_blocked_model("GROK-IMAGINE-VIDEO")
    # Explicit paid-tier labels are unavailable in the public build, but
    # ordinary `pro`/`plus` model names remain valid custom-provider names.
    for paid_model in ("seedance25-vip", "model-premium", "paid-image", "subscription_model", "会员版", "付费模型"):
        assert main.is_open_source_blocked_model(paid_model)
    assert not main.is_open_source_blocked_model("gpt-image-2")
    assert not main.is_open_source_blocked_model("flux-pro")
    assert not main.is_open_source_blocked_model("gpt-plus")

    assert main.is_open_source_blocked_provider({"id": "sub2api"})
    assert main.is_open_source_blocked_provider({"name": "Sub2API Grok Heavy"})
    assert main.is_open_source_blocked_provider({"base_url": "https://sub2api.example/v1"})
    assert main.is_open_source_blocked_provider({"id": "vip-gpt", "name": "VIP-GPT"})
    assert not main.is_open_source_blocked_provider(
        {"id": "local-api", "name": "Local API", "base_url": "http://127.0.0.1:9000/v1"}
    )
    # Billing labels are checked in id/name only; a `.vip` host is not treated
    # as a provider selector and remains compatible with custom endpoints.
    assert not main.is_open_source_blocked_provider(
        {"id": "local-api", "name": "Local API", "base_url": "https://apistudio.vip/v1"}
    )


def test_normalize_provider_removes_disabled_model_entries() -> None:
    provider = main.normalize_provider(
        {
            "id": "local-api",
            "name": "Local API",
            "base_url": "http://127.0.0.1:9000/v1",
            "image_models": ["gpt-image-2", "grok-imagine-image", "seedance25-vip"],
            "chat_models": ["gpt-5.5"],
            "video_models": ["grok-imagine-video", "local-video"],
            "model_names": {"grok-imagine-image": "Grok", "seedance25-vip": "VIP", "gpt-image-2": "G2"},
            "model_protocols": {"grok-imagine-image": "openai", "seedance25-vip": "openai", "gpt-image-2": "openai"},
        }
    )
    assert provider["image_models"] == ["gpt-image-2"]
    assert provider["video_models"] == ["local-video"]
    assert "grok-imagine-image" not in provider["model_names"]
    assert "seedance25-vip" not in provider["model_names"]
    assert provider["model_names"] == {"gpt-image-2": "G2"}
    assert "grok-imagine-image" not in provider["model_protocols"]


def test_selected_model_rejects_disabled_route() -> None:
    with pytest.raises(main.HTTPException) as exc_info:
        main.selected_model("grok-imagine-image", "gpt-image-2")
    assert exc_info.value.status_code == 400
    # The error is intentionally vendor-neutral and does not promote the old
    # route in a user-facing message.
    assert "grok" not in str(exc_info.value.detail).lower()


def test_provider_lookup_rejects_disabled_id(monkeypatch: pytest.MonkeyPatch) -> None:
    safe = main.normalize_provider(
        {"id": "local-api", "name": "Local API", "base_url": "http://127.0.0.1:9000/v1"}
    )
    monkeypatch.setattr(main, "load_api_providers", lambda: [safe])
    with pytest.raises(main.HTTPException) as exc_info:
        main.get_api_provider_exact("sub2api")
    assert exc_info.value.status_code == 400
    with pytest.raises(main.HTTPException):
        main.get_api_provider("grok-provider")


def test_provider_normalization_and_probe_payload_reject_disabled_identity() -> None:
    with pytest.raises(main.HTTPException) as exc_info:
        main.normalize_provider(
            {
                "id": "legacy-api",
                "name": "Sub2API Grok",
                "base_url": "https://legacy.example/v1",
            }
        )
    assert exc_info.value.status_code == 400
    with pytest.raises(main.HTTPException):
        main.protocol_from_payload(
            main.TestConnectionPayload(
                provider_id="sub2api",
                base_url="https://legacy.example/v1",
            )
        )
    with pytest.raises(main.HTTPException):
        main.api_key_from_payload(
            main.TestConnectionPayload(
                provider_id="legacy-api",
                base_url="https://grok.example/v1",
            )
        )


def test_public_provider_list_excludes_disabled_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    safe = main.normalize_provider(
        {"id": "local-api", "name": "Local API", "base_url": "http://127.0.0.1:9000/v1"}
    )
    stale = {
        "id": "sub2api",
        "name": "Sub2API Grok Heavy",
        "base_url": "https://sub2api.example/v1",
        "enabled": True,
        "image_models": [],
        "chat_models": [],
        "video_models": [],
    }
    monkeypatch.setattr(main, "load_api_providers", lambda: [safe, stale])
    assert [item["id"] for item in main.public_api_providers()] == ["local-api"]


def test_public_provider_strips_legacy_credentials_and_models() -> None:
    public = main.public_provider(
        {
            "id": "local-api",
            "name": "Local API",
            "base_url": "http://127.0.0.1:9000/v1",
            "api_key": "do-not-return",
            "wallet_api_key": "do-not-return-either",
            "image_models": ["gpt-image-2", "grok-image"],
            "model_names": {"gpt-image-2": "G2", "grok-image": "Grok"},
        }
    )
    assert public is not None
    assert "api_key" not in public
    assert "wallet_api_key" not in public
    assert public["image_models"] == ["gpt-image-2"]
    assert public["model_names"] == {"gpt-image-2": "G2"}


def test_public_provider_filters_paid_tiers_but_keeps_custom_endpoint() -> None:
    public = main.public_provider(
        {
            "id": "local-api",
            "name": "Local API",
            "base_url": "https://apistudio.vip/v1",
            "image_models": ["flux-pro", "seedance25-vip"],
            "chat_models": ["qwen-chat"],
            "video_models": ["model-premium", "local-video"],
            "model_names": {
                "flux-pro": "Flux Pro",
                "seedance25-vip": "VIP tier",
                "model-premium": "Premium tier",
            },
        }
    )
    assert public is not None
    assert public["base_url"] == "https://apistudio.vip/v1"
    assert public["image_models"] == ["flux-pro"]
    assert public["video_models"] == ["local-video"]
    assert public["model_names"] == {"flux-pro": "Flux Pro"}


def test_provider_save_preserves_hidden_catalog_without_exposing_credentials(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Filtering is runtime-only: a settings save must not erase old entries."""

    path = tmp_path / "providers.json"
    path.write_text(
        json.dumps(
            [
                {
                    "id": "local-api",
                    "name": "Local API",
                    "base_url": "https://apistudio.vip/v1",
                    "image_models": ["flux-pro", "seedance25-vip"],
                    "video_models": ["model-premium"],
                    "model_names": {"seedance25-vip": "VIP tier"},
                },
                {
                    "id": "vip-gpt",
                    "name": "VIP-GPT",
                    "base_url": "https://legacy.example/v1",
                    "api_key": "must-not-be-written",
                    "image_models": ["premium-image"],
                },
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "API_PROVIDERS_FILE", str(path))
    monkeypatch.setattr(main, "DATA_DIR", str(tmp_path))

    main.save_api_providers(
        [
            {
                "id": "local-api",
                "name": "Local API",
                "base_url": "https://apistudio.vip/v1",
                "image_models": ["flux-pro"],
                "video_models": [],
            }
        ]
    )
    persisted = json.loads(path.read_text(encoding="utf-8"))
    local = next(item for item in persisted if item.get("id") == "local-api")
    assert "seedance25-vip" in local["image_models"]
    assert local["model_names"]["seedance25-vip"] == "VIP tier"
    legacy = next(item for item in persisted if item.get("id") == "vip-gpt")
    assert "api_key" not in legacy
    assert legacy["image_models"] == ["premium-image"]


def test_selected_model_rejects_paid_tier_but_keeps_pro_name() -> None:
    with pytest.raises(main.HTTPException) as exc_info:
        main.selected_model("seedance25-vip", "flux-pro")
    assert exc_info.value.status_code == 400
    assert main.selected_model("flux-pro", "gpt-image-2") == "flux-pro"


def _sensitive_key_paths(value, path=""):
    """Collect credential-looking keys without printing their values."""
    paths = []
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key).lower().replace("_", "").replace("-", "")
            if any(marker in key_text for marker in ("apikey", "token", "password", "secret", "credential")):
                paths.append(f"{path}/{key}")
            paths.extend(_sensitive_key_paths(item, f"{path}/{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            paths.extend(_sensitive_key_paths(item, f"{path}/{index}"))
    return paths


def test_public_provider_recursively_redacts_workflow_secrets_and_blocked_entries() -> None:
    public = main.public_provider(
        {
            "id": "runninghub",
            "name": "RunningHub",
            "base_url": "https://runninghub.example",
            "api_key": "top-secret",
            "nested": {
                "apiKey": "nested-secret",
                "access_token": "nested-token",
                "password": "nested-password",
                "credential": "nested-credential",
            },
            "image_models": ["local-image"],
            "model_names": {"local-image": "Sub2API compatibility label"},
            "model_protocols": {"local-image": "sub2api"},
            "rh_apps": [
                {"id": "safe-app", "title": "Safe App", "raw": {"api_key": "hidden"}},
                {"id": "blocked-app", "title": "Grok App", "raw": {"api_key": "hidden"}},
                "Sub2API legacy app",
            ],
            "rh_workflows": [
                {
                    "id": "safe-workflow",
                    "title": "Safe Workflow",
                    "fields": [{"fieldName": "model", "fieldValue": "local-image"}],
                    "workflowJson": {"nodes": [{"model": "local-image"}], "api_key": "hidden"},
                    "raw": {"token": "hidden"},
                },
                {
                    "id": "blocked-workflow",
                    "title": "Normal",
                    "note": "ordinary",
                    "fields": [{"fieldName": "provider", "fieldValue": "Sub2API"}],
                },
            ],
        }
    )
    assert public is not None
    assert _sensitive_key_paths(public) == []
    assert [item["id"] for item in public["rh_apps"]] == ["safe-app"]
    assert [item["id"] for item in public["rh_workflows"]] == ["safe-workflow"]
    assert public["rh_workflows"][0]["workflowJson"]["nodes"][0]["model"] == "local-image"
    assert public["model_names"] == {}
    assert public["model_protocols"] == {}


def test_public_workflow_config_redacts_nested_runtime_payload() -> None:
    safe = main.sanitize_public_workflow_config(
        {
            "workflowId": "workflow-safe",
            "title": "本地工作流",
            "fields": [
                {"id": "prompt", "fieldValue": "local prompt", "api_key": "drop-me"},
                {"id": "vendor", "fieldValue": "Grok route should disappear"},
            ],
            "workflowJson": {
                "1": {"class_type": "LocalNode", "inputs": {"prompt": "hello"}},
                "2": {"class_type": "GrokNode", "inputs": {"token": "drop-me"}},
            },
            "raw": {
                "data": {"access_token": "drop-me", "message": "Sub2API compatibility"},
                "ok": True,
            },
        }
    )
    serialized = str(safe).lower()
    assert "api_key" not in serialized
    assert "access_token" not in serialized
    assert "grok" not in serialized
    assert "sub2api" not in serialized
    assert safe["workflowJson"]["1"]["inputs"]["prompt"] == "hello"
    assert safe["raw"]["ok"] is True


def test_runtime_inline_payload_redacts_embedded_credentials() -> None:
    samples = [
        "https://provider.invalid/view?apiKey=SYNTH_KEY&token=SYNTH_TOKEN",
        "https://user:SYNTH_PASSWORD@provider.invalid/path",
        "Authorization: Bearer SYNTH_BEARER_TOKEN",
        '{\\"apiKey\\":\\"SYNTH_JSON_KEY\\",\\"secret_key\\":\\"SYNTH_SECRET\\"}',
        "accessKeyId=SYNTH_ACCESS_ID client_secret=SYNTH_CLIENT_SECRET",
    ]
    serialized = "\n".join(str(main.sanitize_public_runtime_value(item)) for item in samples)
    for secret in (
        "SYNTH_KEY",
        "SYNTH_TOKEN",
        "SYNTH_PASSWORD",
        "SYNTH_BEARER_TOKEN",
        "SYNTH_JSON_KEY",
        "SYNTH_SECRET",
        "SYNTH_ACCESS_ID",
        "SYNTH_CLIENT_SECRET",
    ):
        assert secret not in serialized
    assert "[redacted]" in serialized


def test_runtime_api_json_boundary_redacts_payload_and_preserves_safe_status() -> None:
    """Exercise the final HTTP sanitizer with an upstream-shaped response.

    This deliberately calls the middleware directly instead of starting a
    server.  It protects the public boundary against credentials hidden in
    nested JSON/URLs while making sure the boolean presence hints consumed by
    the settings UI are not mistaken for credentials.  Imported or malformed
    metadata must not be allowed to smuggle a full secret through a preview
    field.
    """

    payload = {
        "api_key": "FULL_API_KEY",
        "nested": {
            "apiKey": "FULL_NESTED_KEY",
            "token": "FULL_TOKEN",
            "Authorization": "Bearer FULL_BEARER_TOKEN",
            "url": (
                "https://user:FULL_PASSWORD@provider.invalid/path"
                "?api_key=FULL_QUERY_KEY&token=FULL_QUERY_TOKEN"
            ),
            "signed_url": (
                "https://provider.invalid/out?X-Amz-Signature=FULL_SIGNATURE"
                "&X-Amz-Credential=FULL_CREDENTIAL&OSSAccessKeyId=FULL_OSS_KEY"
                "&keep=visible"
            ),
            "basic_auth": "Authorization: Basic FULL_BASIC_CREDENTIAL",
            "digest_auth": 'Authorization: Digest username="FULL_DIGEST_CREDENTIAL", realm="safe"',
            "semantic_field": {
                "fieldName": "apiKey",
                "fieldValue": "FULL_SEMANTIC_KEY",
            },
            "provider_note": "grok and Sub2API must not be public",
        },
        "provider_status": {
            "has_token": True,
            "token_present": False,
            "has_key": True,
            "key_preview": "FULL_SECRET",
            "key_env": "API_PROVIDER_LOCAL_KEY",
        },
        "malformed_status": {
            "has_token": "FULL_TOKEN",
            "token_present": {"secret": "FULL_SECRET"},
            "has_key": ["FULL_KEY"],
            "key_preview": {"value": "FULL_SECRET"},
            "key_env": "FULL_SECRET",
        },
        "safe": {"message": "local provider is ready"},
    }

    async def call_next(_request):
        return main.JSONResponse(payload)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/api/synthetic-sanitizer",
        "raw_path": b"/api/synthetic-sanitizer",
        "query_string": b"",
        "headers": [],
        "client": ("test", 1234),
        "server": ("test", 80),
        "root_path": "",
    }
    response = asyncio.run(main.sanitize_public_api_json(main.Request(scope), call_next))
    cleaned = json.loads(response.body.decode("utf-8"))
    serialized = json.dumps(cleaned, ensure_ascii=False)

    for secret in (
        "FULL_API_KEY",
        "FULL_NESTED_KEY",
        "FULL_TOKEN",
        "FULL_BEARER_TOKEN",
        "FULL_PASSWORD",
        "FULL_QUERY_KEY",
        "FULL_QUERY_TOKEN",
        "FULL_SIGNATURE",
        "FULL_CREDENTIAL",
        "FULL_OSS_KEY",
        "FULL_BASIC_CREDENTIAL",
        "FULL_DIGEST_CREDENTIAL",
        "FULL_SEMANTIC_KEY",
        "FULL_KEY",
        "FULL_SECRET",
    ):
        assert secret not in serialized
    assert "grok" not in serialized.lower()
    assert "sub2api" not in serialized.lower()
    assert "keep=visible" in serialized
    assert "semantic_field" not in cleaned["nested"]
    assert main._redact_public_string(
        "https://x.invalid/out?foo=x;Signature=FULL_SEMI#X-Amz-Signature=FULL_FRAGMENT]"
    ) == "https://x.invalid/out?foo=x;Signature=[redacted]#X-Amz-Signature=[redacted]"
    assert main._redact_public_string(
        "https://x.invalid/out?Signature%3DFULL_ENCODED"
    ) == "https://x.invalid/out?Signature=[redacted]"
    assert main._redact_public_string(
        "Authorization: Digest username=\"FULL_DIGEST_CREDENTIAL\", realm=\"safe\""
    ) == "Authorization: [redacted]"

    # These are public presence flags, not secret values, and must retain their
    # boolean shape for the settings UI.
    status = cleaned["provider_status"]
    assert status["has_token"] is True
    assert status["token_present"] is False
    assert status["has_key"] is True
    # A full key must never survive in a preview; omission or a deterministic
    # redacted placeholder are both safe outcomes.
    assert status.get("key_preview") in (None, "", "[redacted]") or "FULL" not in str(
        status.get("key_preview")
    )
    assert status.get("key_env") == "API_PROVIDER_LOCAL_KEY"

    malformed = cleaned.get("malformed_status", {})
    assert malformed == {}

    for semantic_name in ("auth", "privateKey", "signature", "cookie", "session", "jwt", "customKey"):
        assert main.sanitize_public_runtime_value(
            {"fieldName": semantic_name, "fieldValue": "FULL_SEMANTIC_SECRET"}
        ) == {}


def test_runninghub_error_detail_and_store_key_stay_public_safe() -> None:
    detail = main.runninghub_error_detail(
        "upstream failed",
        {"message": "apiKey=SYNTH_RAW_KEY", "url": "https://x.invalid/?token=SYNTH_RAW_TOKEN"},
        endpoint="https://x.invalid/api?apiKey=SYNTH_ENDPOINT_KEY",
    )
    serialized = str(detail)
    assert "SYNTH_RAW_KEY" not in serialized
    assert "SYNTH_RAW_TOKEN" not in serialized
    assert "SYNTH_ENDPOINT_KEY" not in serialized
    assert main.runninghub_workflow_store_key("Grok-workflow") == ""
    assert main.runninghub_workflow_store_key("local-workflow") == "local-workflow"
    assert main.runninghub_workflow_store_key("apiKey=SYNTH_KEY") == ""
    assert main.runninghub_workflow_store_key(
        "https://oss.test/a?OSSAccessKeyId=SYNTH_ACCESS&Signature=SYNTH_SIG"
    ) == ""


def test_opaque_task_id_shape_and_legacy_query_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reject credential-bearing IDs before any legacy provider request runs."""

    safe_id = "task-v1/segment_ABC:42"
    assert main.sanitize_public_opaque_id(safe_id) == safe_id

    unsafe_ids = (
        "authentication-abc123",
        "sessionId-abc123",
        "jwt-abc123",
        "apiKey-abc123",
        "https://example.invalid/task-123",
        "task;123",
        "task|123",
        "task%2F123",
    )
    for task_id in unsafe_ids:
        assert main.sanitize_public_opaque_id(task_id) == "", task_id

    calls = []

    def fake_provider(_provider_id: str):
        return {
            "id": "local-api",
            "name": "Local API",
            "base_url": "http://127.0.0.1:9000/v1",
            "protocol": "openai",
        }

    async def fake_fetch(_client, task_id: str, _provider):
        calls.append(task_id)
        return {"status": "processing"}

    monkeypatch.setattr(main, "get_api_provider", fake_provider)
    monkeypatch.setattr(main, "is_runninghub_provider", lambda _provider: False)
    monkeypatch.setattr(main, "fetch_image_task_payload", fake_fetch)
    monkeypatch.setattr(main, "extract_images", lambda _raw: [])

    result = asyncio.run(
        main.query_image_task(
            main.ImageTaskQueryRequest(provider_id="local-api", task_id=safe_id)
        )
    )
    assert result["status"] == "running"
    assert result["task_id"] == safe_id
    assert calls == [safe_id]

    for task_id in unsafe_ids:
        with pytest.raises(main.HTTPException) as exc_info:
            asyncio.run(
                main.query_image_task(
                    main.ImageTaskQueryRequest(provider_id="local-api", task_id=task_id)
                )
            )
        assert exc_info.value.status_code == 400
    # Invalid IDs fail before the provider adapter/fetcher is reached.
    assert calls == [safe_id]


def test_global_token_endpoint_returns_presence_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(main, "modelscope_api_key", lambda: "server-token-for-test")
    result = asyncio.run(main.get_global_token())
    assert result == {"has_token": True, "token_present": True}
    assert "token" not in result

    monkeypatch.setattr(main, "modelscope_api_key", lambda: "")
    config_path = tmp_path / "global-config.json"
    config_path.write_text('{"modelscope_token":"server-token-for-test"}', encoding="utf-8")
    monkeypatch.setattr(main, "GLOBAL_CONFIG_FILE", str(config_path))
    result = asyncio.run(main.get_global_token())
    assert result == {"has_token": True, "token_present": True}
    assert "token" not in result


def test_jimeng_credit_commands_are_neutral_and_never_execute(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail_if_called(*_args, **_kwargs):
        raise AssertionError("credit command must not reach the CLI")

    monkeypatch.setattr(main, "run_jimeng_cli", fail_if_called)
    direct = asyncio.run(main.jimeng_help(main.JimengHelpRequest(command="user_credit")))
    assert direct["disabled"] is True
    assert direct["command"] == ""
    assert direct["text"] == main.OPEN_SOURCE_NO_BILLING_MESSAGE
    assert direct["raw"] is None

    alias = asyncio.run(main.jimeng_help(main.JimengHelpRequest(command="balance")))
    assert alias["disabled"] is True
    assert alias["text"] == main.OPEN_SOURCE_NO_BILLING_MESSAGE

    credit = asyncio.run(main.jimeng_credit())
    assert credit["disabled"] is True
    assert credit["text"] == main.OPEN_SOURCE_NO_BILLING_MESSAGE


def test_jimeng_help_output_redacts_credit_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_help(*_args, **_kwargs):
        return {
            "_stdout": "Usage: dreamina [command]\n  user_credit   inspect balance\n  text2image    create image",
            "_stderr": "wallet quota unavailable",
        }

    monkeypatch.setattr(main, "run_jimeng_cli", fake_help)
    result = asyncio.run(main.jimeng_help(main.JimengHelpRequest(command="")))
    combined = f"{result['text']} {result['raw']}".lower()
    assert "user_credit" not in combined
    assert "balance" not in combined
    assert main.OPEN_SOURCE_NO_BILLING_MESSAGE in result["text"]


def test_jimeng_help_ui_removes_credit_command_option() -> None:
    source = (ROOT / "static/api-settings.html").read_text(encoding="utf-8").lower()
    assert 'value="user_credit"' not in source
    assert "检查登录状态" in source


def test_legacy_modelscope_pages_consume_only_token_presence() -> None:
    for page in ("static/angle.html", "static/zimage.html"):
        source = (ROOT / page).read_text(encoding="utf-8")
        assert "/api/config/token" in source
        assert not re.search(r"\bdata\.token\b(?!_)", source)
        assert "token_present" in source


def test_jimeng_status_and_login_status_do_not_use_credit_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "jimeng_cli_executable", lambda: "dreamina")
    monkeypatch.setattr(main, "jimeng_cli_version", lambda: asyncio.sleep(0, result=((1, 4, 2), "1.4.2")))
    status = asyncio.run(main.jimeng_status())
    assert status["logged_in"] is None
    assert status["raw"] is None

    class FinishedProcess:
        returncode = 0

    monkeypatch.setattr(main, "JIMENG_LOGIN_SESSION", {"proc": FinishedProcess(), "stdout": "login complete", "stderr": "", "started_at": 1})
    login_status = asyncio.run(main.jimeng_login_status())
    assert login_status["logged_in"] is True
    assert login_status["raw"] is None


def test_model_discovery_payload_is_sanitized() -> None:
    payload = main.sanitize_model_payload(
        {
            "all": ["gpt-image-2", "grok-imagine-image"],
            "image_models": ["gpt-image-2", "grok-imagine-image"],
            "chat_models": ["gpt-5.5"],
            "video_models": ["grok-imagine-video", "local-video"],
            "model_names": {"grok-imagine-image": "Grok", "gpt-image-2": "G2"},
        }
    )
    assert payload["all"] == ["gpt-image-2"]
    assert payload["image_models"] == ["gpt-image-2"]
    assert payload["video_models"] == ["local-video"]
    assert payload["model_names"] == {"gpt-image-2": "G2"}


def test_save_provider_endpoint_rejects_disabled_identity(monkeypatch: pytest.MonkeyPatch) -> None:
    # Avoid touching the real provider store or environment during this test.
    monkeypatch.setattr(main, "save_api_providers", lambda _providers: None)
    payload = [
        main.ApiProviderPayload(
            id="sub2api",
            name="Sub2API Grok Heavy",
            base_url="https://sub2api.example/v1",
        )
    ]
    with pytest.raises(main.HTTPException) as exc_info:
        asyncio.run(main.save_providers(payload))
    assert exc_info.value.status_code == 400


def test_standalone_routes_share_configured_contact_surface() -> None:
    brand_ui = (ROOT / "static/js/brand-ui.js").read_text(encoding="utf-8")
    assert "ensureStandaloneContactSurface" in brand_ui
    assert "studio-contact-launcher" in brand_ui
    for page in ("canvas-list.html", "canvas.html", "smart-canvas.html", "api-settings.html"):
        source = (ROOT / "static" / page).read_text(encoding="utf-8")
        assert "brand-config.js" in source
        assert "brand-ui.js" in source
