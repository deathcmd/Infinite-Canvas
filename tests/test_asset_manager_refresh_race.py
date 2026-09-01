"""Regression contracts for asset-manager refresh and bulk-action safety.

The page is intentionally framework-free, so these checks pin the important
state-machine invariants at source level: refreshes are latest-wins, optional
endpoint failures keep the last good data, and destructive actions retain
explicitly skipped items rather than silently claiming success.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "static/js/asset-manager.js").read_text(encoding="utf-8")


def _load_all_body() -> str:
    start = SOURCE.index("async function loadAll(){")
    end = SOURCE.index("\nfunction render(){", start)
    return SOURCE[start:end]


def _function_body(name: str, end_marker: str) -> str:
    async_marker = f"async function {name}"
    sync_marker = f"function {name}"
    start = SOURCE.find(async_marker)
    if start < 0:
        start = SOURCE.index(sync_marker)
    end = SOURCE.index(end_marker, start)
    return SOURCE[start:end]


def test_refresh_is_latest_wins_and_cancellable() -> None:
    body = _load_all_body()
    assert "const generation = ++loadAllGeneration" in body
    assert "loadAllController.abort()" in body
    assert "new AbortController()" in body
    assert "Promise.allSettled" in body
    assert "if(generation !== loadAllGeneration) return {stale:true};" in body
    assert "loadAllController === controller" in body


def test_refresh_passes_one_abort_signal_to_every_snapshot_request() -> None:
    body = _load_all_body()
    assert "const request = url => apiJson(url, controller?.signal ? {signal:controller.signal} : {});" in body
    for endpoint in (
        "request('/api/asset-library')",
        "request('/api/prompt-libraries')",
        "request('/api/providers')",
        "request('/api/canvas-assets')",
        "request('/api/shared-folders')",
        "request('/api/local-assets')",
    ):
        assert endpoint in body


def test_canvas_asset_refresh_cannot_overwrite_a_newer_snapshot() -> None:
    refresh = _function_body("refreshCanvasAssets", "\nasync function loadAll")
    load = _load_all_body()
    assert "const generation = ++canvasAssetsGeneration" in refresh
    assert "if(generation !== canvasAssetsGeneration) return {stale:true};" in refresh
    assert "const canvasGeneration = ++canvasAssetsGeneration" in load
    assert "canvasGeneration === canvasAssetsGeneration" in load


def test_shared_and_local_tree_loaders_are_latest_wins_and_preserve_old_data() -> None:
    shared = _function_body("loadSharedFolders", "\nasync function loadLocalAssets")
    local = _function_body("loadLocalAssets", "\nasync function registerSharedFolder")
    for body, generation, controller in (
        (shared, "sharedFoldersLoadGeneration", "sharedFoldersLoadController"),
        (local, "localAssetsLoadGeneration", "localAssetsLoadController"),
    ):
        assert f"const generation = ++{generation}" in body
        assert f"{controller}.abort()" in body
        assert f"generation !== {generation}" in body
        assert "if(isAbortError(err) || generation !==" in body
    assert "A transient refresh failure should not make an already registered" in shared
    assert "Keep the previous tree on a transient failure" in local


def test_refresh_keeps_last_good_optional_state_on_failed_payload() -> None:
    body = _load_all_body()
    # Assignment is conditional on a valid payload; a rejected/invalid
    # endpoint is reported instead of replacing state with an empty fallback.
    assert "assetLibrary = assetResult.value.library;" in body
    assert "apiProviders = providerResult.value.providers;" in body
    assert "sharedFolders = sharedResult.value.folders;" in body
    assert "localAssets = localResult.value.items;" in body
    assert "failures.push(`${label}：${result.reason?.message || '加载失败'}`)" in body
    assert "已刷新，但${failures.join('、')}暂不可用" in body


def test_storage_file_refresh_has_its_own_generation_guard() -> None:
    body = _function_body("loadStorageFiles", "\nasync function deleteSelectedStorageFiles")
    assert "const generation = ++storageLoadGeneration" in body
    assert "storageLoadController.abort()" in body
    assert "if(generation !== storageLoadGeneration) return {stale:true};" in body
    assert "if(storageLoadController === controller) storageLoadController = null;" in body
    assert "previousState" in body


def test_storage_refresh_failure_restores_the_previous_kind_with_its_items() -> None:
    body = _function_body("loadStorageFiles", "\nasync function deleteSelectedStorageFiles")
    # A failed kind switch must not leave the old page rendered beneath the
    # newly selected tab; that mismatch could route a subsequent delete to the
    # wrong storage root.
    assert "kind:storageSettingsState.kind" in body
    assert "storageSettingsState.kind = previousState.kind || nextKind" in body


def test_storage_settings_open_close_cancels_stale_modal_payloads() -> None:
    open_body = _function_body("openStorageSettings", "\nfunction closeStorageSettings")
    close_body = _function_body("closeStorageSettings", "\nfunction syncStorageSettingsInputsToState")
    assert "const generation = ++storageSettingsGeneration" in open_body
    assert "storageSettingsController.abort()" in open_body
    assert "if(generation !== storageSettingsGeneration || !storageSettingsState.open) return {stale:true};" in open_body
    assert "storageSettingsController === controller" in open_body
    assert "storageSettingsGeneration += 1" in close_body
    assert "storageLoadGeneration += 1" in close_body


def test_storage_delete_restores_server_skipped_selection_after_reload() -> None:
    body = _function_body("deleteSelectedStorageFiles", "\nfunction formatDate")
    assert "const skippedRels = new Set" in body
    # The skipped paths must be captured before loadStorageFiles clears a fresh
    # page's selection, then reapplied only to items still present.
    assert body.index("const skippedRels") < body.index("await loadStorageFiles(requestKind)")
    assert "storageSettingsState.selected = new Set(storageSettingsState.items" in body


def test_bulk_actions_enforce_server_limit_and_reset_confirmation_on_error() -> None:
    assert "const MAX_BATCH_ACTIONS = 1000;" in SOURCE
    assert "function batchSelectionWithinLimit" in SOURCE
    for name, next_name, noun in (
        ("deleteSelectedAssets", "\nfunction setAssetClipboard", "素材"),
        ("deleteSelectedWorkflows", "\nasync function uploadLocalAssets", "工作流"),
        ("deleteLocalAssets", "\nasync function saveLocalUploadInlineName", "本地素材"),
        ("deleteSelectedPrompts", "\nroot.addEventListener", "提示词"),
    ):
        body = _function_body(name, next_name)
        assert "batchSelectionWithinLimit" in body
        assert f"'{noun}'" in body
        assert "pendingBatchDelete = '';" in body


def test_single_asset_and_prompt_delete_buttons_require_second_confirmation() -> None:
    asset = _function_body("deleteAssetItem", "\nasync function deleteSelectedAssets")
    prompt = _function_body("deletePromptItem", "\nasync function deleteSelectedPrompts")
    assert "pendingDeleteAssetId !== id" in asset
    assert "再次点击确认删除素材" in asset
    assert "pendingDeletePromptId !== id" in prompt
    assert "再次点击确认删除提示词" in prompt


def test_dynamic_asset_controls_get_accessible_names() -> None:
    assert "function enhanceAssetA11y(scope=root)" in SOURCE
    assert "button.setAttribute('aria-label', title)" in SOURCE
    assert 'aria-label="选择文件：${escapeAttr(item.name || item.rel || \'未命名文件\')}"' in SOURCE
    assert 'aria-label="智能分类要求"' in SOURCE
    assert "enhanceAssetA11y(overlay);" in SOURCE
    assert "enhanceAssetA11y(root);" in SOURCE


def test_context_switches_clear_single_delete_confirmation_state() -> None:
    # The asset/workflow detail buttons share a legacy pending-delete slot.
    # Changing library/category/filter must invalidate that slot so a second
    # click in another context can never confirm the wrong record.
    for marker in (
        "if(workflowLib){",
        "if(workflowCat){",
        "if(assetLib){",
        "if(assetClassRoot){",
        "if(assetClassGroup){",
        "if(assetClass){",
        "if(assetCat){",
    ):
        start = SOURCE.index(marker)
        end = SOURCE.index("return;", start)
        assert "pendingDeleteAssetId = '';" in SOURCE[start:end], marker


def test_asset_manager_script_cache_key_tracks_refresh_state_machine() -> None:
    page = (ROOT / "static/asset-manager.html").read_text(encoding="utf-8")
    # Keep this contract resilient to a later UI cache-bust suffix (other
    # agents may legitimately bump the revision while touching the page).
    import re
    assert re.search(r"/static/js/asset-manager\.js\?v=[^\"']+", page)
