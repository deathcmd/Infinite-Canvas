// 片场 3D 导演台：与 2D 共用站位数据。粉模 / 机位 / 姿势点，不绑生成接口。
import * as THREE from '/static/vendor/js/three-0.160.0.module.js?v=2026.08.30.xyq2';

const PINK = 0xf472b6;
const PINK_SEL = 0xfda4af;
const CAM_ORANGE = 0xfb923c;
const POSE_WHITE = 0xf8fafc;
const DEG = Math.PI / 180;
const POSE_KEYS = ['head', 'handL', 'handR', 'footL', 'footR'];

function clamp(n, min, max, fallback) {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
}

function floorSize(aspect) {
    if (aspect === '9:16') return { w: 8, d: 14.2 };
    if (aspect === '16:9') return { w: 16, d: 9 };
    return { w: 21, d: 9 };
}

function toWorld(nx, ny, alt, floor) {
    return new THREE.Vector3(
        (clamp(nx, 0, 1, 0.5) - 0.5) * floor.w,
        clamp(alt, 0, 8, 0),
        (clamp(ny, 0, 1, 0.5) - 0.5) * floor.d
    );
}

function toNorm(x, z, floor) {
    return {
        nx: clamp(x / Math.max(0.01, floor.w) + 0.5, 0, 1, 0.5),
        ny: clamp(z / Math.max(0.01, floor.d) + 0.5, 0, 1, 0.5)
    };
}

function facingDir(facing) {
    const rad = Number(facing || 0) * DEG;
    return new THREE.Vector3(Math.sin(rad), 0, -Math.cos(rad));
}

function poseLocal(actor, key) {
    const pt = (actor && actor.pose && actor.pose[key]) || { x: 0, y: 0 };
    return new THREE.Vector3(
        Number(pt.x || 0) * 1.55,
        0.9 - Number(pt.y || 0) * 4.6,
        0.12
    );
}

function camAlt(cam, schema) {
    if (schema?.cameraAltOf) return schema.cameraAltOf(cam?.kind, cam?.alt);
    const n = Number(cam?.alt);
    if (Number.isFinite(n)) return clamp(n, 0.15, 12, 1.5);
    return 1.5;
}

function makeLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(196, 181, 253, 0.95)';
    g.beginPath();
    g.roundRect(40, 12, 176, 40, 14);
    g.fill();
    g.fillStyle = color || '#5b21b6';
    g.font = '700 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(text || '').slice(0, 14), 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false
    }));
    sprite.scale.set(1.7, 0.42, 1);
    sprite.userData.canvas = canvas;
    sprite.userData.tex = tex;
    sprite.userData.color = color || '#fda4af';
    sprite.center.set(0.5, 0);
    return sprite;
}

function setLabel(sprite, text, color) {
    if (!sprite) return;
    const canvas = sprite.userData.canvas;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(196, 181, 253, 0.95)';
    g.beginPath();
    g.roundRect(40, 12, 176, 40, 14);
    g.fill();
    g.fillStyle = color || sprite.userData.color || '#5b21b6';
    g.font = '700 26px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(text || '').slice(0, 14), 128, 32);
    sprite.userData.tex.needsUpdate = true;
}

function mannequinMat(selected) {
    return new THREE.MeshStandardMaterial({
        color: selected ? PINK_SEL : PINK,
        roughness: 0.42,
        metalness: 0.04,
        emissive: selected ? 0x4c1d3d : 0x2a0818,
        emissiveIntensity: selected ? 0.35 : 0.12
    });
}

function materialOf(actor, selected) {
    const id = actor && actor.material || 'matte';
    const specs = {
        matte: { roughness: 0.92, metalness: 0.02 },
        plastic: { roughness: 0.38, metalness: 0.08 },
        metal: { roughness: 0.18, metalness: 0.86 },
        glass: { roughness: 0.06, metalness: 0.12, transparent: true, opacity: 0.42 },
        fabric: { roughness: 0.88, metalness: 0 },
        skin: { roughness: 0.55, metalness: 0.04 }
    };
    const spec = specs[id] || specs.matte;
    const isProp = actor && (actor.kind === 'prop' || actor.primitive);
    const color = selected ? PINK_SEL : (isProp ? 0x38bdf8 : PINK);
    return new THREE.MeshStandardMaterial({
        color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        transparent: Boolean(spec.transparent),
        opacity: spec.opacity == null ? 1 : spec.opacity,
        emissive: selected ? 0x4c1d3d : 0x2a0818,
        emissiveIntensity: selected ? 0.28 : 0.08
    });
}

