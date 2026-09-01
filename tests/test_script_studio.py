"""Regression coverage for script-studio parsing and storage hand-off."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "static" / "js" / "script-studio.js").read_text(encoding="utf-8")


def test_dialogue_parser_accepts_colon_without_whitespace() -> None:
    expected = r"^([\u4e00-\u9fffA-Za-z0-9·]{1,12})[：:]\s*(.+)$"
    assert expected in SOURCE
    assert r"[：:]\s+(.+)" not in SOURCE


def test_local_screenplay_parser_handles_chinese_scene_numbers() -> None:
    assert "const CHINESE_SCENE_NUMBER" in SOURCE
    assert "const SHOT_HEADING_RE" in SOURCE
    assert "SHOT_SCENE_PREFIX_RE" in SOURCE
    # A numbered heading may use a Chinese colon (第一场：雨夜).  The
    # separator must be consumed before the scene name is added; otherwise
    # generated scene cards contain a visible leading “：”.
    assert "optional separator" in SOURCE
    assert "function addSceneNames(value, list)" in SOURCE


def test_seed_plan_storage_write_is_guarded_and_navigation_survives_failure() -> None:
    assert "function safeSessionStorageSet(key, value)" in SOURCE
    assert "function saveSeedPlan(payload)" in SOURCE
    assert "const handedOff = saveSeedPlan(payload);" in SOURCE
    assert "navigateToCanvas(data.canvas.id" in SOURCE
    # The create flow must not directly write to sessionStorage after the API
    # has already created a canvas; blocked storage should only affect hand-off.
    assert "sessionStorage.setItem('canvasLab.seedPlan'" not in SOURCE


def test_parser_and_storage_api_is_exported_for_focused_tests() -> None:
    marker = "window.CanvasLabScriptStudio = Object.freeze({"
    assert marker in SOURCE
    for name in ("emptyPlan", "parseScript", "localDraft", "safeSessionStorageSet", "saveSeedPlan"):
        assert name in SOURCE[SOURCE.index(marker) :]


def test_node_unit_harness() -> None:
    node = shutil.which("node")
    if not node:
        return
    result = subprocess.run(
        [node, str(ROOT / "tests" / "script_studio_unit.js")],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "OK" in result.stdout


if __name__ == "__main__":
    test_dialogue_parser_accepts_colon_without_whitespace()
    test_seed_plan_storage_write_is_guarded_and_navigation_survives_failure()
    test_parser_and_storage_api_is_exported_for_focused_tests()
    test_node_unit_harness()
    print("OK")
