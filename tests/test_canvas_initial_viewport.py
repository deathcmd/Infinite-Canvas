"""Regression checks for the desktop classic-canvas opening composition.

The canvas stores node positions in world coordinates.  The LibTV desktop
skin may choose a friendlier first viewport for legacy boards, but it must not
rewrite those positions or bypass a user-owned local viewport.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANVAS_SOURCE = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
THEME_SOURCE = (ROOT / "static/css/libtv-theme.css").read_text(encoding="utf-8")


def test_desktop_focus_is_presentation_only_and_preserves_user_view() -> None:
    source = CANVAS_SOURCE
    start = source.index("function focusInitialCanvasViewport()")
    end = source.index("const OPEN_SOURCE_BLOCKED_PROVIDER_RE", start)
    block = source[start:end]

    for marker in (
        "const desktop = (board.clientWidth || window.innerWidth) >= 900",
        "const connectedIds = new Set()",
        "const inWorkingArea = item =>",
        "const maxVisibleBottom",
        "viewport.scale = scale",
        "viewport.x = boardRect.width / 2 - centerX * scale",
        "viewport.y = safeTop - topY * scale",
        "applyViewport();",
        "renderLinks();",
        "scheduleViewportSave();",
    ):
        assert marker in block, f"desktop viewport focus contract missing: {marker}"

    # Local/user-owned view state and the persisted viewport guard remain ahead
    # of the automatic first-open framing.
    assert "if(hasLocalViewport(canvas.id) || !isDefaultCanvasViewport(canvas.viewport))" in block
    assert "if(hasLocalViewport(canvas.id) || !isDefaultCanvasViewport(canvas.viewport)){\n        initialCanvasViewportPending = false;\n        return;\n    }" in block

    # This helper may read node rectangles but must never move a node itself.
    assert "item.node.x" not in block
    assert "item.node.y" not in block
    assert "node.x =" not in block
    assert "node.y =" not in block


def test_desktop_theme_keeps_chrome_above_world_and_idle_glow_quiet() -> None:
    source = THEME_SOURCE
    for marker in (
        "LibTV desktop viewport guard",
        "isolation: isolate",
        "#links {\n        z-index: 0 !important",
        ".connection-layer:not(.conn-dense-motion) .conn-flow-glow",
        ".link-motion-glow:not(.link-active):not(.link-hovered)",
    ):
        assert marker in source, f"desktop layering contract missing: {marker}"
