from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'static/js/smart-canvas.js').read_text(encoding='utf-8')
HTML = (ROOT / 'static/smart-canvas.html').read_text(encoding='utf-8')


def test_legacy_viewport_migration_is_persisted_and_desktop_only():
    assert 'SMART_READABLE_VIEWPORT_MIN = 0.52' in SOURCE
    assert 'SMART_LEGACY_VIEWPORT_MAX = 0.40' in SOURCE
    assert "SMART_READABLE_VIEWPORT_VERSION = 'v1'" in SOURCE
    assert "SMART_READABLE_VIEWPORT_FIELD = 'smartReadableViewportVersion'" in SOURCE
    assert "SMART_VIEWPORT_USER_ADJUSTED_FIELD = 'smartViewportUserAdjusted'" in SOURCE
    assert 'shell.clientWidth < 900' in SOURCE
    assert "matchMedia?.('(min-width: 769px)')" in SOURCE
    assert 'migrateLegacyReadableViewport(canvasId);' in SOURCE
    # The old localStorage marker was shared by all tabs and is intentionally
    # gone; migration state now travels with the server-side viewport.
    assert 'smart-viewport-readable-v1:${canvasKey}' not in SOURCE
    assert 'smart-canvas.js?v=2026.09.01.fluid13' in HTML


def test_migration_preserves_world_center_and_persists_once():
    start = SOURCE.index('function migrateLegacyReadableViewport')
    end = SOURCE.index('function nodeScale', start)
    block = SOURCE[start:end]
    assert 'const cx = (shell.clientWidth / 2 - Number(viewport.x || 0)) / oldScale;' in block
    assert 'const cy = (shell.clientHeight / 2 - Number(viewport.y || 0)) / oldScale;' in block
    assert 'viewport.x = shell.clientWidth / 2 - cx * viewport.scale;' in block
    assert 'viewport.y = shell.clientHeight / 2 - cy * viewport.scale;' in block
    assert 'migrationDone' in block
    assert 'scale >= SMART_READABLE_VIEWPORT_MIN' in block
    assert 'viewport?.[SMART_VIEWPORT_USER_ADJUSTED_FIELD] === true' in block
    assert 'viewport[SMART_READABLE_VIEWPORT_FIELD] = SMART_READABLE_VIEWPORT_VERSION;' in block
    assert 'viewport[SMART_VIEWPORT_USER_ADJUSTED_FIELD] = false;' in block
    assert 'scheduleSave();' in block


def test_user_viewport_changes_are_marked_before_persisting():
    start = SOURCE.index('function markSmartViewportUserAdjusted')
    end = SOURCE.index('function nodeScale', start)
    block = SOURCE[start:end]
    assert 'viewport[SMART_VIEWPORT_USER_ADJUSTED_FIELD] = true;' in block
    # Pan/wheel/centering/fit controls all route through the marker so a
    # deliberate zoom-out is not migrated back on a later reload.
    assert SOURCE.count('markSmartViewportUserAdjusted();') >= 6
    wheel_start = SOURCE.index("shell.addEventListener('wheel'")
    wheel_end = SOURCE.index("shell.ondragover", wheel_start)
    assert 'markSmartViewportUserAdjusted();' in SOURCE[wheel_start:wheel_end]
