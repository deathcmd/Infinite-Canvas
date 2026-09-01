"""Regression checks for keyboard navigation on the desktop canvas board.

Canvas cards are draggable ``div`` elements, so a mouse-only click handler is
not enough: keyboard users must be able to reach a card with Tab and open it
with Enter/Space without activating nested selection/menu controls.  Keep this
contract close to the renderer so a future card-template refactor cannot
silently remove the interaction.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _source() -> str:
    return (ROOT / "static/js/canvas-list.js").read_text(encoding="utf-8")


def test_canvas_cards_expose_keyboard_open_contract() -> None:
    source = _source()
    assert "card.tabIndex = 0" in source
    assert "aria-label" in source
    assert re.search(r"card\.addEventListener\(['\"]keydown['\"]", source)
    assert "e.key === 'Enter'" in source
    assert "e.key === ' '" in source or "e.code === 'Space'" in source
    # Activation must stay on the card itself; Tab should still reach the
    # checkbox and menu button independently.
    assert "e.target !== card" in source
    assert "openCanvas(c)" in source


def test_card_keyboard_handler_prevents_page_scroll() -> None:
    source = _source()
    handler_start = source.index("card.addEventListener('keydown'")
    handler_end = source.index("});", handler_start) + 3
    handler = source[handler_start:handler_end]
    assert "e.preventDefault()" in handler
    assert "e.stopPropagation()" in handler
