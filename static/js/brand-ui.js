(function (root, document) {
    'use strict';

    const brand = root.CanvasBrand || {};
    const byId = id => document.getElementById(id);
    let contactPreviousFocus = null;
    const text = (id, value) => {
        const node = byId(id);
        if (node) node.textContent = String(value || '');
        return node;
    };
    const safeHref = value => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw, root.location.href);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') return parsed.href;
        } catch (_) { /* invalid contact links remain plain text */ }
        return '';
    };
    const iconSvg = name => {
        const paths = {
            mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
            globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
            link: '<path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15"/>',
            'user-round': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
            'message-circle': '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.8-4.2A8.3 8.3 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
            x: '<path d="m6 6 12 12M18 6 6 18"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.link}</svg>`;
    };

    /* Standalone routes do not have the index shell's sidebar.  Give those
       routes the same project-owned contact affordance so a user never has
       to navigate away from the editor to find the configured maintainer. */
    function ensureStandaloneContactSurface() {
        if (byId('studio-contact-modal') || !document.body) return;
        const launcher = document.createElement('button');
        launcher.id = 'studioContactLauncher';
        launcher.className = 'studio-contact-launcher';
        launcher.type = 'button';
        launcher.title = '联系项目维护者';
        launcher.setAttribute('aria-label', '联系项目维护者');
        launcher.innerHTML = `${iconSvg('message-circle')}<span>联系我</span>`;

        const modal = document.createElement('div');
        modal.id = 'studio-contact-modal';
        modal.className = 'studio-contact-modal';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'studioContactTitle');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="studio-contact-panel">
                <div class="studio-contact-head">
                    <div><span class="studio-contact-kicker">PROJECT CONTACT</span><h2 id="studioContactTitle">联系我</h2></div>
                    <button class="studio-contact-close" id="studioContactClose" type="button" title="关闭" aria-label="关闭">${iconSvg('x')}</button>
                </div>
                <p id="studioContactIntro" class="studio-contact-intro"></p>
                <div id="studioContactList" class="studio-contact-list"></div>
                <div class="studio-contact-foot">联系方式由项目维护者配置 · 本项目坚持开源与本地优先</div>
            </div>`;
        document.body.appendChild(launcher);
        document.body.appendChild(modal);
    }

    function renderContactRows() {
        const list = byId('studioContactList');
        if (!list) return;
        list.replaceChildren();
        const contacts = Array.isArray(brand.contacts) ? brand.contacts : [];
        if (!contacts.length) {
            const empty = document.createElement('div');
            empty.className = 'studio-contact-empty';
            empty.textContent = '暂未公开联系方式。请在 static/js/brand-config.js 中填写。';
            list.appendChild(empty);
            return;
        }
        contacts.forEach(item => {
            const href = safeHref(item.href);
            const row = href ? document.createElement('a') : document.createElement('div');
            row.className = 'studio-contact-row';
            if (href) {
                row.href = href;
                row.target = item.href.startsWith('mailto:') ? '_self' : '_blank';
                row.rel = 'noreferrer noopener';
            }
            row.innerHTML = `<span class="studio-contact-icon">${iconSvg(item.icon)}</span><span class="studio-contact-copy"><strong></strong><small></small></span>${href ? '<span class="studio-contact-arrow">↗</span>' : ''}`;
            row.querySelector('strong').textContent = item.label || '联系方式';
            row.querySelector('small').textContent = item.value || '已配置';
            list.appendChild(row);
        });
    }

    function applyBrand() {
        const appName = brand.appName || '画布实验室';
        const shortName = brand.shortName || 'CL';
        /* Standalone editor pages own their document title (they include the
           current canvas name). The shared brand shell still updates every
           visible data-brand-* node without overwriting that context title. */
        if (!document.body?.classList.contains('director-page')) {
            // Keep a route's explicit context title (for example “素材库管理”
            // or “GPT 对话”).  Only replace the old generic shell title; this
            // lets direct utility bookmarks stay identifiable while still
            // giving pages with no title a project-owned fallback.
            const currentTitle = String(document.title || '').trim();
            const genericTitles = new Set(['', '画布实验室', 'Infinite Canvas', 'Canvas Lab']);
            if (genericTitles.has(currentTitle)) document.title = appName;
        }
        document.querySelectorAll('[data-brand-app-name]').forEach(node => { node.textContent = appName; });
        document.querySelectorAll('[data-brand-short-name]').forEach(node => { node.textContent = shortName; });
        text('studioOwnerName', brand.maintainerName || '项目维护者');
        text('studioOwnerTagline', brand.maintainerTagline || '开源维护者');
        text('studioOwnerAvatar', String(brand.maintainerName || 'CL').trim().slice(0, 2).toUpperCase());
        text('studioContactTitle', brand.contactTitle || '联系我');
        text('studioContactIntro', brand.contactIntro || '欢迎反馈问题与建议。');
        const name = byId('studioContactButtonLabel');
        if (name) name.textContent = brand.contactTitle || '联系我';
        renderContactRows();
    }

    function openContact() {
        const modal = byId('studio-contact-modal');
        if (!modal) return;
        contactPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('studio-contact-open');
        byId('studioContactClose')?.focus();
    }
    function closeContact() {
        const modal = byId('studio-contact-modal');
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('studio-contact-open');
        // Standalone editor pages use the floating launcher while the index
        // shell uses its sidebar button. Return focus to whichever surface is
        // present so keyboard users do not lose their place after closing.
        const fallback = byId('studioContactButton') || byId('studioContactLauncher');
        if (contactPreviousFocus && document.contains(contactPreviousFocus)) contactPreviousFocus.focus();
        else fallback?.focus();
        contactPreviousFocus = null;
    }

    root.openStudioContact = openContact;
    root.closeStudioContact = closeContact;
    document.addEventListener('DOMContentLoaded', () => {
        ensureStandaloneContactSurface();
        applyBrand();
        byId('studioContactButton')?.addEventListener('click', openContact);
        byId('studioContactLauncher')?.addEventListener('click', openContact);
        byId('studioContactClose')?.addEventListener('click', closeContact);
        byId('studio-contact-modal')?.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeContact();
        });
        const focusables = modal => Array.from(modal?.querySelectorAll?.('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])
            .filter(node => !node.disabled && node.getAttribute('aria-hidden') !== 'true' && node.offsetParent !== null);
        const modal = byId('studio-contact-modal');
        if (modal && !modal.hasAttribute('aria-hidden')) modal.setAttribute('aria-hidden', modal.hidden ? 'true' : 'false');
        document.addEventListener('keydown', event => {
            const dialog = byId('studio-contact-modal');
            if (!dialog || dialog.hidden) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeContact();
                return;
            }
            if (event.key !== 'Tab') return;
            const items = focusables(dialog);
            if (!items.length) { event.preventDefault(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
            event.stopPropagation();
        });
    });
})(window, document);
