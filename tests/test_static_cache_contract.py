"""Regression checks for the static HTML cache-busting contract.

Static pages are source-controlled release assets.  They may carry semantic
cache labels (for example ``?v=2026.09.01.libtv12``), but starting the server
must not rewrite those files in place.  ``main.versioned_static_html`` applies
the cache key only to the HTTP response instead.  These tests intentionally
inspect the small source blocks rather than importing ``main``: importing the
application would initialize user-data paths and make the check needlessly
coupled to runtime state.
"""

from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "main.py"


def _main_source() -> str:
    return MAIN.read_text(encoding="utf-8")


def _function_source(source: str, name: str) -> str:
    """Return the exact source segment for a top-level function.

    AST offsets are used instead of a fragile regex so comments and nested
    helper functions can evolve without silently weakening this contract.
    """

    tree = ast.parse(source, filename=str(MAIN))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            lines = source.splitlines(keepends=True)
            # ``end_lineno`` is available on all supported Python versions in
            # this project and keeps decorators outside the function body.
            return "".join(lines[node.lineno - 1 : node.end_lineno])
    raise AssertionError(f"top-level function not found: {name}")


def test_startup_does_not_rewrite_checked_in_static_html() -> None:
    """A restart must not replace semantic asset tags with mtime values."""

    source = _main_source()
    startup = _function_source(source, "startup_event")
    assert "sync_static_html_versions(" not in startup
    assert "write_text(" not in startup
    assert "open(" not in startup


def test_legacy_static_sync_helper_is_a_non_mutating_compatibility_shim() -> None:
    """Old launchers may call the helper, but it must be side-effect free."""

    source = _main_source()
    helper = _function_source(source, "sync_static_html_versions")
    assert "Deprecated compatibility shim" in helper
    assert "return None" in helper
    # Keep this explicit so a future implementation cannot accidentally bring
    # back the old in-place rewrite under a different spelling.
    for mutation in ("write_text", "os.replace", "os.rename", "rename(", "unlink("):
        assert mutation not in helper


def test_http_html_response_owns_cache_busting() -> None:
    """Cache keys are added while serving HTML, with browser revalidation."""

    source = _main_source()
    response = _function_source(source, "static_html_response")
    assert "versioned_static_html(html)" in response
    assert 'media_type="text/html; charset=utf-8"' in response
    assert '"Cache-Control": "no-cache"' in response


def test_active_stylesheets_and_canvas_route_do_not_reuse_pre_libtv_cache_keys() -> None:
    """Direct CSS imports and JS navigations bypass the HTML rewriter.

    They therefore need an explicit current semantic key; otherwise a browser
    can keep an old light-theme/font bundle after the shell has been refreshed.
    Backup snapshots are intentionally excluded from this contract.
    """

    for relative in (
        "static/css/canvas-list.css",
        "static/css/canvas.css",
        "static/css/smart-canvas.css",
        "static/css/asset-manager.css",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        assert "fonts.css?v=2026.09.01.fonts1" in source, relative
        assert "2026.05.22.1" not in source, relative
        assert "2026.05.31" not in source, relative

    canvas_source = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
    assert "smart-canvas.html?id=${encodeURIComponent(id)}&v=2026.09.01.fluid13" in canvas_source
    assert "smart-canvas.html?id=${encodeURIComponent(id)}&v=2026.05.22.1" not in canvas_source
