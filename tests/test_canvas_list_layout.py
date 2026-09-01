"""Regression coverage for deterministic canvas-list collision repair."""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_legacy_duplicate_canvas_cluster_is_repaired_without_moving_spaced_cards() -> None:
    result = subprocess.run(
        ["node", str(ROOT / "tests" / "canvas_list_layout_unit.js")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + "\n" + result.stderr
    assert "OK" in result.stdout


def test_project_rows_expose_keyboard_button_semantics() -> None:
    source = (ROOT / "static/js/canvas-list.js").read_text(encoding="utf-8")
    css = (ROOT / "static/css/canvas-list.css").read_text(encoding="utf-8")
    for marker in (
        "row.setAttribute('role', 'button')",
        "row.setAttribute('tabindex', '0')",
        "row.setAttribute('aria-pressed'",
        "if(e.key === 'Enter' || e.key === ' ')",
        "e.target.closest('.ws-proj-act, input, textarea, select')",
        "selectProject(p.id)",
    ):
        assert marker in source, f"project keyboard contract missing: {marker}"
    assert ".ws-project-row:focus-visible" in css
