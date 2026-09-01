"""Regression tests for the integrated shell's first iframe navigation.

The desktop browser preload used by the in-app browser observes every frame.
Parser-created ``about:blank`` frames are not fully initialized at the exact
``DOMContentLoaded`` task, so navigating one of them synchronously can make
that preload call ``MutationObserver.observe`` with a non-Node target.  The
shell intentionally defers only the initial route activation by one paint;
normal user route switches stay synchronous.
"""

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "static" / "index.html"


def _restore_active_page_body() -> str:
    source = INDEX.read_text(encoding="utf-8")
    match = re.search(
        r"function\s+restoreActivePage\s*\(\)\s*\{(?P<body>.*?)\n\s*\}\n\s*document\.addEventListener\(",
        source,
        flags=re.S,
    )
    assert match, "restoreActivePage must remain an explicit bootstrap function"
    return match.group("body")


def test_initial_route_activation_is_deferred_one_paint():
    body = _restore_active_page_body()
    assert "const activate = () =>" in body
    assert "window.requestAnimationFrame(activate)" in body
    assert "window.setTimeout(activate, 0)" in body
    # The actual switch must happen from the deferred callback, not directly
    # in the DOMContentLoaded handler.
    assert body.count("switchUI(trigger, id, { skipRemember:true });") == 1
    assert body.index("switchUI(trigger, id, { skipRemember:true });") > body.index(
        "const activate = () =>"
    )


def test_route_shell_keeps_placeholder_iframes_lazy_until_selected():
    source = INDEX.read_text(encoding="utf-8")
    # No iframe is assigned a src attribute in the static shell.  The selected
    # route receives its data-src only through switchUI after the deferred
    # bootstrap, avoiding simultaneous real navigations during parser startup.
    assert not re.search(r"<iframe\b[^>]*(?<!data-)\bsrc\s*=", source, flags=re.I)
    assert source.count("data-src=\"/static/") >= 10
    assert "else if (!target.src)" in source


def test_tailwind_bootstrap_has_no_global_observer_monkeypatch():
    """Keep the browser-preload workaround local to the route scheduler.

    The failing ``observe`` call is made by the desktop browser preload in an
    isolated execution world, so wrapping the native MutationObserver or
    deferring Tailwind itself cannot fix it and can hide legitimate app bugs.
    """

    pages = (
        "index.html",
        "angle.html",
        "api-settings.html",
        "canvas.html",
        "canvas-list.html",
        "comfyui-settings.html",
        "enhance.html",
        "gpt-chat.html",
        "klein.html",
        "online.html",
        "zimage.html",
    )
    for name in pages:
        source = (ROOT / "static" / name).read_text(encoding="utf-8")
        assert "tailwind-observer-guard" not in source, name
        assert "defer src=\"/static/vendor/js/tailwindcss-cdn.js" not in source, name
    assert not (ROOT / "static" / "vendor" / "js" / "tailwind-observer-guard.js").exists()
