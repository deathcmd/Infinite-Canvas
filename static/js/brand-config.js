/*
 * Project-owned branding and contact points.
 *
 * Keep this file deliberately small and provider-neutral: a published build
 * can replace the values below without touching page templates or runtime
 * logic.  No upstream author's identity or contact channel is bundled here.
 */
(function (root) {
    const configured = root.CanvasBrandConfig || {};
    const defaults = {
        appName: '画布实验室',
        shortName: 'CL',
        maintainerName: 'deathcmd',
        maintainerTagline: '开源维护者 · 本地优先',
        contactTitle: '联系我',
        contactIntro: '项目由维护者独立维护。欢迎反馈体验问题、提交改进建议或参与共建。',
        // These are the project maintainer's public contact points.  Keep
        // private keys, local paths, and session URLs out of this file.
        contacts: [
            {
                id: 'email',
                label: '联系邮箱',
                value: '2734891913@qq.com',
                href: 'mailto:2734891913@qq.com',
                icon: 'mail'
            },
            {
                id: 'x',
                label: 'X',
                value: 'x.com/deathcmd527',
                href: 'https://x.com/deathcmd527',
                icon: 'globe'
            }
        ],
        repositoryUrl: 'https://github.com/deathcmd/Infinite-Canvas',
        issueUrl: 'https://github.com/deathcmd/Infinite-Canvas/issues'
    };
    const merge = (base, extra) => ({ ...base, ...(extra || {}) });
    const contacts = Array.isArray(configured.contacts)
        ? configured.contacts.filter(item => item && (item.label || item.value)).map(item => ({
            id: String(item.id || item.label || 'contact').slice(0, 40),
            label: String(item.label || '').slice(0, 80),
            value: String(item.value || '').slice(0, 240),
            href: String(item.href || '').trim(),
            icon: String(item.icon || 'link').slice(0, 32)
        }))
        : defaults.contacts;
    root.CanvasBrand = Object.freeze({
        ...merge(defaults, configured),
        contacts
    });
})(window);
