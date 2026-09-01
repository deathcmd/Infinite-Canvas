(function (root, document) {
    'use strict';

    const schema = root.VideoWorkflowSchema;
    const panel = root.VideoWorkflowPanel;
    const params = new URLSearchParams(root.location.search || '');
    const canvasId = String(params.get('id') || '').trim();
    const nodeId = String(params.get('node') || '').trim();
    const localKey = 'canvas-lab:director-desk:' + (canvasId || 'draft');
    const recoveryKey = localKey + ':recovery';

    const host = document.getElementById('directorHost');
    const loading = document.getElementById('directorLoading');
    const errorBox = document.getElementById('directorError');
    const errorText = document.getElementById('directorErrorText');
    const retry = document.getElementById('directorRetry');
    const localNote = document.getElementById('directorLocalNote');
    const titleEl = document.getElementById('directorTitle');
    const subtitleEl = document.getElementById('directorSubtitle');
    const saveState = document.getElementById('directorSaveState');
    const backLink = document.getElementById('directorBack');
    const toastEl = document.getElementById('directorToast');
    const themeToggle = document.getElementById('directorThemeToggle');
    const dependencyDeadline = Date.now() + 5000;

    let canvasRecord = null;
    let stageNode = null;
    let workflow = null;
    let stageAssets = [];
    let saveTimer = 0;
    let saving = false;
    let saveAgain = false;
    let dirty = false;
    let workflowRevision = 0;
    let initSerial = 0;
    let toastTimer = 0;
    let leaving = false;
    let lastSaveError = null;
    let saveConflict = false;

    function setSaveState(label, state) {
        if (!saveState) return;
        saveState.textContent = String(label || '');
        saveState.dataset.state = state || '';
    }

    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = String(message || '');
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('is-on');
        }, 2600);
    }

    function showLoading(on) {
        if (loading) loading.hidden = !on;
        if (host) host.hidden = Boolean(on);
    }

    function showError(message) {
        if (errorText) errorText.textContent = String(message || '未知错误');
        if (errorBox) errorBox.hidden = false;
        if (host) host.hidden = true;
        if (loading) loading.hidden = true;
        setSaveState('需要处理', 'error');
    }

    function clearError() {
        if (errorBox) errorBox.hidden = true;
        if (host) host.hidden = false;
    }

    async function requestJson(url, init) {
        const response = await fetch(url, {
            credentials: 'same-origin',
            ...(init || {})
        });
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok) {
            const detail = payload && (payload.detail || payload.message);
            const detailText = detail && typeof detail === 'object'
                ? (detail.message || detail.error || JSON.stringify(detail))
                : detail;
            const error = new Error(String(detailText || ('请求失败（' + response.status + '）')));
            error.status = response.status;
            throw error;
        }
        return payload || {};
    }

    function canvasUrl() {
        return '/api/canvases/' + encodeURIComponent(canvasId);
    }

    function isStageNode(node) {
        return Boolean(node && (
            node.stageHost === true ||
            node.type === 'ltxDirector' ||
            node.type === 'stage3d'
        ));
    }

    function findStageNode(record) {
        const list = Array.isArray(record && record.nodes) ? record.nodes : [];
        const requested = nodeId ? list.find(function (item) {
            return String(item && item.id || '') === nodeId;
        }) : null;
        if (requested && isStageNode(requested)) return requested;
        if (nodeId) return null;
        return list.find(function (item) { return isStageNode(item); }) || null;
    }

    function readNodeWorkflow(node) {
        let next = schema.fromHost(node);
        if (node && node.type === 'ltxDirector' && node.ltxStage) {
            next.stage = schema.normalize({ stage: node.ltxStage }).stage;
        }
        return schema.normalize(next);
    }

    function writeNodeWorkflow(node, next) {
        const normalized = schema.normalize(next || {});
        if (node && node.type === 'ltxDirector' && !node.stageHost) {
            node.ltxStage = schema.normalize({ stage: normalized.stage }).stage;
            /* LTX nodes historically stored only `ltxStage`.  Persist the
               complete normalized workflow as well so layout screenshots,
               audio tracks and other purpose-aware references created in the
               standalone page are not discarded on the next reload.  Keep
               the legacy field in sync because the embedded LTX renderer
               still reads it as its authoritative stage value. */
            schema.writeHost(node, normalized);
            node.ltxStage = schema.normalize({ stage: normalized.stage }).stage;
        } else if (node) {
            schema.writeHost(node, normalized);
        }
        return normalized;
    }

    function collectAssets(record, node, wf) {
        const out = [];
        const seen = new Set();
        function add(item, fallbackKind) {
            if (!item || typeof item !== 'object') return;
            const url = String(item.url || item.imageUrl || item.src || '').trim();
            const name = String(item.name || item.title || '').trim();
            if (!url && !name) return;
            const id = String(item.id || url || name);
            if (seen.has(id)) return;
            seen.add(id);
            out.push({
                id,
                name: name || '本地素材',
                url,
                kind: item.kind || item.assetKind || fallbackKind || 'character',
                notes: String(item.notes || ''),
                /* Keep scene-card flags when assets are copied from a canvas
                   into the standalone director page.  Without this metadata
                   a checked panorama is rehydrated as a regular actor asset.
                   Prop appearance fields are likewise optional but cheap to
                   carry through for type-faithful placement. */
                panorama: Boolean(item.panorama) || item.assetKind === 'panorama' || item.kind === 'panorama',
                ...(item.primitive ? { primitive: item.primitive } : {}),
                ...(item.material ? { material: item.material } : {})
            });
        }
        (wf && wf.assets || []).forEach(function (item) { add(item, item.kind); });
        const nodes = Array.isArray(record && record.nodes) ? record.nodes : [];
        nodes.forEach(function (item) {
            if (!item || item.id === node?.id) return;
            const kind = item.assetKind || (item.type === 'image' ? 'scene' : 'character');
            add(item, kind);
            (item.assets || []).forEach(function (asset) { add(asset, asset.kind || kind); });
        });
        (node && node.assets || []).forEach(function (item) { add(item, item.kind); });
        return out;
    }

    function loadLocalWorkflow() {
        try {
            const raw = JSON.parse(root.localStorage.getItem(localKey) || '');
            if (raw && typeof raw === 'object') return schema.normalize(raw);
        } catch (_) {}
        return schema.emptyWorkflow();
    }

    function saveLocalWorkflow() {
        try {
            root.localStorage.setItem(localKey, JSON.stringify(workflow));
            setSaveState('本地已保存', 'saved');
            return true;
        } catch (_) {
            setSaveState('仅当前页', 'error');
            return false;
        }
    }

    /* Keep a connected-page recovery copy separate from the normal local
       draft.  It is intentionally plain JSON so it survives a tab crash or
       a rejected optimistic-version PUT without depending on the server. */
    function saveRecoveryDraft(reason) {
        if (!canvasRecord || !workflow || !schema) return false;
        try {
            root.localStorage.setItem(recoveryKey, JSON.stringify({
                version: 1,
                canvasId,
                nodeId: String(stageNode?.id || nodeId || ''),
                baseUpdatedAt: Number(canvasRecord.updated_at || 0),
                savedAt: Date.now(),
                reason: String(reason || 'unsaved'),
                workflow: schema.normalize(workflow)
            }));
            return true;
        } catch (_) {
            return false;
        }
    }

    function loadRecoveryDraft() {
        if (!canvasId || !schema) return null;
        try {
            const raw = JSON.parse(root.localStorage.getItem(recoveryKey) || '');
            if (!raw || typeof raw !== 'object' || !raw.workflow || typeof raw.workflow !== 'object') return null;
            if (String(raw.canvasId || canvasId) !== canvasId) return null;
            const expectedNode = String(stageNode?.id || nodeId || '');
            if (expectedNode && raw.nodeId && String(raw.nodeId) !== expectedNode) return null;
            return {
                ...raw,
                savedAt: Number(raw.savedAt || 0),
                baseUpdatedAt: Number(raw.baseUpdatedAt || 0),
                workflow: schema.normalize(raw.workflow)
            };
        } catch (_) {
            return null;
        }
    }

    function clearRecoveryDraft() {
        try { root.localStorage.removeItem(recoveryKey); } catch (_) {}
    }

    function markRecoveryNotice(message) {
        if (!localNote) return;
        localNote.textContent = String(message || '');
        localNote.hidden = !message;
    }

    function syncRecord() {
        if (!canvasRecord || !stageNode) return;
        const list = Array.isArray(canvasRecord.nodes) ? canvasRecord.nodes : [];
        const current = list.find(function (item) {
            return String(item && item.id || '') === String(stageNode.id || '');
        });
        if (current && current !== stageNode) stageNode = current;
        if (stageNode) writeNodeWorkflow(stageNode, workflow);
    }

    function queueSave() {
        if (!canvasRecord || !stageNode) {
            saveLocalWorkflow();
            return;
        }
        dirty = true;
        lastSaveError = null;
        saveConflict = false;
        saveRecoveryDraft('unsaved');
        setSaveState('待保存', 'saving');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveCanvas, 520);
    }

    async function saveCanvas() {
        saveTimer = 0;
        if (!canvasRecord || !stageNode) return true;
        if (saving) {
            saveAgain = true;
            return false;
        }
        saving = true;
        saveAgain = false;
        setSaveState('保存中…', 'saving');
        saveRecoveryDraft('unsaved');
        syncRecord();
        const requestRevision = workflowRevision;
        const body = {
            title: canvasRecord.title || '未命名画布',
            icon: canvasRecord.icon || '🧩',
            nodes: Array.isArray(canvasRecord.nodes) ? canvasRecord.nodes : [],
            connections: Array.isArray(canvasRecord.connections) ? canvasRecord.connections : [],
            viewport: canvasRecord.viewport || {},
            logs: Array.isArray(canvasRecord.logs) ? canvasRecord.logs : [],
            client_id: 'director-desk',
            base_updated_at: Number(canvasRecord.updated_at || 0)
        };
        if (canvasRecord.settings !== undefined) body.settings = canvasRecord.settings;
        let completed = false;
        try {
            const result = await requestJson(canvasUrl(), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const newerEdits = workflowRevision !== requestRevision;
            if (result.canvas) {
                canvasRecord = result.canvas;
                stageNode = findStageNode(canvasRecord);
                if (stageNode) {
                    if (newerEdits) {
                        // The response is based on the pre-request snapshot;
                        // keep the newer local workflow and only refresh the
                        // server record metadata before the follow-up PUT.
                        writeNodeWorkflow(stageNode, workflow);
                    } else {
                        workflow = readNodeWorkflow(stageNode);
                    }
                }
            }
            if (newerEdits) {
                dirty = true;
                saveAgain = true;
                saveRecoveryDraft('unsaved');
            } else {
                dirty = false;
                lastSaveError = null;
                saveConflict = false;
                clearRecoveryDraft();
            }
            setSaveState('已保存', 'saved');
            completed = !newerEdits;
        } catch (error) {
            dirty = true;
            lastSaveError = error || new Error('save failed');
            const conflict = Boolean(error && (error.status === 409 || /409|旧版本|其他页面/.test(String(error.message || ''))));
            saveConflict = conflict;
            saveRecoveryDraft(conflict ? 'conflict' : 'save-failed');
            if (conflict) {
                showToast('画布已在其他页面更新，未覆盖远程版本；本地草稿已保留。');
                setSaveState('冲突，草稿已保留', 'error');
            } else {
                showToast('保存失败，本地草稿已保留：' + String(error && error.message || error));
                setSaveState('失败，草稿已保留', 'error');
            }
        } finally {
            saving = false;
            if (saveAgain) queueSave();
        }
        return completed;
    }

    async function flushSave() {
        clearTimeout(saveTimer);
        saveTimer = 0;
        const waitForIdle = async (limitMs) => {
            const started = Date.now();
            while (saving && Date.now() - started < (limitMs || 5000)) {
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        };
        if (canvasRecord && stageNode && workflow) {
            await waitForIdle(5000);
            if (dirty || saveAgain) await saveCanvas();
            await waitForIdle(5000);
            if (saveAgain && !saving) {
                saveAgain = false;
                dirty = true;
                clearTimeout(saveTimer);
                saveTimer = 0;
                await saveCanvas();
                await waitForIdle(5000);
            }
            return Boolean(!saving && !dirty && !saveAgain && !lastSaveError);
        } else if (!canvasRecord && workflow) {
            return saveLocalWorkflow();
        }
        return !workflow || !canvasRecord;
    }

    function commit(next) {
        workflow = schema.normalize(next || workflow || schema.emptyWorkflow());
        workflowRevision += 1;
        syncRecord();
        queueSave();
    }

    function setPageMeta() {
        const appName = root.CanvasBrand?.appName || '画布实验室';
        if (canvasRecord) {
            const name = String(canvasRecord.title || '未命名画布');
            if (titleEl) titleEl.textContent = name + ' · 3D导演台';
            if (subtitleEl) subtitleEl.textContent = '独立页面 · 与画布实时保存';
            document.title = name + ' · 3D导演台 · ' + appName;
            if (localNote) localNote.hidden = true;
            if (backLink) {
                backLink.href = '/static/canvas.html?id=' + encodeURIComponent(canvasRecord.id || canvasId);
            }
        } else {
            if (titleEl) titleEl.textContent = '3D导演台';
            if (subtitleEl) subtitleEl.textContent = '本地草稿 · 不连接远程服务';
            document.title = '3D导演台 · ' + appName;
            if (backLink) backLink.href = '/static/canvas-list.html';
            if (localNote) localNote.hidden = false;
        }
    }

    function mountDirector() {
        if (!host || !panel || !workflow) return;
        host.hidden = false;
        host.innerHTML = '';
        host._vwfDesk = false;
        panel.mountStage(host, function () {
            return workflow.stage;
        }, function (stage) {
            workflow.stage = schema.normalizeStage(stage);
            commit(workflow);
        }, {
            standalone: true,
            assets: stageAssets,
            getWorkflow: function () { return workflow; },
            setWorkflow: function (next) { commit(next); },
            ownerNodeId: stageNode?.id || 'local-stage',
            deskOpen: false,
            onDeskChange: function () {},
            onRecordError: function (message) { showToast(message); },
            onUploadError: function (message) { showToast(message); },
            onPlacementError: function (message) { showToast(message); },
            onExportError: function (message) { showToast(message); },
            onExport: async function (dataUrl, stage) {
                workflow.stage = schema.normalizeStage(stage);
                if (dataUrl) workflow.stage.layoutUrl = dataUrl;
                commit(workflow);
                showToast('构图已保存到导演台素材');
            }
        });
        root.lucide?.createIcons?.();
    }

    async function init() {
        const serial = ++initSerial;
        if (!schema || !panel) {
            if (Date.now() >= dependencyDeadline) {
                showError('导演台脚本加载失败，请刷新页面重试。');
                return;
            }
            setTimeout(init, 80);
            return;
        }
        clearError();
        showLoading(true);
        setSaveState('载入中…', 'saving');
        try {
            if (canvasId) {
                const result = await requestJson(canvasUrl());
                if (serial !== initSerial) return;
                canvasRecord = result.canvas;
                stageNode = findStageNode(canvasRecord);
                if (!stageNode) {
                    throw new Error(nodeId
                        ? '链接的节点不是 3D 导演台，请从画布中的导演台按钮重新打开。'
                        : '这个画布还没有 3D 导演台节点，请先在画布添加一个。');
                }
                workflow = readNodeWorkflow(stageNode);
                lastSaveError = null;
                saveConflict = false;
                dirty = false;
                saveAgain = false;
                setPageMeta();
                const recovery = loadRecoveryDraft();
                if (recovery && recovery.savedAt > Number(canvasRecord.updated_at || 0)) {
                    /* A failed PUT/crashed tab can leave a newer local copy
                       than the server.  Restore it in-place and leave it
                       dirty so the user can retry or inspect before leaving. */
                    workflow = recovery.workflow;
                    workflowRevision += 1;
                    dirty = true;
                    markRecoveryNotice('已恢复上次未提交的本地草稿；保存成功后会自动清理。');
                    setSaveState('已恢复草稿，待保存', 'saving');
                    showToast('已恢复上次未提交的本地草稿。');
                } else if (recovery) {
                    /* The server is newer than the recovery copy, so keeping
                       the stale snapshot would be misleading. */
                    clearRecoveryDraft();
                }
                stageAssets = collectAssets(canvasRecord, stageNode, workflow);
                mountDirector();
                if (!recovery || recovery.savedAt <= Number(canvasRecord.updated_at || 0)) {
                    setSaveState('已载入', 'saved');
                }
            } else {
                canvasRecord = null;
                stageNode = null;
                workflow = loadLocalWorkflow();
                lastSaveError = null;
                saveConflict = false;
                dirty = false;
                saveAgain = false;
                stageAssets = collectAssets(null, null, workflow);
                setPageMeta();
                mountDirector();
                setSaveState('本地已保存', 'saved');
            }
            showLoading(false);
            root.lucide?.createIcons?.();
        } catch (error) {
            if (serial !== initSerial) return;
            showError(error && error.message ? error.message : String(error));
        }
    }

    themeToggle?.addEventListener('click', function () {
        const current = root.StudioTheme?.get?.() || (document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light');
        root.StudioTheme?.set?.(current === 'dark' ? 'light' : 'dark');
        root.lucide?.createIcons?.();
    });
    retry?.addEventListener('click', function () {
        init();
    });
    backLink?.addEventListener('click', async function (event) {
        event.preventDefault();
        if (leaving) return;
        leaving = true;
        const href = backLink.href || '/static/canvas-list.html';
        setSaveState('离开前保存…', 'saving');
        let flushed = false;
        try { flushed = await flushSave(); } catch (error) {
            lastSaveError = error || new Error('save failed');
            if (canvasRecord) saveRecoveryDraft('save-failed');
        }
        if (!flushed) {
            leaving = false;
            if (saveConflict) {
                setSaveState('冲突，草稿已保留', 'error');
                showToast('未离开：远程画布已有新版本，本地草稿已保留。请刷新画布后再继续。');
            } else {
                setSaveState('失败，草稿已保留', 'error');
                showToast('未离开：还有未保存编辑，本地草稿已保留，请稍后重试。');
            }
            return;
        }
        try { root.location.assign(href); } catch (_) { leaving = false; }
    });
    root.addEventListener('beforeunload', function (event) {
        if (!workflow) return;
        if (canvasRecord) {
            if (dirty || saving || saveAgain || lastSaveError) {
                saveRecoveryDraft(saveConflict ? 'conflict' : 'unsaved');
                /* beforeunload cannot await the remote PUT.  Keep the
                   synchronous recovery copy above and ask the browser to
                   warn before a dirty connected desk is discarded. */
                try {
                    event.preventDefault();
                    event.returnValue = '';
                } catch (_) {}
            }
        } else {
            saveLocalWorkflow();
        }
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})(window, document);
