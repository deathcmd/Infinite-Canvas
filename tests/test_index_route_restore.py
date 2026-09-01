"""Regression coverage for integrated-shell route persistence."""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "static" / "index.html"


def _restore_body() -> str:
    source = INDEX.read_text(encoding="utf-8")
    match = re.search(
        r"function\s+restoreActivePage\s*\(\)\s*\{(?P<body>.*?)\n\s*\}\n\s*document\.addEventListener\(",
        source,
        flags=re.S,
    )
    assert match, "restoreActivePage must remain an explicit bootstrap function"
    return match.group("body")


def test_saved_route_is_validated_against_the_single_page_registry():
    body = _restore_body()
    assert "PAGE_IDS.includes(savedPage)" in body
    assert "savedPage !== 'zimage'" not in body
    assert "savedPage != 'zimage'" not in body


def test_all_registered_routes_can_be_restored_without_special_case_exclusions():
    source = INDEX.read_text(encoding="utf-8")
    page_ids = re.search(r"const\s+PAGE_IDS\s*=\s*\[(?P<body>[^]]+)\]", source)
    assert page_ids, "PAGE_IDS registry must remain explicit"
    registered = set(re.findall(r"['\"]([^'\"]+)['\"]", page_ids.group("body")))
    assert {"home", "zimage", "canvas", "api-settings", "comfyui-settings"}.issubset(registered)


def test_unknown_saved_route_falls_back_to_home():
    body = _restore_body()
    # Keep the fallback explicit so malformed/stale localStorage values never
    # leave the shell with no active iframe.
    assert "? savedPage : DEFAULT_PAGE_ID" in body or ": DEFAULT_PAGE_ID" in body


def test_route_boot_uses_best_effort_storage_helpers():
    source = INDEX.read_text(encoding="utf-8")
    assert "function studioStorageGet(" in source
    assert "function studioStorageSet(" in source
    body = _restore_body()
    assert "studioStorageGet(ACTIVE_PAGE_KEY)" in body
    assert "studioStorageGet(LOCAL_NAV_COLLAPSED_KEY)" in body or "studioStorageGet" in body
    # The shell's main bootstrap must not directly dereference localStorage;
    # only the guarded helper may do so after the initial theme/inline snippets.
    bootstrap = source[source.index("const CID ="):source.index("async function syncStatus")]
    assert "localStorage.getItem" not in bootstrap
    assert "localStorage.setItem" not in bootstrap


def test_route_navigation_has_keyboard_and_current_page_contract():
    source = INDEX.read_text(encoding="utf-8")
    assert "role', 'button'" in source
    assert "tabindex', '0'" in source
    assert "event.key === 'Enter'" in source
    assert "event.key === ' '" in source
    assert "setAttribute('aria-current', 'page')" in source
    assert "removeAttribute('aria-current')" in source
    assert 'aria-controls="local-nav-group"' in source
    assert 'aria-controls="settings-fold-group"' in source


def test_stats_socket_has_parse_boundary_and_reconnect_backoff():
    """Transient websocket failures must not freeze live queue/collaboration updates."""

    source = INDEX.read_text(encoding="utf-8")
    assert "function connectStudioStatsSocket()" in source
    assert "function scheduleStudioStatsReconnect()" in source
    assert "try { data = JSON.parse(event.data); } catch (_) { return; }" in source
    assert "socket.onclose = () =>" in source
    assert "scheduleStudioStatsReconnect();" in source
    assert "encodeURIComponent(CID)" in source
    assert "studioStatsStopped = true" in source
    assert "let studioStatusInFlight = false;" in source
    assert "if (studioStatusInFlight) return;" in source
    assert "finally { studioStatusInFlight = false; }" in source
