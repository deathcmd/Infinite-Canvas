(function(){
    const KEY = 'studio_lang';
    const DEFAULT_LANG = 'zh';
    const dict = { zh: {
        // Core fallback labels keep first-paint controls readable even when a
        // page is embedded and optional language bundles arrive later.
        'chat.bulkManage':'批量管理', 'chat.bulkSelectAll':'全选',
        'chat.bulkDeselectAll':'取消全选', 'chat.bulkClear':'清空',
        'chat.bulkDelete':'删除所选', 'chat.bulkExit':'完成',
        'chat.bulkSelect':'选择对话', 'chat.bulkSelected':'已选 {n} 条',
        'chat.bulkDeleteConfirm':'确认删除选中的 {n} 条历史对话？此操作不可恢复。',
        'chat.bulkDeleteDone':'已删除 {n} 条对话', 'chat.bulkDeleteFailed':'批量删除失败',
        'smart.shortcutRedoAlias':'恢复上一步操作（另一种快捷键）'
    }, en: {
        'chat.bulkManage':'Manage', 'chat.bulkSelectAll':'Select all',
        'chat.bulkDeselectAll':'Deselect all', 'chat.bulkClear':'Clear',
        'chat.bulkDelete':'Delete selected', 'chat.bulkExit':'Done',
        'chat.bulkSelect':'Select conversation', 'chat.bulkSelected':'{n} selected',
        'chat.bulkDeleteConfirm':'Delete {n} selected conversations? This cannot be undone.',
        'chat.bulkDeleteDone':'Deleted {n} conversations', 'chat.bulkDeleteFailed':'Bulk delete failed',
        'smart.shortcutRedoAlias':'Redo the last action (alternate shortcut)'
    } };

    function lang(){
        return localStorage.getItem(KEY) || DEFAULT_LANG;
    }

    function normalizeEntry(key, entry){
        if(entry && typeof entry === 'object' && !Array.isArray(entry) && ('zh' in entry || 'en' in entry)){
            return {
                zh: entry.zh == null ? (entry.en == null ? key : String(entry.en)) : String(entry.zh),
                en: entry.en == null ? (entry.zh == null ? key : String(entry.zh)) : String(entry.en),
            };
        }
        const value = entry == null ? key : String(entry);
        return { zh: value, en: value };
    }

    function register(bundle){
        if(!bundle || typeof bundle !== 'object') return;
        if(bundle.zh || bundle.en){
            Object.assign(dict.zh, bundle.zh || {});
            Object.assign(dict.en, bundle.en || {});
            return;
        }
        Object.entries(bundle).forEach(([key, entry]) => {
            const normalized = normalizeEntry(key, entry);
            dict.zh[key] = normalized.zh;
            dict.en[key] = normalized.en;
        });
    }

    function t(key){
        const current = lang();
        return dict[current]?.[key] || dict[DEFAULT_LANG]?.[key] || key;
    }

    function apply(root=document){
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', t(el.dataset.i18nTitle));
        });
        root.documentElement?.setAttribute('lang', lang() === 'en' ? 'en' : 'zh-CN');
        window.dispatchEvent(new CustomEvent('studio-lang-change', { detail:{ lang:lang() } }));
    }

    function set(next){
        localStorage.setItem(KEY, next === 'en' ? 'en' : 'zh');
        apply();
    }

    function toggle(){
        set(lang() === 'en' ? 'zh' : 'en');
    }

    function entries(){
        return JSON.parse(JSON.stringify(dict));
    }

    window.StudioI18n = { t, apply, set, toggle, lang, register, entries };
    document.addEventListener('DOMContentLoaded', () => apply());
})();
