# 小云雀对照实施计划

> 目标仓库：`D:\Infinite-Canvas`。本计划先记录可复核的产品观察，再按现有 Infinite-Canvas 架构实现。所有生成引擎均由用户选择，不能把某个厂商、模型名、时长或参考数量写成产品规则。

> **现行文档基准（2026-09-01）**：用户已明确取消原任务中任何 Grok/外部编码器步骤；本计划只记录本地 Codex 与工作区代码的实施，不创建、启动或依赖 `_run_grok.cmd`。当前正式页面统一使用 `libtv12` 深色主题、`desktop-motion14` 动效；经典/智能连线脚本版本分别为 `fluid9`/`fluid13`，画布列表脚本为 `layout6`、首屏聚焦样式为 `focus1`，`libtv-skin.js` 为 `libtv7`、辅助层为 `libtv3`；品牌配置/渲染脚本当前使用 `brand2`/`brand4` cache 标签。测试数字只以本文档末尾最新审计节最后一次实际运行结果为准，早期章节的数字均标为历史快照。产品交付以桌面端为准；当前公开联系邮箱为 `2734891913@qq.com`，X 主页为 `https://x.com/deathcmd527`，均由 `static/js/brand-config.js` 配置。

## 0. 体验记录与证据

### 0.1 真实网页走查

使用 Google Chrome 浏览器插件接管已登录标签页打开 `https://xyq.jianying.com/`，按公开首页、登录后工作台、自由画布、资产库、学习中心和 3D 导演台逐区点击走查；本地脚本/DOM 记录仅用于对照，不替代真实 Chrome 交互。已保存了：

- `ref-xyq/homepage-1440.png`：公开首页 1440px 截图。
- `ref-xyq/login-1440.png`：登录页 1440px 截图。
- `ref-xyq/stage3d.png`：项目中提供的小云雀 3D 导演台实机参考图。

这些图片只存在于开发者本地的 `ref-xyq/` 参照目录，未随公开仓库发布。阅读本计划时，请以各节描述的空间关系、DOM 类名、状态字段和验收步骤为准；本地截图只作为布局/视觉证据，不作为需要复制的品牌素材或固定模型配置。

### 0.4 个人免费版开发边界

本项目面向个人免费使用，优先交付无需小云雀付费额度即可反复验收的本地工作流。以下内容明确纳入本轮范围：

- 本地画布、七类节点、拖拽/连线、参考用途、分段提示、末帧续接的数据模型与预览。
- 角色/场景/视频/音频卡片的本地文件选择、派生状态、工具条交互和可撤销的节点变体。
- Three.js 3D 导演台的粉模、对象/角色/道具/机位/动作/运镜/AI识图页签、WASD/QE、机位预设、时间轴、截图到 `layout` 参考。
- adapter 的兼容 payload 预览、JSON/ZIP 导入导出，以及在用户自行配置的 ComfyUI 或本地 OpenAI-compatible 服务上的可选生成。
- 无可用引擎时的 mock/preview 状态，让 UI、数据流和验收步骤仍能完成，不消耗第三方额度。

以下内容本轮不开发真实闭环，只保留明确的接口位或不可误操作的占位提示：

- 小云雀手机号/验证码、抖音登录、真人认证、账号绑定、会员、支付、订单、额度扣减和发票。
- 需要小云雀付费额度或受服务端权限控制的真实云端生成、云端批量任务、云端发布和商业投放；不能因为演示而提交生成或上传个人素材到第三方。
- 多人团队协作、公开分享权限、企业资产审计、商业数据统计，以及课程内容本身的复制。
- 真实短信、摄像头/麦克风权限、云端角色审核等外部副作用；相关入口显示“需外部服务/未配置”，不伪造成功。

因此，计划中出现“生成/上传/下载”时，默认验收本地状态、可配置本地引擎和 adapter 预览；只有用户在本地自行配置 provider 并明确启用时，才调用现有 runner。不得为了模拟免费版而删除模型选择能力，也不得硬编码任何厂商、时长或参考数量上限。

### 0.5 开源发行约束（本项目的硬性边界）

本项目按可公开发布的开源仓库设计。目标是复现通用的“节点画布 + 多用途参考 + 3D 导演台 + 可插拔生成 provider”交互，不复制小云雀的私有实现，也不把一次真实登录体验变成可提交的账号或服务依赖。

- **许可证与仓库边界**：保留仓库现有 `LICENSE` 原样，不修改许可证文本；不新建嵌套仓库，不把 `Infinite-Canvas-main/`、构建缓存或临时抓取目录当作发布源。新增代码应能在干净 checkout 中按 README 启动。
- **不复制受限内容**：不得提交小云雀私有源码、压缩 bundle、内部接口文档、登录态页面导出、品牌图标/字体/模板素材或从网页下载的受限资源。`ref-xyq/*.png` 只用于本地开发计划的布局参照；发布前应确认其来源和许可，不能把它们当作运行时资源或品牌资产。
- **凭据与个人数据**：禁止提交手机号、Cookie、token、API key、浏览器 profile、真实项目文件、个人图片/音频/视频和第三方账号信息。`API/.env` 保持现状，不在其中写入新凭据；示例配置只能使用占位符，并提供 `.env.example` 或 README 配置说明（若仓库已有约定则沿用）。
- **provider 插件化**：生成引擎只能经 `engines`/adapter/现有 runner 配置接入，provider、model、baseUrl、参考数量和时长均由用户配置；新增代码不得把 Seedance、Seedream 或任何商业厂商写成默认请求。仓库仍保留旧项目的兼容 handler/常量，必须由运行时禁用名单和 UI/API 过滤阻断，不得自动选中或暴露给活动工作流。
- **默认可运行**：首次启动不需要付费 API、手机号、验证码或云端账号。必须提供 mock/preview provider 或等价的离线预览路径，让贡献者可以验证节点、连线、schema、adapter、3D 导演台和导入导出；mock 结果必须标为预览，不能伪造真实生成成功。仓库中仍保留旧项目的 provider 配置读取能力以便迁移，但视频节点不会自动选中远程 provider/model，未配置时只生成明确标注的本地预览。
- **外部服务与上传**：本地文件默认只在浏览器/本地服务处理，不自动上传到第三方；商业服务入口显示“未配置/需外部服务”，只有用户明确填写 provider 并启用后才发请求。错误、超时、未配置和降级状态都要可见且可复现。
- **可维护性**：新增公共数据字段要更新 schema、adapter、README 配置说明和最小测试；保持现有 `runApiVideoGeneration` 请求骨架及 Three.js `video-workflow-stage3d.js` 公共 API，不把开源复现做成第二套后端协议。
- **贡献者体验**：README 至少包含 Windows 本地启动、依赖安装、mock 验收、可选 ComfyUI/OpenAI-compatible provider 配置、JSON/ZIP 导入导出、截图与已知限制；提供一个不依赖真实账号的最小 smoke/test 命令。文档只描述通用能力，不暗示与小云雀官方服务存在关联。
- **禁止修改的现有文件**：本轮不改 `LICENSE`、`API/.env`、注册机/注册工具和与本功能无关的用户改动；如需新增示例，只新增脱敏占位文件。

开源验收的最低标准是：从干净仓库启动后无需外部账号即可打开画布、创建七类节点、操作 3D 导演台、查看 adapter preview、导出/导入工作流；活动默认路径不得包含真实凭据、私有接口地址或厂商专用默认请求。旧兼容 handler、模型名和测试夹具可以保留，但必须不可达、可过滤，并在发布说明中明确。

公开首页可实际点击的结构：顶栏品牌、`最新活动`、`创作工具`、`创意营销`、`用户声音`、`下载APP`、`登录`；主区有灵感输入框/`开始创作`、精选短片弧形轮播（7 个视频切换按钮）、短剧创作/通用创作切换、营销工具轮播和用户声音。锚点滚动已实际验证。首页的开始创作、精选短片和 Agent 入口均要求登录。

登录页实际显示手机号、验证码、发送验证码、登录、抖音快捷登录和协议勾选。未提交付费生成，未消耗生成额度。

本次会话对以下产品路由做了无副作用探测：

| 路由 | 结果 |
| --- | --- |
| `/home`、`/create`、`/workbench`、`/dashboard`、`/app` | 重定向登录，登录后应进入创作工作台 |
| `/interactive-drama` | 重定向登录，公开 bundle 路由名对应短剧 Agent |
| `/marketing-agent` | 重定向登录，公开 bundle 路由名对应营销 Agent |
| `/canvas` | 重定向登录，对应自由画布 |
| `/asset` | 路由 manifest 对应资产页 |
| `/learning` | 路由 manifest 对应学习中心 |

因此，已登录页面的细节以项目提供的实机截图、已存在的 UI 词表和本地实现作为第二组证据；计划不会把登录墙误写成已完成的在线功能。

### 0.2 小云雀 3D 导演台布局（参考图逐区）

- 顶部：左侧小云雀图标、`3D导演台 / Scene3D Editor`；中间画幅 `21:9`；右侧工具图标与`退出`。
- 左侧第一栏：窄竖排页签，依次为`对象 / 我的 / 角色 / 道具 / 机位 / 动作 / 运镜 / AI识图`，当前页签浅灰高亮。
- 左侧第二栏：搜索对象胶囊框；对象树/资产卡。角色页是`单人`、`群众`卡片，点击直接放入舞台；不是把角色操作藏在一串输入框里。
- 中央：占工作区 60% 以上的浅灰/粉模视口。粉色 T 型人模、地面网格、右上 XYZ 轴、`重置视角`、浮动`自由走位` WASD/QE HUD，底部悬浮选择/旋转/缩放/撤销/重做/路径工具条。空地拖动旋转，滚轮缩放，右键/Shift 平移。
- 右侧：上方`机位预览`，真正的实时 canvas 画面与机位选择；下方才是`3D场景`的背景贴图/颜色、场景缩放/平移/旋转等属性。
- 底部：时间轴标尺、播放控制、当前帧、30fps、删除关键帧、缩放。选中对象后出现该对象轨道和关键帧；播放只预览站位/姿势。
- 交互产物：角色位置、面向、动作、姿势控制点、机位预设和运镜轨迹写入 stage 数据；`截图`把当前导演视角 PNG 写入参考槽 `purpose=layout`；`渲染`使用机位画面；录屏只记录当前视口。

### 0.3 产品功能到数据的点击链

1. 用户在新建画布或加节点菜单选择`角色 / 场景 / 3D导演台 / 文本 / 图片 / 视频 / 音频`，节点落在画布世界坐标，不堆叠。
2. 角色/场景卡上传或选择资产；角色工具条（`三视图、特写、表情九宫格、妆容、表情、人像质感、超分、图层分离、裁剪、旋转`）生成本地变体或创建带角色参考连线的出图节点。出图引擎来自 `videoWorkflow.engines.image`。
3. 视频卡上方浮动工具条（`抽帧、提升画质、截取、音频分离、裁剪、解析、拉片、智能抠像`）修改视频节点的工作流状态或派生图片/音轨。视频卡主视觉是大预览和上传/资产入口，模型设置为次级。
4. 工作流片区保存：多用途参考槽、时间戳分段提示、局部重拍（时间段+画框+一句话）、绿幕主体+背景、上一镜头末帧续接、ADR/SFX/BGM 音轨、画幅和 `@` 素材。
5. 点击`智能执行`沿连接拓扑调用现有图片/视频/LLM/ComfyUI/RunningHub 生成函数；不会新写后端请求，也不会重写 `runApiVideoGeneration` 的请求骨架。

## 1. 产品对照：小云雀 vs Infinite-Canvas

