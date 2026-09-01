"""Regression coverage for preserving asset-manager context on refresh."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "static" / "js" / "asset-manager.js").read_text(encoding="utf-8")


def _load_all_body() -> str:
    start = SOURCE.index("async function loadAll(){")
    end = SOURCE.index("\nfunction render(){", start)
    return SOURCE[start:end]


def test_refresh_keeps_existing_library_context_when_library_still_exists():
    body = _load_all_body()
    assert "if(!libs.some(lib => lib.id === activeAssetLibraryId)) activeAssetLibraryId = fallbackLibraryId;" in body
    assert "if(!libs.some(lib => lib.id === activeWorkflowLibraryId)) activeWorkflowLibraryId = fallbackLibraryId;" in body
    # The old implementation unconditionally returned to the default library.
    assert "activeAssetLibraryId = (libs.find(lib => lib.id === 'default') || libs[0])?.id || '';" not in body
    assert "activeWorkflowLibraryId = (libs.find(lib => lib.id === 'default') || libs[0])?.id || '';" not in body


def test_refresh_does_not_clear_bulk_selection_state_before_normalization():
    body = _load_all_body()
    for statement in (
        "selectedAssetIds.clear();",
        "selectedWorkflowIds.clear();",
        "selectedPromptIds.clear();",
        "selectedCanvasAssetIds.clear();",
    ):
        assert statement not in body
    # Render-time normalization remains the source of truth for stale IDs.
    assert "normalizeAssetState();" in SOURCE
    assert "normalizeWorkflowState();" in SOURCE
    assert "normalizePromptState();" in SOURCE
    assert "normalizeCanvasAssetState();" in SOURCE
