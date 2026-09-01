// canvas-list-layout.js — deterministic collision repair for the project board.
//
// The board is intentionally an infinite, pannable surface, but cards must not
// occupy the same rectangle by default.  This helper is kept DOM-free so it can
// be unit-tested independently from the canvas-list page and reused by future
// board renderers.
(function exposeCanvasListLayout(root) {
    'use strict';

    const CARD_WIDTH = 248;
    const CARD_HEIGHT = 150;
    const STEP_X = 276;
    const STEP_Y = 176;
    const ORIGIN_X = 40;
    const ORIGIN_Y = 40;
    const MAX_COORDINATE = 1000000;

    function finiteCoordinate(value) {
        if(value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
        const number = Number(value);
        if(!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) return null;
        return number;
    }

    function overlaps(a, b) {
        return a.x < b.x + CARD_WIDTH
            && a.x + CARD_WIDTH > b.x
            && a.y < b.y + CARD_HEIGHT
            && a.y + CARD_HEIGHT > b.y;
    }

    function ringOffsets(radius) {
        if(radius <= 0) return [[0, 0]];
        const points = [];
        // Prefer a readable cross before diagonals, then fill the perimeter.
        points.push([radius, 0], [-radius, 0], [0, radius], [0, -radius]);
        points.push([radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius]);
        for(let i = -radius + 1; i <= radius - 1; i++) {
            points.push([i, -radius], [i, radius], [-radius, i], [radius, i]);
        }
        return points;
    }

    function findFreePosition(base, occupied) {
        // A 132-card duplicate cluster fits within six rings.  The larger cap
        // keeps pathological imports deterministic without an unbounded loop.
        for(let radius = 0; radius <= 64; radius++) {
            const offsets = ringOffsets(radius);
            for(const [dx, dy] of offsets) {
                const candidate = {
                    x: Math.round(base.x + dx * STEP_X),
                    y: Math.round(base.y + dy * STEP_Y)
                };
                const rect = { ...candidate, width: CARD_WIDTH, height: CARD_HEIGHT };
                if(!occupied.some(item => overlaps(rect, item))) return candidate;
            }
        }
        // This is practically unreachable, but still guarantees progress for
        // a corrupted import containing thousands of giant/unknown cards.
        return {
            x: Math.round(base.x + (occupied.length + 1) * STEP_X),
            y: Math.round(base.y)
        };
    }

    /**
     * Resolve display positions without mutating the caller's objects.
     *
     * Existing non-overlapping positions are preserved byte-for-byte (apart
     * from numeric conversion).  Only missing/invalid coordinates and cards
     * whose rectangles overlap an earlier card are moved to a nearby spiral
     * slot.  `moved` is intentionally explicit so the page can persist only
     * repaired records instead of writing every card on every render.
     */
    function resolve(items) {
        const list = Array.isArray(items) ? items : [];
        const occupied = [];
        const positions = [];
        const moved = [];

        list.forEach((item, index) => {
            const source = item && typeof item === 'object' ? item : {};
            const rawX = finiteCoordinate(source.board_x);
            const rawY = finiteCoordinate(source.board_y);
            const fallback = {
                x: ORIGIN_X + (index % 4) * STEP_X,
                y: ORIGIN_Y + Math.floor(index / 4) * STEP_Y
            };
            const base = {
                x: rawX === null ? fallback.x : rawX,
                y: rawY === null ? fallback.y : rawY
            };
            const invalid = rawX === null || rawY === null;
            const collides = !invalid && occupied.some(rect => overlaps(base, rect));
            const position = (invalid || collides) ? findFreePosition(base, occupied) : base;
            const changed = rawX === null || rawY === null
                || Math.abs(position.x - rawX) > 0.01
                || Math.abs(position.y - rawY) > 0.01;
            const entry = {
                id: source.id == null ? String(index) : String(source.id),
                x: position.x,
                y: position.y,
                changed
            };
            positions.push(entry);
            if(changed) moved.push(entry);
            occupied.push({ x: position.x, y: position.y });
        });

        return { positions, moved };
    }

    root.CanvasListLayout = Object.freeze({
        CARD_WIDTH,
        CARD_HEIGHT,
        STEP_X,
        STEP_Y,
        resolve,
        overlaps
    });
})(window);