| 小云雀界面/能力 | Infinite-Canvas 现状 | 状态与实施结论 |
| --- | --- | --- |
| 创作/短剧 Agent/营销 Agent/自由画布/资产/学习中心导航 | `canvas-list.html` 项目工作台、普通/智能画布；公开站路由仅在登录后可达 | 本地范围已验收。保持本地项目工作台，不复制小云雀营销首页；登录、会员、支付不接入，活动页面只提供本地入口和明确空态。 |
| 新建画布选择节点 | `canvas-list.js` 已有 `STARTER_KIT_CHIPS`、`openCreateCard`、`seedStarterNodes` | 已有。验收多选 7 种节点，3D 导演台为一等节点。 |
| 加节点/右键菜单 | `canvas.html` 已有片场节点区和生成区；`canvas.js` 有 `createNodeByType`/`menuAdd` | 已有。补齐连线菜单中的 3D 导演台，并保持旧生成入口。 |
| 角色/场景/全景场景资产卡 | `assetCard`、`assetKind`、`panorama`、放到片场已有 | 本地契约已验收。全景场景可作为场景卡写入 scene 背景；真实大文件上传、派生变体和异常重试留作发布者媒体验收。 |
| 视频大卡片、左右接下一镜 | `video` 节点、媒体输入、输出连接、上一节点视频收集已有 | 本地交互已验收。保持大预览，`上一镜头末帧`、相邻视频连接和失败降级状态可见；真实远程媒体结果不在默认承诺内。 |
| 视频工具条 | `renderVideoBody` 已有浮动 8 工具和 `runVideoTool` | 已有。逐项绑定对应工作流字段；禁止 `prompt()` 裁取，使用卡片内时间段弹层。 |
| 角色工具条 | `renderAssetCardBody` 已有 10 个按钮；本地裁剪/旋转，其他工具创建出图节点 | 本地交互已验收。生成类工具读取用户所选 `engines.image`，本地裁剪/旋转产生变体；真实生成结果回写需使用者配置自己的引擎后再验收。 |
| 参考按用途 | schema 有 `PURPOSES`：reference/first_frame/last_frame/mask/background/character/scene/style/layout/composition/motion/custom；panel 有分组 | 已有。补 UI 文案与“视频 motion 只参考动作/运镜”提示，adapter 保留未知用途到 leftover。 |
| 构图/角色多角度参考 | `composition`、`character`、`layout` 已能归档；资产 kind 有 character | 已实现。用途说明、分组和 adapter leftover 均保留，不改变 payload 骨架。 |
| 分段提示词 | schema `segments[{start,end,text}]`、adapter `formatSegments` | 已有。验收能新增/删除/编辑并在预览看到 `[start-end]`。 |
| 绿幕/光替/局部重拍 | schema `greenscreen`/`redo`；视频工具可打开；引擎位有 `matting`/`relight`/`redo` | 本地状态已实现。每个操作保留引擎槽和降级提示；未配置引擎时不伪造远程成功。 |
| 续接/末帧 | schema `continuePrev`；adapter `extractLastFrame` 并降级视频参考 | 已有。补视频卡相邻连接提示和失败时的 preview leftover。 |
| 音轨 ADR/SFX/BGM | schema `audioTracks`、panel 增删、adapter 写 `audios`/leftover | 已有。保持三轨独立，音频输入不混入图片数组。 |
| 3D 导演台 | `video-workflow-stage3d.js` 是 Three.js 共享引擎；panel 可展开全屏；LTX 也挂同一套 | 核心交互已验收。以现有 stage 为唯一引擎，2D/3D、视图重挂载、机位、运镜、关键帧、截图和窄屏布局均有回归；`static/director-desk.html` 提供可从画布卡片独立打开的同源页面，并支持 `?id=&node=` 直达具体片场节点。 |
| 左侧对象/我的/角色/道具/机位/动作/运镜/AI识图 | `STAGE_TABS` 及 panel 已有，schema 还含材质 | 已有。确保窄栏顺序和材质入口不被隐藏；角色页显示单人/群众卡。 |
| 粉模、WASD/QE、15 机位、运镜蓝线、姿势点 | stage3d + schema 已有 | 已有。验证 camera preset 写回、camera move 画蓝线、姿势/轨迹可导出。 |
| 机位实时预览 | panel 有 `canvas.vwf-cam-gl`，stage3d 使用 shotCam 绘制 | 已验收。保持 canvas 绘制；无激活机位才显示空态，播放/切换机位不改动 stage 数据。 |
| 片场截图/渲染/录屏 | panel `exportLayout`、stage3d `capture`、MediaRecorder 已有 | 已有。截图必须生成 `layout` 参考并能被 adapter 带入。 |
| 顶部画幅/风格库/@引用 | 画幅已有；`@` suggestion/adapter expandMentions 已有；风格用途已有 | 本地交互已实现。风格作为可复用 prompt 资产，`@` 引用进入兼容 preview；不复制在线模板或付费额度链路。 |
| 智能执行/工作流打包/批量下载 | 智能执行、工作流 JSON/ZIP 导入导出、输出下载已有 | 本地契约已验收。沿用现有拓扑和 JSON/ZIP 格式；空态、失败重试和大文件反馈仍需真实本地媒体验收。 |

## 2. 交互逻辑和数据契约

### 2.1 节点与连线

- `character`、`scene` 映射 `assetCard`（`assetKind=character|scene`，全景用 `panorama=true` 或 `assetKind=panorama`）。
- `stage3d` 映射 `video` 节点的 `openDirectorDesk/stageHost`，复用 `video-workflow-stage3d.js`；不要新增第二个 Three.js 引擎。
- `prompt`、`image`、`video`、`audio` 使用现有轻量节点。生成节点仍为 `generator`、`video`、`ltxDirector`、`minimax`、`comfy`、`rh`、`llm`。
- 连接对象继续是 `{id, from, to}`。`generatorSources`/`orderedSources` 汇总上游 prompt、媒体和资产；`runCanvasSmartExecute` 依据拓扑顺序调用已有 runner。
- 视频节点左右端口支持下一段视频连接；上一节点的输出视频由 `collectCanvasPreviousVideos` 传给 `continuePrev`，adapter 优先抽末帧作为下一段 `first_frame`，失败则回退视频参考。

### 2.2 工作流 schema

`static/js/video-workflow-schema.js` 的规范形状保持如下（已有字段继续兼容旧数据）：

```js
{
  extraRefs: [{ id, kind: 'image|video|audio', purpose, url, name, notes }],
  segments: [{ id, start, end, text }],
  redo: { enabled, start, end, boxes, prompt, maskUrl, maskName },
  greenscreen: { enabled, subjectUrl, subjectName, subjectKind, bgUrl, bgName },
  continuePrev: { enabled, useLastFrame },
  audioTracks: [{ id, kind: 'adr|sfx|bgm', text, url, name }],
  assets: [{ id, kind, name, notes, url, panorama }],
  stage: { actors, cameras, cameraMove, layoutUrl, scene, viewOrbit, keyframes, ... },
  engines: { video, image, upscale, matting, tts, llm, relight, redo },
  refLimits: { image, video, audio }
}
```

每个 `engines[slot]` 为 `{provider, model, baseUrl}`。provider 来源是现有 `apiProviders` 加 `comfyui`/`openai_local`；模型可输入或从 provider 模型列表选择。工具位不根据模型名称显隐。

### 2.3 adapter 降级规则

`static/js/video-workflow-adapter.js` 是唯一的“UI 丰富数据 -> 兼容生成输入”边界：

1. 可表达的 image/video/audio 参考进入现有 `images/videos/audios` 数组，受 schema 中用户可调 `refLimits` 限制。
2. `first_frame`、`last_frame`、`mask` 映射为兼容 role；其他 purpose 原样写入 `leftover.refPurposes`。
3. `motion` 视频绝不当作画面复刻，进入 `leftover.motionOnly` 并加入“只参考运镜/动作”的提示；`composition` 进入 `leftover.composition`。
4. 片场 `layoutUrl` 进入 image reference，stage actors/cameras/scene/cameraMove 写入 leftover 和中文提示；无 PNG 时保留 stage 数据并标记 degraded。
5. 分段、绿幕、局部重拍、音轨、解析/拉片/音频分离等不能被后端字段直接表达的能力进入 `leftover`/prompt 标记，UI 数据不丢失。
6. `engines` 总是回写 `leftover.engines`；已知 provider/model 用于 node runner，未知字段只降级到 leftover，不改 `runApiVideoGeneration` 请求体。
7. adapter 返回 `{prompt, images, videos, audios, returnLastFrame, useFrameRoles, payload, leftover}`，现有 runner 只取兼容字段，preview 显示 sent/unused 两区。

## 3. 详细开发方案（按文件）

### 3.1 `static/js/video-workflow-schema.js`

- 保持 `PURPOSES`、`ENGINE_SLOTS`、`CAMERA_PRESET_ITEMS`、`CAMERA_MOVE_ITEMS` 为单一常量来源；不要增加模型专用分支。
- 确认 `normalize` 对旧字段、`audioTracks`、全景资产、`stage`、`engines` 都幂等；空值恢复默认，不覆盖用户已有模型选择。
- 为工具动作补 `ENGINE_SLOTS` 访问辅助（若缺失），供 panel/canvas 共用；限制默认值可配置，不写死“30 秒/50 参考”。

### 3.2 `static/js/video-workflow-adapter.js`

- 保留现有 `apply`、末帧抽取、purpose role 映射和 leftover 结构。
- 明确 `motion` 只动作、`composition` 只构图、`layout` 站位；未知 purpose 进入 leftover，不静默丢弃。
- 让 `audioTracks` 的 `url` 进入 `audios`，文字与轨道类型进入 leftover；继续兼容旧 payload。
- 增加可测试的纯函数/预览信息（若需要）而不触碰 API 请求骨架。

### 3.3 `static/js/video-workflow-panel.js`

- 片场保持 `renderStageBlock`/`bindStage`/`mountStage` 这一套；这是视频工作流和 LTX 共享的组件。
- 调整结构优先级为：顶栏 -> 左页签/对象卡 -> 中央大视口 -> 右侧实时机位 canvas/场景属性 -> 底部时间轴。全屏 `.is-desk` 用 fixed 铺满窗口，Esc 退出。
- 左栏角色页使用“单人/群众”卡片；对象树保留当前角色名、场景和相机选择。
- 中央视口保留 Three.js 3D 默认、2D 备用、WASD/QE HUD、XYZ 轴、重置视角和悬浮工具条；所有 pointer/key 事件继续写 schema stage。
- 右侧预览使用 `canvas.vwf-cam-gl`，由 `VideoWorkflowStage3D.sync` 绘制 shotCam；场景背景/变换放在预览下方。
- 时间轴显示选中 actor 轨道、关键帧、当前帧、fps、添加/删除；刷新/播放后 stage 仍可恢复。
- 参考槽按用途分组并显示用途；新增参考时默认 `reference`，选择 `motion` 时显示只参考动作提示。
- 引擎区保持 provider/model/baseUrl 三元选择，但作为紧凑设置区；每个需要模型的工具显示对应 slot 的可选引擎，不以厂商名判断功能。
- 继续保留截图、渲染、录屏；截图调用 `upsertLayoutRef` 写 `stage.layoutUrl` 与 `extraRefs[purpose=layout]`。

### 3.4 `static/js/video-workflow-stage3d.js`

- 不重写 Three.js 场景。只修复/验证尺寸、视口、预览 canvas、地面网格、粉模、蓝色运镜线和 pointer 交互。
- `sync` 同时更新导演视口和 `shotCam` 预览；`capture` 输出 PNG 供布局参考。
- 保持 `attach/hide/sync/capture/currentViewAsCamera/poseFromWorld/resetOrbit` 公共 API，避免 panel 产生第二套坐标系。

### 3.5 `static/js/canvas.js`

- 保留现有 `addCharacterCardNode`、`addSceneCardNode`、`addDirectorStageNode`、`addPromptNode`、`addImageNode`、`addVideoNode`、`addAudioNode` 与 `seedStarterNodes`。
- 在 `createNodeByType`、`menuAdd`、连接菜单中确保七类片场节点都能添加；3D 导演台添加后立即打开/挂载 stage desk。
- 保留 `renderVideoBody` 的浮动工具条和大预览；截取使用 `.video-clip-pop` 入/出点字段，禁止 `prompt()`。
- 角色工具生成路径统一通过 `canvasImageEngine()` 取当前 `videoWorkflow.engines.image`，必要时复制到 generator 节点，不写死模型。
- `runVideoTool`：抽帧派生 image 节点；提画质设定 `upscale` slot；抠像设定 `matting`/greenscreen；解析/拉片写 `analyze`；音频分离写 `audioSplit`；所有状态可在 workflow preview 看见。
- `mountCanvasVideoWorkflowPanel` 保持 adapter 调用和 `collectCanvasPreviousVideos`；不要改 `runApiVideoGeneration` body。
- `runCanvasSmartExecute` 只沿现有 connections 调用 runner；失败节点停止并显示可复现错误。
- 资产卡场景支持 panorama，放入片场时写 scene 背景；角色支持放到片场、`@` 引用和变体输出。

### 3.6 `static/css/canvas.css`

- 参考走查中的 3D 导演台空间关系：白色工作区、细灰边线、浅灰视口、少量紫/粉强调色；保持现有主题变量和 dark mode。
- `.vwf-stage-studio` 使用窄 tab rail + 资产栏 + `minmax` 中央视口 + 右侧面板，中央不低于可用宽度 60%；底部时间轴只占中央列。
- `.vwf-stage.is-desk` fixed 全屏，主体不被视频节点尺寸裁剪；`.vwf-desk-mask`/Esc 能退出。
- 工具条、WASD HUD、XYZ 轴、重置视角、机位预览 canvas 与时间轴保持稳定尺寸；保留现有 media query 作为兼容降级，但本轮只验收桌面端，不以移动端折叠行为作为交付条件。
- `.video-float-tools` 浮在视频卡上方；`.video-hero` 先显示大预览/上传入口；`.asset-card-tools` 在角色图像上方，图标+文案，按钮不挤成不可读的一排。
- 不增加装饰性渐变球、巨型营销 hero、嵌套卡片；不使用 `letter-spacing` 负值或随视口缩放字号。

### 3.7 `static/canvas.html`、`static/canvas-list.html`、`static/js/canvas-list.js`

- 保持当前导航/项目管理和右键创建体验；新建卡片的 7 个 starter chips 只在普通画布显示，智能画布继续走现有入口。
- 更新脚本 cache-bust 版本，避免浏览器继续使用旧的 canvas/panel/schema/adapter。
- 不改 `LICENSE`、`API/.env`、注册机；不新建仓库；不删除 `static/js/video-workflow-stage3d.js`。

### 3.8 i18n

- `static/js/i18n/common.js` 与 `static/js/i18n/canvas.js` 补齐：七类节点、用途、工具、音轨、片场、引擎 slot、只参考动作/布局说明。
- 中文是默认验收语言；英文 key 只作为现有双语机制的 fallback，不在 JS 中散落模型名。

## 4. 详细开发步骤与验收标准

### 步骤 1：基线与脚本版本

1. 运行 `python -m py_compile main.py`（若环境缺依赖，只记录原因）。
2. 检查未触碰禁止文件，确认现有 Three.js stage 文件仍存在。
3. 更新 canvas 页面脚本版本。

验收：硬刷新 `canvas.html` 不报 `VideoWorkflowSchema/Adapter/Panel` 未定义；空画布仍能右键打开菜单。

### 步骤 2：新建/加节点

1. 打开 `canvas-list.html`，点`新建画布`，选择`角色 + 场景 + 3D导演台 + 文本 + 图片 + 视频 + 音频`任意组合。
2. 创建后节点按网格错开；右键或快捷工具栏再次添加同七类节点。
3. 3D 导演台节点创建后自动展开 desk，视频节点仍可从工作流再次打开。

验收：刷新列表页和画布页，7 类节点都存在且可拖动/连线；3D 节点不是隐藏在视频详情的唯一入口。

### 步骤 3：视频卡与引擎选择

