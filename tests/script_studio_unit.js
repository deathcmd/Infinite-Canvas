const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// script-studio.js is a browser IIFE.  Keep this harness intentionally tiny:
// it exercises the exported pure boundaries without pulling in a DOM package
// or making the regression test depend on a particular browser engine.
function element(id, value = '') {
    const classes = new Set();
    return {
        id,
        value,
        hidden: false,
        dataset: { mode: 'paste' },
        classList: {
            toggle(name, force) {
                const enabled = force === undefined ? !classes.has(name) : Boolean(force);
                if (enabled) classes.add(name);
                else classes.delete(name);
            },
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        addEventListener() {},
        click() {},
        focus() {},
        textContent: '',
        innerHTML: ''
    };
}

const ids = [
    'studio', 'ideaInput', 'scriptInput', 'titleInput', 'styleSelect',
    'aspectSelect', 'status', 'summary', 'parseBtn', 'draftBtn', 'createBtn',
    'uploadBtn', 'fileInput', 'pageTitle', 'pageLead'
];
const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
elements.styleSelect.value = '2d';
elements.aspectSelect.value = '9:16';

const document = {
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
    documentElement: { classList: { add() {}, remove() {} } }
};
const writes = [];
const storage = {
    setItem(key, value) { writes.push([String(key), String(value)]); }
};
const window = { parent: null, lucide: null, sessionStorage: storage };
window.parent = window;
const context = {
    window,
    document,
    location: { search: '' },
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
};
vm.createContext(context);
const scriptPath = path.join(__dirname, '..', 'static', 'js', 'script-studio.js');
vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context, { filename: scriptPath });

const api = window.CanvasLabScriptStudio;
assert(api, 'CanvasLabScriptStudio API missing');
assert(Object.isFrozen(api), 'CanvasLabScriptStudio API should be immutable');

const plan = api.parseScript(
    '标题：夜班\n角色：张三、李四\n场景：门口\n第一场\n张三：你好\n李四:没有空格',
    { style: '3d', aspect: '16:9' }
);
assert.strictEqual(plan.title, '夜班');
assert.strictEqual(plan.style, '3d');
assert.strictEqual(plan.aspect, '16:9');
assert.strictEqual(
    JSON.stringify(plan.characters.map(item => item.name)),
    JSON.stringify(['张三', '李四']),
    'dialogue names should be detected with either Chinese or ASCII colon'
);
assert.strictEqual(plan.shots.length, 1);
assert(plan.shots[0].text.includes('张三：你好'));
assert(plan.shots[0].text.includes('李四:没有空格'));

const draft = api.localDraft('海边车站');
assert(draft.includes('主角：我来了。'));
const draftPlan = api.parseScript(draft);
assert(draftPlan.shots.length >= 2, 'Chinese-numbered scenes should split into separate shots');
assert(draftPlan.characters.some(item => item.name === '主角'));

const numbered = api.parseScript(
    '第一场：雨夜\n场景：旧车站、过道\n林默：别回头。\n' +
    '第二场：清晨\n场景：天台 / 门口\n苏禾：我知道。'
);
assert.strictEqual(
    JSON.stringify(numbered.scenes.map(item => item.name)),
    JSON.stringify(['雨夜', '旧车站', '过道', '清晨', '天台', '门口']),
    'numbered scene headings should not retain punctuation and scene lists should split'
);
assert(numbered.scenes.every(item => !/^[:：]/.test(item.name)), 'scene names must not start with a colon');

assert.strictEqual(api.safeSessionStorageSet('test-key', 'value'), true);
assert.deepStrictEqual(writes, [['test-key', 'value']]);
assert.strictEqual(api.saveSeedPlan({ title: '可恢复' }), true);
assert.strictEqual(writes.length, 2);
assert.strictEqual(writes[1][0], 'canvasLab.seedPlan');
assert.deepStrictEqual(JSON.parse(writes[1][1]), { title: '可恢复' });

// Blocked/private storage must be a non-fatal hand-off result.
Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() { throw new Error('SecurityError'); }
});
assert.strictEqual(api.safeSessionStorageSet('blocked', 'value'), false);
assert.strictEqual(api.saveSeedPlan({ title: '仍可打开画布' }), false);

Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: { setItem() { throw new Error('QuotaExceededError'); } }
});
assert.strictEqual(api.saveSeedPlan({ title: '超出配额' }), false);

const cyclic = {};
cyclic.self = cyclic;
assert.strictEqual(api.saveSeedPlan(cyclic), false);

console.log('OK');
