// canvas-list.js — Project Workspace.
// Two-pane: LEFT project list, RIGHT pannable/zoomable board of canvas cards.
// Self-contained; relies only on global fetch / StudioI18n / lucide.

/* ===== Small helpers (copied from the previous gate file) ===== */
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function tr(key){ return window.StudioI18n ? StudioI18n.t(key) : key; }
function langIsEn(){ return window.StudioI18n?.lang?.() === 'en'; }
function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHtml(str); }
function L(zh, en){ return langIsEn() ? en : zh; }
function compactLabel(fullZh, compactZh, en){ return window.innerWidth <= 760 ? L(compactZh, en) : L(fullZh, en); }
const CANVAS_LIST_PROJECT_KEY = 'canvasListCurrentProjectId';

function rememberedProjectId(){
    try {
        return new URLSearchParams(window.location.search).get('project') || localStorage.getItem(CANVAS_LIST_PROJECT_KEY) || 'default';
    } catch(e){
        return 'default';
    }
}

function rememberProjectId(pid){
    if(!pid) return;
    try { localStorage.setItem(CANVAS_LIST_PROJECT_KEY, pid); } catch(e){}
}

function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(langIsEn() ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderCanvasIcon(icon, size = 16){
    if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}

/* ===== DOM refs ===== */
const board = document.getElementById('board');
const boardWorld = document.getElementById('boardWorld');
const boardEmptyHint = document.getElementById('boardEmptyHint');
const boardProjectName = document.getElementById('boardProjectName');
const boardCanvasCount = document.getElementById('boardCanvasCount');
const projectListEl = document.getElementById('projectList');
const trashEntryBtn = document.getElementById('trashEntry');
const trashBadge = document.getElementById('trashBadge');
const trashPanel = document.getElementById('trashPanel');
const trashListEl = document.getElementById('trashList');
const trashCloseBtn = document.getElementById('trashClose');
const newProjectBtn = document.getElementById('newProjectBtn');
const newProjectRow = document.getElementById('newProjectRow');
const newProjectInput = document.getElementById('newProjectInput');
const newProjectConfirm = document.getElementById('newProjectConfirm');
const newProjectCancel = document.getElementById('newProjectCancel');
const newCanvasBtn = document.getElementById('newCanvasBtn');
const boardRefreshBtn = document.getElementById('boardRefresh');
const boardResetViewBtn = document.getElementById('boardResetView');
const pasteCanvasBtn = document.getElementById('pasteCanvasBtn');
const emptyCreateCanvasBtn = document.getElementById('emptyCreateCanvasBtn');
const statusEl = document.getElementById('boardStatus');
const boardBulkToolbar = document.getElementById('boardBulkToolbar');
const boardSelectionCountEl = document.getElementById('boardSelectionCount');
const boardSelectAllBtn = document.getElementById('boardSelectAllBtn');
const boardClearSelectionBtn = document.getElementById('boardClearSelectionBtn');
const boardBulkDeleteBtn = document.getElementById('boardBulkDeleteBtn');
const trashBulkToolbar = document.getElementById('trashBulkToolbar');
const trashSelectionCountEl = document.getElementById('trashSelectionCount');
const trashSelectAllBtn = document.getElementById('trashSelectAllBtn');
const trashClearSelectionBtn = document.getElementById('trashClearSelectionBtn');
const trashBulkRestoreBtn = document.getElementById('trashBulkRestoreBtn');
const trashBulkPurgeBtn = document.getElementById('trashBulkPurgeBtn');
const bulkConfirmDialog = document.getElementById('bulkConfirmDialog');
const bulkConfirmTitle = document.getElementById('bulkConfirmTitle');
const bulkConfirmMessage = document.getElementById('bulkConfirmMessage');
const bulkConfirmCancel = document.getElementById('bulkConfirmCancel');
const bulkConfirmSubmit = document.getElementById('bulkConfirmSubmit');

/* ===== State ===== */
let projects = [];
let canvases = [];          // all canvases across projects
let deletedCanvases = [];
let currentProjectId = rememberedProjectId();
let pendingDeleteProjectId = null;
let statusTimer = null;
let clipboardCanvasId = null;   // 剪切的画布（切到别的项目后粘贴）
const selectedCanvasIds = new Set();
const selectedTrashIds = new Set();
let bulkDialogState = null;
let bulkDialogPreviousFocus = null;
let bulkActionBusy = false;
// Refreshes can overlap (for example a toolbar refresh immediately followed
// by a restore/delete completion).  Keep only the newest response authoritative
// so a slower, older request cannot put the board back into a stale project
// state.  Abort is a best-effort optimisation; the generation guard is the
// correctness boundary for browsers without AbortController.
let loadAllGeneration = 0;
let loadAllController = null;

// Layout repairs are queued instead of firing one request per render.  Older
// canvases often contain a shared default position; repairing those records in
// small batches keeps the board responsive and avoids a thundering herd of
// metadata writes when the page first opens.
const layoutMetaQueue = new Map();
let layoutMetaFlushRunning = false;
let layoutMetaFailureCount = 0;

// board viewport (mirrors smart-canvas math)
const viewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.3, MAX_SCALE = 2;
// Keep the first board paint readable even when an older project contains a
// very large, sparse coordinate space.  Fitting every historical card can
// produce a scale below 0.1 (the cards become effectively invisible), so a
// pathological board is initially focused on the most recent cards.  Users
// can still pan/zoom to the remaining cards, and no card coordinates are
// rewritten by this viewport-only fallback.
const READABLE_RESET_SCALE = 0.78;
const RESET_FOCUS_CARD_LIMIT = 16;
// The manager page embeds canvas-list.html in a ~730px-wide desktop frame.
// Treat that as a desktop surface too; only genuinely narrow windows should
// skip the compact focus treatment.
const READABLE_FOCUS_MIN_WIDTH = 640;
// A first paint can happen while this page is still inside the root iframe.
// Keep the retry state local to the viewport (never persist it with a card)
// and stop retries as soon as the user starts panning/zooming.
let viewportUserAdjusted = false;
let initialViewportSettled = false;
let initialResetTimer = null;
let initialResetAttempts = 0;
const INITIAL_RESET_DELAYS = [0, 80, 220, 500, 1000];

// When a legacy project has a very large world, resetView() focuses the
// newest compact cluster so the first frame remains readable.  Keep the
// remaining cards in the DOM (and therefore keyboard/mouse reachable), but
// lower their visual weight until the user explicitly pans or zooms.  This is
// a view-only affordance: persisted board coordinates are never changed.
function clearReadableFocusMode(){
    if(!board) return;
    board.classList.remove('libtv-focus-mode');
    boardWorld?.querySelectorAll('.ws-card.libtv-focus-card').forEach(card => {
        card.classList.remove('libtv-focus-card');
    });
}

function applyReadableFocusMode(focusCards){
    if(!board || !boardWorld) return;
    const focus = new Set(Array.isArray(focusCards) ? focusCards : []);
    boardWorld.querySelectorAll('.ws-card').forEach(card => {
        card.classList.toggle('libtv-focus-card', focus.has(card));
    });
    board.classList.toggle('libtv-focus-mode', focus.size > 0);
}

/* ===== Status toast ===== */
function setStatus(text){
    if(!statusEl) return;
    if(!text){ statusEl.classList.remove('show'); return; }
    statusEl.textContent = text;
    statusEl.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2200);
}

function queueLayoutMeta(id, patch){
    const key = String(id == null ? '' : id).trim();
    if(!key || !patch || typeof patch !== 'object') return;
    const previous = layoutMetaQueue.get(key);
    layoutMetaQueue.set(key, {
        id,
        patch: previous ? { ...previous.patch, ...patch } : { ...patch }
    });
    flushLayoutMetaQueue();
}

async function flushLayoutMetaQueue(){
    if(layoutMetaFlushRunning) return;
    layoutMetaFlushRunning = true;
    try {
        while(layoutMetaQueue.size){
            // A small batch keeps first paint responsive while avoiding 100+
            // simultaneous writes when a legacy project has a large cluster.
            const batch = [...layoutMetaQueue.entries()].slice(0, 8);
            batch.forEach(([key]) => layoutMetaQueue.delete(key));
            const results = await Promise.all(batch.map(([, item]) =>
                persistMeta(item.id, item.patch, { quiet: true })
            ));
            layoutMetaFailureCount += results.filter(ok => !ok).length;
        }
    } finally {
        layoutMetaFlushRunning = false;
        if(layoutMetaFailureCount){
            setStatus(L('部分画布位置保存失败，请重试','Some card positions could not be saved; please retry'));
            layoutMetaFailureCount = 0;
        }
        // A drag or a second render may have queued a newer patch between the
        // last batch and the flag reset.  Drain it without spawning another
        // overlapping worker.
        if(layoutMetaQueue.size) flushLayoutMetaQueue();
    }
}

/* ===== Viewport math (mirrors smart-canvas.js) ===== */
function applyViewport(){
    boardWorld.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    board.style.backgroundSize = `${120 * viewport.scale}px ${120 * viewport.scale}px, ${120 * viewport.scale}px ${120 * viewport.scale}px, ${24 * viewport.scale}px ${24 * viewport.scale}px`;
    board.style.backgroundPosition = `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`;
}
function screenToWorld(clientX, clientY){
    const rect = board.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewport.x) / viewport.scale,
        y: (clientY - rect.top - viewport.y) / viewport.scale
    };
}
function boardCenterWorld(){
    return {
        x: (board.clientWidth / 2 - viewport.x) / viewport.scale,
        y: (board.clientHeight / 2 - viewport.y) / viewport.scale
    };
}