1. 添加视频节点，确认 provider 下拉包含已配置 API、ComfyUI、本地 OpenAI 兼容（按实际配置显示），并提供手动输入模型的通用入口。
2. 修改视频 provider/model，刷新后选择保持；工作流 `engines.video` 同步。
3. 分别点抽帧、提升画质、截取、音频分离、裁剪、解析、拉片、智能抠像；每项在 UI 或 preview 显示状态。
4. 未配置 provider/model、选择本地引擎，或使用手动预览入口时只走本地 mock/preview，不请求小云雀或其他云端服务；只有用户明确填写并启用远程 provider 后才进入现有 runner。

验收：视频卡上方有浮动工具条和大预览；截取出现入/出点控件，不弹 `prompt()`；未生成视频时抽帧给出非破坏提示；未配置引擎点击生成会得到“本地预览”状态而不是远程任务。

### 步骤 4：参考/分段/绿幕/续接/音轨

1. 在工作流新增图片、视频、音频参考，逐个选择 `reference/first_frame/last_frame/mask/background/character/scene/style/layout/composition/motion`。
2. 新增两个时间段，填写起止秒和一句提示；新增 ADR、SFX、BGM 轨道并上传/填写文字。
3. 开启局部重拍（时间段+画框+一句话）、绿幕（主体+背景）、续接（上一段末帧）。
4. 点击 preview，检查 `sent` 与 `unused`：图/视频/音频数组正确，motion 仅出现在 motionOnly/动作提示，未知字段未丢失。

验收：adapter 预览可读；不会因为后端未知字段导致生成请求结构变化；末帧抽取失败能降级为视频参考并在 leftover 标记。

### 步骤 5：角色/场景资产

1. 添加角色卡上传图片，确认工具条位于画像上方；依次点三视图、特写、表情九宫格、妆容、表情、人像质感、超分、图层分离。
2. 验证生成类工具创建 prompt+generator 连线并使用当前 `engines.image`；本地裁剪/旋转直接产生变体。
3. 添加场景卡，勾选全景/`panorama`，点`放到片场`后成为 scene 背景；在提示词输入 `@资产名`，选择 suggestion。
4. 没有本地引擎时，生成类工具显示待配置/mock 状态并保留输入，不伪造云端成功。

验收：资产卡有输出/变体或明确错误；不出现硬编码 Seedance/Seedream；角色可放入片场并保持名称。

### 步骤 6：3D 导演台核心

1. 打开 3D 导演台，默认 3D；左栏切换八个页签，角色页点`单人`与`群众`。
2. 中央空地拖动视角、滚轮缩放、右键/Shift 平移；选粉模拖动位置，工具切旋转/缩放/路径；按 WASD/QE。
3. 在动作页选择官方动作名；在姿势页选择预设、拖白点和滑杆；在机位页添加机位并选择 15 个预设；运镜页选择预设，确认 3D 出现蓝线。
4. 右侧确认机位下拉和实时 canvas 预览；修改背景颜色、场景缩放/平移/旋转。
5. 播放/拖当前帧，确认选中角色显示轨道，新增/删除关键帧；切 21:9、16:9、9:16。

验收：布局与 `ref-xyq/stage3d.png` 同类：左窄栏+资产栏，中间大视口，右实时预览，底时间轴；Esc 退出全屏 desk，刷新后站位/视角/动作仍在。

### 步骤 7：截图进入生成

1. 在导演台点`截图`，确认 `stage.layoutUrl` 和 `extraRefs` 中出现 `purpose=layout` 的 PNG。
2. 连接导演台/角色/场景到视频节点，打开 preview，确认 layout image 被送入兼容 images，actors/cameras/cameraMove 在 leftover。
3. 仅在用户已配置本地/自有 provider 且明确启用时点击视频生成；未配置时验收 adapter preview 和 mock 状态，不提交小云雀云端任务。

验收：不改 `runApiVideoGeneration` 请求 body；能从截图到 adapter preview 追踪完整数据链。

### 步骤 8：智能执行与导出

1. 连 `文本 -> 出图 -> 视频 -> Output`，点击智能执行，确认按拓扑顺序运行并在失败处停止。
2. 框选节点导出 JSON；需要资源时导出 ZIP；输出节点使用现有下载/批量下载。
3. 批量下载只针对本地已有输出；没有输出时给出可操作的空状态，不访问商业云端任务列表。

验收：工作流可导入当前画布，节点/连线/媒体/工作流状态不丢；不产生第二种后端协议。

## 5. 本地 Codex 实施与验证

原任务中的外部自动编码阶段已由用户明确取消。本次实现、代码审查、浏览器走查和回归测试均直接在 `D:\Infinite-Canvas` 完成，不依赖外部编码器、远程代理或隐藏脚本，也不创建新仓库。

实施顺序如下：

1. 先读取任务约束并走查线上页面，记录左/中/右/上/下布局、节点菜单、片场页签、工具条和生成前后的状态变化。
2. 以 `video-workflow-schema.js` 统一字段和默认值，以 `video-workflow-adapter.js` 作为兼容边界；未知用途、片场字段、音轨和分段提示进入 `leftover`，不破坏既有请求骨架。
3. 在 `canvas.js` 接入七类节点、端口连线、片场数据源/输出中继、provider/model 选择和无 provider 的本地预览；远程调用必须经过用户配置的 provider。
4. 在 `video-workflow-panel.js`、`video-workflow-stage3d.js` 和 CSS 中完成片场布局、15 个机位、动作/运镜、背景、截图、录屏上传和全屏生命周期；重挂载不丢状态，键盘事件只绑定一次。
5. 用 Node/Python 单元测试、HTTP 接口检查和真实浏览器逐项回归；每次修改后检查语法、JSON、差异空白和凭据扫描，再记录可复现的验收结果。

## 6. 完成定义

- `CODEX-XYQ-PLAN.md` 是本文件，包含产品对照、数据流、文件方案、逐步验收和本地实施顺序。
- 实现直接发生在 `D:\Infinite-Canvas`，不依赖外部自动编码进程，不创建新仓库。
- `canvas.html` 可添加七类节点；视频节点能选 API/ComfyUI/本地 OpenAI 兼容并手动填写模型；工作流显示参考/分段/绿幕/重拍/续接/音轨/片场；未配置引擎也能用标注为“本地预览”的 mock/preview 完成验收。
- 片场默认大 3D 视口，左页签、右实时机位 canvas、底时间轴、WASD/QE、15 机位、运镜蓝线、截图到 `layout` 参考全部可走通。
- 生成能力始终模型无关，未知字段经 adapter 降级，禁止文件和现有 Three.js 引擎不被破坏。
- 不要求个人免费版接入小云雀登录、支付、额度、真人认证或商业云端生成；这些入口必须明确标记为外部服务/未配置，而不是伪造完成。

## 7. 本次完整走查补充记录（2026-08-30）

以下内容是在真实浏览器中以已登录的测试会话逐项点击得到的行为记录。它们用于校准本地交互的层级、命名和状态机；不会把线上账号、积分或受限素材带入开源仓库。

### 7.1 全局工作台

- 左侧主导航顺序为`创作`、`短剧 Agent`、`营销 Agent`、`自由画布`、`资产`、`课程中心`（本项目文案统一为开源友好的`学习中心`）。创作页是 Agent 对话入口，输入框下方依次提供上传参考、`@`引用、技能、模型/偏好和画布开关；空输入时生成按钮 disabled。
- 短剧 Agent 的入口状态包含`上传剧本`、`剧本创作`、`自由画布`、`重制转绘`，剧本创作可填写文本、本土化、画幅、集数和风格，然后选择“跳过剧本，直接进入画布”。本地版本只实现文本/文件导入和画布跳转，不显示限免、积分或云端任务次数。
- 营销 Agent 的参考槽是商品、角色、创意、Hook、风格。点击创意/Hook/风格会打开带搜索和分类的选择抽屉，选中后主卡显示可移除的 chip；本地实现使用用户自己的提示词资产库，不复制线上模板或商业品牌内容。
- 资产库分`作品`、`历史上传`、`角色`、`商品`、`画布`，作品还有全部/图片/视频筛选、倒序、搜索和添加；课程中心展示创作课程、产品教程和查看更多。开源版本保留导航和空态/本地数据，不接登录墙、会员和在线课程付费链路。

### 7.2 自由画布初始态与节点

- 初始画布是浅灰点阵无限平面；顶部有可编辑标题、保存状态、风格库、全局画幅、分享/历史和 Agent 入口。左侧悬浮栏提供添加节点、角色库、资产库、帮助；底部快速新建 chips 顺序为`角色`、`场景`、`3D导演台`、`视频`、`图片`、`文本`、`音频`。右下角有小地图、吸附、缩放和重置。
- `添加节点`菜单包含七项：角色（全剧新角色/已有角色新形象）、场景、3D导演台（New）、文本、图片、视频、音频。节点建立后通过端口连接；节点工具条只在选中/悬停时出现。需要远程 provider 的按钮在未配置时不提交网络任务；视频生成入口仍可执行本地预览并显示状态，给出可操作的本地配置提示。
- 角色空卡提供上传/本地资产、打开形象音色、基础形象、出现集数和描述信息；画像上方工具条顺序为三视图、特写、表情九宫格、妆容、表情、人像质感、超分、图层分离、裁剪、旋转、更多。场景空卡对应全景图、超分、图层分离、裁剪和旋转。
- 视频空卡是大预览/上传区；本地实现的浮动工具条顺序为抽帧、提升画质、截取、音频分离、裁剪、解析、拉片、智能抠像。截取使用卡内入/出点表单；其余工具写入可回看的 workflow 状态或派生节点，不弹浏览器 `prompt()`。线上额外的工具入口不作为本地付费或云端能力承诺；未配置引擎时生成按钮只落本地预览。
- 视频生成输入层实测包含提示词、上传参考、风格、画幅、清晰度、时长、参考模式、运镜和更多设置；本地 UI 把 provider/model/baseUrl 放在通用引擎设置中，任何模型都能使用同一组能力，不显示线上厂商/付费标签。

### 7.3 3D 导演台逐项状态

- 全屏片场顶部为编辑器标题、画幅（Auto/21:9/16:9/4:3/1:1/3:4/9:16）、导出和退出；导出菜单依次为截图、渲染、录屏。截图后进入“摄像机素材”历史，可删除或发送到画布；发送会创建图片节点，并将该 PNG 标记为`purpose=layout`参考。
- 左侧窄栏顺序固定为对象、我的、角色、道具、机位、动作、运镜、AI识图。对象页支持搜索、3D场景/角色、隐藏和锁定；角色页分单人/群众；道具页有分类和搜索；AI识图页支持本地上传、资产库或画布图片，并区分插入当前导演台与覆盖当前导演台。
- 中央视口默认粉色 T 型人模、地面网格、XYZ 轴、重置视角、自由走位 HUD（WASD/QE）、移动/旋转/缩放和轨迹/参考图/描述输入。右侧上方是实时机位预览（无激活机位才显示空态），下方是背景与场景变换属性。底部时间轴提供 30fps、帧跳转、关键帧吸附、播放、当前帧、起止帧、轨道和缩放。
- 机位页实测 15 个预设：当前视角、正面中景、正面特写、正面全景、侧面跟拍、侧面近景、背面中景、俯拍全景、45°俯拍、低角度仰拍、低角度广角、过肩镜头、过肩镜头（右）、鸟瞰、荷兰角。运镜页按基础控制/人物跟拍/空间航拍分组；选择运镜会写入起止帧并在视口画蓝色路径。
- 选择角色后动作页提供战斗/表演/生活/移动及 AI 动作描述；选中对象后右侧属性/姿势/动作/运动轨迹检查器和时间轴轨道同步更新。Esc 必须退出全屏而不丢失 stage 数据。

### 7.4 开源实现取舍

线上页面中的登录、积分、会员、限免、云端模型名、商业模板和在线发布均属于外部服务或付费链路，本项目不实现它们。API 设置保留 provider 兼容配置，但活动布局隐藏余额/充值/推荐模板等付费引导；旧字段和静态兼容文案可能仍留在迁移代码中，不应被当成产品入口。片场和普通画布默认走本地数据与预览。只有用户明确填写 provider/model 后才调用既有 runner；所有未被兼容后端识别的 stage、用途、分段和音轨字段保留在 adapter 的 `leftover` 中，便于导出和后续插件扩展。运行时过滤还会抑制带独立 `vip`、`premium`、`paid`、`subscription`、`membership` 或中文付费标签的模型/平台；不把 `pro`、`plus` 或 `https://apistudio.vip` 这类普通自定义名称/地址误判为付费入口。

### 7.5 项目自有品牌与联系方式（追加需求）

1. 主工作台的品牌、维护者名称和联系方式统一由 `static/js/brand-config.js` 管理，页面不再携带上游作者姓名、个人主页或社交账号。
2. `static/js/brand-ui.js` 负责把配置渲染到侧栏维护者卡片和“联系我”弹窗；链接只接受 `http(s)` / `mailto`，无效地址降级为纯文本，避免把未验证字符串当成跳转地址。
3. 当前默认维护者显示为 `deathcmd`，联系方式数组由项目配置提供邮箱和 X 主页；发布者可在一个配置文件中替换为自己的公开渠道，不需要修改业务页面。
4. 侧栏、首页、项目工作台和画布的身份/焦点/交互令牌继续由 `brand-theme.css` 提供，LibTV 深色表面由 `libtv-theme.css` 提供；窄屏兼容样式只作为已有源码保留，桌面交付不依赖它，联系弹窗支持遮罩点击、Esc 和焦点回收。
   资产库、API、ComfyUI、图片工具和 GPT 等独立工具页也直接加载 `brand-config.js`/`brand-ui.js`；`libtv-aux.css` 为这些页面提供同源的联系按钮、暗色弹层和 Tab 焦点循环，直接打开工具页不会丢失维护者入口。