function buildPrimitive(kind) {
    const g = new THREE.Group();
    const mat = materialOf({ kind: 'prop', material: 'matte' }, false);
    let mesh;
    if (kind === 'sphere') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), mat);
    else if (kind === 'plane') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.85), mat);
    else if (kind === 'cylinder') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 14), mat);
    else if (kind === 'cone') mesh = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.72, 12), mat);
    else mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
    mesh.position.y = kind === 'plane' ? 0.03 : 0.36;
    mesh.userData.kind = 'actor';
    g.add(mesh);
    const label = makeLabel('道具', '#38bdf8');
    label.position.set(0, kind === 'plane' ? 0.28 : 0.9, 0);
    g.add(label);
    g.userData.parts = { mat, label, mesh, primitive: true };
    g.userData.primitive = kind || 'cube';
    return g;
}

function applyActorLook(group, actor, selected) {
    const parts = group.userData.parts || {};
    if (parts.primitive) {
        const next = materialOf(actor, selected);
        parts.mat.color.copy(next.color);
        parts.mat.roughness = next.roughness;
        parts.mat.metalness = next.metalness;
        parts.mat.transparent = next.transparent;
        parts.mat.opacity = next.opacity;
        parts.mat.emissive.copy(next.emissive);
        parts.mat.emissiveIntensity = next.emissiveIntensity;
        setLabel(parts.label, actor.name || '道具', selected ? '#fdba74' : '#38bdf8');
        return;
    }
    applyMannequinPose(group, actor, selected);
}

function buildMannequin() {
    const g = new THREE.Group();
    const mat = mannequinMat(false);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 4, 12), mat);
    body.position.y = 0.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), mat);
    head.position.y = 1.5;
    const armGeo = new THREE.CapsuleGeometry(0.05, 0.4, 3, 8);
    const armL = new THREE.Mesh(armGeo, mat);
    armL.rotation.z = Math.PI / 2;
    armL.position.set(-0.4, 1.18, 0);
    const armR = new THREE.Mesh(armGeo, mat);
    armR.rotation.z = -Math.PI / 2;
    armR.position.set(0.4, 1.18, 0);
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.46, 3, 8);
    const legL = new THREE.Mesh(legGeo, mat);
    legL.position.set(-0.1, 0.38, 0);
    const legR = new THREE.Mesh(legGeo, mat);
    legR.position.set(0.1, 0.38, 0);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), mat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 1.5, 0.16);
    [body, head, armL, armR, legL, legR, nose].forEach(mesh => {
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.kind = 'actor';
    });
    g.add(body, head, armL, armR, legL, legR, nose);
    const dots = {};
    POSE_KEYS.forEach(key => {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 10, 8),
            new THREE.MeshStandardMaterial({ color: POSE_WHITE, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.2 })
        );
        dot.userData.kind = 'pose';
        dot.userData.poseKey = key;
        g.add(dot);
        dots[key] = dot;
    });
    const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.32, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    g.add(shadow);
    const label = makeLabel('角色1', '#fda4af');
    label.position.set(0, 1.78, 0);
    g.add(label);
    g.userData.parts = { body, head, armL, armR, legL, legR, nose, dots, shadow, label, mat };
    return g;
}

function applyMannequinPose(group, actor, selected) {
    const parts = group.userData.parts;
    const mat = parts.mat;
    mat.color.setHex(selected ? PINK_SEL : PINK);
    mat.emissive.setHex(selected ? 0x4c1d3d : 0x2a0818);
    mat.emissiveIntensity = selected ? 0.35 : 0.12;
    const pitch = Number(actor.bodyPitch || 0) * 0.45;
    const yaw = Number(actor.bodyYaw || 0) * 0.7;
    const roll = Number(actor.bodyRoll || 0) * 0.45;
    parts.body.rotation.set(pitch, 0, -roll);
    parts.head.rotation.set(Number(actor.headPitch || 0) * 0.7, Number(actor.headYaw || 0) * 0.85, 0);
    parts.head.position.set(
        Number(actor.pose?.head?.x || 0) * 0.4,
        1.5 + Number(actor.headPitch || 0) * -0.04,
        0
    );
    parts.nose.position.copy(parts.head.position).add(new THREE.Vector3(0, 0, 0.16));
    const handL = actor.pose?.handL || { x: -0.14, y: -0.02 };
    const handR = actor.pose?.handR || { x: 0.14, y: -0.02 };
    parts.armL.position.set(-0.4 + handL.x * 0.5, 1.18 - handL.y * 1.2, 0);
    parts.armR.position.set(0.4 + handR.x * 0.5, 1.18 - handR.y * 1.2, 0);
    const footL = actor.pose?.footL || { x: -0.03, y: 0.11 };
    const footR = actor.pose?.footR || { x: 0.03, y: 0.11 };
    parts.legL.position.set(-0.1 + footL.x * 0.8, 0.38, footL.y * 0.4);
    parts.legR.position.set(0.1 + footR.x * 0.8, 0.38, footR.y * 0.4);
    const showPose = actor.poseManual !== false;
    POSE_KEYS.forEach(key => {
        const dot = parts.dots[key];
        const loc = poseLocal(actor, key);
        dot.position.copy(loc);
        dot.visible = showPose;
        dot.userData.kind = 'pose';
        dot.userData.poseKey = key;
        dot.userData.actorId = actor.id;
    });
    const action = String(actor.action || '').trim();
    const name = String(actor.name || '角色');
    setLabel(parts.label, name, '#5b21b6');
}

