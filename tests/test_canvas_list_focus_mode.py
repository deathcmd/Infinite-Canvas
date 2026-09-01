"""Regression checks for the LibTV first-frame focus treatment.

The project board keeps legacy card coordinates intact, but visually quiets
cards outside the compact cluster selected by ``resetView``.  These checks
guard the presentation-only contract and the gesture escape hatch.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_focus_mode_is_view_only_and_keeps_cards_reachable() -> None:
    source = _text("static/js/canvas-list.js")
    css = _text("static/css/canvas-list.css")

    for marker in (
        "function clearReadableFocusMode()",
        "function applyReadableFocusMode(focusCards)",
        "const READABLE_FOCUS_MIN_WIDTH = 640",
        "board.classList.toggle('libtv-focus-mode', focus.size > 0)",
        "applyReadableFocusMode(focusedCards)",
        "clearReadableFocusMode();",
    ):
        assert marker in source, f"focus-mode marker missing: {marker}"

    # The reset path only toggles classes; it must not rewrite stored board
    # coordinates or remove cards from the DOM.
    reset_start = source.index("function resetView(options)")
    reset_end = source.index("/* ===== Board pan & zoom ===== */", reset_start)
    reset_block = source[reset_start:reset_end]
    assert "style.left" not in reset_block
    assert "style.top" not in reset_block
    assert "innerHTML" not in reset_block

    for marker in (
        "body.libtv-surface .ws-board.libtv-focus-mode .ws-card:not(.libtv-focus-card)",
        "opacity: .14 !important",
        "body.libtv-surface .ws-board.libtv-focus-mode .ws-card:not(.libtv-focus-card):hover",
        "body.libtv-surface .ws-board.libtv-focus-mode .ws-card.libtv-focus-card",
    ):
        assert marker in css, f"focus-mode style marker missing: {marker}"

    # Do not disable pointer/keyboard interaction for context cards.  The
    # stylesheet intentionally contains no pointer-events override in this
    # focus block; a hover/focus reveals a dimmed card immediately.
    focus_start = css.index("body.libtv-surface .ws-board.libtv-focus-mode")
    focus_block = css[focus_start:]
    assert "pointer-events: none" not in focus_block


def test_canvas_list_cache_bust_includes_focus_styles() -> None:
    source = _text("static/canvas-list.html")
    assert "/static/css/canvas-list.css?v=2026.09.01.focus1" in source
