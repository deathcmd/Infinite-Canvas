from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_i18n_bundle_cache_bump_includes_redo_alias():
    """The smart shortcut dictionary must not be served from the old cache key."""
    loader = (ROOT / "static/js/i18n.js").read_text(encoding="utf-8")
    smart_bundle = (ROOT / "static/js/i18n/smart-canvas.js").read_text(encoding="utf-8")
    assert "const VERSION = '2026.09.01.opensource8'" in loader
    assert '"smart.shortcutRedoAlias"' in smart_bundle
    core = (ROOT / "static/js/i18n-core.js").read_text(encoding="utf-8")
    loader_text = loader
    assert "smart.shortcutRedoAlias" in core
    assert "smart.shortcutRedoAlias" in loader_text


def test_static_pages_reference_the_current_i18n_cache_label():
    pages = list((ROOT / "static").glob("*.html"))
    assert pages
    for page in pages:
        text = page.read_text(encoding="utf-8")
        if "/static/js/i18n.js" in text:
            assert "2026.09.01.opensource8" in text, page.name