function buildCameraMark() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: CAM_ORANGE, roughness: 0.4, metalness: 0.1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.36), mat);
    body.position.y = 0;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.22, 12), mat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, -0.28);
    const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.42, 0.9, 4, 1, true),
        new THREE.MeshBasicMaterial({ color: CAM_ORANGE, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0, -0.75);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.7, 8), mat);
    stand.position.y = -0.44;
    g.add(body, lens, cone, stand);
    const label = makeLabel('机位1', '#fdba74');
    label.position.set(0, 0.42, 0);
    g.add(label);
    g.userData.parts = { mat, label, cone };
    g.userData.kind = 'camera';
    body.userData.kind = 'camera';
    lens.userData.kind = 'camera';
    cone.userData.kind = 'camera';
    stand.userData.kind = 'camera';
    return g;
}

function movePath(id, origin, dir, target) {
    const pts = [];
    const o = origin.clone();
    const d = dir.clone().normalize();
    const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const steps = 24;
    const push = p => pts.push(p.clone());
    if (!id) {
        push(o);
        push(o.clone().add(d.clone().multiplyScalar(0.6)));
        return pts;
    }
    for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        let p = o.clone();
        if (id === 'tilt_up') p.add(up.clone().multiplyScalar(t * 1.4)).add(d.clone().multiplyScalar(t * 0.2));
        else if (id === 'tilt_down') p.add(up.clone().multiplyScalar(-t * 1.2)).add(d.clone().multiplyScalar(t * 0.2));
        else if (id === 'pan_left') p.add(right.clone().multiplyScalar(-t * 2.4));
        else if (id === 'pan_right') p.add(right.clone().multiplyScalar(t * 2.4));
        else if (id === 'crane_up') p.add(up.clone().multiplyScalar(t * 2.2));
        else if (id === 'crane_down') p.add(up.clone().multiplyScalar(-t * 1.6));
        else if (id === 'truck_left') p.add(right.clone().multiplyScalar(-t * 2.8));
        else if (id === 'truck_right') p.add(right.clone().multiplyScalar(t * 2.8));
        else if (id === 'dolly_in') p.add(d.clone().multiplyScalar(t * 3.2));
        else if (id === 'dolly_out') p.add(d.clone().multiplyScalar(-t * 2.4));
        else if (id === 'zoom_in') p.add(d.clone().multiplyScalar(t * 1.4));
        else if (id === 'zoom_out') p.add(d.clone().multiplyScalar(-t * 1.4));
        else if (id === 'handheld') {
            p.add(d.clone().multiplyScalar(t * 0.4));
            p.x += Math.sin(t * 18) * 0.08;
            p.y += Math.cos(t * 14) * 0.06;
        } else if (id === 'orbit_180' || id === 'orbit_360') {
            const span = id === 'orbit_180' ? Math.PI : Math.PI * 2;
            const c = target.clone();
            c.y = o.y;
            const rel = o.clone().sub(c);
            const ang = Math.atan2(rel.x, rel.z) + span * t;
            const rad = rel.length();
            p.set(c.x + Math.sin(ang) * rad, o.y, c.z + Math.cos(ang) * rad);
        } else if (id === 'follow' || id === 'follow_side') {
            p.add(d.clone().multiplyScalar(t * 2.2)).add(right.clone().multiplyScalar(id === 'follow_side' ? t * 1.2 : 0));
        } else if (id === 'follow_front') {
            p.add(d.clone().multiplyScalar(-t * 2.2));
        } else {
            p.add(d.clone().multiplyScalar(t * 0.8));
        }
        push(p);
    }
    return pts;
}

function defaultOrbit() {
    return { theta: 0.42, phi: 1.02, radius: 16, tx: 0, ty: 0.9, tz: 0.6 };
}

function runtime(host) {
    return host && host._vwf3d ? host._vwf3d : null;
}

function applyOrbit(rt) {
    const o = rt.orbit;
    const phi = clamp(o.phi, 0.18, 1.42, 1.02);
    const theta = Number(o.theta || 0);
    const r = clamp(o.radius, 4, 42, 16);
    rt.dirCam.position.set(
        o.tx + r * Math.sin(phi) * Math.sin(theta),
        o.ty + r * Math.cos(phi),
        o.tz + r * Math.sin(phi) * Math.cos(theta)
    );
    rt.dirCam.lookAt(o.tx, o.ty, o.tz);
}

