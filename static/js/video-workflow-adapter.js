(function (root) {
    const MARK = '【视频工作流】';
    const Schema = () => root.VideoWorkflowSchema;

    function mediaKind(item) {
        const kind = String(item?.kind || '').toLowerCase();
        if (kind === 'video' || kind === 'audio' || kind === 'image') return kind;
        const url = String(item?.url || item || '');
        if (/\.(mp4|webm|mov|m4v|avi|mkv)(\?|#|$)/i.test(url)) return 'video';
        if (/\.(mp3|wav|flac|aac|ogg|m4a)(\?|#|$)/i.test(url)) return 'audio';
        return 'image';
    }

    function asRef(item, kind) {
        if (!item) return null;
        if (typeof item === 'string') return item ? { url: item, kind: kind || mediaKind(item), name: '' } : null;
        const url = item.url || '';
        if (!url) return null;
        return { ...item, url, kind: kind || mediaKind(item), name: item.name || '' };
    }

    function uniquePush(list, item, limit, leftover, leftoverKey) {
        if (!item?.url) return false;
        if (list.some(existing => (existing.url || existing) === item.url)) return false;
        if (limit && list.length >= limit) {
            leftover[leftoverKey || 'overflow'] = leftover[leftoverKey || 'overflow'] || [];
            leftover[leftoverKey || 'overflow'].push({ url: item.url, name: item.name || '', kind: item.kind || '' });
            leftover.truncated = true;
            leftover.degraded = leftover.degraded || [];
            leftover.degraded.push(`${leftoverKey || 'media'} 超出上限，已只写进提示词预览`);
            return false;
        }
        list.push(item);
        return true;
    }

    function formatSegments(segments) {
        return (segments || [])
            .filter(seg => String(seg.text || '').trim())
            .map(seg => `[${Number(seg.start || 0)}s-${Number(seg.end || 0)}s] ${String(seg.text).trim()}`)
            .join('\n');
    }

    function overlap(seg, redo) {
        const a0 = Number(seg.start || 0);
        const a1 = Number(seg.end || 0);
        const b0 = Number(redo.start || 0);
        const b1 = Number(redo.end || 0);
        return a1 > b0 && b1 > a0;
    }

    function expandMentions(prompt, assets) {
        const cards = Array.isArray(assets) ? assets : [];
        if (!cards.length) return { prompt: String(prompt || ''), used: [] };
        const used = [];
        const next = String(prompt || '').replace(/@([^\s@]+)/g, (match, name) => {
            const card = cards.find(item => String(item.name || '').trim() === name);
            if (!card) return match;
            used.push(card);
            const kind = card.kind || 'character';
            const notes = String(card.notes || '').trim();
            return notes ? `${card.name}（${kind}：${notes}）` : `${card.name}（${kind}）`;
        });
        return { prompt: next, used };
    }

    function roleForPurpose(purpose) {
        const value = String(purpose || '').toLowerCase();
        if (value === 'first_frame' || value === 'last_frame' || value === 'mask') return value;
        if (value === 'background' || value === 'reference' || value === 'layout') return 'reference_image';
        return '';
    }

    function extractLastFrame(url) {
        return new Promise(resolve => {
            const src = String(url || '');
            if (!src) return resolve('');
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            let settled = false;
            const done = value => {
                if (settled) return;
                settled = true;
                resolve(value || '');
            };
            const timer = setTimeout(() => done(''), 4000);
            video.onerror = () => { clearTimeout(timer); done(''); };
            video.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 1280;
                    canvas.height = video.videoHeight || 720;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    clearTimeout(timer);
                    done(canvas.toDataURL('image/png'));
                } catch (err) {
                    clearTimeout(timer);
                    done('');
                }
            };
            video.onloadeddata = () => {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                const target = Math.max(0, duration - 0.04);
                if (Math.abs((video.currentTime || 0) - target) < 0.01) {
                    video.onseeked();
                    return;
                }
                try { video.currentTime = target; } catch (err) { done(''); }
            };
            video.src = src;
            video.load();
        });
    }

    function splitRefs(refs) {
        const list = (refs || []).map(item => asRef(item)).filter(Boolean);
        return {
            images: list.filter(item => mediaKind(item) === 'image'),
            videos: list.filter(item => mediaKind(item) === 'video'),
            audios: list.filter(item => mediaKind(item) === 'audio')
        };
    }

    function toUrlList(items) {
        return (items || []).map(item => (typeof item === 'string' ? item : item?.url)).filter(Boolean);
    }

    function appendNote(notes, line) {
        const text = String(line || '').trim();
        if (text && !notes.includes(text)) notes.push(text);
    }

    function alreadyPacked(prompt) {
        return String(prompt || '').includes(MARK);
    }

    function resultOf({ prompt, images, videos, audios, leftover, returnLastFrame, useFrameRoles, workflow, refs }) {
        const videoUrls = toUrlList(videos);
        const audioUrls = toUrlList(audios);
        return {
            prompt,
            refs: refs || [...images, ...(Array.isArray(videos) ? videos : []), ...(Array.isArray(audios) ? audios : [])],
            images,
            videos: videoUrls,
            audios: audioUrls,
            leftover: leftover || {},
            returnLastFrame: Boolean(returnLastFrame),
            useFrameRoles: Boolean(useFrameRoles),
            workflow,
            payload: {
                prompt,
                images,
                videos: videoUrls,
                audios: audioUrls,
                return_last_frame: Boolean(returnLastFrame)
            }
        };
    }

    async function apply(options) {
        const schema = Schema();
        const workflow = schema.normalize(options.workflow || schema.emptyWorkflow());
        const limits = workflow.refLimits || schema.LIMITS;
        const leftover = {};
        const notes = [];
        const images = [];
        const videos = [];
        const audios = [];
        let returnLastFrame = Boolean(options.returnLastFrame);
        let useFrameRoles = Boolean(options.useFrameRoles);

        const pushByKind = (item, kind) => {
            const next = { ...item, kind: kind || mediaKind(item), _vw: true };
            if (next.kind === 'video') uniquePush(videos, next, limits.video, leftover, 'overflowVideos');
            else if (next.kind === 'audio') uniquePush(audios, next, limits.audio, leftover, 'overflowAudios');
            else uniquePush(images, next, limits.image, leftover, 'overflowImages');
        };

        // Normalize every incoming reference through the same purpose-aware
        // path.  The previous implementation copied options.refs directly,
        // which bypassed refLimits and accidentally sent motion-only videos
        // as content references.  A user-provided reference and a reference
        // added in the workflow now have identical semantics.
        const consumeRef = (raw, source) => {
            const ref = asRef(raw);
            if (!ref?.url) return;
            // `purposeRaw` preserves extension/provider-specific values that
            // the schema cannot render as one of the built-in UI choices.
            // Prefer it here so unknown purposes remain visible in the
            // degraded preview instead of being silently treated as generic
            // references.
            const purpose = String(ref.purposeRaw || ref.purpose || '').trim().toLowerCase();
            const role = ref.role || roleForPurpose(purpose);
            const kind = mediaKind(ref);
            const item = {
                ...ref,
                kind,
                purpose: purpose || ref.purpose,
                role: role || undefined,
                _vw: true
            };
            if (purpose) {
                leftover.refPurposes = leftover.refPurposes || [];
                leftover.refPurposes.push({
                    url: ref.url,
                    purpose,
                    kind,
                    role: role || '',
                    source: source || 'input'
                });
            }
            if (role === 'first_frame' || role === 'last_frame') useFrameRoles = true;
            if (purpose === 'motion') {
                leftover.motionOnly = leftover.motionOnly || [];
                leftover.motionOnly.push({ url: ref.url, name: ref.name || '', kind: kind || 'video' });
                appendNote(notes, '【只参考运镜】视频「' + (ref.name || '') + '」只作运镜和动作参考，不要抄画面内容。');
                return;
            }
            if (purpose === 'composition') {
                leftover.composition = leftover.composition || [];
                leftover.composition.push({ url: ref.url, name: ref.name || '', kind: kind || 'image' });
                appendNote(notes, '【构图参考】「' + (ref.name || '') + '」只参考构图和站位。');
            }
            if (!role && purpose && purpose !== 'reference') {
                appendNote(notes, `参考槽「${ref.name || purpose}」：${purpose}${ref.notes ? `，${ref.notes}` : ''}`);
            }
            pushByKind(item, kind);
        };

        (options.refs || []).forEach(ref => consumeRef(ref, 'input'));

        // A packed prompt already contains the workflow marker and notes. We
        // still normalize/limit its media inputs, but do not append a second
        // marker or replay workflow-only references.
        if (alreadyPacked(options.prompt)) {
            return resultOf({
                prompt: options.prompt,
                images,
                videos,
                audios,
                leftover,
                returnLastFrame,
                useFrameRoles,
                workflow,
                // Keep the packed-prompt fast path from reintroducing a
                // purpose-filtered motion reference through the legacy refs
                // field. Consumers can safely derive refs from the buckets.
                refs: [...images, ...videos, ...audios]
            });
        }

        (workflow.extraRefs || []).forEach(ref => {
            consumeRef(ref, 'workflow');
        });

        if (workflow.greenscreen.enabled) {
            leftover.greenscreen = { enabled: true, degradedTo: 'image_ref' };
            if (workflow.greenscreen.subjectUrl) {
                pushByKind({
                    url: workflow.greenscreen.subjectUrl,
                    name: workflow.greenscreen.subjectName || 'greenscreen-subject',
                    kind: workflow.greenscreen.subjectKind || 'image',
                    role: 'reference_image'
                }, workflow.greenscreen.subjectKind || 'image');
            }
            if (workflow.greenscreen.bgUrl) {
                uniquePush(images, {
                    url: workflow.greenscreen.bgUrl,
                    name: workflow.greenscreen.bgName || 'greenscreen-bg',
                    kind: 'image',
                    purpose: 'background',
                    role: 'reference_image',
                    _vw: true
                }, limits.image, leftover, 'overflowImages');
            }
            if (workflow.greenscreen.subjectUrl || workflow.greenscreen.bgUrl) {
                appendNote(notes, '【绿幕合成】把绿幕主体扣出，替换为提供的背景。');
            } else {
                leftover.greenscreen.degradedTo = 'unused';
            }
        }

        (workflow.assets || []).forEach(asset => {
            if (asset.url) uniquePush(images, { url: asset.url, name: asset.name, kind: 'image', _vw: true }, limits.image, leftover, 'overflowImages');
        });

        // normalizeStage() always supplies one default camera. Do not turn an
        // untouched empty workflow into a misleading stage instruction; only
        // serialize the stage when the user actually changed its contents.
        const stage = workflow.stage;
        const stageHasMeaningfulContent = schema.stageHasContent
            ? schema.stageHasContent(stage)
            : Boolean(stage?.layoutUrl || stage?.cameraMove || stage?.actors?.length || (stage?.cameras || []).length > 1 || stage?.keyframes?.length);
        const stageNote = stageHasMeaningfulContent ? formatStageNote(stage) : '';
        if (stageHasMeaningfulContent && stage?.cameraMove) leftover.cameraMove = stage.cameraMove;
        if (stageHasMeaningfulContent && stage?.layoutUrl) {
            uniquePush(images, {
                url: stage.layoutUrl,
                name: '片场布局',
                kind: 'image',
                purpose: 'layout',
                role: 'reference_image',
                _vw: true
            }, limits.image, leftover, 'overflowImages');
            leftover.stageLayout = stage.layoutUrl;
            leftover.stageActors = stage.actors;
            leftover.stageCamera = stage.camera;
            leftover.stageCameras = stage.cameras;
            leftover.stageScene = stage.scene;
            leftover.stageAspect = stage.aspect;
            leftover.stageDuration = stage.duration;
            leftover.stageFps = stage.fps;
            appendNote(notes, stageNote || '【片场布局】参考图含俯视站位，请按图中相对位置摆放角色和场景。');
        } else if (stageHasMeaningfulContent) {
            leftover.stageActors = stage.actors;
            leftover.stageCamera = stage.camera;
            leftover.stageCameras = stage.cameras;
            leftover.stageScene = stage.scene;
            leftover.stageAspect = stage.aspect;
            leftover.stageDuration = stage.duration;
            leftover.stageFps = stage.fps;
            leftover.cameraMove = leftover.cameraMove || stage.cameraMove;
            leftover.degraded = leftover.degraded || [];
            leftover.degraded.push('片场有站位点但还没导出布局图');
            if (stageNote) appendNote(notes, stageNote);
        }

        const mentionAssets = [...(options.assets || []), ...(workflow.assets || [])];
        const mention = expandMentions(options.prompt || '', mentionAssets);
        mention.used.forEach(asset => {
            if (asset.url) uniquePush(images, { url: asset.url, name: asset.name, kind: 'image', _vw: true }, limits.image, leftover, 'overflowImages');
        });
        let prompt = mention.prompt;
        if (alreadyPacked(prompt)) {
            return resultOf({ prompt, images, videos, audios, leftover, returnLastFrame, useFrameRoles, workflow });
        }

        const segmentText = formatSegments(workflow.segments);
        if (segmentText) {
            leftover.segments = workflow.segments;
            appendNote(notes, `【分段提示】\n${segmentText}`);
        }

        if (workflow.redo.enabled) {
            const hit = (workflow.segments || []).find(seg => overlap(seg, workflow.redo));
            const redoBits = [
                `【局部重做】只重做 ${Number(workflow.redo.start || 0)}s-${Number(workflow.redo.end || 0)}s`,
                hit ? String(hit.text || '').trim() : '',
                String(workflow.redo.prompt || '').trim(),
                workflow.redo.boxes ? `框选：${workflow.redo.boxes}` : ''
            ].filter(Boolean);
            appendNote(notes, redoBits.join('\n'));
            if (workflow.redo.maskUrl) {
                uniquePush(images, {
                    url: workflow.redo.maskUrl,
                    name: workflow.redo.maskName || 'redo-mask',
                    kind: 'image',
                    purpose: 'mask',
                    role: 'mask',
                    _vw: true
                }, limits.image, leftover, 'overflowImages');
            }
            leftover.redo = {
                start: workflow.redo.start,
                end: workflow.redo.end,
                boxes: workflow.redo.boxes,
                prompt: workflow.redo.prompt,
                maskUrl: workflow.redo.maskUrl
            };
        }

        if (workflow.continuePrev.enabled) {
            const prevVideos = (options.previousVideos || []).filter(Boolean);
            leftover.continuePrev = { enabled: true, useLastFrame: workflow.continuePrev.useLastFrame, previous: prevVideos.slice(0, 8) };
            appendNote(notes, '【续接】从上一镜头继续，保持主体和空间连续。');
            if (workflow.continuePrev.useLastFrame && prevVideos[0]) {
                const frame = await extractLastFrame(prevVideos[0]);
                if (frame) {
                    uniquePush(images, {
                        url: frame,
                        name: 'prev-last-frame.png',
                        kind: 'image',
                        role: 'first_frame',
                        purpose: 'first_frame',
                        _vw: true
                    }, limits.image, leftover, 'overflowImages');
                    useFrameRoles = true;
                    leftover.continuePrev.degradedTo = 'first_frame_image';
                } else {
                    uniquePush(videos, { url: prevVideos[0], name: 'prev-shot', kind: 'video', _vw: true }, limits.video, leftover, 'overflowVideos');
                    leftover.continuePrev.degradedTo = 'video_ref';
                }
                returnLastFrame = true;
            } else {
                prevVideos.slice(0, Math.max(0, limits.video)).forEach((url, i) => {
                    uniquePush(videos, { url, name: `prev-shot-${i + 1}`, kind: 'video', _vw: true }, limits.video, leftover, 'overflowVideos');
                });
                leftover.continuePrev.degradedTo = 'video_ref';
            }
        }

        if ((workflow.audioTracks || []).length) {
            leftover.audioTracks = workflow.audioTracks;
            (workflow.audioTracks || []).forEach(track => {
                const label = track.kind === 'adr' ? '对白' : (track.kind === 'bgm' ? 'BGM' : '音效');
                appendNote(notes, `【音轨 ${label}】${String(track.text || '').trim() || track.url || ''}`);
                if (track.url) pushByKind({ url: track.url, name: track.name || label, kind: 'audio' }, 'audio');
            });
        }
        if (options.node && (Number(options.node.clipIn) || Number(options.node.clipOut))) {
            leftover.clip = { start: options.node.clipIn || 0, end: options.node.clipOut || 0 };
            appendNote(notes, '【裁取】只要 ' + leftover.clip.start + 's 到 ' + leftover.clip.end + 's。');
        }
        if (workflow.audioSplit) {
            leftover.audioSplit = true;
            appendNote(notes, '【音频分离】对人声 / 音效 / BGM 分轨处理。');
        }
        if (workflow.analyze) {
            leftover.analyze = workflow.analyze;
            appendNote(notes, workflow.analyze === 'breakdown' ? '【拉片】按镜头拆解运镜、站位和表演。' : '【解析】读出镜头语言和动作要点。');
        }
        leftover.engines = workflow.engines;
        const engineBits = Object.entries(workflow.engines || {})
            .filter(([, eng]) => eng && eng.provider)
            .map(([slot, eng]) => slot + '=' + eng.provider + (eng.model ? '/' + eng.model : ''));
        if (engineBits.length) appendNote(notes, '【模型位】' + engineBits.join('，'));
        leftover.notes = notes;
        if (notes.length) prompt = [prompt, `${MARK}\n${notes.join('\n')}`].filter(Boolean).join('\n\n');

        return resultOf({ prompt, images, videos, audios, leftover, returnLastFrame, useFrameRoles, workflow });
    }

    function previewBody(basePayload, leftover) {
        const sent = JSON.parse(JSON.stringify(basePayload || {}));
        return {
            sent,
            unused: leftover && Object.keys(leftover).length ? leftover : {}
        };
    }

    function collectCanvasPreviousVideos(node, nodes, connections, helpers) {
        if (!node || !Array.isArray(connections)) return [];
        const urls = [];
        connections.filter(conn => conn.to === node.id).forEach(conn => {
            const from = (nodes || []).find(item => item.id === conn.from);
            if (!from) return;
            if (from.type === 'image' && helpers?.mediaKindForNode?.(from) === 'video' && from.url) urls.push(from.url);
            if (from.type === 'video') {
                const last = helpers?.lastVideoUrl?.(from);
                if (last) urls.push(last);
            }
            const generated = helpers?.generatedImageRefs?.(from) || [];
            generated.forEach(ref => {
                if ((ref.kind || mediaKind(ref)) === 'video' && ref.url) urls.push(ref.url);
            });
            (from.images || []).forEach(item => {
                const url = helpers?.outputUrlValue?.(item) || item?.url;
                if (url && mediaKind({ url, kind: item?.kind }) === 'video') urls.push(url);
            });
        });
        return [...new Set(urls.filter(Boolean))];
    }

    function collectSmartPreviousVideos(node, nodes, connections, helpers) {
        if (!node || !Array.isArray(connections)) return [];
        const urls = [];
        connections.filter(conn => conn.to === node.id).forEach(conn => {
            const from = (nodes || []).find(item => item.id === conn.from);
            (from?.images || []).forEach(img => {
                if (helpers?.mediaKindForItem?.(img) === 'video' && img.url) urls.push(img.url);
                else if (mediaKind(img) === 'video' && img.url) urls.push(img.url);
            });
        });
        return [...new Set(urls.filter(Boolean))];
    }

    function collectCanvasAssets(nodes) {
        return (nodes || [])
            .filter(node => node?.type === 'assetCard')
            .map(node => ({
                id: node.id,
                kind: node.assetKind || node.kind || 'character',
                name: node.name || node.assetName || '',
                notes: node.notes || node.text || '',
                url: node.url || '',
                /* Keep scene-card metadata when it is passed into a video
                   workflow.  Dropping `panorama` here made a checked
                   panorama look like an ordinary scene and the panel then
                   attempted to place it as an actor.  Optional prop fields
                   are preserved for the same reason. */
                panorama: Boolean(node.panorama) || node.assetKind === 'panorama' || node.kind === 'panorama',
                ...(node.primitive ? { primitive: node.primitive } : {}),
                ...(node.material ? { material: node.material } : {})
            }))
            .filter(item => item.name);
    }

    function actionLabel(action) {
        if (root.VideoWorkflowSchema?.actionLabel) return root.VideoWorkflowSchema.actionLabel(action);
        return String(action || '站立等待');
    }

    function stagePad(width, height) {
        return {
            x: Math.max(18, Math.round(width * 0.06)),
            y: Math.max(22, Math.round(height * 0.1))
        };
    }

    function stageToXY(width, height, nx, ny) {
        const pad = stagePad(width, height);
        return {
            x: pad.x + Number(nx || 0) * (width - pad.x * 2),
            y: pad.y + Number(ny || 0) * (height - pad.y * 2)
        };
    }

    function eventToStage(canvas, ev) {
        const rect = canvas.getBoundingClientRect();
        const pad = stagePad(canvas.width, canvas.height);
        const cx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
        const cy = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
        const nx = (cx - pad.x) / Math.max(1, canvas.width - pad.x * 2);
        const ny = (cy - pad.y) / Math.max(1, canvas.height - pad.y * 2);
        return {
            cx,
            cy,
            nx: Math.max(0, Math.min(1, nx)),
            ny: Math.max(0, Math.min(1, ny))
        };
    }

    function facingVec(facing, len) {
        const rad = Number(facing || 0) * Math.PI / 180;
        return { dx: Math.sin(rad) * len, dy: -Math.cos(rad) * len };
    }

    function facingFromDelta(dx, dy) {
        let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
        if (deg < 0) deg += 360;
        return deg;
    }

    function formatStageNote(stage) {
        const schema = Schema();
        const actors = stage?.actors || [];
        if (!actors.length && !(stage?.cameras || []).length) return '';
        const pct = value => Math.round(Number(value || 0) * 100);
        const lines = [`【片场布局】${stage?.aspect || '21:9'} 俯视站位，坐标为舞台左右/上下百分比，0°朝北（画面上方）。`];
        actors.forEach((actor, index) => {
            const name = actor.name || `角色${index + 1}`;
            const poseBit = schema?.poseMoved?.(actor.pose) ? ' 已调姿势(头/双手/双脚)' : '';
            lines.push(`${name}：位置(${pct(actor.x)},${pct(actor.y)}) 面向${Math.round(Number(actor.facing || 0))}° 动作${actionLabel(actor.action)}${poseBit}`);
        });
        (stage?.cameras || (stage?.camera ? [stage.camera] : [])).forEach((cam, index) => {
            const name = cam.name || `机位${index + 1}`;
            const kind = schema?.camPresetLabel?.(cam.kind) || cam.kind || '正面中景';
            lines.push(`${name}：位置(${pct(cam.x)},${pct(cam.y)}) 朝向${Math.round(Number(cam.facing || 0))}° 类型${kind}`);
        });
        {
            const move = schema?.cameraMoveLabel?.(stage?.cameraMove) || '固定镜头';
            const moveId = schema?.moveOf?.(stage?.cameraMove) || '';
            lines.push(`camera.move=${moveId || 'static'}（${move}）`);
        }
        return lines.join('\n');
    }

    const bgCache = new Map();
    function stageBgImage(url, onReady) {
        const src = String(url || '');
        if (!src) return null;
        const hit = bgCache.get(src);
        if (hit) return hit;
        const img = new Image();
        img.onload = () => { if (typeof onReady === 'function') onReady(); };
        img.onerror = () => bgCache.delete(src);
        img.src = src;
        bgCache.set(src, img);
        return img;
    }

    function mannequinSize(actor, compact) {
        return (compact ? 34 : 52) * Math.max(0.4, Math.min(2.4, Number(actor?.scale || 1)));
    }

    function posePoint(actor, key, width, height, compact) {
        const schema = Schema();
        const origin = stageToXY(width, height, actor.x, actor.y);
        const pose = schema?.normalizePose ? schema.normalizePose(actor.pose) : (actor.pose || {});
        const pt = pose[key] || { x: 0, y: 0 };
        const size = mannequinSize(actor, compact);
        let x = Number(pt.x || 0);
        let y = Number(pt.y || 0);
        const pitch = Number(actor.bodyPitch || 0);
        const yaw = Number(actor.bodyYaw || 0);
        const roll = Number(actor.bodyRoll || 0);
        const hp = Number(actor.headPitch || 0);
        const hy = Number(actor.headYaw || 0);
        if (key === 'head') {
            y += hp * 0.06 - pitch * 0.03;
            x += hy * 0.08 + yaw * 0.03;
        } else if (key === 'handL' || key === 'footL') {
            x -= roll * 0.04;
            y += pitch * (key.startsWith('foot') ? 0.03 : -0.02);
        } else if (key === 'handR' || key === 'footR') {
            x += roll * 0.04;
            y += pitch * (key.startsWith('foot') ? 0.03 : -0.02);
        }
        return {
            x: origin.x + x * size * 5,
            y: origin.y + y * size * 5
        };
    }

    function poseFromPoint(actor, key, canvas, ev) {
        const schema = Schema();
        const point = eventToStage(canvas, ev);
        const origin = stageToXY(canvas.width, canvas.height, actor.x, actor.y);
        const size = Math.max(1, mannequinSize(actor, true) * 5);
        const pose = schema?.normalizePose ? schema.normalizePose(actor.pose) : (actor.pose || {});
        pose[key] = {
            x: Math.max(-0.35, Math.min(0.35, (point.cx - origin.x) / size)),
            y: Math.max(-0.35, Math.min(0.35, (point.cy - origin.y) / size))
        };
        actor.pose = pose;
        return pose;
    }

    function drawArrow(ctx, x, y, facing, length, color) {
        const vec = facingVec(facing, length);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + vec.dx, y + vec.dy);
        ctx.stroke();
        const tip = facingVec(facing, length);
        const left = facingVec(Number(facing || 0) + 150, 7);
        const right = facingVec(Number(facing || 0) - 150, 7);
        ctx.beginPath();
        ctx.moveTo(x + tip.dx, y + tip.dy);
        ctx.lineTo(x + tip.dx + left.dx, y + tip.dy + left.dy);
        ctx.lineTo(x + tip.dx + right.dx, y + tip.dy + right.dy);
        ctx.closePath();
        ctx.fill();
    }

    function paintFloor(ctx, stage, width, height, compact, onReady) {
        const scene = stage?.scene || {};
        const pad = stagePad(width, height);
        const ox = Number(scene.tx || 0) * (compact ? 18 : 28);
        const oy = Number(scene.ty || 0) * (compact ? 14 : 22);
        const sc = Math.max(0.5, Math.min(2.2, Number(scene.scale || 1)));
        const floor = {
            x: pad.x + ox,
            y: pad.y + oy,
            w: (width - pad.x * 2) * sc,
            h: (height - pad.y * 2) * sc
        };
        ctx.fillStyle = scene.bgColor || '#1a1020';
        ctx.fillRect(0, 0, width, height);
        if (scene.bgMode === 'image' && scene.bgUrl) {
            const img = stageBgImage(scene.bgUrl, onReady);
            if (img && img.complete && img.naturalWidth) {
                ctx.drawImage(img, 0, 0, width, height);
                ctx.fillStyle = 'rgba(8,10,18,0.35)';
                ctx.fillRect(0, 0, width, height);
            }
        }
        ctx.fillStyle = 'rgba(17,24,39,0.72)';
        ctx.fillRect(floor.x, floor.y, floor.w, floor.h);
        ctx.strokeStyle = 'rgba(51,65,85,0.9)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 8; i++) {
            const x = floor.x + floor.w * i / 8;
            const y = floor.y + floor.h * i / 8;
            ctx.beginPath();
            ctx.moveTo(x, floor.y);
            ctx.lineTo(x, floor.y + floor.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(floor.x, y);
            ctx.lineTo(floor.x + floor.w, y);
            ctx.stroke();
        }
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.strokeRect(floor.x, floor.y, floor.w, floor.h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = compact ? '12px sans-serif' : '22px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${stage?.aspect || '21:9'} 俯视片场`, pad.x, Math.max(14, pad.y - 8));
        ctx.textAlign = 'center';
        ctx.fillStyle = '#64748b';
        ctx.font = compact ? '11px sans-serif' : '16px sans-serif';
        ctx.fillText('北', width / 2, Math.max(12, pad.y - 6));
        return pad;
    }

    function drawMannequin(ctx, actor, width, height, opts) {
        const compact = Boolean(opts?.compact);
        const selected = Boolean(opts?.selected);
        const showPose = Boolean(opts?.showPose);
        const schema = Schema();
        const origin = stageToXY(width, height, actor.x, actor.y);
        const head = posePoint(actor, 'head', width, height, compact);
        const handL = posePoint(actor, 'handL', width, height, compact);
        const handR = posePoint(actor, 'handR', width, height, compact);
        const footL = posePoint(actor, 'footL', width, height, compact);
        const footR = posePoint(actor, 'footR', width, height, compact);
        const size = mannequinSize(actor, compact);
        const pink = selected ? '#fbcfe8' : '#f9a8d4';
        const line = selected ? '#fb7185' : '#ec4899';
        ctx.strokeStyle = line;
        ctx.fillStyle = pink;
        ctx.lineWidth = compact ? 2.2 : 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(head.x, head.y);
        ctx.lineTo(origin.x, origin.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(handL.x, handL.y);
        ctx.lineTo(origin.x, origin.y - size * 0.12);
        ctx.lineTo(handR.x, handR.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(footL.x, footL.y);
        ctx.lineTo(origin.x, origin.y);
        ctx.lineTo(footR.x, footR.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(head.x, head.y, compact ? 6 : 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        drawArrow(ctx, origin.x, origin.y, actor.facing, compact ? 18 : 26, selected ? '#fda4af' : '#fb7185');
        const name = actor.name || '角色';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff1f2';
        ctx.font = compact ? 'bold 11px sans-serif' : 'bold 16px sans-serif';
        ctx.fillText(name, head.x, head.y - (compact ? 10 : 14));
        ctx.fillStyle = '#fecdd3';
        ctx.font = compact ? '10px sans-serif' : '14px sans-serif';
        ctx.fillText(actionLabel(actor.action), origin.x + size * 0.7, origin.y + 4);
        if (Array.isArray(actor.path) && actor.path.length) {
            ctx.strokeStyle = 'rgba(244,114,182,0.7)';
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            actor.path.forEach((pt, i) => {
                const p = stageToXY(width, height, pt.x, pt.y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (showPose && selected) {
            const dots = [
                { key: 'head', pt: head },
                { key: 'handL', pt: handL },
                { key: 'handR', pt: handR },
                { key: 'footL', pt: footL },
                { key: 'footR', pt: footR }
            ];
            dots.forEach(item => {
                ctx.beginPath();
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#e11d48';
                ctx.lineWidth = 1.5;
                ctx.arc(item.pt.x, item.pt.y, compact ? 4.5 : 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        }
        if (!compact && schema?.poseMoved?.(actor.pose)) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fda4af';
            ctx.font = '12px sans-serif';
            ctx.fillText('姿势已调', origin.x + size * 0.7, origin.y + 20);
        }
    }

    function drawCameraMark(ctx, cam, width, height, opts) {
        const compact = Boolean(opts?.compact);
        const selected = Boolean(opts?.selected);
        const schema = Schema();
        const pos = stageToXY(width, height, cam.x, cam.y);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(Number(cam.facing || 0) * Math.PI / 180);
        ctx.fillStyle = selected ? '#fcd34d' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(0, compact ? -14 : -18);
        ctx.lineTo(compact ? 11 : 14, compact ? 10 : 12);
        ctx.lineTo(compact ? -11 : -14, compact ? 10 : 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#fde68a';
        ctx.font = compact ? '11px sans-serif' : '15px sans-serif';
        ctx.textAlign = 'left';
        const kind = schema?.CAM_PRESET_LABELS?.[cam.kind] || '';
        ctx.fillText(`${cam.name || '机位'} ${kind}`.trim(), pos.x + 16, pos.y + 4);
    }

    function drawCameraMove(ctx, stage, width, height, compact) {
        const move = stage?.cameraMove;
        if (!move) return;
        const actors = stage?.actors || [];
        const cx = actors.length ? actors.reduce((s, a) => s + Number(a.x || 0), 0) / actors.length : 0.5;
        const cy = actors.length ? actors.reduce((s, a) => s + Number(a.y || 0), 0) / actors.length : 0.5;
        const center = stageToXY(width, height, cx, cy);
        const cam = (stage.cameras && stage.cameras[0]) || stage.camera;
        const camPos = cam ? stageToXY(width, height, cam.x, cam.y) : center;
        ctx.save();
        ctx.strokeStyle = 'rgba(251,191,36,0.85)';
        ctx.fillStyle = 'rgba(253,230,138,0.95)';
        ctx.lineWidth = compact ? 1.6 : 2.4;
        ctx.setLineDash([6, 4]);
        const r = compact ? 46 : 70;
        const span = compact ? 50 : 80;
        if (move === 'orbit' || move === 'orbit_360' || move === 'orbit_180') {
            ctx.beginPath();
            ctx.arc(center.x, center.y, r, 0, move === 'orbit_180' ? Math.PI : Math.PI * 2);
            ctx.stroke();
        } else if (move === 'dolly' || move === 'dolly_in' || move === 'dolly_out' || move === 'zoom_in' || move === 'zoom_out' || move === 'follow' || move === 'follow_front') {
            ctx.beginPath();
            ctx.moveTo(camPos.x, camPos.y);
            ctx.lineTo(center.x, center.y);
            ctx.stroke();
        } else if (move === 'truck' || move === 'truck_left' || move === 'truck_right' || move === 'pan_left' || move === 'pan_right' || move === 'follow_side') {
            ctx.beginPath();
            ctx.moveTo(center.x - span, center.y);
            ctx.lineTo(center.x + span, center.y);
            ctx.stroke();
        } else if (move === 'tilt_up' || move === 'tilt_down' || move === 'crane_up' || move === 'crane_down') {
            ctx.beginPath();
            ctx.moveTo(center.x, center.y - span);
            ctx.lineTo(center.x, center.y + span);
            ctx.stroke();
        } else if (move === 'handheld') {
            ctx.beginPath();
            ctx.moveTo(camPos.x - 12, camPos.y);
            ctx.lineTo(camPos.x + 8, camPos.y - 10);
            ctx.lineTo(camPos.x + 14, camPos.y + 8);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = compact ? '10px sans-serif' : '14px sans-serif';
        ctx.textAlign = 'left';
        const label = Schema()?.cameraMoveLabel?.(move) || move;
        ctx.fillText(`camera.move=${label}`, Math.min(width - 180, camPos.x + 8), camPos.y - (compact ? 16 : 22));
        ctx.restore();
    }

    function paintStage(ctx, stage, width, height, opts) {
        const selectedId = opts?.selectedId || '';
        const compact = Boolean(opts?.compact);
        const pad = paintFloor(ctx, stage, width, height, compact, opts?.onReady);
        drawCameraMove(ctx, stage, width, height, compact);

        (stage?.actors || []).forEach(actor => {
            drawMannequin(ctx, actor, width, height, {
                compact,
                selected: actor.id && actor.id === selectedId,
                showPose: Boolean(opts?.showPose !== false)
            });
        });

        const cameras = stage?.cameras?.length ? stage.cameras : (stage?.camera ? [stage.camera] : []);
        cameras.forEach(cam => {
            const selected = selectedId === cam.id || (selectedId === 'camera' && cam === cameras[0]);
            drawCameraMark(ctx, cam, width, height, { compact, selected });
        });

        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = compact ? '10px sans-serif' : '13px sans-serif';
        ctx.fillText('粉模=角色  橙三角=机位  白点=姿势  WASD走位 Q/E远近', pad.x, height - 8);
    }

    function drawStageOnto(canvas, stage, opts) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const next = { compact: true, ...(opts || {}) };
        if (!next._reloaded) {
            next.onReady = () => drawStageOnto(canvas, stage, { ...next, _reloaded: true });
        }
        paintStage(ctx, stage, canvas.width, canvas.height, next);
    }

    function drawStageLayout(stage, width, height) {
        const size = Schema()?.layoutSize?.(stage?.aspect) || { w: 1680, h: 720 };
        const canvas = document.createElement('canvas');
        canvas.width = width || size.w;
        canvas.height = height || size.h;
        const ctx = canvas.getContext('2d');
        paintStage(ctx, stage, canvas.width, canvas.height, { compact: false, showPose: true });
        return canvas.toDataURL('image/png');
    }

    function waitForStageBackground(url, timeoutMs = 5000) {
        const src = String(url || '');
        if (!src) return Promise.resolve(false);
        const img = stageBgImage(src);
        if (!img) return Promise.resolve(false);
        if (img.complete) return Promise.resolve(Boolean(img.naturalWidth));
        return new Promise(resolve => {
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(Boolean(value));
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            img.addEventListener('load', () => finish(true), { once: true });
            img.addEventListener('error', () => finish(false), { once: true });
        });
    }

    async function drawStageLayoutAsync(stage, width, height) {
        if (stage?.scene?.bgMode === 'image' && stage?.scene?.bgUrl) {
            await waitForStageBackground(stage.scene.bgUrl);
        }
        return drawStageLayout(stage, width, height);
    }

    function hitStage(canvas, stage, ev) {
        if (!canvas) return null;
        const point = eventToStage(canvas, ev);
        const hits = [];
        const actorR = 30;
        const tipR = 16;
        const camR = 32;
        const poseR = 10;
        const schema = Schema();
        (stage?.actors || []).forEach(actor => {
            const pos = stageToXY(canvas.width, canvas.height, actor.x, actor.y);
            const vec = facingVec(actor.facing, 22);
            const dist = Math.hypot(pos.x - point.cx, pos.y - point.cy);
            const tipDist = Math.hypot(pos.x + vec.dx - point.cx, pos.y + vec.dy - point.cy);
            if (actor.poseManual !== false) {
                (schema?.POSE_KEYS || []).forEach(key => {
                    const pt = posePoint(actor, key, canvas.width, canvas.height, true);
                    const d = Math.hypot(pt.x - point.cx, pt.y - point.cy);
                    if (d <= poseR) hits.push({ kind: 'pose', id: actor.id, key, dist: d - 4 });
                });
            }
            if (tipDist <= tipR) hits.push({ kind: 'actor-facing', id: actor.id, dist: tipDist });
            if (dist <= actorR) hits.push({ kind: 'actor', id: actor.id, dist });
        });
        const cameras = stage?.cameras?.length ? stage.cameras : (stage?.camera ? [stage.camera] : []);
        cameras.forEach(cam => {
            const pos = stageToXY(canvas.width, canvas.height, cam.x, cam.y);
            const vec = facingVec(cam.facing, 22);
            const dist = Math.hypot(pos.x - point.cx, pos.y - point.cy);
            const tipDist = Math.hypot(pos.x + vec.dx - point.cx, pos.y + vec.dy - point.cy);
            if (tipDist <= tipR) hits.push({ kind: 'camera-facing', id: cam.id, dist: tipDist });
            if (dist <= camR) hits.push({ kind: 'camera', id: cam.id, dist });
        });
        hits.sort((a, b) => a.dist - b.dist);
        return hits[0] || null;
    }

    root.VideoWorkflowAdapter = {
        MARK,
        mediaKind,
        asRef,
        formatSegments,
        formatStageNote,
        expandMentions,
        extractLastFrame,
        apply,
        previewBody,
        collectCanvasPreviousVideos,
        collectSmartPreviousVideos,
        collectCanvasAssets,
        drawStageLayout,
        drawStageLayoutAsync,
        drawStageOnto,
        eventToStage,
        stageToXY,
        posePoint,
        poseFromPoint,
        hitStage,
        facingFromDelta
    };
})(window);
