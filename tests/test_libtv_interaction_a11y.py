"""Regression contracts for the LibTV desktop interaction adapter.

These checks intentionally stay close to the small presentation layer.  They
guard two easy-to-miss regressions: empty-state quick actions must remain real
buttons (not ``role=listitem`` generics), and utility sheets must contain
keyboard focus/shortcut events instead of leaking actions to the canvas below.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_empty_state_actions_keep_native_button_semantics() -> None:
    source = _text("static/js/libtv-skin.js")
    assert 'class="libtv-empty-actions" role="group"' in source
    assert 'role="listitem"' not in source
    # Both smart and classic variants use native button elements with a
    # delegated click handler, so Enter/Space activation remains available.
    assert source.count('data-libtv-empty-action="prompt"') == 2
    assert "emptyState.addEventListener('click'" in source
    assert "emptyState.addEventListener('dblclick', stop)" in source


def test_utility_sheets_restore_focus_and_contain_keyboard_shortcuts() -> None:
    source = _text("static/js/smart-canvas.js")
    for marker in (
        "let smartUtilityModalPreviousFocus = null;",
        "function smartUtilityFocusable(modal)",
        "function activeSmartUtilityModal()",
        "function setSmartUtilityModal(modal, open)",
        "modal.setAttribute('aria-hidden', 'false')",
        "modal.setAttribute('aria-hidden', 'true')",
        "panel.setAttribute('role', 'dialog')",
        "panel.setAttribute('aria-modal', 'true')",
        "event.key === 'Tab'",
        "event.stopPropagation();",
        "setupSmartUtilityModalA11y();",
    ):
        assert marker in source, f"utility modal accessibility marker missing: {marker}"


def test_canvas_list_bulk_keyboard_commands_stay_in_management_context() -> None:
    source = _text("static/js/canvas-list.js")
    for marker in (
        "function canvasListEditableTarget(target)",
        "if((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'a')",
        "if((e.key === 'Delete' || e.key === 'Backspace') && !bulkActionBusy)",
        "openBulkConfirm(inTrash ? 'purge' : 'trash'",
        "emptyCreateCanvasBtn?.addEventListener('dblclick'",
    ):
        assert marker in source, f"canvas-list keyboard marker missing: {marker}"
    # Inputs/contenteditable fields must return before manager shortcuts.
    handler = source[source.index("document.addEventListener('keydown'"):]
    assert "if(e.key !== 'Escape' && editable) return;" in handler