function ensureFloor(rt, aspect, bgColor) {
    const size = floorSize(aspect);
    rt.floor = size;
    if (rt.ground) {
        rt.world.remove(rt.ground);
        rt.ground.geometry.dispose();
        if (rt.grid) {
            rt.world.remove(rt.grid);
            rt.grid.geometry.dispose();
        }
        if (rt.axisLine) {
            rt.world.remove(rt.axisLine);
            rt.axisLine.geometry.dispose();
            rt.axisLine.material.dispose();
        }
    }
    const geo = new THREE.PlaneGeometry(size.w, size.d, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xd7e0ea,
        roughness: 0.96,
        metalness: 0.02
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.userData.kind = 'ground';
    const grid = new THREE.GridHelper(Math.max(size.w, size.d), 24, 0xcbd5e1, 0xd8e0e8);
    grid.position.y = 0.01;
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size.w / 2, 0.02, 0),
        new THREE.Vector3(size.w / 2, 0.02, 0)
    ]);
    const axis = new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0xf43f5e }));
    rt.world.add(mesh);
    rt.world.add(grid);
    rt.world.add(axis);
    rt.ground = mesh;
    rt.grid = grid;
    rt.axisLine = axis;
    rt.groundMat = mat;
}

function buildWorld(rt) {
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0xcbd5e1, 1.05);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(6, 12, 8);
    const fill = new THREE.DirectionalLight(0x93c5fd, 0.25);
    fill.position.set(-8, 6, -4);
    rt.scene.add(hemi, key, fill);
    rt.world = new THREE.Group();
    rt.scene.add(rt.world);
    rt.actorsRoot = new THREE.Group();
    rt.camsRoot = new THREE.Group();
    rt.pathsRoot = new THREE.Group();
    rt.world.add(rt.actorsRoot, rt.camsRoot, rt.pathsRoot);
}

function disposeGroup(group) {
    const keep = [];
    group.children.forEach(ch => keep.push(ch));
    keep.forEach(ch => {
        group.remove(ch);
        ch.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(m => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            }
        });
    });
}

function syncActors(rt, stage, selectedId, showPose) {
    const actors = stage.actors || [];
    const have = new Set();
    actors.forEach(actor => {
        have.add(actor.id);
        let node = rt.actorMap.get(actor.id);
        const wantPrim = actor.kind === 'prop' || Boolean(actor.primitive);
        const havePrim = Boolean(node && node.userData.parts && node.userData.parts.primitive);
        if (node && (wantPrim !== havePrim || (havePrim && node.userData.primitive !== (actor.primitive || 'cube')))) {
            rt.actorsRoot.remove(node);
            rt.actorMap.delete(actor.id);
            node = null;
        }
        if (!node) {
            node = wantPrim ? buildPrimitive(actor.primitive || 'cube') : buildMannequin();
            node.userData.actorId = actor.id;
            rt.actorMap.set(actor.id, node);
            rt.actorsRoot.add(node);
        }
        node.userData.kind = 'actor';
        node.userData.actorId = actor.id;
        node.userData.primitive = actor.primitive || '';
        const pos = toWorld(actor.x, actor.y, actor.alt, rt.floor);
        node.position.copy(pos);
        node.rotation.y = -Number(actor.facing || 0) * DEG;
        const s = clamp(actor.scale, 0.4, 2.4, 1);
        node.scale.setScalar(s);
        applyActorLook(node, actor, actor.id === selectedId);
        node.userData.parts.dots && POSE_KEYS.forEach(key => {
            node.userData.parts.dots[key].visible = showPose !== false && actor.poseManual !== false;
        });
        node.traverse(obj => {
            if (obj.userData && obj.userData.kind === 'pose') obj.userData.actorId = actor.id;
            if (obj.isMesh && obj.userData.kind !== 'pose') {
                obj.userData.kind = 'actor';
                obj.userData.actorId = actor.id;
            }
        });
    });
    [...rt.actorMap.keys()].forEach(id => {
        if (have.has(id)) return;
        const node = rt.actorMap.get(id);
        rt.actorsRoot.remove(node);
        rt.actorMap.delete(id);
    });
}