function measureCardBounds(cards){
    return cards.reduce((acc, el) => {
        // offsetLeft/offsetTop are the layout coordinates of an absolutely
        // positioned card and do not depend on the current board transform.
        // They are also more robust than parsing a style string when a page
        // embeds a non-standard global parseFloat implementation.
        const x = Number.isFinite(el.offsetLeft) ? el.offsetLeft : 0;
        const y = Number.isFinite(el.offsetTop) ? el.offsetTop : 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        acc.minX = Math.min(acc.minX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxX = Math.max(acc.maxX, x + w);
        acc.maxY = Math.max(acc.maxY, y + h);
        return acc;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function boundsFitScale(bounds, padding){
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(1, board.clientWidth - padding * 2);
    const availableHeight = Math.max(1, board.clientHeight - padding * 2);
    return Math.min(1, availableWidth / width, availableHeight / height);
}

function cancelInitialReadableReset(){
    if(initialResetTimer !== null){
        clearTimeout(initialResetTimer);
        initialResetTimer = null;
    }
    initialResetAttempts = 0;
}

/**
 * Pick a compact group of recent cards for a readable first viewport.
 *
 * Card coordinates are deliberately treated as read-only here.  Older
 * projects can have a very sparse world (or a few cards in several clusters),
 * so taking a blind prefix often leaves only one card inside the readable
 * scale.  We inspect a bounded recent window, grow a group around each of the
 * newest anchors by distance, and retain the densest group that fits at the
 * readable floor.  The deterministic tie-breakers keep refreshes stable.
 */
function readableFocusSelection(cards, padding){
    if(!board || cards.length <= RESET_FOCUS_CARD_LIMIT) return null;
    const availableWidth = Math.max(1, board.clientWidth - padding * 2);
    const availableHeight = Math.max(1, board.clientHeight - padding * 2);
    const maxWidth = availableWidth / READABLE_RESET_SCALE;
    const maxHeight = availableHeight / READABLE_RESET_SCALE;
    const recentLimit = Math.min(cards.length, Math.max(RESET_FOCUS_CARD_LIMIT * 3, 48));
    const recent = cards.slice(0, recentLimit).map((el, index) => {
        const x = Number.isFinite(el.offsetLeft) ? el.offsetLeft : 0;
        const y = Number.isFinite(el.offsetTop) ? el.offsetTop : 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        return { el, index, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    });
    const anchors = recent.slice(0, Math.min(24, recent.length));
    let best = null;
    const compare = (candidate, current) => {
        if(!current) return true;
        if(candidate.count !== current.count) return candidate.count > current.count;
        if(candidate.recency !== current.recency) return candidate.recency < current.recency;
        if(candidate.area !== current.area) return candidate.area < current.area;
        return candidate.anchorIndex < current.anchorIndex;
    };
    anchors.forEach(anchor => {
        const picked = [anchor];
        let bounds = {
            minX: anchor.x,
            minY: anchor.y,
            maxX: anchor.x + anchor.w,
            maxY: anchor.y + anchor.h
        };
        // Prefer nearby cards, with a small recency bias so an old dense
        // pocket cannot displace a similarly sized newer pocket.
        const ordered = recent.slice().sort((a, b) => {
            const da = Math.abs(a.cx - anchor.cx) + Math.abs(a.cy - anchor.cy);
            const db = Math.abs(b.cx - anchor.cx) + Math.abs(b.cy - anchor.cy);
            const sa = da + a.index * 6;
            const sb = db + b.index * 6;
            return sa - sb || a.index - b.index;
        });
        ordered.forEach(candidate => {
            if(picked.length >= RESET_FOCUS_CARD_LIMIT || candidate === anchor) return;
            const next = {
                minX: Math.min(bounds.minX, candidate.x),
                minY: Math.min(bounds.minY, candidate.y),
                maxX: Math.max(bounds.maxX, candidate.x + candidate.w),
                maxY: Math.max(bounds.maxY, candidate.y + candidate.h)
            };
            const width = next.maxX - next.minX;
            const height = next.maxY - next.minY;
            // Continue looking after a rejected outlier; another nearby card
            // can still fit inside the same readable rectangle.
            if(width > maxWidth || height > maxHeight) return;
            picked.push(candidate);
            bounds = next;
        });
        const area = Math.max(1, bounds.maxX - bounds.minX) * Math.max(1, bounds.maxY - bounds.minY);
        const recency = picked.reduce((sum, item) => sum + item.index, 0);
        const candidate = { cards: picked.map(item => item.el), bounds, count: picked.length, recency, area, anchorIndex: anchor.index };
        if(compare(candidate, best)) best = candidate;
    });
    return best;
}

/**
 * Retry an automatic reset while an embedded page is waiting for its layout.
 * A user gesture always wins: once pan/zoom is observed this timer becomes a
 * no-op, so a late iframe resize cannot yank the viewport away from the user.
 */
function scheduleInitialReadableReset(){
    if(viewportUserAdjusted || initialViewportSettled || initialResetTimer !== null) return;
    const delay = INITIAL_RESET_DELAYS[Math.min(initialResetAttempts, INITIAL_RESET_DELAYS.length - 1)];
    initialResetAttempts += 1;
    initialResetTimer = setTimeout(() => {
        initialResetTimer = null;
        if(viewportUserAdjusted || initialViewportSettled) return;
        const settled = resetView({ auto: true });
        if(!settled && initialResetAttempts < INITIAL_RESET_DELAYS.length){
            scheduleInitialReadableReset();
        }
    }, delay);
}

function resetView(options){
    const auto = !!(options && options.auto);
    // Explicit toolbar resets are intentional and clear the gesture guard;
    // automatic resets must never override a viewport the user adjusted.
    if(auto && viewportUserAdjusted) return false;
    if(!auto){
        viewportUserAdjusted = false;
        initialViewportSettled = false;
        cancelInitialReadableReset();
    }
    // An iframe can invoke loadAll before its flex layout has a measurable
    // board.  Leave the current transform alone and let the retry settle it.
    if(!board || !boardWorld || board.clientWidth < 2 || board.clientHeight < 2) return false;
    const cards = Array.from(boardWorld.querySelectorAll('.ws-card'));
    if(!cards.length){
        viewport.x = 0; viewport.y = 0; viewport.scale = 1; applyViewport();
        clearReadableFocusMode();
        initialViewportSettled = true;
        return true;
    }
    const padding = board.clientWidth < 640 ? 20 : 40;
    const allBounds = measureCardBounds(cards);
    let bounds = allBounds;
    let fitScale = boundsFitScale(bounds, padding);
    let focusedCount = 0;
    let focusedCards = [];

    // Some pre-LibTV projects have hundreds of cards spread over a huge
    // legacy grid.  Centering that entire range at a readable scale leaves
    // the initial viewport empty.  Focus a bounded, deterministic *cluster*
    // (the API returns cards in recency order) while leaving every card at its
    // original world coordinate so pan, drag, and zoom remain lossless.
    if(board.clientWidth >= READABLE_FOCUS_MIN_WIDTH && cards.length > RESET_FOCUS_CARD_LIMIT && fitScale < READABLE_RESET_SCALE){
        const focus = readableFocusSelection(cards, padding);
        if(focus){
            focusedCount = focus.count;
            focusedCards = focus.cards;
            bounds = focus.bounds;
            fitScale = boundsFitScale(bounds, padding);
        }
    }

    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    viewport.scale = board.clientWidth < 640 ? 1 : Math.min(MAX_SCALE, Math.max(READABLE_RESET_SCALE, fitScale));
    const fitsX = width * viewport.scale <= board.clientWidth - padding * 2;
    const fitsY = height * viewport.scale <= board.clientHeight - padding * 2;
    viewport.x = Math.round((fitsX ? (board.clientWidth - width * viewport.scale) / 2 : padding) - bounds.minX * viewport.scale);
    viewport.y = Math.round((fitsY ? Math.max(padding, (board.clientHeight - height * viewport.scale) / 2) : padding) - bounds.minY * viewport.scale);
    applyViewport();
    applyReadableFocusMode(focusedCards);
    initialViewportSettled = true;
    if(focusedCount){
        setStatus(L(`已聚焦最近一组 ${focusedCount} 个画布，可拖动画布查看其余`, `Showing a recent cluster of ${focusedCount} canvases — drag to explore the rest`));
    }
    return true;
}

/* ===== Board pan & zoom ===== */
let panState = null;
function onBoardPanStart(e){
    if(e.button !== 0) return;
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card') || e.target.closest('.ws-card-pop') || e.target.closest('button,input,textarea,select')) return;
    // The first intentional pan expands the view back to the full infinite
    // board.  Focus styling is only a first-frame readability aid.
    clearReadableFocusMode();
    closeCardMenu();
    panState = { startX: e.clientX, startY: e.clientY, ox: viewport.x, oy: viewport.y, moved: false };
    board.classList.add('panning');
}
function onBoardPanMove(e){
    if(!panState) return;
    viewport.x = panState.ox + (e.clientX - panState.startX);
    viewport.y = panState.oy + (e.clientY - panState.startY);
    if(Math.abs(e.clientX - panState.startX) > 3 || Math.abs(e.clientY - panState.startY) > 3){
        panState.moved = true;
        viewportUserAdjusted = true;
        initialViewportSettled = true;
    }
    applyViewport();
}
function onBoardPanEnd(){
    if(!panState) return;
    panState = null;
    board.classList.remove('panning');
}
function onBoardWheel(e){
    e.preventDefault();
    // Zooming is also an explicit exploration gesture; reveal the complete
    // board before changing the scale so dimmed context cards do not feel
    // missing.
    clearReadableFocusMode();
    // Wheel zoom is an explicit viewport choice even when the pointer did not
    // move.  It also cancels any delayed iframe-layout reset.
    viewportUserAdjusted = true;
    initialViewportSettled = true;
    if(initialResetTimer !== null) cancelInitialReadableReset();
    const rect = board.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // world point under cursor before zoom
    const wx = (px - viewport.x) / viewport.scale;
    const wy = (py - viewport.y) / viewport.scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
    viewport.scale = next;
    // keep the same world point under the cursor
    viewport.x = px - wx * next;
    viewport.y = py - wy * next;
    applyViewport();
}

/* ===== Data loading ===== */
function currentProject(){ return projects.find(p => p.id === currentProjectId) || projects[0] || null; }
function canvasesInProject(pid){ return canvases.filter(c => (c.project || 'default') === pid); }

/* ===== Bulk selection helpers ===== */
function normalizeIds(ids){
    return [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id == null ? '' : id).trim()).filter(Boolean))];
}

function pruneSelection(selection, availableIds){
    const available = new Set(normalizeIds(availableIds));
    [...selection].forEach(id => { if(!available.has(String(id))) selection.delete(id); });
}

function applyBulkLabels(){
    const setButton = (id, zh, en, titleZh, titleEn) => {
        const button = document.getElementById(id);
        if(!button) return;
        const label = button.querySelector('span');
        if(label) label.textContent = L(zh, en);
        button.title = L(titleZh, titleEn);
        button.setAttribute('aria-label', L(titleZh, titleEn));
    };
    setButton('boardSelectAllBtn', '全选', 'Select all', '选择当前项目全部画布', 'Select all canvases in this project');
    setButton('boardClearSelectionBtn', '清空', 'Clear', '清空当前选择', 'Clear the current selection');
    setButton('boardBulkDeleteBtn', '移入回收站', 'Move to trash', '将选中的画布移入回收站', 'Move selected canvases to the trash');
    setButton('trashSelectAllBtn', '全选', 'Select all', '选择回收站中的全部画布', 'Select all canvases in the trash');
    setButton('trashClearSelectionBtn', '清空', 'Clear', '清空当前选择', 'Clear the current selection');
    setButton('trashBulkRestoreBtn', '批量恢复', 'Restore selected', '恢复选中的画布', 'Restore selected canvases');
    setButton('trashBulkPurgeBtn', '彻底删除', 'Delete permanently', '彻底删除选中的画布', 'Permanently delete selected canvases');
    if(boardBulkToolbar) boardBulkToolbar.setAttribute('aria-label', L('画布批量操作', 'Canvas bulk actions'));
    if(trashBulkToolbar) trashBulkToolbar.setAttribute('aria-label', L('回收站批量操作', 'Trash bulk actions'));
    if(bulkConfirmCancel) bulkConfirmCancel.textContent = L('取消', 'Cancel');
    if(bulkConfirmSubmit && !bulkDialogState) bulkConfirmSubmit.textContent = L('确认', 'Confirm');
    if(bulkDialogState && bulkConfirmTitle && bulkConfirmMessage && bulkConfirmSubmit){
        const action = bulkDialogState.action;
        bulkConfirmTitle.textContent = action === 'trash' ? L('移入回收站', 'Move to trash') : L('彻底删除', 'Delete permanently');
        bulkConfirmMessage.textContent = bulkActionDescription(action, bulkDialogState.ids.length);
        bulkConfirmSubmit.textContent = action === 'trash' ? L('移入回收站', 'Move to trash') : L('彻底删除', 'Delete permanently');
    }
}

function selectedCanvasList(){
    const available = new Set(canvasesInProject(currentProjectId).map(c => String(c.id)));
    return [...selectedCanvasIds].filter(id => available.has(String(id)));
}

function selectedTrashList(){
    const available = new Set(deletedCanvases.map(c => String(c.id)));
    return [...selectedTrashIds].filter(id => available.has(String(id)));
}

function updateBulkToolbar(){
    applyBulkLabels();
    const boardItems = canvasesInProject(currentProjectId);
    const boardIds = boardItems.map(c => String(c.id));
    pruneSelection(selectedCanvasIds, boardIds);
    const boardSelected = selectedCanvasList();
    const boardCount = boardSelected.length;
    if(boardBulkToolbar){ boardBulkToolbar.hidden = boardItems.length === 0; }
    if(boardSelectionCountEl){
        boardSelectionCountEl.textContent = L(`已选 ${boardCount} 个画布`, `${boardCount} canvas${boardCount === 1 ? '' : 'es'} selected`);
    }
    if(boardSelectAllBtn){ boardSelectAllBtn.disabled = boardItems.length === 0 || boardCount === boardItems.length; }
    if(boardClearSelectionBtn){ boardClearSelectionBtn.disabled = boardCount === 0; }
    if(boardBulkDeleteBtn){ boardBulkDeleteBtn.disabled = boardCount === 0 || bulkActionBusy; }

    const trashIds = deletedCanvases.map(c => String(c.id));
    pruneSelection(selectedTrashIds, trashIds);
    const trashSelected = selectedTrashList();
    const trashCount = trashSelected.length;
    if(trashBulkToolbar){ trashBulkToolbar.hidden = deletedCanvases.length === 0; }
    if(trashSelectionCountEl){
        trashSelectionCountEl.textContent = L(`已选 ${trashCount} 个画布`, `${trashCount} canvas${trashCount === 1 ? '' : 'es'} selected`);
    }
    if(trashSelectAllBtn){ trashSelectAllBtn.disabled = deletedCanvases.length === 0 || trashCount === deletedCanvases.length; }
    if(trashClearSelectionBtn){ trashClearSelectionBtn.disabled = trashCount === 0; }
    if(trashBulkRestoreBtn){ trashBulkRestoreBtn.disabled = trashCount === 0 || bulkActionBusy; }
    if(trashBulkPurgeBtn){ trashBulkPurgeBtn.disabled = trashCount === 0 || bulkActionBusy; }
}

function setCanvasSelection(id, checked){
    const key = String(id);
    if(checked) selectedCanvasIds.add(key); else selectedCanvasIds.delete(key);
    const card = boardWorld?.querySelector(`.ws-card[data-canvas-id="${CSS.escape(key)}"]`);
    if(card){
        card.classList.toggle('selected', checked);
        card.setAttribute('aria-selected', checked ? 'true' : 'false');
    }
    updateBulkToolbar();
}

function setTrashSelection(id, checked){
    const key = String(id);
    if(checked) selectedTrashIds.add(key); else selectedTrashIds.delete(key);
    const card = trashListEl?.querySelector(`.ws-trash-card[data-canvas-id="${CSS.escape(key)}"]`);
    if(card){
        card.classList.toggle('selected', checked);
        card.setAttribute('aria-selected', checked ? 'true' : 'false');
    }
    updateBulkToolbar();
}

function selectAllCanvasItems(){
    canvasesInProject(currentProjectId).forEach(c => selectedCanvasIds.add(String(c.id)));
    renderBoard();
}

function clearCanvasSelection(){
    selectedCanvasIds.clear();
    renderBoard();
}

function selectAllTrashItems(){
    deletedCanvases.forEach(c => selectedTrashIds.add(String(c.id)));
    renderTrash();
}

function clearTrashSelection(){
    selectedTrashIds.clear();
    renderTrash();
}

function canvasListEditableTarget(target){
    return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

async function loadAll(){
    const generation = ++loadAllGeneration;
    if(loadAllController && typeof loadAllController.abort === 'function') {
        try { loadAllController.abort(); } catch(_) {}
    }
    loadAllController = typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions = loadAllController ? { signal: loadAllController.signal } : undefined;
    try {
        const [pRes, cRes] = await Promise.all([
            fetch('/api/projects', requestOptions),
            fetch('/api/canvases', requestOptions)
        ]);
        // Do not turn a transient 5xx/invalid JSON response into an empty
        // board. Keep the last good snapshot and report the partial failure;
        // an empty fallback is only used on the very first load where there is
        // no safe state to preserve.
        const readJson = async response => {
            if(!response?.ok) return null;
            try { return await response.json(); } catch(_) { return null; }
        };
        const pData = await readJson(pRes);
        const cData = await readJson(cRes);
        // A newer refresh owns the state now; discard this response and avoid
        // rendering stale cards or changing the user's current project.
        if(generation !== loadAllGeneration) return;
        const refreshFailures = [];
        if(pData && Array.isArray(pData.projects)) {
            projects = pData.projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        } else {
            refreshFailures.push(L('项目列表暂不可用','Projects unavailable'));
        }
        if(!projects.length) projects = [{ id: 'default', name: L('默认项目','Default'), order: 0, canvas_count: 0 }];
        if(cData && Array.isArray(cData.canvases)) {
            canvases = cData.canvases;
        } else {
            refreshFailures.push(L('画布列表暂不可用','Canvases unavailable'));
        }
        // pick first project (prefer default / order 0)
        if(!projects.find(p => p.id === currentProjectId)){
            const def = projects.find(p => p.id === 'default') || projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
            currentProjectId = def ? def.id : 'default';
        }
        rememberProjectId(currentProjectId);
        renderProjects();
        renderBoard();
        // Do an immediate reset when dimensions are already available, then
        // retry a few times for the common iframe/flex-layout race.  A pan or
        // wheel gesture made while data loads marks the viewport as user-owned
        // and prevents either path from overriding it.
        if(!viewportUserAdjusted) initialViewportSettled = false;
        const resetSettled = resetView({ auto: true });
        if(!resetSettled) scheduleInitialReadableReset();
        refreshTrashCount();
        if(refreshFailures.length){
            setStatus(L(`已刷新，但${refreshFailures.join('、')}`, `Refreshed with limited data: ${refreshFailures.join(', ')}`));
        }
    } catch(e){
        if(generation !== loadAllGeneration || e?.name === 'AbortError') return;
        console.error(e);
        setStatus(L('加载失败','Load failed'));
    } finally {
        if(generation === loadAllGeneration) loadAllController = null;
    }
}

function projectCanvasCount(pid){
    const p = projects.find(x => x.id === pid);
    // prefer live count from canvases array; fall back to server count
    const live = canvasesInProject(pid).length;
    return canvases.length ? live : (p?.canvas_count || 0);
}

/* ===== Project sidebar rendering ===== */
function renderProjects(){
    projectListEl.innerHTML = '';
    projects.forEach(p => {
        if(pendingDeleteProjectId === p.id){
            const box = document.createElement('div');
            box.className = 'ws-project-confirm';
            box.innerHTML = `
                <div class="ws-project-confirm-title">${L('删除项目','Delete project')}「${escapeHtml(p.name)}」？${L('其画布将移回默认项目。','Canvases move back to Default.')}</div>
                <div class="ws-project-confirm-actions">
                    <button class="ws-confirm-btn" type="button">${L('删除','Delete')}</button>
                    <button class="ws-cancel-btn" type="button">${L('取消','Cancel')}</button>
                </div>`;
            box.querySelector('.ws-confirm-btn').onclick = () => deleteProject(p.id);
            box.querySelector('.ws-cancel-btn').onclick = () => { pendingDeleteProjectId = null; renderProjects(); };
            projectListEl.appendChild(box);
            return;
        }
        const row = document.createElement('div');
        row.className = 'ws-project-row' + (p.id === currentProjectId ? ' active' : '');
        row.dataset.projectId = p.id;
        const count = projectCanvasCount(p.id);
        const isDefault = p.id === 'default';
        // Project rows used to be mouse-only divs.  Give them button semantics
        // so keyboard users can switch projects without having to reach the
        // nested rename/delete controls.
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-pressed', p.id === currentProjectId ? 'true' : 'false');
        row.setAttribute('aria-label', `${p.name} · ${count} ${L('个画布','canvases')}`);
        row.innerHTML = `
            <span class="ws-project-icon"><i data-lucide="${isDefault ? 'folder' : 'folder-open'}" class="w-4 h-4"></i></span>
            <span class="ws-project-name">${escapeHtml(p.name)}</span>
            <span class="ws-project-count">${count}</span>
            <span class="ws-project-actions">
                <button class="ws-proj-act rename" type="button" title="${L('重命名','Rename')}" aria-label="${L('重命名','Rename')}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                ${isDefault ? '' : `<button class="ws-proj-act del" type="button" title="${L('删除','Delete')}" aria-label="${L('删除','Delete')}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`}
            </span>`;
        row.onclick = e => {
            if(e.target.closest('.ws-proj-act')) return;
            selectProject(p.id);
        };
        row.onkeydown = e => {
            // Nested action buttons and the inline rename field own their own
            // keyboard interactions; never switch the project underneath them.
            if(e.target.closest('.ws-proj-act, input, textarea, select')) return;
            if(e.key === 'Enter' || e.key === ' '){
                e.preventDefault();
                selectProject(p.id);
            }
        };
        const renameBtn = row.querySelector('.ws-proj-act.rename');
        if(renameBtn) renameBtn.onclick = e => { e.stopPropagation(); startProjectRename(p.id, row); };
        const delBtn = row.querySelector('.ws-proj-act.del');
        if(delBtn) delBtn.onclick = e => { e.stopPropagation(); pendingDeleteProjectId = p.id; renderProjects(); };
        projectListEl.appendChild(row);
    });
    refreshIcons();
}

function selectProject(pid){
    if(pid === currentProjectId && !trashPanel.classList.contains('active')) return;
    currentProjectId = pid;
    rememberProjectId(pid);
    viewportUserAdjusted = false;
    initialViewportSettled = false;
    cancelInitialReadableReset();
    selectedCanvasIds.clear();
    closeTrashView();
    renderProjects();
    renderBoard();
    const resetSettled = resetView({ auto: true });
    if(!resetSettled) scheduleInitialReadableReset();
}

function startProjectRename(pid, row){
    const p = projects.find(x => x.id === pid);
    if(!p) return;
    const nameEl = row.querySelector('.ws-project-name');
    if(!nameEl || nameEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 60; input.value = p.name;
    input.className = 'ws-project-name-input';
    nameEl.replaceWith(input);
    input.focus(); input.select();
    input.onclick = e => e.stopPropagation();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== p.name) renameProject(pid, v);
        else renderProjects();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

/* ===== Project CRUD ===== */
function openNewProject(){
    newProjectRow.classList.add('active');
    newProjectInput.value = '';
    newProjectInput.focus();
}
function closeNewProject(){
    newProjectRow.classList.remove('active');
    newProjectInput.value = '';
}
async function createProject(){
    const name = newProjectInput.value.trim() || L('新项目','New project');
    closeNewProject();
    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('create project failed');
        const data = await res.json();
        const proj = data.project;
        if(proj){
            projects.push(proj);
            projects.sort((a, b) => (a.order || 0) - (b.order || 0));
            selectProject(proj.id);
            renderProjects();
        }
    } catch(e){
        console.error(e); setStatus(L('创建项目失败','Create project failed'));
    }
}
async function renameProject(pid, name){
    const p = projects.find(x => x.id === pid);
    if(p) p.name = name;
    renderProjects();
    if(pid === currentProjectId) updateBoardHeader();
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('rename project failed');
    } catch(e){ console.error(e); setStatus(L('重命名失败','Rename failed')); loadAll(); }
}
async function deleteProject(pid){
    pendingDeleteProjectId = null;
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete project failed');
        // canvases of deleted project move back to default
        canvases.forEach(c => { if((c.project || 'default') === pid) c.project = 'default'; });
        projects = projects.filter(p => p.id !== pid);
        if(currentProjectId === pid) currentProjectId = 'default';
        rememberProjectId(currentProjectId);
        renderProjects();
        renderBoard();
    } catch(e){ console.error(e); setStatus(L('删除项目失败','Delete project failed')); loadAll(); }
}

/* ===== Board rendering ===== */
function updateBoardHeader(){
    const p = currentProject();
    boardProjectName.textContent = p ? p.name : L('默认项目','Default');
    boardCanvasCount.textContent = String(canvasesInProject(currentProjectId).length);
}

function autoLayoutNulls(items){
    // Repair both missing coordinates and the duplicate defaults emitted by
    // older versions.  The resolver preserves every non-overlapping position;
    // only records that would render on top of an earlier card are moved.
    const resolver = window.CanvasListLayout?.resolve;
    if(typeof resolver !== 'function') return;
    const result = resolver(items);
    result.positions.forEach((position, index) => {
        const canvas = items[index];
        if(!canvas || !position) return;
        canvas.board_x = position.x;
        canvas.board_y = position.y;
    });
    result.moved.forEach(position => {
        queueLayoutMeta(position.id, { board_x: position.x, board_y: position.y });
    });
}

function renderBoard(){
    updateBoardHeader();
    const items = canvasesInProject(currentProjectId);
    autoLayoutNulls(items);
    // A project switch/reload replaces the card DOM; never leave the prior
    // project's focus styling latched on the new board.
    clearReadableFocusMode();
    boardWorld.innerHTML = '';
    items.forEach(c => boardWorld.appendChild(buildCard(c)));
    boardEmptyHint.classList.toggle('hidden', items.length > 0);
    updatePasteBtn();
    updateBulkToolbar();
    refreshIcons();
}

function buildCard(c){
    const isSmart = (c.kind || 'classic') === 'smart';
    const card = document.createElement('div');
    card.className = 'ws-card'
        + (String(c.color || '').trim() ? ' cc-marked' : '')
        + (clipboardCanvasId === c.id ? ' cut' : '')
        + (selectedCanvasIds.has(String(c.id)) ? ' selected' : '');
    card.dataset.canvasId = c.id;
    card.setAttribute('role', 'article');
    card.setAttribute('aria-selected', selectedCanvasIds.has(String(c.id)) ? 'true' : 'false');
    // The board card is draggable and historically only opened from a mouse
    // release.  Expose the card itself to the keyboard without changing the
    // nested checkbox/menu tab stops used for bulk actions.
    card.tabIndex = 0;
    card.setAttribute('aria-label', L(`打开画布「${c.title || ''}」`, `Open canvas "${c.title || ''}"`));
    card.setAttribute('aria-keyshortcuts', 'Enter Space');
    card.style.left = (c.board_x || 0) + 'px';
    card.style.top = (c.board_y || 0) + 'px';
    // 卡片布局：顶部=类型标签+更多按钮；中部=标题；底部=节点数·时间。已移除图标。
    card.innerHTML = `
        <div class="ws-card-top">
            <div class="ws-card-select" title="${L('选择画布','Select canvas')}">
                <input class="ws-card-select-input" type="checkbox"${selectedCanvasIds.has(String(c.id)) ? ' checked' : ''} aria-label="${L(`选择画布 ${escapeAttr(c.title)}`, `Select canvas ${escapeAttr(c.title)}`)}">
                <span class="ws-card-select-indicator" aria-hidden="true"><i data-lucide="check" class="w-3 h-3"></i></span>
            </div>
            <span class="ws-card-kind ${isSmart ? 'smart' : 'classic'}">${isSmart ? compactLabel('智能画布','智能','Smart') : compactLabel('普通画布','普通','Classic')}</span>
            <button class="ws-card-menu" type="button" title="${L('更多','More')}" aria-label="${L('更多','More')}"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
        </div>
        <div class="ws-card-title">${escapeHtml(c.title)}</div>
        <div class="ws-card-meta">
            <span class="ws-card-nodes">${(c.node_count != null ? c.node_count : 0)} ${L('节点','nodes')}</span>
            <span class="ws-card-meta-dot"></span>
            <span class="ws-card-time">${formatCanvasTime(c.updated_at || c.created_at)}</span>
        </div>
        <div class="ws-card-delete-confirm">
            <div class="ws-card-delete-title">${L('移入回收站？','Move to trash?')}</div>
            <div class="ws-card-delete-actions">
                <button class="ws-card-delete-yes" type="button">${L('删除','Delete')}</button>
                <button class="ws-card-delete-no" type="button">${L('取消','Cancel')}</button>
            </div>
        </div>`;
    card.addEventListener('keydown', e => {
        if(e.target !== card || card.classList.contains('confirming-delete')) return;
        const openKey = e.key === 'Enter' || e.key === ' ' || e.code === 'Space';
        if(!openKey) return;
        e.preventDefault();
        e.stopPropagation();
        openCanvas(c);
    });
    attachCardDrag(card, c);
    const selectInput = card.querySelector('.ws-card-select-input');
    const stopSelectionEvent = e => e.stopPropagation();
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(type => {
        selectInput.addEventListener(type, stopSelectionEvent, true);
    });
    selectInput.onchange = e => setCanvasSelection(c.id, e.currentTarget.checked);
    const selectLabel = card.querySelector('.ws-card-select');
    ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(type => {
        selectLabel.addEventListener(type, stopSelectionEvent, true);
    });
    const menuBtn = card.querySelector('.ws-card-menu');
    menuBtn.onmousedown = e => e.stopPropagation();
    menuBtn.onclick = e => { e.stopPropagation(); openCardMenu(c.id, menuBtn); };
    card.querySelector('.ws-card-delete-confirm').onmousedown = e => e.stopPropagation();
    card.querySelector('.ws-card-delete-yes').onclick = e => { e.stopPropagation(); deleteCanvas(c.id); };
    card.querySelector('.ws-card-delete-no').onclick = e => { e.stopPropagation(); card.classList.remove('confirming-delete'); };
    return card;
}

/* ===== Card drag vs click ===== */
function attachCardDrag(card, c){
    card.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        if(e.target.closest('.ws-card-menu') || e.target.closest('.ws-card-select')) return;
        if(e.target.closest('.ws-card-delete-confirm')) return;
        if(card.querySelector('.ws-card-title-input')) return; // editing title
        // Dragging a focused card is an explicit board gesture too.  Reveal
        // the surrounding cards before the pointer starts moving so the user
        // can place it relative to the complete board.
        clearReadableFocusMode();
        e.stopPropagation();
        closeCardMenu();
        const startWorld = screenToWorld(e.clientX, e.clientY);
        const origX = c.board_x || 0, origY = c.board_y || 0;
        let moved = false;
        const onMove = ev => {
            const w = screenToWorld(ev.clientX, ev.clientY);
            const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
            if(!moved && (Math.abs(dx * viewport.scale) > 5 || Math.abs(dy * viewport.scale) > 5)){
                moved = true; card.classList.add('dragging');
            }
            if(moved){
                c.board_x = origX + dx; c.board_y = origY + dy;
                card.style.left = c.board_x + 'px';
                card.style.top = c.board_y + 'px';
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            card.classList.remove('dragging');
            if(moved){
                persistMeta(c.id, { board_x: Math.round(c.board_x), board_y: Math.round(c.board_y) });
            } else {
                openCanvas(c);
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

const CANVAS_PAGE_V = '2026.08.28.ui1';
const STARTER_KIT_CHIPS = [
    {id:'character', zh:'角色', en:'Character'},
    {id:'scene', zh:'场景', en:'Scene'},
    {id:'stage3d', zh:'3D导演台', en:'3D Director'},
    {id:'prompt', zh:'文本', en:'Text'},
    {id:'image', zh:'图片', en:'Image'},
    {id:'video', zh:'视频', en:'Video'},
    {id:'audio', zh:'音频', en:'Audio'}
];

function openCanvas(c, seedKinds){
    const enc = encodeURIComponent(c.id);
    const project = encodeURIComponent(c.project || currentProjectId || 'default');
    rememberProjectId(c.project || currentProjectId || 'default');
    const seed = (c.kind !== 'smart' && seedKinds && seedKinds.length)
        ? `&seed=${encodeURIComponent(seedKinds.join(','))}`
        : '';
    window.location.href = (c.kind === 'smart')
        ? `/static/smart-canvas.html?id=${enc}&project=${project}&v=${CANVAS_PAGE_V}`
        : `/static/canvas.html?id=${enc}&project=${project}${seed}&v=${CANVAS_PAGE_V}`;
}

/* ===== Card create flow ===== */
let createCardEl = null;
let createKind = 'classic';
function closeCreateCard(){ createCardEl?.remove(); createCardEl = null; }
function selectedCreateKitKinds(el){
    if(!el || createKind !== 'classic') return [];
    return [...el.querySelectorAll('.ws-create-chip.active')].map(btn => btn.dataset.kind).filter(Boolean);
}
function openCreateCard(worldPt){
    closeCreateCard();
    closeCardMenu();
    createKind = 'classic';
    const el = document.createElement('div');
    el.className = 'ws-create-card';
    el.style.left = worldPt.x + 'px';
    el.style.top = worldPt.y + 'px';
    const chips = STARTER_KIT_CHIPS.map(chip =>
        `<button class="ws-create-chip" type="button" data-kind="${chip.id}">${L(chip.zh, chip.en)}</button>`
    ).join('');
    el.innerHTML = `
        <div class="ws-create-title">${L('新建画布','New canvas')}</div>
        <input class="ws-create-input" type="text" maxlength="80" placeholder="${L('画布名称（可留空）','Canvas name (optional)')}">
        <div class="ws-create-toggle">
            <button class="ws-create-toggle-btn active" type="button" data-kind="classic">${L('普通画布','Classic')}</button>
            <button class="ws-create-toggle-btn" type="button" data-kind="drama">${L('短剧片场','Drama')}</button>
            <button class="ws-create-toggle-btn" type="button" data-kind="smart">${L('智能画布','Smart')}</button>
        </div>
        <div class="ws-create-kit-wrap">
            <div class="ws-create-kit-label">${L('片场节点（可多选，不选则空画布）','Stage nodes (multi-select, none = empty)')}</div>
            <div class="ws-create-kit">${chips}</div>
        </div>
        <div class="ws-create-actions">
            <button class="ws-create-confirm" type="button">${L('创建','Create')}</button>
            <button class="ws-create-cancel" type="button">${L('取消','Cancel')}</button>
        </div>`;
    boardWorld.appendChild(el);
    createCardEl = el;
    el.addEventListener('mousedown', e => e.stopPropagation());
    const input = el.querySelector('.ws-create-input');
    input.focus();
    el.querySelectorAll('.ws-create-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            createKind = btn.dataset.kind === 'drama' ? 'classic' : btn.dataset.kind;
            el.querySelectorAll('.ws-create-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
            el.classList.toggle('is-smart', createKind === 'smart');
            if(btn.dataset.kind === 'drama'){
                el.querySelectorAll('.ws-create-chip').forEach(chip => {
                    chip.classList.toggle('active', ['character','scene','stage3d','prompt','video'].includes(chip.dataset.kind));
                });
            }
        };
    });
    el.querySelectorAll('.ws-create-chip').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.toggle('active');
        };
    });
    const confirm = () => createCanvasOnBoard(input.value.trim(), createKind, worldPt, selectedCreateKitKinds(el));
    el.querySelector('.ws-create-confirm').onclick = confirm;
    el.querySelector('.ws-create-cancel').onclick = closeCreateCard;
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); confirm(); }
        if(e.key === 'Escape'){ e.preventDefault(); closeCreateCard(); }
    };
}

async function createCanvasOnBoard(title, kind, worldPt, seedKinds){
    const isSmart = kind === 'smart';
    const base = isSmart ? L('智能画布','Smart canvas') : L('画布','Canvas');
    const name = title || `${base} ${new Date().toLocaleTimeString(langIsEn() ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    const kit = isSmart ? [] : (Array.isArray(seedKinds) ? seedKinds.filter(Boolean) : []);
    closeCreateCard();
    try {
        const res = await fetch('/api/canvases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: name,
                icon: isSmart ? 'sparkles' : '🧩',
                kind: isSmart ? 'smart' : 'classic',
                project: currentProjectId,
                board_x: Math.round(worldPt.x),
                board_y: Math.round(worldPt.y)
            })
        });
        if(!res.ok) throw new Error('create canvas failed');
        const data = await res.json();
        const nc = data.canvas;
        if(nc){
            if(nc.project == null) nc.project = currentProjectId;
            if(nc.board_x == null) nc.board_x = Math.round(worldPt.x);
            if(nc.board_y == null) nc.board_y = Math.round(worldPt.y);
            canvases.push(nc);
            renderBoard();
            renderProjects();
            openCanvas(nc, kit);
        }
    } catch(e){ console.error(e); setStatus(L('创建失败','Create failed')); }
}

/* ===== Card context menu (rename / delete / move) ===== */
function closeCardMenu(){ document.querySelector('.ws-card-pop')?.remove(); }
function openCardMenu(canvasId, anchorBtn){
    closeCardMenu();
    const c = canvases.find(x => x.id === canvasId);
    if(!c) return;
    const pop = document.createElement('div');
    pop.className = 'ws-card-pop';
    pop.innerHTML = `
        <button class="ws-pop-item" data-act="rename"><i data-lucide="pencil" class="w-4 h-4"></i><span>${L('重命名','Rename')}</span></button>
        <button class="ws-pop-item" data-act="export"><i data-lucide="download" class="w-4 h-4"></i><span>${L('导出画布','Export canvas')}</span></button>
        <button class="ws-pop-item" data-act="export-assets"><i data-lucide="archive" class="w-4 h-4"></i><span>${L('导出画布 + 资源','Export with assets')}</span></button>
        <button class="ws-pop-item" data-act="cut"><i data-lucide="scissors" class="w-4 h-4"></i><span>${L('剪切到其他项目','Cut to project')}</span></button>
        <div class="ws-pop-sep"></div>
        <button class="ws-pop-item danger" data-act="delete"><i data-lucide="trash-2" class="w-4 h-4"></i><span>${L('删除','Delete')}</span></button>`;
    document.body.appendChild(pop);
    const r = anchorBtn.getBoundingClientRect();
    const w = pop.offsetWidth || 188, h = pop.offsetHeight || 120;
    let left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if(top + h > window.innerHeight - 12) top = r.top - h - 6;
    pop.style.left = Math.round(Math.max(12, left)) + 'px';
    pop.style.top = Math.round(Math.max(12, top)) + 'px';
    pop.querySelector('[data-act="rename"]').onclick = () => { closeCardMenu(); startCardRename(canvasId); };
    pop.querySelector('[data-act="export"]').onclick = () => { closeCardMenu(); exportCanvas(canvasId); };
    pop.querySelector('[data-act="export-assets"]').onclick = () => { closeCardMenu(); exportCanvasWithResources(canvasId); };
    pop.querySelector('[data-act="cut"]').onclick = () => { closeCardMenu(); cutCanvas(canvasId); };
    pop.querySelector('[data-act="delete"]').onclick = () => { closeCardMenu(); showCardDeleteConfirm(canvasId); };
    refreshIcons();
}

function showCardDeleteConfirm(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    if(!card) return;
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => {
        if(el !== card) el.classList.remove('confirming-delete');
    });
    card.classList.add('confirming-delete');
}

/* ===== Export canvas (download the full canvas JSON) ===== */
async function exportCanvas(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在导出...','Exporting...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = String((c?.title) || cv.title || 'canvas').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'canvas';
        const blob = new Blob([JSON.stringify(cv, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = base + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus(L('已导出','Exported'));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Export canvas with referenced resources ===== */
const ZIP_ENCODER = new TextEncoder();
let ZIP_CRC_TABLE = null;

function safeExportBase(name, fallback = 'canvas'){
    return String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || fallback;
}

function collectCanvasResourceUrls(value, out = [], seen = new Set()){
    if(value == null) return out;
    if(typeof value === 'string'){
        const text = value.trim();
        if(isCanvasResourceUrl(text) && !seen.has(text)){
            seen.add(text);
            out.push(text);
        }
        return out;
    }
    if(Array.isArray(value)){
        value.forEach(item => collectCanvasResourceUrls(item, out, seen));
        return out;
    }
    if(typeof value === 'object'){
        Object.values(value).forEach(item => collectCanvasResourceUrls(item, out, seen));
    }
    return out;
}

function isCanvasResourceUrl(url){
    return url.startsWith('/assets/') || url.startsWith('/output/') || /^https?:\/\//i.test(url);
}

function exportResourceName(url, index, used){
    let name = '';
    try {
        const parsed = new URL(url, location.origin);
        name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    } catch(e) {
        name = String(url || '').split(/[?#]/)[0].split('/').pop() || '';
    }
    name = safeExportBase(name || `resource-${String(index + 1).padStart(3, '0')}`, `resource-${index + 1}`);
    if(!/\.[a-z0-9]{1,8}$/i.test(name)) name += '.bin';
    let finalName = `resources/${name}`;
    const dot = finalName.lastIndexOf('.');
    const stem = dot > 0 ? finalName.slice(0, dot) : finalName;
    const ext = dot > 0 ? finalName.slice(dot) : '';
    let suffix = 2;
    while(used.has(finalName)){
        finalName = `${stem}-${suffix}${ext}`;
        suffix++;
    }
    used.add(finalName);
    return finalName;
}

async function fetchResourceBytes(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

function zipCrc32(bytes){
    if(!ZIP_CRC_TABLE){
        ZIP_CRC_TABLE = new Uint32Array(256);
        for(let i = 0; i < 256; i++){
            let c = i;
            for(let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            ZIP_CRC_TABLE[i] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for(let i = 0; i < bytes.length; i++) crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zipDosTime(date = new Date()){
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const year = Math.max(1980, date.getFullYear());
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function zipHeader(signature, size){
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return { bytes, view };
}

function createZipBlob(entries){
    const now = zipDosTime();
    const files = [];
    const central = [];
    let offset = 0;
    entries.forEach(entry => {
        const nameBytes = ZIP_ENCODER.encode(entry.name);
        const data = entry.bytes instanceof Uint8Array ? entry.bytes : ZIP_ENCODER.encode(String(entry.bytes || ''));
        const crc = zipCrc32(data);
        const local = zipHeader(0x04034b50, 30 + nameBytes.length);
        local.view.setUint16(4, 20, true);
        local.view.setUint16(6, 0x0800, true);
        local.view.setUint16(8, 0, true);
        local.view.setUint16(10, now.time, true);
        local.view.setUint16(12, now.day, true);
        local.view.setUint32(14, crc, true);
        local.view.setUint32(18, data.length, true);
        local.view.setUint32(22, data.length, true);
        local.view.setUint16(26, nameBytes.length, true);
        local.bytes.set(nameBytes, 30);
        files.push(local.bytes, data);

        const cd = zipHeader(0x02014b50, 46 + nameBytes.length);
        cd.view.setUint16(4, 20, true);
        cd.view.setUint16(6, 20, true);
        cd.view.setUint16(8, 0x0800, true);
        cd.view.setUint16(10, 0, true);
        cd.view.setUint16(12, now.time, true);
        cd.view.setUint16(14, now.day, true);
        cd.view.setUint32(16, crc, true);
        cd.view.setUint32(20, data.length, true);
        cd.view.setUint32(24, data.length, true);
        cd.view.setUint16(28, nameBytes.length, true);
        cd.view.setUint32(42, offset, true);
        cd.bytes.set(nameBytes, 46);
        central.push(cd.bytes);
        offset += local.bytes.length + data.length;
    });
    const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = zipHeader(0x06054b50, 22);
    end.view.setUint16(8, entries.length, true);
    end.view.setUint16(10, entries.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...files, ...central, end.bytes], { type:'application/zip' });
}

async function exportCanvasWithResources(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在收集资源...','Collecting assets...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = safeExportBase((c?.title) || cv.title || 'canvas');
        const urls = collectCanvasResourceUrls(cv).slice(0, 1000);
        const usedNames = new Set(['canvas.json', 'resources-manifest.json']);
        const entries = [{ name:'canvas.json', bytes:ZIP_ENCODER.encode(JSON.stringify(cv, null, 2)) }];
        const manifest = [];
        let skipped = 0;
        for(let i = 0; i < urls.length; i++){
            const url = urls[i];
            try {
                const bytes = await fetchResourceBytes(url);
                const name = exportResourceName(url, i, usedNames);
                entries.push({ name, bytes });
                manifest.push({ url, file:name, size:bytes.length });
            } catch(e) {
                skipped++;
                manifest.push({ url, skipped:true, reason:String(e?.message || e || 'fetch failed').slice(0, 120) });
            }
        }
        entries.push({ name:'resources-manifest.json', bytes:ZIP_ENCODER.encode(JSON.stringify({ canvas_id:id, resources:manifest }, null, 2)) });
        const blob = createZipBlob(entries);
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = `${base}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
        const included = Math.max(0, entries.length - 2);
        setStatus(skipped
            ? L(`已导出，跳过 ${skipped} 个资源`, `Exported, skipped ${skipped} assets`)
            : L(`已导出 ${included} 个资源`, `Exported ${included} assets`));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Cut / paste a canvas across projects ===== */
function cutCanvas(id){
    clipboardCanvasId = id;
    setStatus(L('已剪切，切换到目标项目后点“粘贴到此项目”','Cut — open another project, then Paste'));
    renderBoard();
}
function updatePasteBtn(){
    if(!pasteCanvasBtn) return;
    const show = !!clipboardCanvasId && canvases.some(x => x.id === clipboardCanvasId);
    pasteCanvasBtn.style.display = show ? 'inline-flex' : 'none';
}
async function pasteCanvas(){
    if(!clipboardCanvasId) return;
    const c = canvases.find(x => x.id === clipboardCanvasId);
    const targetPid = currentProjectId;
    if(!c){ updatePasteBtn(); renderBoard(); return; }
    if((c.project || 'default') === targetPid){
        clipboardCanvasId = null;
        renderBoard();
        setStatus(L('已在当前项目','Already in this project'));
        return;
    }
    // Keep the cut marker until the server confirms the move.  If the
    // request fails, moveCanvasToProject restores the original project and
    // the user can retry instead of losing the clipboard item.
    await moveCanvasToProject(c.id, targetPid, {fromProject:c.project || 'default'});
}

function startCardRename(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    const c = canvases.find(x => x.id === canvasId);
    if(!card || !c) return;
    const titleEl = card.querySelector('.ws-card-title');
    if(!titleEl || titleEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 80; input.value = c.title || '';
    input.className = 'ws-card-title-input';
    titleEl.innerHTML = ''; titleEl.appendChild(input);
    input.onmousedown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.focus(); input.select();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== c.title) setCanvasTitle(canvasId, v);
        else renderBoard();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

async function setCanvasTitle(id, title){
    const c = canvases.find(x => x.id === id);
    if(c) c.title = title;
    renderBoard();
    await persistMeta(id, { title });
}

async function moveCanvasToProject(id, projectId, opts={}){
    const c = canvases.find(x => x.id === id);
    if(!c) return false;
    const previousProject = opts.fromProject || c.project || 'default';
    c.project = projectId;
    renderBoard();
    renderProjects();
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: projectId })
        });
        if(!res.ok) throw new Error('move canvas failed');
        const data = await res.json();
        if(data.canvas){
            const idx = canvases.findIndex(item => item.id === id);
            if(idx >= 0) canvases[idx] = { ...canvases[idx], ...data.canvas };
        }
        clipboardCanvasId = null;
        renderBoard();
        renderProjects();
        setStatus(L('已移动','Moved'));
        return true;
    } catch(e){
        // Roll back the optimistic board update and retain the cut selection
        // so a transient network failure is recoverable.
        c.project = previousProject;
        renderBoard();
        renderProjects();
        setStatus(L('移动失败，已保留剪切项','Move failed; cut item kept'));
        console.error(e);
        return false;
    }
}

/* ===== Card meta persist (POST /meta) ===== */
async function persistMeta(id, patch, options = {}){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if(!res.ok) throw new Error('meta save failed');
        const data = await res.json();
        if(data.canvas){
            const idx = canvases.findIndex(x => x.id === id);
            if(idx >= 0) canvases[idx] = { ...canvases[idx], ...data.canvas };
        }
        return true;
    } catch(e){
        console.error(e);
        if(!options.quiet) setStatus(L('保存失败','Save failed'));
        return false;
    }
}

/* ===== Delete canvas (soft -> trash, with confirm) ===== */
async function deleteCanvas(id){
    const c = canvases.find(x => x.id === id);
    if(!c) return;
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete failed');
        const key = String(id);
        canvases = canvases.filter(x => String(x.id) !== key);
        selectedCanvasIds.delete(key);
        renderBoard();
        renderProjects();
        refreshTrashCount();
        setStatus(L('已移入回收站','Moved to trash'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}

/* ===== Bulk canvas actions ===== */
function bulkActionLabel(action){
    if(action === 'trash') return L('移入回收站','Move to trash');
    if(action === 'restore') return L('恢复','Restore');
    return L('彻底删除','Delete permanently');
}

function bulkActionDescription(action, count){
    const n = Number(count) || 0;
    if(action === 'trash') return L(`确定将选中的 ${n} 个画布移入回收站吗？画布内容之后仍可恢复。`, `Move ${n} selected canvas${n === 1 ? '' : 'es'} to the trash? They can be restored later.`);
    if(action === 'restore') return L(`确定恢复选中的 ${n} 个画布吗？`, `Restore ${n} selected canvas${n === 1 ? '' : 'es'}?`);
    return L(`确定彻底删除选中的 ${n} 个画布吗？此操作不可恢复。`, `Permanently delete ${n} selected canvas${n === 1 ? '' : 'es'}? This cannot be undone.`);
}

function openBulkConfirm(action, ids, source){
    const cleanIds = normalizeIds(ids);
    if(!cleanIds.length || bulkActionBusy || !bulkConfirmDialog) return;
    bulkDialogState = { action, ids: cleanIds, source };
    bulkDialogPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bulkConfirmTitle.textContent = action === 'trash'
        ? L('移入回收站', 'Move to trash')
        : L('彻底删除', 'Delete permanently');
    bulkConfirmMessage.textContent = bulkActionDescription(action, cleanIds.length);
    bulkConfirmSubmit.textContent = action === 'trash' ? L('移入回收站','Move to trash') : L('彻底删除','Delete permanently');
    bulkConfirmSubmit.classList.toggle('danger', action !== 'restore');
    bulkConfirmSubmit.classList.toggle('success', action === 'restore');
    bulkConfirmDialog.hidden = false;
    bulkConfirmDialog.classList.add('active');
    refreshIcons();
    window.requestAnimationFrame(() => bulkConfirmCancel?.focus());
}

function closeBulkConfirm(restoreFocus = true){
    if(!bulkConfirmDialog) return;
    bulkConfirmDialog.classList.remove('active');
    bulkConfirmDialog.hidden = true;
    bulkDialogState = null;
    if(restoreFocus && bulkDialogPreviousFocus?.isConnected){
        try { bulkDialogPreviousFocus.focus(); } catch(e) {}
    }
    bulkDialogPreviousFocus = null;
}

function canvasBulkRequestUrl(action, id){
    const safeId = encodeURIComponent(String(id));
    if(action === 'trash') return { url:`/api/canvases/${safeId}`, method:'DELETE' };
    if(action === 'restore') return { url:`/api/canvases/${safeId}/restore`, method:'POST' };
    return { url:`/api/canvases/${safeId}/purge`, method:'DELETE' };
}

async function requestCanvasBulkAction(ids, action){
    const cleanIds = normalizeIds(ids);
    if(!cleanIds.length) return { successIds:[], failedIds:[] };
    let response;
    try {
        response = await fetch('/api/canvases/batch-delete', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ ids:cleanIds, action })
        });
    } catch(error){
        throw error;
    }

    // Older servers do not expose the batch route yet. Keep the UI useful by
    // falling back to the existing idempotent single-item endpoints.
    if(response.status === 404 || response.status === 405){
        const settled = await Promise.allSettled(cleanIds.map(async id => {
            const req = canvasBulkRequestUrl(action, id);
            const res = await fetch(req.url, { method:req.method });
            if(!res.ok) throw new Error(`${action} ${id} failed (${res.status})`);
            return id;
        }));
        return {
            successIds:settled.filter(x => x.status === 'fulfilled').map(x => x.value),
            failedIds:settled.map((item, index) => item.status === 'rejected' ? cleanIds[index] : null).filter(Boolean)
        };
    }
    if(!response.ok){
        let detail = '';
        try {
            const payload = await response.json();
            detail = payload?.detail?.message || payload?.detail || payload?.message || '';
        } catch(e) {}
        throw new Error(detail || `${action} batch failed (${response.status})`);
    }
    let payload = {};
    try { payload = await response.json(); } catch(e) {}
    const skipped = new Set((Array.isArray(payload.skipped) ? payload.skipped : [])
        .map(item => String(item?.id ?? item ?? ''))
        .filter(Boolean));
    const explicit = normalizeIds(payload.removed || payload.deleted || payload.restored || payload.purged);
    const successIds = explicit.length
        ? explicit.filter(id => cleanIds.includes(id) && !skipped.has(id))
        : cleanIds.filter(id => !skipped.has(id));
    return { successIds, failedIds:cleanIds.filter(id => !successIds.includes(id)) };
}

async function performBulkCanvasAction(action, ids, source){
    if(bulkActionBusy) return;
    const cleanIds = normalizeIds(ids);
    if(!cleanIds.length) return;
    bulkActionBusy = true;
    updateBulkToolbar();
    setStatus(L(`正在${bulkActionLabel(action)}…`, `${bulkActionLabel(action)}…`));
    try {
        const result = await requestCanvasBulkAction(cleanIds, action);
        const failed = result.failedIds.length;
        if(source === 'board'){
            result.successIds.forEach(id => selectedCanvasIds.delete(String(id)));
        } else {
            result.successIds.forEach(id => selectedTrashIds.delete(String(id)));
        }
        // Reload the authoritative lists so project counts, trash badge, and
        // cards stay consistent even when the backend reports partial skips.
        await loadAll();
        if(trashPanel.classList.contains('active')) await loadTrash();
        if(failed){
            setStatus(L(`${result.successIds.length} 个已处理，${failed} 个失败`, `${result.successIds.length} processed, ${failed} failed`));
        } else {
            const doneLabel = action === 'trash' ? L('已批量移入回收站','Moved selected canvases to trash')
                : action === 'restore' ? L('已批量恢复','Restored selected canvases')
                : L('已彻底删除','Deleted selected canvases permanently');
            setStatus(doneLabel);
        }
    } catch(error){
        console.error(error);
        setStatus(L('批量操作失败','Bulk action failed'));
    } finally {
        bulkActionBusy = false;
        updateBulkToolbar();
    }
}

function submitBulkDialog(){
    const state = bulkDialogState;
    if(!state || bulkActionBusy) return;
    closeBulkConfirm(false);
    performBulkCanvasAction(state.action, state.ids, state.source);
}

/* ===== Trash / recycle bin ===== */
async function refreshTrashCount(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) return;
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        pruneSelection(selectedTrashIds, deletedCanvases.map(c => String(c.id)));
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
        updateBulkToolbar();
    } catch(e){}
}
async function openTrashView(){
    trashEntryBtn.classList.add('active');
    trashPanel.classList.add('active');
    closeCardMenu(); closeCreateCard();
    await loadTrash();
}
function closeTrashView(){
    trashEntryBtn.classList.remove('active');
    trashPanel.classList.remove('active');
}
async function loadTrash(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) throw new Error('trash load failed');
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
    } catch(e){ console.error(e); setStatus(L('加载回收站失败','Load trash failed')); }
}
function renderTrash(){
    trashListEl.innerHTML = '';
    pruneSelection(selectedTrashIds, deletedCanvases.map(c => String(c.id)));
    if(!deletedCanvases.length){
        const empty = document.createElement('div');
        empty.className = 'ws-trash-empty';
        empty.textContent = L('回收站为空','Trash is empty');
        trashListEl.appendChild(empty);
        updateBulkToolbar();
        return;
    }
    deletedCanvases.forEach(c => {
        const isSmart = (c.kind || 'classic') === 'smart';
        const projName = (projects.find(p => p.id === (c.project || 'default')) || {}).name || L('默认项目','Default');
        const card = document.createElement('div');
        const selected = selectedTrashIds.has(String(c.id));
        card.className = 'ws-trash-card' + (selected ? ' selected' : '');
        card.dataset.canvasId = c.id;
        card.setAttribute('role', 'article');
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
        card.innerHTML = `
            <div class="ws-card-top">
                <div class="ws-card-select" title="${L('选择画布','Select canvas')}" >
                    <input class="ws-card-select-input" type="checkbox"${selected ? ' checked' : ''} aria-label="${L(`选择画布 ${escapeAttr(c.title)}`, `Select canvas ${escapeAttr(c.title)}`)}">
                    <span class="ws-card-select-indicator" aria-hidden="true"><i data-lucide="check" class="w-3 h-3"></i></span>
                </div>
                <span class="ws-card-icon">${renderCanvasIcon(isSmart && /[^\x00-\x7F]/.test(c.icon || '') ? 'sparkles' : c.icon, 17)}</span>
                <span class="ws-card-kind ${isSmart ? 'smart' : 'classic'}">${isSmart ? L('智能','Smart') : L('普通','Classic')}</span>
            </div>
            <div class="ws-card-title">${escapeHtml(c.title)}</div>
            <div class="ws-card-meta"><span class="ws-card-nodes">${escapeHtml(projName)}</span><span class="ws-card-meta-dot"></span><span class="ws-card-time">${formatCanvasTime(c.deleted_at)}</span></div>
            <div class="ws-card-actions">
                <button class="ws-trash-act restore" type="button"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i><span>${L('恢复','Restore')}</span></button>
                <button class="ws-trash-act purge" type="button"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>${L('彻底删除','Delete')}</span></button>
            </div>
            <div class="ws-trash-confirm">
                <div class="ws-trash-confirm-title">${L('彻底删除？不可恢复','Delete permanently?')}</div>
                <div class="ws-trash-confirm-actions">
                    <button class="ws-trash-confirm-yes" type="button">${L('删除','Delete')}</button>
                    <button class="ws-trash-confirm-no" type="button">${L('取消','Cancel')}</button>
                </div>
            </div>`;
        const selectInput = card.querySelector('.ws-card-select-input');
        const stopSelectionEvent = e => e.stopPropagation();
        ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(type => {
            selectInput.addEventListener(type, stopSelectionEvent, true);
        });
        selectInput.onchange = e => setTrashSelection(c.id, e.currentTarget.checked);
        const selectLabel = card.querySelector('.ws-card-select');
        ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'].forEach(type => {
            selectLabel.addEventListener(type, stopSelectionEvent, true);
        });
        card.querySelector('.ws-trash-act.restore').onclick = () => restoreCanvas(c.id);
        card.querySelector('.ws-trash-act.purge').onclick = () => card.classList.add('confirming');
        card.querySelector('.ws-trash-confirm-yes').onclick = () => purgeCanvas(c.id);
        card.querySelector('.ws-trash-confirm-no').onclick = () => card.classList.remove('confirming');
        trashListEl.appendChild(card);
    });
    updateBulkToolbar();
    refreshIcons();
}
async function restoreCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/restore`, { method: 'POST' });
        if(!res.ok) throw new Error('restore failed');
        const key = String(id);
        deletedCanvases = deletedCanvases.filter(c => String(c.id) !== key);
        selectedTrashIds.delete(key);
        await loadAll();           // restored canvas returns to its stored project
        renderTrash();
        setStatus(L('已恢复','Restored'));
    } catch(e){ console.error(e); setStatus(L('恢复失败','Restore failed')); }
}
async function purgeCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/purge`, { method: 'DELETE' });
        if(!res.ok) throw new Error('purge failed');
        const key = String(id);
        deletedCanvases = deletedCanvases.filter(c => String(c.id) !== key);
        selectedTrashIds.delete(key);
        renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
        setStatus(L('已彻底删除','Deleted'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}

/* ===== Event bindings ===== */
board.addEventListener('mousedown', onBoardPanStart);
document.addEventListener('mousemove', onBoardPanMove);
document.addEventListener('mouseup', onBoardPanEnd);
board.addEventListener('wheel', onBoardWheel, { passive: false });
board.addEventListener('dblclick', e => {
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card')) return;
    clearReadableFocusMode();
    openCreateCard(screenToWorld(e.clientX, e.clientY));
});

newCanvasBtn.addEventListener('click', () => openCreateCard(boardCenterWorld()));
emptyCreateCanvasBtn?.addEventListener('mousedown', e => e.stopPropagation());
// A double-click on the empty-state button would otherwise bubble to the
// board's gesture handler and open a second create menu at the same point.
// Keep the button's native activation isolated from the canvas double-click
// affordance while retaining normal click/keyboard behavior.
emptyCreateCanvasBtn?.addEventListener('dblclick', e => e.stopPropagation());
emptyCreateCanvasBtn?.addEventListener('click', e => {
    e.stopPropagation();
    openCreateCard(boardCenterWorld());
});
boardRefreshBtn.addEventListener('click', loadAll);
boardResetViewBtn.addEventListener('click', () => {
    const settled = resetView();
    if(!settled) scheduleInitialReadableReset();
});
pasteCanvasBtn?.addEventListener('click', pasteCanvas);
boardSelectAllBtn?.addEventListener('click', selectAllCanvasItems);
boardClearSelectionBtn?.addEventListener('click', clearCanvasSelection);
boardBulkDeleteBtn?.addEventListener('click', () => openBulkConfirm('trash', selectedCanvasList(), 'board'));
trashSelectAllBtn?.addEventListener('click', selectAllTrashItems);
trashClearSelectionBtn?.addEventListener('click', clearTrashSelection);
trashBulkRestoreBtn?.addEventListener('click', () => performBulkCanvasAction('restore', selectedTrashList(), 'trash'));
trashBulkPurgeBtn?.addEventListener('click', () => openBulkConfirm('purge', selectedTrashList(), 'trash'));
bulkConfirmCancel?.addEventListener('click', () => closeBulkConfirm());
bulkConfirmSubmit?.addEventListener('click', submitBulkDialog);
bulkConfirmDialog?.addEventListener('click', e => {
    if(e.target.closest('[data-bulk-dialog-close="true"]')) closeBulkConfirm();
});
bulkConfirmDialog?.addEventListener('keydown', e => {
    if(e.key !== 'Tab' || !bulkConfirmDialog.classList.contains('active')) return;
    const focusable = [...bulkConfirmDialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter(el => el instanceof HTMLElement && el.offsetParent !== null);
    if(!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
});

newProjectBtn.addEventListener('click', openNewProject);
newProjectConfirm.addEventListener('click', createProject);
newProjectCancel.addEventListener('click', closeNewProject);
newProjectInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); createProject(); }
    if(e.key === 'Escape'){ e.preventDefault(); closeNewProject(); }
});

trashEntryBtn.addEventListener('click', () => {
    if(trashPanel.classList.contains('active')) closeTrashView();
    else openTrashView();
});
trashCloseBtn.addEventListener('click', closeTrashView);

// close card menu when clicking outside
document.addEventListener('mousedown', e => {
    if(document.querySelector('.ws-card-pop') && !e.target.closest('.ws-card-pop') && !e.target.closest('.ws-card-menu')){
        closeCardMenu();
    }
    if(document.querySelector('.ws-card.confirming-delete') && !e.target.closest('.ws-card.confirming-delete')){
        boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    }
});

document.addEventListener('keydown', e => {
    // Keep native text editing and form shortcuts intact.  The manager's
    // bulk commands are deliberately scoped to the non-editing canvas/list
    // surface so Backspace can never navigate away from an input field.
    const editable = canvasListEditableTarget(e.target);
    if(!editable && bulkConfirmDialog?.classList.contains('active') && e.key !== 'Escape') return;
    if(bulkConfirmDialog?.classList.contains('active')){
        if(e.key === 'Escape'){
            e.preventDefault();
            closeBulkConfirm();
        }
        return;
    }
    if(e.key !== 'Escape' && editable) return;
    if(e.key !== 'Escape'){
        const key = String(e.key || '').toLowerCase();
        const inTrash = trashPanel.classList.contains('active');
        if((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 'a'){
            e.preventDefault();
            if(inTrash) selectAllTrashItems();
            else selectAllCanvasItems();
            return;
        }
        if((e.key === 'Delete' || e.key === 'Backspace') && !bulkActionBusy){
            const ids = inTrash ? selectedTrashList() : selectedCanvasList();
            if(ids.length){
                e.preventDefault();
                openBulkConfirm(inTrash ? 'purge' : 'trash', ids, inTrash ? 'trash' : 'board');
                return;
            }
        }
        return;
    }
    closeCardMenu();
    closeCreateCard();
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    if(trashPanel.classList.contains('active')) closeTrashView();
});

// language switch from parent (index.html) via postMessage
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-lang'){
        if(event.data.lang && window.StudioI18n) StudioI18n.set(event.data.lang);
        window.StudioI18n?.apply?.();
        renderProjects();
        renderBoard();
        if(trashPanel.classList.contains('active')) renderTrash();
        refreshIcons();
    }
});

/* ===== Boot ===== */
window.StudioI18n?.apply?.();
applyViewport();
loadAll();
refreshIcons();
