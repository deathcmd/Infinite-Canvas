"""Regression checks for the LibTV liquid connection paint.

These are intentionally static contracts: the SVG is generated at runtime, but
the important UX guarantees (continuous pipes, gradient material, and cheap
dense-graph sheen highlights) should not disappear during a stylesheet cleanup.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
THEME = (ROOT / "static/css/libtv-theme.css").read_text(encoding="utf-8")
SMART = (ROOT / "static/js/smart-canvas.js").read_text(encoding="utf-8")


def test_libtv_connection_layers_keep_continuous_gradient_paint():
    for selector in (
        ".connection-layer .conn-flow-glow",
        ".connection-layer .conn-flow",
        ".connection-layer .conn-flow-core",
        ".connection-layer .conn-flow-dense",
    ):
        assert selector in THEME
    assert "stroke: var(--conn-flow-gradient" in THEME
    assert "stroke-dasharray: none !important" in THEME
    assert "@keyframes libtvFluidDense" in THEME


def test_dense_smart_graph_has_one_paint_only_spark_per_material():
    assert 'conn-flow-dense-spark' in SMART
    assert 'const sparkCurves = rankedCurves' in SMART
    # Hit testing remains on conn-hit; the generated spark is explicitly paint
    # only and cannot steal a click from the connection's interactive path.
    assert 'class="conn-flow-spark conn-flow-dense-spark"' in SMART
    assert 'pointer-events="none"' in SMART


def test_connection_highlight_has_no_round_dot_and_uses_moderate_cycles():
    """The travelling sheen must stay an elongated highlight, not a dot/star."""

    # Smart-canvas spark templates are intentionally limited to two ellipse
    # children. Endpoint/delete circles are outside the spark group and are
    # still required by the editor's interaction affordances.
    assert '<circle class="conn-flow-spark' not in SMART
    assert 'conn-flow-spark-sheen' in SMART and 'conn-flow-spark-streak' in SMART
    assert 'rx="18" ry="1.2"' in SMART
    assert 'rx="10" ry=".72"' in SMART
    assert 'const duration = 2.35 + (hash % 145) / 100;' in SMART
    assert 'Math.max(1.85, duration * (.76 + ((hash >>> 24) % 22) / 100))' in SMART

    classic = (ROOT / "static/js/canvas.js").read_text(encoding="utf-8")
    spark_start = classic.index("function canvasLinkMotionSpark")
    spark_end = classic.index("function canvasLinkMotionStateClasses", spark_start)
    spark_block = classic[spark_start:spark_end]
    assert "createElementNS(ns, 'circle')" not in spark_block
    assert "link-motion-spark-sheen" in spark_block
    assert "setAttribute('rx', '18')" in spark_block
    assert "2.25 + ((seed % 1000) / 1000) * .95" in classic

    # A stale pre-fluid tab is also prevented from painting its old round or
    # star children after the new stylesheet has arrived.
    theme = (ROOT / "static/css/libtv-theme.css").read_text(encoding="utf-8")
    assert ".connection-layer .conn-flow-spark > circle" in theme
    assert "#links .link-motion-spark > circle" in classic


def test_lib_tv_assets_are_cache_busted_after_material_change():
    for page in ("static/canvas.html", "static/smart-canvas.html"):
        html = (ROOT / page).read_text(encoding="utf-8")
        assert "libtv-theme.css?v=2026.09.01.libtv12" in html
    assert "smart-canvas.js?v=2026.09.01.fluid13" in (
        ROOT / "static/smart-canvas.html"
    ).read_text(encoding="utf-8")
    assert "canvas.js?v=2026.09.01.fluid9" in (
        ROOT / "static/canvas.html"
    ).read_text(encoding="utf-8")