function syncCameras(rt, stage, selectedId, schema) {
    const cameras = stage.cameras?.length ? stage.cameras : (stage.camera ? [stage.camera] : []);
    const have = new Set();
    const target = new THREE.Vector3();
    const actors = stage.actors || [];
    if (actors.length) {
        actors.forEach(a => target.add(toWorld(a.x, a.y, a.alt, rt.floor)));
        target.multiplyScalar(1 / actors.length);
        target.y = 1.2;
    } else {
        target.set(0, 1.2, 0);
    }
    cameras.forEach(cam => {
        have.add(cam.id);
        let node = rt.camMap.get(cam.id);
        if (!node) {
            node = buildCameraMark();
            rt.camMap.set(cam.id, node);
            rt.camsRoot.add(node);
        }
        const alt = camAlt(cam, schema);
        const pos = toWorld(cam.x, cam.y, alt, rt.floor);
        node.position.copy(pos);
        node.rotation.set(0, -Number(cam.facing || 0) * DEG, cam.kind === 'dutch' ? 0.32 : 0);
        const on = cam.id === selectedId;
        node.userData.parts.mat.emissive = new THREE.Color(on ? 0x7c2d12 : 0x000000);
        node.userData.parts.mat.emissiveIntensity = on ? 0.35 : 0;
        setLabel(node.userData.parts.label, `${cam.name || '机位'} · ${(schema?.camPresetLabel?.(cam.kind) || '')}`, '#fdba74');
        node.traverse(obj => {
            if (obj.isMesh) {
                obj.userData.kind = 'camera';
                obj.userData.cameraId = cam.id;
            }
        });
        node.userData.kind = 'camera';
        node.userData.cameraId = cam.id;
        node.userData.worldPos = pos.clone();
        node.userData.dir = facingDir(cam.facing);
    });
    [...rt.camMap.keys()].forEach(id => {
        if (have.has(id)) return;
        rt.camsRoot.remove(rt.camMap.get(id));
        rt.camMap.delete(id);
    });
    disposeGroup(rt.pathsRoot);
    const moveId = stage.cameraMove || '';
    const active = cameras.find(c => c.id === selectedId) || cameras[0];
    if (active) {
        const origin = toWorld(active.x, active.y, camAlt(active, schema), rt.floor);
        const dir = facingDir(active.facing);
        const pts = movePath(moveId, origin, dir, target);
        if (pts.length > 1) {
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
            rt.pathsRoot.add(line);
        }
    }
    (stage.actors || []).forEach(actor => {
        const path = actor.path || [];
        if (path.length < 2) return;
        const pts = path.map(pt => toWorld(pt.x, pt.y, 0.04, rt.floor));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        rt.pathsRoot.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf472b6 })));
    });
}

function setBg(rt, stage) {
    const color = stage?.scene?.bgColor || '#e7edf3';
    // Keep the 3D viewport background in sync with the stage inspector. The
    // previous fixed light-gray clear color made the color control appear
    // broken; the floor material can still use a separate tint/texture.
    rt.scene.background = new THREE.Color(color);
    if (rt.renderer?.setClearColor) rt.renderer.setClearColor(color, 1);
    if (rt.groundMat) {
        const c = new THREE.Color(color);
        const dark = c.r * 0.3 + c.g * 0.5 + c.b * 0.2 < 0.28;
        rt.groundMat.color.set(dark ? 0xd7e0ea : color);
    }
    const url = stage?.scene?.bgMode === 'image' ? String(stage.scene.bgUrl || '') : '';
    if (url && url !== rt.bgUrl) {
        rt.bgUrl = url;
        new THREE.TextureLoader().load(url, tex => {
            if (rt.bgUrl !== url || !rt.groundMat) return;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            rt.groundMat.map = tex;
            rt.groundMat.color.set(0xffffff);
            rt.groundMat.needsUpdate = true;
        });
    } else if (!url && rt.groundMat && rt.groundMat.map) {
        rt.groundMat.map.dispose();
        rt.groundMat.map = null;
        rt.groundMat.color.set(color);
        rt.bgUrl = '';
    }
}

function resizeTo(rt, width, height) {
    const w = Math.max(16, Math.round(width || rt.box.clientWidth || 840));
    const h = Math.max(16, Math.round(height || rt.box.clientHeight || 360));
    rt.renderer.setSize(w, h, false);
    rt.dirCam.aspect = w / h;
    rt.dirCam.updateProjectionMatrix();
    rt.shotCam.aspect = w / h;
    rt.shotCam.updateProjectionMatrix();
}

function placeShotCam(rt, cam, schema) {
    const alt = camAlt(cam, schema);
    const pos = toWorld(cam.x, cam.y, alt, rt.floor);
    const look = new THREE.Vector3(0, 1.15, 0);
    if (rt.actorMap && rt.actorMap.size) {
        look.set(0, 0, 0);
        rt.actorMap.forEach(node => look.add(node.position));
        look.multiplyScalar(1 / rt.actorMap.size);
        look.y = 1.15;
    } else {
        look.add(facingDir(cam.facing).multiplyScalar(3));
        look.y = 1.15;
    }
    rt.shotCam.position.copy(pos);
    rt.shotCam.up.set(0, 1, 0);
    rt.shotCam.lookAt(look);
    if (cam.kind === 'dutch') rt.shotCam.rotateZ(0.32);
    if (cam.kind === 'front_close') rt.shotCam.fov = 35;
    else if (cam.kind === 'low_wide' || cam.kind === 'front_full') rt.shotCam.fov = 62;
    else if (cam.kind === 'bird' || cam.kind === 'top_full') rt.shotCam.fov = 50;
    else rt.shotCam.fov = 48;
    rt.shotCam.updateProjectionMatrix();
}

