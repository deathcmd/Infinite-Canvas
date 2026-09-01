(function (root) {
    // 通用视频工作流数据：不按模型名显隐，也不写死 30 秒 / 50 参考。
    const LIMITS = { image: 16, video: 4, audio: 4 };
    const MEDIA_KINDS = ['image', 'video', 'audio'];
    const ASSET_KINDS = ['character', 'scene', 'prop', 'style', 'panorama'];
    const AUDIO_TRACK_KINDS = ['adr', 'sfx', 'bgm'];
    const AUDIO_TRACK_LABELS = { adr: '对白', sfx: '音效', bgm: 'BGM' };
    const PROP_PRIMITIVES = [
        { id: 'cube', name: '方块' },
        { id: 'sphere', name: '球体' },
        { id: 'plane', name: '平面' },
        { id: 'cylinder', name: '圆柱' },
        { id: 'cone', name: '圆锥' }
    ];
    const MATERIAL_ITEMS = [
        { id: 'matte', name: '哑光' },
        { id: 'plastic', name: '塑料' },
        { id: 'metal', name: '金属' },
        { id: 'glass', name: '玻璃' },
        { id: 'fabric', name: '布料' },
        { id: 'skin', name: '皮肤' }
    ];
    const MATERIAL_IDS = MATERIAL_ITEMS.map(item => item.id);
    const PRIMITIVE_IDS = PROP_PRIMITIVES.map(item => item.id);

    const ACTION_TAGS = ['stand', 'walk', 'talk', 'fight', 'sit'];
    const ACTION_ALIAS = { '站': 'stand', '走': 'walk', '说': 'talk', '打': 'fight', '坐': 'sit' };
    const STAGE_TABS = ['object', 'mine', 'actor', 'prop', 'camera', 'action', 'move', 'material', 'scan'];
    const ACTION_CATS = ['all', 'fight', 'perform', 'life', 'move'];
    const STAGE_TOOLS = ['select', 'rotate', 'scale', 'path'];
    const INSPECTOR_TABS = ['attr', 'pose', 'action', 'path'];
    const ASPECTS = ['21:9', '16:9', '9:16'];
    const CAMERA_MOVE_ITEMS = [
        { id: '', name: '固定镜头' },
        { id: 'tilt_up', name: '上摇' },
        { id: 'tilt_down', name: '下摇' },
        { id: 'pan_left', name: '左摇' },
        { id: 'pan_right', name: '右摇' },
        { id: 'crane_up', name: '上升' },
        { id: 'crane_down', name: '下降' },
        { id: 'truck_left', name: '左移' },
        { id: 'truck_right', name: '右移' },
        { id: 'dolly_in', name: '前推' },
        { id: 'dolly_out', name: '后移' },
        { id: 'zoom_in', name: '变焦推进' },
        { id: 'zoom_out', name: '变焦拉远' },
        { id: 'handheld', name: '手持' },
        { id: 'orbit_180', name: '环绕180' },
        { id: 'orbit_360', name: '环绕360' },
        { id: 'follow', name: '跟随拍摄' },
        { id: 'follow_front', name: '迎面跟拍' },
        { id: 'follow_side', name: '侧面跟拍' }
    ];
    const CAMERA_MOVES = CAMERA_MOVE_ITEMS.map(item => item.id);
    const CAMERA_MOVE_LABELS = Object.fromEntries(CAMERA_MOVE_ITEMS.map(item => [item.id, item.name]));
    const CAMERA_MOVE_ALIAS = {
        orbit: 'orbit_360', dolly: 'dolly_in', truck: 'truck_right',
        环绕: 'orbit_360', 推进: 'dolly_in', 横移: 'truck_right', 无: ''
    };
    CAMERA_MOVE_ITEMS.forEach(item => { CAMERA_MOVE_ALIAS[item.name] = item.id; });
    const POSE_KEYS = ['head', 'handL', 'handR', 'footL', 'footR'];
    const POSE_LABELS = { head: '头', handL: '左手', handR: '右手', footL: '左脚', footR: '右脚' };
    const TAB_LABELS = {
        object: '对象', mine: '我的', actor: '角色', prop: '道具',
        camera: '机位', action: '动作', move: '运镜', material: '材质', scan: 'AI识图'
    };
    const INSPECTOR_LABELS = { attr: '属性', pose: '姿势', action: '动作', path: '运动轨迹' };
    const TOOL_LABELS = { select: '选择', rotate: '旋转', scale: '缩放', path: '路径' };
    const CAMERA_PRESET_ITEMS = [
        { id: 'current', name: '当前视角' },
        { id: 'front_mid', name: '正面中景' },
        { id: 'front_close', name: '正面特写' },
        { id: 'front_full', name: '正面全景' },
        { id: 'side_follow', name: '侧面跟拍' },
        { id: 'side_close', name: '侧面近景' },
        { id: 'back_mid', name: '背面中景' },
        { id: 'top_full', name: '俯拍全景' },
        { id: 'top45', name: '45°俯拍' },
        { id: 'low_up', name: '低角度仰拍' },
        { id: 'low_wide', name: '低角度广角' },
        { id: 'over_l', name: '过肩镜头' },
        { id: 'over_r', name: '过肩镜头（右）' },
        { id: 'bird', name: '鸟瞰' },
        { id: 'dutch', name: '荷兰角' }
    ];
    const CAMERA_PRESETS = CAMERA_PRESET_ITEMS.map(item => item.id);
    const CAM_PRESET_LABELS = Object.fromEntries(CAMERA_PRESET_ITEMS.map(item => [item.id, item.name]));
    const CAM_PRESET_ALIAS = {
        close: 'front_close', top: 'top_full', orbit: 'top45', front: 'front_mid',
        近景: 'front_close', 俯视: 'top_full', 环绕: 'top45', 正面: 'front_mid'
    };
    CAMERA_PRESET_ITEMS.forEach(item => { CAM_PRESET_ALIAS[item.name] = item.id; });
    // 动作卡对照小云雀导演台分类；点选后写入当前角色，不做 3D。
    const STAGE_ACTIONS = [
        { id: 'die', cat: 'fight', name: '死亡', mark: '亡' },
        { id: 'grenade', cat: 'fight', name: '投掷手雷', mark: '雷' },
        { id: 'block_mid', cat: 'fight', name: '中段格挡', mark: '挡' },
        { id: 'fly_kick', cat: 'fight', name: '飞身双脚踢', mark: '踢' },
        { id: 'air_kick', cat: 'fight', name: '腾空单脚飞踢', mark: '飞' },
        { id: 'ammo', cat: 'fight', name: '拾取弹药', mark: '弹' },
        { id: 'great_slash', cat: 'fight', name: '巨剑劈砍', mark: '剑' },
        { id: 'spin_kick', cat: 'fight', name: '旋风踢', mark: '旋' },
        { id: 'jump_atk', cat: 'fight', name: '跳跃攻击', mark: '跳' },
        { id: 'punch', cat: 'fight', name: '挥拳', mark: '拳' },
        { id: 'bow_shot', cat: 'fight', name: '射箭', mark: '箭' },
        { id: 'fallen', cat: 'fight', name: '阵亡', mark: '倒' },
        { id: 'pray', cat: 'perform', name: '祈祷', mark: '祈' },
        { id: 'bow', cat: 'perform', name: '鞠躬', mark: '鞠' },
        { id: 'sit_pose', cat: 'perform', name: '坐姿', mark: '坐' },
        { id: 'catwalk', cat: 'perform', name: '猫步向前行走', mark: '猫' },
        { id: 'glance', cat: 'perform', name: '转身回眸', mark: '眸' },
        { id: 'idle', cat: 'life', name: '站立等待', mark: '站' },
        { id: 'sit', cat: 'life', name: '坐下休息', mark: '息' },
        { id: 'talk', cat: 'life', name: '交谈说话', mark: '说' },
        { id: 'phone', cat: 'life', name: '低头看手机', mark: '机' },
        { id: 'walk', cat: 'move', name: '向前走', mark: '走' },
        { id: 'run', cat: 'move', name: '跑步', mark: '跑' },
        { id: 'jog', cat: 'move', name: '慢跑', mark: '慢跑' },
        { id: 'back', cat: 'move', name: '向后走', mark: '退' },
        { id: 'strafe', cat: 'move', name: '侧身平移', mark: '横' },
        { id: 'circle', cat: 'move', name: '绕场环绕', mark: '绕' }
    ];
    const ACTION_DISPLAY = {
        stand: '站立等待', walk: '向前走', talk: '交谈说话', fight: '挥拳', sit: '坐下休息',
        slash: '巨剑劈砍', block: '中段格挡', dodge: '飞身双脚踢', charge: '跳跃攻击',
        cheer: '祈祷', weep: '鞠躬', drink: '低头看手机',
        '站': '站立等待', '走': '向前走', '说': '交谈说话', '打': '挥拳', '坐': '坐下休息'
    };
    STAGE_ACTIONS.forEach(item => {
        ACTION_DISPLAY[item.id] = item.name;
        ACTION_DISPLAY[item.name] = item.name;
    });
    const POSE_PRESET_ITEMS = [
        { id: 'stand', name: '站立', pose: { head:{x:0,y:-0.12}, handL:{x:-0.05,y:0.02}, handR:{x:0.05,y:0.02}, footL:{x:-0.03,y:0.11}, footR:{x:0.03,y:0.11} } },
        { id: 'tpose', name: 'T型', pose: { head:{x:0,y:-0.12}, handL:{x:-0.14,y:-0.02}, handR:{x:0.14,y:-0.02}, footL:{x:-0.03,y:0.11}, footR:{x:0.03,y:0.11} } },
        { id: 'walk', name: '行走', pose: { head:{x:0,y:-0.11}, handL:{x:-0.06,y:0.04}, handR:{x:0.06,y:-0.03}, footL:{x:-0.02,y:0.12}, footR:{x:0.04,y:0.08} } },
        { id: 'run', name: '跑步', pose: { head:{x:0.01,y:-0.10}, handL:{x:-0.08,y:0.06}, handR:{x:0.09,y:-0.05}, footL:{x:-0.05,y:0.12}, footR:{x:0.07,y:0.06} } },
        { id: 'sit', name: '坐姿', pose: { head:{x:0,y:-0.07}, handL:{x:-0.06,y:0.05}, handR:{x:0.06,y:0.05}, footL:{x:-0.04,y:0.08}, footR:{x:0.04,y:0.08} } },
        { id: 'crouch', name: '蹲下', pose: { head:{x:0,y:-0.05}, handL:{x:-0.06,y:0.06}, handR:{x:0.06,y:0.06}, footL:{x:-0.05,y:0.10}, footR:{x:0.05,y:0.10} } },
        { id: 'kneel_l', name: '单膝跪', pose: { head:{x:0,y:-0.08}, handL:{x:-0.05,y:0.03}, handR:{x:0.05,y:0.03}, footL:{x:-0.03,y:0.11}, footR:{x:0.04,y:0.06} } },
        { id: 'kneel_both', name: '双膝跪', pose: { head:{x:0,y:-0.06}, handL:{x:-0.04,y:0.04}, handR:{x:0.04,y:0.04}, footL:{x:-0.03,y:0.08}, footR:{x:0.03,y:0.08} } },
        { id: 'lean', name: '倚靠', pose: { head:{x:0.03,y:-0.11}, handL:{x:-0.08,y:0.00}, handR:{x:0.07,y:0.04}, footL:{x:-0.02,y:0.11}, footR:{x:0.05,y:0.11} } },
        { id: 'bow', name: '鞠躬', pose: { head:{x:0,y:-0.04}, handL:{x:-0.04,y:0.06}, handR:{x:0.04,y:0.06}, footL:{x:-0.03,y:0.11}, footR:{x:0.03,y:0.11} } },
        { id: 'think', name: '思考', pose: { head:{x:0.02,y:-0.11}, handL:{x:-0.04,y:0.02}, handR:{x:0.05,y:-0.08}, footL:{x:-0.03,y:0.11}, footR:{x:0.03,y:0.11} } },
        { id: 'fight', name: '格斗', pose: { head:{x:0,y:-0.11}, handL:{x:-0.08,y:-0.04}, handR:{x:0.10,y:-0.02}, footL:{x:-0.05,y:0.11}, footR:{x:0.06,y:0.09} } },
        { id: 'kick', name: '踢球', pose: { head:{x:0,y:-0.10}, handL:{x:-0.07,y:0.01}, handR:{x:0.07,y:0.01}, footL:{x:-0.03,y:0.11}, footR:{x:0.10,y:0.04} } },
        { id: 'throw', name: '投掷', pose: { head:{x:0.02,y:-0.11}, handL:{x:-0.06,y:0.02}, handR:{x:0.12,y:-0.10}, footL:{x:-0.04,y:0.11}, footR:{x:0.05,y:0.10} } },
        { id: 'wave', name: '招手', pose: { head:{x:0,y:-0.12}, handL:{x:-0.05,y:0.02}, handR:{x:0.10,y:-0.12}, footL:{x:-0.03,y:0.11}, footR:{x:0.03,y:0.11} } },
        { id: 'push', name: '推进', pose: { head:{x:0.01,y:-0.11}, handL:{x:-0.08,y:-0.01}, handR:{x:0.08,y:-0.01}, footL:{x:-0.04,y:0.11}, footR:{x:0.05,y:0.10} } }
    ];
    const POSE_PRESETS = POSE_PRESET_ITEMS.map(item => item.id);
    // 槽位角色对任何接口通用；后端不认识的会降级进提示词和 images/videos/audios。
    const PURPOSES = ['reference', 'first_frame', 'last_frame', 'mask', 'background', 'character', 'scene', 'style', 'layout', 'composition', 'motion', 'custom'];
    const LEGACY_PURPOSE = {
        normal: 'reference',
        white_model: 'character',
        action: 'custom',
        creative: 'style'
    };

    function uid(prefix) {
        return `${prefix || 'wf'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function clampNum(value, min, max, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function purposeOf(value) {
        const raw = String(value || '').trim();
        if (PURPOSES.includes(raw)) return raw;
        return LEGACY_PURPOSE[raw] || 'reference';
    }

    function isKnownPurpose(value) {
        const raw = String(value || '').trim();
        return PURPOSES.includes(raw) || Object.prototype.hasOwnProperty.call(LEGACY_PURPOSE, raw);
    }

    function defaultRedo() {
        return { enabled: false, start: 0, end: 0, boxes: '', prompt: '', maskUrl: '', maskName: '' };
    }

    function defaultGreenscreen() {
        return { enabled: false, subjectUrl: '', subjectName: '', subjectKind: 'image', bgUrl: '', bgName: '' };
    }

    function defaultContinue() {
        return { enabled: false, useLastFrame: true };
    }

    function defaultAudioTrack(kind, index) {
        const k = AUDIO_TRACK_KINDS.includes(kind) ? kind : 'sfx';
        return {
            id: uid('aud'),
            kind: k,
            text: '',
            url: '',
            name: `${AUDIO_TRACK_LABELS[k] || k}-${(index || 0) + 1}`
        };
    }

    function normalizeAudioTrack(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const kind = AUDIO_TRACK_KINDS.includes(item.kind) ? item.kind : 'sfx';
        return {
            id: item.id || uid('aud'),
            kind,
            text: String(item.text || ''),
            url: String(item.url || ''),
            name: String(item.name || `${AUDIO_TRACK_LABELS[kind]}-${(index || 0) + 1}`)
        };
    }

    const ENGINE_SLOTS = ['video', 'image', 'upscale', 'matting', 'tts', 'llm', 'relight', 'redo'];
    const SLOT_LABELS = {
        video: '视频', image: '出图', upscale: '超分', matting: '抠像',
        tts: '配音', llm: '文案', relight: '光替', redo: '重拍'
    };
    function defaultEngine() {
        return { provider: '', model: '', baseUrl: '' };
    }
    function defaultEngines() {
        const out = {};
        ENGINE_SLOTS.forEach(slot => { out[slot] = defaultEngine(); });
        return out;
    }
    function normalizeEngine(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            provider: String(src.provider || ''),
            model: String(src.model || ''),
            baseUrl: String(src.baseUrl || src.base_url || '')
        };
    }
    function normalizeEngines(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const out = defaultEngines();
        ENGINE_SLOTS.forEach(slot => { out[slot] = normalizeEngine(src[slot]); });
        return out;
    }
    function engineOf(raw, slot) {
        const engines = normalizeEngines(raw && raw.engines ? raw.engines : raw);
        const key = ENGINE_SLOTS.includes(slot) ? slot : 'video';
        return engines[key] || defaultEngine();
    }
    function engineReady(raw, slot) {
        const eng = engineOf(raw, slot);
        return Boolean(String(eng.provider || '').trim());
    }
    function localEngineIds() {
        return ['comfyui', 'openai_local'];
    }
    function isLocalEngine(provider) {
        return localEngineIds().includes(String(provider || '').trim());
    }

    function defaultLimits(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            image: clampNum(src.image, 1, 64, LIMITS.image),
            video: clampNum(src.video, 1, 16, LIMITS.video),
            audio: clampNum(src.audio, 1, 16, LIMITS.audio)
        };
    }

    function normalizeFacing(value, fallback) {
        let n = Number(value);
        if (!Number.isFinite(n)) n = fallback || 0;
        n %= 360;
        if (n < 0) n += 360;
        return n;
    }

    function actionLabel(value) {
        const raw = String(value || '').trim();
        if (!raw) return '站立等待';
        if (ACTION_DISPLAY[raw]) return ACTION_DISPLAY[raw];
        const hit = STAGE_ACTIONS.find(item => item.id === raw || item.name === raw);
        return hit ? hit.name : raw;
    }

    function normalizeAction(value) {
        const raw = String(value || '').trim();
        if (!raw) return '站立等待';
        const hit = STAGE_ACTIONS.find(item => item.id === raw || item.name === raw);
        if (hit) return hit.name;
        if (ACTION_DISPLAY[raw]) return ACTION_DISPLAY[raw];
        if (ACTION_TAGS.includes(raw)) return ACTION_DISPLAY[raw] || raw;
        if (ACTION_ALIAS[raw]) return ACTION_DISPLAY[ACTION_ALIAS[raw]] || raw;
        return raw;
    }

    function defaultPose() {
        return {
            head: { x: 0, y: -0.12 },
            handL: { x: -0.14, y: -0.02 },
            handR: { x: 0.14, y: -0.02 },
            footL: { x: -0.03, y: 0.11 },
            footR: { x: 0.03, y: 0.11 }
        };
    }

    function posePresetOf(value) {
        const raw = String(value || '').trim();
        if (POSE_PRESETS.includes(raw)) return raw;
        const hit = POSE_PRESET_ITEMS.find(item => item.name === raw);
        return hit ? hit.id : 'tpose';
    }

    function applyPosePreset(actor, presetId) {
        const id = posePresetOf(presetId);
        const hit = POSE_PRESET_ITEMS.find(item => item.id === id) || POSE_PRESET_ITEMS[1];
        actor.pose = normalizePose(hit.pose);
        actor.posePreset = hit.id;
        actor.poseManual = actor.poseManual !== false;
        return actor;
    }

    function camKindOf(value) {
        const raw = String(value || '').trim();
        if (CAMERA_PRESETS.includes(raw)) return raw;
        if (CAM_PRESET_ALIAS[raw]) return CAM_PRESET_ALIAS[raw];
        return 'front_mid';
    }

    function moveOf(value) {
        const raw = String(value || '').trim();
        if (CAMERA_MOVES.includes(raw)) return raw;
        if (Object.prototype.hasOwnProperty.call(CAMERA_MOVE_ALIAS, raw)) return CAMERA_MOVE_ALIAS[raw];
        return '';
    }

    function aspectOf(value) {
        const raw = String(value || '').trim();
        return ASPECTS.includes(raw) ? raw : '21:9';
    }

    function viewModeOf(value) {
        return String(value || '').trim() === '2d' ? '2d' : '3d';
    }

    function defaultViewOrbit() {
        return { theta: 0.42, phi: 1.02, radius: 16, tx: 0, ty: 0.9, tz: 0.6 };
    }

    function normalizeViewOrbit(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const fb = defaultViewOrbit();
        return {
            theta: clampNum(src.theta, -Math.PI * 4, Math.PI * 4, fb.theta),
            phi: clampNum(src.phi, 0.18, 1.42, fb.phi),
            radius: clampNum(src.radius, 4, 42, fb.radius),
            tx: clampNum(src.tx, -20, 20, fb.tx),
            ty: clampNum(src.ty, -2, 12, fb.ty),
            tz: clampNum(src.tz, -20, 20, fb.tz)
        };
    }

    function cameraAltOf(kind, value) {
        const n = Number(value);
        if (Number.isFinite(n)) return clampNum(n, 0.15, 12, 1.5);
        const table = {
            current: 1.6, front_mid: 1.5, front_close: 1.35, front_full: 1.7,
            side_follow: 1.5, side_close: 1.4, back_mid: 1.5,
            top_full: 4.4, top45: 3.3, low_up: 0.42, low_wide: 0.38,
            over_l: 1.55, over_r: 1.55, bird: 6.8, dutch: 1.45
        };
        return table[camKindOf(kind)] || 1.5;
    }

    function canvasSize(aspect) {
        const key = aspectOf(aspect);
        if (key === '9:16') return { w: 450, h: 800 };
        if (key === '16:9') return { w: 960, h: 540 };
        return { w: 1050, h: 450 };
    }

    function layoutSize(aspect) {
        const key = aspectOf(aspect);
        if (key === '9:16') return { w: 720, h: 1280 };
        if (key === '16:9') return { w: 1280, h: 720 };
        return { w: 1680, h: 720 };
    }

    function defaultScene() {
        return {
            bgMode: 'color',
            bgColor: '#060608',
            bgUrl: '',
            scale: 1,
            tx: 0,
            ty: 0,
            tz: 0,
            rx: 0,
            ry: 0,
            rz: 0
        };
    }

    function defaultCamera(index) {
        const i = Number.isFinite(index) ? index : 0;
        return { id: uid('cam'), name: `机位${i + 1}`, x: 0.5, y: 0.82, facing: 0, kind: 'front_mid', alt: 1.5 };
    }

    function defaultStage() {
        const camera = defaultCamera(0);
        return {
            actors: [],
            cameras: [camera],
            camera,
            cameraMove: '',
            libraryTab: 'object',
            inspectorTab: 'attr',
            aspect: '21:9',
            viewMode: '3d',
            viewOrbit: defaultViewOrbit(),
            actionCat: 'all',
            tool: 'select',
            fps: 30,
            frame: 0,
            duration: 90,
            tlZoom: 1,
            keyframes: [],
            scene: defaultScene(),
            layoutUrl: ''
        };
    }

    function normalizePose(raw) {
        const fallback = defaultPose();
        const item = raw && typeof raw === 'object' ? raw : {};
        const pt = (value, fb) => ({
            x: clampNum(value && value.x, -0.35, 0.35, fb.x),
            y: clampNum(value && value.y, -0.35, 0.35, fb.y)
        });
        return {
            head: pt(item.head, fallback.head),
            handL: pt(item.handL, fallback.handL),
            handR: pt(item.handR, fallback.handR),
            footL: pt(item.footL, fallback.footL),
            footR: pt(item.footR, fallback.footR)
        };
    }

    function normalizePath(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.slice(0, 32).map(pt => ({
            x: clampNum(pt && pt.x, 0, 1, 0.5),
            y: clampNum(pt && pt.y, 0, 1, 0.5)
        }));
    }

    function normalizeScene(raw) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const fallback = defaultScene();
        return {
            bgMode: item.bgMode === 'image' ? 'image' : 'color',
            bgColor: String(item.bgColor || fallback.bgColor),
            bgUrl: String(item.bgUrl || ''),
            scale: clampNum(item.scale, 0.2, 4, fallback.scale),
            tx: clampNum(item.tx, -1, 1, 0),
            ty: clampNum(item.ty, -1, 1, 0),
            tz: clampNum(item.tz, -1, 1, 0),
            rx: clampNum(item.rx, -180, 180, 0),
            ry: clampNum(item.ry, -180, 180, 0),
            rz: clampNum(item.rz, -180, 180, 0)
        };
    }

    function normalizeCamera(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const fallback = defaultCamera(index || 0);
        const kind = camKindOf(item.kind || fallback.kind);
        return {
            id: item.id || fallback.id,
            name: String(item.name || fallback.name),
            x: clampNum(item.x, 0, 1, fallback.x),
            y: clampNum(item.y, 0, 1, fallback.y),
            facing: normalizeFacing(item.facing, fallback.facing),
            kind,
            alt: cameraAltOf(kind, item.alt)
        };
    }

    function normalizeCameras(stageSrc) {
        const src = stageSrc && typeof stageSrc === 'object' ? stageSrc : {};
        if (Array.isArray(src.cameras) && src.cameras.length) {
            return src.cameras.map((item, i) => normalizeCamera(item, i));
        }
        return [normalizeCamera(src.camera, 0)];
    }

    function nextCameraName(cameras) {
        const used = new Set((cameras || []).map(item => String(item.name || '').trim()));
        let i = 1;
        while (used.has(`机位${i}`)) i += 1;
        return `机位${i}`;
    }

    function cameraById(stage, id) {
        const cameras = stage?.cameras || [];
        if (id && id !== 'camera') {
            const hit = cameras.find(item => item.id === id);
            if (hit) return hit;
        }
        return cameras[0] || stage?.camera || defaultCamera(0);
    }

    function isCameraId(stage, id) {
        const raw = String(id || '');
        if (!raw) return false;
        if (raw === 'camera') return true;
        return (stage?.cameras || []).some(item => item.id === raw);
    }

    function syncPrimaryCamera(stage) {
        if (!stage) return stage;
        const cameras = normalizeCameras(stage);
        stage.cameras = cameras;
        stage.camera = cameras[0] || defaultCamera(0);
        return stage;
    }

    function applyPresetToCamera(stage, name, camId) {
        const cameras = normalizeCameras(stage);
        stage.cameras = cameras;
        const cam = cameraById(stage, camId);
        Object.assign(cam, cameraPreset(name, stage.actors || [], cam));
        syncPrimaryCamera(stage);
        return cam;
    }

    function addCamera(stage) {
        const cameras = normalizeCameras(stage);
        const next = defaultCamera(cameras.length);
        next.name = nextCameraName(cameras);
        next.x = clampNum(0.62 + (cameras.length % 3) * 0.1, 0, 1, 0.7);
        next.y = clampNum(0.78 - Math.floor(cameras.length / 3) * 0.08, 0, 1, 0.78);
        cameras.push(next);
        stage.cameras = cameras;
        stage.camera = cameras[0];
        return next;
    }

    function removeCamera(stage, id) {
        let cameras = normalizeCameras(stage).filter(item => item.id !== id);
        if (!cameras.length) cameras = [defaultCamera(0)];
        stage.cameras = cameras;
        stage.camera = cameras[0];
        return cameras[0];
    }

    function lerp(a, b, t) {
        return Number(a || 0) + (Number(b || 0) - Number(a || 0)) * t;
    }

    function lerpFacing(a, b, t) {
        let d = normalizeFacing(b, 0) - normalizeFacing(a, 0);
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        return normalizeFacing(Number(a || 0) + d * t, 0);
    }

    function lerpPose(a, b, t) {
        const left = normalizePose(a);
        const right = normalizePose(b);
        const out = {};
        POSE_KEYS.forEach(key => {
            out[key] = {
                x: lerp(left[key].x, right[key].x, t),
                y: lerp(left[key].y, right[key].y, t)
            };
        });
        return out;
    }

    function poseMoved(pose) {
        const now = normalizePose(pose);
        const base = defaultPose();
        return POSE_KEYS.some(key =>
            Math.abs(now[key].x - base[key].x) > 0.004 ||
            Math.abs(now[key].y - base[key].y) > 0.004
        );
    }

    function cameraMoveLabel(value) {
        const key = moveOf(value);
        return CAMERA_MOVE_LABELS[key] || '固定镜头';
    }

    function camPresetLabel(value) {
        const key = camKindOf(value);
        return CAM_PRESET_LABELS[key] || '正面中景';
    }

    function pickKeyframeBody(kf, actor) {
        const src = kf && typeof kf === 'object' ? kf : {};
        return {
            x: clampNum(src.x, 0, 1, actor?.x ?? 0.5),
            y: clampNum(src.y, 0, 1, actor?.y ?? 0.5),
            alt: clampNum(src.alt, 0, 8, actor?.alt ?? 0),
            facing: normalizeFacing(src.facing, actor?.facing || 0),
            action: normalizeAction(src.action || actor?.action),
            scale: clampNum(src.scale, 0.4, 2.4, actor?.scale ?? 1),
            pose: normalizePose(src.pose || actor?.pose),
            posePreset: posePresetOf(src.posePreset || actor?.posePreset),
            bodyPitch: clampNum(src.bodyPitch, -1, 1, actor?.bodyPitch ?? 0),
            bodyYaw: clampNum(src.bodyYaw, -1, 1, actor?.bodyYaw ?? 0),
            bodyRoll: clampNum(src.bodyRoll, -1, 1, actor?.bodyRoll ?? 0),
            headPitch: clampNum(src.headPitch, -1, 1, actor?.headPitch ?? 0),
            headYaw: clampNum(src.headYaw, -1, 1, actor?.headYaw ?? 0)
        };
    }

    function actorAtFrame(stage, actor, frame) {
        const item = actor && typeof actor === 'object' ? actor : {};
        const kfs = (stage?.keyframes || [])
            .filter(kf => kf.actorId === item.id)
            .sort((a, b) => a.frame - b.frame);
        if (!kfs.length) return item;
        const f = Math.round(clampNum(frame, 0, 3600, stage?.frame || 0));
        if (f <= kfs[0].frame) return { ...item, ...pickKeyframeBody(kfs[0], item) };
        const last = kfs[kfs.length - 1];
        if (f >= last.frame) return { ...item, ...pickKeyframeBody(last, item) };
        let i = 0;
        while (i < kfs.length - 1 && kfs[i + 1].frame < f) i += 1;
        const a = kfs[i];
        const b = kfs[i + 1];
        const t = (f - a.frame) / Math.max(1, b.frame - a.frame);
        const left = pickKeyframeBody(a, item);
        const right = pickKeyframeBody(b, item);
        return {
            ...item,
            x: lerp(left.x, right.x, t),
            y: lerp(left.y, right.y, t),
            alt: lerp(left.alt, right.alt, t),
            facing: lerpFacing(left.facing, right.facing, t),
            scale: lerp(left.scale, right.scale, t),
            action: t < 1 ? left.action : right.action,
            pose: lerpPose(left.pose, right.pose, t),
            bodyPitch: lerp(left.bodyPitch, right.bodyPitch, t),
            bodyYaw: lerp(left.bodyYaw, right.bodyYaw, t),
            bodyRoll: lerp(left.bodyRoll, right.bodyRoll, t),
            headPitch: lerp(left.headPitch, right.headPitch, t),
            headYaw: lerp(left.headYaw, right.headYaw, t)
        };
    }

    function previewStage(stage, frame) {
        const src = normalizeStage(stage);
        /* A stage cannot preview beyond its declared output duration.  Keep
           keyframes outside that range in the stored workflow (so extending
           the duration later does not destroy them), but clamp the live
           preview cursor to the playable interval. */
        const f = Math.round(clampNum(frame, 0, src.duration, src.frame));
        src.frame = f;
        src.actors = (src.actors || []).map(actor => actorAtFrame(src, actor, f));
        return src;
    }

    function snapshotStage(stage) {
        return JSON.parse(JSON.stringify(normalizeStage(stage)));
    }

    function nextActorSlot(actors) {
        const i = Array.isArray(actors) ? actors.length : 0;
        return {
            x: clampNum(0.22 + (i % 4) * 0.18, 0, 1, 0.5),
            y: clampNum(0.42 + Math.floor(i / 4) * 0.16, 0, 1, 0.5)
        };
    }

    function round2(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.round(n * 100) / 100;
    }

    function cameraPreset(name, actors, current) {
        const kind = camKindOf(name);
        if (kind === 'current' && current) {
            return {
                x: round2(clampNum(current.x, 0, 1, 0.5), 0.5),
                y: round2(clampNum(current.y, 0, 1, 0.82), 0.82),
                facing: normalizeFacing(current.facing, 0),
                kind,
                alt: cameraAltOf(kind, current.alt)
            };
        }
        const list = Array.isArray(actors) ? actors : [];
        const cx = list.length
            ? list.reduce((sum, actor) => sum + Number(actor.x || 0), 0) / list.length
            : 0.5;
        const cy = list.length
            ? list.reduce((sum, actor) => sum + Number(actor.y || 0), 0) / list.length
            : 0.5;
        const table = {
            front_mid: { x: cx, y: cy + 0.32, facing: 0 },
            front_close: { x: cx, y: cy + 0.20, facing: 0 },
            front_full: { x: cx, y: cy + 0.40, facing: 0 },
            side_follow: { x: cx + 0.30, y: cy, facing: 270 },
            side_close: { x: cx + 0.22, y: cy + 0.08, facing: 270 },
            back_mid: { x: cx, y: cy - 0.28, facing: 180 },
            top_full: { x: cx, y: cy - 0.32, facing: 180 },
            top45: { x: cx - 0.22, y: cy - 0.22, facing: 135 },
            low_up: { x: cx, y: cy + 0.36, facing: 0 },
            low_wide: { x: cx, y: cy + 0.42, facing: 0 },
            over_l: { x: cx - 0.18, y: cy + 0.18, facing: 20 },
            over_r: { x: cx + 0.18, y: cy + 0.18, facing: 340 },
            bird: { x: cx, y: cy - 0.40, facing: 180 },
            dutch: { x: cx + 0.12, y: cy + 0.24, facing: 25 }
        };
        const hit = table[kind] || table.front_mid;
        return {
            x: round2(clampNum(hit.x, 0, 1, 0.5), 0.5),
            y: round2(clampNum(hit.y, 0, 1, 0.5), 0.5),
            facing: normalizeFacing(hit.facing, 0),
            kind,
            alt: cameraAltOf(kind)
        };
    }

    function nextActorName(actors) {
        const used = new Set((actors || []).map(item => String(item.name || '').trim()));
        let i = 1;
        while (used.has(`角色${i}`)) i += 1;
        return `角色${i}`;
    }

    function normalizeRef(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const kind = MEDIA_KINDS.includes(item.kind) ? item.kind : 'image';
        const rawPurpose = String(item.purposeRaw || item.purpose || item.role || '').trim();
        const normalizedPurpose = purposeOf(rawPurpose);
        return {
            id: item.id || uid('ref'),
            kind,
            // Keep extension/provider-specific purposes alongside the compact
            // UI value so the adapter can expose them instead of silently
            // collapsing them to a generic reference.
            purpose: normalizedPurpose,
            ...(rawPurpose && !isKnownPurpose(rawPurpose) ? { purposeRaw: rawPurpose } : {}),
            url: String(item.url || ''),
            name: String(item.name || `${kind}-${(index || 0) + 1}`),
            notes: String(item.notes || '')
        };
    }

    function normalizeSegment(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const start = clampNum(item.start, 0, 3600, index || 0);
        const end = clampNum(item.end, start, 3600, start + 5);
        return {
            id: item.id || uid('seg'),
            start,
            end,
            text: String(item.text || '')
        };
    }

    function normalizeAsset(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        /* Asset cards come from two surfaces: the workflow editor uses
           `kind`, while canvas/director integrations historically exposed
           `assetKind`.  Normalize both spellings so a scene/prop card keeps
           its identity when it crosses the panel boundary. */
        const rawKind = String(item.kind || item.assetKind || '').trim();
        const normalizedKind = rawKind.toLowerCase();
        const kind = ASSET_KINDS.includes(normalizedKind) ? normalizedKind : 'character';
        const primitive = PRIMITIVE_IDS.includes(item.primitive) ? item.primitive : '';
        const material = MATERIAL_IDS.includes(item.material) ? item.material : 'matte';
        return {
            id: item.id || uid('asset'),
            kind,
            name: String(item.name || `asset-${(index || 0) + 1}`),
            notes: String(item.notes || ''),
            url: String(item.url || ''),
            panorama: Boolean(item.panorama) || kind === 'panorama',
            /* Keep optional prop appearance fields when supplied by a
               connector.  They are harmless for other asset kinds and let
               actorFromAsset preserve a prop's primitive/material instead of
               silently turning it into a mannequin. */
            ...(primitive ? { primitive } : {}),
            ...(material ? { material } : {})
        };
    }

    function normalizeKeyframe(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        return {
            id: item.id || uid('kf'),
            frame: Math.round(clampNum(item.frame, 0, 3600, index || 0)),
            actorId: String(item.actorId || ''),
            x: clampNum(item.x, 0, 1, 0.5),
            y: clampNum(item.y, 0, 1, 0.5),
            alt: clampNum(item.alt, 0, 8, 0),
            facing: normalizeFacing(item.facing, 0),
            action: normalizeAction(item.action),
            scale: clampNum(item.scale, 0.4, 2.4, 1),
            pose: normalizePose(item.pose),
            posePreset: posePresetOf(item.posePreset),
            bodyPitch: clampNum(item.bodyPitch, -1, 1, 0),
            bodyYaw: clampNum(item.bodyYaw, -1, 1, 0),
            bodyRoll: clampNum(item.bodyRoll, -1, 1, 0),
            headPitch: clampNum(item.headPitch, -1, 1, 0),
            headYaw: clampNum(item.headYaw, -1, 1, 0)
        };
    }

    function normalizeActor(actor, i) {
        const item = actor && typeof actor === 'object' ? actor : {};
        const slot = nextActorSlot(Array.from({ length: i }));
        return {
            id: item.id || uid('act'),
            name: String(item.name || `角色${i + 1}`),
            x: clampNum(item.x, 0, 1, slot.x),
            y: clampNum(item.y, 0, 1, slot.y),
            alt: clampNum(item.alt, 0, 8, 0),
            facing: normalizeFacing(item.facing, 0),
            action: normalizeAction(item.action),
            scale: clampNum(item.scale, 0.4, 2.4, 1),
            pose: normalizePose(item.pose),
            posePreset: posePresetOf(item.posePreset),
            poseManual: item.poseManual !== false,
            bodyPitch: clampNum(item.bodyPitch, -1, 1, 0),
            bodyYaw: clampNum(item.bodyYaw, -1, 1, 0),
            bodyRoll: clampNum(item.bodyRoll, -1, 1, 0),
            headPitch: clampNum(item.headPitch, -1, 1, 0),
            headYaw: clampNum(item.headYaw, -1, 1, 0),
            path: normalizePath(item.path),
            assetId: String(item.assetId || ''),
            url: String(item.url || ''),
            kind: String(item.kind || '').trim().toLowerCase() === 'prop' || PRIMITIVE_IDS.includes(item.primitive) ? 'prop' : 'character',
            primitive: PRIMITIVE_IDS.includes(item.primitive) ? item.primitive : '',
            material: MATERIAL_IDS.includes(item.material) ? item.material : 'matte'
        };
    }

    function actorFromAsset(asset, actors) {
        const list = Array.isArray(actors) ? actors : [];
        const item = asset && typeof asset === 'object' ? asset : {};
        const slot = nextActorSlot(list);
        const name = String(item.name || '').trim() || nextActorName(list);
        const rawKind = String(item.kind || item.assetKind || '').trim().toLowerCase();
        const primitive = PRIMITIVE_IDS.includes(item.primitive) ? item.primitive : '';
        const kind = rawKind === 'prop' || primitive ? 'prop' : 'character';
        return normalizeActor({
            id: uid('act'),
            name,
            x: slot.x,
            y: slot.y,
            facing: 0,
            action: 'stand',
            scale: 1,
            pose: defaultPose(),
            assetId: item.id || '',
            url: item.url || '',
            kind,
            primitive,
            material: MATERIAL_IDS.includes(item.material) ? item.material : 'matte'
        }, list.length);
    }

    function emptyWorkflow() {
        return {
            extraRefs: [],
            segments: [],
            redo: defaultRedo(),
            greenscreen: defaultGreenscreen(),
            continuePrev: defaultContinue(),
            assets: [],
            audioTracks: [],
            refLimits: defaultLimits(),
            stage: defaultStage(),
            engines: defaultEngines(),
            audioSplit: false,
            analyze: ''
        };
    }

    function normalize(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const redoSrc = src.redo && typeof src.redo === 'object' ? src.redo : {};
        const greenSrc = src.greenscreen && typeof src.greenscreen === 'object' ? src.greenscreen : {};
        const contSrc = src.continuePrev && typeof src.continuePrev === 'object' ? src.continuePrev : {};
        const stageSrc = src.stage && typeof src.stage === 'object' ? src.stage : {};
        const redoEnd = clampNum(redoSrc.end, 0, 3600, Number(redoSrc.start) || 0);
        const redoStart = clampNum(redoSrc.start, 0, 3600, 0);
        return {
            extraRefs: Array.isArray(src.extraRefs) ? src.extraRefs.map(normalizeRef) : [],
            segments: Array.isArray(src.segments) ? src.segments.map(normalizeSegment) : [],
            redo: {
                enabled: Boolean(redoSrc.enabled),
                start: redoStart,
                end: Math.max(redoStart, redoEnd),
                boxes: String(redoSrc.boxes || ''),
                prompt: String(redoSrc.prompt || ''),
                maskUrl: String(redoSrc.maskUrl || ''),
                maskName: String(redoSrc.maskName || '')
            },
            greenscreen: {
                enabled: Boolean(greenSrc.enabled),
                subjectUrl: String(greenSrc.subjectUrl || ''),
                subjectName: String(greenSrc.subjectName || ''),
                subjectKind: MEDIA_KINDS.includes(greenSrc.subjectKind) ? greenSrc.subjectKind : 'image',
                bgUrl: String(greenSrc.bgUrl || ''),
                bgName: String(greenSrc.bgName || '')
            },
            continuePrev: {
                enabled: Boolean(contSrc.enabled),
                useLastFrame: contSrc.useLastFrame !== false
            },
            assets: Array.isArray(src.assets) ? src.assets.map(normalizeAsset) : [],
            audioTracks: Array.isArray(src.audioTracks) ? src.audioTracks.map(normalizeAudioTrack) : [],
            refLimits: defaultLimits(src.refLimits),
            stage: normalizeStage(stageSrc),
            engines: normalizeEngines(src.engines),
            audioSplit: Boolean(src.audioSplit),
            analyze: src.analyze === 'breakdown' || src.analyze === 'parse' ? src.analyze : ''
        };
    }

    function tabOf(value) {
        const raw = String(value || '').trim();
        if (STAGE_TABS.includes(raw)) return raw;
        if (raw === 'actors') return 'actor';
        return 'object';
    }

    function normalizeStage(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const cameras = normalizeCameras(src);
        const duration = Math.round(clampNum(src.duration, 1, 3600, 90));
        return {
            actors: Array.isArray(src.actors) ? src.actors.map(normalizeActor) : [],
            cameras,
            camera: cameras[0] || defaultCamera(0),
            cameraMove: moveOf(src.cameraMove),
            libraryTab: tabOf(src.libraryTab),
            inspectorTab: INSPECTOR_TABS.includes(src.inspectorTab) ? src.inspectorTab : 'attr',
            aspect: aspectOf(src.aspect),
            viewMode: viewModeOf(src.viewMode),
            viewOrbit: normalizeViewOrbit(src.viewOrbit),
            actionCat: ACTION_CATS.includes(src.actionCat) ? src.actionCat : 'all',
            tool: STAGE_TOOLS.includes(src.tool) ? src.tool : 'select',
            fps: Math.round(clampNum(src.fps, 1, 60, 30)),
            frame: Math.round(clampNum(src.frame, 0, duration, 0)),
            duration,
            tlZoom: clampNum(src.tlZoom, 0.5, 4, 1),
            keyframes: Array.isArray(src.keyframes) ? src.keyframes.map(normalizeKeyframe) : [],
            scene: normalizeScene(src.scene),
            layoutUrl: String(src.layoutUrl || '')
        };
    }

    function stageHasContent(raw) {
        const stage = normalizeStage(raw);
        const baseline = defaultStage();
        const cameraChanged = (stage.cameras || []).length > 1 || (() => {
            const a = stage.cameras?.[0];
            const b = baseline.cameras?.[0];
            if (!a || !b) return Boolean(a || b);
            return String(a.name || '') !== String(b.name || '') ||
                String(a.kind || '') !== String(b.kind || '') ||
                ['x', 'y', 'facing', 'alt'].some(key => Math.abs(Number(a[key] || 0) - Number(b[key] || 0)) > 0.0001);
        })();
        const sceneChanged = JSON.stringify(stage.scene) !== JSON.stringify(baseline.scene);
        return Boolean(
            stage.actors.length ||
            cameraChanged ||
            stage.layoutUrl ||
            stage.keyframes.length ||
            stage.cameraMove ||
            sceneChanged ||
            stage.aspect !== baseline.aspect ||
            stage.viewMode !== baseline.viewMode ||
            stage.fps !== baseline.fps ||
            stage.duration !== baseline.duration ||
            stage.frame !== baseline.frame ||
            stage.tlZoom !== baseline.tlZoom
        );
    }

    function hasContent(raw) {
        const wf = normalize(raw);
        return Boolean(
            wf.extraRefs.some(item => item.url) ||
            wf.segments.some(item => String(item.text || '').trim()) ||
            wf.redo.enabled ||
            wf.greenscreen.enabled ||
            wf.continuePrev.enabled ||
            wf.assets.some(item => item.url || String(item.name || '').trim()) ||
            (wf.audioTracks || []).some(item => item.url || String(item.text || '').trim()) ||
            wf.audioSplit ||
            Boolean(wf.analyze) ||
            stageHasContent(wf.stage)
        );
    }

    function fromHost(host) {
        if (!host || typeof host !== 'object') return emptyWorkflow();
        if (host.videoWorkflow) return normalize(host.videoWorkflow);
        if (host.runSettings?.videoWorkflow) return normalize(host.runSettings.videoWorkflow);
        return normalize({
            extraRefs: host.wfRefs,
            segments: host.wfSegments,
            redo: {
                enabled: host.wfRedoEnabled,
                start: host.wfRedoIn,
                end: host.wfRedoOut,
                boxes: host.wfRedoBoxes,
                prompt: host.wfRedoPrompt,
                maskUrl: host.wfRedoMask,
                maskName: host.wfRedoMaskName
            },
            greenscreen: {
                enabled: host.wfGreenscreen,
                subjectUrl: host.wfGreenscreenSubject,
                subjectName: host.wfGreenscreenSubjectName,
                subjectKind: host.wfGreenscreenSubjectKind,
                bgUrl: host.wfGreenscreenBg,
                bgName: host.wfGreenscreenBgName
            },
            continuePrev: {
                enabled: host.wfContinuePrev,
                useLastFrame: host.wfUseLastFrame
            },
            assets: host.wfAssets,
            audioTracks: host.wfAudioTracks || host.videoWorkflow?.audioTracks,
            refLimits: host.wfRefLimits,
            stage: host.ltxStage || host.wfStage,
            engines: host.wfEngines || host.videoWorkflow?.engines,
            audioSplit: host.wfAudioSplit || host.videoWorkflow?.audioSplit,
            analyze: host.wfAnalyze || host.videoWorkflow?.analyze
        });
    }

    function writeHost(host, workflow, nestedKey) {
        if (!host || typeof host !== 'object') return host;
        const next = normalize(workflow);
        if (nestedKey === 'runSettings') {
            host.runSettings = host.runSettings || {};
            host.runSettings.videoWorkflow = next;
            return host;
        }
        host.videoWorkflow = next;
        return host;
    }

    root.VideoWorkflowSchema = {
        LIMITS,
        PURPOSES,
        ASSET_KINDS,
        AUDIO_TRACK_KINDS,
        AUDIO_TRACK_LABELS,
        ACTION_TAGS,
        ACTION_CATS,
        STAGE_TABS,
        STAGE_TOOLS,
        STAGE_ACTIONS,
        CAMERA_PRESETS,
        CAMERA_PRESET_ITEMS,
        CAMERA_MOVES,
        CAMERA_MOVE_ITEMS,
        CAMERA_MOVE_LABELS,
        CAM_PRESET_LABELS,
        POSE_KEYS,
        POSE_LABELS,
        POSE_PRESETS,
        POSE_PRESET_ITEMS,
        INSPECTOR_TABS,
        INSPECTOR_LABELS,
        ASPECTS,
        TAB_LABELS,
        TOOL_LABELS,
        MEDIA_KINDS,
        PROP_PRIMITIVES,
        MATERIAL_ITEMS,
        ENGINE_SLOTS,
        SLOT_LABELS,
        defaultEngine,
        defaultEngines,
        normalizeEngine,
        normalizeEngines,
        engineOf,
        engineReady,
        localEngineIds,
        isLocalEngine,
        uid,
        emptyWorkflow,
        normalize,
        hasContent,
        stageHasContent,
        fromHost,
        writeHost,
        defaultLimits,
        defaultRedo,
        defaultGreenscreen,
        defaultContinue,
        defaultAudioTrack,
        normalizeAudioTrack,
        defaultStage,
        defaultCamera,
        defaultPose,
        defaultScene,
        nextActorSlot,
        nextActorName,
        nextCameraName,
        actorFromAsset,
        cameraPreset,
        cameraById,
        isCameraId,
        syncPrimaryCamera,
        applyPresetToCamera,
        addCamera,
        removeCamera,
        cameraMoveLabel,
        camPresetLabel,
        camKindOf,
        moveOf,
        aspectOf,
        viewModeOf,
        defaultViewOrbit,
        normalizeViewOrbit,
        cameraAltOf,
        canvasSize,
        layoutSize,
        posePresetOf,
        applyPosePreset,
        poseMoved,
        actorAtFrame,
        previewStage,
        snapshotStage,
        normalizeFacing,
        normalizeAction,
        normalizeKeyframe,
        normalizeActor,
        normalizeCamera,
        normalizeStage,
        actionLabel,
        purposeOf,
        isKnownPurpose
    };
})(window);
