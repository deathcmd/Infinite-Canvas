"""Regression contracts for concurrent canvas-list refreshes."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _source() -> str:
    return (ROOT / "static/js/canvas-list.js").read_text(encoding="utf-8")


def test_canvas_list_refresh_has_generation_guard_and_abort_controller() -> None:
    source = _source()
    assert "let loadAllGeneration = 0" in source
    assert "let loadAllController = null" in source
    assert "const generation = ++loadAllGeneration" in source
    assert "loadAllController.abort()" in source
    assert "if(generation !== loadAllGeneration) return" in source
    assert "e?.name === 'AbortError'" in source


def test_canvas_list_refresh_sends_abort_signal_to_both_requests() -> None:
    source = _source()
    assert "fetch('/api/projects', requestOptions)" in source
    assert "fetch('/api/canvases', requestOptions)" in source
    assert "if(generation === loadAllGeneration) loadAllController = null" in source


def test_canvas_list_refresh_preserves_last_good_snapshot_on_partial_failure() -> None:
    """A temporary 5xx must not make a populated board look empty."""
    source = _source()
    for marker in (
        "const readJson = async response =>",
        "if(!response?.ok) return null",
        "const refreshFailures = []",
        "if(pData && Array.isArray(pData.projects))",
        "if(cData && Array.isArray(cData.canvases))",
        "已刷新，但${refreshFailures.join('、')}",
    ):
        assert marker in source, f"partial refresh preservation marker missing: {marker}"
