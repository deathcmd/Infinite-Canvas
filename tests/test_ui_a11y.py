"""Static accessibility contracts for the desktop studio surfaces.

The studio pages are deliberately rendered as plain HTML/JavaScript rather
than through a component framework.  A small source-level contract catches a
common regression when a new control is added to a template: icon-only or
placeholder-only controls silently lose their accessible name, and generated
preview images lose their ``alt`` text.  Hidden compatibility inputs are
excluded because they are not part of the active desktop UI.
"""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

_CONTROL_RE = re.compile(r"<(input|select|textarea)\b[^>]*>", re.IGNORECASE | re.DOTALL)
_IMAGE_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE | re.DOTALL)

# These are the desktop pages with image-generation/editing controls and the
# API/ComfyUI configuration editors.  Other shells (canvas, chat, etc.) have
# their own interaction contracts and are intentionally tested separately.
_DESKTOP_SURFACES = (
    "static/angle.html",
    "static/enhance.html",
    "static/zimage.html",
    "static/online.html",
    "static/klein.html",
    "static/api-settings.html",
    "static/comfyui-settings.html",
    "static/script-studio.html",
)


def _text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def _is_hidden(tag: str) -> bool:
    type_match = re.search(r"\btype\s*=\s*['\"]([^'\"]+)", tag, re.IGNORECASE)
    if type_match and type_match.group(1).lower() == "hidden":
        return True
    class_match = re.search(r"\bclass\s*=\s*['\"]([^'\"]+)", tag, re.IGNORECASE)
    if class_match and re.search(r"(?:^|\s)hidden(?:\s|$)", class_match.group(1)):
        return True
    style_match = re.search(r"\bstyle\s*=\s*['\"]([^'\"]+)", tag, re.IGNORECASE)
    if style_match and "display:none" in style_match.group(1).replace(" ", "").lower():
        return True
    return bool(re.search(r"\baria-hidden\s*=\s*['\"]true['\"]", tag, re.IGNORECASE))


def test_desktop_surface_controls_have_explicit_accessible_names() -> None:
    missing: list[str] = []
    for relative in _DESKTOP_SURFACES:
        source = _text(relative)
        for match in _CONTROL_RE.finditer(source):
            tag = match.group(0)
            if _is_hidden(tag):
                continue
            # ``title`` is retained as a fallback for a few native selects;
            # all icon-only controls use aria-label/aria-labelledby instead.
            if not re.search(r"\baria-label(?:ledby)?\s*=|\btitle\s*=", tag, re.IGNORECASE):
                missing.append(f"{relative}: {tag[:140].replace(chr(10), ' ')}")
    assert not missing, "desktop form controls without an accessible name:\n" + "\n".join(missing)


def test_desktop_surface_images_declare_alt_text() -> None:
    missing: list[str] = []
    for relative in _DESKTOP_SURFACES:
        source = _text(relative)
        for match in _IMAGE_RE.finditer(source):
            tag = match.group(0)
            if not re.search(r"\balt\s*=", tag, re.IGNORECASE):
                missing.append(f"{relative}: {tag[:140].replace(chr(10), ' ')}")
    assert not missing, "desktop images without alt text:\n" + "\n".join(missing)


def test_generated_editor_templates_keep_accessibility_attributes() -> None:
    comfy = _text("static/js/comfyui-settings.js")
    api = _text("static/js/api-settings.js")

    # These markers cover the dynamic controls that do not exist in the
    # initial HTML document and therefore are easy to miss in a static audit.
    for marker in (
        'aria-label="${escapeAttr(friendlyName)} 显示名称"',
        'aria-label="${escapeAttr(friendlyName)} 字段类型"',
        'aria-label="${escapeAttr(f.name || f.input || \'多行文本\')}"',
        'aria-label="${escapeAttr(f.name || f.input || \'滑块\')}"',
        'aria-label="${escapeAttr(f.name || f.input || \'下拉选项\')}"',
        'alt="${safeName}"',
    ):
        assert marker in comfy, f"ComfyUI dynamic accessibility marker missing: {marker}"
    for marker in (
        'aria-label="${escapeAttr(model || \'模型\')} 请求协议"',
        'aria-label="${escapeAttr(kind === \'image\' ? \'生图\' : kind === \'video\' ? \'视频\' : \'LLM\')} 模型名称"',
        'aria-label="LoRA 目标模型"',
        'aria-label="字段类型"',
        'aria-label="备注、用途、参数说明"',
    ):
        assert marker in api, f"API dynamic accessibility marker missing: {marker}"


def test_smart_canvas_icon_controls_keep_names_when_text_is_hidden() -> None:
    """The desktop smart-canvas theme hides utility labels at some widths.

    Keep the accessible name on the button itself so the controls remain
    discoverable even when CSS collapses the visible ``span`` label.
    """

    smart = _text("static/smart-canvas.html")
    assert re.search(
        r'<button[^>]*class="smart-back"[^>]*aria-label="返回画布列表"', smart
    )
    assert re.search(
        r'<button[^>]*id="assetToggle"[^>]*aria-label="资产库"', smart
    )


def test_script_studio_inputs_keep_explicit_names() -> None:
    studio = _text("static/script-studio.html")
    for element_id in ("ideaInput", "styleSelect", "aspectSelect", "titleInput", "scriptInput"):
        match = re.search(rf'<(?:input|select|textarea)[^>]*\bid="{element_id}"[^>]*>', studio)
        assert match, f"script studio control missing: {element_id}"
        assert re.search(r"\baria-label\s*=", match.group(0), re.IGNORECASE), (
            f"script studio control lacks explicit accessible name: {element_id}"
        )


def test_asset_manager_search_inputs_keep_explicit_names() -> None:
    source = _text("static/js/asset-manager.js")
    for element_id in ("assetSearch", "workflowSearch", "promptSearch", "localUploadSearch", "canvasAssetSearch"):
        match = re.search(rf'<input[^>]*\bid="{element_id}"[^>]*>', source)
        assert match, f"asset manager search missing: {element_id}"
        assert re.search(r"\baria-label\s*=", match.group(0), re.IGNORECASE), (
            f"asset manager search lacks explicit accessible name: {element_id}"
        )


def test_fixed_api_provider_templates_keep_accessible_names() -> None:
    """Banner cards use image/fallback markup whose text is not reliable."""

    api = _text("static/js/api-settings.js")
    for marker in (
        'aria-label="ModelScope（OpenAI 兼容）"',
        'aria-label="RunningHub（RH）"',
        'aria-label="火山引擎（Ark）"',
    ):
        assert marker in api, f"Fixed provider accessible name missing: {marker}"
