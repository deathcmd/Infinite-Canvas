from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PANEL = (ROOT / "static/js/video-workflow-panel.js").read_text(encoding="utf-8")
SCHEMA = (ROOT / "static/js/video-workflow-schema.js").read_text(encoding="utf-8")
ADAPTER = (ROOT / "static/js/video-workflow-adapter.js").read_text(encoding="utf-8")
CANVAS = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
DIRECTOR = (ROOT / "static/js/director-desk.js").read_text(encoding="utf-8")


def test_file_picker_resolves_when_user_cancels():
    """A dismissed chooser must not leave the async workflow handler hung."""
    assert "input.oncancel = () => finish([]);" in PANEL
    assert "input.onchange = () => finish([...input.files || []]);" in PANEL
    assert "onWindowFocus" in PANEL
    assert "no file was populated" in PANEL


def test_upload_boundary_handles_http_and_custom_provider_failures():
    """Upload failures stay inside the event boundary and are reportable."""
    assert "try {" in PANEL[PANEL.index("async function uploadFiles"):PANEL.index("function selectedOf")]
    assert "if (!response.ok)" in PANEL
    assert "typeof opts?.onUploadError === 'function'" in PANEL
    assert "return [];" in PANEL[PANEL.index("async function uploadFiles"):PANEL.index("function selectedOf")]
    canvas = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
    assert "async function uploadCanvasVideoWorkflowFiles(files)" in canvas
    upload_fn = canvas[canvas.index("async function uploadCanvasVideoWorkflowFiles"):canvas.index("function mountCanvasVideoWorkflowPanel")]
    assert "if(!response.ok)" in upload_fn
    assert "throw new Error" in upload_fn
    assert "upload: uploadCanvasVideoWorkflowFiles" in canvas


def test_three_stage_asset_drop_uses_floor_coordinates():
    """Dropping a library card in 3D should land at the cursor, not a default slot."""
    assert "function stageDropPoint(host, ev)" in PANEL
    assert "rt.raycaster.ray.intersectPlane(rt.groundPlane, hit)" in PANEL
    drop_start = PANEL.index("view3d.addEventListener('drop'")
    drop_block = PANEL[drop_start:PANEL.index("const onKey =", drop_start)]
    assert "const point = stageDropPoint(host, ev);" in drop_block
    assert "actor.x = point.nx;" in drop_block
    assert "actor.y = point.ny;" in drop_block


def test_recording_handles_unsupported_mediarecorder_without_empty_mime():
    """Browser/WebView codec differences must not throw or leave playback running."""
    record_start = PANEL.index("rootEl.querySelector('[data-stage-record]')")
    record_block = PANEL[record_start:PANEL.index("const syncCamHud", record_start)]
    assert "typeof MediaRecorder === 'undefined'" in record_block
    assert "stopPlayback();" in record_block
    assert "new MediaRecorder(stream);" in record_block
    assert "if (!playback.playing) playBtn?.click();" in record_block
    assert "let recordErrorReported = false;" in record_block
    # The implementation may mention the historical bad call in a comment;
    # assert the executable branch instead of rejecting that documentation.
    assert "rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);" in record_block
    assert "stream.getTracks?.().forEach(track => track.stop())" in record_block


def test_snapshot_and_render_errors_stay_inside_the_toolbar_event_boundary():
    """Tainted images/WebGL failures must produce a toast instead of an unhandled rejection."""
    export_start = PANEL.index("const exportLayout = async")
    export_block = PANEL[export_start:PANEL.index("rootEl.querySelectorAll('[data-stage-aspect]'", export_start)]
    assert "const runExport = async rendered" in export_block
    assert "onExportError" in export_block
    assert "await runExport(false)" in export_block
    assert "await runExport(true)" in export_block


def test_icon_only_stage_controls_have_accessible_names():
    """Timeline and scene icon buttons must remain usable without sighted hover."""
    assert "data-tl-skip=\"start\" title=\"${escapeHtml(tr('videoWf.timelineStart'))}\"" in PANEL
    assert "data-tl-skip=\"-1\" title=\"${escapeHtml(tr('videoWf.prevFrame'))}\"" in PANEL
    assert "data-tl-skip=\"1\" title=\"${escapeHtml(tr('videoWf.nextFrame'))}\"" in PANEL
    assert "data-tl-skip=\"end\" title=\"${escapeHtml(tr('videoWf.timelineEnd'))}\"" in PANEL
    assert "data-scene-reset title=\"${escapeHtml(tr('videoWf.resetScene'))}\"" in PANEL


def test_preview_refresh_failure_is_reported_without_an_unhandled_rejection():
    """Provider/decoder errors from the request-body preview stay recoverable."""
    start = PANEL.index("const runPreviewRefresh = async")
    block = PANEL[start:PANEL.index("rootEl.querySelectorAll('input, select", start)]
    assert "onPreviewError" in block
    assert "await runPreviewRefresh();" in block