function loop(host) {
    const rt = runtime(host);
    if (!rt || rt.dead) return;
    rt.raf = requestAnimationFrame(() => loop(host));
    if (!rt.visible || !rt.box || !rt.box.isConnected) return;
    const w = rt.box.clientWidth;
    const h = rt.box.clientHeight;
    if (w && h && (w !== rt.lastW || h !== rt.lastH)) {
        rt.lastW = w;
        rt.lastH = h;
        resizeTo(rt, w, h);
    }
    applyOrbit(rt);
    rt.renderer.setViewport(0, 0, rt.lastW, rt.lastH);
    rt.renderer.setScissorTest(false);
    rt.renderer.render(rt.scene, rt.dirCam);
}

function create(host) {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xe7edf3, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe7edf3);
    const dirCam = new THREE.PerspectiveCamera(48, 21 / 9, 0.1, 120);
    const shotCam = new THREE.PerspectiveCamera(48, 21 / 9, 0.1, 120);
    const rt = {
        renderer,
        scene,
        dirCam,
        shotCam,
        orbit: defaultOrbit(),
        actorMap: new Map(),
        camMap: new Map(),
        raycaster: new THREE.Raycaster(),
        pointer: new THREE.Vector2(),
        groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        visible: false,
        lastW: 0,
        lastH: 0,
        dead: false
    };
    buildWorld(rt);
    ensureFloor(rt, '21:9', 0x1a1020);
    host._vwf3d = rt;
    return rt;
}

function pickFromEvent(rt, ev) {
    const rect = rt.renderer.domElement.getBoundingClientRect();
    rt.pointer.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    rt.pointer.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    rt.raycaster.setFromCamera(rt.pointer, rt.dirCam);
    const hits = rt.raycaster.intersectObjects([rt.actorsRoot, rt.camsRoot, rt.ground], true);
    for (let i = 0; i < hits.length; i += 1) {
        const obj = hits[i].object;
        if (obj.userData.kind === 'pose') {
            return { kind: 'pose', id: obj.userData.actorId, key: obj.userData.poseKey, point: hits[i].point };
        }
        if (obj.userData.kind === 'actor' || obj.userData.actorId) {
            return { kind: 'actor', id: obj.userData.actorId, point: hits[i].point };
        }
        if (obj.userData.kind === 'camera' || obj.userData.cameraId) {
            return { kind: 'camera', id: obj.userData.cameraId, point: hits[i].point };
        }
        if (obj.userData.kind === 'ground') {
            return { kind: 'ground', point: hits[i].point };
        }
    }
    const hit = new THREE.Vector3();
    if (rt.raycaster.ray.intersectPlane(rt.groundPlane, hit)) {
        return { kind: 'ground', point: hit };
    }
    return null;
}

function groundFromEvent(rt, ev) {
    const rect = rt.renderer.domElement.getBoundingClientRect();
    rt.pointer.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    rt.pointer.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    rt.raycaster.setFromCamera(rt.pointer, rt.dirCam);
    const hit = new THREE.Vector3();
    if (rt.raycaster.ray.intersectPlane(rt.groundPlane, hit)) return hit;
    return null;
}

