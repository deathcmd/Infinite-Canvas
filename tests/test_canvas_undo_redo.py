"""Static contracts for document-local canvas undo/redo history.

The editors are browser scripts with a large DOM bootstrap, so importing them
in CPython is not practical.  These focused contracts protect the history
invariants that are easy to regress during UI refactors: a separate redo
branch, conventional keyboard aliases, and history isolation when a document
is loaded or replaced by a remote snapshot.
"""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
CLASSIC = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
SMART = (ROOT / "static/js/smart-canvas.js").read_text(encoding="utf-8")
SMART_I18N = (ROOT / "static/js/i18n/smart-canvas.js").read_text(encoding="utf-8")
SMART_HTML = (ROOT / "static/smart-canvas.html").read_text(encoding="utf-8")


def _body(source: str, name: str) -> str:
    """Return a function body using a small brace-balanced scanner."""

    match = re.search(rf"function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", source)
    assert match, f"missing function {name}"
    start = match.end() - 1
    depth = 0
    quote = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in "'\"`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]
    # Comments in the browser scripts occasionally contain apostrophes (for
    # example ``user's``), which are not JavaScript string delimiters.  If the
    # lightweight lexer above is confused by such prose, the next top-level
    # function is still an unambiguous boundary for this static contract.
    next_function = re.search(r"\n(?:async\s+)?function\s+\w+\s*\(", source[start + 1 :])
    if next_function:
        return source[start : start + 1 + next_function.start()]
    raise AssertionError(f"unbalanced function {name}")


def test_classic_history_has_document_local_undo_and_redo_stacks():
    assert re.search(r"let\s+undoStack\s*=\s*\[\]", CLASSIC)
    assert re.search(r"let\s+redoStack\s*=\s*\[\]", CLASSIC)
    reset = _body(CLASSIC, "resetCanvasHistory")
    assert "undoStack.length = 0" in reset
    assert "redoStack.length = 0" in reset

    push = _body(CLASSIC, "pushUndo")
    assert "redoStack.length = 0" in push, "new edits must invalidate the redo branch"

    undo = _body(CLASSIC, "performUndo")
    assert "redoStack.push(canvasHistorySnapshot())" in undo
    assert "restoreCanvasHistorySnapshot(undoStack.pop())" in undo

    redo = _body(CLASSIC, "performRedo")
    assert "undoStack.push(canvasHistorySnapshot())" in redo
    assert "restoreCanvasHistorySnapshot(redoStack.pop())" in redo


def test_classic_history_resets_on_document_boundaries():
    for name in ("createCanvas", "openCanvas", "applyRemoteCanvasData", "returnToCanvasManager", "deleteCanvas"):
        body = _body(CLASSIC, name)
        assert "resetCanvasHistory()" in body, f"{name} must isolate history"


def test_classic_keyboard_redo_aliases_are_guarded():
    assert "function canvasHistoryShortcutBlocked(target)" in CLASSIC
    assert "(key === 'z' || key === 'y')" in CLASSIC
    assert "if(key === 'y' || e.shiftKey) performRedo();" in CLASSIC
    assert "!canvasHistoryShortcutBlocked(e.target)" in CLASSIC
    assert "if(e.repeat) return;" in _body(CLASSIC, "canvasHistoryShortcutBlocked") or "if(e.repeat) return;" in CLASSIC


def test_smart_history_has_branching_redo_and_safe_restore():
    assert re.search(r"const\s+undoStack\s*=\s*\[\]", SMART)
    assert re.search(r"const\s+redoStack\s*=\s*\[\]", SMART)
    reset = _body(SMART, "resetSmartCanvasHistory")
    assert "undoStack.length = 0" in reset
    assert "redoStack.length = 0" in reset
    assert "pendingUndoSnapshot = null" in reset

    assert "redoStack.length = 0" in _body(SMART, "pushUndo")
    assert "redoStack.length = 0" in _body(SMART, "commitPendingUndo")
    undo = _body(SMART, "performUndo")
    assert "redoStack.push(snapshotForUndo())" in undo
    assert "restoreHistorySnapshot(snap)" in undo
    redo = _body(SMART, "performRedo")
    assert "undoStack.push(snapshotForUndo())" in redo
    assert "restoreHistorySnapshot(snap)" in redo


def test_smart_history_resets_on_load_merge_and_exit():
    for name in ("loadCanvas", "applyMergedServerCanvas", "backToCanvasList"):
        body = _body(SMART, name)
        assert "resetSmartCanvasHistory()" in body, f"{name} must isolate history"


def test_smart_keyboard_redo_aliases_and_messages_exist():
    assert "(key === 'z' || key === 'y')" in SMART
    assert "if(key === 'y' || e.shiftKey) performRedo();" in SMART
    assert "function smartHistoryShortcutBlocked(target)" in SMART
    assert "!smartHistoryShortcutBlocked(e.target)" in SMART
    assert '"smart.toastNoRedo"' in SMART_I18N
    assert '"smart.toastRedone"' in SMART_I18N
    assert '<kbd>Ctrl</kbd><kbd>Y</kbd>' in SMART_HTML
    assert 'smart.shortcutRedoAlias' in SMART_HTML
