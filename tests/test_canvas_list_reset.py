"""Regression checks for the readable canvas-list reset viewport.

Legacy projects can contain cards spread over thousands of world pixels.  A
naive "fit all" implementation either leaves the first viewport empty or
shrinks every card below a usable size.  Keep the reset contract explicit so a
future visual refactor does not reintroduce the old ``Math.max(0.9, fit)``
floor.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _source() -> str:
    return (ROOT / "static/js/canvas-list.js").read_text(encoding="utf-8")


def test_reset_view_uses_readable_focus_fallback_for_sparse_legacy_boards() -> None:
    source = _source()
    for marker in (
        "const READABLE_RESET_SCALE = 0.78",
        "const RESET_FOCUS_CARD_LIMIT = 16",
        "function measureCardBounds(cards)",
        "function boundsFitScale(bounds, padding)",
        "function readableFocusSelection(cards, padding)",
        "const INITIAL_RESET_DELAYS = [0, 80, 220, 500, 1000]",
        "function scheduleInitialReadableReset()",
        "cards.length > RESET_FOCUS_CARD_LIMIT && fitScale < READABLE_RESET_SCALE",
        "recentLimit = Math.min(cards.length, Math.max(RESET_FOCUS_CARD_LIMIT * 3, 48))",
        "viewportUserAdjusted = true",
        "resetView({ auto: true })",
        "drag to explore the rest",
    ):
        assert marker in source, f"readable reset contract missing: {marker}"

    # The cluster fallback must inspect nearby recent cards rather than a
    # blind prefix.  This is what prevents a sparse historical board from
    # collapsing to a one-card first viewport whenever the first 16 records
    # happen to be far apart.
    assert "const focus = readableFocusSelection(cards, padding)" in source
    assert "focus.count" in source
    assert "const ordered = recent.slice().sort" in source

    # The previous implementation forced all sparse projects to 90% zoom,
    # which put most cards outside the first viewport.  Keep that regression
    # from returning while allowing the normal MAX_SCALE cap to remain.
    assert "Math.max(0.9, fitScale)" not in source
    assert "Math.max(READABLE_RESET_SCALE, fitScale)" in source


def test_canvas_list_cache_bust_matches_reset_view_revision() -> None:
    source = (ROOT / "static/canvas-list.html").read_text(encoding="utf-8")
    assert "/static/js/canvas-list.js?v=2026.09.01.layout6" in source


def test_readable_cluster_is_viewport_only_and_user_owned() -> None:
    source = _source()
    start = source.index("function readableFocusSelection(cards, padding)")
    end = source.index("function scheduleInitialReadableReset()", start)
    helper = source[start:end]
    # The fallback may read layout coordinates, but it must never rewrite the
    # persisted board_x/board_y fields while selecting a focus cluster.
    assert "board_x" not in helper
    assert "board_y" not in helper
    assert "style.left" not in helper
    assert "style.top" not in helper

    # Delayed retries are cancelled by explicit user gestures and are bounded
    # to avoid an unbounded timer loop in an iframe that never becomes visible.
    assert "if(auto && viewportUserAdjusted) return false" in source
    assert "if(initialResetTimer !== null) cancelInitialReadableReset()" in source
    assert "initialResetAttempts < INITIAL_RESET_DELAYS.length" in source
