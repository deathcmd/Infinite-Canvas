"""Static contracts for the historical smart-canvas context ribbon."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIN = (ROOT / "static/js/libtv-skin.js").read_text(encoding="utf-8")
THEME = (ROOT / "static/css/libtv-theme.css").read_text(encoding="utf-8")


def test_context_ribbon_reads_prompt_value_and_uses_safe_text_nodes():
    start = SKIN.index("Historical smart-canvas context ribbon")
    block = SKIN[start:]
    for marker in (
        "libtvContextRibbon",
        "aria-live",
        "contextSourceText",
        "textarea.prompt-node-text",
        "truncateContextText",
        "CONTEXT_SUMMARY_LIMIT = 220",
        "textContent",
        "watchContextRibbon",
        "libtv-context-source-active",
    ):
        assert marker in block, f"context ribbon marker missing: {marker}"
    # The ribbon is generated with DOM APIs; prompt text must not be injected
    # through an HTML template.
    assert "innerHTML" not in block
    assert "fetch(" not in block


def test_context_ribbon_targets_only_historical_wide_prompt_cards():
    start = SKIN.index("function isContextSource")
    end = SKIN.index("function truncateContextText", start)
    block = SKIN[start:end]
    assert "p_note" in block and "p_script" in block
    assert "width >= 900" in block
    assert "prompt-smart-node" in block


def test_context_ribbon_css_is_desktop_weakening_with_hover_restore():
    for marker in (
        ".libtv-context-ribbon",
        ".libtv-context-ribbon-summary",
        ".image-node.libtv-context-source",
        ".libtv-context-source:focus-within",
        ".libtv-context-source-active",
        "@media (min-width: 901px)",
        "opacity: .17 !important",
        "opacity: 1 !important",
        "pointer-events: none",
        "pointer-events: auto",
    ):
        assert marker in THEME, f"context ribbon CSS marker missing: {marker}"


def test_canvas_chrome_stays_above_the_desktop_world_veil():
    """A top veil may quiet legacy cards, but must not hide the title/buttons."""

    guard = THEME[THEME.index("LibTV desktop viewport guard") :]
    assert "z-index: 64 !important" in guard
    assert ".smart-title" in guard and ".smart-back" in guard
