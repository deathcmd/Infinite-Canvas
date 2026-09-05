# Canvas Lab

Canvas Lab 是一个面向个人创作者的本地 AI 创作工作台。它把图片、视频、音频、提示词、资产和 3D 场景放在同一张可连线画布上，支持离线预览，也支持接入你自己选择的模型服务。

## 项目定位

- 开源、可自托管、以本地素材为中心。
- 不绑定某个商业模型、平台账号或云端套餐。
- 未配置生成引擎时使用本地 mock / preview，不伪造云端生成成功。
- 默认不上传本地素材；只有在你主动配置 provider 并执行任务时才会发出请求。
- 原始任务文档中的 Grok/外部自动编码步骤已由用户取消；本仓库的实现、审查和测试均由本地 Codex 与工作区工具完成，不创建或启动 `_run_grok.cmd`。

## 已包含能力

- 无限画布：角色、场景、3D 导演台、文本、图片、视频、音频和循环节点。
- 节点拖拽、连线、拓扑执行、工作流 JSON / ZIP 导入导出。
- 参考图类型：首帧、尾帧、遮罩、背景、角色、场景、风格、构图、运动等。
- 视频辅助工具：抽帧、提升画质、截取、音频分离、裁剪、解析、拉片和智能抠像入口。
- 3D 导演台：对象、角色、道具、机位、动作、运镜、材质、关键帧、轨迹和布局参考截图。
- 画布内导演台默认使用 `1280×720` 横向工作区（LTX 为 `1280×760`），旧节点无尺寸字段时也会自动套用有限高度；内部舞台、时间轴和检查器各自收缩/滚动，不会把画布文档无限向下撑开。
- 资产库：图片分组、角色 / 场景资产卡、画布与资产互相拖放。
- Chrome 素材桥和 Photoshop 资产桥（位于 `tools/`）。
- Provider 适配：本地 ComfyUI、OpenAI-compatible 服务，以及项目中已有的可选 provider。
- 视频节点默认没有远程平台或模型；未配置 provider/model 时点击生成只创建带“本地预览”标记的可复核结果。旧项目中的外部 provider 配置可迁移，但不会自动发起请求。
- 主界面品牌和联系人集中在 `static/js/brand-config.js`；发布前只需替换维护者名称、邮箱、主页或 Issue 链接，侧栏“联系我”弹窗会自动同步。素材库、API、ComfyUI、图片工具和 GPT 等独立页面也带有同一联系入口，直接打开书签不会丢失项目维护者信息。
- 桌面视觉采用 LibTV-inspired 深色节点工作台：石墨点阵画布、紧凑左侧工具 rail、连续流体连线与沿线闪光；入口、首页、画布、导演台和辅助工具页共享同一套对比度令牌。仅面向桌面视口优化，不引入会员/积分/付费入口。运行时还会隐藏带有明确 `vip`、`premium`、`paid`、`subscription`、`membership` 或中文付费标签的模型/平台；普通 `pro`/`plus` 名称不会被误判为付费功能。
- 当前桌面资源版本：`libtv12` 主题 + `libtv3` 辅助页层 + `libtv7` skin + `desktop-motion14` 动效；经典画布使用 `fluid9`，智能画布使用 `fluid13`；列表排版/首屏聚焦分别为 `layout6`/`focus1`。共享词典使用 `i18n.js?v=2026.09.01.opensource8`，剧本工作台使用 `script-studio.js?v=2026.09.01.studio4`，品牌配置/渲染脚本分别使用 `brand2`/`brand4`。普通连线是无断点 gradient 管线，沿线以**中速（约 2.35–3.79 秒一周期）、细长的柔和 sheen/streak**传递方向感，不再绘制突兀的圆点/十字星；超过 40 条边时按材质聚合，最多 900 条进入 aggregate paint，曲线采样上限 48、每材质最多 3 个低成本 sheen，超大图保留连续 base 线并停用高成本 paint。
- 运行 `http://127.0.0.1:3000/` 时，后端只在 HTTP 响应阶段用 `VERSION` 和文件修改时间补充静态资源 query 作为缓存键；因此响应里可能看到 `2026.08.27.<mtime>`，不代表页面回退到旧皮肤，实际加载内容仍来自当前工作区文件。服务器启动不会原地改写 `static/*.html`，源码中可读的 `libtv12`/`fluid*` 标签会保持稳定。
- 智能画布的超宽说明节点会收纳到桌面端 context ribbon（画布上下文）中，原节点仍保留并可通过悬停、聚焦或“编辑”恢复；这只改善可读性，不改变节点数据和坐标。
- 画布列表首屏会在历史坐标过于稀疏时只降低非聚焦卡片的视觉权重；所有卡片仍在 DOM 中可点击/键盘访问，第一次拖拽或滚轮会恢复完整视图，绝不改写已保存的卡片坐标。

