(function(){
    function go(page, extra){
        try {
            if(window.parent && window.parent !== window){
                window.parent.postMessage({ type:'studio-nav', page, extra: extra || {} }, window.location.origin);
                return;
            }
        } catch(e) {}
        if(page === 'canvas') location.href = '/static/canvas-list.html';
        if(page === 'script' || page === 'script-ai') location.href = '/static/script-studio.html' + (page === 'script-ai' ? '?mode=ai' : '');
        if(page === 'api-settings') location.href = '/static/api-settings.html';
    }

    document.querySelectorAll('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => go(btn.dataset.go));
    });

    function kindLabel(kind){
        return kind === 'smart' ? '智能画布' : '普通画布';
    }
    function timeLabel(ms){
        const n = Number(ms || 0);
        if(!n) return '';
        try { return new Date(n).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
        catch { return ''; }
    }

    async function loadRecent(){
        const box = document.getElementById('recentList');
        try {
            const data = await fetch('/api/canvases').then(r => r.json());
            const list = (data.canvases || [])
                .filter(c => !c.deleted)
                .sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))
                .slice(0, 8);
            if(!list.length){
                box.innerHTML = '<div class="home-empty">还没有画布。从上面三个入口任选一个开始。</div>';
                return;
            }
            box.innerHTML = list.map(c => `
                <button class="home-recent-card" type="button" data-open="${c.id}" data-project="${c.project || 'default'}">
                    <span class="home-recent-kind">${kindLabel(c.kind)}</span>
                    <strong>${escapeHtml(c.title || '未命名画布')}</strong>
                    <small>${timeLabel(c.updated_at || c.created_at)}</small>
                </button>
            `).join('');
            box.querySelectorAll('[data-open]').forEach(btn => {
                btn.addEventListener('click', () => {
                    go('canvas', { href:`/static/canvas.html?id=${encodeURIComponent(btn.dataset.open)}&project=${encodeURIComponent(btn.dataset.project || 'default')}&v=2026.08.28.ui1` });
                });
            });
        } catch(e) {
            box.innerHTML = '<div class="home-empty">暂时读不到画布列表，确认本地服务已启动。</div>';
        }
    }

    async function loadProviders(){
        const el = document.getElementById('connectStatus');
        const copy = document.getElementById('connectCopy');
        try {
            const data = await fetch('/api/providers').then(r => r.json());
            const providers = data.providers || [];
            const ready = providers.some(p => p.has_key && ((p.image_models || []).length || (p.video_models || []).length || (p.chat_models || []).length));
            if(ready){
                el.classList.add('is-ok');
                copy.textContent = `已连接 ${providers.filter(p => p.has_key).length} 个服务。生成节点会使用你保存的模型。`;
                el.querySelector('button').textContent = '管理连接';
            }
        } catch(e) {}
    }

    function escapeHtml(s){
        return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    if(window.lucide) lucide.createIcons();
    loadRecent();
    loadProviders();
})();
