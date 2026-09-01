from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SMART = (ROOT / "static/js/smart-canvas.js").read_text(encoding="utf-8")
SKIN = (ROOT / "static/js/libtv-skin.js").read_text(encoding="utf-8")


def _block(source, start_marker, end_marker):
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[start:end]


def test_fit_ignores_mirrored_context_and_contains_large_desktop_graphs():
    target = _block(SMART, "function smartFitTargetNodes", "function connectedSmartClusterIds")
    fit = _block(SMART, "function fitAllNodesViewport", "function enterZoomPreview")
    assert "isSmartFitContextNode" in target
    assert "const primary = nodes.filter" in target
    assert "return primary.length ? primary : nodes" in target
    assert "const bounds = smartFitBounds(rects)" in fit
    assert "const desktopReadable = isSmartDesktopViewport()" in fit
    # Fit must be allowed to drop below the normal readable migration floor;
    # otherwise wide/long graphs are clipped despite the "fit all" command.
    assert "const extremeFitFloor = desktopReadable ? 0.08 : 0.06" in fit
    assert "const nextScale = Math.max(extremeFitFloor, rawScale)" in fit
    assert "const minScale = desktopReadable ? SMART_READABLE_VIEWPORT_MIN : 0.06" not in fit


def test_fit_bounds_reject_invalid_rects_before_math_min_max():
    bounds = _block(SMART, "function smartFitBounds", "function smartFitTargetNodes")
    assert "Array.isArray(rects)" in bounds
    assert "Number.isFinite(Number(value))" in bounds
    assert "Number(rect.width) > 0" in bounds
    assert "if(!valid.length) return null" in bounds


def test_context_focus_bridge_centers_world_and_focuses_editor():
    focus = _block(SMART, "function focusSmartContextNode", "function enterZoomPreview")
    for marker in (
        "nodes.find(item => String(item?.id || '') === wanted)",
        "const rect = nodeRect(node)",
        "viewport.x = shell.clientWidth / 2 - cx * viewport.scale",
        "viewport.y = shell.clientHeight / 2 - cy * viewport.scale",
        "selectedId = node.id",
        "textarea.focus({preventScroll:true})",
        "window.addEventListener('libtv-focus-context'",
    ):
        assert marker in focus or marker in SMART, marker
    assert "window.focusSmartContextNode = focusSmartContextNode;" in SMART


def test_skin_uses_focus_bridge_before_plain_textarea_focus():
    start = SKIN.index("const contextId = contextRibbonActiveId;")
    block = SKIN[start:SKIN.index("renderContextRibbon(contextSourceElements(), true);", start)]
    assert "pageFunction('focusSmartContextNode')" in block
    assert "libtv-focus-context" in block
    assert "detail: {id: contextId, contextTarget: contextId}" in block
    assert block.index("focusBridge") < block.index("textarea?.focus")