def test_visible_director_form_controls_expose_explicit_accessible_names():
    """Do not rely solely on visual text nested in a label for WebView ATs."""
    for key in (
        "videoWf.activeCamera", "videoWf.cameraX", "videoWf.cameraY",
        "videoWf.cameraHeight", "videoWf.cameraFacing", "videoWf.sceneColor",
        "videoWf.sceneHex", "videoWf.sceneScale", "videoWf.sceneTranslateX",
        "videoWf.sceneTranslateY", "videoWf.sceneTranslateZ",
        "videoWf.sceneRotateX", "videoWf.sceneRotateY", "videoWf.sceneRotateZ",
        "videoWf.currentFrame", "videoWf.tlZoom", "videoWf.searchObject",
    ):
        assert f"tr('{key}')" in PANEL
    assert 'data-cam-active aria-label=' in PANEL
    assert 'data-tl-frame aria-label=' in PANEL


def test_both_camera_add_buttons_are_bound():
    """The library and preview-column add-camera affordances must share behavior."""
    start = PANEL.index("The compact library and the right-side camera preview")
    block = PANEL[start:PANEL.index("rootEl.querySelectorAll('[data-cam-move]'", start)]
    assert "querySelectorAll('[data-cam-add]')" in block
    assert "schema.addCamera(wf.stage)" in block


def test_playback_includes_duration_endpoint_and_frame_input_is_clamped():
    """Frame 0..duration is the playable interval, including the end keyframe."""
    assert "% (duration + 1)" in PANEL
    frame_block_start = PANEL.index("rootEl.querySelector('[data-tl-frame]')")
    frame_block = PANEL[frame_block_start:PANEL.index("if (canvas)", frame_block_start)]
    assert "Number.isFinite(rawFrame)" in frame_block
    assert "Math.min(duration" in frame_block
    timeline_start = PANEL.index("const ruler = []")
    timeline_block = PANEL[timeline_start:PANEL.index("const empty =", timeline_start)]
    assert "if (duration % step)" in timeline_block
    assert "style=\"left:100%\">${duration}" in timeline_block


def test_schema_clamps_live_frame_to_duration_but_retains_future_keyframes():
    """Preview cursor cannot exceed duration while imported future keys survive."""
    preview_start = SCHEMA.index("function previewStage")
    preview_block = SCHEMA[preview_start:SCHEMA.index("function snapshotStage", preview_start)]
    assert "0, src.duration, src.frame" in preview_block
    stage_start = SCHEMA.index("function normalizeStage")
    stage_block = SCHEMA[stage_start:SCHEMA.index("function stageHasContent", stage_start)]
    assert "const duration = Math.round(clampNum(src.duration" in stage_block
    assert "frame: Math.round(clampNum(src.frame, 0, duration, 0))" in stage_block
    assert "keyframes: Array.isArray(src.keyframes) ? src.keyframes.map(normalizeKeyframe) : []" in stage_block


def test_scene_and_prop_assets_keep_their_stage_types_across_surfaces():
    """Scene cards become backgrounds and prop cards remain primitives."""
    assert "function assetPlacementKind(asset)" in PANEL
    placement_start = PANEL.index("function assetPlacementKind")
    placement_block = PANEL[placement_start:PANEL.index("function markActorActive", placement_start)]
    assert "raw === 'scene' || raw === 'panorama' || Boolean(asset?.panorama)" in placement_block
    assert "scene.bgMode = 'image'" in placement_block
    assert "return { id: 'scene', kind: 'scene', scene: true" in placement_block
    assert "schema.actorFromAsset(asset, wf.stage.actors)" in placement_block
    assert "videoWf.sceneNeedsImage" in placement_block
    assert "videoWf.styleNotStageObject" in placement_block

    card_start = CANVAS.index("function placeAssetCardOnStage")
    card_block = CANVAS[card_start:CANVAS.index("function renderAudioNodeBody", card_start)]
    assert "const isScene = rawKind === 'scene' || rawKind === 'panorama' || Boolean(assetNode.panorama);" in card_block
    assert "if(isScene){" in card_block
    assert "stage.scene.bgUrl = asset.url" in card_block
    assert "...(assetNode.primitive ? { primitive: assetNode.primitive } : {})" in card_block

    assert "panorama: Boolean(node.panorama) || node.assetKind === 'panorama' || node.kind === 'panorama'" in ADAPTER
    assert "panorama: Boolean(item.panorama) || item.assetKind === 'panorama' || item.kind === 'panorama'" in DIRECTOR
    assert "const rawKind = String(item.kind || item.assetKind || '').trim();" in SCHEMA
    assert "const kind = rawKind === 'prop' || primitive ? 'prop' : 'character';" in SCHEMA
    assert "primitive,\n            material:" in SCHEMA