// Pose handles live on a vertical plane through the actor.  Intersecting the
// ground plane for a pose drag makes a vertical screen movement change the
// actor's stage position instead of the selected limb/head coordinates.  Use
// the actor's local X/Y plane (rotated with its facing) so both horizontal and
// vertical drags map to the same coordinates as poseFromWorld().
function poseFromEvent(rt, ev, actor) {
    if (!actor || !rt?.renderer?.domElement || !rt.floor) return null;
    const rect = rt.renderer.domElement.getBoundingClientRect();
    rt.pointer.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    rt.pointer.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    rt.raycaster.setFromCamera(rt.pointer, rt.dirCam);
    const base = toWorld(actor.x, actor.y, actor.alt, rt.floor);
    const yaw = -Number(actor.facing || 0) * DEG;
    const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize();
    const point = base.clone().add(new THREE.Vector3(0, 0.9, 0.12).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const hit = new THREE.Vector3();
    return rt.raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}

function bindPointer(rt) {
    const el = rt.renderer.domElement;
    if (rt.pointerBound) return;
    rt.pointerBound = true;
    let drag = null;
    el.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 && ev.button !== 1 && ev.button !== 2) return;
        ev.preventDefault();
        el.setPointerCapture(ev.pointerId);
        rt.box?.focus();
        const tool = rt.getTool ? rt.getTool() : 'select';
        const hit = pickFromEvent(rt, ev);
        if (ev.button === 1 || ev.button === 2 || ev.shiftKey) {
            drag = { mode: 'pan', x: ev.clientX, y: ev.clientY };
            return;
        }
        if (tool === 'path' && rt.onPath && hit) {
            const n = toNorm(hit.point.x, hit.point.z, rt.floor);
            rt.onPath(n);
            return;
        }
        if (hit && (hit.kind === 'actor' || hit.kind === 'camera' || hit.kind === 'pose')) {
            if (rt.onPick) rt.onPick(hit.id, hit);
            drag = {
                mode: tool === 'rotate' ? 'rotate' : (tool === 'scale' ? 'scale' : (hit.kind === 'pose' ? 'pose' : 'move')),
                id: hit.id,
                kind: hit.kind,
                key: hit.key,
                x: ev.clientX,
                y: ev.clientY,
                startY: ev.clientY
            };
            if (rt.onHist) rt.onHist();
            return;
        }
        drag = { mode: 'orbit', x: ev.clientX, y: ev.clientY };
    });
    el.addEventListener('pointermove', ev => {
        if (!drag) return;
        const dx = ev.clientX - drag.x;
        const dy = ev.clientY - drag.y;
        drag.x = ev.clientX;
        drag.y = ev.clientY;
        if (drag.mode === 'orbit') {
            rt.orbit.theta -= dx * 0.008;
            rt.orbit.phi = clamp(rt.orbit.phi + dy * 0.008, 0.18, 1.42, 1);
            if (rt.onOrbit) rt.onOrbit({ ...rt.orbit });
            return;
        }
        if (drag.mode === 'pan') {
            const right = new THREE.Vector3();
            const up = new THREE.Vector3(0, 1, 0);
            rt.dirCam.getWorldDirection(right);
            right.cross(up).normalize();
            const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
            const k = rt.orbit.radius * 0.0022;
            rt.orbit.tx -= (right.x * dx + fwd.x * dy) * k;
            rt.orbit.tz -= (right.z * dx + fwd.z * dy) * k;
            if (rt.onOrbit) rt.onOrbit({ ...rt.orbit });
            return;
        }
        const poseActor = drag.mode === 'pose'
            ? (rt.stage?.actors || []).find(actor => actor.id === drag.id)
            : null;
        const ground = drag.mode === 'pose' ? poseFromEvent(rt, ev, poseActor) : groundFromEvent(rt, ev);
        if (drag.mode === 'move' && ground && rt.onDrag) {
            const n = toNorm(ground.x, ground.z, rt.floor);
            rt.onDrag(drag.kind, drag.id, { x: n.nx, y: n.ny });
        } else if (drag.mode === 'rotate' && rt.onDrag) {
            rt.onDrag(drag.kind, drag.id, { dFacing: dx * 0.6 });
        } else if (drag.mode === 'scale' && rt.onDrag) {
            rt.onDrag(drag.kind, drag.id, { dScale: (drag.startY - ev.clientY) / 180 });
            drag.startY = ev.clientY;
        } else if (drag.mode === 'pose' && ground && rt.onDrag) {
            const n = toNorm(ground.x, ground.z, rt.floor);
            rt.onDrag('pose', drag.id, { key: drag.key, x: n.nx, y: n.ny, py: ground.y, world: ground });
        }
    });
    const end = () => {
        if (drag && rt.onOrbit && (drag.mode === 'orbit' || drag.mode === 'pan')) rt.onOrbit({ ...rt.orbit }, true);
        drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', ev => ev.preventDefault());
    el.addEventListener('wheel', ev => {
        ev.preventDefault();
        const next = clamp(rt.orbit.radius + ev.deltaY * 0.012, 4, 42, 16);
        rt.orbit.radius = next;
        if (rt.onOrbit) rt.onOrbit({ ...rt.orbit }, true);
    }, { passive: false });
}

export function attach(host, box, opts) {
    if (!host || !box) return null;
    let rt = runtime(host);
    if (!rt || rt.dead) {
        try {
            rt = create(host);
        } catch (err) {
            console.warn('片场3D初始化失败', err);
            return null;
        }
    }
    rt.box = box;
    rt.schema = opts?.schema || null;
    rt.getTool = opts?.getTool;
    rt.onPick = opts?.onPick;
    rt.onDrag = opts?.onDrag;
    rt.onPath = opts?.onPath;
    rt.onHist = opts?.onHist;
    rt.onOrbit = opts?.onOrbit;
    rt.preview = opts?.preview || null;
    rt.visible = true;
    const canvas = rt.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.outline = 'none';
    if (canvas.parentNode !== box) {
        box.innerHTML = '';
        box.appendChild(canvas);
    }
    bindPointer(rt);
    if (opts?.orbit) Object.assign(rt.orbit, opts.orbit);
    const aspect = opts?.aspect || '21:9';
    if (!rt.floor || rt.aspect !== aspect) {
        rt.aspect = aspect;
        ensureFloor(rt, aspect, 0x1a1020);
    }
    resizeTo(rt, box.clientWidth, box.clientHeight);
    if (!rt.raf) loop(host);
    return rt;
}

