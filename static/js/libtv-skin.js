/*
 * LibTV-inspired desktop canvas chrome.
 *
 * This file deliberately contains only presentation glue.  It does not own
 * canvas state, node data, or generation requests; the existing canvas scripts
 * remain the source of truth.  Keeping the rail here means both canvas
 * implementations can share the same compact controls without duplicating
 * markup in their large HTML templates.
 */
(function () {
    'use strict';

    const shell = document.querySelector('.shell');
    const workspace = document.querySelector('.workspace');
    if (!shell && !workspace) return;

    const isSmart = Boolean(document.querySelector('.connection-layer')) || Boolean(document.getElementById('smartUtilityStrip'));
    const isClassic = Boolean(document.getElementById('links'));
    const body = document.body;
    body.classList.add('libtv-surface');
    if (!shell) {
        // The project/canvas list shares the same tokens but has no node rail.
        // Do not return before the class is applied: this gives the list page
        // the same dark studio background and typography.
        try {
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
            else if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (_) {}
        return;
    }
    shell.classList.add('libtv-canvas-shell');

    // The world is transformed rather than scrolled.  Browsers can still
    // auto-scroll this large overflow container when an editor input receives
    // focus, which would pull the fixed chrome (brand, rail, dock) off-screen.
    // Keep the scroll origin pinned while preserving the editor's own pan/
    // zoom coordinate system.
    const pinShellScroll = () => {
        if (shell.scrollLeft) shell.scrollLeft = 0;
        if (shell.scrollTop) shell.scrollTop = 0;
    };
    shell.addEventListener('scroll', pinShellScroll, {passive: true});
    pinShellScroll();

    /* Keep the editor oriented like a LibTV workspace: a small project-owned
     * mark, application name, and current canvas title sit in one quiet
     * lockup.  Values come from brand-config.js so a published fork can
     * change identity without editing either canvas template. */
    function ensureBrandLockup() {
        if (document.getElementById('libtvBrandLockup')) return;
        const brand = window.CanvasBrand || {};
        const mark = String(brand.shortName || 'CL').trim().slice(0, 3).toUpperCase() || 'CL';
        const name = String(brand.appName || '画布实验室').trim() || '画布实验室';
        const lockup = document.createElement('div');
        lockup.id = 'libtvBrandLockup';
        lockup.className = 'libtv-brand-lockup';
        lockup.setAttribute('aria-label', name);
        lockup.innerHTML = '<span class="libtv-brand-mark" aria-hidden="true"></span><span class="libtv-brand-copy"><strong></strong><small>无限画布</small></span>';
        lockup.querySelector('.libtv-brand-mark').textContent = mark;
        lockup.querySelector('strong').textContent = name;
        shell.appendChild(lockup);
    }
    ensureBrandLockup();

    // Avoid creating a duplicate rail when a hot-reloaded page evaluates this
    // script more than once.
    let rail = document.getElementById('libtvRail');
    if (!rail) {
        rail = document.createElement('nav');
        rail.id = 'libtvRail';
        rail.className = 'libtv-rail';
        rail.setAttribute('aria-label', '画布工具');
        rail.innerHTML = [
            ['create', 'plus', '添加节点'],
            ['connect', 'git-branch', '连接节点'],
            ['assets', 'library', '资产库'],
            ['history', 'history', '历史记录'],
            ['help', 'circle-help', '使用帮助']
        ].map(([action, icon, label], index) => `
            ${index === 3 ? '<span class="libtv-rail-separator" aria-hidden="true"></span>' : ''}
            <button type="button" class="libtv-rail-btn" data-libtv-action="${action}" title="${label}" aria-label="${label}">
                <i data-lucide="${icon}"></i>
                <span>${label}</span>
            </button>`).join('');
        shell.appendChild(rail);
    }

    function stop(event) {
        event?.stopPropagation?.();
        // Prevent the canvas surface from starting a pan when the pointer
        // lands on chrome, but keep the browser's native focus behavior for
        // actual controls.  A blanket preventDefault() here made a mouse
        // click on the rail/dock/empty-state buttons leave focus on <body>,
        // which in turn broke keyboard continuation and modal focus return.
        const target = event?.target;
        const interactive = target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]');
        if(!interactive) event?.preventDefault?.();
    }

    function railPoint() {
        const rect = rail.getBoundingClientRect();
        return {
            x: Math.min(window.innerWidth - 16, rect.right + 14),
            y: Math.min(window.innerHeight - 80, rect.top + 14)
        };
    }

    function openCreateMenuFromRail() {
        const p = railPoint();
        // smart-canvas.openCreateMenu receives a Pointer/MouseEvent-like
        // object; classic canvas.openCreateMenu receives x/y numbers.  The
        // page-specific functions are intentionally detected rather than
        // coupled through a new shared state layer.
        if (isClassic && typeof window.openCreateMenu === 'function') {
            window.openCreateMenu(p.x, p.y);
            keepCreateMenuInViewport();
            return;
        }
        if (typeof window.openCreateMenu === 'function') {
            window.openCreateMenu({
                clientX: p.x,
                clientY: p.y,
                target: rail,
                preventDefault() {},
                stopPropagation() {}
            });
            keepCreateMenuInViewport();
        } else {
            // Global function declarations in the legacy scripts are lexical
            // (not window properties). Dispatch the same gesture instead;
            // both editors keep a native context/double-click menu handler.
            const target = isClassic ? document.getElementById('board') : shell;
            target?.dispatchEvent(new MouseEvent(isClassic ? 'contextmenu' : 'dblclick', {
                bubbles: true,
                cancelable: true,
                clientX: p.x,
                clientY: p.y,
                button: isClassic ? 2 : 0
            }));
            keepCreateMenuInViewport();
        }
    }

    function toggleConnectMode(button) {
        const enabled = !body.classList.contains('libtv-connect-mode');
        body.classList.toggle('libtv-connect-mode', enabled);
        button.classList.toggle('active', enabled);
        button.setAttribute('aria-pressed', String(enabled));
        let hint = document.getElementById('libtvConnectHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'libtvConnectHint';
            hint.className = 'libtv-connect-hint';
            hint.setAttribute('role', 'status');
            shell.appendChild(hint);
        }
        hint.textContent = enabled ? '拖动节点右侧端口到下一个节点即可连线 · Esc 退出' : '';
        hint.classList.toggle('visible', enabled);
    }

    function triggerExisting(selector, fallback) {
        const target = document.querySelector(selector);
        if (target) {
            target.click();
            return;
        }
        if (typeof fallback === 'function') fallback();
    }

    /* ------------------------------------------------------------------
     * LibTV view dock + empty workspace affordance
     *
     * This remains a presentation adapter. The editor scripts continue to
     * own viewport/data state; the dock sends the same wheel/command events a
     * person would use. Keeping the bridge here gives both canvas variants a
     * shared visual contract without duplicating their markup.
     * ------------------------------------------------------------------ */
    const canvasSurface = isClassic || isSmart;
    let dock = null;
    let emptyState = null;
    let zoomReadout = null;
    let emptyObserver = null;
    let viewportObserver = null;

    function pageFunction(name) {
        const fn = window[name];
        return typeof fn === 'function' ? fn : null;
    }

    function canvasPoint() {
        // The classic editor may keep an internal scroll offset while loading
        // a persisted view; the shell rect is the stable viewport coordinate
        // for both variants.
        const rect = shell?.getBoundingClientRect?.();
        if (!rect) return {x: window.innerWidth / 2, y: window.innerHeight / 2};
        return {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2)
        };
    }

    function dispatchZoom(direction) {
        const target = isClassic ? document.getElementById('board') : shell;
        if (!target) return;
        const point = canvasPoint();
        // Native handlers clamp and persist their own scale. A wheel event
        // preserves that behavior, including focus-point zoom.
        try {
            target.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                deltaY: direction > 0 ? -160 : 160,
                clientX: point.x,
                clientY: point.y
            }));
        } catch (_) {
            // Older embedded WebViews may not expose WheelEvent.
        }
        updateZoomReadout();
    }

    function updateZoomReadout() {
        if (!zoomReadout) return;
        const world = document.getElementById('world');
        const transform = world?.style?.transform || '';
        const match = transform.match(/scale\(\s*([0-9.+-]+)(?:,|\s|\))/i);
        const value = match ? Number(match[1]) : 1;
        const pct = Number.isFinite(value) ? Math.round(value * 100) : 100;
        zoomReadout.textContent = `${Math.max(1, Math.min(800, pct))}%`;
        zoomReadout.setAttribute('aria-label', `当前缩放 ${zoomReadout.textContent}`);
    }

    function callFit() {
        const fit = pageFunction('fitAllNodesViewport');
        if (fit) {
            try { fit(); } catch (_) {}
        } else {
            // The editor keeps its state in a lexical scope, so the helper is
            // not always reachable through window.*.  Both editor scripts
            // listen for this small presentation bridge rather than us
            // synthesising a keyboard shortcut with unrelated semantics.
            try { window.dispatchEvent(new CustomEvent('libtv-fit-view')); } catch (_) {}
        }
        updateZoomReadout();
    }

    function clickCreateMenuType(type) {
        if (!type) return false;
        if (isSmart) {
            const card = shell.querySelector(`#createMenu [data-create-type="${CSS.escape(type)}"]`);
            if (card) {
                card.click();
                return true;
            }
            return false;
        }
        const buttons = shell.querySelectorAll('#createMenu .menu-btn');
        for (const button of buttons) {
            const code = button.getAttribute('onclick') || '';
            if (code.includes(`'${type}'`) || code.includes(`"${type}"`)) {
                button.click();
                return true;
            }
        }
        return false;
    }

    function dispatchCreateMenuAt(point) {
        const target = isClassic ? document.getElementById('board') : shell;
        if (!target) return;
        target.dispatchEvent(new MouseEvent(isClassic ? 'contextmenu' : 'dblclick', {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            button: isClassic ? 2 : 0
        }));
    }

    // Legacy menus position themselves at the pointer and do not flip when
    // opened near an edge.  The classic menu is intentionally tall, so a
    // center click can otherwise put its lower half below the desktop
    // viewport.  Nudge only the menu's CSS coordinates (never the stored
    // world point) until the full card stack is visible with a small gutter.
    function keepCreateMenuInViewport() {
        const menu = shell.querySelector('#createMenu.open');
        if (!menu) return;
        const rect = menu.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const gutter = 14;
        let left = Number.parseFloat(menu.style.left);
        let top = Number.parseFloat(menu.style.top);
        if (!Number.isFinite(left)) left = rect.left;
        if (!Number.isFinite(top)) top = rect.top;
        let dx = 0;
        let dy = 0;
        if (rect.right > window.innerWidth - gutter) dx = (window.innerWidth - gutter) - rect.right;
        if (rect.left + dx < gutter) dx += gutter - (rect.left + dx);
        if (rect.bottom > window.innerHeight - gutter) dy = (window.innerHeight - gutter) - rect.bottom;
        if (rect.top + dy < gutter) dy += gutter - (rect.top + dy);
        if (Math.abs(dx) > 0.5) menu.style.left = `${Math.round(left + dx)}px`;
        if (Math.abs(dy) > 0.5) menu.style.top = `${Math.round(top + dy)}px`;
    }

    function createAtCenter(type) {
        const point = canvasPoint();
        if (isClassic) {
            const open = pageFunction('openCreateMenu');
            const add = pageFunction('menuAdd');
            if (open) open(point.x, point.y);
            else dispatchCreateMenuAt(point);
            keepCreateMenuInViewport();
            if (type && add) add(type);
            else if (type) {
                if (!clickCreateMenuType(type)) window.setTimeout(() => clickCreateMenuType(type), 0);
            }
            return;
        }
        const open = pageFunction('openCreateMenu');
        const add = pageFunction('createNodeFromMenu');
        if (open) {
            open({
                clientX: point.x,
                clientY: point.y,
                target: shell,
                preventDefault() {},
                stopPropagation() {}
            });
        } else dispatchCreateMenuAt(point);
        keepCreateMenuInViewport();
        if (type && add) add(type);
        else if (type) {
            if (!clickCreateMenuType(type)) window.setTimeout(() => clickCreateMenuType(type), 0);
        }
    }

    function focusSmartComposer() {
        const input = document.getElementById('promptInput');
        if (!input) return;
        input.focus();
        input.classList.add('libtv-focus-pulse');
        window.setTimeout(() => input.classList.remove('libtv-focus-pulse'), 700);
    }

    function createDock() {
        if (!canvasSurface) return;
        dock = document.getElementById('libtvDock');
        if (dock) {
            zoomReadout = dock.querySelector('[data-libtv-zoom-readout]');
            return;
        }
        dock = document.createElement('div');
        dock.id = 'libtvDock';
        dock.className = 'libtv-dock';
        dock.setAttribute('role', 'toolbar');
        dock.setAttribute('aria-label', '画布视图工具');
        dock.innerHTML = `
            <span class="libtv-dock-mode" title="按住空格拖动画布" aria-label="拖动模式">
                <i data-lucide="hand"></i><span>拖动</span>
            </span>
            <span class="libtv-dock-separator" aria-hidden="true"></span>
            <button type="button" class="libtv-dock-btn" data-libtv-dock-action="zoom-out" title="缩小" aria-label="缩小">
                <i data-lucide="minus"></i>
            </button>
            <output class="libtv-dock-zoom" data-libtv-zoom-readout aria-live="polite" aria-label="当前缩放 100%">100%</output>
            <button type="button" class="libtv-dock-btn" data-libtv-dock-action="zoom-in" title="放大" aria-label="放大">
                <i data-lucide="plus"></i>
            </button>
            <span class="libtv-dock-separator" aria-hidden="true"></span>
            <button type="button" class="libtv-dock-btn libtv-dock-fit" data-libtv-dock-action="fit" title="适配全部内容" aria-label="适配全部内容">
                <i data-lucide="scan"></i><span>适配</span>
            </button>
            <button type="button" class="libtv-dock-btn" data-libtv-dock-action="add" title="添加节点" aria-label="添加节点">
                <i data-lucide="sparkles"></i><span>添加</span>
            </button>`;
        shell.appendChild(dock);
        zoomReadout = dock.querySelector('[data-libtv-zoom-readout]');
        dock.addEventListener('pointerdown', stop);
        dock.addEventListener('mousedown', stop);
        dock.addEventListener('click', (event) => {
            stop(event);
            const action = event.target.closest('[data-libtv-dock-action]')?.dataset.libtvDockAction;
            if (action === 'zoom-in') dispatchZoom(1);
            else if (action === 'zoom-out') dispatchZoom(-1);
            else if (action === 'fit') callFit();
            else if (action === 'add') createAtCenter();
        });
        viewportObserver = new MutationObserver(updateZoomReadout);
        const world = document.getElementById('world');
        if (world) viewportObserver.observe(world, {attributes: true, attributeFilter: ['style']});
        window.addEventListener('resize', updateZoomReadout, {passive: true});
        updateZoomReadout();
    }

    function buildEmptyState() {
        if (!canvasSurface) return;
        emptyState = document.getElementById('libtvEmptyState');
        if (emptyState) return;
        emptyState = document.createElement('section');
        emptyState.id = 'libtvEmptyState';
        emptyState.className = 'libtv-empty-state';
        emptyState.setAttribute('aria-labelledby', 'libtvEmptyTitle');
        if (isSmart) {
            emptyState.innerHTML = `
                <div class="libtv-empty-orbit" aria-hidden="true"><i data-lucide="sparkles"></i></div>
                <div class="libtv-empty-kicker">INFINITE CANVAS</div>
                <h2 id="libtvEmptyTitle">双击画布，自由生成节点</h2>
                <p>从提示词或素材开始，逐步搭出你的视觉流程</p>
                <div class="libtv-empty-actions" role="group" aria-label="快速开始">
                    <button type="button" data-libtv-empty-action="prompt"><i data-lucide="text-cursor-input"></i><span><b>提示词</b><small>写下第一帧</small></span></button>
                    <button type="button" data-libtv-empty-action="image"><i data-lucide="image-plus"></i><span><b>导入素材</b><small>图片、视频、音频</small></span></button>
                    <button type="button" data-libtv-empty-action="loop"><i data-lucide="repeat-2"></i><span><b>循环</b><small>批量试验变量</small></span></button>
                    <button type="button" data-libtv-empty-action="group"><i data-lucide="group"></i><span><b>分组</b><small>整理工作流</small></span></button>
                </div>`;
        } else {
            emptyState.innerHTML = `
                <div class="libtv-empty-orbit" aria-hidden="true"><i data-lucide="sparkles"></i></div>
                <div class="libtv-empty-kicker">INFINITE CANVAS</div>
                <h2 id="libtvEmptyTitle">双击画布，自由生成节点</h2>
                <p>从一个想法开始，把素材和生成步骤连成流</p>
                <div class="libtv-empty-actions" role="group" aria-label="快速开始">
                    <button type="button" data-libtv-empty-action="prompt"><i data-lucide="text-cursor-input"></i><span><b>文本</b><small>写下第一帧</small></span></button>
                    <button type="button" data-libtv-empty-action="image"><i data-lucide="image-plus"></i><span><b>图片</b><small>放入参考素材</small></span></button>
                    <button type="button" data-libtv-empty-action="video"><i data-lucide="clapperboard"></i><span><b>视频</b><small>搭建动态镜头</small></span></button>
                    <button type="button" data-libtv-empty-action="audio"><i data-lucide="music-2"></i><span><b>音频</b><small>加入声音层</small></span></button>
                </div>`;
        }
        shell.appendChild(emptyState);
        emptyState.addEventListener('pointerdown', stop);
        emptyState.addEventListener('mousedown', stop);
        // The editor's double-click gesture creates a node on the canvas.
        // Keep a double-click on a quick-start card/button inside this layer
        // from opening a second node underneath the intended action.
        emptyState.addEventListener('dblclick', stop);
        emptyState.addEventListener('click', (event) => {
            stop(event);
            const action = event.target.closest('[data-libtv-empty-action]')?.dataset.libtvEmptyAction;
            if (!action) return;
            if (isSmart && action === 'prompt') {
                createAtCenter('prompt');
                window.setTimeout(focusSmartComposer, 60);
                return;
            }
            if (isSmart) createAtCenter(action === 'group' ? 'group' : action === 'loop' ? 'loop' : 'image');
            else createAtCenter(action);
        });
        refreshIconsSafe();
    }

    function refreshIconsSafe() {
        try {
            if (typeof window.refreshIcons === 'function') window.refreshIcons();
            else if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (_) {}
    }

    function hasCanvasContent() {
        if (shell.classList.contains('no-canvas')) return false;
        // This layer only needs to know whether a rendered card is present.
        return Boolean(shell.querySelector('.node, .image-node, .smart-group-node'));
    }

    function updateEmptyState() {
        if (!emptyState) return;
        const hasContent = hasCanvasContent();
        const menuOpen = Boolean(shell.querySelector('.create-menu.open, .composer.open, .asset-panel.open, .canvas-asset-panel.open, .workflow-transfer-panel.open'));
        const editing = Boolean(document.querySelector('.image-edit-modal.open, .log-modal.open, .shortcut-modal.open'));
        emptyState.classList.toggle('is-hidden', hasContent || menuOpen || editing);
        body.classList.toggle('libtv-empty-canvas', !hasContent && !menuOpen && !editing);
    }

    function watchEmptyState() {
        // The skin can be evaluated while an embedded editor is still
        // swapping its shell (or on a list document that has no shell at
        // all).  MutationObserver.observe requires a concrete Node; keep the
        // presentation adapter fail-soft instead of surfacing an uncaught
        // TypeError during page bootstrap.
        if (!emptyState || !shell || shell.nodeType !== 1) return;
        emptyObserver = new MutationObserver(() => {
            window.requestAnimationFrame(updateEmptyState);
        });
        emptyObserver.observe(shell, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style']});
        updateEmptyState();
    }

    /* ------------------------------------------------------------------
     * Historical smart-canvas context ribbon
     *
     * Some older canvases keep an enormous instructional prompt at the
     * top of the world (usually p_note or p_script).  That card is still a
     * real editor control and must remain selectable/editable; the ribbon
     * below is only a readable summary in the fixed chrome.  It deliberately
     * reads the textarea value and writes every label through textContent so
     * prompt text can never become markup.
     * ------------------------------------------------------------------ */
    let contextRibbon = null;
    let contextRibbonObserver = null;
    let contextRibbonFrame = 0;
    let contextRibbonSignature = '';
    let contextRibbonActiveId = '';
    const CONTEXT_SUMMARY_LIMIT = 220;

    function contextSourceText(element) {
        const textarea = element?.querySelector?.('textarea.prompt-node-text, textarea');
        const value = textarea && typeof textarea.value === 'string' ? textarea.value : '';
        // textContent is a safe fallback for a cached/non-form prompt shell.
        return String(value || textarea?.textContent || '').trim();
    }

    function contextSourceLabel(element) {
        const id = String(element?.dataset?.id || '').trim().toLowerCase();
        if (id === 'p_note') return '使用说明';
        if (id === 'p_script') return '脚本上下文';
        const firstLine = contextSourceText(element).split(/\r?\n/).map(part => part.trim()).find(Boolean);
        return (firstLine || '画布上下文').slice(0, 18);
    }

    function isContextSource(element) {
        if (!element?.matches?.('.image-node.prompt-smart-node')) return false;
        const id = String(element.dataset?.id || '').trim().toLowerCase();
        const text = contextSourceText(element);
        const width = Number.parseFloat(element.style?.width || '') || Number(element.offsetWidth || 0);
        const knownId = id === 'p_note' || id === 'p_script';
        const wideInstruction = width >= 900 && /说明|怎么用|脚本|instruction|workflow|镜头|台词|scene|guide/i.test(text.slice(0, 360));
        return knownId || wideInstruction;
    }

    function truncateContextText(value, limit = CONTEXT_SUMMARY_LIMIT) {
        const normalized = String(value || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return '暂无说明内容';
        const chars = Array.from(normalized);
        if (chars.length <= limit) return normalized;
        return `${chars.slice(0, Math.max(1, limit - 1)).join('')}…`;
    }

    function contextSourceElements() {
        if (!isSmart || !shell) return [];
        return [...shell.querySelectorAll('.image-node.prompt-smart-node')].filter(isContextSource);
    }

    function findContextSource(id) {
        const wanted = String(id || '');
        return contextSourceElements().find(element => String(element.dataset?.id || '') === wanted) || null;
    }

    function buildContextRibbon() {
        if (contextRibbon || !isSmart || !shell) return contextRibbon;
        const root = document.createElement('section');
        root.id = 'libtvContextRibbon';
        root.className = 'libtv-context-ribbon';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.setAttribute('aria-label', '画布上下文');

        const iconWrap = document.createElement('span');
        iconWrap.className = 'libtv-context-ribbon-icon';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'notebook-tabs');
        iconWrap.appendChild(icon);

        const copy = document.createElement('div');
        copy.className = 'libtv-context-ribbon-copy';
        const kicker = document.createElement('span');
        kicker.className = 'libtv-context-ribbon-kicker';
        kicker.textContent = '画布上下文';
        const title = document.createElement('strong');
        title.className = 'libtv-context-ribbon-title';
        title.dataset.contextTitle = '1';
        copy.append(kicker, title);

        const tabs = document.createElement('div');
        tabs.className = 'libtv-context-ribbon-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', '上下文来源');

        const summary = document.createElement('p');
        summary.className = 'libtv-context-ribbon-summary';
        summary.dataset.contextSummary = '1';

        const focus = document.createElement('button');
        focus.type = 'button';
        focus.className = 'libtv-context-ribbon-focus';
        focus.dataset.contextFocus = '1';
        focus.setAttribute('title', '聚焦原卡片并编辑');
        focus.setAttribute('aria-label', '聚焦原卡片并编辑');
        const focusIcon = document.createElement('i');
        focusIcon.setAttribute('data-lucide', 'focus');
        const focusText = document.createElement('span');
        focusText.textContent = '编辑';
        focus.append(focusIcon, focusText);

        root.append(iconWrap, copy, tabs, summary, focus);
        shell.appendChild(root);
        focus.addEventListener('pointerdown', stop);
        focus.addEventListener('mousedown', stop);
        focus.addEventListener('click', event => {
            stop(event);
            const source = findContextSource(focus.dataset.contextTarget || contextRibbonActiveId);
            if (!source) return;
            contextRibbonActiveId = String(source.dataset.id || '');
            source.classList.add('libtv-context-source-active');
            const contextId = contextRibbonActiveId;
            // The smart editor owns the transformed world and its viewport. Ask
            // it to center the source in world coordinates before focusing the
            // textarea; a plain focus() leaves off-screen legacy cards hidden
            // behind the LibTV veil and was the source of the old "编辑无效"
            // report. Keep the event fallback for a hot-reloaded editor whose
            // public bridge has not been exported yet.
            const focusBridge = pageFunction('focusSmartContextNode');
            let centered = false;
            if (focusBridge) {
                try { centered = focusBridge(contextId) !== false; } catch (_) {}
            }
            if (!centered) {
                try {
                    window.dispatchEvent(new CustomEvent('libtv-focus-context', {
                        detail: {id: contextId, contextTarget: contextId}
                    }));
                } catch (_) {}
            }
            const textarea = source.querySelector('textarea.prompt-node-text, textarea');
            try { textarea?.focus?.({preventScroll: true}); } catch (_) { textarea?.focus?.(); }
            window.setTimeout(() => source.classList.remove('libtv-context-source-active'), 1600);
            renderContextRibbon(contextSourceElements(), true);
        });
        contextRibbon = root;
        refreshIconsSafe();
        return contextRibbon;
    }

    function renderContextRibbon(elements, force = false) {
        if (!elements.length) {
            if (contextRibbon) contextRibbon.hidden = true;
            contextRibbonActiveId = '';
            contextRibbonSignature = '';
            return;
        }
        const entries = elements.map(element => ({
            element,
            id: String(element.dataset?.id || ''),
            label: contextSourceLabel(element),
            text: contextSourceText(element)
        })).filter(entry => entry.id);
        if (!entries.length) return;
        const signature = entries.map(entry => `${entry.id}:${entry.text.slice(0, 280)}:${entry.text.length}`).join('|');
        const active = entries.find(entry => entry.id === contextRibbonActiveId) || entries[0];
        contextRibbonActiveId = active.id;
        const root = buildContextRibbon();
        if (!root) return;
        root.hidden = false;
        if (!force && signature === contextRibbonSignature && root.dataset.contextReady === '1') {
            root.dataset.contextFocus = active.id;
            root.querySelector('[data-context-focus]').dataset.contextTarget = active.id;
            return;
        }
        contextRibbonSignature = signature;
        root.dataset.contextReady = '1';
        root.classList.toggle('is-multi', entries.length > 1);
        root.querySelector('[data-context-title]').textContent = active.label;
        root.querySelector('[data-context-summary]').textContent = truncateContextText(active.text);
        const focus = root.querySelector('[data-context-focus]');
        focus.dataset.contextTarget = active.id;

        const tabs = root.querySelector('.libtv-context-ribbon-tabs');
        while (tabs.firstChild) tabs.removeChild(tabs.firstChild);
        entries.forEach(entry => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'libtv-context-ribbon-tab';
            tab.dataset.contextSource = entry.id;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', String(entry.id === active.id));
            tab.textContent = entry.label;
            tab.addEventListener('pointerdown', stop);
            tab.addEventListener('mousedown', stop);
            tab.addEventListener('click', event => {
                stop(event);
                contextRibbonActiveId = entry.id;
                renderContextRibbon(contextSourceElements(), true);
            });
            tabs.appendChild(tab);
        });

        elements.forEach(element => {
            element.classList.add('libtv-context-source');
            const textarea = element.querySelector('textarea.prompt-node-text, textarea');
            if (textarea && textarea.dataset.libtvContextBound !== '1') {
                textarea.dataset.libtvContextBound = '1';
                textarea.addEventListener('input', () => {
                    contextRibbonSignature = '';
                    queueContextRibbonSync();
                });
            }
        });
        refreshIconsSafe();
    }

    function syncContextRibbon() {
        if (!isSmart || !shell) return;
        const elements = contextSourceElements();
        const activeIds = new Set(elements.map(element => String(element.dataset?.id || '')));
        shell.querySelectorAll('.libtv-context-source').forEach(element => {
            if (!activeIds.has(String(element.dataset?.id || ''))) element.classList.remove('libtv-context-source');
        });
        if (contextRibbonActiveId && !activeIds.has(contextRibbonActiveId)) contextRibbonActiveId = '';
        renderContextRibbon(elements);
    }

    function queueContextRibbonSync() {
        if (!isSmart || !shell || contextRibbonFrame) return;
        const schedule = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : window.setTimeout;
        contextRibbonFrame = schedule(() => {
            contextRibbonFrame = 0;
            syncContextRibbon();
        }, 0);
    }

    function watchContextRibbon() {
        if (!isSmart || !shell || contextRibbonObserver) return;
        contextRibbonObserver = new MutationObserver(queueContextRibbonSync);
        contextRibbonObserver.observe(shell, {subtree: true, childList: true});
        queueContextRibbonSync();
    }

    if (canvasSurface) {
        createDock();
        buildEmptyState();
        watchEmptyState();
        watchContextRibbon();
    }

    rail.querySelectorAll('[data-libtv-action]').forEach((button) => {
        button.addEventListener('pointerdown', stop);
        // The canvas editor also listens for a bubbling ``mousedown`` on the
        // shell to start panning.  Stop that event at the rail control while
        // deliberately leaving its default action intact so mouse clicks can
        // move focus to the button (and modal focus can later return here).
        button.addEventListener('mousedown', stop);
        button.addEventListener('click', (event) => {
            stop(event);
            const action = button.dataset.libtvAction;
            if (action === 'create') {
                openCreateMenuFromRail();
            } else if (action === 'connect') {
                toggleConnectMode(button);
            } else if (action === 'assets') {
                triggerExisting(isSmart ? '#assetToggle' : '#canvasAssetToggle');
            } else if (action === 'history') {
                if (isSmart && typeof window.openSmartCanvasLog === 'function') window.openSmartCanvasLog();
                else if (typeof window.openCanvasLog === 'function') window.openCanvasLog(event);
            } else if (action === 'help') {
                if (isSmart && typeof window.openSmartCanvasShortcuts === 'function') window.openSmartCanvasShortcuts();
                else if (typeof window.toggleQuickToolbar === 'function') window.toggleQuickToolbar();
            }
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && body.classList.contains('libtv-connect-mode')) {
            body.classList.remove('libtv-connect-mode');
            const button = rail.querySelector('[data-libtv-action="connect"]');
            button?.classList.remove('active');
            button?.setAttribute('aria-pressed', 'false');
            document.getElementById('libtvConnectHint')?.classList.remove('visible');
        }
    });

    // Lucide replaces the declarative <i> tags with SVGs.  The page scripts
    // already expose refreshIcons(), but call the library directly as a safe
    // fallback for cached builds that do not.
    try {
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
        else if (window.lucide?.createIcons) window.lucide.createIcons();
    } catch (_) {}
})();