5. 计费/钱包字段仅为旧工作流兼容而保留，前端和 RunningHub 兼容端点均强制使用普通服务 Key，UI 不提供余额、充值或账户钱包选择器。

验收：打开根页面、核心工作台和辅助工具页均能看到维护者卡片；点击“联系我”显示配置化联系人；业务页面不再渲染上游作者的联系方式；在 `static/js/brand-config.js` 替换联系人后刷新即可更新侧栏和弹窗；窄屏和暗色主题下无溢出。默认占位值不冒充用户真实联系方式。

## 8. 本轮实现后的可复现验收记录（2026-08-31）

### 8.1 自动化结果

- **历史快照（2026-08-31 基线）**：`python -m pytest -q` 当时为 `50 passed, 3 warnings`（约 7 秒，包含 opaque task-id 回归和独立导演台发布契约）。三个 warning 仅为 FastAPI `on_event` 和 Pydantic `.dict` 弃用提示；现行数字见第 14.10.5 节。
- `python -m pytest -q tests/test_video_workflow.py tests/test_xyq_canvas_smoke.py tests/test_open_source_audit.py tests/test_provider_policy.py`：**`38 passed, 3 warnings`（2026-09-01 当前复测）**；这是报告中的核心工作流、画布、发布契约和 provider 边界集合。早期复审记录中的 `34 passed` 仅作为历史快照，不作为当前门槛。
- `python tests/test_xyq_canvas_smoke.py`：`OK`（脚本式 smoke，不依赖 pytest 收集）；`node tests/video_workflow_unit.js`：`OK`；`python -m py_compile main.py`：通过。
- 递归排除 `vendor/backup/broken-before/stable-before/mojibake` 后，活动 JavaScript 文件（含独立导演台 controller）全部通过 `node --check`；发行范围内 JSON 文件全部解析通过；`git diff --check` 通过。

### 8.2 浏览器和接口结果

- 新鲜浏览器上下文已走查 1280px、390px 和 240px：桌面导演台头部保持单行；390px 拆为两行且标题、画幅/动作、退出按钮不重叠；240px 无 body 横向溢出，控制行只在自身容器滚动。
- 2D/3D 视图切换在面板重挂载后保持；播放→Stop→Play 可见且定时器能停止；画幅、机位、运镜、关键帧、截图到 `purpose=layout` 的状态可追踪。
- 核心七页（index/home/canvas-list/canvas/smart-canvas/api-settings/script-studio）及 10 个独立工具页加载同一 `brand-config.js` + `brand-ui.js`；联系人弹窗的安全 URL、textContent、Esc、遮罩、焦点回收和 Tab 循环均已走查。当前配置为 `2734891913@qq.com` 与 `https://x.com/deathcmd527`。
- 新进程的 `/api/providers`、`/api/models`、`/api/config`、`/api/config/token` 不返回活动 Grok/Sub2API 项，也不返回带明确付费层级标记的模型/平台；未配置 provider/model 时只产生带“本地预览”的状态，不提交远程生成任务。源码/测试夹具仍保留旧兼容 handler、模型常量和禁用名单，不应将运行时过滤写成源码零命中。用户本地 provider 文件中的被过滤条目只在运行时隐藏，保存设置时会保留其模型/禁用 provider 记录，便于迁移恢复。
- `/api/` 与 `/generate` JSON middleware 的合成回归覆盖嵌套 key、语义 fieldName/fieldValue、内嵌 JSON、OSS/X-Amz/Signature URL、Basic/Bearer/Digest Authorization、Cookie、错误详情和禁用 provider 文本；mock RunningHub app-info/submit/workflow-info/fetch/query 路由未回显合成秘密。legacy `/api/image-task-query` 的 `task_id` 已接入 opaque-id 校验，`test_opaque_task_id_shape_and_legacy_query_guard` 验证危险 ID 在上游请求前被拒绝。该验证不调用真实远程 provider。

### 8.3 已知边界

- 资产双向拖放、真实本地大文件处理、视频工具派生结果、批量下载失败重试和跨平台大文件反馈仍需使用者用自己的素材补做浏览器验收。
- 核心七页及 10 个辅助工具页（asset-manager/comfyui-settings/online/angle/klein/zimage/enhance/gpt-chat 等）已统一品牌入口和辅助暗色层；各页原有业务行为保持不变，默认联系人仍需发布者替换。
- legacy `/api/image-task-query` 已完成 opaque task-id 校验并纳入公共边界回归；其余主要 RunningHub 路由已用 mock 合成值复验。真实远程 provider 仍不在本地验收范围内。
- 工作树中可能存在既有 staged/unstaged 用户改动；发布者须独立审阅 `API/.env`、`LICENSE`、`data/asset_library.json`、截图、会话和个人素材边界，不把它们自动归入本轮成果。

原任务要求的外部自动编码阶段已取消；本轮实现、审查和回归均由本地代码完成，没有启动外部编码器或代理。

## 9. 最终实施与发布步骤（2026-08-31）

1. 在干净 checkout 或明确的发布分支中复跑第 8 节命令，保存 pytest、smoke、Node、编译、JSON 和 `git diff --check` 输出。
2. 启动本地服务后，用新鲜浏览器上下文依次检查 1280px、390px、240px；确认七类节点、导演台 2D/3D、播放/停止、联系人弹窗和 API 设置的活动布局。
3. 用 mock/合成响应覆盖公共 JSON sanitizer：普通密钥键、语义字段别名、内嵌 JSON、签名 URL query/path、Authorization/Cookie、错误详情、禁用 provider 文本和 workflow ID 编码；保持 legacy `/api/image-task-query` 的 opaque `task_id` 校验，并确保输出不含合成秘密且重复清洗幂等。
4. 发布前只导出必要源文件，明确排除环境文件、本地数据、个人素材、浏览器会话、`user_attachment` 和缓存；逐项核对暂存区和压缩包，而不是直接依赖 `git add .`。
5. 在 `static/js/brand-config.js` 填入用户自己的维护者姓名、邮箱、主页或 Issue 地址，再刷新核心七页及 10 个辅助工具页确认同步；若修改辅助页模板或共享样式，重新跑对应页面回归。
6. 若项目政策要求源码全文不出现历史厂商/付费词，再建立独立清理任务，移除 legacy handler、示例和兼容文案并重新跑完整测试；当前计划的完成标准是活动路径默认不使用、不展示和不自动调用这些能力。当前策略额外保证明显 `vip`/`premium` 等付费标签不会进入公共模型列表或请求入口，但不删除用户本地配置。

## 10. 批量删除功能（2026-08-31）

本轮在不改变既有单项编辑流程的前提下，为画布和其他可编辑内容补齐了“多选 → 二次确认 → 批量处理 → 结果反馈 → 刷新/保留失败项”的统一能力。删除默认遵循可恢复优先原则；共享文件夹和画布聚合视图仍然是只读来源，不提供删除源文件的入口。

### 10.1 覆盖范围与入口

| 内容 | 入口 | 批量动作 |
| --- | --- | --- |
| 当前项目画布 | `static/canvas-list.html` 画布板工具栏 | 全选、清空、移入回收站 |
| 回收站画布 | 画布列表的回收站面板 | 全选、清空、批量恢复、彻底删除 |
| 图片资产/工作流/提示词 | `static/asset-manager.html`，以及画布内资产管理器 | 多选、全选、清空、二次确认删除 |
| 本地上传素材、存储目录文件 | 素材库“本地素材”和“偏好设置 → 素材管理” | 多选删除；引用中的文件保留并标记跳过 |
| 对话记录 | `static/gpt-chat.html` 历史面板 | 管理模式、全选/清空、批量删除 |
| 生成历史 | 接入 `HistoryBulkManager` 的在线生图/增强/编辑/角度页面 | 管理模式、全选/清空、批量删除 |
| ComfyUI 自定义工作流 | `static/comfyui-settings.html` | 多选、全选/清空、二次确认删除；内置工作流受保护 |
| 画布编辑器节点 | `static/canvas.html` 选中节点后的底部/小地图操作 | 批量删除选中节点，沿用现有撤销栈 |

### 10.2 统一交互状态机

1. 列表项使用原生 checkbox 或管理模式选中，工具栏实时显示“已选 N 个”；切换分组、页签、退出管理和刷新时清理过期 ID。
2. 第一次点击危险批量按钮只进入确认态，按钮文案变为“确认删除”；第二次点击才发送请求。画布批量操作使用可访问的模态确认框，支持取消、遮罩、Esc 和焦点回收。
3. 请求完成后按服务端 `removed/deleted` 与 `skipped` 结果更新界面；成功项移除，引用中、已不存在或受保护项留在选择集合中并给出数量反馈，避免客户端把部分失败误报为全成功。
4. 旧服务未提供批量端点时，画布、对话、历史和工作流页面回退到既有单项接口；新服务优先使用原子批量契约。

### 10.3 后端契约

新增/增强的接口如下（响应保留旧客户端需要的字段，并补充统一计数与跳过原因）：

| Endpoint | Body | 保护规则 |
| --- | --- | --- |
| `POST /api/canvases/batch-delete` | `{ids, action: trash\|restore\|purge}` | `purge` 只接受已在回收站的画布 |
| `POST /api/asset-library/items/delete` | `{ids, library_id?}` | 物理文件仍被引用时只删索引、不删文件 |
| `POST /api/prompt-libraries/items/delete` | `{ids, library_id?}` | 只作用于指定提示词库 |
| `POST /api/conversations/batch-delete` | `{ids, remove_unreferenced_media?}` | 按 `X-User-ID` 隔离目录；媒体清理默认关闭 |
| `POST /api/history/batch-delete` | `{timestamps, remove_unreferenced_media?}` | 历史文件解析失败时不覆盖原文件 |
| `POST /api/workflows/batch-delete` | `{names}` | 路径校验；内置工作流返回 `builtin` 跳过 |
| `POST /api/storage-files/delete` | `{kind, items}` | 仅限配置的三类存储根；引用文件跳过 |
| `POST /api/local-assets/delete` | `{names}` | 仅限本地上传根；同步处理 caption/classification 伴随文件 |

所有批量 ID/路径均拒绝空值、空白、路径穿越和超长列表（单次上限 1000）；文件删除在画布、对话、资产库和历史索引中做引用扫描。写索引使用对应锁，历史采用同目录临时文件 `os.replace`，画布回收站动作可通过 WebSocket 广播刷新其他打开页面。

### 10.4 实现文件与复用边界

- 后端集中在 `main.py`：请求模型、严格校验、批量路由、引用保护和统一响应字段；旧单项接口保留以兼容既有插件。
- 画布列表的多选卡片、确认弹窗和窄屏样式位于 `static/canvas-list.html`、`static/js/canvas-list.js`、`static/css/canvas-list.css`。
- 素材库状态机和批量按钮位于 `static/js/asset-manager.js`、`static/css/asset-manager.css`；共享目录继续只允许复制/导入。
- 对话、历史、工作流和画布节点分别复用 `static/gpt-chat.html`、`static/js/history-bulk-manager.js`、`static/comfyui-settings.html/js` 与 `static/js/canvas.js` 的现有状态/撤销机制，不另造数据格式。
- cache-bust 版本已更新；发布时不包含环境文件、个人数据、浏览器会话或截图缓存。

### 10.5 安全与开源约束

- 普通画布批量删除只进入回收站，永久删除必须显式选择回收站并再次确认；服务端也拒绝绕过回收站的 `purge`。
- 被多个资产记录、画布节点、对话附件或历史记录引用的物理媒体不会被批量删除；共享文件夹源目录永不由批量入口递归删除。
- 响应中的 `skipped` 带稳定 `id/reason/detail`，便于 UI 给出可解释反馈；不把“未找到”当成成功删除。
- 该功能只操作本地开源数据，不增加会员、积分、钱包或付费开关，也不依赖外部编码器/代理。

### 10.5.1 容器级边界

项目、资产库、提示词库及其分组属于组织容器，不在本轮“内容批量删除”按钮中级联处理，仍保留原有的单项确认删除；删除容器时按既有规则迁移/归置其中内容，默认资产库和默认项目继续受保护。这样不会因为误选一个容器而连带删除整批画布或素材。若后续需要容器批量清理，应另设“迁移内容 → 二次确认 → 删除容器”的独立流程和回滚策略。

### 10.6 回归与验收清单

- `python -m py_compile main.py`、`python -m pytest -q`、`python tests/test_xyq_canvas_smoke.py`、`node tests/video_workflow_unit.js`、活动 JS `node --check`、`git diff --check` 全部通过。
- API 回归覆盖：非法 ID/路径、重复项、部分成功、用户隔离、引用媒体保护、历史原子替换、内置工作流保护和回收站 purge 门禁。
- 浏览器回归覆盖：画布多选不触发打开、工具栏数量与 disabled 状态、确认弹窗取消/ESC、素材管理文字对比度和暗色主题；390px/240px 窄屏检查仅保留为非阻塞兼容探针，本项目交付目标是桌面端且测试期间不提交真实删除请求。

### 10.7 最终验证记录

- **历史快照（批量删除阶段）**：`python -m pytest -q` 当时为 `57 passed, 3 warnings`；warning 仅为 FastAPI `on_event` 与 Pydantic `.dict` 的弃用提示，现行数字见第 14.10.5 节。
- `node tests/video_workflow_unit.js`：`OK`；画布、素材、工作流、历史、对话、国际化相关活动脚本均通过 `node --check`，`python -m py_compile main.py` 与 `git diff --check` 通过。
- 本地服务只读探针确认当前数据为 `112` 个正常画布、`20` 个回收站画布；六个批量删除接口对空请求均返回 `400`，非法画布 ID 返回 `400`，未触发删除。
- 浏览器回归确认画布复选框不会打开卡片，选择/清空计数正确；素材库显示“批量管理”；GPT 对话批量工具栏显示中文文案（不会泄露 `chat.bulk*` 原始键名）；窄屏无横向溢出。
- 对话与 ComfyUI 工作流前端均按服务端返回的 ID 数组、计数和 `skipped` 逐项收敛选择状态；数组响应不会再被 `Number([...])` 误判为 `NaN`，部分失败项可继续重试或清空。
- 发现并修复了一次历史批量操作造成的画布软删除副作用：受影响的 `104` 个画布已恢复，原有 `20` 个回收站项目保持不变；修复前快照保存在 `D:\Codex\canvas-batch-repair-20260831-161414.zip`，便于发布者复核。

