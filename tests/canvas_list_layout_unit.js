// Deterministic regression tests for the canvas-list card collision resolver.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('static/js/canvas-list-layout.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'canvas-list-layout.js' });
const layout = context.window.CanvasListLayout;
assert.ok(layout && typeof layout.resolve === 'function');

function countOverlaps(positions) {
    let total = 0;
    for(let i = 0; i < positions.length; i++) {
        for(let j = 0; j < i; j++) {
            if(layout.overlaps(positions[i], positions[j])) total++;
        }
    }
    return total;
}

// Legacy projects commonly contain a whole page of cards at one default point.
const duplicateCluster = Array.from({ length: 132 }, (_, index) => ({
    id: `same-${index}`,
    board_x: 99,
    board_y: 249
}));
const repaired = layout.resolve(duplicateCluster);
assert.equal(repaired.positions.length, 132);
assert.equal(repaired.moved.length, 131, 'the first card remains the user-visible anchor');
assert.equal(new Set(repaired.positions.map(item => `${item.x},${item.y}`)).size, 132);
assert.equal(countOverlaps(repaired.positions), 0, 'repaired cards must not overlap');

// User-created, already separated cards must not be shuffled by a later load.
const spaced = [
    { id: 'left', board_x: -420, board_y: -80 },
    { id: 'right', board_x: 320, board_y: 240 },
    { id: 'far', board_x: 1400, board_y: -640 }
];
const spacedResult = layout.resolve(spaced);
assert.equal(spacedResult.moved.length, 0);
assert.equal(
    JSON.stringify(spacedResult.positions.map(item => [item.x, item.y])),
    JSON.stringify(spaced.map(item => [item.board_x, item.board_y]))
);

// Missing and non-finite coordinates get a nearby deterministic slot.
const invalid = layout.resolve([
    { id: 'ok', board_x: 0, board_y: 0 },
    { id: 'null', board_x: null, board_y: undefined },
    { id: 'nan', board_x: 'not-a-number', board_y: 1 }
]);
assert.equal(invalid.moved.length, 2);
assert.equal(countOverlaps(invalid.positions), 0);

console.log('OK');
