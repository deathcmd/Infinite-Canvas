const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const window = {};
const context = { window, console };
vm.createContext(context);

function load(file) {
    const full = path.join(__dirname, '..', 'static', 'js', file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: file });
}

load('video-workflow-schema.js');
load('video-workflow-adapter.js');

const Schema = context.window.VideoWorkflowSchema;
const Adapter = context.window.VideoWorkflowAdapter;
assert(Schema, 'VideoWorkflowSchema missing');
assert(Adapter, 'VideoWorkflowAdapter missing');
assert.strictEqual(JSON.stringify(Schema.ENGINE_SLOTS), JSON.stringify(['video', 'image', 'upscale', 'matting', 'tts', 'llm', 'relight', 'redo']));
assert.ok(Schema.PURPOSES.includes('motion'));
assert.ok(Schema.PURPOSES.includes('layout'));
assert.strictEqual(Schema.engineReady({ engines: { image: { provider: 'comfyui' } } }, 'image'), true);
assert.strictEqual(Schema.engineReady({ engines: {} }, 'image'), false);
assert.strictEqual(Schema.isLocalEngine('comfyui'), true);
assert.strictEqual(Schema.isLocalEngine('openai_local'), true);

// Asset cards cross the canvas, embedded panel and standalone director page.
// Their semantic type must survive that round trip: scene/panorama cards are
// backgrounds, while prop cards remain primitive stage objects.
const normalizedAssets = Schema.normalize({ assets: [
    { id: 'scene-1', assetKind: 'scene', panorama: true, name: '巷口', url: '/scene.png' },
    { id: 'prop-1', kind: 'prop', primitive: 'sphere', material: 'metal', name: '球', url: '/sphere.png' }
] }).assets;
assert.strictEqual(normalizedAssets[0].kind, 'scene', 'assetKind alias should normalize to kind');
assert.strictEqual(normalizedAssets[0].panorama, true, 'scene panorama flag should survive normalization');
const propActor = Schema.actorFromAsset(normalizedAssets[1], []);
assert.strictEqual(propActor.kind, 'prop', 'prop asset should create a prop actor');
assert.strictEqual(propActor.primitive, 'sphere', 'prop primitive should survive placement');
assert.strictEqual(propActor.material, 'metal', 'prop material should survive placement');
const collected = Adapter.collectCanvasAssets([
    { type: 'assetCard', id: 'scene-card', assetKind: 'scene', panorama: true, name: '全景街道', url: '/street.jpg' }
]);
assert.strictEqual(collected[0].kind, 'scene');
assert.strictEqual(collected[0].panorama, true, 'canvas collection must retain panorama metadata');

const src = Schema.normalize({
    extraRefs: [
        { kind: 'video', purpose: 'motion', url: 'http://local/move.mp4', name: '运镜' },
        { kind: 'image', purpose: 'layout', url: 'http://local/layout.png', name: '站位' }
    ],
    audioTracks: [{ kind: 'adr', text: '门口对白', url: 'http://local/adr.wav' }],
    audioSplit: true,
    analyze: 'breakdown',
    engines: { video: { provider: 'openai_local', model: 'local-video' } },
    stage: { actors: [{ name: '角色1', x: 0.2, y: 0.4, facing: 90, action: 'walk' }], cameraMove: 'orbit_360' }
});
assert.strictEqual(src.audioSplit, true);
assert.strictEqual(src.analyze, 'breakdown');

Adapter.apply({ prompt: '夜雨巷口', workflow: src, previousVideos: [] }).then(out => {
    const videoUrls = (out.videos || []).concat(out.payload?.videos || []);
    assert.ok(!videoUrls.includes('http://local/move.mp4'), 'motion video must stay out of sent videos');
    assert.ok((out.leftover.motionOnly || []).length, 'motion leftover missing');
    assert.ok((out.audios || []).includes('http://local/adr.wav'), 'ADR url should enter audios');
    assert.ok(String(out.prompt).includes('【只参考运镜】'));
    assert.ok(String(out.prompt).includes('【音频分离】'));
    assert.ok(String(out.prompt).includes('【拉片】'));
    assert.ok(out.leftover.engines.video.provider === 'openai_local');
    const text = JSON.stringify(out);
    assert.ok(!/seedance/i.test(text));
    assert.ok(!/seedream/i.test(text));

    return Promise.all([
        Adapter.apply({
            prompt: '参考图上限',
            workflow: Schema.normalize({ refLimits: { image: 16, video: 4, audio: 4 } }),
            refs: Array.from({ length: 20 }, (_, i) => ({
                kind: 'image',
                url: `http://local/ref-${i}.png`,
                name: `ref-${i}`
            }))
        }),
        Adapter.apply({
            prompt: '只参考运镜',
            workflow: Schema.emptyWorkflow(),
            refs: [{ kind: 'video', purpose: 'motion', url: 'http://local/input-motion.mp4', name: 'input-motion' }]
        }),
        Adapter.apply({ prompt: '空片场', workflow: Schema.emptyWorkflow() })
        ,Adapter.apply({
            prompt: '夜景\n\n【视频工作流】\n已有',
            workflow: Schema.emptyWorkflow(),
            refs: [{ kind: 'video', purpose: 'motion', url: 'http://local/packed-motion.mp4' }]
        }),
        Adapter.apply({
            prompt: '扩展用途',
            workflow: Schema.emptyWorkflow(),
            refs: [{ kind: 'image', purpose: 'vendor_custom_role', url: 'http://local/custom.png' }]
        })
    ]).then(([limited, motion, emptyStage, packed, unknownPurpose]) => {
        assert.strictEqual(limited.images.length, 16, 'input refs must honor image limit');
        assert.strictEqual((limited.leftover.overflowImages || []).length, 4, 'overflow refs should be visible');
        assert.ok(!motion.videos.includes('http://local/input-motion.mp4'), 'input motion ref must not be sent as video content');
        assert.strictEqual((motion.leftover.motionOnly || []).length, 1, 'input motion ref should remain in motionOnly');
        assert.ok(!String(emptyStage.prompt).includes('【片场布局】'), 'empty normalized stage must not add stage prompt');
        assert.ok(!emptyStage.leftover.stageActors && !emptyStage.leftover.stageCameras, 'empty normalized stage must not add stage leftovers');
        assert.ok(!packed.videos.includes('http://local/packed-motion.mp4'), 'packed prompt must not reintroduce motion video');
        assert.strictEqual(unknownPurpose.leftover.refPurposes?.[0]?.purpose, 'vendor_custom_role', 'unknown purpose must survive normalization');
        return Adapter.apply({
            prompt: '画幅继承',
            workflow: Schema.normalize({ stage: { aspect: '9:16' } })
        }).then(aspect => {
            assert.strictEqual(aspect.leftover.stageAspect, '9:16', 'stage aspect should be visible to the adapter');
            assert.ok(String(aspect.prompt).includes('9:16'), 'stage note should describe the selected aspect');
        });
    });
}).then(() => {
    console.log('OK');
}).catch(err => {
    console.error(err);
    process.exit(1);
});