## 11. 桌面端导演台复测与交互修复（2026-08-31）

本节是针对最近反馈“导演台向下无限延伸、3D 物品/动作不能用、拖动镜头方向相反、画布内文字看不见”的桌面端收尾记录。发布目标只包含电脑浏览器；本节的验收基线为 1024×768、1280×720、1366×768、1440×900、1536×864 和 1920×1080，不把手机断点当作交付条件。移动端兼容样式仍保留在源代码中，但不以它决定桌面版的布局或功能完成度。

### 11.1 根因与实现边界

1. **无限下延**：导演台内部使用 `minmax(0, 1fr)` 网格，右侧检查器和底部时间轴各自拥有滚动容器；桌面舞台本身设置 `overflow:hidden`，右侧内容只在 `.vwf-stage-side` 内滚动。展开态把舞台临时移到 `body` 时，时间轴明确落在中心列第二行，不会把页面高度推开。
2. **3D 点击/拖拽失效**：信息性的“自由走位” HUD 改为 `pointer-events:none`，只有关闭和键盘按钮接收指针；因此 HUD 覆盖区域下的角色、道具和机位仍能命中 Three.js 场景。对象选中后的检查器刷新延迟到同一指针操作结束后的下一帧，避免在 `pointerdown` 中重挂载 canvas、打断拖拽；刷新完成后再把右侧检查器滚动到选中对象，短桌面窗口也能立即看到属性、姿势和动作入口。
3. **镜头上下方向**：不修改共享 `static/js/video-workflow-stage3d.js` 的场景、材质和对象拖动逻辑；`static/js/video-workflow-panel.js` 在面板边界只接管“空白区域左键轨道”这一种手势，保持对象拖动、右键/中键/Shift 平移和滚轮缩放原行为。屏幕 Y 方向通过 `data-vwf-orbit-direction="screen-y"` 标记，结束手势才持久化视角。
4. **路径坐标为空**：Three.js 的地面投影回调返回 `nx/ny`，旧面板只读取 `x/y` 会写出 `undefined`。面板现在同时接受两种字段并做 `Number.isFinite` 校验；路径工具模式会绕过空白轨道 shim，地面点击直接进入现有 `onPath` 回调。
5. **中等桌面宽度拥挤**：901–1180px 时，时间轴控制条在自己的容器内横向滚动，控件保持单行且不改变舞台/文档高度；1280px 以上保持完整展开，不引入全局横向滚动。
6. **机位预设后的检查器残留**：机位预设原本使用“不重挂载”路径，虽然数值更新了，右侧仍可能显示上一次角色检查器。现在预设改变选中机位后正常重挂载并回到机位预览顶部，实时输入仍使用不重挂载路径，保证连续编辑不卡顿。

### 11.2 涉及文件

- `static/js/video-workflow-panel.js`：空白轨道方向适配、路径坐标兼容、3D 选中延迟刷新、机位高度/朝向实时输入、Three.js 不可用时的 3D 兼容绘制，以及独立页保存后打开逻辑。
- `static/css/canvas.css`：HUD 穿透、桌面时间轴溢出边界、舞台网格和展开态滚动约束。
- `static/canvas.html`、`static/smart-canvas.html`、`static/director-desk.html`、`static/stage-desk-smoke.html`：统一引用最新 `desktop-orbit-path8` / `desktop-timeline4` cache-bust，避免嵌入页面继续运行旧交互；对象树同时呈现角色与可编辑道具，改名时标签实时同步。
- `static/director-desk.html` + `static/js/director-desk.js`：从画布节点的“独立页”入口打开同源、可保存的完整导演台；URL 使用 `id` 与 `node` 定位，不创建第二套场景引擎。

### 11.3 可复现桌面验收

| 场景 | 操作 | 结果 |
| --- | --- | --- |
| 版面高度 | 在 1024/1280/1366/1440/1536/1920 宽度加载独立导演台 | `body` 与 `document` 的 scroll 尺寸均等于视口；舞台底边分别落在 752、704、752、884、848、1064 附近，没有向下追加空白页。 |
| 文字可见性 | 1280×720 截图检查顶栏、左侧页签、中心工具、右侧机位/场景、时间轴 | 中文标题、按钮、坐标字段和时间轴文案均有可见像素；右侧较长检查器只在自己的滚动区继续向下。 |
| 15 个机位 | 逐项选择 `当前视角`、正面/侧面/背面、俯拍、低角度、过肩、鸟瞰、荷兰角共 15 项 | 每项都会更新机位状态（位置、朝向或高度）和右侧预览，不出现空选择。 |
| 角色与动作 | 角色页加入单人角色；动作页点击动作卡；姿势页点击预设/滑杆 | `stage.actors`、姿势字段、时间轴轨道和右侧检查器同步；选中角色后拖动位置不会因重绘中断。 |
| 道具 | 道具页依次点击方块、球体、平面、圆柱、圆锥 | 5 种 primitive 均能加入舞台并出现在对象树；撤销可移除测试对象。 |
| 路径 | 选择角色→运动轨迹→清空路径→切换路径工具，在地面点击两点 | `actor.path` 得到两个有限数值 `{x,y}`，`pathsRoot` 生成路径线；切回选择工具后仍可选中角色。 |
| 机位编辑 | 直接编辑 Z/朝向输入框，不等待失焦 | `input` 事件立即更新 `stage.cameras[*].alt/facing`、Three.js 相机网格和预览；`change` 只作兼容回退，不重复写入相同值。 |
| 镜头轨道 | 在空白地面向上/向下拖动，再刷新页面 | `viewOrbit.phi` 按屏幕拖动方向变化并持久化；角色/机位命中拖动仍走原对象编辑回调。 |
| 播放控制 | 播放→等待→停止，随后再次播放 | 当前帧前进、停止按钮和 `aria-pressed` 状态正确，停止后没有残留定时器。 |
| 独立页面 | 画布内视频/片场卡点击“独立页” | 生成 `/static/director-desk.html?id=...&node=...` 同源地址；独立页显示“与画布实时保存”，读取同一 stage 数据。 |

### 11.4 发布前桌面命令

```powershell
node --check static/js/video-workflow-panel.js
node --check static/js/video-workflow-schema.js
node --check static/js/video-workflow-adapter.js
node --check static/js/director-desk.js
python -m py_compile main.py
python -m pytest -q
node tests/video_workflow_unit.js
git diff --check
```

命令只验证本地代码和 mock/preview 路径，不调用付费生成服务，也不需要 Grok、手机号或第三方登录。发布者应在替换 `static/js/brand-config.js` 中的本人联系方式后，再用同样的桌面尺寸刷新一次。

### 11.5 已知边界（不阻塞桌面交付）

- Three.js 的世界坐标仍把实体相对高度限制在 8；UI 机位输入为了兼容旧数据允许到 12，超过 8 的值会由场景引擎按其既有规则钳制。若产品日后需要更高机位，应同步收窄 schema/UI 上限或扩展引擎，而不是在面板层偷偷改写。
- 真实远程 provider、录屏上传和大文件派生仍遵循第 0 节的本地预览边界；本轮不提交任何商业生成任务。
- 手机抽屉和窄屏断点不属于本次验收范围；桌面规则必须优先保持 1024px 以上的文字、控件和滚动可达性。

## 12. 桌面连线与界面动态效果（历史快照，2026-08-31）

本轮在不改变画布数据结构、命中区域或 Three.js 片场引擎的前提下，为“每根线”以及常用界面反馈补齐了轻量动态效果。动效只服务于状态识别，不引入会员、积分、付费生成或第三方运行时依赖。

### 12.1 连线渲染方案

- **普通画布（`static/js/canvas.js`）**：每条连接按 `base → glow → flow → core → spark → hit` 渲染。普通管线使用连续 `stroke-dasharray:none` 和滚动 SVG gradient，spark 只绘制细长 sheen/streak，并用 `animateMotion` 沿贝塞尔曲线以中速错峰移动；不绘制突兀的圆点或十字星。连接 ID 经 FNV-1a 生成稳定的速度、负延迟和相位，拖动节点重绘时不会全部同相或创建 RAF/定时器。`static/canvas.html` 已同步使用 `desktop-motion12` 脚本 cache-bust，避免旧缓存跳过动效。
- **状态反馈**：选中/悬停同步到三层视觉路径，悬停仅切换 class，不重建 SVG；临时连线和刀切轨迹采用独立速度。视觉层之后追加 `hit` 并保留 `pointer-events: stroke`，其他绘制层为 `pointer-events: none`，删除按钮和距离检测逻辑不变。
- **智能画布（`static/js/smart-canvas.js` + `static/css/motion-effects.css`）**：普通 `.conn-line` 保持可读底线并做低幅度滤镜呼吸，同时在其上叠加连续 `conn-flow-glow`/`conn-flow`/`conn-flow-core` 液体层和 `conn-flow-spark` 细长 sheen；`.conn-selected` 强化发光，`.conn-end` 轻微缩放。pending/cascade-active 继续由 `smart-canvas.css` 管理原有 dash-flow，避免重复动画；擦除态和运行中 `conn-reduce-motion` 强制停用；合并连接数超过 40 条时改用 `conn-dense-motion` 轻量模式。

### 12.2 其他桌面界面

- 新增 `static/css/motion-effects.css`，在 17 个已发布 HTML 页面统一加载（cache-bust：`desktop-motion12`）。覆盖页面淡入、侧栏/导航 hover、卡片阴影与错峰进入、按钮按压、导演台工具/对象树/时间轴、loading/status/toast/modal/empty-state 等；不覆盖可拖拽画布节点的 inline `transform`。
- 顶层 shell 使用 opacity-only 进入动画，避免持久化 transform 形成新的 fixed containing block；弹窗只对内部 panel 做 pop。所有动态规则均提供 `prefers-reduced-motion: reduce` 降级。
- 动效层只在客户端绘制，不向 API 发送额外字段，不读取或修改 `API/.env`、本地资产和用户联系方式。

### 12.3 动效验收

1. `node --check static/js/canvas.js`、`node --check static/js/smart-canvas.js`、`node --check static/js/director-desk.js`、`python -m py_compile main.py`。
2. **历史快照（desktop-motion12 当时）**：`python -m pytest -q` 曾为 `61 passed`；`node tests/video_workflow_unit.js`、`python tests/test_xyq_canvas_smoke.py` 和 `git diff --check` 当时通过。现行测试数量与结果只认第 14.10.5 节，避免把旧数字误当作发布门槛。
3. 浏览器 1280×720 只读复测：经典画布 3 条连接的 base/glow/flow/core/spark/hit 数量均为 3，flow computed `strokeDasharray=none`，细长 sheen/streak 的 `animateMotion` 正常运行；hit 仍为 `pointer-events=stroke`。智能画布 7 条连接的 line/flow/glow/core/spark/end/hit 数量均为 7，flow computed `strokeDasharray=none`、gradient `animateTransform` 和 sheen/streak 位置持续变化；spark 组不包含突兀圆点/星芒，hit 仍为 `pointer-events=stroke`，无控制台 error；导演台及素材页样式表加载成功且无新增布局/控制台错误。

### 12.4 连续液体材质与闪光（2026-08-31，desktop-motion12）

用户反馈“不要一段一段的”，因此连接材质改为连续的液体管线：

- `static/js/smart-canvas.js` 的 `renderConnections()` 在 base 与 hit 之间输出连续 `conn-flow-glow`、`conn-flow`、`conn-flow-core` 三层；普通状态明确 `stroke-dasharray:none`，不再把管线切成短段。
- 四组 SVG `linearGradient` 使用 objectBoundingBox 坐标和 `animateTransform`，让高光带沿整条线平滑滚动；颜色按普通/输入/历史/级联状态区分。管线自身只做低幅度呼吸，移动方向由独立的细长 sheen/streak 高光承担。
- 每条边增加一个 `conn-flow-spark`（SVG `animateMotion`）：细长 sheen/streak 沿同一贝塞尔曲线以约 2–4 秒周期缓慢移动；不再生成圆形 core、flare 或十字星芒，避免“一个点”抢视觉焦点。FNV-1a + 当前时钟生成错峰 duration/negative begin，重绘不会全部跳回起点。
- `static/js/canvas.js` 经典画布同步使用连续 gradient 管线和 `link-motion-spark`，保持 base → paint → spark → hit 顺序；hit 仍是唯一 `pointer-events:stroke` 交互层。
- 高负载 `conn-dense-motion` 保留可读的连续 base 线；超过 40 条边且不超过 900 条时，flow 按材质合并为最多 4 条 aggregate path，每种材质从视口邻近曲线中采样最多 48 条绘制路径，并保留最多 3 组低成本 sheen/streak 高光（不再让 500+ 条边各自创建动画标记）。超过 900 条仅保留连续 base 线，per-edge flow DOM 可继续存在以维持索引/擦除契约但由 CSS 隐藏；擦除态、显式 `conn-reduce-motion` 和 `prefers-reduced-motion` 会停用 SMIL/CSS 动画并隐藏 sheen/streak，避免性能和可访问性回退。
- 17 个桌面 HTML 页面及 `tests/test_motion_effects.py` 的 cache-bust 统一为 `desktop-motion12`。

验收（desktop-motion12）：

