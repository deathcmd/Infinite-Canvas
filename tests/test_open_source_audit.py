"""Static release checks for the open-source Canvas Lab build.

These checks deliberately inspect only files that would be shipped.  Runtime
state under ``API/.env`` and ``data/`` is local user state and is never read or
printed by this module.  The companion ``XYQ-REVIEW-REPORT.md`` records the
manual/browser findings that cannot be made into deterministic assertions.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def _text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_release_contract_files_exist() -> None:
    required = [
        "README.md",
        "CODEX-XYQ-PLAN.md",
        "static/index.html",
        "static/home.html",
        "static/canvas-list.html",
        "static/canvas.html",
        "static/smart-canvas.html",
        "static/api-settings.html",
        "static/asset-manager.html",
        "static/script-studio.html",
        "static/stage-desk-smoke.html",
        # The standalone director desk is a shipped product surface, not
        # merely a smoke fixture.  Keep its shell and controller in the
        # release contract so packaging cannot silently omit them.
        "static/director-desk.html",
        "static/css/director-desk.css",
        "static/css/motion-effects.css",
        "static/css/libtv-theme.css",
        "static/css/libtv-aux.css",
        "static/js/canvas-list-layout.js",
        "static/js/director-desk.js",
        "static/js/brand-config.js",
        "static/js/brand-ui.js",
        "static/js/video-workflow-schema.js",
        "static/js/video-workflow-adapter.js",
        "static/js/video-workflow-panel.js",
        "static/js/video-workflow-stage3d.js",
    ]
    missing = [path for path in required if not (ROOT / path).is_file()]
    assert not missing, f"missing release contract files: {missing}"


def test_brand_identity_is_configuration_driven() -> None:
    config = _text("static/js/brand-config.js")
    index = _text("static/index.html")
    ui = _text("static/js/brand-ui.js")

    assert "CanvasBrandConfig" in config
    assert "contacts" in config
    assert "data-brand-app-name" in index
    assert "data-brand-short-name" in index
    assert "brand-config.js" in index
    assert "brand-ui.js" in index
    # Contact values must be assigned through textContent, never interpolated
    # into executable markup.  This protects a publisher replacing the config.
    assert "row.querySelector('strong').textContent" in ui
    assert "row.querySelector('small').textContent" in ui
    assert "javascript:" not in ui.lower()
    # Branding must not erase a utility route's explicit document title; only
    # the generic shell fallback may be replaced with the configured app name.
    assert "genericTitles" in ui
    assert "contactPreviousFocus" in ui
    assert "modal.setAttribute('aria-hidden', 'false')" in ui
    assert "event.key !== 'Tab'" in ui
    assert "event.shiftKey" in ui
    # The published build must expose the maintainer's supplied public
    # channels, not the old placeholder identity.
    assert "2734891913@qq.com" in config
    assert "mailto:2734891913@qq.com" in config
    assert "https://x.com/deathcmd527" in config
    assert "maintainerName: 'deathcmd'" in config

    # The old upstream identity must not leak into the publishable UI files.
    publishable = "\n".join(
        _text(path)
        for path in (
            "README.md",
            "static/index.html",
            "static/home.html",
            "static/canvas-list.html",
            "static/canvas.html",
            "static/js/brand-config.js",
            "static/js/brand-ui.js",
        )
    ).lower()
    assert "wuli大雄" not in publishable
    assert "louis" not in publishable


def test_standalone_director_surface_is_wired() -> None:
    """The 小云雀-like standalone desk must remain independently launchable."""

    page = _text("static/director-desk.html")
    css = _text("static/css/director-desk.css")
    controller = _text("static/js/director-desk.js")
    panel = _text("static/js/video-workflow-panel.js")
    canvas = _text("static/js/canvas.js")

    # HTML shell: contextual title, host states, and all shared runtime
    # dependencies needed to mount a real stage (not the smoke fixture).
    assert "director-desk" in page
    assert 'id="directorLoading"' in page
    assert 'id="directorHost"' in page
    assert "video-workflow-schema.js" in page
    assert "video-workflow-adapter.js" in page
    assert "video-workflow-panel.js" in page
    assert "director-desk.js" in page

    # Controller supports both a connected canvas (`?id=...`) and local
    # draft fallback, while selecting only a stage-capable node.
    assert "/api/canvases/" in controller
    assert "standalone: true" in controller
    assert "stageHost" in controller and "ltxDirector" in controller
    assert "localStorage" in controller
    assert "base_updated_at" in controller
    # Connected edits remain recoverable across a rejected save or tab close;
    # flushSave exposes a boolean outcome so navigation cannot discard them.
    assert ":recovery" in controller
    assert "saveRecoveryDraft" in controller
    assert "return Boolean(!saving && !dirty && !saveAgain && !lastSaveError)" in controller
    assert "未离开" in controller and "beforeunload" in controller
    assert "event.returnValue" in controller

    # Embedded canvas cards expose an explicit independent-page affordance;
    # its URL is constrained to this same-origin standalone shell in JS.
    assert "data-stage-open-page" in panel
    assert "openPageUrl" in panel
    assert "director-desk.html" in canvas
    assert "openPageUrl" in canvas
    assert "target=\"_blank\"" in panel
    assert "about:blank" in panel
    assert "flushOk === false" in panel
    assert "onOpenPageError" in panel
    assert "return Boolean(canvas && !applyingRemoteCanvas" in canvas
    assert "director-page" in css


def test_billing_controls_are_disabled_in_active_ui() -> None:
    api_js = _text("static/js/api-settings.js")
    smart_js = _text("static/js/smart-canvas.js")
    main_py = _text("main.py")
    api_html = _text("static/api-settings.html")

    assert re.search(r"const\s+ENABLE_SERVICE_TEMPLATES\s*=\s*false\b", api_js)
    assert re.search(r"const\s+OPEN_SOURCE_NO_BILLING\s*=\s*true\b", api_js)
    assert re.search(r"const\s+ENABLE_BILLING_CONTROLS\s*=\s*false\b", smart_js)
    assert re.search(r"OPEN_SOURCE_NO_BILLING\s*=\s*True\b", main_py)

    # Compatibility wallet/credit controls may remain in legacy markup, but
    # they must be non-rendering and cannot be activated by the UI.
    wallet_block = re.search(
        r'<div[^>]+class="rh-key-item"[^>]+hidden[^>]*>.*?</div>\s*</div>',
        api_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert wallet_block, "legacy wallet field must stay hidden"
    assert re.search(
        r'onclick="refreshJimengCredit\(\)"[^>]+hidden',
        api_html,
        flags=re.IGNORECASE,
    )
    assert "recommendApiOverlay" in api_html
    assert re.search(
        r'id="recommendApiOverlay"[^>]+hidden', api_html, flags=re.IGNORECASE
    )


def test_model_agnostic_workflow_contract() -> None:
    workflow_files = [
        ROOT / "static/js/video-workflow-schema.js",
        ROOT / "static/js/video-workflow-adapter.js",
        ROOT / "static/js/video-workflow-panel.js",
        ROOT / "static/js/video-workflow-stage3d.js",
    ]
    forbidden = ("seedance", "seedream", "grok")
    for path in workflow_files:
        source = path.read_text(encoding="utf-8").lower()
        for word in forbidden:
            assert word not in source, f"{path.name} contains vendor-specific {word}"
    _assert_checked_in_video_preview_fixture_is_neutral()


def _assert_checked_in_video_preview_fixture_is_neutral() -> None:
    """The optional sample workflow must never select a paid/vendor preset.

    The filename is retained as a migration alias for older local exports, but
    the checked-in payload itself is a provider/model-agnostic preview.  Keep
    this contract here because a JSON fixture is otherwise easy to miss when
    auditing only JavaScript workflow sources.
    """

    path = ROOT / "static/seedance25-video-workflow.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    serialized = json.dumps(payload, ensure_ascii=False).lower()
    forbidden_patterns = (
        r"seedance",
        r"seedream",
        r"\bgrok\b",
        r"\b(?:premium|vip|paid|subscription|membership)\b",
        r"(?:会员|积分|钱包|余额|充值|付费)",
        r"(?<!\d)30\s*(?:s|秒)\b",
        r"50\s*[-_ ]?(?:ref|参考|images?)",
    )
    for pattern in forbidden_patterns:
        assert not re.search(pattern, serialized, flags=re.IGNORECASE), (
            f"preview fixture contains blocked marker: {pattern}"
        )

    nodes = payload.get("nodes") or []
    node_ids = {str(node.get("id") or "") for node in nodes if isinstance(node, dict)}
    assert len(node_ids) == len(nodes) and "" not in node_ids
    connections = payload.get("connections") or []
    assert connections, "preview fixture must retain at least one node connection"
    for connection in connections:
        assert connection.get("from") in node_ids
        assert connection.get("to") in node_ids

    video_nodes = [
        node for node in nodes
        if isinstance(node, dict)
        and isinstance(node.get("runSettings"), dict)
        and node["runSettings"].get("apiKind") == "video"
    ]
    assert video_nodes, "preview fixture must retain a video-capable node"
    for node in video_nodes:
        settings = node["runSettings"]
        assert settings.get("engine") == "api"
        assert settings.get("apiKind") == "video"
        assert not settings.get("provider_id")
        assert not settings.get("videoProvider")
        assert not settings.get("model")
        assert not settings.get("videoModel")
        assert settings.get("videoDuration") == 5
        assert settings.get("videoGenerateAudio") is False
        assert settings.get("videoMultimodal") is False
        assert settings.get("rhPayment") in (None, "")


def test_paid_tier_model_filter_is_narrow_and_shared() -> None:
    """Explicit paid labels are hidden without banning ordinary `pro` models."""

    backend = _text("main.py")
    assert "OPEN_SOURCE_BILLING_MODEL_MARKERS" in backend
    assert "subscription" in backend and "membership" in backend
    assert "Do not blanket-match words such as ``pro``" in backend
    for page_script in (
        "static/js/api-settings.js",
        "static/js/canvas.js",
        "static/js/smart-canvas.js",
        "static/js/video-workflow-panel.js",
    ):
        source = _text(page_script)
        assert "OPEN_SOURCE_BILLING_MODEL_RE" in source, f"paid-tier guard missing from {page_script}"
        assert "premium" in source and "membership" in source
        # A substring `/pro/i` would hide valid custom model names and is not
        # part of the public-build policy.
        assert not re.search(
            r"(?:OPEN_SOURCE_BILLING_MODEL_RE|OPEN_SOURCE_BLOCKED_MODEL_RE)\s*=\s*/[^/]*pro",
            source,
            re.I,
        )


def test_tracked_release_files_do_not_contain_common_secret_literals() -> None:
    """Catch accidental key commits without touching local ``API/.env``."""

    try:
        result = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        # A source archive without .git can still run the rest of the suite.
        return

    candidates = [item for item in result.stdout.decode("utf-8", "ignore").split("\x00") if item]
    secret_pattern = re.compile(
        r"(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})"
    )
    hits: list[str] = []
    for relative in candidates:
        path = ROOT / relative
        if not path.is_file() or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".zip", ".tgz", ".whl"}:
            continue
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if secret_pattern.search(source):
            hits.append(relative)
    assert not hits, f"possible secret literal in tracked release files: {hits}"


def test_local_state_is_ignored_before_release() -> None:
    ignore = _text(".gitignore")
    for entry in (
        "API/.env",
        "*.env",
        "data/",
        "/assets/",
        "output/",
        "user_attachment/",
        "user_attachment\n",
        "/history.json",
        "/seedance25*.json",
        "/santi-*.json",
        "/static/runninghub/api_providers.json",
        "/static/runninghub/thumbnails/",
    ):
        assert entry in ignore, f"local state is not ignored: {entry}"


def test_video_error_path_does_not_call_removed_helper() -> None:
    """The Tudou HTTP error branch must return an HTTPException, not NameError."""

    backend = _text("main.py")
    assert "friendly_video_error_detail" not in backend
    assert "土豆视频接口错误" in backend


def test_stage_view_mode_survives_panel_remount() -> None:
    """Changing 2D/3D must survive the panel's state-preserving remount."""

    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError:
        pytest.skip("Playwright is not installed")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.set_default_timeout(4000)
        try:
            page.goto(
                "http://127.0.0.1:3000/static/stage-desk-smoke.html",
                wait_until="domcontentloaded",
                timeout=6000,
            )
        except PlaywrightError:
            browser.close()
            pytest.skip("local Canvas Lab server is not running")
        page.wait_for_timeout(800)
        mode = page.locator("[data-view-mode-select]")
        assert mode.input_value() == "3d"
        mode.select_option("2d")
        page.wait_for_timeout(250)
        assert mode.input_value() == "2d"
        mode.select_option("3d")
        page.wait_for_timeout(700)
        assert mode.input_value() == "3d"
        browser.close()
