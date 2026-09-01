"""Static contract checks for the LibTV-inspired desktop skin.

The skin is intentionally presentation-only.  These checks make sure every
canvas surface ships the same cache-busted stylesheet, the standalone stage
harness opts into the skin, and the selectors that protect the interaction
layers/controls are not accidentally removed during future visual refactors.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME_HREF = "/static/css/libtv-theme.css?v=2026.09.01.libtv12"
SKIN_HREF = "/static/js/libtv-skin.js?v=2026.09.01.libtv7"
AUX_HREF = "/static/css/libtv-aux.css?v=2026.09.01.libtv3"


def _text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_libtv_skin_is_loaded_once_on_all_canvas_surfaces() -> None:
    pages = (
        "index.html",
        "home.html",
        "canvas-list.html",
        "canvas.html",
        "smart-canvas.html",
        "director-desk.html",
        "stage-desk-smoke.html",
    )
    missing: list[str] = []
    duplicate: list[str] = []
    for page in pages:
        source = _text(f"static/{page}")
        count = source.count(THEME_HREF)
        if count == 0:
            missing.append(page)
        elif count != 1:
            duplicate.append(f"{page} ({count})")
    assert not missing, f"LibTV stylesheet missing from canvas surfaces: {missing}"
    assert not duplicate, f"LibTV stylesheet duplicated on canvas surfaces: {duplicate}"

    # The rail is a small presentation adapter and belongs only on the three
    # canvas/list pages.  Standalone director/stage harnesses intentionally
    # share the CSS tokens but do not need a second toolbar.
    for page in ("canvas-list.html", "canvas.html", "smart-canvas.html"):
        source = _text(f"static/{page}")
        assert source.count(SKIN_HREF) == 1, f"{page} must load the LibTV skin glue exactly once"

    canvas_list = _text("static/canvas-list.html")
    assert "/static/js/canvas-list-layout.js?v=2026.09.01.libtv1" in canvas_list
    # The standalone manager has no editor shell to provide the global brand
    # lockup; keep an explicit, data-brand-powered identity in its sidebar so
    # the LibTV visual language remains consistent across routes.
    assert '<div class="libtv-list-brand-lockup"' in canvas_list
    assert 'data-brand-short-name' in canvas_list and 'data-brand-app-name' in canvas_list


def test_standalone_surfaces_opt_into_libtv_body_class() -> None:
    for page in ("index.html", "home.html", "canvas-list.html", "canvas.html", "smart-canvas.html", "director-desk.html", "stage-desk-smoke.html"):
        source = _text(f"static/{page}")
        assert "libtv-surface" in source, f"{page} does not opt into the LibTV surface class"


def test_auxiliary_desktop_surfaces_use_the_same_dark_tokens() -> None:
    """Tool pages must not regress to the old paper-white presentation."""

    pages = (
        "asset-manager.html",
        "script-studio.html",
        "api-settings.html",
        "comfyui-settings.html",
        "angle.html",
        "klein.html",
        "online.html",
        "zimage.html",
        "enhance.html",
        "gpt-chat.html",
    )
    for page in pages:
        source = _text(f"static/{page}")
        assert source.count(THEME_HREF) == 1, f"{page} must load the shared LibTV theme once"
        assert source.count(AUX_HREF) == 1, f"{page} must load the auxiliary LibTV skin once"
        assert "libtv-surface" in source and "libtv-aux" in source, f"{page} is not opted into the auxiliary skin"

    # Every standalone utility route gets the same project-owned contact
    # launcher.  Keeping the scripts in the page (rather than relying on an
    # iframe parent) makes the configured maintainer reachable from a direct
    # bookmark as well as from the main shell.
    for page in pages:
        source = _text(f"static/{page}")
        assert source.count("/static/js/brand-config.js?v=2026.09.01.brand2") == 1, f"{page} must load brand config once"
        assert source.count("/static/js/brand-ui.js?v=2026.09.01.brand4") == 1, f"{page} must load brand UI once"

    aux = _text("static/css/libtv-aux.css")
    for marker in (
        "body.libtv-aux",
        "body.libtv-aux .asset-page",
        "body.libtv-aux .studio",
        "body.libtv-aux .page",
        "body.libtv-aux .chat-shell",
        "body.libtv-aux .studio-contact-launcher",
        "body.libtv-aux .studio-contact-modal",
        "html:has(body.libtv-aux)",
        "prefers-reduced-motion",
    ):
        assert marker in aux, f"auxiliary LibTV marker missing: {marker}"


def test_root_and_home_use_scoped_libtv_variants() -> None:
    root = _text("static/index.html")
    home = _text("static/home.html")
    assert "index-libtv" in root
    assert "home-libtv" in home
    assert 'frame-home" data-src="/static/home.html?v=2026.09.01.libtv12' in root
    assert "增强对比" in root and "标准对比" in root
    css = _text("static/css/libtv-theme.css")
    for marker in (
        "body.libtv-surface.index-libtv .app-shell",
        "body.libtv-surface.index-libtv .sidebar",
        "body.libtv-surface.index-libtv .stage",
        "body.libtv-surface.home-libtv .home-card",
        "body.libtv-surface.theme-dark .vwf-stage",
    ):
        assert marker in css, f"LibTV root/home marker missing: {marker}"


def test_stage_skin_covers_dark_chrome_and_preserves_hit_paths() -> None:
    css = _text("static/css/libtv-theme.css")
    for marker in (
        "body.libtv-surface .vwf-stage {",
        "--desk: #14171e",
        "body.libtv-surface .vwf-stage .vwf-desk-bar",
        "body.libtv-surface .vwf-stage-tabcol",
        "body.libtv-surface .vwf-stage .vwf-stage-viewport",
        "body.libtv-surface .vwf-stage .vwf-walk-hud",
        "body.libtv-surface .vwf-stage .vwf-stage-side",
        "body.libtv-surface .vwf-stage .vwf-timeline-bar",
        "body.libtv-surface .node .blank-image",
        "body.libtv-surface .node .asset-card-body",
        "body.libtv-surface .node .generator-body",
        "body.libtv-surface :where(button, a, input, select, textarea, [tabindex]):focus-visible",
    ):
        assert marker in css, f"LibTV stage skin marker missing: {marker}"

    # The presentation layer must not claim the SVG hit path as a paint layer.
    hit = css.index("body.libtv-surface #links .link-hit,")
    assert "pointer-events: stroke" in css[hit : hit + 260]
    assert "stroke: transparent" in css[hit : hit + 260]


def test_skin_glue_is_presentation_only_and_has_no_grok_or_paid_surface() -> None:
    js = _text("static/js/libtv-skin.js")
    for marker in (
        "openCreateMenu",
        "libtv-connect-mode",
        "openSmartCanvasLog",
        "openCanvasLog",
        "openSmartCanvasShortcuts",
        "event.key === 'Escape'",
    ):
        assert marker in js
    # The rail delegates to existing page functions; it must not become a
    # second data/generation implementation.
    assert "fetch(" not in js
    assert "connections" not in js
    assert "nodes" not in js
    lowered = (js + _text("static/css/libtv-theme.css")).lower()
    for forbidden in ("grok", "会员", "积分", "钱包"):
        assert forbidden not in lowered
