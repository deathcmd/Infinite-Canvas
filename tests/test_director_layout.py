"""Static regression contracts for the desktop director-desk layout.

The canvas editor renders a 3D director desk inside an ordinary canvas node.
This contract intentionally checks the source-level dimensions and containment
rules that prevent a legacy stage node (which predates explicit ``w``/``h``
fields) from falling back to an auto-height, portrait card.  Keeping the test
static makes it cheap to run in CI and avoids coupling it to a particular
canvas fixture or user database.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANVAS_JS = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
CANVAS_CSS = (ROOT / "static/css/canvas.css").read_text(encoding="utf-8")


def _function_block(source: str, start_marker: str, end_marker: str) -> str:
    """Return a bounded source block with a useful failure if it moves."""

    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[start:end]


def test_director_defaults_are_wide_and_consistent() -> None:
    """The two desk variants must have finite horizontal authoring surfaces."""

    assert "const CANVAS_DIRECTOR_STAGE_SIZE = Object.freeze({w:1280, h:720});" in CANVAS_JS
    assert "const CANVAS_DIRECTOR_STAGE_MIN_SIZE = Object.freeze({w:960, h:520});" in CANVAS_JS
    assert "const CANVAS_LTX_DIRECTOR_SIZE = Object.freeze({w:1280, h:760});" in CANVAS_JS

    default_size = _function_block(CANVAS_JS, "function defaultNodeSize(type, node=null){", "function loopCount(node){")
    # Stage-host is deliberately node-aware: a normal video card keeps its
    # legacy 720px/auto-height default while the embedded desk gets 1280x720.
    assert "if(type === 'video') return node?.stageHost ? CANVAS_DIRECTOR_STAGE_SIZE : {w:720, h:0};" in default_size
    assert "if(type === 'ltxDirector') return CANVAS_LTX_DIRECTOR_SIZE;" in default_size


def test_legacy_and_new_stage_nodes_use_the_same_size_contract() -> None:
    """New nodes persist dimensions and old nodes receive the render fallback."""

    add_video = _function_block(CANVAS_JS, "function addVideoNode(point, opts={}){", "// Stage controls can open a second page")
    assert "...(opts.stageHost ? {" in add_video
    assert "stageHost:true" in add_video
    assert "w:Number(opts.w) > 0 ? Number(opts.w) : CANVAS_DIRECTOR_STAGE_SIZE.w" in add_video
    assert "h:Number(opts.h) > 0 ? Number(opts.h) : CANVAS_DIRECTOR_STAGE_SIZE.h" in add_video

    add_ltx = _function_block(CANVAS_JS, "function addLTXDirectorNode(point){", "async function getImageDimensions(url){")
    assert "w:CANVAS_LTX_DIRECTOR_SIZE.w" in add_ltx
    assert "h:CANVAS_LTX_DIRECTOR_SIZE.h" in add_ltx

    render = _function_block(CANVAS_JS, "function renderNode(node){", "function bindOutputWrap(wrap, node){")
    assert "const size = defaultNodeSize(node.type, node);" in render
    assert "${node.stageHost ? 'stage-host-node' : ''}" in render


def test_stage_host_is_a_bounded_horizontal_flex_chain() -> None:
    """Every stage wrapper must be able to shrink instead of growing the canvas."""

    css = CANVAS_CSS
    stage_css = _function_block(css, ".node.sized.stage-host-node {", ".video-float-tools {")
    for marker in (
        "min-width:960px",
        "min-height:520px",
        ".node.sized.stage-host-node > .node-body",
        ".node.sized.stage-host-node .stage-host-body",
        ".node.sized.stage-host-node .stage-host-workflow",
        ".node.sized.stage-host-node .stage-host-workflow > .video-workflow-panel",
        ".node.sized.stage-host-node .stage-host-workflow .vwf-stage",
        "display:flex",
        "flex:1 1 auto",
        "min-width:0",
        "min-height:0",
        "overflow:hidden",
        "width:100%",
        "height:100%",
    ):
        assert marker in stage_css, f"bounded director-stage contract missing: {marker}"

    # The generic stage itself must not reintroduce the old intrinsic 560px
    # row when embedded in an LTX or stage-host node.
    assert ".ltx-stage-host .vwf-stage { min-height:0; }" in css
    assert ".stage-host-body { display:flex; flex-direction:column; gap:8px; min-width:0; min-height:0;" in css


def test_stage_resize_floor_matches_the_desktop_css_floor() -> None:
    """A resize cannot persist dimensions that CSS would silently ignore."""

    resize = _function_block(CANVAS_JS, "function onNodeResize(e){", "function startLink(e, originId, originKind){")
    assert "const minW = resizeNode.node?.stageHost" in resize
    assert "CANVAS_DIRECTOR_STAGE_MIN_SIZE.w" in resize
    assert "const minH = resizeNode.node?.stageHost" in resize
    assert "CANVAS_DIRECTOR_STAGE_MIN_SIZE.h" in resize
    assert "const nextW = Math.max(minW," in resize
    assert "const nextH = Math.max(minH," in resize


def test_mobile_override_can_shrink_the_desktop_min_width() -> None:
    """Desktop minimums are explicitly relaxed below the desktop breakpoint."""

    mobile = _function_block(CANVAS_CSS, "@media (max-width:760px) {\n    .node.stage-host-node", "\n}\n\n/*")
    assert ".node.stage-host-node" in mobile
    assert "width:calc(100vw - 28px) !important" in mobile
    assert ".node.sized.stage-host-node" in mobile
    assert "min-width:0" in mobile
    assert "max-width:calc(100vw - 28px)" in mobile


def test_director_pages_bust_canvas_layout_assets() -> None:
    """The layout fix must reach tabs holding an older cached canvas shell."""

    for page in (
        ROOT / "static/canvas.html",
        ROOT / "static/director-desk.html",
        ROOT / "static/stage-desk-smoke.html",
    ):
        html = page.read_text(encoding="utf-8")
        assert "canvas.css?v=2026.09.01.canvas3" in html, page

    assert "canvas.js?v=2026.09.01.fluid9" in (ROOT / "static/canvas.html").read_text(encoding="utf-8")


def test_stage_smoke_probe_follows_promoted_desktop_mount() -> None:
    """The standalone desk smoke check must inspect the body-promoted stage.

    ``mountStage(..., _vwfDesk=true)`` deliberately moves the stage out of
    ``#host`` and appends it directly to ``body``.  A host-only probe produced
    a false ``READY no-vp no-walk`` title while the UI was healthy, masking
    real regressions in the smoke fixture.
    """

    smoke = (ROOT / "static/stage-desk-smoke.html").read_text(encoding="utf-8")
    assert "document.querySelector('.vwf-stage') || host" in smoke
    assert "root.querySelector('.vwf-stage-viewport')" in smoke
    assert "root.querySelector('.vwf-walk-hud')" in smoke