1. 智能画布 `6a06878a882b45c8b8f3493c025712ed`（1280×720）：7 条连接各有连续 flow/glow/core 与细长 sheen/streak spark，高光 `animateMotion` 数量为 7，computed `stroke-dasharray=none`，gradient `animateTransform` 持续更新；spark 组内不含圆形/星芒标记；截图 `output/smart-fluid-sheen.png`、`output/smart-fluid-flash.png`。
2. 经典画布 `758bbb8a0ee2407ca975c242fb49a7c9`：3 条连接各有连续 flow/glow/core 与细长 sheen/streak spark，hit 数量为 3 且 `pointer-events=stroke`；截图 `output/classic-continuous-spark.png`。
3. 大图 `91053f7c529d42558550f37331f3b258`（529 条边，阈值 40）进入 `conn-dense-motion`；当前实现按材质生成不超过 4 条 aggregate glow/tube，视口采样上限为 48 条曲线，每材质最多 3 组 sampled sheen/streak（此前探针为 2 条 aggregate、6 个高光组），per-edge flow DOM 仍保留但视觉隐藏；不引入逐帧 JS 循环。

## 13. LibTV 风格桌面视觉重构（2026-09-01，历史基线整理；主题基线为 libtv12）

用户反馈现有浅色“纸张/玻璃”界面和高饱和连线观感廉价，希望接近 LibTV 的深色无限画布。本轮只借鉴公开产品的视觉语言（深石墨画布、点阵网格、紧凑浮动工具栏、安静的节点卡片和状态色），不复制其品牌资源、会员中心、积分/付费入口或生成服务。参考资料：[LibTV 官方产品页](https://www.liblib.tv/) 与 [公开节点交互原型](https://github.com/JH8909/libtV-studio/blob/main/design/node-connect-preview.html)。

### 13.1 视觉目标与设计令牌

- **画布底色**：`#0b0d11`，叠加 24px 点阵和非常低对比度的径向暗角；节点/弹层使用 `#14171e`、`#1f2229` 两级石墨面，边框统一 `rgba(255,255,255,.085)`。
- **文字层级**：主文字 `#f2f4f7`，说明文字 `#9199a6`，弱提示 `#667181`；避免再次出现浅底白字导致“看不到字”。
- **状态色**：普通连线为低亮度灰蓝，输入/输出为青色/青绿，运行完成为柔和绿色，选中为紫色；青色只用于端口、焦点和沿线闪光，不把整张画布染成荧光色。
- **桌面框体**：901px 以上视口采用 12px 外沿和 18px 圆角的工作区框体，浏览器背景使用很弱的蓝青径向光，保留足够的无限画布面积；所有节点坐标仍在原 `.world` 坐标系中，不改数据。

### 13.2 文件与职责

1. `static/css/libtv-theme.css`：核心 LibTV-inspired 表现层。覆盖 smart/classic 画布、画布列表、节点卡片、提示词/素材/日志/工作流弹层、缩略图、minimap、端口和连线 paint；不改变事件命中层和 API。
2. `static/css/libtv-aux.css`（`libtv3`）：辅助工具页的 opt-in 深色层（资产库、剧本工作台、API/ComfyUI 设置、图片工具和 GPT 对话）。只作用于 `body.libtv-aux`，保留各页面布局与业务逻辑，并为长页面恢复独立纵向滚动。
3. `static/js/libtv-skin.js`：页面启动时添加 `libtv-surface`，按现有函数创建可复用的左侧垂直 rail（添加、连接、资产、历史、帮助），连接按钮只切换现有端口模式，Esc 可退出；不持有节点数据、不发起生成请求。
4. `static/index.html`、`static/home.html`、`static/smart-canvas.html`、`static/canvas.html`、`static/canvas-list.html` 以及 10 个辅助工具页：预置 `libtv-surface`；入口和首页使用 `index-libtv`/`home-libtv` 变体，三张画布页在原页面脚本之后加载 skin，所有主题引用的 cache-bust 为 `libtv12`；**本节当时的**经典/智能编辑脚本分别为 `fluid8`/`fluid11`，skin 为 `libtv6`。后续缓存版本已在第 14.9.1、14.10 节提升为 `fluid9`/`fluid13` 与 `libtv7`，入口首页 iframe 的版本号也同步刷新，确保旧缓存不会继续显示旧皮肤。
5. `static/css/canvas.css` 中的 3D 导演台继续由原引擎和面板负责；LibTV 皮肤仅通过后置 scoped 规则统一其面板/工具栏色板，Three.js 场景、拖拽、轨道和保存逻辑不重写。

### 13.3 交互约束

- rail 的“添加”按钮调用原 `openCreateMenu`，根据 classic/smart 的签名适配坐标；菜单仍由原节点类型入口负责。
- rail 的“连接”按钮只显示现有端口、切换 `libtv-connect-mode` 和提示，不接管拖线；`.conn-hit`/`.link-hit` 始终是最后一层且 `pointer-events:stroke`，flow 与 sheen/streak spark 永不抢命中。
- 资产、历史、帮助按钮调用现有面板/日志/快捷键函数；重复加载脚本不会创建第二个 rail。
- 普通连线保持连续 `stroke-dasharray:none` 的 gradient 管线和错峰细长 sheen/streak spark；选中、运行、待处理、历史状态分别使用令牌色，不使用分段短虚线伪装液体。
- `prefers-reduced-motion`、显式 `conn-reduce-motion`、擦除态和 dense 图继续隐藏 sheen/streak spark/停用 SMIL；批量删除、撤销、素材引用保护和本地开源运行边界不变。

### 13.4 开发步骤与验收

1. **加载检查（本节历史快照）**：入口、首页、画布列表、经典画布、智能画布、两个独立导演台和 10 个辅助页各只加载一次 `libtv-theme.css?v=2026.09.01.libtv12`；辅助页各只加载一次 `libtv-aux.css?v=2026.09.01.libtv3`，三张需要工具栏的画布页各只加载一次 `libtv-skin.js?v=2026.09.01.libtv6`；当时经典/智能脚本查询串分别为 `fluid8`/`fluid11`，无重复 rail、无新增网络请求。当前加载契约见第 14.9.1、14.10 节。
2. **视觉检查**：在 1280×720 和 1440×900 截图，核心画布与辅助页背景应为深石墨点阵/面板，节点和工具文字对比度至少达到 WCAG AA 的普通文本目标，rail、顶部工具和 minimap 互不遮挡主要节点；长辅助页可在文档内部滚动。
3. **交互检查**：点击 rail 添加打开原菜单；连接按钮显示提示、Esc 退出；资产/历史/帮助分别打开原面板；拖动节点、拖线、删除线和节点仍由原事件处理。
4. **连线检查**：smart 画布 7 条边各有 `conn-flow/glow/core/spark/hit`，spark 组只含细长 sheen/streak；classic 画布 3 条边各有 `link-motion-flow/spark/hit`；flow 的 computed `strokeDasharray` 为 `none`，hit 的 pointer-events 为 `stroke`。
5. **性能与降级**：常规图保持约 60fps；中型图使用最多 4 条聚合流体路径；超过阈值仅保留连续 base；系统减少动效时 sheen/streak spark 不显示且无控制台错误。
6. **开源约束**：不添加 Grok、会员、积分、钱包、手机号或付费生成功能；明确标记为 `vip`/`premium`/`paid`/`subscription`/`membership`（或中文付费标签）的模型/平台只在本地配置中保留，公共列表和请求入口会过滤；普通 `pro`/`plus` 自定义模型仍可用。联系方式继续由 `static/js/brand-config.js` 的本地配置提供，皮肤层不写死第三方品牌。

### 13.5 验证命令

```powershell
node --check static/js/smart-canvas.js
node --check static/js/canvas.js
node --check static/js/libtv-skin.js
python -m pytest -q
node tests/video_workflow_unit.js
python tests/test_xyq_canvas_smoke.py
git diff --check
```

浏览器验收截图保存在 `output/qa-libtv-smart-final.png`、`output/qa-libtv-classic-final.png`、`output/qa-libtv-root-final.png`、`output/qa-libtv-home-final.png` 和 `output/qa-libtv-aux.png`；这些截图只作为本地回归证据，不包含远程生成或付费服务调用。


### 13.6 复测记录（早期视觉重构阶段的历史快照）

- 入口 `index.html`、首页 `home.html`、三核心编辑页、两个独立导演台和 10 个辅助工具页统一加载 `libtv-theme.css?v=2026.09.01.libtv12`；辅助页另加载 `libtv-aux.css?v=2026.09.01.libtv3` 并使用 `libtv-aux`，入口/首页分别使用 `index-libtv` 与 `home-libtv`，不会从暗色画布跳回浅色设置/素材页。独立 `home.html` 在 720px 高度下保留纵向滚动，底部项目卡不会被裁掉。
- `StudioTheme` 在 LibTV 表面保留为两档石墨对比度：默认是标准深色，切换到 `theme-dark` 后提高面板、文字和焦点环对比度，仍不会回落到旧纸白主题；入口 iframe 会同步该状态。
- `.vwf-stage` 的 bar、对象/资产栏、中心 viewport HUD、相机预览、右侧检查器和时间轴都使用同一组石墨令牌；经典节点的上传占位、资产工具条、视频工具条和提示摘要的白色硬编码已在 scoped 规则中暗覆，上传媒体像素不改。
- Playwright 1280×720 只读复测：smart 7 条边、classic 3 条边、rail 各 1 个，所有页面无 `pageerror`/`requestfailed`；stage computed 背景 `rgb(20, 23, 30)`、viewport `rgb(13, 17, 23)`；Three.js 轨道拖动、机位/比例/播放/路径入口均保留。
- 入口和首页在 1024/1280/1366/1440/1920 桌面宽度下均保持根框体无水平溢出，根导航、联系人弹窗和主题同步均保持；首页/辅助长页保留文档内纵向滚动。截图 `output/qa-root2-index.png`、`output/qa-root2-home.png`、`output/qa-root2-index-dark.png`、`output/qa-libtv-aux.png`。
- 首页和辅助长页的原生滚动条已同步为石墨轨道/滑块，保留滚动可达性但不再出现突兀的白色浏览器边条。
- **历史快照（早期视觉重构阶段）**：`python -m pytest -q` 当时为 67 passed（3 个既有弃用 warning，含辅助页契约）；其余 Node/smoke/语法检查也在当时通过。现行结果以第 14.10.5 节为准。


## 执行策略覆盖说明（2026-09-01）

原始任务文档中的“调用 Grok/外部编码器”步骤已由用户明确取消。本实现、审查、浏览器走查和测试全部由本地 Codex 工具与工作区代码完成；不创建、不启动、也不依赖 `_run_grok.cmd` 或任何 Grok 进程。后续以本计划的本地实现和验收记录为准。

## 14. LibTV 风格与连续流体材质的最新审计快照（2026-09-01）

本节覆盖最近一轮“做成 LibTV 那样、线条要自然连续并带闪光、只支持电脑端、继续修复可用性”的实现状态。它是对第 12、13 节的增量记录；若旧节中的版本号、测试数量或“全部通过”表述与本节冲突，以本节的审计快照为准。实现仍然是 LibTV 的**公开视觉语言借鉴**，不是复制其品牌、素材、账户体系或付费能力。

### 14.1 当前交付面与版本矩阵

| 面 | 当前实现 | 责任文件 | 当前 cache-bust |
| --- | --- | --- | --- |
| 核心深色皮肤 | 深石墨底、点阵网格、两级面板、低对比边框、青/紫状态色、桌面工作区框体、原生滚动条暗化 | `static/css/libtv-theme.css` | `libtv12` |
| 辅助页深色皮肤 | 资产、脚本、API、工作流、角度、增强、在线、GPT 等长页的 scoped dark surface 和独立滚动 | `static/css/libtv-aux.css` | `libtv3` |
| 画布/列表工具 rail | 添加、连接、资产、历史、帮助；仅委托已有函数，不接管数据和生成 | `static/js/libtv-skin.js` | `libtv7` |
| 画布上下文 ribbon | 将超宽说明/提示节点收纳为紧凑可读的上下文条，保留原节点可编辑性，悬停/聚焦可还原原卡片 | `static/js/libtv-skin.js`、`static/css/libtv-theme.css` | `libtv7` |
| 共享动效与列表首屏聚焦 | 连续管线、细长 sheen/streak 高光、减动效降级；历史稀疏画布只在首屏安静显示最近紧凑簇，拖拽/滚轮后恢复全部卡片 | `static/css/motion-effects.css`、`static/css/canvas-list.css` | `desktop-motion14` / `focus1` |
| 画布列表排版 | 碰撞检测、确定性环形找位、只保存被修复的坐标 | `static/js/canvas-list-layout.js` | `libtv1` |
| 列表交互 | 批量操作、回收站、撤销/恢复、键盘打开、项目行键盘选择、确认弹窗 | `static/js/canvas-list.js` | `layout6` |
| 经典/智能连线 | 连续 gradient 管线、液体高光、错峰细长 sheen/streak、中速移动、命中层隔离 | `static/js/canvas.js`、`static/js/smart-canvas.js` | `fluid9` / `fluid13`（智能画布） |

上述资源已在 7 个核心/独立舞台页面和 10 个辅助工具页中各加载一次；源码中的根入口 `frame-home`、`frame-canvas` 分别带有 `home.html?v=2026.09.01.libtv12` 与 `canvas-list.html?v=2026.09.01.layout6`。`main.py` 的 `versioned_static_html()` 在服务端响应时会再按 `VERSION`（当前工作区为 `2026.08.27`）和文件修改时间重写静态资源查询参数，所以通过 HTTP 根 `/` 看到的最终 query 可能是 `2026.08.27.<mtime>`；这只是缓存键，不会回退到旧文件。部署后应以实际 HTTP 响应和资源内容为准，不要只依据源码中的查询串判断缓存是否命中。

### 14.2 LibTV 桌面视觉实现

1. **层级和对比度**：页面底色为 `#0b0d11`，节点/弹层使用 `#14171e`、`#1f2229`，主文字 `#f2f4f7`、说明文字 `#9199a6`、弱提示 `#667181`；按钮、输入框、导演台检查器和时间轴共享同一组 token，避免旧浅底白字再次“看不到字”。
2. **无限画布感**：点阵背景和径向暗角只绘制在 viewport，不改变节点的世界坐标；桌面视口保留 12px 外沿和圆角工作区，拖拽、缩放、minimap 继续使用原坐标/事件逻辑。
3. **工具层**：`libtv-skin.js` 是 presentation-only 适配器，重复加载有幂等保护；“连接”按钮只切换既有连接模式并可用 Esc 退出，`.conn-hit`/`.link-hit` 始终是最后一层且承担唯一命中，paint 层不会抢拖线或删除事件。
4. **桌面边界**：产品验收基线是 1024px 及以上的桌面宽度；导演台内部滚动只发生在检查器和时间轴容器，舞台不再把文档无限向下撑开。移动断点可保留源代码，但不作为本轮交付标准。
5. **上下文可读性**：智能画布的超宽说明节点会在桌面视口顶部生成 compact context ribbon；原节点仍保留在画布中并可通过悬停、聚焦或“编辑”按钮恢复，不改变数据模型或节点坐标。 顶部 veil 只压低世界内容，标题、返回按钮和经典 topbar 统一提升到 `z-index: 64`，旧卡片不会再盖住标题文字。
6. **减动效**：`prefers-reduced-motion: reduce`、显式 `conn-reduce-motion`、擦除态和大图降级会隐藏 sheen/streak 高光并停止 SMIL/CSS 动画；静态管线和交互命中仍保留。

### 14.3 连续自然流体与闪光材质

- 智能画布每条普通边按 `conn-flow-glow → conn-flow → conn-flow-core → conn-flow-spark → conn-hit` 组织；经典画布按 `base → paint/flow → spark → hit` 组织。普通 flow 明确 `stroke-dasharray: none`，所以不会再出现一段一段的假液体。
- gradient 使用 objectBoundingBox 坐标和 `animateTransform` 平滑滚动，边的颜色/亮度按输入、输出、历史、级联状态变化；`conn-flow-spark` 使用 `animateMotion` 沿同一 Bézier 曲线以约 2–4 秒中速移动，只包含细长 sheen 与 streak 椭圆，不含圆形 core、halo、flare 或十字星芒，避免“一个点”抢视觉焦点。FNV-1a 生成稳定 duration、负延迟和相位，重绘或拖动节点时不会全部同相跳回起点。
- 连线数量超过 40 时进入 `conn-dense-motion`：最多 900 条边按材质聚合为不超过 4 条连续 paint path；每种材质从视口邻近曲线中采样最多 48 条绘制路径，并保留最多 3 组低成本 sheen/streak 高光；超过 900 条仅保留连续 base 线（flow DOM 可继续存在以维持索引契约，但视觉上隐藏）。这避免了逐边 RAF/定时器和大图卡顿。
- sheen、glow、core 的 `pointer-events` 均为 `none`；命中和拖线仍只由透明 stroke hit 层处理。浏览器端需检查 computed `strokeDasharray=none`、spark 数量、spark 子树 `hasCircle=false`（端点/删除 affordance 的圆形仍按交互契约保留）和 `pointer-events=stroke`，不能只看静态源码。

### 14.4 画布列表碰撞、视口和键盘可用性

1. `CanvasListLayout.resolve()` 使用 248×150 卡片、276/176 步长和确定性环形搜索；有效且不重叠的历史坐标原样保留，缺失/非法/重叠项移动到最近空槽。`moved` 数组只包含确实变化的记录，`canvas-list.js` 以每批 8 条的队列异步写回，避免 100+ 个并发请求拖慢首屏。该修复针对历史数据中大量相同坐标和极端稀疏坐标，不重写画布内容或节点数据。
2. 列表 reset 使用 `READABLE_RESET_SCALE = 0.78` 和 `RESET_FOCUS_CARD_LIMIT = 16`：在 1280×720 桌面视口中将首屏卡片维持约 194px 宽（旧 0.58 仅约 147px，标题和元信息难以辨认）；当“适配全部”会把卡片缩得不可读时，`readableFocusSelection()` 从最近 48 条记录中以 24 条窗口/锚点做确定性最近邻排序，选出最多 16 张紧凑卡片放入可读视口，其他世界坐标仍可拖拽/滚轮探索；旧的 `Math.max(0.9, fitScale)` 已移除。该选择只改变 viewport，不写 `board_x/board_y`。iframe 首次布局尺寸为 0 时，`scheduleInitialReadableReset()` 按 `[0,80,220,500,1000]ms` 有界重试；用户开始 pan/wheel 后立即取消重试，避免迟到的 layout 回调把用户视口拉回去。
3. 卡片使用 `role=article`、`tabIndex=0`、`aria-selected`、`aria-label` 和 `aria-keyshortcuts=Enter Space`；Enter/Space 打开画布且阻止页面滚动，嵌套 checkbox/更多菜单不被误触发。项目行使用 `role=button`、`tabindex=0` 和 `aria-pressed`，Enter/Space 选择项目；批量工具栏和确认对话框保留 Esc、焦点回收和部分失败反馈。
4. 列表批量删除仍遵守“先回收站、再二次确认永久删除、引用内容跳过”的服务端契约；本轮排版修复仅写 `board_x/board_y` 元数据，不会触发删除。

### 14.5 智能画布旧视口迁移

`static/js/smart-canvas.js` 现在把服务端保存的旧缩放值（`scale < 0.40`）在桌面端迁移到 `0.52–0.62` 的可读区间，并用当前 shell 中心反算/保持世界中心。迁移状态与画布一起保存为 `smartReadableViewportVersion: "v1"`；用户主动平移、缩放、居中或“适配全部”会先写 `smartViewportUserAdjusted: true`，后续刷新不会把用户刻意的缩小视图再放大。迁移只在桌面条件（shell 至少 900px 且 `matchMedia('(min-width: 769px)')`）生效，不使用跨标签共享的 localStorage 标记；已有最近运行设置等业务 localStorage 不受影响。

### 14.6 联系方式和开源边界

- `static/js/brand-config.js` 是唯一的项目品牌/联系方式入口；当前默认值为“画布实验室 / CL / deathcmd”，并展示 `2734891913@qq.com` 与 `https://x.com/deathcmd527`。`static/js/brand-ui.js` 会在入口、首页、导演台及 10 个辅助工具页统一渲染“联系我”弹窗。
- 发布前应直接编辑 `brand-config.js` 的 `appName`、`shortName`、`maintainerName`、`contacts`、`repositoryUrl`、`issueUrl`，填入发布者自己的公开信息；在用户尚未提供真实联系方式的情况下，不能擅自替换成猜测的邮箱、群号或 URL。
- 本轮没有会员、积分、钱包、手机号、付费开关或远程生成依赖，不调用 Grok；所有批量删除、流体动效、视口迁移和付费模型标签过滤都在本地开源数据和现有 API 契约内完成。发布包仍不得包含 `API/.env`、浏览器会话、个人数据和临时截图。
- `static/seedance25-video-workflow.json` 虽保留旧导出文件名以便迁移，payload 已改为中性的本地视频预览（provider/model/计费字段为空、默认短时长），并由 `tests/test_open_source_audit.py::test_model_agnostic_workflow_contract` 中的 fixture 契约锁定；不把旧文件名误当成运行时厂商选择。

### 14.7 审计时验证结果（2026-09-01 历史快照）

> 本节记录 `fluid8`/`fluid11` 与 105-test 基线完成时的增量结果，现已由第 14.9、14.10 节的资源矩阵和最终复测取代；保留它仅用于追溯，不作为当前发布门槛。

以下结果来自工作区当前源码快照；“通过”仅表示该命令在本次审计中返回成功，不代表尚未修复的静态契约失败可以忽略。

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `python -m pytest -q`（历史快照） | **105 passed, 3 warnings** | 当时统一 `libtv12` 主题、`fluid8`/`fluid11` 连线脚本、`desktop-motion14` 动效缓存契约，加入导演台横向布局与 resize floor 回归契约，以及无圆点的细长 sheen/streak 画布材质后复测通过；warning 仅为 FastAPI `on_event` 与 Pydantic `.dict` 的弃用提示。 |
| `node --check static/js/smart-canvas.js` | 通过 | 流体、dense 聚合和旧视口迁移脚本语法正确。 |
| `node --check static/js/canvas.js` | 通过 | 经典连续管线脚本语法正确。 |
| `node --check static/js/canvas-list.js` / `canvas-list-layout.js` / `libtv-skin.js` | 通过 | 列表排版、键盘和 rail 语法正确。 |
| `python -m py_compile main.py` | 通过 | 后端批量接口和静态版本重写可编译。 |
| `node tests/video_workflow_unit.js` | `OK` | 导演台 schema/适配器单元测试通过。 |
| `python tests/test_xyq_canvas_smoke.py` | `OK` | 现有画布烟测通过（若服务刚重载可重跑一次，测试不提交真实删除/生成请求）。 |
| `git diff --check` | **通过（exit 0）** | 输出仅包含工作区 LF→CRLF 换行提示，无空白错误；未使用 `git reset` 覆盖其他未提交改动。 |
| 浏览器只读复测 | 核心页通过；无圆点与中速检查通过；context ribbon 通过；根页需区分宿主注入日志 | 1280×720 新开的 smart/classic 标签显示 LibTV 深色界面；智能画布 7 条连接、经典画布 3 条连接的 flow 均为连续 `strokeDasharray=none`，spark 组只含 `animateMotion + ellipse.sheen + ellipse.streak`，`spark > circle/path = 0`，智能样本 `animateMotion` 为 2.35–3.18s、sheen 2.6s、streak 2s，经典首条为 2.35s；hit 仍是唯一 `pointer-events=stroke`。截图：`output/qa-libtv-smart-no-dot.png`、`output/qa-libtv-classic-no-dot.png`。根页曾出现来自 Electron/浏览器注入脚本的 `MutationObserver.observe` TypeError，栈不指向应用 bundle；各页仍可能有 Tailwind production warning，均不能当作业务回归。 |

**历史发布门槛（14.8 快照）**：本轮当时完成了 `libtv12`/`fluid8`/`fluid11`/`desktop-motion14` 资源统一，普通 spark 组不含圆形/星芒且中速运行；经典画布导演台在 1280×720 实测为有限的 1280×720 横向节点，stage 内部 `1254×627`，文档无纵向溢出；pytest `105 passed, 3 warnings`、Node/Python/smoke、活动脚本语法和 `git diff --check` 均通过。截图路径仍作为本地回归证据，不随发布包提交。列表的最近邻紧凑簇、`READABLE_RESET_SCALE=0.78`、`layout6`/`focus1` cache 和有界 iframe 重试已经落地；交互检查补上空态双击防抖、rail 鼠标事件隔离、工具弹层焦点回收与 Tab 循环；静态 HTML 源文件保持语义 cache 标签，启动不再原地改写，HTTP 响应才按文件版本动态加缓存键。当前发布门槛与版本矩阵见第 14.10.5 节。

## 14.8 画布内导演台横向布局修复（2026-09-01，历史快照）

本轮针对“画布里的导演台无限往下延伸、竖着窄、中央视口只剩一条”的实际回归完成根因修复。问题不是 Three.js 场景本身，而是旧 `stageHost` 视频节点没有保存 `w/h`：渲染时落回普通视频卡的 `720px` 宽和自动高度；同时 `.vwf-stage` 的 `min-height:520px`、旧工作台固定行高和 `.node.video-node .node-body { overflow:visible; }` 让内部内容以固有高度不断向下撑开，三栏网格在缩放后只留下窄中央列。当前发布版本与缓存标签请以第 14.9.1、14.10 节为准。

### 实施内容

1. `static/js/canvas.js` 将导演台尺寸集中为不可变默认值：
   - 画布内 `stageHost`：`1280×720`；
   - LTX 导演台：`1280×760`；
   - 普通视频节点仍保持原来的 `720px` 宽/自动高度。
2. `defaultNodeSize(type, node)` 改为节点感知：已有历史节点即使服务端没有 `w/h` 也会在渲染、首屏聚焦、缩放和小地图测量时使用横向导演台尺寸；用户已经保存的自定义宽高优先，不被覆盖。新建导演台直接持久化 `w/h`，避免再次回退。
3. `static/css/canvas.css` 为 stage host 建立完整的有界 flex 链：节点、`node-body`、`stage-host-body`、workflow panel 和 `.vwf-stage` 均设置 `min-width:0/min-height:0`、`height:100%`、`overflow:hidden`；嵌入舞台取消旧的最小高度约束，让 `.vwf-stage-studio` 的 `minmax(0,1fr) 156px` 行在有限矩形内分配空间。LTX 的提示、参数、时间轴、舞台、参考素材和运行栏也改为可收缩分区，内部只在时间轴/检查器滚动。
4. 桌面端保留至少 `960px` 的导演台工作宽度、`520px` 的可用高度；缩放手柄与 CSS 使用同一最小值，避免把小于视觉下限的逻辑尺寸写回后产生下一帧跳变。已有 `@media (max-width:760px)` 明确覆盖为 `calc(100vw - 28px)`，因此不会把桌面最小宽度带到窄屏。普通视频节点不继承导演台默认尺寸。
5. `canvas.html`、`director-desk.html`、`stage-desk-smoke.html` 的 canvas 样式版本提升为 `canvas3`，经典画布脚本在**当时快照**提升为 `fluid8`，确保旧缓存标签页拿到本次布局契约；当前脚本版本见第 14.9.1 节。

### 验收证据

- 1280×720 本地画布：stage host 节点 computed `1280×720`（浏览器缩放后可视约 `665.6×374.4`），内部 `.vwf-stage` `1254×627`，网格列为 `56px 196px 732px 268px`、行 `421px 156px`；`document/body scrollHeight` 均为 `720`，`overflow:hidden`，没有向下无限撑开。
- 全屏展开/退出：`.vwf-stage.is-desk` 固定为 `1280×720`，`body` 保持 `720` 高且无滚动；退出后恢复有限的横向节点尺寸。
- 独立导演台页：舞台 `1248×620`，网格列 `56px 196px 726px 268px`、行 `414px 156px`，文档无溢出。
- 新增 `tests/test_director_layout.py` 六项静态回归契约，锁定尺寸、legacy 兜底、新节点持久化、flex containment、resize floor、移动覆盖和 cache-bust；全套 pytest 在本轮复测为 `105 passed, 3 warnings`。
- 视觉截图：`output/qa-director-horizontal-final.png`（不随发布包提交）。

## 14.9 继续优化后的发布文档校准（2026-09-01）

本节是第 14.8 节之后的文档增量，专门校准资源版本、并发持久化、辅助页面交互和开源发布边界。第 12、13 节以及第 14.1/14.7 节中的旧版本号和测试数量保留为历史记录；若与本节冲突，以本节和最终发布命令的实际输出为准。

### 14.9.1 当前静态资源矩阵（以源码为准）

- `libtv-theme.css` 当前为 `2026.09.01.libtv12`，`libtv-aux.css` 为 `2026.09.01.libtv3`，`motion-effects.css` 为 `2026.08.31.desktop-motion14`。17 个静态 HTML 页面均加载主题和动效；其中 10 个辅助页额外加载 `libtv-aux.css`。
- 经典画布脚本为 `canvas.js?v=2026.09.01.fluid9`，智能画布为 `smart-canvas.js?v=2026.09.01.fluid13`；画布列表为 `canvas-list.js?v=2026.09.01.layout6`，列表排版解析器为 `canvas-list-layout.js?v=2026.09.01.libtv1`。
- `libtv-skin.js` 当前为 `libtv7`，挂载在画布列表、经典画布和智能画布三张工作台；`i18n.js` 统一为 `2026.09.01.opensource8`，解决浏览器旧缓存导致的 `videoWf.*`/`smart.shortcutRedoAlias` 原始键名泄露；剧本工作台脚本为 `script-studio.js?v=2026.09.01.studio4`。
- 品牌脚本保持 `brand-config.js?v=2026.09.01.brand2` 与 `brand-ui.js?v=2026.09.01.brand4`。`main.py` 的静态 HTML 服务只在 HTTP 响应阶段追加版本/mtime 查询串，不在启动时改写工作区文件；因此源码中的语义 cache 标签应继续保持可读且稳定。

### 14.9.2 数据一致性与并发安全增量

1. 画布标题、图标、颜色、负责人和置顶等轻量修改统一走 `POST /api/canvases/{id}/meta` 的读-改-写事务，不再用缺省 `logs/nodes/connections` 的完整 PUT 覆盖编辑器数据；完整画布保存、触碰、软删除、恢复和彻底删除均在 `CANVAS_LOCK` 下原子写入。活动画布禁止直接 purge，引用中的共享素材会返回 `skipped`。
2. 画布、项目、对话和生成历史分别使用锁与同目录临时文件 + `os.replace` 原子持久化；严格校验 opaque ID，拒绝空白、路径片段和跨用户路径。历史清理在引用检查完成后再串行删除物理文件，坏 JSON 不会覆盖最近一次可读快照。
3. WebSocket `ConnectionManager` 的反向索引清理幂等；同一 `client_id` 重连会淘汰旧 socket，广播/个人发送失败会清掉失效连接，不留下幽灵订阅或重复通知。

### 14.9.3 页面交互和可读性增量

- 入口路由恢复覆盖完整注册表（包括 `zimage`），启动存储通过容错读写包装器完成；初始 iframe 激活延后一帧，避免 Tailwind/宿主观察器竞态。剧本解析器支持无空格中英文冒号及“第一场/第二镜/分镜二”等中文编号；存储被禁用时仍会继续导航到新画布。
- 画布列表与素材库刷新采用 generation + `AbortController` 的 latest-wins 状态机；并行快照用 `Promise.allSettled`，可选接口短暂失败时保留最近一次成功数据，服务端 `skipped` 项和二次确认状态不会被迟到响应抹掉。
- 列表卡片、项目行、批量工具栏、动态素材控件、API/ComfyUI/GPT 模板和导演台图标按钮均补齐键盘语义、`aria-label`/`title`、焦点回收与 Tab 循环；智能画布 fit 会过滤无效矩形，在桌面大图上动态降低缩放以真正包含节点/连线（仅极端尺寸保留 `0.08` 安全下限），context ribbon 的“聚焦/编辑”会真正定位并聚焦原文本节点。
- 工作流上传、文件取消、录屏、截图/渲染、预览刷新和 3D 路径坐标均在事件边界内处理失败；时间线帧号按持续时长钳制且仍保留未来关键帧，导演台对象/道具/机位和独立页面继续使用同一 stage 数据。
- 经典/智能画布的拖放导入、跨标签配置刷新、启动流程和素材文件夹操作均有最终 Promise 错误边界；隐藏文件选择器仍保留原有点击流程，同时补齐 `aria-label`/`title`，便于桌面键盘与辅助技术识别。

### 14.9.4 开源与联系方式校验

- 默认路径仍为本地 mock/preview，不需要手机号、验证码、会员、积分、钱包、付费额度、Grok 或任何第三方登录；明确标记为 `vip`/`premium`/`paid`/`subscription`/`membership`（及中文付费标签）的 provider/model 在公开列表和运行入口过滤，普通 `pro`/`plus` 自定义模型不被误伤。
- `static/js/brand-config.js` 中的维护者显示为 `deathcmd`，公开联系邮箱为 `2734891913@qq.com`，X 主页为 `https://x.com/deathcmd527`；联系方式通过 `brand-ui.js` 安全渲染，发布包不写入 API Key、会话或本地路径。当前可写目标仓库为 `https://github.com/deathcmd/Infinite-Canvas`，`repositoryUrl` 与 `issueUrl` 已同步填写。
- `static/seedance25-video-workflow.json` 仅保留旧文件名作迁移别名，payload 仍为无 provider/model/计费字段的本地视频预览；发布包不应包含 `API/.env`、个人素材、浏览器会话、测试截图或临时数据。

### 14.9.5 最终验收记录

本次在当前工作区已执行以下命令；结果记录在这里，后续若代码继续变更仍应重新运行（不要凭历史快照填写）：

```powershell
python -m pytest -q
python -m py_compile main.py
node --check static/js/canvas.js
node --check static/js/smart-canvas.js
node --check static/js/canvas-list.js
node --check static/js/asset-manager.js
node --check static/js/canvas.js
node --check static/js/smart-canvas.js
node --check static/js/script-studio.js
node --check static/js/director-desk.js
node --check static/js/video-workflow-panel.js
node --check static/js/video-workflow-schema.js
node --check static/js/video-workflow-adapter.js
node tests/video_workflow_unit.js
node tests/script_studio_unit.js
node tests/canvas_list_layout_unit.js
python tests/test_xyq_canvas_smoke.py
git diff --check
```

截至 2026-09-01 的最终复测结果（当前工作区）：`python -m pytest -q` 为 **227 passed, 4 subtests passed in 24.02s**；加严模式 `python -m pytest -q -W error` 为 **227 passed, 4 subtests passed in 23.42s**，均无 warning。此前的 `23.28s`/`24.68s`、`24.60s`/`26.06s` 是同一工作区的较早耗时快照，`211 passed, 4 subtests passed in 12.45s` 则是更早快照，均保留作历史对照，不再作为当前发布门槛。核心脚本 `node --check` 全量扫描、3 个 Node 单元、`python -m py_compile main.py`、`python tests/test_xyq_canvas_smoke.py` 和 `git diff --check` 均返回成功；后者仅提示工作区 LF→CRLF 换行转换，不是空白错误。

浏览器只读复测至少覆盖 1280×720 的入口、画布列表、智能/经典画布、独立导演台、素材库、剧本、API/ComfyUI、图片工具和 GPT 页面；逐页记录 `pageerror`/`requestfailed`、无 raw `videoWf.*`、无横向/纵向意外溢出、连接 `stroke-dasharray=none`、spark 子树无圆点/星芒且命中层仍为 `pointer-events:stroke`。第 14.8 节的 `105 passed, 3 warnings`、第 14.9 节早期的 `211 passed` 和更早数字均为历史快照；当前最终数字与增量证据见第 14.10 节。


## 14.10 继续优化后的最终增量与发布验收（2026-09-01）

本节是当前工作区的最终校准，承接第 14.9 节的并发、缓存和辅助页面修复；第 12、13、14.1/14.7 节以及第 14.9 节原始数字继续保留为历史记录。以下条目均在不调用 Grok、不增加付费服务依赖、只面向桌面端的前提下完成。

### 14.10.1 异步错误边界与媒体操作

- `static/js/canvas.js`、`static/js/smart-canvas.js`、`static/js/video-workflow-panel.js`、`static/js/script-studio.js` 对拖放解析、资产/工作流/场景/音频/蒙版上传、脚本导入、资产管理器 delegated CRUD、启动和跨标签刷新增加统一 `try/catch`/失败提示/输入重置；HTTP 非 2xx 也会进入可见错误状态，不再产生未处理的 Promise rejection。
- `tests/test_frontend_async_boundaries.py` 新增并覆盖经典/智能拖放、上传、脚本导入、资产管理器和启动边界；定向 `python -m pytest -q tests/test_frontend_async_boundaries.py tests/test_dynamic_control_a11y.py` 复测为 **9 passed**。

### 14.10.2 智能画布 fit 动态下限与词典缓存

- 智能画布 fit-all 先依据有效节点/连线边界计算缩放，再按桌面可读策略动态降低比例；只有极端大图才触及 `0.08` 安全下限，旧的固定/过度放大行为不会覆盖用户主动平移或缩放。新增/更新 `tests/test_smart_canvas_fit_focus.py` 和 `tests/test_smart_viewport.py` 锁定无效矩形过滤、世界中心保持、用户调整标记与桌面专属迁移。
- 所有页面的 `i18n.js` cache-bust 统一为 `2026.09.01.opensource8`，覆盖撤销/重做别名和智能画布新键，避免旧缓存显示 `videoWf.*` 或 `smart.shortcutRedoAlias` 原始键名；对应 `tests/test_i18n_cache_bump.py` 与静态缓存契约已纳入全套测试。

### 14.10.3 编辑历史、原子库写入与连接状态

- 经典与智能画布各自维护文档级 undo/redo 栈：新分支清空 redo，加载/合并/离开文档重置历史，Ctrl/Cmd+Z、Ctrl/Cmd+Y 与 Shift+Z 受输入框/弹层上下文保护；对应 `tests/test_canvas_undo_redo.py` 六项契约通过。
- 资产库与提示词库的改名/删除采用锁内 load→merge→atomic replace，不会因并行读取把另一标签页的更新覆盖；`tests/test_library_mutation_atomicity.py` 覆盖资产与提示词交错写入。
- 根入口状态请求增加 in-flight 去重；统计 WebSocket 对 JSON 解析、编码后的 client id、连接失败和关闭事件做边界处理，并采用指数退避重连与卸载清理。`tests/test_index_route_restore.py` 同时锁定路由注册表、存储容错和 socket reconnect/backoff。后端 `ConnectionManager` 的反向索引清理仍保持幂等，旧 socket 不会移除新 socket。

### 14.10.4 可访问性与缓存契约

- 动态引擎/画布/导演台/素材控件、隐藏文件选择器、项目行和批量工具栏补齐显式 `aria-label`/`title`、键盘激活与焦点回收；`tests/test_dynamic_control_a11y.py`、`tests/test_ui_a11y.py`、`tests/test_libtv_interaction_a11y.py` 共同保护该契约。
- 活动 CSS、画布脚本和入口路由不再复用 pre-LibTV cache key；源码 HTML 保持语义版本，服务端仅在 HTTP 响应阶段附加 `VERSION`/mtime，启动不会原地改写静态文件。

### 14.10.5 最终自动化与浏览器证据

最终当前工作区验证：

```text
python -m pytest -q              -> 227 passed, 4 subtests passed in 24.02s
python -m pytest -q -W error     -> 227 passed, 4 subtests passed in 23.42s
python -m py_compile main.py     -> success
node --check static/js/**/*.js   -> success（递归 32 个活动脚本，排除 vendor/backup/broken-before/stable-before/mojibake）
node tests/video_workflow_unit.js
node tests/script_studio_unit.js
node tests/canvas_list_layout_unit.js -> OK / OK / OK
python tests/test_xyq_canvas_smoke.py -> OK
git diff --check                -> exit 0（仅换行转换提示）
```

新鲜桌面浏览器只读走查以 1280×720 为主，入口、画布列表、经典/智能画布、独立导演台及辅助页面均保持可读深色壳层；经典/智能连接 computed `stroke-dasharray=none`，spark 仅含细长 `sheen/streak`，无圆点/星芒，命中层仍为唯一 `pointer-events:stroke`；导演台内部为有界横向布局，页面无意外水平/垂直溢出。回归截图包括 `output/qa-libtv-root-final.png`、`output/qa-libtv-smart-final.png`、`output/qa-libtv-classic-final.png`、`output/qa-director-horizontal-final.png`、`output/qa-libtv-smart-no-dot.png` 和 `output/qa-libtv-classic-no-dot.png`（均为本地证据，不随发行包提交）。

当前仍需发布者持续维护 P0 发行卫生：联系方式和仓库地址已经填入 `static/js/brand-config.js`，每次发布前仍须排除 `API/.env`、本地数据、个人素材、浏览器会话与测试截图，并复跑公开发布检查器。
