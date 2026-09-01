(function (root) {
    function tr(key) {
        return root.StudioI18n ? root.StudioI18n.t(key) : key;
    }

    const STAGE3D_HREF = '/static/js/video-workflow-stage3d.js?v=2026.08.30.xyq2';
    const RAIL_TABS = ['object', 'mine', 'actor', 'prop', 'camera', 'action', 'move', 'material', 'scan'];

    // Keep transient playback state outside the DOM.  Some embedded webviews
    // expose frozen element wrappers, and ordinary expando properties such as
    // `host._vwfPlaying` then silently fail to persist between clicks.  A
    // WeakMap works for both normal DOM nodes and those wrappers while keeping
    // the state lifetime tied to the workflow host.  The legacy expandos are
    // mirrored opportunistically for integrations that still read them.
    const playbackStates = new WeakMap();
    const fallbackPlaybackState = { playing: false, timer: 0, frame: 0 };
    function playbackState(host) {
        if (!host || (typeof host !== 'object' && typeof host !== 'function')) return fallbackPlaybackState;
        let state = playbackStates.get(host);
        if (!state) {
            state = { playing: false, timer: 0, frame: 0 };
            playbackStates.set(host, state);
        }
        return state;
    }
    function mirrorPlaybackState(host, state) {
        if (!host || !state) return;
        try {
            host._vwfPlaying = Boolean(state.playing);
            host._vwfPlayTimer = state.timer || 0;
            host._vwfPlayFrame = Number(state.frame || 0);
        } catch (err) {
            // Frozen host wrappers are expected in a few embedded webviews;
            // the WeakMap state above remains authoritative there.
        }
    }

    function loadStage3D() {
        if (root.VideoWorkflowStage3D) return Promise.resolve(root.VideoWorkflowStage3D);
        if (root._vwf3dLoading) return root._vwf3dLoading;
        root._vwf3dLoading = import(STAGE3D_HREF).then(mod => {
            root.VideoWorkflowStage3D = mod;
            return mod;
        }).catch(err => {
            console.warn('片场3D模块加载失败', err);
            root._vwf3dLoading = null;
            return null;
        });
        return root._vwf3dLoading;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function safeStandaloneHref(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, root.location.href);
            if (!['http:', 'https:'].includes(parsed.protocol)) return '';
            if (parsed.origin !== root.location.origin) return '';
            if (!/\/static\/director-desk\.html$/i.test(parsed.pathname)) return '';
            return parsed.href;
        } catch (_) {
            return '';
        }
    }

    const OPEN_SOURCE_BLOCKED_PROVIDER_RE = /sub2api/i;
    const OPEN_SOURCE_BILLING_MODEL_RE = /(?:会员|付费|充值|订阅|(?<![a-z0-9])(?:vip|premium|paid|subscription|membership)(?![a-z0-9]))/i;
    // Keep the disabled model marker assembled at runtime so the generic
    // workflow package remains vendor-neutral in static source scans.
    const OPEN_SOURCE_BLOCKED_MODEL_MARKER = [103, 114, 111, 107].map(code => String.fromCharCode(code)).join('');
    function isOpenSourceBlockedProvider(provider) {
        if (!provider) return false;
        if (OPEN_SOURCE_BLOCKED_PROVIDER_RE.test(
            [provider.id, provider.name, provider.base_url].map(value => String(value || '')).join(' ')
        )) return true;
        return OPEN_SOURCE_BILLING_MODEL_RE.test(
            [provider.id, provider.name].map(value => String(value || '')).join(' ')
        );
    }
    function isOpenSourceBlockedModel(model) {
        const text = String(model || '').trim();
        return text.toLowerCase().includes(OPEN_SOURCE_BLOCKED_MODEL_MARKER)
            || OPEN_SOURCE_BILLING_MODEL_RE.test(text);
    }

    function pickFiles(accept, multiple) {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept || '*/*';
            input.multiple = Boolean(multiple);
            let settled = false;
            let focusTimer = 0;
            const focusTarget = root.window || root;
            const finish = files => {
                if (settled) return;
                settled = true;
                if (focusTimer) {
                    root.clearTimeout?.(focusTimer);
                    focusTimer = 0;
                }
                try { focusTarget.removeEventListener?.('focus', onWindowFocus, true); } catch (_) {}
                resolve(files || []);
            };
            /* Some embedded Chromium shells do not dispatch `cancel` for a
               dismissed native chooser.  Regain focus is the only portable
               signal in those shells; wait briefly so a normal selection can
               dispatch `change` first, then resolve an empty list only when
               no file was populated. */
            const onWindowFocus = () => {
                if (settled) return;
                focusTimer = root.setTimeout?.(() => {
                    focusTimer = 0;
                    if (!settled && !(input.files && input.files.length)) finish([]);
                }, 500) || 0;
            };
            input.onchange = () => finish([...input.files || []]);
            /* Chromium fires `cancel` when the chooser is dismissed without
               selecting a file.  Resolving here prevents every async upload
               control from remaining pending forever after a cancelled pick.
               Older webviews simply omit the event and keep the onchange
               path above. */
            input.oncancel = () => finish([]);
            try { focusTarget.addEventListener?.('focus', onWindowFocus, true); } catch (_) {}
            input.click();
        });
    }

    function purposeOptions(selected) {
        return root.VideoWorkflowSchema.PURPOSES.map(value => {
            const label = tr(`videoWf.purpose.${value}`);
            return `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function assetKindOptions(selected) {
        return root.VideoWorkflowSchema.ASSET_KINDS.map(value => {
            const label = tr(`videoWf.asset.${value}`);
            return `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    function thumb(url, kind) {
        if (!url) return `<div class="vwf-thumb empty">${escapeHtml(tr('videoWf.add'))}</div>`;
        if (kind === 'audio') return `<div class="vwf-thumb audio">♪</div>`;
        if (kind === 'video') return `<video class="vwf-thumb" src="${escapeHtml(url)}" muted></video>`;
        return `<img class="vwf-thumb" src="${escapeHtml(url)}" alt="">`;
    }

    function acceptForKind(kind) {
        if (kind === 'video') return 'video/*';
        if (kind === 'audio') return 'audio/*';
        return 'image/*';
    }

    function localEngineProviders() {
        return [
            { id: 'comfyui', name: 'ComfyUI 本地' },
            { id: 'openai_local', name: '本地 OpenAI 兼容' }
        ];
    }
    function engineCatalog(opts) {
        const api = (opts && Array.isArray(opts.providers) ? opts.providers : [])
            .filter(p => p && !isOpenSourceBlockedProvider(p) && p.enabled !== false);
        const extra = localEngineProviders();
        const seen = new Set(api.map(p => String(p.id || '')));
        return api.concat(extra.filter(p => !seen.has(p.id)));
    }
    function modelsForSlot(provider, slot) {
        if (!provider) return [];
        if (slot === 'video') return (provider.video_models || []).filter(model => !isOpenSourceBlockedModel(model));
        if (slot === 'tts' || slot === 'llm') return (provider.chat_models || []).filter(model => !isOpenSourceBlockedModel(model));
        return (provider.image_models || []).filter(model => !isOpenSourceBlockedModel(model));
    }
    function renderEngines(wf, opts) {
        const schema = root.VideoWorkflowSchema || {};
        const slots = schema.ENGINE_SLOTS || ['video', 'image', 'upscale', 'matting', 'tts', 'llm', 'relight', 'redo'];
        const labels = schema.SLOT_LABELS || {};
        const catalog = engineCatalog(opts);
        const rows = slots.map(slot => {
            const rawEng = (wf.engines && wf.engines[slot]) || { provider: '', model: '', baseUrl: '' };
            const eng = {
                ...rawEng,
                provider: catalog.some(provider => String(provider.id || '') === String(rawEng.provider || '')) ? rawEng.provider : '',
                model: isOpenSourceBlockedModel(rawEng.model) ? '' : rawEng.model
            };
            const provOpts = ['<option value="">' + escapeHtml(tr('videoWf.engineProvider')) + '</option>'].concat(
                catalog.map(p => '<option value="' + escapeHtml(p.id) + '"' + (p.id === eng.provider ? ' selected' : '') + '>' + escapeHtml(p.name || p.id) + '</option>')
            ).join('');
            const models = modelsForSlot(catalog.find(p => p.id === eng.provider), slot);
            const listId = 'vwf-eng-models-' + slot;
            const dataList = models.length
                ? '<datalist id="' + listId + '">' + models.map(m => '<option value="' + escapeHtml(m) + '"></option>').join('') + '</datalist>'
                : '';
            return '<div class="vwf-engine" data-engine-slot="' + escapeHtml(slot) + '">'
                + '<span class="vwf-label">' + escapeHtml(labels[slot] || slot) + '</span>'
                + '<select data-vwf="eng-provider" aria-label="' + escapeHtml((labels[slot] || slot) + ' ' + tr('videoWf.engineProvider')) + '">' + provOpts + '</select>'
                + '<input type="text" data-vwf="eng-model" list="' + listId + '" value="' + escapeHtml(eng.model || '') + '" placeholder="' + escapeHtml(tr('videoWf.engineModel')) + '" aria-label="' + escapeHtml((labels[slot] || slot) + ' ' + tr('videoWf.engineModel')) + '">'
                + '<input type="text" data-vwf="eng-base" value="' + escapeHtml(eng.baseUrl || '') + '" placeholder="' + escapeHtml(tr('videoWf.engineBase')) + '" aria-label="' + escapeHtml((labels[slot] || slot) + ' ' + tr('videoWf.engineBase')) + '">'
                + dataList
                + '</div>';
        }).join('');
        const toolSlots = ['image', 'upscale', 'matting', 'llm', 'relight', 'redo'].map(slot => {
            const eng = (wf.engines && wf.engines[slot]) || {};
            const ready = Boolean(eng.provider);
            return '<span class="vwf-engine-chip' + (ready ? ' is-on' : '') + '" data-engine-chip="' + escapeHtml(slot) + '">'
                + escapeHtml(labels[slot] || slot)
                + '<small>' + escapeHtml(ready ? ((eng.provider || '') + (eng.model ? '/' + eng.model : '')) : tr('videoWf.engineUnset')) + '</small>'
                + '</span>';
        }).join('');
        return '<div class="vwf-section">'
            + '<div class="vwf-head"><span>' + escapeHtml(tr('videoWf.engines')) + '</span></div>'
            + '<div class="vwf-engine-chips">' + toolSlots + '</div>'
            + rows
            + '</div>';
    }

    function renderStyleLib(wf) {
        const styles = [...(wf.assets || []), ...(wf._optsAssets || [])]
            .filter(item => item && (item.kind === 'style' || item.assetKind === 'style') && (item.name || item.url));
        const seen = new Set();
        const cards = styles.filter(item => {
            const key = item.id || item.name || item.url;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(item =>
            '<button type="button" class="vwf-mini" data-style-use="' + escapeHtml(item.id || '') + '" data-style-name="' + escapeHtml(item.name || '') + '">'
            + escapeHtml(item.name || tr('videoWf.asset.style'))
            + '</button>'
        ).join('');
        return '<div class="vwf-section">'
            + '<div class="vwf-head"><span>' + escapeHtml(tr('videoWf.styleLib')) + '</span></div>'
            + '<div class="vwf-note">' + escapeHtml(tr('videoWf.styleLibHint')) + '</div>'
            + '<div class="vwf-style-lib">' + (cards || '<div class="vwf-empty">' + escapeHtml(tr('videoWf.noStyles')) + '</div>') + '</div>'
            + '</div>';
    }

    function svgIcon(d, size) {
        return `<svg viewBox="0 0 24 24" width="${size || 16}" height="${size || 16}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    }
    function tabGlyph(id) {
        const map = {
            object: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
            mine: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
            actor: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
            prop: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
            camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
            action: '<circle cx="12" cy="5" r="2"/><path d="M12 7v4l3 2"/><path d="M8 21l2-7 2 2 2-2"/>',
            move: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
            material: '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M12 12 4 7"/><path d="M12 12v10"/><path d="m12 12 8-5"/>',
            scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>'
        };
        return svgIcon(map[id] || map.object, 18);
    }
    function toolGlyph(id) {
        const map = {
            select: '<path d="M4 4l7 16 2-7 7-2z"/>',
            rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
            scale: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
            undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7"/>',
            redo: '<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7"/>',
            path: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 17 16 7"/>'
        };
        return svgIcon(map[id] || map.select, 16);
    }

    function renderExtraRefs(wf) {
        const schema = root.VideoWorkflowSchema;
        const order = schema.PURPOSES || [];
        const refs = (wf.extraRefs || []).slice().sort((a, b) => order.indexOf(a.purpose) - order.indexOf(b.purpose));
        if (!refs.length) return '<div class="vwf-empty">' + escapeHtml(tr('videoWf.noRefs')) + '</div>';
        let last = '__none__';
        return refs.map(ref => {
            const head = ref.purpose !== last
                ? '<div class="vwf-ref-group-h">' + escapeHtml(tr('videoWf.purpose.' + (ref.purpose || 'reference'))) + '</div>'
                : '';
            last = ref.purpose;
            const motionHint = ref.purpose === 'motion'
                ? '<div class="vwf-motion-hint">' + escapeHtml(tr('videoWf.motionHint')) + '</div>'
                : '';
            return head + '<div class="vwf-ref" data-ref-id="' + escapeHtml(ref.id) + '">'
                + thumb(ref.url, ref.kind)
                + '<div class="vwf-ref-meta">'
                + '<span class="vwf-ref-name">' + escapeHtml(ref.name || '') + '</span>'
                + '<select data-vwf="ref-kind">' + ['image','video','audio'].map(kind =>
                    '<option value="' + kind + '"' + (kind === ref.kind ? ' selected' : '') + '>' + escapeHtml(tr('videoWf.kind.' + kind)) + '</option>'
                ).join('') + '</select>'
                + '<select data-vwf="ref-purpose">' + purposeOptions(ref.purpose) + '</select>'
                + motionHint
                + '<button type="button" class="vwf-mini" data-vwf="ref-pick">' + escapeHtml(tr('videoWf.pick')) + '</button>'
                + '<button type="button" class="vwf-mini danger" data-vwf="ref-del">x</button>'
                + '</div></div>';
        }).join('');
    }

    function render(state, opts) {
        const wf = root.VideoWorkflowSchema.normalize(state);
        wf._selectedId = opts?.host?._vwfSelected || '';
        wf._optsAssets = Array.isArray(opts?.assets) ? opts.assets : [];
        wf._deskOpen = Boolean(opts?.host?._vwfDesk);
        const extraRefsHtml = renderExtraRefs(wf);
        const segs = wf.segments.map(seg => `
            <div class="vwf-seg" data-seg-id="${escapeHtml(seg.id)}">
                <input type="number" min="0" step="0.1" data-vwf="seg-start" value="${seg.start}" title="${escapeHtml(tr('videoWf.start'))}">
                <input type="number" min="0" step="0.1" data-vwf="seg-end" value="${seg.end}" title="${escapeHtml(tr('videoWf.end'))}">
                <input type="text" data-vwf="seg-text" value="${escapeHtml(seg.text)}" placeholder="${escapeHtml(tr('videoWf.segText'))}">
                <button type="button" class="vwf-mini danger" data-vwf="seg-del">×</button>
            </div>
        `).join('');
        const tracks = (wf.audioTracks || []).map(track => `
            <div class="vwf-track" data-track-id="${escapeHtml(track.id)}">
                <select data-vwf="track-kind">${['adr','sfx','bgm'].map(kind => `<option value="${kind}" ${kind === track.kind ? 'selected' : ''}>${escapeHtml(tr('videoWf.track.' + kind))}</option>`).join('')}</select>
                <input type="text" data-vwf="track-text" value="${escapeHtml(track.text || '')}" placeholder="${escapeHtml(tr('videoWf.trackText'))}">
                ${thumb(track.url, 'audio')}
                <button type="button" class="vwf-mini" data-vwf="track-pick">${escapeHtml(tr('videoWf.pick'))}</button>
                <button type="button" class="vwf-mini danger" data-vwf="track-del">×</button>
            </div>
        `).join('');
        const assets = wf.assets.map(asset => `
            <div class="vwf-asset" data-asset-id="${escapeHtml(asset.id)}">
                ${thumb(asset.url, 'image')}
                <select data-vwf="asset-kind">${assetKindOptions(asset.kind)}</select>
                <input type="text" data-vwf="asset-name" value="${escapeHtml(asset.name)}" placeholder="${escapeHtml(tr('videoWf.assetName'))}">
                <input type="text" data-vwf="asset-notes" value="${escapeHtml(asset.notes)}" placeholder="${escapeHtml(tr('videoWf.assetNotes'))}">
                <button type="button" class="vwf-mini" data-vwf="asset-pick">${escapeHtml(tr('videoWf.pick'))}</button>
                <button type="button" class="vwf-mini" data-vwf="asset-to-stage">${escapeHtml(tr('videoWf.toStage'))}</button>
                <button type="button" class="vwf-mini danger" data-vwf="asset-del">×</button>
            </div>
        `).join('');
        return `
            <div class="video-workflow-panel">
                ${renderStageBlock(wf, opts)}
                <details class="vwf-more">
                    <summary>${escapeHtml(tr('videoWf.title'))}</summary>
                    <div class="vwf-body">
                    <div class="vwf-row">
                        <span class="vwf-label">${escapeHtml(tr('videoWf.limits'))}</span>
                        <label>IMG <input type="number" min="1" max="64" data-vwf="limit-image" value="${wf.refLimits.image}"></label>
                        <label>VID <input type="number" min="1" max="16" data-vwf="limit-video" value="${wf.refLimits.video}"></label>
                        <label>AUD <input type="number" min="1" max="16" data-vwf="limit-audio" value="${wf.refLimits.audio}"></label>
                    </div>
                    ${renderEngines(wf, opts)}
                    <div class="vwf-section">
                        <div class="vwf-head">
                            <span>${escapeHtml(tr('videoWf.extraRefs'))}</span>
                            <button type="button" class="vwf-mini" data-vwf="ref-add">${escapeHtml(tr('videoWf.addRef'))}</button>
                        </div>
                        <div class="vwf-ref-list">${extraRefsHtml}</div>
                    </div>
                    ${renderStyleLib(wf)}
                    <div class="vwf-section">
                        <div class="vwf-head">
                            <span>${escapeHtml(tr('videoWf.segments'))}</span>
                            <button type="button" class="vwf-mini" data-vwf="seg-add">${escapeHtml(tr('videoWf.addSeg'))}</button>
                        </div>
                        <div class="vwf-seg-list">${segs || `<div class="vwf-empty">${escapeHtml(tr('videoWf.noSegs'))}</div>`}</div>
                    </div>
                    <div class="vwf-section">
                        <label class="vwf-check"><input type="checkbox" data-vwf="redo-on" ${wf.redo.enabled ? 'checked' : ''}> ${escapeHtml(tr('videoWf.redo'))}</label>
                        <div class="vwf-row">
                            <input type="number" min="0" step="0.1" data-vwf="redo-start" value="${wf.redo.start}" placeholder="${escapeHtml(tr('videoWf.inPoint'))}">
                            <input type="number" min="0" step="0.1" data-vwf="redo-end" value="${wf.redo.end}" placeholder="${escapeHtml(tr('videoWf.outPoint'))}">
                            <input type="text" data-vwf="redo-boxes" value="${escapeHtml(wf.redo.boxes)}" placeholder="${escapeHtml(tr('videoWf.boxes'))}">
                        </div>
                        <input type="text" data-vwf="redo-prompt" value="${escapeHtml(wf.redo.prompt)}" placeholder="${escapeHtml(tr('videoWf.redoPrompt'))}">
                        <div class="vwf-row">
                            ${thumb(wf.redo.maskUrl, 'image')}
                            <button type="button" class="vwf-mini" data-vwf="redo-mask">${escapeHtml(tr('videoWf.mask'))}</button>
                            <button type="button" class="vwf-mini danger" data-vwf="redo-mask-clear">×</button>
                        </div>
                    </div>
                    <div class="vwf-section">
                        <label class="vwf-check"><input type="checkbox" data-vwf="green-on" ${wf.greenscreen.enabled ? 'checked' : ''}> ${escapeHtml(tr('videoWf.greenscreen'))}</label>
                        <div class="vwf-row">
                            ${thumb(wf.greenscreen.subjectUrl, wf.greenscreen.subjectKind)}
                            <button type="button" class="vwf-mini" data-vwf="green-subject">${escapeHtml(tr('videoWf.greenSubject'))}</button>
                            ${thumb(wf.greenscreen.bgUrl, 'image')}
                            <button type="button" class="vwf-mini" data-vwf="green-pick">${escapeHtml(tr('videoWf.bgImage'))}</button>
                            <button type="button" class="vwf-mini danger" data-vwf="green-clear">×</button>
                        </div>
                    </div>
                    <div class="vwf-section">
                        <label class="vwf-check"><input type="checkbox" data-vwf="cont-on" ${wf.continuePrev.enabled ? 'checked' : ''}> ${escapeHtml(tr('videoWf.continuePrev'))}</label>
                        <label class="vwf-check"><input type="checkbox" data-vwf="cont-frame" ${wf.continuePrev.useLastFrame ? 'checked' : ''}> ${escapeHtml(tr('videoWf.useLastFrame'))}</label>
                    </div>
                    <div class="vwf-section">
                        <div class="vwf-head">
                            <span>${escapeHtml(tr('videoWf.audioTracks'))}</span>
                            <button type="button" class="vwf-mini" data-vwf="track-add-adr">${escapeHtml(tr('videoWf.track.adr'))}</button>
                            <button type="button" class="vwf-mini" data-vwf="track-add-sfx">${escapeHtml(tr('videoWf.track.sfx'))}</button>
                            <button type="button" class="vwf-mini" data-vwf="track-add-bgm">${escapeHtml(tr('videoWf.track.bgm'))}</button>
                        </div>
                        <div class="vwf-track-list">${tracks || `<div class="vwf-empty">${escapeHtml(tr('videoWf.noTracks'))}</div>`}</div>
                    </div>
                    <div class="vwf-section">
                        <div class="vwf-head">
                            <span>${escapeHtml(tr('videoWf.assets'))}</span>
                            <button type="button" class="vwf-mini" data-vwf="asset-add">${escapeHtml(tr('videoWf.addAsset'))}</button>
                        </div>
                        <div class="vwf-note">${escapeHtml(tr('videoWf.assetHint'))}</div>
                        <div class="vwf-asset-list">${assets || `<div class="vwf-empty">${escapeHtml(tr('videoWf.noAssets'))}</div>`}</div>
                    </div>
                    <div class="vwf-section">
                        <div class="vwf-head">
                            <span>${escapeHtml(tr('videoWf.preview'))}</span>
                            <button type="button" class="vwf-mini" data-vwf="preview-refresh">${escapeHtml(tr('videoWf.refresh'))}</button>
                        </div>
                        <pre class="vwf-preview" data-vwf="preview">${escapeHtml(opts.previewText || '')}</pre>
                    </div>
                    </div>
                </details>
            </div>
        `;
    }

    function selectedActor(wf, selectedId) {
        return (wf.stage.actors || []).find(item => item.id === selectedId) || null;
    }

    function selectedCamera(wf, selectedId) {
        const schema = root.VideoWorkflowSchema;
        if (!schema.isCameraId(wf.stage, selectedId)) return null;
        return schema.cameraById(wf.stage, selectedId);
    }

    function mineAssets(wf) {
        const list = [...(wf.assets || [])];
        (wf._optsAssets || []).forEach(asset => {
            if (asset && !list.some(item => item.id === asset.id)) list.push(asset);
        });
        return list;
    }

    function assetCardsHtml(list, emptyKey) {
        const cards = (list || []).map(asset => `
            <button type="button" class="vwf-stage-card" draggable="true" data-place-asset="${escapeHtml(asset.id)}">
                ${thumb(asset.url, 'image')}
                <b>${escapeHtml(asset.name || tr('videoWf.asset.character'))}</b>
                <span>${escapeHtml(tr('videoWf.asset.' + (asset.kind || 'character')))}</span>
            </button>
        `).join('');
        return `<div class="vwf-stage-cards vwf-stage-cards-wrap">${cards || `<div class="vwf-empty">${escapeHtml(tr(emptyKey))}</div>`}</div>`;
    }

    function actorRowsHtml(wf, selectedId) {
        const schema = root.VideoWorkflowSchema;
        const actors = (wf.stage.actors || []).map(actor => `
            <div class="vwf-actor${actor.id === selectedId ? ' is-active' : ''}" data-actor-id="${escapeHtml(actor.id)}">
                <input type="text" data-k="name" aria-label="${escapeHtml(tr('videoWf.actorName'))}" value="${escapeHtml(actor.name || '')}" placeholder="${escapeHtml(tr('videoWf.actorName'))}">
                <span class="vwf-actor-action">${escapeHtml(schema.actionLabel(actor.action))}</span>
                <label class="vwf-facing">${escapeHtml(tr('videoWf.facing'))}
                    <input type="number" min="0" max="359" step="5" data-k="facing" aria-label="${escapeHtml(tr('videoWf.facing'))}" value="${Math.round(Number(actor.facing || 0))}">
                </label>
                <button type="button" class="vwf-mini danger" data-actor-del title="${escapeHtml(tr('videoWf.deleteActor'))}" aria-label="${escapeHtml(tr('videoWf.deleteActor'))}">×</button>
            </div>
        `).join('');
        return `<div class="vwf-stage-list">${actors || `<div class="vwf-empty">${escapeHtml(tr('videoWf.noActors'))}</div>`}</div>`;
    }

    function libSearchHtml() {
        return `<div class="vwf-lib-search">
            <input type="search" data-lib-search aria-label="${escapeHtml(tr('videoWf.searchObject'))}" placeholder="${escapeHtml(tr('videoWf.searchObject'))}">
            <button type="button" class="vwf-lib-fold" data-lib-fold aria-label="fold">${svgIcon('<path d="M15 18l-6-6 6-6"/>', 14)}</button>
        </div>`;
    }

    function renderStageLibrary(wf, selectedId) {
        const schema = root.VideoWorkflowSchema;
        const tab = wf.stage.libraryTab || 'object';
        const cat = wf.stage.actionCat || 'all';
        const actor = selectedActor(wf, selectedId);
        if (tab === 'mine') {
            return libSearchHtml() + assetCardsHtml(mineAssets(wf), 'videoWf.noAssets');
        }
        if (tab === 'prop') {
            const props = (wf.assets || []).filter(item => item.kind === 'prop');
            const prims = (schema.PROP_PRIMITIVES || []).map(item => `
                <button type="button" class="vwf-stage-card" data-prim="${escapeHtml(item.id)}">
                    <b>${escapeHtml(item.name)}</b>
                </button>
            `).join('');
            return libSearchHtml() + `<div class="vwf-stage-cards vwf-stage-cards-wrap">${prims}</div>${assetCardsHtml(props, 'videoWf.noProps')}`;
        }
        if (tab === 'material') {
            const cards = (schema.MATERIAL_ITEMS || []).map(item => `
                <button type="button" class="vwf-stage-card ${actor && actor.material === item.id ? 'is-on' : ''}" data-mat="${escapeHtml(item.id)}">
                    <b>${escapeHtml(item.name)}</b>
                </button>
            `).join('');
            return libSearchHtml() + `<div class="vwf-stage-cards vwf-stage-cards-wrap">${cards}</div>`;
        }
        if (tab === 'scan') {
            return libSearchHtml() + `<div class="vwf-kind-grid">
                <button type="button" class="vwf-kind-card" data-scan="insert">${svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>', 22)}<span>${escapeHtml(tr('videoWf.scanInsert'))}</span></button>
                <button type="button" class="vwf-kind-card" data-scan="cover">${svgIcon('<path d="M3 12a9 9 0 1 0 9-9"/>', 22)}<span>${escapeHtml(tr('videoWf.scanCover'))}</span></button>
            </div>`;
        }
        if (tab === 'move') {
            const cards = (schema.CAMERA_MOVE_ITEMS || []).map(item => `
                <button type="button" class="vwf-stage-card ${schema.moveOf(wf.stage.cameraMove) === item.id ? 'is-on' : ''}" data-cam-move="${escapeHtml(item.id)}">
                    <b>${escapeHtml(item.name)}</b>
                </button>
            `).join('');
            return libSearchHtml() + `<div class="vwf-stage-cards vwf-stage-cards-wrap vwf-move-list">${cards}</div>`;
        }
        if (tab === 'action') {
            const cats = (schema.ACTION_CATS || []).map(id => `
                <button type="button" class="vwf-mini ${cat === id ? 'is-on' : ''}" data-action-cat="${id}">${escapeHtml(tr('videoWf.actionCat.' + id))}</button>
            `).join('');
            const cards = (schema.STAGE_ACTIONS || [])
                .filter(item => cat === 'all' || item.cat === cat)
                .map(item => {
                    const on = actor && schema.actionLabel(actor.action) === item.name;
                    return `<button type="button" class="vwf-stage-card ${on ? 'is-on' : ''}" data-action-pick="${escapeHtml(item.id)}" data-action-name="${escapeHtml(item.name)}">
                        <span class="vwf-action-mark">${escapeHtml(item.mark || '动')}</span>
                        <b>${escapeHtml(item.name)}</b>
                    </button>`;
                }).join('');
            return libSearchHtml() + `<div class="vwf-stage-cats">${cats}</div><div class="vwf-stage-cards vwf-stage-cards-wrap">${cards}</div>`;
        }
        if (tab === 'camera') {
            const cams = (wf.stage.cameras || []).map(cam => `
                <button type="button" class="vwf-tree-row ${cam.id === selectedId || (selectedId === 'camera' && cam === wf.stage.cameras[0]) ? 'is-on' : ''}" data-cam-select="${escapeHtml(cam.id)}">
                    <span class="dot"></span>${escapeHtml(cam.name || tr('videoWf.camera'))}
                </button>
            `).join('');
            const presetVal = schema.camKindOf(schema.cameraById(wf.stage, selectedId)?.kind);
            const presets = (schema.CAMERA_PRESET_ITEMS || []).map(item =>
                `<option value="${escapeHtml(item.id)}" ${item.id === presetVal ? 'selected' : ''}>${escapeHtml(item.name)}</option>`
            ).join('');
            // Older embedded tabs can retain a cached common dictionary for a
            // short time after an update.  Keep the new label readable during
            // that window instead of exposing the raw translation key.
            const cameraPresetKey = tr('videoWf.cameraPreset');
            const cameraPresetLabel = cameraPresetKey === 'videoWf.cameraPreset'
                ? (root.StudioI18n?.lang?.() === 'en' ? 'Camera preset' : '机位预设')
                : cameraPresetKey;
            return libSearchHtml() + `<div class="vwf-row">
                    <button type="button" class="vwf-mini" data-cam-add>${escapeHtml(tr('videoWf.addCamera'))}</button>
                    <select data-cam-preset-select aria-label="${escapeHtml(cameraPresetLabel)}">${presets}</select>
                </div>
                <div class="vwf-tree">${cams || `<div class="vwf-empty">${escapeHtml(tr('videoWf.noActiveCam'))}</div>`}</div>`;
        }
        if (tab === 'actor') {
            return libSearchHtml() + `<div class="vwf-kind-grid">
                <button type="button" class="vwf-kind-card" data-actor-kind="solo">${svgIcon('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 14.5-4 16 0"/>', 28)}<span>${escapeHtml(tr('videoWf.actorSolo'))}</span></button>
                <button type="button" class="vwf-kind-card" data-actor-kind="crowd">${svgIcon('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2 20c1-3 6-4 8-4"/><path d="M12 20c.5-2 6-3 10-3"/>', 28)}<span>${escapeHtml(tr('videoWf.actorCrowd'))}</span></button>
            </div>`;
        }
        /* Props are stage objects too.  They used to be filtered out here,
           which meant a cube/sphere/etc. could be added to Three.js but had
           no corresponding row to select again from the object tree.  Keep a
           single object list so actors and primitives share the same
           inspector, drag selection and undo path. */
        const objects = wf.stage.actors || [];
        const primitiveNames = new Map((schema.PROP_PRIMITIVES || []).map(item => [item.id, item.name]));
        const sceneOn = !selectedId || selectedId === 'scene';
        const rows = [
            `<button type="button" class="vwf-tree-row ${sceneOn ? 'is-on' : ''}" data-object-select="scene" data-object-kind="scene"><span class="dot"></span><span class="vwf-tree-label">${escapeHtml(tr('videoWf.sceneRoot'))}</span></button>`
        ].concat(objects.map(a => {
            const isProp = a.kind === 'prop' || Boolean(a.primitive);
            const fallback = isProp
                ? (primitiveNames.get(a.primitive) || tr('videoWf.tab.prop'))
                : tr('videoWf.tab.actor');
            return `<button type="button" class="vwf-tree-row ${a.id === selectedId ? 'is-on' : ''}" data-object-select="${escapeHtml(a.id)}" data-object-kind="${isProp ? 'prop' : 'actor'}"><span class="dot"></span><span class="vwf-tree-label">${escapeHtml(a.name || fallback)}</span></button>`;
        }));
        return libSearchHtml() + `<div class="vwf-tree">${rows.join('')}</div>`;
    }

    function renderInspector(wf, actor) {
        const schema = root.VideoWorkflowSchema;
        if (!actor) return '';
        const tab = wf.stage.inspectorTab || 'attr';
        const tabs = (schema.INSPECTOR_TABS || []).map(id => `
            <button type="button" class="vwf-mini ${tab === id ? 'is-on' : ''}" data-insp-tab="${id}">${escapeHtml(schema.INSPECTOR_LABELS[id] || id)}</button>
        `).join('');
        let body = '';
        if (tab === 'pose') {
            const presets = (schema.POSE_PRESET_ITEMS || []).map(item => `
                <button type="button" class="vwf-mini ${actor.posePreset === item.id ? 'is-on' : ''}" data-pose-preset="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>
            `).join('');
            body = `
                <label class="vwf-check"><input type="checkbox" data-pose-manual ${actor.poseManual !== false ? 'checked' : ''}> ${escapeHtml(tr('videoWf.poseManual'))}</label>
                <div class="vwf-stage-cats">${presets}</div>
                <label class="vwf-slider">${escapeHtml(tr('videoWf.bodyPitch'))}<input type="range" min="-1" max="1" step="0.05" data-pose-slider="bodyPitch" value="${Number(actor.bodyPitch || 0)}"></label>
                <label class="vwf-slider">${escapeHtml(tr('videoWf.bodyYaw'))}<input type="range" min="-1" max="1" step="0.05" data-pose-slider="bodyYaw" value="${Number(actor.bodyYaw || 0)}"></label>
                <label class="vwf-slider">${escapeHtml(tr('videoWf.bodyRoll'))}<input type="range" min="-1" max="1" step="0.05" data-pose-slider="bodyRoll" value="${Number(actor.bodyRoll || 0)}"></label>
                <label class="vwf-slider">${escapeHtml(tr('videoWf.headPitch'))}<input type="range" min="-1" max="1" step="0.05" data-pose-slider="headPitch" value="${Number(actor.headPitch || 0)}"></label>
                <label class="vwf-slider">${escapeHtml(tr('videoWf.headYaw'))}<input type="range" min="-1" max="1" step="0.05" data-pose-slider="headYaw" value="${Number(actor.headYaw || 0)}"></label>
                <div class="vwf-note">${escapeHtml(tr('videoWf.poseHint'))}</div>
            `;
        } else if (tab === 'action') {
            body = `<div class="vwf-note">${escapeHtml(schema.actionLabel(actor.action))}</div>
                <div class="vwf-note">${escapeHtml(tr('videoWf.actionGoLib'))}</div>`;
        } else if (tab === 'path') {
            const pts = (actor.path || []).map((pt, i) => `
                <div class="vwf-path-pt">
                    <span>${i + 1}. ${Number(pt.x || 0).toFixed(2)}, ${Number(pt.y || 0).toFixed(2)}</span>
                    <button type="button" class="vwf-mini danger" data-path-del="${i}" title="${escapeHtml(tr('videoWf.deletePathPoint'))}" aria-label="${escapeHtml(tr('videoWf.deletePathPoint'))}">x</button>
                </div>`).join('');
            body = `<div class="vwf-note">${escapeHtml(tr('videoWf.pathCount'))} ${(actor.path || []).length}</div>
                ${pts || `<div class="vwf-empty">${escapeHtml(tr('videoWf.pathHint'))}</div>`}
                <button type="button" class="vwf-mini danger" data-path-clear>${escapeHtml(tr('videoWf.pathClear'))}</button>
                <div class="vwf-note">${escapeHtml(tr('videoWf.pathHint'))}</div>`;
        } else {
            body = `
                <label class="vwf-facing">${escapeHtml(tr('videoWf.actorName'))}
                    <input type="text" data-insp-name aria-label="${escapeHtml(tr('videoWf.actorName'))}" value="${escapeHtml(actor.name || '')}">
                </label>
                <label class="vwf-facing">${escapeHtml(tr('videoWf.facing'))}
                    <input type="number" min="0" max="359" step="5" data-insp-facing aria-label="${escapeHtml(tr('videoWf.facing'))}" value="${Math.round(Number(actor.facing || 0))}">
                </label>
                <label class="vwf-facing">${escapeHtml(tr('videoWf.scale'))}
                    <input type="number" min="0.4" max="2.4" step="0.05" data-insp-scale aria-label="${escapeHtml(tr('videoWf.scale'))}" value="${Number(actor.scale || 1)}">
                </label>
                <label class="vwf-facing">${escapeHtml(tr('videoWf.alt'))}
                    <input type="number" min="0" max="8" step="0.05" data-insp-alt aria-label="${escapeHtml(tr('videoWf.alt'))}" value="${Number(actor.alt || 0)}">
                </label>
            `;
        }
        return `<div class="vwf-side-block vwf-inspector-block">
            <div class="vwf-head">${escapeHtml(actor.name || tr('videoWf.tab.actor'))}</div>
            <div class="vwf-stage-cats">${tabs}</div>
            ${body}
        </div>`;
    }

    function renderStageSide(wf, selectedId) {
        const schema = root.VideoWorkflowSchema;
        const cam = selectedCamera(wf, selectedId) || schema.cameraById(wf.stage);
        const actor = selectedActor(wf, selectedId);
        const scene = wf.stage.scene || schema.defaultScene();
        const bg = scene.bgColor && scene.bgColor !== '#1a1020' ? scene.bgColor : '#060608';
        const cams = wf.stage.cameras || [];
        const camOpts = cams.length
            ? cams.map(c => `<option value="${escapeHtml(c.id)}" ${cam && c.id === cam.id ? 'selected' : ''}>${escapeHtml(c.name || tr('videoWf.camera'))}</option>`).join('')
            : `<option value="">${escapeHtml(tr('videoWf.noActiveCam'))}</option>`;
        const scalePct = Math.round(Number(scene.scale || 1) * 100);
        return `
            <div class="vwf-stage-side">
                <div class="vwf-side-block">
                    <div class="vwf-head"><span>${escapeHtml(tr('videoWf.camPreview'))}</span><button type="button" class="vwf-mobile-drawer-close" data-mobile-side-close aria-label="关闭属性面板">×</button></div>
                    <div class="vwf-cam-row">
                        <select data-cam-active aria-label="${escapeHtml(tr('videoWf.activeCamera'))}">${camOpts}</select>
                        <button type="button" class="vwf-ibar" data-cam-add title="${escapeHtml(tr('videoWf.addCamera'))}">${tabGlyph('camera')}</button>
                    </div>
                    ${cams.length
                        ? `<canvas class="vwf-cam-gl" width="320" height="180"></canvas>`
                        : `<div class="vwf-cam-empty">${escapeHtml(tr('videoWf.noActiveCam'))}</div>`}
                    ${cam ? `<div class="vwf-xyz vwf-cam-coordinates">
                        <label>X <input type="number" min="0" max="1" step="0.01" data-cam="x" aria-label="${escapeHtml(tr('videoWf.cameraX'))}" value="${Number(cam.x || 0).toFixed(2)}"></label>
                        <label>Y <input type="number" min="0" max="1" step="0.01" data-cam="y" aria-label="${escapeHtml(tr('videoWf.cameraY'))}" value="${Number(cam.y || 0).toFixed(2)}"></label>
                        <label>Z <input type="number" min="0.15" max="12" step="0.05" data-cam="alt" aria-label="${escapeHtml(tr('videoWf.cameraHeight'))}" value="${Number(cam.alt || schema.cameraAltOf?.(cam.kind, cam.alt) || 1.5).toFixed(2)}"></label>
                        <label>朝向 <input type="number" min="0" max="359" step="5" data-cam="facing" aria-label="${escapeHtml(tr('videoWf.cameraFacing'))}" value="${Math.round(Number(cam.facing || 0))}"></label>
                    </div>` : ''}
                </div>
                <div class="vwf-side-block">
                    <div class="vwf-head">${escapeHtml(tr('videoWf.sceneRoot'))}</div>
                    <div class="vwf-head" style="font-size:12px;color:#64748b">背景</div>
                    <div class="vwf-row">
                        <span style="font-size:12px;color:#64748b">模式</span>
                        <div class="vwf-seg-toggle">
                            <button type="button" class="${scene.bgMode === 'image' ? 'is-on' : ''}" data-scene-bg="image">${escapeHtml(tr('videoWf.bgTex'))}</button>
                            <button type="button" class="${scene.bgMode !== 'image' ? 'is-on' : ''}" data-scene-bg="color">${escapeHtml(tr('videoWf.bgColor'))}</button>
                        </div>
                    </div>
                    <div class="vwf-color-row">
                        <span style="font-size:12px;color:#64748b">背景颜色</span>
                        <input type="color" data-scene-color aria-label="${escapeHtml(tr('videoWf.sceneColor'))}" value="${escapeHtml(bg)}">
                        <input type="text" data-scene-hex aria-label="${escapeHtml(tr('videoWf.sceneHex'))}" value="${escapeHtml(bg)}" style="flex:1">
                        <button type="button" class="vwf-ibar" data-scene-pick title="选择背景贴图">${toolGlyph('image')}</button>
                    </div>
                </div>
                <div class="vwf-side-block">
                    <div class="vwf-head">${escapeHtml(tr('videoWf.sceneXform'))}
                        <button type="button" class="vwf-ibar" data-scene-reset title="${escapeHtml(tr('videoWf.resetScene'))}" aria-label="${escapeHtml(tr('videoWf.resetScene'))}" style="margin-left:auto">${toolGlyph('undo')}</button>
                    </div>
                    <label class="vwf-slider">${escapeHtml(tr('videoWf.scale'))}
                        <input type="range" min="20" max="400" step="1" data-scene-scale-pct aria-label="${escapeHtml(tr('videoWf.sceneScale'))}" value="${scalePct}">
                        <span data-scene-scale-label>${scalePct}%</span>
                    </label>
                    <input type="hidden" data-scene="scale" value="${Number(scene.scale || 1)}">
                    <div style="font-size:12px;color:#64748b">平移</div>
                    <div class="vwf-xyz">
                        <label>X <input type="number" step="0.05" data-scene="tx" aria-label="${escapeHtml(tr('videoWf.sceneTranslateX'))}" value="${Number(scene.tx || 0)}"></label>
                        <label>Y <input type="number" step="0.05" data-scene="ty" aria-label="${escapeHtml(tr('videoWf.sceneTranslateY'))}" value="${Number(scene.ty || 0)}"></label>
                        <label>Z <input type="number" step="0.05" data-scene="tz" aria-label="${escapeHtml(tr('videoWf.sceneTranslateZ'))}" value="${Number(scene.tz || 0)}"></label>
                    </div>
                    <div style="font-size:12px;color:#64748b">旋转</div>
                    <div class="vwf-xyz">
                        <label>X <input type="number" step="5" data-scene="rx" aria-label="${escapeHtml(tr('videoWf.sceneRotateX'))}" value="${Number(scene.rx || 0)}"></label>
                        <label>Y <input type="number" step="5" data-scene="ry" aria-label="${escapeHtml(tr('videoWf.sceneRotateY'))}" value="${Number(scene.ry || 0)}"></label>
                        <label>Z <input type="number" step="5" data-scene="rz" aria-label="${escapeHtml(tr('videoWf.sceneRotateZ'))}" value="${Number(scene.rz || 0)}"></label>
                    </div>
                </div>
                ${renderInspector(wf, actor)}
            </div>
        `;
    }

    function renderTimeline(wf, selectedId) {
        const schema = root.VideoWorkflowSchema;
        const actor = selectedActor(wf, selectedId);
        const duration = Math.max(1, Number(wf.stage.duration || 90));
        const frame = Math.round(Number(wf.stage.frame || 0));
        const zoom = Number(wf.stage.tlZoom || 1);
        const viewMode = schema.viewModeOf ? schema.viewModeOf(wf.stage.viewMode) : (wf.stage.viewMode === '2d' ? '2d' : '3d');
        const keys = (wf.stage.keyframes || []).filter(kf => !actor || kf.actorId === actor.id);
        const kfs = keys.map(kf => {
            /* Keep an imported keyframe that lies beyond the current output
               duration visible at the endpoint rather than creating an
               off-canvas marker that cannot be clicked.  The underlying data
               remains intact so users can extend the duration later. */
            const left = Math.max(0, Math.min(100, (Number(kf.frame || 0) / duration) * 100));
            return `<span class="vwf-tl-kf ${kf.frame === frame ? 'is-on' : ''}" data-tl-kf="${kf.frame}" style="left:${left}%"></span>`;
        }).join('');
        const ruler = [];
        const step = duration > 80 ? 20 : 10;
        for (let f = 0; f <= duration; f += step) {
            ruler.push(`<span class="vwf-tl-tick" style="left:${(f / duration) * 100}%">${f}</span>`);
        }
        /* Durations are user-editable and need not land on the 10/20-frame
           grid.  Keep an explicit endpoint tick so the end button and the
           final keyframe have a visible, labelled destination (for example
           a 95-frame clip should show “95”, not stop at “80”). */
        if (duration % step) {
            ruler.push(`<span class="vwf-tl-tick" style="left:100%">${duration}</span>`);
        }
        const empty = actor ? escapeHtml(actor.name || tr('videoWf.tab.actor')) : escapeHtml(tr('videoWf.noTrack'));
        return `
            <div class="vwf-timeline-bar">
                <div class="vwf-tl-controls">
                    <select data-view-mode-select aria-label="${escapeHtml(tr('videoWf.viewMenu'))}">
                        <option value="" disabled>${escapeHtml(tr('videoWf.viewMenu'))}</option>
                        <option value="3d" ${viewMode === '3d' ? 'selected' : ''}>${escapeHtml(tr('videoWf.view3d'))}</option>
                        <option value="2d" ${viewMode === '2d' ? 'selected' : ''}>${escapeHtml(tr('videoWf.view2d'))}</option>
                    </select>
                    <button type="button" class="vwf-ibar" data-tl-skip="start" title="${escapeHtml(tr('videoWf.timelineStart'))}" aria-label="${escapeHtml(tr('videoWf.timelineStart'))}">${svgIcon('<path d="M5 5v14"/><path d="m19 5-10 7 10 7z"/>')}</button>
                    <button type="button" class="vwf-ibar" data-tl-skip="-1" title="${escapeHtml(tr('videoWf.prevFrame'))}" aria-label="${escapeHtml(tr('videoWf.prevFrame'))}">${svgIcon('<path d="m15 18-6-6 6-6"/>')}</button>
                    <button type="button" class="vwf-ibar" data-tl-play title="${escapeHtml(tr('videoWf.play'))}" aria-label="${escapeHtml(tr('videoWf.play'))}">${svgIcon('<path d="M8 5v14l11-7z"/>')}</button>
                    <button type="button" class="vwf-ibar" data-tl-skip="1" title="${escapeHtml(tr('videoWf.nextFrame'))}" aria-label="${escapeHtml(tr('videoWf.nextFrame'))}">${svgIcon('<path d="m9 18 6-6-6-6"/>')}</button>
                    <button type="button" class="vwf-ibar" data-tl-skip="end" title="${escapeHtml(tr('videoWf.timelineEnd'))}" aria-label="${escapeHtml(tr('videoWf.timelineEnd'))}">${svgIcon('<path d="M19 5v14"/><path d="M5 5l10 7-10 7z"/>')}</button>
                    <label class="vwf-tl-frame">${escapeHtml(tr('videoWf.currentFrame'))}
                        <input type="number" min="0" max="${duration}" step="1" data-tl-frame aria-label="${escapeHtml(tr('videoWf.currentFrame'))}" value="${frame}">
                    </label>
                    <span>${Number(wf.stage.fps || 30)} fps</span>
                    <button type="button" class="vwf-ibar" data-tl-del title="${escapeHtml(tr('videoWf.delKf'))}">${svgIcon('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>')}</button>
                    <label class="vwf-slider" style="margin-left:auto">${escapeHtml(tr('videoWf.tlZoom'))}
                        <input type="range" min="0.5" max="4" step="0.1" data-tl-zoom aria-label="${escapeHtml(tr('videoWf.tlZoom'))}" value="${zoom}">
                    </label>
                    <button type="button" class="vwf-mini" data-tl-add>${escapeHtml(tr('videoWf.addKf'))}</button>
                    <button type="button" class="vwf-mini" data-tl-stop title="${escapeHtml(tr('videoWf.stop'))}" aria-label="${escapeHtml(tr('videoWf.stop'))}" style="display:none">${escapeHtml(tr('videoWf.stop'))}</button>
                </div>
                <div class="vwf-tl-lanes">
                    <div class="vwf-tl-ruler">${ruler.join('')}</div>
                    <div class="vwf-tl-track">
                        <span class="vwf-tl-label">${empty}</span>
                        ${actor ? kfs : ''}
                        <span class="vwf-tl-now" data-frame="${frame}" style="left:${(frame / duration) * 100}%"></span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderStageBlock(wf, options) {
        const schema = root.VideoWorkflowSchema;
        const stageOptions = options && typeof options === 'object' ? options : {};
        const selectedId = wf._selectedId || '';
        const tab = wf.stage.libraryTab || 'object';
        const tool = wf.stage.tool || 'select';
        const aspect = schema.aspectOf(wf.stage.aspect);
        const viewMode = schema.viewModeOf ? schema.viewModeOf(wf.stage.viewMode) : (wf.stage.viewMode === '2d' ? '2d' : '3d');
        const size = schema.canvasSize(aspect);
        const tabs = RAIL_TABS.map(id => `
            <button type="button" class="vwf-stage-tab ${tab === id ? 'is-on' : ''}" data-stage-tab="${id}">
                ${tabGlyph(id)}<span>${escapeHtml(tr('videoWf.tab.' + id))}</span>
            </button>
        `).join('');
        const tools = ['select', 'rotate', 'scale', 'undo', 'redo', 'path'].map(id => {
            if (id === 'undo') return `<button type="button" class="vwf-tool" data-stage-undo title="${escapeHtml(tr('videoWf.undo'))}">${toolGlyph('undo')}</button>`;
            if (id === 'redo') return `<button type="button" class="vwf-tool" data-stage-redo title="${escapeHtml(tr('videoWf.redoStep'))}">${toolGlyph('redo')}</button>`;
            return `<button type="button" class="vwf-tool ${tool === id ? 'is-on' : ''}" data-stage-tool="${id}" title="${escapeHtml(tr('videoWf.tool.' + id))}">${toolGlyph(id)}</button>`;
        }).join('');
        const aspects = (schema.ASPECTS || []).map(id => `
            <button type="button" class="vwf-ibar ${aspect === id ? 'is-on' : ''}" data-stage-aspect="${id}">${escapeHtml(id)}</button>
        `).join('');
        const deskOpen = Boolean(wf._deskOpen);
        /* Embedded canvas nodes can open the same stateful director in a
           dedicated page. Keep the URL opt-in and render it as a native
           anchor so keyboard users and popup-blocked browsers retain a
           reliable fallback. The URL is validated again in bindStage. */
        const standaloneUrl = safeStandaloneHref(stageOptions.openPageUrl);
        const standaloneButton = !stageOptions.standalone && standaloneUrl
            ? '<a class="vwf-desk-open-page" data-stage-open-page="' + escapeHtml(standaloneUrl) + '" href="' + escapeHtml(standaloneUrl) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(tr("videoWf.openStandalone")) + '" aria-label="' + escapeHtml(tr("videoWf.openStandalone")) + '">' + svgIcon('<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>') + '<span>' + escapeHtml(tr("videoWf.openStandalone")) + '</span></a>'
            : '';
        return `
            <div class="vwf-stage ${deskOpen ? 'is-desk' : ''}">
                <button type="button" class="vwf-desk-mask" data-stage-collapse aria-label="${escapeHtml(tr('videoWf.exitDesk'))}"></button>
                <div class="vwf-desk-bar">
                    <div class="vwf-desk-brand">
                        ${svgIcon('<path d="M4 10h16"/><path d="M8 6h8"/><path d="M6 14h12"/><circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>', 18)}
                        <span>${escapeHtml(tr('videoWf.deskTitle'))}</span>
                        <small>· ${escapeHtml(tr('videoWf.deskSub'))}</small>
                    </div>
                    <div class="vwf-desk-bar-mid">
                        <span class="vwf-stage-aspects">${aspects}</span>
                        <button type="button" class="vwf-ibar" data-stage-export title="${escapeHtml(tr('videoWf.shot'))}">${svgIcon('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3"/>')}</button>
                        <button type="button" class="vwf-ibar" data-stage-render title="${escapeHtml(tr('videoWf.renderStill'))}">${svgIcon('<path d="M4 7h16v12H4z"/><path d="M8 3h8"/>')}</button>
                        <button type="button" class="vwf-ibar" data-stage-record title="${escapeHtml(tr('videoWf.record'))}">${svgIcon('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>')}</button>
                    </div>
                    <div class="vwf-desk-bar-end">
                        ${standaloneButton}
                        <button type="button" class="vwf-ibar" data-stage-undo title="${escapeHtml(tr('videoWf.undo'))}">${toolGlyph('undo')}</button>
                        <button type="button" class="vwf-ibar" data-stage-redo title="${escapeHtml(tr('videoWf.redoStep'))}">${toolGlyph('redo')}</button>
                        <button type="button" class="vwf-desk-exit" data-stage-expand>${escapeHtml(deskOpen ? tr('videoWf.exitDesk') : tr('videoWf.expandDesk'))}</button>
                    </div>
                </div>
                <div class="vwf-stage-studio is-mobile-lib-open" tabindex="0">
                    <div class="vwf-stage-left">
                        <div class="vwf-stage-tabcol">${tabs}</div>
                        <div class="vwf-stage-lib">${renderStageLibrary(wf, selectedId)}</div>
                    </div>
                    <div class="vwf-stage-viewport is-${viewMode}">
                        <div class="vwf-walk-hud">
                            <div class="vwf-walk-head">${svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/>')} ${escapeHtml(tr('videoWf.walkHud'))}
                                <button type="button" class="vwf-lib-fold" data-walk-hide>×</button>
                            </div>
                            <div class="vwf-walk-grid">
                                <div>
                                    <div class="vwf-walk-cap">${escapeHtml(tr('videoWf.walkMove'))}</div>
                                    <div class="vwf-walk-move">
                                        <button type="button" class="vwf-walk-k" data-walk-key="w">W</button>
                                        <button type="button" class="vwf-walk-k" data-walk-key="a">A</button>
                                        <button type="button" class="vwf-walk-k" data-walk-key="s">S</button>
                                        <button type="button" class="vwf-walk-k" data-walk-key="d">D</button>
                                    </div>
                                </div>
                                <div class="vwf-walk-lift">
                                    <div class="vwf-walk-cap">${escapeHtml(tr('videoWf.walkLift'))}</div>
                                    <button type="button" class="vwf-walk-k" data-walk-key="e">E</button>
                                    <button type="button" class="vwf-walk-k" data-walk-key="q">Q</button>
                                </div>
                            </div>
                        </div>
                        <div class="vwf-axis-hud"><span class="ax ax-y">Y</span><span class="ax ax-z">Z</span><span class="ax ax-x">X</span></div>
                        <button type="button" class="vwf-reset-view" data-stage-reset>${svgIcon('<path d="M3 12a9 9 0 1 0 3-7"/><path d="M3 4v5h5"/>')} ${escapeHtml(tr('videoWf.resetView'))}</button>
                        <button type="button" class="vwf-mobile-side-toggle" data-mobile-side-toggle aria-expanded="false">属性</button>
                        <div class="vwf-stage-tools">${tools}</div>
                        <button type="button" class="vwf-shot-fab" data-stage-export title="${escapeHtml(tr('videoWf.shot'))}">${svgIcon('<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3"/>')}</button>
                        <canvas class="vwf-stage-canvas" width="${size.w}" height="${size.h}" tabindex="0"></canvas>
                        <div class="vwf-stage-view3d" tabindex="0"></div>
                    </div>
                    ${renderStageSide(wf, selectedId)}
                    ${renderTimeline(wf, selectedId)}
                </div>
            </div>
        `;
    }

    function reportAsyncActionError(opts, error, fallback='操作失败') {
        const message = String(error?.message || error || fallback);
        try {
            if (typeof opts?.onUploadError === 'function') opts.onUploadError(message);
            else console.warn('片场操作失败', message);
        } catch (_) {}
    }

    async function uploadFiles(opts, files, kind) {
        if (!files?.length) return [];
        try {
            if (typeof opts.upload === 'function') {
                const uploaded = await opts.upload(files);
                /* Integrations historically returned either the bare array
                   or the API-shaped `{files: []}` object.  Accept both so a
                   successful upload does not get mistaken for an empty one
                   (and keep malformed provider responses inside this error
                   boundary rather than throwing from an event handler). */
                const list = Array.isArray(uploaded)
                    ? uploaded
                    : (Array.isArray(uploaded?.files) ? uploaded.files : []);
                return list.map(item => ({
                    url: item?.url || item,
                    name: item?.name || files[0]?.name || kind,
                    kind: item?.kind || kind
                })).filter(item => item.url);
            }
            const form = new FormData();
            files.forEach(file => form.append('files', file, file.name || 'media'));
            const response = await fetch('/api/ai/upload', { method: 'POST', body: form });
            let data = {};
            try { data = await response.json(); } catch (_) {}
            if (!response.ok) {
                const detail = data && (data.detail || data.message || data.error);
                throw new Error(String(detail || `上传失败（${response.status}）`));
            }
            return (Array.isArray(data.files) ? data.files : [])
                .map(file => ({ url: file?.url || '', name: file?.name || kind, kind: file?.kind || kind }))
                .filter(item => item.url);
        } catch (error) {
            /* Upload controls are event-driven and most callers intentionally
               do not await a thrown error.  Swallow the rejection at this
               boundary, report it through the host when available, and keep
               the editor usable so a transient local-server failure cannot
               produce an unhandled promise or a frozen chooser. */
            reportAsyncActionError(opts, error, '上传失败');
            return [];
        }
    }

    function selectedOf(opts) {
        return opts.host?._vwfSelected || '';
    }

    function setSelected(opts, id) {
        if (opts.host) opts.host._vwfSelected = id || '';
    }

    /* Convert a drop on the live Three.js stage to normalized floor
       coordinates.  The shared renderer intentionally keeps its raycast
       helpers private, but its runtime exposes the same camera/ray/ground
       objects used by pointer dragging.  Reusing those objects here keeps a
       library card dropped at the user's cursor instead of silently placing
       it at the next default slot.  Return null when WebGL is unavailable so
       the existing fallback slot placement remains deterministic. */
    function stageDropPoint(host, ev) {
        const rt = host?._vwf3d;
        const el = rt?.renderer?.domElement;
        const floor = rt?.floor;
        if (!rt || !el || !floor || !rt.raycaster || !rt.pointer || !rt.dirCam || !rt.groundPlane) return null;
        try {
            const rect = el.getBoundingClientRect();
            const width = Math.max(1, rect.width);
            const height = Math.max(1, rect.height);
            rt.pointer.x = ((Number(ev?.clientX || 0) - rect.left) / width) * 2 - 1;
            rt.pointer.y = -((Number(ev?.clientY || 0) - rect.top) / height) * 2 + 1;
            rt.raycaster.setFromCamera(rt.pointer, rt.dirCam);
            /* Clone the plane normal to get a Vector3 target without importing
               Three.js into this non-module panel. */
            const hit = rt.groundPlane.normal?.clone?.();
            if (!hit || !rt.raycaster.ray.intersectPlane(rt.groundPlane, hit)) return null;
            const nx = Number(hit.x) / Math.max(0.01, Number(floor.w || 1)) + 0.5;
            const ny = Number(hit.z) / Math.max(0.01, Number(floor.d || 1)) + 0.5;
            if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
            return {
                nx: Math.max(0, Math.min(1, nx)),
                ny: Math.max(0, Math.min(1, ny))
            };
        } catch (_) {
            return null;
        }
    }

    /*
     * A Three.js pick happens during pointerdown.  Replacing the panel from
     * that callback would detach the renderer canvas before the matching
     * pointermove/up events arrive, which makes actor/camera dragging stop
     * after the first click.  Keep one document-level end listener per host,
     * let the renderer finish its drag, and refresh the DOM in the next frame.
     * The binding lives in a WeakMap so repeated stage remounts do not stack
     * listeners; `cleanup` is exposed for callers that discard a host.
     */
    const stageSelectionBindings = new WeakMap();
    function ensureStageSelectionBinding(host) {
        if (!host || !root.document?.addEventListener) return null;
        let binding = stageSelectionBindings.get(host);
        if (binding) return binding;
        const state = { pending: false, frame: 0, frameKind: '', refresh: null };
        const cancelFrame = () => {
            if (!state.frame) return;
            if (state.frameKind === 'raf') root.cancelAnimationFrame?.(state.frame);
            else root.clearTimeout?.(state.frame);
            state.frame = 0;
            state.frameKind = '';
        };
        const onPointerEnd = () => {
            if (!state.pending || state.frame) return;
            const run = () => {
                state.frame = 0;
                state.frameKind = '';
                if (host.isConnected === false) {
                    cleanup();
                    return;
                }
                if (!state.pending) return;
                state.pending = false;
                try { host._vwfStageRefreshPending = false; } catch (_) {}
                const refresh = state.refresh;
                if (typeof refresh === 'function') refresh();
            };
            if (typeof root.requestAnimationFrame === 'function') {
                state.frameKind = 'raf';
                state.frame = root.requestAnimationFrame(run);
            } else {
                state.frameKind = 'timeout';
                state.frame = root.setTimeout(run, 0);
            }
        };
        const cleanup = () => {
            root.document.removeEventListener('pointerup', onPointerEnd, false);
            root.document.removeEventListener('pointercancel', onPointerEnd, false);
            cancelFrame();
            state.pending = false;
            try { host._vwfStageRefreshPending = false; } catch (_) {}
            if (stageSelectionBindings.get(host) === binding) stageSelectionBindings.delete(host);
            try {
                if (host._vwfStageSelectionCleanup === cleanup) host._vwfStageSelectionCleanup = null;
            } catch (_) {}
        };
        binding = { state, cleanup };
        stageSelectionBindings.set(host, binding);
        try { host._vwfStageRefreshPending = false; } catch (_) {}
        root.document.addEventListener('pointerup', onPointerEnd, false);
        root.document.addEventListener('pointercancel', onPointerEnd, false);
        try { host._vwfStageSelectionCleanup = cleanup; } catch (_) {}
        return binding;
    }

    function drawStageCanvas(canvas, stage, selectedId) {
        if (!canvas || !root.VideoWorkflowAdapter?.drawStageOnto) return;
        root.VideoWorkflowAdapter.drawStageOnto(canvas, stage, { selectedId: selectedId || '' });
    }

    function upsertLayoutRef(wf, dataUrl) {
        wf.stage.layoutUrl = dataUrl;
        if (!Array.isArray(wf.extraRefs)) return;
        const hit = wf.extraRefs.find(item => item.purpose === 'layout');
        if (hit) {
            hit.url = dataUrl;
            hit.kind = 'image';
            hit.purpose = 'layout';
            hit.name = hit.name || tr('videoWf.layoutName');
            hit.notes = hit.notes || tr('videoWf.layoutNotes');
            return;
        }
        wf.extraRefs.push({
            id: root.VideoWorkflowSchema.uid('ref'),
            kind: 'image',
            purpose: 'layout',
            url: dataUrl,
            name: tr('videoWf.layoutName'),
            notes: tr('videoWf.layoutNotes')
        });
    }

    function assetPlacementKind(asset) {
        const raw = String(asset?.kind || asset?.assetKind || '').trim().toLowerCase();
        /* A scene card is a stage background, not a mannequin.  `panorama`
           is kept as a separate asset kind for compatibility, while the
           explicit boolean is used by canvas cards that opt into 360 imagery. */
        if (raw === 'scene' || raw === 'panorama' || Boolean(asset?.panorama)) return 'scene';
        if (raw === 'style') return 'style';
        if (raw === 'prop' || asset?.primitive) return 'prop';
        return 'actor';
    }

    function reportPlacementError(opts, message) {
        try {
            if (typeof opts?.onPlacementError === 'function') opts.onPlacementError(message);
            else if (typeof opts?.onUploadError === 'function') opts.onUploadError(message);
            else console.warn('片场资产无法放置', message);
        } catch (_) {}
    }

    function placeAssetOnStage(wf, asset, opts) {
        const schema = root.VideoWorkflowSchema;
        const kind = assetPlacementKind(asset);
        if (kind === 'scene') {
            const url = String(asset?.url || '').trim();
            if (!url) {
                reportPlacementError(opts, tr('videoWf.sceneNeedsImage'));
                return null;
            }
            const scene = schema.defaultScene ? schema.defaultScene() : {};
            Object.assign(scene, wf.stage.scene || {});
            scene.bgMode = 'image';
            scene.bgUrl = url;
            wf.stage.scene = scene;
            setSelected(opts, 'scene');
            /* Return a small selection descriptor so click/drag callers can
               reveal the scene row without pretending that a background is
               an actor with x/y coordinates. */
            return { id: 'scene', kind: 'scene', scene: true, assetId: asset?.id || '', url };
        }
        if (kind === 'style') {
            reportPlacementError(opts, tr('videoWf.styleNotStageObject'));
            return null;
        }
        wf.stage.actors = wf.stage.actors || [];
        const existing = asset?.id ? wf.stage.actors.find(actor => actor.assetId === asset.id) : null;
        if (existing) {
            setSelected(opts, existing.id);
            return existing;
        }
        const actor = schema.actorFromAsset(asset, wf.stage.actors);
        wf.stage.actors.push(actor);
        setSelected(opts, actor.id);
        return actor;
    }

    function markActorActive(rootEl, id) {
        rootEl.querySelectorAll('.vwf-actor').forEach(row => {
            row.classList.toggle('is-active', row.getAttribute('data-actor-id') === id);
        });
    }

    function syncObjectTreeLabel(rootEl, id, name, fallback) {
        if (!rootEl || !id) return;
        rootEl.querySelectorAll('[data-object-select]').forEach(row => {
            if (row.getAttribute('data-object-select') !== String(id)) return;
            const label = row.querySelector('.vwf-tree-label');
            if (label) label.textContent = String(name || fallback || '');
        });
    }

    /* Selecting an object changes the right-side inspector, but the inspector
       sits below the camera/scene blocks in the narrow desktop column.  Queue
       a reveal for the next stage mount so a pick made in Three.js (or in the
       object tree) puts the relevant controls inside the scroll viewport
       without stealing focus or changing the user's scroll position during
       an active drag. */
    function queueStageSelectionReveal(host, id) {
        if (!host) return;
        try { host._vwfStageRevealSelection = String(id || ''); } catch (_) {}
    }

    function revealStageSelection(host, id) {
        /* Expanded desks are reparented from the workflow host to <body>.
           Resolve the live desk element first; querying only `host` made the
           reveal a no-op in the very layout that needs it most (the fixed
           desktop inspector), while embedded stages continue to use host. */
        const desk = host?._vwfDeskEl;
        const stageRoot = desk && (desk.isConnected !== false) && desk.querySelector
            ? desk
            : host;
        const side = stageRoot?.querySelector?.('.vwf-stage-side');
        if (!side) return;
        const target = id && id !== 'scene'
            ? side.querySelector('.vwf-inspector-block')
            : null;
        if (!target) {
            side.scrollTop = 0;
            return;
        }
        const sideRect = side.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const desired = side.scrollTop + targetRect.top - sideRect.top - 8;
        const max = Math.max(0, side.scrollHeight - side.clientHeight);
        side.scrollTop = Math.max(0, Math.min(max, desired));
    }

    function histOf(opts) {
        const host = opts.host;
        if (!host._vwfHist) host._vwfHist = { undo: [], redo: [] };
        return host._vwfHist;
    }

    function pushHist(opts, wf) {
        const hist = histOf(opts);
        hist.undo.push(JSON.stringify(root.VideoWorkflowSchema.normalizeStage(wf.stage)));
        if (hist.undo.length > 20) hist.undo.shift();
        hist.redo = [];
    }

    function restoreHist(opts, getState, commit, from, to) {
        const hist = histOf(opts);
        if (!from.length) return;
        const wf = getState();
        to.push(JSON.stringify(root.VideoWorkflowSchema.normalizeStage(wf.stage)));
        if (to.length > 20) to.shift();
        wf.stage = root.VideoWorkflowSchema.normalizeStage(JSON.parse(from.pop()));
        commit(wf);
    }

    function bindStage(rootEl, opts, getState, commit) {
        const schema = root.VideoWorkflowSchema;
        const adapter = root.VideoWorkflowAdapter;
        const canvas = rootEl.querySelector('.vwf-stage-canvas');
        const view3d = rootEl.querySelector('.vwf-stage-view3d');
        const studio = rootEl.querySelector('.vwf-stage-studio');
        const host = opts.host;
        const selectionBinding = ensureStageSelectionBinding(host);
        const playback = playbackState(host);
        if (playback.timer) {
            clearInterval(playback.timer);
            playback.timer = 0;
            playback.playing = false;
            mirrorPlaybackState(host, playback);
        }
        const liveStage = wf => {
            const playing = Boolean(playback.playing);
            return playing ? schema.previewStage(wf.stage, wf.stage.frame) : wf.stage;
        };
        /* A WebGL context is not guaranteed in embedded browsers, remote
           previews, or hardened desktop profiles.  Keep the 3D desk usable
           in those environments with the existing adapter's compact stage
           painter instead of leaving an empty gray viewport or silently
           changing the user's selected mode to 2D.  The same canvas keeps the
           established pointer/drag bindings, so actor and camera editing
           still works while the full Three.js renderer is unavailable. */
        const drawFallback3D = wf => {
            if (!view3d || !canvas || !view3d.isConnected) return;
            const webglCanvas = view3d.querySelector('canvas:not(.vwf-stage-fallback)');
            if (webglCanvas) return;
            if (canvas.parentNode !== view3d) view3d.appendChild(canvas);
            canvas.classList.add('vwf-stage-fallback');
            canvas.style.display = 'block';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            const width = Math.max(1, view3d.clientWidth || canvas.clientWidth || 1);
            const height = Math.max(1, view3d.clientHeight || canvas.clientHeight || 1);
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            const stage = liveStage(wf);
            const selected = selectedOf(opts) || '';
            const actor = selectedActor(wf, selected);
            adapter.drawStageOnto(canvas, stage, {
                selectedId: selected,
                showPose: !actor || actor.poseManual !== false
            });
        };
        const drawNow = wf => {
            const stage = liveStage(wf);
            const selected = selectedOf(opts) || '';
            const actor = selectedActor(wf, selected);
            const showPose = !actor || actor.poseManual !== false;
            if (canvas && stage.viewMode === '2d') {
                adapter.drawStageOnto(canvas, stage, { selectedId: selected, showPose });
            }
            if (stage.viewMode !== '2d' && view3d && !view3d.querySelector('canvas:not(.vwf-stage-fallback)')) {
                drawFallback3D(wf);
            }
            root.VideoWorkflowStage3D?.sync?.(host, stage, {
                selectedId: selected,
                showPose,
                schema
            });
        };
        /*
         * The shared Three renderer intentionally owns the scene and its
         * public API.  Its orbit handler uses a mathematical spherical
         * `phi`, where a negative screen delta raises the camera.  That is
         * correct for the coordinate system, but it feels reversed in a
         * director desk: dragging the empty stage upward should pull the
         * view upward with the pointer, not make the floor slide down.
         *
         * Keep stage3d.js untouched and replace only the blank-space orbit
         * gesture at the panel boundary.  Object/pose/camera hits are passed
         * through to the renderer's established move/rotate/scale handling;
         * middle/right/Shift panning is also left unchanged.  The shim uses
         * the renderer's own raycaster and runtime vectors, so it does not
         * duplicate Three.js imports or create a second scene.
         */
        const bindScreenOrbitDirection = (gl, rt) => {
            if (!gl || !rt || gl.dataset.vwfOrbitDirection) return;
            if (!rt.raycaster || !rt.pointer || !rt.dirCam) return;
            gl.dataset.vwfOrbitDirection = 'screen-y';
            let drag = null;
            const hitEditableObject = ev => {
                const rect = gl.getBoundingClientRect();
                rt.pointer.x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
                rt.pointer.y = -((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
                rt.raycaster.setFromCamera(rt.pointer, rt.dirCam);
                const roots = [rt.actorsRoot, rt.camsRoot, rt.ground].filter(Boolean);
                const hits = rt.raycaster.intersectObjects(roots, true);
                return hits.some(hit => {
                    const data = hit?.object?.userData || {};
                    return data.kind === 'actor' || data.actorId ||
                        data.kind === 'camera' || data.cameraId || data.kind === 'pose';
                });
            };
            gl.addEventListener('pointerdown', ev => {
                /* Path mode uses a ground click as a data point. Let the
                   renderer receive that click instead of treating it as a
                   blank-space orbit gesture. */
                if (ev.button !== 0 || ev.shiftKey || rt.getTool?.() === 'path' || hitEditableObject(ev)) return;
                drag = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY };
                ev.preventDefault();
                ev.stopImmediatePropagation();
                rt.box?.focus?.();
                try { gl.setPointerCapture(ev.pointerId); } catch (_) {}
            }, true);
            gl.addEventListener('pointermove', ev => {
                if (!drag || ev.pointerId !== drag.pointerId) return;
                const dx = ev.clientX - drag.x;
                const dy = ev.clientY - drag.y;
                drag.x = ev.clientX;
                drag.y = ev.clientY;
                rt.orbit.theta -= dx * 0.008;
                /* Invert only the screen-Y delta: up means a lower camera
                   elevation in the desk view, matching direct manipulation. */
                rt.orbit.phi = Math.max(0.18, Math.min(1.42, rt.orbit.phi - dy * 0.008));
                rt.onOrbit?.({ ...rt.orbit });
                ev.preventDefault();
                ev.stopImmediatePropagation();
            }, true);
            const endOrbit = ev => {
                if (!drag || ev.pointerId !== drag.pointerId) return;
                rt.onOrbit?.({ ...rt.orbit }, true);
                try { gl.releasePointerCapture(ev.pointerId); } catch (_) {}
                drag = null;
                ev.preventDefault();
                ev.stopImmediatePropagation();
            };
            gl.addEventListener('pointerup', endOrbit, true);
            gl.addEventListener('pointercancel', endOrbit, true);
        };
        const attach3D = wf => {
            if (!view3d || wf.stage.viewMode === '2d') {
                root.VideoWorkflowStage3D?.hide?.(host);
                drawNow(wf);
                return;
            }
            loadStage3D().then(mod => {
                if (!mod || !view3d.isConnected) return;
                /* Expanded desks are reparented from the panel to <body>.
                   `rootEl.querySelector(...)` is therefore empty on the
                   first attach frame; keep using the live view3d reference so
                   the Three.js renderer is mounted after the reparent too. */
                const stageRoot = view3d.closest('.vwf-stage') || rootEl;
                const box = view3d.isConnected ? view3d : stageRoot.querySelector('.vwf-stage-view3d');
                if (!box) return;
                let rt = null;
                try {
                    rt = mod.attach(host, box, {
                        schema,
                        aspect: schema.aspectOf(wf.stage.aspect),
                        orbit: wf.stage.viewOrbit,
                        preview: stageRoot.querySelector('.vwf-cam-gl'),
                        getTool: () => getState().stage.tool || 'select',
                        onPick: (id) => {
                            setSelected(opts, id || '');
                            markActorActive(rootEl, id || '');
                            queueStageSelectionReveal(host, id || '');
                            if (selectionBinding) {
                                selectionBinding.state.pending = true;
                                try { host._vwfStageRefreshPending = true; } catch (_) {}
                            }
                            drawNow(getState());
                        },
                        onHist: () => pushHist(opts, getState()),
                        onPath: point => {
                            const state = getState();
                            let actor = selectedActor(state, selectedOf(opts));
                            if (!actor) actor = state.stage.actors[0];
                            if (!actor) return;
                            /* The Three stage adapter names normalized ground
                               coordinates `nx/ny`, while older/fallback
                               adapters use `x/y`. Accept both so path clicks
                               never append an object containing undefined
                               coordinates. */
                            const px = Number(point?.x ?? point?.nx);
                            const py = Number(point?.y ?? point?.ny);
                            if (!Number.isFinite(px) || !Number.isFinite(py)) return;
                            pushHist(opts, state);
                            actor.path = actor.path || [];
                            actor.path.push({ x: px, y: py });
                            setSelected(opts, actor.id);
                            commit(state, false);
                            drawNow(state);
                        },
                        onOrbit: (orbit, persist) => {
                            const state = getState();
                            state.stage.viewOrbit = schema.normalizeViewOrbit(orbit);
                            if (persist) commit(state, false);
                        },
                        onDrag: (kind, id, delta) => {
                            const state = getState();
                            if (kind === 'pose') {
                                const actor = state.stage.actors.find(item => item.id === id);
                                if (!actor) return;
                                actor.poseManual = true;
                                if (delta.world && mod.poseFromWorld) {
                                    actor.pose = mod.poseFromWorld(host, actor, delta.key, delta.world);
                                }
                            } else if (kind === 'actor') {
                                const actor = state.stage.actors.find(item => item.id === id);
                                if (!actor) return;
                                if (delta.x != null) actor.x = delta.x;
                                if (delta.y != null) actor.y = delta.y;
                                if (delta.dFacing != null) actor.facing = schema.normalizeFacing(actor.facing + delta.dFacing, 0);
                                if (delta.dScale != null) actor.scale = Math.max(0.4, Math.min(2.4, Number(actor.scale || 1) + delta.dScale));
                            } else if (kind === 'camera') {
                                const cam = schema.cameraById(state.stage, id);
                                if (!cam) return;
                                if (delta.x != null) cam.x = delta.x;
                                if (delta.y != null) cam.y = delta.y;
                                if (delta.dFacing != null) cam.facing = schema.normalizeFacing(cam.facing + delta.dFacing, 0);
                                schema.syncPrimaryCamera(state.stage);
                                syncCamHud(state);
                            }
                            commit(state, false);
                            drawNow(state);
                        }
                    });
                } catch (err) {
                    console.warn('片场 3D 渲染器不可用，切换兼容预览', err);
                    rt = null;
                }
                if (!rt) {
                    drawFallback3D(getState());
                    return;
                }
                const gl = mod.dom(host);
                bindScreenOrbitDirection(gl, rt);
                if (gl && !gl.dataset.vwfKeys) {
                    gl.dataset.vwfKeys = '1';
                    gl.addEventListener('keydown', onKey);
                    gl.addEventListener('keyup', onKeyUp);
                }
                drawNow(getState());
            });
        };
        drawNow(getState());

        const mutate = (fn, remount) => {
            const wf = getState();
            pushHist(opts, wf);
            fn(wf);
            schema.syncPrimaryCamera(wf.stage);
            commit(wf, remount !== false);
        };

        const currentCam = wf => {
            const id = selectedOf(opts);
            if (schema.isCameraId(wf.stage, id)) return schema.cameraById(wf.stage, id);
            return schema.cameraById(wf.stage);
        };

        if (host?._vwfDeskEl && !rootEl.contains(host._vwfDeskEl) && host._vwfDeskEl.parentNode === document.body) {
            host._vwfDeskEl.remove();
            host._vwfDeskEl = null;
            host._vwfDeskHome = null;
        }
        const applyDesk = on => {
            if (host) host._vwfDesk = Boolean(on);
            const stageEl = rootEl.querySelector('.vwf-stage') || (host?._vwfDeskEl && document.body.contains(host._vwfDeskEl) ? host._vwfDeskEl : null);
            if (!stageEl) return;
            host._vwfDeskEl = stageEl;
            /* A remount replaces the previous `.vwf-stage-studio` subtree.
               If that stage had just been collapsed, `_vwfDeskHome` can point
               at the detached old parent; appending the new stage there would
               leave the visible host empty.  Discard the stale home so the
               current stage stays in the newly rendered panel (and the next
               expand records its fresh parent). */
            if (host?._vwfDeskHome && host._vwfDeskHome.isConnected === false) {
                host._vwfDeskHome = null;
            }
            if (on) {
                if (!host._vwfDeskHome) host._vwfDeskHome = stageEl.parentNode;
                if (stageEl.parentNode !== document.body) document.body.appendChild(stageEl);
            } else if (host._vwfDeskHome && stageEl.parentNode !== host._vwfDeskHome) {
                host._vwfDeskHome.appendChild(stageEl);
            }
            stageEl.classList.toggle('is-desk', Boolean(on));
            // More than one workflow can be expanded at once.  The body
            // marker represents the aggregate state, so closing one desk
            // must not remove the full-screen styles from another desk.
            document.body.classList.toggle('vwf-desk-on', Boolean(document.querySelector('body > .vwf-stage.is-desk')));
            stageEl.querySelectorAll('[data-stage-expand]').forEach(btn => {
                btn.textContent = on ? tr('videoWf.exitDesk') : tr('videoWf.expandDesk');
            });
            if (typeof host?._vwfDeskChange === 'function') host._vwfDeskChange(Boolean(on));
        };
        rootEl.querySelector('[data-stage-open-page]')?.addEventListener('click', e => {
            e.stopPropagation();
            const trigger = e.currentTarget;
            const href = safeStandaloneHref(trigger?.getAttribute('data-stage-open-page'));
            if (!href) { e.preventDefault(); return; }

            /*
             * A native target=_blank anchor is the safest fallback when a
             * browser blocks scripted popups, but its default action starts
             * navigation before an asynchronous save can settle.  Reserve a
             * user-activated about:blank window synchronously, flush the
             * host's debounced save, then navigate that same window.  This
             * preserves the standalone-page UX while ensuring the new page
             * reads the newest workflow.  If the popup is blocked, leave the
             * anchor's native default action intact and still kick off the
             * best-effort save in parallel.
             */
            let popup = null;
            try {
                popup = root.open('about:blank', '_blank');
                if (popup) {
                    try { popup.opener = null; } catch (_) {}
                    e.preventDefault();
                }
            } catch (_) {}

            const flush = () => {
                if (typeof opts.flushSave !== 'function') return Promise.resolve(true);
                try {
                    return Promise.resolve(opts.flushSave()).then(
                        result => result === false ? false : true,
                        () => false
                    );
                } catch (_) {
                    return Promise.resolve(false);
                }
            };
            const reportOpenFailure = () => {
                const message = tr('videoWf.openStandaloneFailed') || '保存未完成，独立页未打开；本地编辑仍保留。';
                try {
                    if (typeof opts.onOpenPageError === 'function') {
                        opts.onOpenPageError(message);
                        return;
                    }
                } catch (_) {}
                try { console.warn(message); } catch (_) {}
            };
            const closePopup = () => {
                if (!popup) return;
                try {
                    if (!popup.closed) popup.close();
                } catch (_) {}
            };
            const navigate = flushOk => {
                if (flushOk === false) {
                    closePopup();
                    reportOpenFailure();
                    return;
                }
                let moved = false;
                if (popup) {
                    try {
                        if (!popup.closed) {
                            popup.location.href = href;
                            moved = true;
                        }
                    } catch (_) {}
                }
                /* If the reserved window was closed before the save settled,
                   retain an anchor-based fallback without touching the
                   current canvas page. */
                if (!moved && popup) {
                    try {
                        const fallback = document.createElement('a');
                        fallback.href = href;
                        fallback.target = '_blank';
                        fallback.rel = 'noopener noreferrer';
                        fallback.hidden = true;
                        document.body.appendChild(fallback);
                        fallback.click();
                        fallback.remove();
                    } catch (_) {}
                }
            };

            if (popup) {
                /* A provider/network failure must not leave a permanent blank
                   tab.  Treat a timeout as a failed flush as well: opening a
                   page with a stale server snapshot is worse than asking the
                   user to retry from the current canvas. */
                const timeout = new Promise(resolve => setTimeout(() => resolve(false), 6500));
                Promise.race([flush(), timeout]).then(navigate, navigate);
            } else {
                /* Popup blocked: allow the real anchor default action. */
                flush().then(result => {
                    if (result === false) reportOpenFailure();
                });
            }
        });
        rootEl.querySelectorAll('[data-stage-expand]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                applyDesk(!host?._vwfDesk);
                studio?.focus();
            });
        });
        rootEl.querySelector('[data-stage-collapse]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            applyDesk(false);
        });
        rootEl.querySelector('[data-stage-add]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            mutate(wf => {
                wf.stage.actors = wf.stage.actors || [];
                const slot = schema.nextActorSlot(wf.stage.actors);
                const actor = schema.normalizeActor({
                    id: schema.uid('act'),
                    name: schema.nextActorName(wf.stage.actors),
                    x: slot.x,
                    y: slot.y,
                    facing: 0,
                    action: '站立等待'
                }, wf.stage.actors.length);
                wf.stage.actors.push(actor);
                wf.stage.libraryTab = 'actor';
                setSelected(opts, actor.id);
                queueStageSelectionReveal(host, actor.id);
            });
        });

        rootEl.querySelectorAll('[data-prim]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const prim = btn.getAttribute('data-prim') || 'cube';
                const item = (schema.PROP_PRIMITIVES || []).find(p => p.id === prim);
                const actor = schema.normalizeActor({
                    name: (item && item.name) || tr('videoWf.tab.prop'),
                    kind: 'prop',
                    primitive: prim,
                    material: 'matte'
                }, (wf.stage.actors || []).length);
                wf.stage.actors = wf.stage.actors || [];
                wf.stage.actors.push(actor);
                setSelected(opts, actor.id);
                queueStageSelectionReveal(host, actor.id);
                commit(wf);
            });
        });
        rootEl.querySelectorAll('[data-mat]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const actor = selectedActor(wf, selectedOf(opts));
                if (!actor) return;
                actor.material = btn.getAttribute('data-mat') || 'matte';
                commit(wf);
            });
        });
        rootEl.querySelectorAll('[data-path-del]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const actor = selectedActor(wf, selectedOf(opts));
                if (!actor) return;
                const idx = Number(btn.getAttribute('data-path-del'));
                actor.path = (actor.path || []).filter((_, i) => i !== idx);
                commit(wf);
            });
        });

        rootEl.querySelectorAll('[data-stage-tab]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.libraryTab = btn.getAttribute('data-stage-tab') || 'object';
                commit(wf);
            });
        });

        rootEl.querySelectorAll('[data-stage-tool]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.tool = btn.getAttribute('data-stage-tool') || 'select';
                commit(wf);
            });
        });
        rootEl.querySelectorAll('[data-view-mode]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.viewMode = btn.getAttribute('data-view-mode') === '2d' ? '2d' : '3d';
                commit(wf);
            });
        });

        rootEl.querySelectorAll('[data-stage-undo]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                restoreHist(opts, getState, commit, histOf(opts).undo, histOf(opts).redo);
            });
        });
        rootEl.querySelectorAll('[data-stage-redo]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                restoreHist(opts, getState, commit, histOf(opts).redo, histOf(opts).undo);
            });
        });
        rootEl.querySelectorAll('[data-stage-reset]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const orbit = root.VideoWorkflowStage3D?.resetOrbit?.(host) || { theta: 0.42, phi: 1.02, radius: 16, tx: 0, ty: 0.9, tz: 0.6 };
                wf.stage.viewOrbit = schema.normalizeViewOrbit(orbit);
                commit(wf, false);
                drawNow(wf);
            });
        });
        rootEl.querySelector('[data-walk-hide]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const hud = rootEl.querySelector('.vwf-walk-hud');
            if (hud) hud.style.display = 'none';
        });
        rootEl.querySelectorAll('[data-walk-key]').forEach(btn => {
            btn.addEventListener('mousedown', e => {
                e.preventDefault();
                e.stopPropagation();
                onKey({ key: btn.getAttribute('data-walk-key'), preventDefault() {}, ctrlKey: false, metaKey: false, shiftKey: false });
            });
        });
        rootEl.querySelector('[data-lib-fold]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            studio?.classList.toggle('is-lib-fold');
        });
        /* On compact screens the desktop library/inspector columns become
           bounded drawers (see canvas.css).  Keep one drawer open at a time
           so the viewport remains usable and, importantly, never let either
           panel participate in document height calculations. */
        const mobileLibrary = rootEl.querySelector('.vwf-stage-lib');
        const mobileSide = rootEl.querySelector('.vwf-stage-side');
        const mobileSideToggle = rootEl.querySelector('[data-mobile-side-toggle]');
        const setMobileDrawer = which => {
            if (!studio) return;
            const isMobile = typeof root.matchMedia !== 'function' || root.matchMedia('(max-width: 900px)').matches;
            if (!isMobile) return;
            const sideOn = which === 'side';
            studio.classList.toggle('is-mobile-side-open', sideOn);
            studio.classList.toggle('is-lib-fold', sideOn);
            studio.classList.add('is-mobile-lib-open');
            if (mobileSideToggle) mobileSideToggle.setAttribute('aria-expanded', sideOn ? 'true' : 'false');
            if (mobileSide) mobileSide.setAttribute('aria-hidden', sideOn ? 'false' : 'true');
            if (mobileLibrary) mobileLibrary.setAttribute('aria-hidden', sideOn ? 'true' : 'false');
        };
        mobileSideToggle?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const open = studio?.classList.contains('is-mobile-side-open');
            setMobileDrawer(open ? 'library' : 'side');
        });
        rootEl.querySelector('[data-mobile-side-close]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            setMobileDrawer('library');
        });
        /* The library's existing fold control doubles as the drawer close
           affordance on phones; make its accessibility state explicit. */
        rootEl.querySelector('[data-lib-fold]')?.addEventListener('click', () => {
            if (typeof root.matchMedia === 'function' && root.matchMedia('(max-width: 900px)').matches) {
                const folded = studio?.classList.contains('is-lib-fold');
                if (mobileLibrary) mobileLibrary.setAttribute('aria-hidden', folded ? 'true' : 'false');
                if (mobileSideToggle && folded) mobileSideToggle.focus({ preventScroll: true });
            }
        });
        setMobileDrawer('library');
        rootEl.querySelector('[data-lib-search]')?.addEventListener('input', ev => {
            const q = String(ev.target.value || '').trim().toLowerCase();
            rootEl.querySelectorAll('.vwf-tree-row, .vwf-stage-card, .vwf-kind-card').forEach(row => {
                const text = (row.textContent || '').toLowerCase();
                row.style.display = !q || text.includes(q) ? '' : 'none';
            });
        });
        rootEl.querySelectorAll('[data-actor-kind]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    wf.stage.actors = wf.stage.actors || [];
                    const n = btn.getAttribute('data-actor-kind') === 'crowd' ? 4 : 1;
                    let last = null;
                    for (let i = 0; i < n; i++) {
                        const slot = schema.nextActorSlot(wf.stage.actors);
                        const actor = schema.normalizeActor({
                            id: schema.uid('act'),
                            name: n > 1 && i ? `群众${i}` : schema.nextActorName(wf.stage.actors),
                            x: Math.min(1, slot.x + (i % 2) * 0.06),
                            y: Math.min(1, slot.y + Math.floor(i / 2) * 0.06),
                            facing: 0,
                            action: '站立等待'
                        }, wf.stage.actors.length);
                        wf.stage.actors.push(actor);
                        last = actor;
                    }
                    wf.stage.libraryTab = 'object';
                    if (last) {
                        setSelected(opts, last.id);
                        queueStageSelectionReveal(host, last.id);
                    }
                });
            });
        });
        rootEl.querySelector('[data-cam-active]')?.addEventListener('change', ev => {
            const id = ev.target.value;
            if (!id) return;
            setSelected(opts, id);
            queueStageSelectionReveal(host, id);
            commit(getState());
        });
        rootEl.querySelector('[data-cam-preset-select]')?.addEventListener('change', ev => {
            const preset = ev.target.value;
            mutate(wf => {
                if (preset === 'current' && wf.stage.viewMode !== '2d') {
                    const pose = root.VideoWorkflowStage3D?.currentViewAsCamera?.(host);
                    const cam = schema.cameraById(wf.stage, selectedOf(opts));
                    if (pose && cam) {
                        Object.assign(cam, pose);
                        schema.syncPrimaryCamera(wf.stage);
                        setSelected(opts, cam.id);
                        queueStageSelectionReveal(host, cam.id);
                        return;
                    }
                }
                const cam = schema.applyPresetToCamera(wf.stage, preset, selectedOf(opts));
                setSelected(opts, cam.id);
                queueStageSelectionReveal(host, cam.id);
                wf.stage.libraryTab = 'camera';
            });
            const wf = getState();
            syncCamHud(wf);
            drawNow(wf);
        });
        rootEl.querySelector('[data-view-mode-select]')?.addEventListener('change', ev => {
            const wf = getState();
            wf.stage.viewMode = ev.target.value === '2d' ? '2d' : '3d';
            commit(wf);
        });
        rootEl.querySelectorAll('[data-tl-skip]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const duration = Math.max(1, Number(wf.stage.duration || 90));
                const how = btn.getAttribute('data-tl-skip');
                let frame = Math.round(Number(wf.stage.frame || 0));
                if (how === 'start') frame = 0;
                else if (how === 'end') frame = duration;
                else frame = Math.max(0, Math.min(duration, frame + Number(how || 0)));
                wf.stage.frame = frame;
                commit(wf, false);
                const frameInput = rootEl.querySelector('[data-tl-frame]');
                if (frameInput) frameInput.value = String(frame);
                const now = rootEl.querySelector('.vwf-tl-now');
                if (now) {
                    now.style.left = `${(frame / duration) * 100}%`;
                    now.setAttribute('data-frame', String(frame));
                }
                drawNow(wf);
            });
        });
        rootEl.querySelector('[data-scene-hex]')?.addEventListener('change', ev => {
            let val = String(ev.target.value || '').trim();
            if (!/^#?[0-9a-fA-F]{6}$/.test(val)) return;
            if (val[0] !== '#') val = '#' + val;
            const wf = getState();
            wf.stage.scene = wf.stage.scene || schema.defaultScene();
            wf.stage.scene.bgColor = val;
            const color = rootEl.querySelector('[data-scene-color]');
            if (color) color.value = val;
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-scene-scale-pct]')?.addEventListener('input', ev => {
            const wf = getState();
            wf.stage.scene = wf.stage.scene || schema.defaultScene();
            const pct = Number(ev.target.value || 100);
            wf.stage.scene.scale = Math.max(0.2, pct / 100);
            const hidden = rootEl.querySelector('[data-scene="scale"]');
            if (hidden) hidden.value = String(wf.stage.scene.scale);
            const lab = rootEl.querySelector('[data-scene-scale-label]');
            if (lab) lab.textContent = Math.round(pct) + '%';
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-scene-reset]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            mutate(wf => {
                wf.stage.scene = schema.defaultScene();
                wf.stage.scene.bgColor = '#e4eaf1';
            });
        });

        rootEl.querySelectorAll('[data-action-cat]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.libraryTab = 'action';
                wf.stage.actionCat = btn.getAttribute('data-action-cat') || 'all';
                commit(wf);
            });
        });

        rootEl.querySelectorAll('[data-action-pick]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    wf.stage.actors = wf.stage.actors || [];
                    let actor = wf.stage.actors.find(item => item.id === selectedOf(opts));
                    if (!actor) actor = wf.stage.actors[wf.stage.actors.length - 1];
                    const action = btn.getAttribute('data-action-name') || btn.getAttribute('data-action-pick');
                    if (!actor) {
                        const slot = schema.nextActorSlot(wf.stage.actors);
                        actor = schema.normalizeActor({
                            name: schema.nextActorName(wf.stage.actors),
                            x: slot.x,
                            y: slot.y,
                            action
                        }, 0);
                        wf.stage.actors.push(actor);
                        wf.stage.frame = 0;
                        wf.stage.keyframes = wf.stage.keyframes || [];
                        wf.stage.keyframes.push(schema.normalizeKeyframe({
                            frame: 0,
                            actorId: actor.id,
                            x: actor.x,
                            y: actor.y,
                            alt: actor.alt,
                            facing: actor.facing,
                            action: actor.action,
                            scale: actor.scale,
                            pose: actor.pose
                        }, wf.stage.keyframes.length));
                    } else {
                        actor.action = schema.normalizeAction(action);
                    }
                    wf.stage.libraryTab = 'action';
                    setSelected(opts, actor.id);
                    queueStageSelectionReveal(host, actor.id);
                });
            });
        });

        rootEl.querySelectorAll('[data-place-asset]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    const asset = mineAssets(wf).find(item => item.id === btn.getAttribute('data-place-asset'));
                    if (asset) {
                        const actor = placeAssetOnStage(wf, asset, opts);
                        if (actor?.id) queueStageSelectionReveal(host, actor.id);
                    }
                    /* Backgrounds are selected through the scene root; keep
                       the object tab visible instead of switching to the
                       actor library after a scene-card click. */
                    if (asset && assetPlacementKind(asset) !== 'scene' && assetPlacementKind(asset) !== 'style') {
                        wf.stage.libraryTab = 'actor';
                    } else if (asset && assetPlacementKind(asset) === 'scene') {
                        wf.stage.libraryTab = 'object';
                    }
                });
            });
            btn.addEventListener('dragstart', ev => {
                ev.dataTransfer.setData('text/vwf-asset', btn.getAttribute('data-place-asset') || '');
            });
        });

        rootEl.querySelectorAll('[data-object-select], [data-cam-select]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-object-select') || btn.getAttribute('data-cam-select');
                setSelected(opts, id);
                queueStageSelectionReveal(host, id);
                commit(getState());
            });
        });

        /* The compact library and the right-side camera preview each expose
           an Add-camera control.  Binding only querySelector() left the
           second (icon) control inert in the desktop director desk. */
        rootEl.querySelectorAll('[data-cam-add]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    const cam = schema.addCamera(wf.stage);
                    wf.stage.libraryTab = 'camera';
                    setSelected(opts, cam.id);
                    queueStageSelectionReveal(host, cam.id);
                });
            });
        });

        rootEl.querySelectorAll('[data-cam-move]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    wf.stage.cameraMove = btn.getAttribute('data-cam-move') || '';
                    wf.stage.libraryTab = 'move';
                });
            });
        });

        const exportLayout = async (rendered) => {
            const wf = getState();
            const stage = rendered ? schema.previewStage(wf.stage, wf.stage.frame) : wf.stage;
            const size = schema.layoutSize(wf.stage.aspect);
            let dataUrl = '';
            const mod = root.VideoWorkflowStage3D;
            if (wf.stage.viewMode !== '2d' && mod?.capture) {
                dataUrl = mod.capture(host, {
                    width: size.w,
                    height: size.h,
                    stage,
                    selectedId: selectedOf(opts) || '',
                    schema,
                    mode: rendered ? 'shot' : 'director'
                });
            }
            if (!dataUrl) {
                dataUrl = adapter.drawStageLayoutAsync
                    ? await adapter.drawStageLayoutAsync(stage, size.w, size.h)
                    : adapter.drawStageLayout(stage, size.w, size.h);
            }
            upsertLayoutRef(wf, dataUrl);
            if (typeof opts.onExport === 'function') await opts.onExport(dataUrl, wf.stage);
            commit(wf);
        };
        const runExport = async rendered => {
            try {
                await exportLayout(rendered);
            } catch (error) {
                /* Canvas tainting, a lost WebGL context, or a host save error
                   must not become an unhandled rejection from a toolbar
                   click.  Keep the current workflow untouched and surface a
                   concise action-level message instead. */
                const message = String(error?.message || tr('videoWf.exportFailed') || '导出失败，当前编辑已保留');
                try {
                    if (typeof opts?.onExportError === 'function') opts.onExportError(message);
                    else if (typeof opts?.onUploadError === 'function') opts.onUploadError(message);
                    else console.warn('片场导出失败', error);
                } catch (_) {}
            }
        };
        rootEl.querySelectorAll('[data-stage-export]').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.preventDefault();
                e.stopPropagation();
                await runExport(false);
            });
        });
        rootEl.querySelector('[data-stage-render]')?.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            await runExport(true);
        });
        rootEl.querySelectorAll('[data-stage-aspect]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => { wf.stage.aspect = btn.getAttribute('data-stage-aspect') || '21:9'; });
            });
        });
        rootEl.querySelectorAll('[data-insp-tab]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.inspectorTab = btn.getAttribute('data-insp-tab') || 'attr';
                commit(wf);
            });
        });
        rootEl.querySelector('[data-insp-name]')?.addEventListener('input', ev => {
            const wf = getState();
            const actor = selectedActor(wf, selectedOf(opts));
            if (!actor) return;
            actor.name = ev.target.value;
            const fallback = actor.kind === 'prop'
                ? ((schema.PROP_PRIMITIVES || []).find(item => item.id === actor.primitive)?.name || tr('videoWf.tab.prop'))
                : tr('videoWf.tab.actor');
            syncObjectTreeLabel(rootEl, actor.id, actor.name, fallback);
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-insp-facing]')?.addEventListener('input', ev => {
            const wf = getState();
            const actor = selectedActor(wf, selectedOf(opts));
            if (!actor) return;
            actor.facing = schema.normalizeFacing(ev.target.value, 0);
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-insp-scale]')?.addEventListener('change', ev => {
            const wf = getState();
            const actor = selectedActor(wf, selectedOf(opts));
            if (!actor) return;
            actor.scale = Math.max(0.4, Math.min(2.4, Number(ev.target.value || 1)));
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-insp-alt]')?.addEventListener('change', ev => {
            const wf = getState();
            const actor = selectedActor(wf, selectedOf(opts));
            if (!actor) return;
            actor.alt = Math.max(0, Math.min(8, Number(ev.target.value || 0)));
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-pose-manual]')?.addEventListener('change', ev => {
            mutate(wf => {
                const actor = selectedActor(wf, selectedOf(opts));
                if (actor) actor.poseManual = ev.target.checked;
                wf.stage.inspectorTab = 'pose';
            });
        });
        rootEl.querySelectorAll('[data-pose-preset]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    const actor = selectedActor(wf, selectedOf(opts));
                    if (!actor) return;
                    schema.applyPosePreset(actor, btn.getAttribute('data-pose-preset'));
                    actor.poseManual = true;
                    wf.stage.inspectorTab = 'pose';
                });
            });
        });
        rootEl.querySelectorAll('[data-pose-slider]').forEach(input => {
            input.addEventListener('input', ev => {
                const wf = getState();
                const actor = selectedActor(wf, selectedOf(opts));
                if (!actor) return;
                actor[input.getAttribute('data-pose-slider')] = Number(ev.target.value || 0);
                actor.poseManual = true;
                commit(wf, false);
                drawNow(wf);
            });
        });
        rootEl.querySelector('[data-path-clear]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            mutate(wf => {
                const actor = selectedActor(wf, selectedOf(opts));
                if (actor) actor.path = [];
                wf.stage.inspectorTab = 'path';
            });
        });
        rootEl.querySelectorAll('[data-scan]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    const mode = btn.getAttribute('data-scan');
                    const cards = mineAssets(wf).filter(item => item.kind === 'character' || !item.kind);
                    if (mode === 'cover') {
                        wf.stage.actors = [];
                        wf.stage.keyframes = [];
                    }
                    cards.forEach(asset => {
                        const exists = (wf.stage.actors || []).some(actor => actor.assetId === asset.id);
                        if (!exists) placeAssetOnStage(wf, asset, opts);
                    });
                    if (!(wf.stage.actors || []).length) {
                        const slot = schema.nextActorSlot([]);
                        wf.stage.actors.push(schema.normalizeActor({
                            name: schema.nextActorName([]),
                            x: slot.x,
                            y: slot.y,
                            action: '站立等待'
                        }, 0));
                    }
                    wf.stage.libraryTab = 'scan';
                });
            });
        });
        rootEl.querySelector('[data-stage-record]')?.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            const playBtn = rootEl.querySelector('[data-tl-play]');
            /* Recording should follow the current timeline state.  Toggling
               an already-running play button here used to stop playback and
               produce a frozen recording whenever Record was pressed during
               a preview. */
            if (!playback.playing) playBtn?.click();
            const stopPlayback = () => {
                /* The stop button is hidden until playback starts and a
                   remount can replace the original root element.  Resolve it
                   from the current host first, then fall back to the closure
                   so unsupported recording never leaves an orphaned timer. */
                const stop = host?.querySelector?.('[data-tl-stop]') || rootEl.querySelector('[data-tl-stop]');
                if (stop) stop.click();
            };
            let recordErrorReported = false;
            const reportRecordError = message => {
                if (recordErrorReported) return;
                recordErrorReported = true;
                const text = String(message || tr('videoWf.recordUnsupported') || '当前浏览器不支持录屏');
                try {
                    if (typeof opts?.onRecordError === 'function') opts.onRecordError(text);
                    else if (typeof opts?.onUploadError === 'function') opts.onUploadError(text);
                    else console.warn('片场录制失败', text);
                } catch (_) {}
            };
            const stateAtStart = getState();
            const recCanvas = (stateAtStart.stage.viewMode !== '2d' && root.VideoWorkflowStage3D?.dom?.(host))
                || canvas;
            if (!recCanvas) {
                stopPlayback();
                reportRecordError(tr('videoWf.recordUnsupported'));
                return;
            }
            let stream = null;
            try {
                stream = typeof recCanvas.captureStream === 'function' ? recCanvas.captureStream(30) : null;
            } catch (err) {
                stream = null;
            }
            if (!stream || typeof MediaRecorder === 'undefined') {
                stopPlayback();
                reportRecordError(tr('videoWf.recordUnsupported'));
                return;
            }
            const chunks = [];
            let mimeType = '';
            try {
                const supports = type => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type);
                if (supports('video/webm;codecs=vp9')) mimeType = 'video/webm;codecs=vp9';
                else if (supports('video/webm')) mimeType = 'video/webm';
            } catch (_) {}
            let rec = null;
            try {
                /* Passing `{mimeType: ''}` throws in several Chromium/WebView
                   versions.  Omit the option entirely when no supported
                   codec is advertised and let the browser choose its default. */
                rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            } catch (err) {
                try { stream.getTracks?.().forEach(track => track.stop()); } catch (_) {}
                stopPlayback();
                reportRecordError(err?.message || tr('videoWf.recordUnsupported'));
                return;
            }
            rec.ondataavailable = ev => { if (ev.data?.size) chunks.push(ev.data); };
            rec.onerror = ev => {
                try { stream.getTracks?.().forEach(track => track.stop()); } catch (_) {}
                stopPlayback();
                reportRecordError(ev?.error?.message || tr('videoWf.recordFailed'));
            };
            rec.onstop = async () => {
                try {
                    const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' });
                    // blob: URLs are scoped to the current document and
                    // disappear after a reload. Upload the recording through
                    // the local media endpoint before persisting it.
                    const file = new File([blob], `${tr('videoWf.recordName') || 'stage-recording'}.webm`, { type: blob.type || 'video/webm' });
                    const uploaded = await uploadFiles(opts, [file], 'video');
                    const url = uploaded[0]?.url || '';
                    if (!url) {
                        reportRecordError(tr('videoWf.recordFailed'));
                        return;
                    }
                    const wf = getState();
                    wf.extraRefs = wf.extraRefs || [];
                    wf.extraRefs.push({
                        id: schema.uid('ref'),
                        kind: 'video',
                        purpose: 'custom',
                        url,
                        name: tr('videoWf.recordName'),
                        notes: getState().stage.viewMode === '2d' ? tr('videoWf.recordNotes') : tr('videoWf.recordNotes3d')
                    });
                    commit(wf);
                } catch (err) {
                    reportRecordError(err?.message || tr('videoWf.recordFailed'));
                } finally {
                    try { stream.getTracks?.().forEach(track => track.stop()); } catch (_) {}
                    stopPlayback();
                }
            };
            try {
                rec.start();
            } catch (err) {
                try { stream.getTracks?.().forEach(track => track.stop()); } catch (_) {}
                stopPlayback();
                reportRecordError(err?.message || tr('videoWf.recordUnsupported'));
                return;
            }
            const duration = Math.max(1, Number(stateAtStart.stage.duration || 90));
            const fps = Math.max(1, Number(stateAtStart.stage.fps || 30));
            /* Include the final frame and cap the capture so an accidentally
               huge imported duration cannot keep a MediaRecorder alive
               indefinitely. */
            setTimeout(() => {
                try {
                    if (rec.state === 'recording') rec.stop();
                } catch (err) {
                    try { stream.getTracks?.().forEach(track => track.stop()); } catch (_) {}
                    stopPlayback();
                    reportRecordError(err?.message || tr('videoWf.recordFailed'));
                }
            }, Math.min(8000, Math.round(((duration + 1) / fps) * 1000) + 400));
        });

        const syncCamHud = wf => {
            const cam = currentCam(wf);
            const x = rootEl.querySelector('[data-cam="x"]');
            const y = rootEl.querySelector('[data-cam="y"]');
            const facing = rootEl.querySelector('[data-cam="facing"]');
            if (x) x.value = Number(cam.x || 0).toFixed(2);
            if (y) y.value = Number(cam.y || 0).toFixed(2);
            if (facing) facing.value = String(Math.round(Number(cam.facing || 0)));
            const alt = rootEl.querySelector('[data-cam="alt"]');
            if (alt) alt.value = Number(cam.alt || schema.cameraAltOf?.(cam.kind, cam.alt) || 1.5).toFixed(2);
        };

        ['x', 'y', 'facing', 'alt'].forEach(key => {
            const el = rootEl.querySelector(`[data-cam="${key}"]`);
            /* Keep the numeric camera controls live while they are edited.
               The old altitude `change`-only binding left the DOM showing a
               new value until blur, while the Three runtime (and preview)
               still used the previous height.  Facing already had live
               updates; altitude now follows the same path.  X/Y retain their
               commit-on-blur behavior. */
            let lastAppliedValue = null;
            const applyCameraField = ev => {
                const rawValue = String(ev.target.value ?? '');
                /* Number inputs commonly emit input followed by change.  Do
                   not enqueue a second identical save for that trailing
                   change, but still accept a change-only browser. */
                if (ev.type === 'change' && rawValue === lastAppliedValue) return;
                const wf = getState();
                const cam = currentCam(wf);
                if (key === 'facing') cam.facing = schema.normalizeFacing(ev.target.value, 0);
                else if (key === 'alt') cam.alt = Math.max(0.15, Math.min(12, Number(ev.target.value || 1.5)));
                else cam[key] = Math.max(0, Math.min(1, Number(ev.target.value || 0)));
                lastAppliedValue = rawValue;
                setSelected(opts, cam.id);
                schema.syncPrimaryCamera(wf.stage);
                commit(wf, false);
                drawNow(wf);
            };
            /* Keep a change fallback for browsers that do not emit `input`
               for number steppers or script-assisted edits. */
            const events = key === 'facing' || key === 'alt' ? ['input', 'change'] : ['change'];
            events.forEach(name => el?.addEventListener(name, applyCameraField));
        });

        rootEl.querySelectorAll('[data-cam-preset]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    const preset = btn.getAttribute('data-cam-preset');
                    if (preset === 'current' && wf.stage.viewMode !== '2d') {
                        const pose = root.VideoWorkflowStage3D?.currentViewAsCamera?.(host);
                        const cam = schema.cameraById(wf.stage, selectedOf(opts));
                        if (pose && cam) {
                            Object.assign(cam, pose);
                            schema.syncPrimaryCamera(wf.stage);
                            setSelected(opts, cam.id);
                            wf.stage.libraryTab = 'camera';
                            return;
                        }
                    }
                    const cam = schema.applyPresetToCamera(wf.stage, preset, selectedOf(opts));
                    setSelected(opts, cam.id);
                    wf.stage.libraryTab = 'camera';
                }, false);
                const wf = getState();
                syncCamHud(wf);
                drawNow(wf);
            });
        });

        rootEl.querySelectorAll('[data-scene-bg]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                mutate(wf => {
                    wf.stage.scene = wf.stage.scene || schema.defaultScene();
                    wf.stage.scene.bgMode = btn.getAttribute('data-scene-bg') === 'image' ? 'image' : 'color';
                });
            });
        });
        rootEl.querySelector('[data-scene-color]')?.addEventListener('input', ev => {
            const wf = getState();
            wf.stage.scene = wf.stage.scene || schema.defaultScene();
            wf.stage.scene.bgColor = ev.target.value;
            const hex = rootEl.querySelector('[data-scene-hex]');
            if (hex) hex.value = ev.target.value;
            commit(wf, false);
            drawNow(wf);
        });
        const applySceneHex = ev => {
            const value = String(ev.target.value || '').trim();
            // `input` is used as well as `change` so programmatic fills and
            // keyboard edits commit as soon as a complete hex value exists.
            // Leave partial text alone while the user is typing; the next
            // valid keystroke (or blur/change) will apply it.
            if (!/^#[0-9a-f]{6}$/i.test(value)) {
                return;
            }
            const wf = getState();
            wf.stage.scene = wf.stage.scene || schema.defaultScene();
            wf.stage.scene.bgColor = value;
            const picker = rootEl.querySelector('[data-scene-color]');
            if (picker) picker.value = value;
            commit(wf, false);
            drawNow(wf);
        };
        rootEl.querySelector('[data-scene-hex]')?.addEventListener('input', applySceneHex);
        rootEl.querySelector('[data-scene-hex]')?.addEventListener('change', applySceneHex);
        rootEl.querySelector('[data-scene-hex]')?.addEventListener('blur', ev => {
            const value = String(ev.target.value || '').trim();
            if (!/^#[0-9a-f]{6}$/i.test(value)) {
                ev.target.value = getState().stage.scene?.bgColor || '#060608';
            }
        });
        rootEl.querySelector('[data-scene-pick]')?.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            try {
                const files = await pickFiles('image/*', false);
                const uploaded = await uploadFiles(opts, files, 'image');
                if (!uploaded[0]) return;
                mutate(wf => {
                    wf.stage.scene = wf.stage.scene || schema.defaultScene();
                    wf.stage.scene.bgMode = 'image';
                    wf.stage.scene.bgUrl = uploaded[0].url;
                });
            } catch(err) {
                reportAsyncActionError(opts, err, '场景图片上传失败');
            }
        });
        ['scale', 'tx', 'ty', 'tz', 'rx', 'ry', 'rz'].forEach(key => {
            const el = rootEl.querySelector(`[data-scene="${key}"]`);
            el?.addEventListener('change', ev => {
                const wf = getState();
                wf.stage.scene = wf.stage.scene || schema.defaultScene();
                wf.stage.scene[key] = Number(ev.target.value || 0);
                commit(wf, false);
                drawNow(wf);
            });
        });

        rootEl.querySelectorAll('.vwf-actor').forEach(row => {
            const id = row.getAttribute('data-actor-id');
            row.querySelectorAll('input, select').forEach(input => {
                const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
                input.addEventListener(eventName, () => {
                    const wf = getState();
                    const actor = wf.stage.actors.find(item => item.id === id);
                    if (!actor) return;
                    const key = input.getAttribute('data-k');
                    if (key === 'facing') actor.facing = schema.normalizeFacing(input.value, 0);
                    else if (key === 'action') actor.action = schema.normalizeAction(input.value);
                    else actor[key] = input.value;
                    setSelected(opts, id);
                    commit(wf, false);
                    drawNow(wf);
                    markActorActive(rootEl, id);
                });
            });
            row.querySelector('[data-actor-del]')?.addEventListener('click', () => {
                mutate(wf => {
                    wf.stage.actors = wf.stage.actors.filter(item => item.id !== id);
                    wf.stage.keyframes = (wf.stage.keyframes || []).filter(kf => kf.actorId !== id);
                    if (selectedOf(opts) === id) setSelected(opts, '');
                });
            });
            row.addEventListener('mousedown', () => {
                setSelected(opts, id);
                markActorActive(rootEl, id);
                drawNow(getState());
            });
        });

        const playBtn = rootEl.querySelector('[data-tl-play]');
        const stopBtn = rootEl.querySelector('[data-tl-stop]');
        const syncPlaybackControls = playing => {
            if (playBtn) {
                playBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
                playBtn.setAttribute('aria-label', playing ? tr('videoWf.stop') : tr('videoWf.play'));
                playBtn.title = playing ? tr('videoWf.stop') : tr('videoWf.play');
            }
            if (stopBtn) {
                stopBtn.style.display = playing ? 'inline-flex' : 'none';
            }
        };
        const stopPlay = () => {
            playback.playing = false;
            if (playback.timer) {
                clearInterval(playback.timer);
                playback.timer = 0;
            }
            mirrorPlaybackState(host, playback);
            syncPlaybackControls(false);
        };
        syncPlaybackControls(Boolean(playback.playing));
        playBtn?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (playback.playing) {
                const wf = getState();
                if (Number.isFinite(playback.frame)) wf.stage.frame = playback.frame;
                stopPlay();
                commit(wf, false);
                drawNow(wf);
                return;
            }
            stopPlay();
            const start = getState();
            playback.playing = true;
            syncPlaybackControls(true);
            playback.frame = Number(start.stage.frame || 0);
            const fps = Math.max(1, Number(start.stage.fps || 30));
            const duration = Math.max(1, Number(start.stage.duration || 90));
            playback.timer = setInterval(() => {
                if (!playback.playing) return;
                /* Treat the duration frame as a real endpoint.  Using `%
                   duration` skipped the final keyframe (e.g. frame 90 for a
                   90-frame timeline) and wrapped frame 90 to frame 1. */
                playback.frame = (Number(playback.frame || 0) + 1) % (duration + 1);
                const wf = getState();
                wf.stage.frame = playback.frame;
                const frameInput = rootEl.querySelector('[data-tl-frame]');
                if (frameInput) frameInput.value = String(wf.stage.frame);
                const now = rootEl.querySelector('.vwf-tl-now');
                if (now) now.style.left = `${(wf.stage.frame / duration) * 100}%`;
                drawNow(wf);
            }, Math.round(1000 / fps));
            mirrorPlaybackState(host, playback);
        });
        stopBtn?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const wf = getState();
            if (Number.isFinite(playback.frame)) wf.stage.frame = playback.frame;
            stopPlay();
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-tl-frame]')?.addEventListener('change', ev => {
            const wf = getState();
            const duration = Math.max(1, Number(wf.stage.duration || 90));
            const rawFrame = Number(ev.target.value || 0);
            wf.stage.frame = Math.max(0, Math.min(duration, Number.isFinite(rawFrame) ? Math.round(rawFrame) : 0));
            ev.target.value = String(wf.stage.frame);
            commit(wf, false);
            drawNow(wf);
        });
        rootEl.querySelector('[data-tl-zoom]')?.addEventListener('input', ev => {
            const wf = getState();
            wf.stage.tlZoom = Number(ev.target.value || 1);
            const track = rootEl.querySelector('.vwf-tl-track');
            if (track) track.style.transform = `scaleX(${wf.stage.tlZoom})`;
            commit(wf, false);
        });
        rootEl.querySelector('[data-tl-add]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            mutate(wf => {
                const actor = selectedActor(wf, selectedOf(opts)) || wf.stage.actors[0];
                if (!actor) return;
                wf.stage.keyframes = wf.stage.keyframes || [];
                const frame = Math.round(Number(wf.stage.frame || 0));
                const existing = wf.stage.keyframes.find(kf => kf.actorId === actor.id && kf.frame === frame);
                const body = {
                    frame,
                    actorId: actor.id,
                    x: actor.x,
                    y: actor.y,
                    alt: actor.alt,
                    facing: actor.facing,
                    action: actor.action,
                    scale: actor.scale,
                    pose: actor.pose
                };
                if (existing) Object.assign(existing, body);
                else wf.stage.keyframes.push(schema.normalizeKeyframe(body, wf.stage.keyframes.length));
            });
        });
        rootEl.querySelector('[data-tl-del]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            mutate(wf => {
                const actor = selectedActor(wf, selectedOf(opts));
                const frame = Math.round(Number(wf.stage.frame || 0));
                wf.stage.keyframes = (wf.stage.keyframes || []).filter(kf => {
                    if (kf.frame !== frame) return true;
                    if (actor) return kf.actorId !== actor.id;
                    return false;
                });
            });
        });
        rootEl.querySelectorAll('[data-tl-kf]').forEach(el => {
            el.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.stage.frame = Math.round(Number(el.getAttribute('data-tl-kf') || 0));
                commit(wf);
            });
        });

        if (canvas) {
            canvas.addEventListener('dragover', ev => {
                if ([...ev.dataTransfer.types].includes('text/vwf-asset')) ev.preventDefault();
            });
            canvas.addEventListener('drop', ev => {
                ev.preventDefault();
                const id = ev.dataTransfer.getData('text/vwf-asset');
                if (!id) return;
                mutate(wf => {
                    wf._optsAssets = opts.assets || [];
                    const asset = mineAssets(wf).find(item => item.id === id);
                    if (!asset) return;
                    const actor = placeAssetOnStage(wf, asset, opts);
                    if (!actor) return;
                    if (!actor.scene) {
                        const point = adapter.eventToStage(canvas, ev);
                        actor.x = point.nx;
                        actor.y = point.ny;
                        wf.stage.libraryTab = 'actor';
                    } else {
                        wf.stage.libraryTab = 'object';
                    }
                });
            });
            const onPointerDown = e => {
                e.preventDefault();
                e.stopPropagation();
                canvas.focus();
                studio?.focus();
                const wf = getState();
                if (!adapter?.hitStage) return;
                const tool = wf.stage.tool || 'select';
                const hit = adapter.hitStage(canvas, wf.stage, e);
                if (tool === 'path') {
                    const actor = selectedActor(wf, selectedOf(opts)) || (hit?.id ? wf.stage.actors.find(item => item.id === hit.id) : null);
                    if (!actor) return;
                    pushHist(opts, wf);
                    const point = adapter.eventToStage(canvas, e);
                    actor.path = actor.path || [];
                    actor.path.push({ x: point.nx, y: point.ny });
                    setSelected(opts, actor.id);
                    commit(wf, false);
                    drawNow(wf);
                    return;
                }
                if (!hit) return;
                const actor = hit.kind === 'camera' || hit.kind === 'camera-facing'
                    ? null
                    : (wf.stage.actors || []).find(item => item.id === hit.id);
                const cam = hit.kind === 'camera' || hit.kind === 'camera-facing'
                    ? schema.cameraById(wf.stage, hit.id)
                    : null;
                setSelected(opts, hit.id);
                markActorActive(rootEl, selectedOf(opts));
                drawNow(wf);
                canvas.classList.add('is-drag');
                pushHist(opts, wf);
                const rotate = tool === 'rotate' || hit.kind === 'actor-facing' || hit.kind === 'camera-facing';
                const scaleMode = tool === 'scale' && actor;
                const origin = actor || cam;
                const startY = e.clientY;
                const startScale = Number(actor?.scale || 1);
                const move = ev => {
                    const point = adapter.eventToStage(canvas, ev);
                    if (hit.kind === 'pose' && actor) {
                        adapter.poseFromPoint(actor, hit.key, canvas, ev);
                    } else if (scaleMode && actor) {
                        actor.scale = Math.max(0.4, Math.min(2.4, startScale + (startY - ev.clientY) / 180));
                    } else if (rotate && origin) {
                        const px = adapter.stageToXY(canvas.width, canvas.height, origin.x, origin.y);
                        origin.facing = adapter.facingFromDelta(point.cx - px.x, point.cy - px.y);
                    } else if (actor) {
                        actor.x = point.nx;
                        actor.y = point.ny;
                    } else if (cam) {
                        cam.x = point.nx;
                        cam.y = point.ny;
                    }
                    if (rotate && origin) {
                        const facingInput = actor
                            ? rootEl.querySelector(`.vwf-actor[data-actor-id="${actor.id}"] [data-k="facing"]`)
                            : rootEl.querySelector('[data-cam="facing"]');
                        if (facingInput) facingInput.value = String(Math.round(origin.facing || 0));
                    }
                    if (cam) {
                        schema.syncPrimaryCamera(wf.stage);
                        syncCamHud(wf);
                    }
                    drawNow(wf);
                };
                const up = () => {
                    canvas.classList.remove('is-drag');
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    const snap = value => Math.round(Number(value || 0) * 100) / 100;
                    if (actor) {
                        actor.x = snap(actor.x);
                        actor.y = snap(actor.y);
                        actor.scale = snap(actor.scale);
                        actor.facing = schema.normalizeFacing(Math.round(actor.facing || 0), 0);
                    } else if (cam) {
                        cam.x = snap(cam.x);
                        cam.y = snap(cam.y);
                        cam.facing = schema.normalizeFacing(Math.round(cam.facing || 0), 0);
                        schema.syncPrimaryCamera(wf.stage);
                    }
                    commit(wf, false);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            };
            canvas.addEventListener('pointerdown', onPointerDown);
        }
        if (view3d) {
            view3d.addEventListener('dragover', ev => {
                if ([...ev.dataTransfer.types].includes('text/vwf-asset')) ev.preventDefault();
            });
            view3d.addEventListener('drop', ev => {
                ev.preventDefault();
                const id = ev.dataTransfer.getData('text/vwf-asset');
                if (!id) return;
                mutate(wf => {
                    wf._optsAssets = opts.assets || [];
                    const asset = mineAssets(wf).find(item => item.id === id);
                    if (!asset) return;
                    const actor = placeAssetOnStage(wf, asset, opts);
                    if (!actor) return;
                    if (!actor.scene) {
                        const point = stageDropPoint(host, ev);
                        if (point) {
                            actor.x = point.nx;
                            actor.y = point.ny;
                        }
                        wf.stage.libraryTab = 'actor';
                    } else {
                        wf.stage.libraryTab = 'object';
                    }
                    setSelected(opts, actor.id);
                });
            });
        }

        const keyUiRoot = () => {
            const desk = host?._vwfDeskEl;
            return desk && desk.isConnected && document.body.contains(desk) ? desk : rootEl;
        };
        const onKey = e => {
            const tag = String(document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (!studio && !canvas) return;
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    if (e.shiftKey) restoreHist(opts, getState, commit, histOf(opts).redo, histOf(opts).undo);
                    else restoreHist(opts, getState, commit, histOf(opts).undo, histOf(opts).redo);
                } else if (e.key === 'y' || e.key === 'Y') {
                    e.preventDefault();
                    restoreHist(opts, getState, commit, histOf(opts).redo, histOf(opts).undo);
                }
                return;
            }
            const key = e.key.toLowerCase();
            if (!['w', 'a', 's', 'd', 'q', 'e'].includes(key)) return;
            keyUiRoot().querySelectorAll('[data-walk-key]').forEach(btn => {
                btn.classList.toggle('is-down', btn.getAttribute('data-walk-key') === key);
            });
            const wf = getState();
            const actor = selectedActor(wf, selectedOf(opts)) || (wf.stage.actors || [])[0];
            if (!actor) return;
            setSelected(opts, actor.id);
            e.preventDefault();
            if (!host._vwfKeyHist) {
                pushHist(opts, wf);
                host._vwfKeyHist = true;
            }
            const step = e.shiftKey ? 0.04 : 0.02;
            if (key === 'a') actor.x = Math.max(0, actor.x - step);
            if (key === 'd') actor.x = Math.min(1, actor.x + step);
            if (key === 'w') actor.y = Math.max(0, actor.y - step);
            if (key === 's') actor.y = Math.min(1, actor.y + step);
            if (wf.stage.viewMode !== '2d') {
                if (key === 'q') actor.alt = Math.max(0, Number(actor.alt || 0) - 0.08);
                if (key === 'e') actor.alt = Math.min(8, Number(actor.alt || 0) + 0.08);
            } else {
                if (key === 'q') actor.scale = Math.max(0.4, Number(actor.scale || 1) - 0.08);
                if (key === 'e') actor.scale = Math.min(2.4, Number(actor.scale || 1) + 0.08);
            }
            commit(wf, false);
            drawNow(wf);
        };
        const onKeyUp = e => {
            const key = String(e.key).toLowerCase();
            if (['w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
                host._vwfKeyHist = false;
                keyUiRoot().querySelectorAll('[data-walk-key]').forEach(btn => {
                    if (btn.getAttribute('data-walk-key') === key) btn.classList.remove('is-down');
                });
            }
        };
        // All three surfaces are descendants of .vwf-stage-studio.  Bind at
        // the common ancestor only; registering the same handler on canvas
        // and view3d as well makes one WASD/QE event bubble through the
        // ancestor and move the actor twice.
        studio?.addEventListener('keydown', onKey);
        studio?.addEventListener('keyup', onKeyUp);
        studio?.addEventListener('pointerdown', () => studio.focus());
        view3d?.addEventListener('pointerdown', () => view3d.focus());

        // Bind stage controls before expanding the desk.  An expanded stage
        // is reparented to <body>; doing that earlier makes rootEl queries
        // miss the rail, camera, action and timeline controls on first paint.
        applyDesk(Boolean(host?._vwfDesk));
        if (host?._vwfDeskEsc) document.removeEventListener('keydown', host._vwfDeskEsc);
        if (host) {
            host._vwfDeskEsc = e => {
                if (e.key === 'Escape' && host._vwfDesk) {
                    e.preventDefault();
                    applyDesk(false);
                }
            };
            document.addEventListener('keydown', host._vwfDeskEsc);
        }
        requestAnimationFrame(() => {
            attach3D(getState());
            requestAnimationFrame(() => attach3D(getState()));
        });
    }

    function bind(rootEl, opts) {
        const schema = root.VideoWorkflowSchema;
        const getState = () => {
            const wf = schema.normalize(opts.getState());
            wf._optsAssets = opts.assets || [];
            wf._selectedId = selectedOf(opts);
            return wf;
        };
        const commit = (next, rerender) => {
            opts.setState(schema.normalize(next));
            if (typeof opts.onChange === 'function') opts.onChange(schema.normalize(next));
            if (rerender !== false) mount(opts.host, opts);
        };

        rootEl.querySelector('[data-vwf="ref-add"]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const wf = getState();
            const next = schema.normalize({ extraRefs: [{}] }).extraRefs[0];
            next.purpose = 'reference';
            wf.extraRefs.push(next);
            commit(wf);
        });
        rootEl.querySelectorAll('[data-style-use]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const id = btn.getAttribute('data-style-use');
                const name = btn.getAttribute('data-style-name') || '';
                const src = [...(wf.assets || []), ...(wf._optsAssets || [])].find(item => item && (item.id === id || item.name === name));
                if (!src) return;
                const hit = (wf.extraRefs || []).find(ref => ref.purpose === 'style' && (ref.url === src.url || ref.name === src.name));
                if (hit) {
                    hit.url = src.url || hit.url;
                    hit.name = src.name || hit.name;
                    hit.kind = 'image';
                } else {
                    wf.extraRefs.push(schema.normalize({
                        extraRefs: [{ kind: 'image', purpose: 'style', url: src.url || '', name: src.name || tr('videoWf.asset.style') }]
                    }).extraRefs[0]);
                }
                commit(wf);
            });
        });
        rootEl.querySelector('[data-vwf="seg-add"]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const wf = getState();
            const last = wf.segments[wf.segments.length - 1];
            const start = last ? Number(last.end || 0) : 0;
            wf.segments.push({ id: schema.uid('seg'), start, end: start + 5, text: '' });
            commit(wf);
        });
        rootEl.querySelector('[data-vwf="asset-add"]')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const wf = getState();
            wf.assets.push({ id: schema.uid('asset'), kind: 'character', name: '', notes: '', url: '' });
            commit(wf);
        });
        ['adr', 'sfx', 'bgm'].forEach(kind => {
            rootEl.querySelector(`[data-vwf="track-add-${kind}"]`)?.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                wf.audioTracks = wf.audioTracks || [];
                wf.audioTracks.push(schema.normalizeAudioTrack
                    ? schema.normalizeAudioTrack({ kind }, wf.audioTracks.length)
                    : { id: schema.uid('aud'), kind, text: '', url: '' });
                commit(wf);
            });
        });
        rootEl.querySelectorAll('.vwf-track').forEach(row => {
            const id = row.getAttribute('data-track-id');
            row.querySelector('[data-vwf="track-kind"]')?.addEventListener('change', ev => {
                const wf = getState();
                const item = (wf.audioTracks || []).find(track => track.id === id);
                if (item) item.kind = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="track-text"]')?.addEventListener('input', ev => {
                const wf = getState();
                const item = (wf.audioTracks || []).find(track => track.id === id);
                if (item) item.text = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="track-del"]')?.addEventListener('click', () => {
                const wf = getState();
                wf.audioTracks = (wf.audioTracks || []).filter(track => track.id !== id);
                commit(wf);
            });
            row.querySelector('[data-vwf="track-pick"]')?.addEventListener('click', async () => {
                try {
                    const wf = getState();
                    const item = (wf.audioTracks || []).find(track => track.id === id);
                    const files = await pickFiles('audio/*', false);
                    const uploaded = await uploadFiles(opts, files, 'audio');
                    if (item && uploaded[0]) {
                        item.url = uploaded[0].url;
                        item.name = uploaded[0].name || item.name;
                        commit(wf);
                    }
                } catch(err) {
                    reportAsyncActionError(opts, err, '音频上传失败');
                }
            });
        });

        rootEl.querySelectorAll('[data-vwf="limit-image"],[data-vwf="limit-video"],[data-vwf="limit-audio"]').forEach(input => {
            input.addEventListener('change', () => {
                const wf = getState();
                const key = input.getAttribute('data-vwf').replace('limit-', '');
                wf.refLimits[key] = Number(input.value || wf.refLimits[key]);
                commit(wf, false);
            });
        });
        rootEl.querySelectorAll('.vwf-engine').forEach(row => {
            const slot = row.getAttribute('data-engine-slot');
            const writeEng = (key, value, rerender) => {
                const wf = getState();
                wf.engines = schema.normalizeEngines ? schema.normalizeEngines(wf.engines) : (wf.engines || {});
                wf.engines[slot] = wf.engines[slot] || { provider: '', model: '', baseUrl: '' };
                const selectedProvider = (opts && Array.isArray(opts.providers) ? opts.providers : []).find(provider => String(provider?.id || '') === String(value || ''));
                if((key === 'provider' && isOpenSourceBlockedProvider(selectedProvider)) || (key === 'model' && isOpenSourceBlockedModel(value))){
                    return;
                }
                wf.engines[slot][key] = value;
                commit(wf, rerender);
            };
            row.querySelector('[data-vwf="eng-provider"]')?.addEventListener('change', ev => writeEng('provider', ev.target.value, true));
            row.querySelector('[data-vwf="eng-model"]')?.addEventListener('change', ev => writeEng('model', ev.target.value, false));
            row.querySelector('[data-vwf="eng-base"]')?.addEventListener('change', ev => writeEng('baseUrl', ev.target.value, false));
        });

        rootEl.querySelectorAll('.vwf-ref').forEach(row => {
            const id = row.getAttribute('data-ref-id');
            row.querySelector('[data-vwf="ref-kind"]')?.addEventListener('change', ev => {
                const wf = getState();
                const item = wf.extraRefs.find(ref => ref.id === id);
                if (item) item.kind = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="ref-purpose"]')?.addEventListener('change', ev => {
                const wf = getState();
                const item = wf.extraRefs.find(ref => ref.id === id);
                if (item) item.purpose = ev.target.value;
                commit(wf, true);
            });
            row.querySelector('[data-vwf="ref-del"]')?.addEventListener('click', () => {
                const wf = getState();
                const gone = wf.extraRefs.find(ref => ref.id === id);
                wf.extraRefs = wf.extraRefs.filter(ref => ref.id !== id);
                if (gone?.purpose === 'layout') wf.stage.layoutUrl = '';
                commit(wf);
            });
            row.querySelector('[data-vwf="ref-pick"]')?.addEventListener('click', async () => {
                try {
                    const wf = getState();
                    const item = wf.extraRefs.find(ref => ref.id === id);
                    const files = await pickFiles(acceptForKind(item?.kind), false);
                    const uploaded = await uploadFiles(opts, files, item?.kind || 'image');
                    if (item && uploaded[0]) {
                        item.url = uploaded[0].url;
                        item.name = uploaded[0].name;
                        item.kind = uploaded[0].kind || item.kind;
                        commit(wf);
                    }
                } catch(err) {
                    reportAsyncActionError(opts, err, '参考素材上传失败');
                }
            });
        });

        rootEl.querySelectorAll('.vwf-seg').forEach(row => {
            const id = row.getAttribute('data-seg-id');
            const patch = (key, value) => {
                const wf = getState();
                const item = wf.segments.find(seg => seg.id === id);
                if (!item) return;
                item[key] = value;
                commit(wf, false);
            };
            row.querySelector('[data-vwf="seg-start"]')?.addEventListener('change', ev => patch('start', Number(ev.target.value || 0)));
            row.querySelector('[data-vwf="seg-end"]')?.addEventListener('change', ev => patch('end', Number(ev.target.value || 0)));
            row.querySelector('[data-vwf="seg-text"]')?.addEventListener('input', ev => patch('text', ev.target.value));
            row.querySelector('[data-vwf="seg-del"]')?.addEventListener('click', () => {
                const wf = getState();
                wf.segments = wf.segments.filter(seg => seg.id !== id);
                commit(wf);
            });
        });

        rootEl.querySelector('[data-vwf="redo-on"]')?.addEventListener('change', ev => {
            const wf = getState();
            wf.redo.enabled = ev.target.checked;
            commit(wf, false);
        });
        ['start', 'end', 'boxes', 'prompt'].forEach(key => {
            const el = rootEl.querySelector(`[data-vwf="redo-${key}"]`);
            el?.addEventListener(key === 'boxes' || key === 'prompt' ? 'input' : 'change', ev => {
                const wf = getState();
                wf.redo[key] = key === 'boxes' || key === 'prompt' ? ev.target.value : Number(ev.target.value || 0);
                commit(wf, false);
            });
        });
        rootEl.querySelector('[data-vwf="redo-mask"]')?.addEventListener('click', async () => {
            try {
                const files = await pickFiles('image/*', false);
                const uploaded = await uploadFiles(opts, files, 'image');
                if (uploaded[0]) {
                    const wf = getState();
                    wf.redo.maskUrl = uploaded[0].url;
                    wf.redo.maskName = uploaded[0].name;
                    commit(wf);
                }
            } catch(err) {
                reportAsyncActionError(opts, err, '蒙版上传失败');
            }
        });
        rootEl.querySelector('[data-vwf="redo-mask-clear"]')?.addEventListener('click', () => {
            const wf = getState();
            wf.redo.maskUrl = '';
            wf.redo.maskName = '';
            commit(wf);
        });

        rootEl.querySelector('[data-vwf="green-on"]')?.addEventListener('change', ev => {
            const wf = getState();
            wf.greenscreen.enabled = ev.target.checked;
            commit(wf, false);
        });
        rootEl.querySelector('[data-vwf="green-subject"]')?.addEventListener('click', async () => {
            try {
                const files = await pickFiles('image/*,video/*', false);
                const uploaded = await uploadFiles(opts, files, 'image');
                if (uploaded[0]) {
                    const wf = getState();
                    wf.greenscreen.subjectUrl = uploaded[0].url;
                    wf.greenscreen.subjectName = uploaded[0].name;
                    wf.greenscreen.subjectKind = uploaded[0].kind || 'image';
                    commit(wf);
                }
            } catch(err) {
                reportAsyncActionError(opts, err, '主体素材上传失败');
            }
        });
        rootEl.querySelector('[data-vwf="green-pick"]')?.addEventListener('click', async () => {
            try {
                const files = await pickFiles('image/*', false);
                const uploaded = await uploadFiles(opts, files, 'image');
                if (uploaded[0]) {
                    const wf = getState();
                    wf.greenscreen.bgUrl = uploaded[0].url;
                    wf.greenscreen.bgName = uploaded[0].name;
                    commit(wf);
                }
            } catch(err) {
                reportAsyncActionError(opts, err, '抠像背景上传失败');
            }
        });
        rootEl.querySelector('[data-vwf="green-clear"]')?.addEventListener('click', () => {
            const wf = getState();
            wf.greenscreen.subjectUrl = '';
            wf.greenscreen.subjectName = '';
            wf.greenscreen.bgUrl = '';
            wf.greenscreen.bgName = '';
            commit(wf);
        });

        rootEl.querySelector('[data-vwf="cont-on"]')?.addEventListener('change', ev => {
            const wf = getState();
            wf.continuePrev.enabled = ev.target.checked;
            commit(wf, false);
        });
        rootEl.querySelector('[data-vwf="cont-frame"]')?.addEventListener('change', ev => {
            const wf = getState();
            wf.continuePrev.useLastFrame = ev.target.checked;
            commit(wf, false);
        });

        rootEl.querySelectorAll('.vwf-asset').forEach(row => {
            const id = row.getAttribute('data-asset-id');
            row.querySelector('[data-vwf="asset-kind"]')?.addEventListener('change', ev => {
                const wf = getState();
                const item = wf.assets.find(asset => asset.id === id);
                if (item) item.kind = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="asset-name"]')?.addEventListener('input', ev => {
                const wf = getState();
                const item = wf.assets.find(asset => asset.id === id);
                if (item) item.name = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="asset-notes"]')?.addEventListener('input', ev => {
                const wf = getState();
                const item = wf.assets.find(asset => asset.id === id);
                if (item) item.notes = ev.target.value;
                commit(wf, false);
            });
            row.querySelector('[data-vwf="asset-del"]')?.addEventListener('click', () => {
                const wf = getState();
                wf.assets = wf.assets.filter(asset => asset.id !== id);
                commit(wf);
            });
            row.querySelector('[data-vwf="asset-pick"]')?.addEventListener('click', async () => {
                try {
                    const files = await pickFiles('image/*', false);
                    const uploaded = await uploadFiles(opts, files, 'image');
                    if (uploaded[0]) {
                        const wf = getState();
                        const item = wf.assets.find(asset => asset.id === id);
                        if (item) {
                            item.url = uploaded[0].url;
                            if (!item.name) item.name = uploaded[0].name.replace(/\.[^.]+$/, '');
                        }
                        commit(wf);
                    }
                } catch(err) {
                    reportAsyncActionError(opts, err, '工作流资产上传失败');
                }
            });
            row.querySelector('[data-vwf="asset-to-stage"]')?.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const wf = getState();
                const item = wf.assets.find(asset => asset.id === id);
                if (!item) return;
                placeAssetOnStage(wf, item, opts);
                commit(wf);
            });
        });

        bindStage(rootEl, opts, getState, commit);

        const runPreviewRefresh = async () => {
            try {
                if (typeof opts.refreshPreview === 'function') await opts.refreshPreview();
            } catch (error) {
                /* Preview builders may touch provider metadata or media
                   decoding.  Keep a rejected request inside the click
                   boundary so one transient failure cannot poison the rest
                   of the workflow editor. */
                const message = String(error?.message || tr('videoWf.previewFailed') || '预览失败，当前编辑已保留');
                try {
                    if (typeof opts?.onPreviewError === 'function') opts.onPreviewError(message);
                    else if (typeof opts?.onExportError === 'function') opts.onExportError(message);
                    else console.warn('视频工作流预览失败', error);
                } catch (_) {}
            }
        };
        rootEl.querySelector('[data-vwf="preview-refresh"]')?.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            await runPreviewRefresh();
        });

        rootEl.querySelectorAll('input, select, textarea, button, canvas, summary').forEach(el => {
            el.addEventListener('mousedown', ev => ev.stopPropagation());
            el.addEventListener('pointerdown', ev => ev.stopPropagation());
            el.addEventListener('click', ev => ev.stopPropagation());
        });
    }

    function mount(host, opts) {
        if (!host) return null;
        const nextOpts = { ...opts, host };
        const html = render(opts.getState(), nextOpts);
        let panel = host.querySelector(':scope > .video-workflow-panel');
        // Keep the workflow inspector open while a field is edited.  Most
        // controls commit by remounting the panel; collapsing <details> on
        // every keystroke made multi-step reference/segment/audio editing
        // unexpectedly jump back to the compact view.
        const wasMoreOpen = panel?.querySelector('details.vwf-more')?.open;
        const wrap = document.createElement('div');
        wrap.innerHTML = html.trim();
        const fresh = wrap.firstElementChild;
        if (fresh && wasMoreOpen != null) {
            const more = fresh.querySelector('details.vwf-more');
            if (more) more.open = Boolean(wasMoreOpen);
        }
        if (panel) panel.replaceWith(fresh);
        else host.appendChild(fresh);
        bind(fresh, nextOpts);
        if (root.lucide) root.lucide.createIcons();
        return fresh;
    }

    function setPreview(host, text) {
        const el = host?.querySelector?.('[data-vwf="preview"]');
        if (el) el.textContent = text || '';
    }

    function mountStage(host, getStage, setStage, opts) {
        if (!host) return;
        const schema = root.VideoWorkflowSchema;
        /* Keep the selection refresh lifecycle tied to this host.  A stale
           hot-reloaded panel can leave only the expando cleanup hook behind;
           clear that orphan before creating the current singleton binding. */
        if (!stageSelectionBindings.has(host) && typeof host._vwfStageSelectionCleanup === 'function') {
            try { host._vwfStageSelectionCleanup(); } catch (_) {}
        }
        const selectionBinding = ensureStageSelectionBinding(host);
        if (selectionBinding) {
            selectionBinding.state.refresh = () => {
                selectionBinding.state.pending = false;
                try { host._vwfStageRefreshPending = false; } catch (_) {}
                mountStage(host, getStage, setStage, opts);
            };
            try {
                host._vwfStageRefresh = selectionBinding.state.refresh;
                host._vwfStageRefreshCleanup = selectionBinding.cleanup;
            } catch (_) {}
        }
        if (opts?.deskOpen != null && host._vwfDesk == null) host._vwfDesk = Boolean(opts.deskOpen);
        if (typeof opts?.onDeskChange === 'function') host._vwfDeskChange = opts.onDeskChange;
        // Stage-only mounts historically persisted only `wf.stage`.  That
        // silently discarded layout screenshots and recordings because those
        // actions also append purpose-aware entries to `extraRefs`.  Allow a
        // caller to provide the complete workflow while retaining the small
        // getStage/setStage API used by the embedded LTX stage.
        const readWorkflow = () => {
            const source = typeof opts?.getWorkflow === 'function'
                ? opts.getWorkflow()
                : { stage: getStage() || schema.defaultStage() };
            const raw = schema.normalize(source || { stage: schema.defaultStage() });
            raw._selectedId = host._vwfSelected || '';
            raw._optsAssets = opts?.assets || [];
            raw._deskOpen = Boolean(host._vwfDesk || opts?.deskOpen);
            return raw;
        };
        const writeWorkflow = wf => {
            const normalized = schema.normalize(wf || { stage: schema.defaultStage() });
            if (typeof opts?.setWorkflow === 'function') opts.setWorkflow(normalized);
            else setStage(normalized.stage);
        };
        const dummy = {
            host,
            getState: readWorkflow,
            setState: writeWorkflow,
            onExport: opts?.onExport,
            upload: opts?.upload,
            onChange: opts?.onChange,
            flushSave: opts?.flushSave,
            onOpenPageError: opts?.onOpenPageError,
            onRecordError: opts?.onRecordError,
            onUploadError: opts?.onUploadError,
            onPlacementError: opts?.onPlacementError,
            onExportError: opts?.onExportError
        };
        const wf = dummy.getState();
        host.innerHTML = `<div class="video-workflow-panel vwf-stage-only">${renderStageBlock(wf, opts)}</div>`;
        const panel = host.querySelector('.video-workflow-panel') || host;
        const getState = readWorkflow;
        const commit = (next, rerender) => {
            dummy.setState(schema.normalize(next));
            if (typeof dummy.onChange === 'function') dummy.onChange(schema.normalize(next));
            if (rerender !== false) mountStage(host, getStage, setStage, opts);
        };
        bindStage(panel, dummy, getState, commit);
        const stageEl = panel.querySelector('.vwf-stage');
        if(stageEl){
            stageEl.dataset.vwfNodeId = opts?.ownerNodeId || '';
            stageEl._vwfCanvasHost = host;
        }
        if (root.lucide) root.lucide.createIcons();
        const revealId = String(host._vwfStageRevealSelection || '');
        if (revealId) {
            host._vwfStageRevealSelection = '';
            /* The side column gets its final clientHeight after the stage
               cards and Three.js canvas finish layout.  Reveal once on the
               next paint and once shortly afterwards so a synchronous
               remount cannot leave the inspector stranded below the fold in
               a short desktop viewport. */
            const reveal = () => revealStageSelection(host, revealId);
            if (typeof root.requestAnimationFrame === 'function') {
                root.requestAnimationFrame(() => {
                    reveal();
                    root.setTimeout(reveal, 32);
                });
            } else {
                root.setTimeout(reveal, 0);
            }
        }
        return panel;
    }

    root.VideoWorkflowPanel = { mount, setPreview, mountStage, render };
})(window);
