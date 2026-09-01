(function(){
    const studio = document.getElementById('studio');
    const ideaInput = document.getElementById('ideaInput');
    const scriptInput = document.getElementById('scriptInput');
    const titleInput = document.getElementById('titleInput');
    const styleSelect = document.getElementById('styleSelect');
    const aspectSelect = document.getElementById('aspectSelect');
    const statusEl = document.getElementById('status');
    const summaryEl = document.getElementById('summary');
    const parseBtn = document.getElementById('parseBtn');
    const draftBtn = document.getElementById('draftBtn');
    const createBtn = document.getElementById('createBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    let plan = emptyPlan();

    function emptyPlan(){
        return { title:'', characters:[], scenes:[], shots:[], style:'2d', aspect:'9:16', includeStage:true };
    }
    function setStatus(text, isError){
        statusEl.textContent = text || '';
        statusEl.classList.toggle('error', Boolean(isError));
    }
    function escapeHtml(s){
        return String(s || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }
    function addNamed(list, name, notes){
        const n = String(name || '').replace(/[【】\[\]（）()]/g, '').trim();
        if(!n) return;
        if(!list.some(item => item.name === n)) list.push({ name:n, notes:String(notes || '').trim() });
    }
    function looksLikeName(name){
        return /^(旁白|OS|VO|V\.O\.|画外音|字幕|标题|注|说明|镜头|特写|全景|内景|外景)$/i.test(name);
    }

    const SEED_PLAN_STORAGE_KEY = 'canvasLab.seedPlan';
    // Chinese screenplays commonly number scenes with ``第一场``/``第二镜``
    // rather than Arabic digits.  Keep both forms in one expression so the
    // local fallback draft is split into separate shots just like imported
    // scripts.
    const CHINESE_SCENE_NUMBER = '[零〇一二两三四五六七八九十百千万]+';
    const SHOT_HEADING_RE = new RegExp(
        `^(?:第?\\s*(?:\\d+|${CHINESE_SCENE_NUMBER})\\s*[场镜集]|分镜\\s*(?:\\d+|${CHINESE_SCENE_NUMBER})|SHOT\\s*\\d+|INT\\.|EXT\\.|内景|外景)`,
        'i'
    );
    const SHOT_SCENE_PREFIX_RE = new RegExp(
        // Consume the optional separator as part of the prefix.  Without
        // this, a heading such as “第一场：雨夜” was surfaced as a scene named
        // “：雨夜”, which then polluted the generated canvas metadata.
        `^(?:第?\\s*(?:\\d+|${CHINESE_SCENE_NUMBER})\\s*[场镜集]|分镜\\s*(?:\\d+|${CHINESE_SCENE_NUMBER})|SHOT\\s*\\d+)\\s*(?:[:：\\-–—]\\s*)?`,
        'i'
    );

    function addSceneNames(value, list){
        // Scene declarations often contain a compact list (e.g. “室内、
        // 走廊 / 夜景”).  Split only on list separators; spaces are retained
        // because they are meaningful in headings such as “INT. OLD STATION”.
        String(value || '')
            .split(/[、,，/|；;]+/)
            .map(item => item.trim())
            .filter(Boolean)
            .forEach(item => addNamed(list, item));
    }

    /**
     * Read the active selects without making the parser depend on a mounted
     * document.  The optional options argument is useful for smoke tests and
     * for callers that want to parse text before the controls have mounted.
     */
    function parseScript(text, options){
        const next = emptyPlan();
        const opts = options && typeof options === 'object' ? options : {};
        next.style = opts.style || styleSelect?.value || next.style;
        next.aspect = opts.aspect || aspectSelect?.value || next.aspect;
        const raw = String(text || '').replace(/\r\n/g, '\n').trim();
        if(!raw) return next;
        const lines = raw.split('\n');
        let current = null;
        let shotIndex = 0;
        const firstLine = lines.find(line => line.trim()) || '';
        if(firstLine.length <= 24 && !/[：:]/.test(firstLine)) next.title = firstLine.trim();

        const startShot = (title, extra='') => {
            if(current && current.text.trim()) next.shots.push(current);
            shotIndex += 1;
            current = { title: String(title || `分镜 ${shotIndex}`).slice(0, 40), text: extra };
        };

        for(const line of lines){
            const t = line.trim();
            if(!t) continue;
            let m;
            if((m = t.match(/^(?:标题|剧名)[：:]\s*(.+)$/))){
                next.title = m[1].trim();
                continue;
            }
            if((m = t.match(/^(?:角色|人物|出场人物)[：:]\s*(.+)$/))){
                m[1].split(/[、,，/|；;\s]+/).forEach(name => addNamed(next.characters, name));
                continue;
            }
            if((m = t.match(/^(?:场景|地点|场景名)[：:]\s*(.+)$/))){
                addSceneNames(m[1], next.scenes);
                continue;
            }
            if(SHOT_HEADING_RE.test(t)){
                startShot(t);
                const sceneBit = t.replace(SHOT_SCENE_PREFIX_RE, '').trim();
                if(sceneBit && sceneBit.length < 80) addSceneNames(sceneBit, next.scenes);
                continue;
            }
            if((m = t.match(/^【([^】]{1,16})】/))){
                addNamed(next.characters, m[1]);
                if(!current) startShot(`分镜 ${shotIndex + 1}`);
                current.text += (current.text ? '\n' : '') + t;
                continue;
            }
            // Dialogue lines do not require a space after the colon.  Chinese
            // scripts conventionally use ``张三：台词`` while imported
            // Fountain/Markdown files often use ``张三:台词``.
            if((m = t.match(/^([\u4e00-\u9fffA-Za-z0-9·]{1,12})[：:]\s*(.+)$/))){
                if(!looksLikeName(m[1])) addNamed(next.characters, m[1]);
                if(!current) startShot(`分镜 ${shotIndex + 1}`);
                current.text += (current.text ? '\n' : '') + t;
                continue;
            }
            if(!current) startShot(next.title || '开场');
            current.text += (current.text ? '\n' : '') + t;
        }
        if(current && current.text.trim()) next.shots.push(current);
        if(!next.characters.length) addNamed(next.characters, '主角', '从剧本自动补的角色卡');
        if(!next.scenes.length) addNamed(next.scenes, '主场景', '从剧本自动补的场景卡');
        if(!next.shots.length) next.shots.push({ title: next.title || '第一镜', text: raw.slice(0, 800) });
        if(!next.title) next.title = (next.characters[0]?.name || '短剧') + ' · ' + (next.scenes[0]?.name || '片场');
        return next;
    }

    function localDraft(idea){
        const seed = String(idea || '').trim() || '雨夜客栈里的一次对峙';
        const script = `${seed}

角色：主角、对手、旁观者
场景：主场景、转场过道

第一场 主场景
主角：我来了。今晚必须把这件事说清楚。
对手：说清楚？你以为这还是白天那套规矩。
旁白：灯火一晃，两个人都没有再往后退。

第二场 转场过道
主角：你先走。我殿后。
对手：别回头。`;
        return script;
    }

    function renderPlan(next){
        plan = next;
        const chips = (list) => list.length
            ? `<div class="chips">${list.map(item => `<span class="chip">${escapeHtml(item.name)}</span>`).join('')}</div>`
            : '<div class="empty">无</div>';
        const shots = (plan.shots || []).slice(0, 12).map((shot, i) => `
            <div class="shot">
                <b>${i + 1}. ${escapeHtml(shot.title || '分镜')}</b>
                <p>${escapeHtml((shot.text || '').slice(0, 180))}</p>
            </div>
        `).join('');
        summaryEl.innerHTML = `
            <div class="group"><h3>角色 ${plan.characters.length}</h3>${chips(plan.characters)}</div>
            <div class="group"><h3>场景 ${plan.scenes.length}</h3>${chips(plan.scenes)}</div>
            <div class="group"><h3>分镜 ${plan.shots.length}</h3>${shots || '<div class="empty">无</div>'}</div>
        `;
    }

    function setMode(mode){
        studio.dataset.mode = mode;
        document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
        draftBtn.hidden = mode !== 'ai';
        document.getElementById('pageTitle').textContent = mode === 'ai' ? '一句话写剧本' : '从剧本开始';
        document.getElementById('pageLead').textContent = mode === 'ai'
            ? '先写一句点子。有聊天模型就用模型写剧本，没有就生一份可改的本地草稿。'
            : '粘贴或上传剧本文本。系统会拆出角色、场景和分镜，再生成一张可编辑的画布。';
    }

    async function pickChatProvider(){
        try {
            const data = await fetch('/api/providers').then(r => r.json());
            const providers = data.providers || [];
            return providers.find(p => p.has_key && (p.chat_models || []).length) || null;
        } catch(e) { return null; }
    }

    async function draftWithModel(idea){
        const provider = await pickChatProvider();
        if(!provider){
            scriptInput.value = localDraft(idea);
            renderPlan(parseScript(scriptInput.value));
            setStatus('未配置聊天模型，已生成本地草稿。可继续改字再拆解。');
            return;
        }
        setStatus('正在用已连接的聊天模型写剧本…');
        const res = await fetch('/api/chat', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({
                message: `根据这个点子写一部短剧剧本，300到800字，中文。包含标题、角色表、场景，以及至少两场对白。点子：${idea}`,
                mode: 'chat',
                provider: provider.id,
                model: (provider.chat_models || [])[0] || '',
                system_prompt: '你是短剧编剧。只输出剧本正文，不要解释。'
            })
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok) throw new Error(data.detail || '模型写剧本失败');
        const text = (data.message && data.message.content) || data.reply || data.content || data.text || '';
        if(!String(text).trim()) throw new Error('模型没有返回剧本');
        scriptInput.value = String(text).trim();
        renderPlan(parseScript(scriptInput.value));
        setStatus('草稿已写入左侧，可继续改再生成画布。');
    }

    function navigateToCanvas(id, project){
        const href = `/static/canvas.html?id=${encodeURIComponent(id)}&project=${encodeURIComponent(project || 'default')}&v=2026.08.28.ui1`;
        try {
            if(window.parent && window.parent !== window){
                window.parent.postMessage({ type:'studio-nav', page:'canvas', extra:{ href } }, window.location.origin);
                return;
            }
        } catch(e) {}
        location.href = href;
    }

    /**
     * Storage is optional in desktop browsers (private windows, blocked
     * storage, and quota exhaustion can all throw SecurityError/QuotaError).
     * Returning a boolean keeps the caller on the happy path instead of
     * treating a non-critical hand-off failure as a failed canvas creation.
     */
    function safeSessionStorageSet(key, value){
        try {
            const storage = (typeof window !== 'undefined' && window.sessionStorage) || null;
            if(!storage || typeof storage.setItem !== 'function') return false;
            storage.setItem(String(key), value == null ? '' : String(value));
            return true;
        } catch(e) {
            return false;
        }
    }

    function saveSeedPlan(payload){
        try {
            return safeSessionStorageSet(SEED_PLAN_STORAGE_KEY, JSON.stringify(payload));
        } catch(e) {
            // JSON can fail for a caller-supplied cyclic object.  The canvas
            // itself is still valid, so preserve the same non-fatal contract.
            return false;
        }
    }

    async function createCanvasFromPlan(){
        const source = scriptInput.value.trim();
        if(source) renderPlan(parseScript(source));
        if(!plan.shots.length) throw new Error('先拆解或写一份剧本');
        const title = titleInput.value.trim() || plan.title || '短剧画布';
        const payload = {
            ...plan,
            title,
            style: styleSelect.value,
            aspect: aspectSelect.value,
            script: source,
            includeStage: true
        };
        setStatus('正在创建画布…');
        const res = await fetch('/api/canvases', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ title, icon:'🎬', kind:'classic', project:'default' })
        });
        const data = await res.json().catch(() => ({}));
        if(!res.ok || !data.canvas) throw new Error(data.detail || '创建画布失败');
        const handedOff = saveSeedPlan(payload);
        if(!handedOff){
            setStatus('画布已创建；浏览器暂不允许临时保存剧本，已直接打开画布。', false);
        }
        navigateToCanvas(data.canvas.id, data.canvas.project || 'default');
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if(!file) return;
        try {
            // File.text() can reject for a removed/locked file in desktop
            // shells.  Keep that rejection inside the chooser boundary so a
            // failed import never surfaces as an unhandled promise.
            const text = await file.text();
            scriptInput.value = text;
            renderPlan(parseScript(text));
            if(!titleInput.value) titleInput.value = file.name.replace(/\.[^.]+$/, '');
            setStatus(`已读入 ${file.name}`);
        } catch(err) {
            setStatus(err?.message || '读取剧本文件失败', true);
        } finally {
            fileInput.value = '';
        }
    });
    parseBtn.addEventListener('click', () => {
        renderPlan(parseScript(scriptInput.value));
        setStatus(plan.shots.length ? `已拆出 ${plan.characters.length} 个角色、${plan.scenes.length} 个场景、${plan.shots.length} 个分镜` : '没有拆出内容');
    });
    draftBtn.addEventListener('click', async () => {
        draftBtn.disabled = true;
        try { await draftWithModel(ideaInput.value); }
        catch(err){ setStatus(err.message || String(err), true); }
        finally { draftBtn.disabled = false; }
    });
    createBtn.addEventListener('click', async () => {
        createBtn.disabled = true;
        try { await createCanvasFromPlan(); }
        catch(err){ setStatus(err.message || String(err), true); createBtn.disabled = false; }
    });

    const params = new URLSearchParams(location.search);
    if(params.get('mode') === 'ai') setMode('ai');
    if(window.lucide) lucide.createIcons();

    // Keep the parser and storage boundary observable for focused regression
    // tests without exposing mutable application state or event handlers.
    window.CanvasLabScriptStudio = Object.freeze({
        emptyPlan,
        parseScript,
        localDraft,
        safeSessionStorageSet,
        saveSeedPlan
    });
})();