export function hide(host) {
    const rt = runtime(host);
    if (!rt) return;
    rt.visible = false;
}

export function sync(host, stage, opts) {
    const rt = runtime(host);
    if (!rt || !stage) return;
    const schema = opts?.schema || rt.schema;
    const aspect = schema?.aspectOf?.(stage.aspect) || stage.aspect || '21:9';
    rt.stage = stage;
    if (rt.aspect !== aspect) {
        rt.aspect = aspect;
        ensureFloor(rt, aspect, stage.scene?.bgColor);
    }
    if (stage.viewOrbit) Object.assign(rt.orbit, stage.viewOrbit);
    setBg(rt, stage);
    const selectedId = opts?.selectedId || '';
    syncActors(rt, stage, selectedId, opts?.showPose);
    syncCameras(rt, stage, selectedId, schema);
    const cameras = stage.cameras?.length ? stage.cameras : [];
    rt.previewCam = cameras.find(c => c.id === selectedId) || cameras[0] || null;
    rt.visible = stage.viewMode !== '2d';
    if (rt.preview && rt.preview.isConnected && rt.previewCam && rt.visible) {
        const pw = rt.preview.width || 320;
        const ph = rt.preview.height || 180;
        const prevW = rt.lastW || rt.box?.clientWidth || 840;
        const prevH = rt.lastH || rt.box?.clientHeight || 360;
        placeShotCam(rt, rt.previewCam, schema);
        resizeTo(rt, pw, ph);
        rt.renderer.render(rt.scene, rt.shotCam);
        const ctx = rt.preview.getContext('2d');
        if (ctx) ctx.drawImage(rt.renderer.domElement, 0, 0, pw, ph);
        resizeTo(rt, prevW, prevH);
    }
}

export function capture(host, opts) {
    const rt = runtime(host);
    if (!rt) return '';
    const stage = opts?.stage;
    if (stage) sync(host, stage, opts);
    const w = Math.max(16, Math.round(opts?.width || 1680));
    const h = Math.max(16, Math.round(opts?.height || 720));
    const prevW = rt.lastW || rt.box?.clientWidth || 840;
    const prevH = rt.lastH || rt.box?.clientHeight || 360;
    resizeTo(rt, w, h);
    applyOrbit(rt);
    if (opts?.mode === 'shot' && rt.previewCam) {
        placeShotCam(rt, rt.previewCam, rt.schema);
        rt.renderer.render(rt.scene, rt.shotCam);
    } else {
        rt.renderer.render(rt.scene, rt.dirCam);
    }
    let url = '';
    try { url = rt.renderer.domElement.toDataURL('image/png'); } catch (err) { url = ''; }
    resizeTo(rt, prevW, prevH);
    rt.renderer.render(rt.scene, rt.dirCam);
    return url;
}

export function currentViewAsCamera(host) {
    const rt = runtime(host);
    if (!rt) return null;
    const p = rt.dirCam.position;
    const n = toNorm(p.x, p.z, rt.floor);
    const dir = new THREE.Vector3();
    rt.dirCam.getWorldDirection(dir);
    let facing = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
    if (facing < 0) facing += 360;
    return {
        x: n.nx,
        y: n.ny,
        facing: Math.round(facing),
        alt: clamp(p.y, 0.15, 12, 1.6),
        kind: 'current'
    };
}

export function poseFromWorld(host, actor, key, world) {
    const rt = runtime(host);
    if (!rt || !actor || !world) return actor?.pose;
    const base = toWorld(actor.x, actor.y, actor.alt, rt.floor);
    const yaw = -Number(actor.facing || 0) * DEG;
    const dx = world.x - base.x;
    const dz = world.z - base.z;
    const localX = dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const localY = world.y - base.y;
    const pose = { ...(actor.pose || {}) };
    pose[key] = {
        x: clamp(localX / 1.55, -0.35, 0.35, 0),
        y: clamp((0.9 - localY) / 4.6, -0.35, 0.35, 0)
    };
    return pose;
}

export function dom(host) {
    const rt = runtime(host);
    return rt ? rt.renderer.domElement : null;
}

export function getOrbit(host) {
    const rt = runtime(host);
    return rt ? { ...rt.orbit } : defaultOrbit();
}

export function resetOrbit(host) {
    const rt = runtime(host);
    const next = defaultOrbit();
    if (rt) {
        rt.orbit = { ...next };
        applyOrbit(rt);
    }
    return next;
}
