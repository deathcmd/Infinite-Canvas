"""Static contract checks for the desktop motion layer.

The visual layer is deliberately CSS/DOM based, so these checks make sure the
stylesheet is shipped on every product surface and that the SVG connection
renderer keeps its hit-testing contract while adding animated paint layers.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MOTION_HREF = "/static/css/motion-effects.css?v=2026.08.31.desktop-motion14"


DESKTOP_PAGES = (
    "index.html",
    "home.html",
    "canvas-list.html",
    "canvas.html",
    "smart-canvas.html",
    "director-desk.html",
    "stage-desk-smoke.html",
    "script-studio.html",
    "api-settings.html",
    "asset-manager.html",
    "gpt-chat.html",
    "enhance.html",
    "angle.html",
    "online.html",
    "klein.html",
    "zimage.html",
    "comfyui-settings.html",
)


def _text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_motion_layer_is_loaded_once_on_each_desktop_surface() -> None:
    missing: list[str] = []
    duplicate: list[str] = []
    for page in DESKTOP_PAGES:
        count = _text(f"static/{page}").count(MOTION_HREF)
        if count == 0:
            missing.append(page)
        elif count != 1:
            duplicate.append(f"{page} ({count})")
    assert not missing, f"motion layer missing from desktop pages: {missing}"
    assert not duplicate, f"motion layer duplicated on desktop pages: {duplicate}"


def test_motion_css_preserves_reduced_motion_and_smart_connection_states() -> None:
    css = _text("static/css/motion-effects.css")
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert "@keyframes clMotionLinePulse" in css
    assert ".connection-layer .conn-line" in css
    assert ".conn-line.conn-selected" in css
    assert ".connection-layer .conn-end" in css
    # Existing pending/cascade dash animations remain the renderer's owner;
    # the shared layer intentionally excludes them from the calm pulse.
    assert ":not(.conn-pending):not(.conn-cascade-active)" in css
    assert ".connection-layer.conn-reduce-motion .conn-line" in css
    # Top-level shells must remain opacity-only; a persisted transform would
    # create a containing block and break fixed dialogs/HUD positioning.
    assert "body > .app-shell,\n    body > .workspace {\n        animation: clMotionFadeOnly" in css
    assert ":not(.link-delete):not(.canvas-video-play)" in css


def test_classic_connection_layers_keep_hit_path_last_and_pointer_safe() -> None:
    source = _text("static/js/canvas.js")
    canvas_css = _text("static/css/canvas.css")
    for marker in (
        "ensureCanvasLinkMotionStyles",
        "link-motion-glow",
        "link-motion-flow",
        "link-motion-spark",
        "canvasLinkMotionSpark",
        "link-motion-temp",
        "link-motion-knife",
        "const identity = connection?.id != null ? String(connection.id) : `index:${index}`",
        "linkHitEl(a.x, a.y, b.x, b.y, c.id)",
        "pointer-events', 'none",
    ):
        assert marker in source, f"classic connection motion contract missing: {marker}"
    assert ".link-hit" in canvas_css and "pointer-events:stroke" in canvas_css

    # The hit path must be appended after the visual layers.  This is a
    # lightweight ordering assertion rather than a snapshot of the renderer.
    visual = source.index("link-motion-flow", source.index("function renderLinks"))
    hit = source.index("linkHitEl(a.x, a.y, b.x, b.y, c.id)", visual)
    assert visual < hit


def test_smart_connection_layers_emit_fluid_highlight_before_hit_path() -> None:
    source = _text("static/js/smart-canvas.js")
    css = _text("static/css/motion-effects.css")
    for marker in (
        "function smartConnectionMotionStyle",
        "conn-flow-glow",
        "conn-flow",
        "conn-flow-spark",
        "animateMotion",
        "gradientTransform",
        'pathLength=\"100\"',
        'pointer-events=\"none\"',
        "useFlow = !isPendingLine",
        "const motionKey = `${item.from}|${item.toId}|${kind}|${item.targets.join(',')}`",
        "const perfNow = typeof performance !== 'undefined'",
        "--conn-flow-opacity:${opacity}",
        "SMART_CONNECTION_DENSE_MOTION_THRESHOLD",
        "SMART_CONNECTION_DENSE_AGGREGATE_MAX",
        "conn-flow-dense",
        "conn-dense-motion",
    ):
        assert marker in source, f"smart connection motion contract missing: {marker}"
    for marker in (
        ".connection-layer .conn-flow-glow",
        ".connection-layer .conn-flow",
        ".connection-layer .conn-flow-spark",
        "@keyframes clMotionConnFlow",
        "stroke-dasharray: none !important",
        "opacity: var(--conn-flow-opacity, .9)",
        ".connection-layer.conn-dense-motion .conn-flow-glow",
    ):
        assert marker in css, f"smart fluid CSS contract missing: {marker}"

    # The template is assembled as base + ${flow} + hit.  The flow snippets
    # themselves appear earlier in the source because they are defined before
    # that return expression, so assert the actual concatenation contract.
    render = source.index("function renderConnections")
    assert source.index('return `<path class="${cls} conn-line"', render) < source.index('${flow}${spark}<path class="conn-hit"', render)
