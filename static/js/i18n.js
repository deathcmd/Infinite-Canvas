(function(){
    // Install a tiny synchronous bridge before loading the full dictionaries.
    // Embedded/late-created documents may have no currentScript, so the
    // module chain below is asynchronous there.  GPT chat renders its bulk
    // controls immediately; returning the Chinese defaults prevents raw keys
    // (for example `chat.bulkManage`) from flashing or becoming permanent if
    // a module request is delayed.
    if(!window.StudioI18n){
        const bootstrap = {
            // Keep the keyboard help readable even if an embedded WebView
            // delays or blocks the optional smart-canvas bundle.  The full
            // dictionary registers the same key later; this value only
            // prevents a raw ``smart.*`` identifier from leaking into the
            // first paint or an offline shell.
            'smart.shortcutRedoAlias': '恢复上一步操作（另一种快捷键）',
            'chat.bulkManage': '批量管理',
            'chat.bulkSelectAll': '全选',
            'chat.bulkDeselectAll': '取消全选',
            'chat.bulkClear': '清空',
            'chat.bulkDelete': '删除所选',
            'chat.bulkExit': '完成',
            'chat.bulkSelect': '选择对话',
            'chat.bulkSelected': '已选 {n} 条',
            'chat.bulkDeleteConfirm': '确认删除选中的 {n} 条历史对话？此操作不可恢复。',
            'chat.bulkDeleteDone': '已删除 {n} 条对话',
            'chat.bulkDeleteFailed': '批量删除失败',
        };
        const bootstrapLang = () => { try { return localStorage.getItem('studio_lang') === 'en' ? 'en' : 'zh'; } catch(e) { return 'zh'; } };
        const bootstrapApply = (root=document) => {
            root.querySelectorAll?.('[data-i18n]').forEach(el => { if(bootstrap[el.dataset.i18n]) el.textContent = bootstrap[el.dataset.i18n]; });
            root.querySelectorAll?.('[data-i18n-placeholder]').forEach(el => { if(bootstrap[el.dataset.i18nPlaceholder]) el.setAttribute('placeholder', bootstrap[el.dataset.i18nPlaceholder]); });
            root.querySelectorAll?.('[data-i18n-title]').forEach(el => { if(bootstrap[el.dataset.i18nTitle]) el.setAttribute('title', bootstrap[el.dataset.i18nTitle]); });
        };
        window.StudioI18n = {
            t: key => bootstrap[key] || key,
            apply: bootstrapApply,
            set: next => { try { localStorage.setItem('studio_lang', next === 'en' ? 'en' : 'zh'); } catch(e) {} bootstrapApply(); },
            toggle: () => {},
            lang: bootstrapLang,
            register: bundle => { if(bundle && typeof bundle === 'object') Object.keys(bundle).forEach(k => { if(bundle[k]?.zh) bootstrap[k] = String(bundle[k].zh); }); },
            entries: () => ({ zh: { ...bootstrap }, en: {} }),
        };
        bootstrapApply();
    }
    // Bump the child-module cache key whenever shared labels change.  This
    // keeps long-lived browser tabs from retaining an older common dictionary
    // (for example, before the standalone-director entry was added).
    const VERSION = '2026.09.01.opensource8';
    const scripts = [
        '/static/js/i18n-core.js',
        '/static/js/i18n/common.js',
        '/static/js/i18n/studio.js',
        '/static/js/i18n/api-settings.js',
        '/static/js/i18n/canvas.js',
        '/static/js/i18n/smart-canvas.js',
        '/static/js/i18n/comfyui-settings.js',
    ];
    const tags = scripts.map(src => '<script src="' + src + '?v=' + VERSION + '"></script>').join('');
    // Use parser-blocking document.write only while the document is still
    // loading.  Calling document.write after an async/embedded load can
    // replace the entire document, so those contexts use the safe chain below.
    if(document.readyState === 'loading' && document.currentScript){
        document.write(tags);
        return;
    }
    scripts.reduce((promise, src) => promise.then(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src + '?v=' + VERSION;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    })), Promise.resolve()).then(() => window.StudioI18n?.apply?.()).catch(err => console.error('Failed to load i18n modules', err));
})();