### LibTV 风格桌面皮肤

启动后打开 `http://127.0.0.1:3000/` 即可看到深色入口；「画布」进入节点编辑器，「素材」和「工具」页面也保持同一 graphite/cyan 色板。画布 rail 的添加、连接、资产、历史和帮助按钮只调用原有功能，节点数据、拖拽、连线命中和生成 adapter 不被皮肤层接管。系统主题按钮提供两档深色对比度；在 720px 高度的桌面窗口中，首页和长工具页会在自身文档内滚动，不裁掉底部内容。

## 不包含的能力

本项目不实现第三方平台的手机号登录、验证码、会员、支付、订单、额度扣减、真人认证、云端批量任务或自动发布。课程和商业平台内容也不会复制到本项目。

## 快速开始（Windows）

1. 安装 Python 依赖：双击 `安装依赖.bat`，或执行 `python -m pip install -r requirements.txt`。依赖清单包含 Uvicorn 的 WebSocket 支持，保证画布、资产与任务状态实时同步。
2. 复制 `.env.example` 为 `API/.env`，只填写你自己的 provider 配置。真实密钥不要提交到 Git。
3. 双击 `run.bat`，或执行：

   ```powershell
   python main.py
   ```

4. 浏览器打开 `http://127.0.0.1:3000/`。
5. 首页三个入口：从剧本开始、一句话写剧本、自由画布。生成画面前再去“连接”配置你自己的接口。

### 第一次使用（不配置模型也能先体验）

如果你只是想先看看界面，不需要 API Key：

1. 运行服务后打开首页，进入「自由画布」。
2. 添加文本、图片、视频或 3D 导演台节点，拖动节点并连线。
3. 点击节点的预览/运行按钮，未配置 provider 时只会生成带“本地预览”标记的结果，不会偷偷访问远程服务。
4. 想接入自己的模型时，再进入「连接 → API 设置」填写服务地址和 Key；保存前先确认地址属于你选择的服务。
5. 关闭服务时回到运行 `python main.py` 的命令行窗口按 `Ctrl+C`。不要直接删除命令行窗口中的项目文件。

Windows PowerShell 的完整命令如下（项目目录就是包含 `main.py` 的目录）：

```powershell
py -3 --version                         # 建议 Python 3.10 或更高
python -m pip install -r requirements.txt
Copy-Item .env.example API/.env         # 只创建本地配置；没有 Key 也可以先跳过
python main.py
```

浏览器只访问 `http://127.0.0.1:3000/` 即可。这个地址表示“本机”，不是公开网站；如果你把服务绑定到局域网地址，请自行确认网络中的其他设备可以看到哪些内容。

## 数据边界（发布前必读）

Canvas Lab 默认把画布、提示词、上传素材、生成结果和连接配置写在运行目录中。它们是**你的本地数据**，不属于源码仓库：

| 路径 | 内容 | 是否应上传 |
| --- | --- | --- |
| `API/.env`、`.env` | API Key、Base URL 和本机配置 | **绝不上传** |
| `data/` | 画布、资产库、提示词和任务状态 | **绝不上传** |
| `assets/`、`output/`、`artifacts/` | 上传文件、模型输出、预览和临时产物 | **绝不上传** |
| `history.json`、`user_attachment` | 历史记录和用户附件 | **绝不上传** |
| `*.log`、`*.session`、`*.sqlite`、`*.db` | 日志、浏览器会话和本地数据库 | **绝不上传** |
| `static/`、`main.py`、`tests/`、`tools/`、`workflows/` | 可复现的源码、测试和示例 | 可以审核后上传 |

