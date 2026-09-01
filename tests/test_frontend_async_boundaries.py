"""Static regression contracts for desktop editor async event boundaries.

The canvas pages are intentionally plain browser scripts, so these checks keep
the high-risk event wiring reviewable without requiring a full browser fixture.
In particular, a rejected upload/import promise must be observed by the drop
handler instead of surfacing as an ``unhandledrejection`` event, and an update
from another tab must not clear a local dirty save before the optimistic
version check can retry it.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
SMART = (ROOT / "static/js/smart-canvas.js").read_text(encoding="utf-8")
STUDIO = (ROOT / "static/js/script-studio.js").read_text(encoding="utf-8")
VWF_PANEL = (ROOT / "static/js/video-workflow-panel.js").read_text(encoding="utf-8")
ASSET_MANAGER_HTML = (ROOT / "static/asset-manager.html").read_text(encoding="utf-8")
SMART_HTML = (ROOT / "static/smart-canvas.html").read_text(encoding="utf-8")


def _block(source: str, start_marker: str, end_marker: str) -> str:
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[start:end]


def test_classic_drop_payload_resolution_stays_inside_error_boundaries() -> None:
    node_drop = _block(
        CANVAS,
        "async function handleImageNodeDropEvent",
        "async function fillImageNode",
    )
    assert "try {" in node_drop
    assert node_drop.index("try {") < node_drop.index("await resolveImageDropPayload")
    assert "showErrorModal" in node_drop

    board_drop = _block(CANVAS, "board.addEventListener('drop'", "window.addEventListener('dragend'")
    assert "try {" in board_drop
    assert board_drop.index("try {") < board_drop.index("await resolveImageDropPayload")
    assert "showErrorModal" in board_drop


def test_classic_external_update_preserves_dirty_state_for_optimistic_retry() -> None:
    save = _block(CANVAS, "async function saveCanvas", "async function loadConfig")
    updates = _block(CANVAS, "function handleCanvasUpdatedMessage", "async function returnToCanvasManager")

    # A fired timeout is no longer pending, otherwise every later remote update
    # would be treated as a local save forever.
    assert "saveTimer = null;" in save
    assert "base_updated_at:Number(lastCanvasUpdatedAt || canvas.updated_at || 0)" in save
    assert "if(localCanvasDirty || saveCanvasAgain)" in save

    # The update handler computes pending local work but deliberately does not
    # reset localCanvasDirty before the 409 retry path runs.
    assert "const hasPendingLocalSave = Boolean(localCanvasDirty || saveTimer || savingCanvasNow || saveCanvasAgain);" in updates
    assert "localCanvasDirty = false;" not in updates
    assert "hasPendingLocalSave ? (savingCanvasNow ? 700 : 1000) : 120" in updates


def test_smart_drop_handlers_observe_upload_rejections() -> None:
    minimax = _block(SMART, "async function handleMinimaxTimelineDrop", "function globalMinimaxDropContext")
    assert "try {" in minimax
    assert minimax.index("try {") < minimax.index("await smartMinimaxDropItemsFromEvent")
    assert "catch(err)" in minimax
    assert "toast(err?.message || tr('smart.toastUploadFail'))" in minimax

    shell = _block(SMART, "shell.ondrop = async", "window.addEventListener('paste'")
    assert "try {" in shell
    assert shell.index("try {") < shell.index("await resolveSmartImageDropPayload")
    assert "catch(err)" in shell

    node = _block(SMART, "el.ondrop = async", "function rectOverlapNode")
    assert "try {" in node
    assert node.index("try {") < node.index("await resolveSmartImageDropPayload")
    assert "catch(err)" in node

    # The fallback target-level listener has its own boundary because capture
    # propagation can legitimately bypass the shared minimax handler.
    target = _block(
        SMART,
        "target.addEventListener('drop', async e =>",
        "    });\n}\n\nfunction bindScrollableText",
    )
    assert "try {" in target
    assert target.index("try {") < target.index("await smartMinimaxDropItemsFromEvent")
    assert "catch(err)" in target


def test_smart_refresh_and_bootstrap_handlers_do_not_leak_rejections() -> None:
    listeners = _block(SMART, "try {\n    const apiChannel = new BroadcastChannel('studio-api');", "window.addEventListener('studio-lang-change'")
    assert "await refreshSmartConfigFromSettings();" in listeners
    assert "catch(err)" in listeners
    assert "refreshSmartConfigFromSettings().catch(err =>" in listeners

    bootstrap = _block(SMART, "window.onload = async () =>", "};\n")
    assert "try {" in bootstrap
    assert "catch(err)" in bootstrap

    classic_bootstrap = _block(CANVAS, "window.onload = async () =>", "};\n")
    assert "try {" in classic_bootstrap
    assert "catch(err)" in classic_bootstrap


def test_script_import_and_canvas_asset_manager_actions_have_rejection_boundaries() -> None:
    # File.text() is asynchronous even though the chooser itself is local;
    # locked/removable files must not emit an unhandledrejection event.
    script_import = _block(STUDIO, "fileInput.addEventListener('change', async () =>", "parseBtn.addEventListener")
    assert "try {" in script_import
    assert script_import.index("try {") < script_import.index("await file.text()")
    assert "catch(err)" in script_import
    assert "finally" in script_import

    # The canvas manager delegates all CRUD buttons through one async listener.
    # Keep the guard around the dispatcher rather than relying on each API
    # branch to remember to catch a rejected fetch.
    manager = _block(CANVAS, "assetManagerModal?.addEventListener('click', async event =>", "function rerunFromOutputMeta")
    assert "try {" in manager
    assert manager.index("try {") < manager.index("await fetch(")
    assert "canvas asset manager action failed" in manager
    assert manager.rfind("catch(err)") > manager.index("await fetch(")


def test_classic_asset_upload_handlers_observe_network_failures() -> None:
    image_upload = _block(CANVAS, "upload?.addEventListener('change', async () =>", "function workflowAssetThumbHtml")
    assert "await uploadFilesToLibrary" in image_upload
    assert "catch(err)" in image_upload
    assert "upload.value = ''" in image_upload

    workflow_upload = _block(CANVAS, "upload?.addEventListener('change', async () =>", "function renderPromptAssetManager")
    # There are two generated upload listeners; the second one is selected by
    # its endpoint marker and must check the HTTP status before rendering.
    workflow_upload = workflow_upload[workflow_upload.find("/api/asset-library/workflows/upload") - 300 :]
    assert "response.ok" in workflow_upload
    assert "工作流上传失败" in workflow_upload

    node_upload = _block(CANVAS, "wrap.querySelector('.asset-pick')?.addEventListener('click', async e =>", "const ASSET_TOOL_PROMPTS")
    assert "input.onchange = async () =>" in node_upload
    assert "await fetch('/api/ai/upload'" in node_upload
    assert "catch(err)" in node_upload


def test_video_workflow_media_actions_keep_chooser_and_upload_failures_local() -> None:
    # Every media picker in the director panel is an async DOM event.  The
    # shared upload helper already reports HTTP failures; these guards cover
    # chooser/host integration failures and state mutation errors as well.
    for marker, fallback, end_marker in (
        ("[data-scene-pick]", "场景图片上传失败", "['scale', 'tx', 'ty', 'tz', 'rx', 'ry', 'rz']"),
        ('[data-vwf="track-pick"]', "音频上传失败", "[data-vwf=\"limit-image\"]"),
        ('[data-vwf="ref-pick"]', "参考素材上传失败", "rootEl.querySelectorAll('.vwf-seg')"),
        ('[data-vwf="redo-mask"]', "蒙版上传失败", '[data-vwf="redo-mask-clear"]'),
        ('[data-vwf="green-subject"]', "主体素材上传失败", '[data-vwf="green-pick"]'),
        ('[data-vwf="green-pick"]', "抠像背景上传失败", '[data-vwf="green-clear"]'),
        ('[data-vwf="asset-pick"]', "工作流资产上传失败", '[data-vwf="asset-to-stage"]'),
    ):
        # The marker can occur in render markup before the listener; inspect
        # the listener tail to avoid accepting a static data attribute alone.
        start = VWF_PANEL.index(f"querySelector('{marker}')")
        end = VWF_PANEL.find(end_marker, start)
        assert end > start, (marker, end_marker)
        block = VWF_PANEL[start:end]
        assert "async" in block
        assert "try {" in block
        assert "catch(err)" in block
        assert fallback in block


def test_hidden_desktop_file_inputs_keep_explicit_accessible_names() -> None:
    for source, element_id in (
        (ASSET_MANAGER_HTML, "assetUploadInput"),
        (SMART_HTML, "fileInput"),
        (SMART_HTML, "smartWorkflowImportInput"),
    ):
        start = source.index(f'id="{element_id}"')
        tag = source[source.rfind("<input", 0, start) : source.index(">", start) + 1]
        assert 'aria-label="' in tag, element_id
        assert 'title="' in tag, element_id