根目录的 `.gitignore` 会阻止上述路径进入新的提交，但有一个容易踩坑的地方：**忽略规则不会自动取消旧提交中已经被 Git 跟踪的文件**。发布前请运行仓库自带的只读检查器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-public-release.ps1
```

检查器只读取 Git 文件名和状态，不打开、不复制、不上传 `data/` 或素材内容。若它报告 `[FAIL]`，先把文件从索引移除但保留本地文件：

```powershell
git rm --cached -- data/asset_library.json
# 把上面的路径换成检查器报告的实际路径；不要加 -f，也不要删除本地目录
```

然后重新运行检查器。`[REVIEW]` 表示便携 Python、历史备份等可选发行内容，不是用户数据；小型源码发布可以将它们从发布分支移除，想保留离线运行包则应在 Release 附件中单独说明。

## 工作流使用

1. 打开首页，选择「从剧本开始」或「自由画布」。
2. 剧本入口会拆出角色、场景和分镜，并铺到画布上；自由画布可从工具栏添加角色、场景、3D 导演台、文本、图片、视频、音频。
3. 在图片 / 视频节点中选择参考图类型，必要时填写分段提示词、ADR、SFX 或 BGM。
4. 点击“智能执行”按拓扑顺序运行。未配置 provider 时会生成可检查结构和交互的本地预览。
5. 使用“工作流”菜单导入或导出 JSON / ZIP，方便备份和分享。

仓库中的 `static/seedance25-video-workflow.json` 仅为旧版本导出的**迁移文件名**；其 payload 已改为不选择任何厂商、模型或计费通道的本地视频预览示例。导入后请在节点面板中填写你自己的 provider/model，未填写时不会提交远程任务。

## 批量管理与删除

画布列表、回收站、素材库、提示词库、对话/生成历史和 ComfyUI 工作流均支持管理模式下的多选、全选、清空和批量删除。画布删除默认先移入回收站；恢复或彻底删除需要二次确认。服务端会校验 ID/路径、限制单批数量、隔离用户目录，并在文件仍被画布/对话/历史引用时返回 `skipped`，不会误删共享素材。画布首屏排版修复只写可选的 `board_x`/`board_y` 元数据，不会触发批量删除。

## 自定义项目身份

项目当前使用的公开联系方式已经写入 `static/js/brand-config.js`：

- 邮箱：`2734891913@qq.com`
- X：<https://x.com/deathcmd527>

如果你要换成另一位维护者，只需要编辑同一个文件中的 `maintainerName` 与 `contacts`，例如：

```js
maintainerName: '你的名字',
contacts: [
    { id: 'email', label: '联系邮箱', value: 'you@example.com', href: 'mailto:you@example.com', icon: 'mail' },
    { id: 'home', label: '个人主页', value: 'https://example.com', href: 'https://example.com', icon: 'globe' }
]
```

联系方式只在本地界面展示；应用不会自动向这些地址发送数据。
邮箱和 X 链接是公开的项目联系信息，不包含 API Key 或本地文件路径。当前项目仓库是 <https://github.com/deathcmd/Infinite-Canvas>，问题反馈地址是 <https://github.com/deathcmd/Infinite-Canvas/issues>；对应的 `repositoryUrl` 与 `issueUrl` 已写入品牌配置。

## Chrome 扩展

`tools/chrome-local-asset-importer/` 是一个 Manifest V3 扩展。加载该目录后，可以扫描当前页面图片并导入本地资产库；扩展只连接你自己运行的 Canvas Lab 服务。

## 开发与测试

```powershell
python -m pytest -q
# 当前测试数量以本次命令输出为准（不要沿用历史快照中的固定数字）
python tests/test_video_workflow.py
# 需要已安装 Playwright 的 Python 环境和可用浏览器
python tests/test_xyq_canvas_smoke.py
node tests/video_workflow_unit.js
node tests/script_studio_unit.js
node tests/canvas_list_layout_unit.js
node --check static/js/smart-canvas.js
node --check static/js/canvas.js
node --check static/js/canvas-list.js
node --check static/js/asset-manager.js
node --check static/js/script-studio.js
node --check static/js/director-desk.js
node --check static/js/video-workflow-panel.js
node --check static/js/video-workflow-schema.js
node --check static/js/video-workflow-adapter.js
node --check static/js/libtv-skin.js
git diff --check
```

前端页面是静态 HTML / CSS / JavaScript，后端入口是 `main.py`。新增 provider 时请遵循现有 adapter 接口，不要把具体商业模型名称写成产品固定规则。

## 发布到 GitHub（不会上传本地数据）

下面流程适合第一次发布的人。**不要在包含个人素材的工作树里直接运行 `git add .`，也不要用 `git add -f` 绕过 `.gitignore`。**最好先复制一个不含 `data/`、`assets/` 和 `output/` 的干净目录，或使用专用发布分支。

### 1）发布前检查

在项目根目录运行：

```powershell
git status --short
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-public-release.ps1
git check-ignore -v API/.env data assets output artifacts history.json user_attachment
```

检查器必须没有 `[FAIL]`。`git status --short` 中如果出现你不认识的文件，先停下来查看，不要盲目添加。

### 2）只添加已经审核的源码

逐项添加源码、文档和测试；下面只是示例，请以你的审核结果为准：

```powershell
git add .env.example .gitignore LICENSE README.md VERSION requirements.txt main.py
git add static CLI tools workflows tests
git add run.bat 启动服务.bat 安装依赖.bat mac-安装依赖.sh mac-启动服务.sh mac-启动服务.command 新手运行与使用教程.md 运行说明.txt MAC-使用说明.md
git diff --cached --name-only
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\check-public-release.ps1 -Strict
```

`-Strict` 还会把便携运行时和历史备份当作失败，方便制作最小源码仓库。若你确实要随仓库提供便携 Python，请使用普通模式并在 Release 说明中标注它是可选运行时；无论哪种模式，`data/`、素材和密钥都不能通过。

### 3）提交并推送

确认暂存区文件列表没有本地数据后再提交：

```powershell
git commit -m "发布 Canvas Lab 开源版本"
```

本项目的公开仓库地址是：<https://github.com/deathcmd/Infinite-Canvas>。如果你是从本仓库继续开发，先核对远程地址，再推送：

```powershell
git remote -v
git push -u origin main
```

如果你要把源码发布到自己的另一个 GitHub 仓库，不要把个人素材复制进去；先在 GitHub 网页创建一个空仓库（不要勾选自动添加 README），再替换远程地址：

```powershell
git remote set-url origin https://github.com/<你的用户名>/<你的仓库>.git
git push -u origin main
```

只有在没有现成仓库时才需要使用 `gh repo create`；已经有 `origin` 时不要重复创建远程仓库。

### 4）推送后的复核

在 GitHub 网页的 **Code** 文件列表中确认没有 `API/.env`、`data/`、`assets/`、`output/`、`history.json`、个人附件或日志。也可以在本地检查刚生成的提交：

```powershell
git ls-tree -r --name-only HEAD | Select-String -Pattern '(^|/)(API/\.env|\.env$|data/|assets/|output/|artifacts/|history\.json|user_attachment|.*\.log$)'
```

上面命令没有输出才算通过。仅仅“后来删除文件”不能清除旧提交历史；如果旧历史曾包含密钥或个人数据，请新建空的公开仓库，或在推送前使用 `git filter-repo` 清理历史并重新轮换所有曾经暴露的 Key。本仓库的公开 `main` 已从经过审计的单一基线提交开始，避免把旧上游历史带入公开仓库。

## 目录速览

```text
main.py                         FastAPI 本地服务
static/index.html               Canvas Lab 主界面
static/home.html                首页
static/script-studio.html       剧本拆解与一句话写剧
static/canvas-list.html         画布项目列表
static/canvas.html              无限画布编辑器
static/smart-canvas.html        图片与视频辅助工具
static/js/video-workflow-*.js   通用视频工作流与 3D 导演台
tools/chrome-local-asset-importer Chrome 素材桥
tools/photoshop-asset-connector  Photoshop 资产桥
tools/check-public-release.ps1    发布前本地数据审计（只读）
tests/                          回归测试与 smoke 检查
```
