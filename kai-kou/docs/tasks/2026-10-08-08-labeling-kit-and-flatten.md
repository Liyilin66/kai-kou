# 任务 8：标注包 + 仓库结构扁平化

- 日期：2026-10-08
- 分支：`lyl`（A 不改线上；B 改部署结构，**Claude 审查后才能合并 `main`**）

## A. 标注包（让用户 15 分钟内完成标注）

评测报告的数字需要人工标注。用户的时间最贵，所以由你把标注做成"听一下、选一个"。

### 要做的

1. 新增 `scripts/eval-build-labeling-kit.js`：对 `manifest.json` 中所有 `labels.status = 'unlabeled'` 的样本，找出**浏览器识别和 Whisper 有分歧、或任一方标为错误**的原文词位置（同音词、低置信度除外）。
2. 对每个位置，用本机 ffmpeg 从录音中切出该词前后各约 1 秒的片段，保存到 `eval/speech/labeling/<样本id>/<序号>.m4a`（不进 Git）。
3. 生成一个本地 HTML 页面 `eval/speech/labeling/index.html`（不进 Git，纯静态，无外部依赖）：
   - 每个位置一行：原文半句（目标词加粗）、浏览器听到的、Whisper 听到的、播放按钮。
   - 三个选项：**我读错了** / **我读对了（识别错误）** / **听不清**。
   - 页面底部"导出"按钮：生成 `labels-<日期>.json` 下载。
4. 新增 `scripts/eval-apply-labels.js`：读取导出的 JSON，写回 `manifest.json` 对应样本的 `labels`（"我读错了"→ 对应错误类型；"识别错误"→ 不记错误；"听不清"→ 记入 `notes`，该样本保持未标注），并把 `labels.status` 改为 `labeled`、`labeled_by` 设为 `user-listening`。
5. 构造录音（`ra0xx-mixed-4`）沿用脚本自带标注，不进标注包。

### 验收

- 在当前 7 条真实样本上生成标注包，列出位置总数（预计 20–40 个）。
- 用一份手工构造的导出 JSON 跑通 `eval-apply-labels.js`，有测试。

## B. 仓库结构扁平化

背景：仓库已从 `PTE` 改名为 `kai-kou`，但应用仍在 `kai-kou/` 子目录，路径呈现为 `kai-kou/kai-kou/...`。README 重写前先把结构理顺（见 `docs/improvement-plan.md` 9.2 节）。

### 要做的

1. 用 `git mv` 把 `kai-kou/` 下所有内容移到仓库根目录，保留历史。
2. 合并根目录与子目录的 `README.md`、`AGENTS.md`、`.gitignore`（保留两边的规则；根 `AGENTS.md` 的 Release Gate 一节原样保留，并把其中的路径去掉 `kai-kou/` 前缀）。
3. 更新所有写死 `kai-kou/` 路径的地方：`.github/workflows/test.yml`（去掉 `working-directory` 和 `cache-dependency-path` 的前缀）、文档中的路径引用、脚本中的相对路径。
4. **Vercel 设置：Root Directory 改为空（仓库根目录）。** 必须在合并 `main` 的同时修改，否则生产部署会失败。顺序：先在 `lyl` 的预览部署上验证（预览也使用 Root Directory 设置，修改前先确认预览构建方式），确认无误后再合并 `main`。
5. 本地确认 `npm run dev`、`npm run dev:api`、`npm test`、`npm run build` 都在新路径下正常。

### 验收

- CI 全绿；预览部署可以打开并完成一次 RA 诊断；`git log --follow` 能追溯到移动前的历史。
- 交付说明写清 Vercel 设置的修改时机和回滚方法（改回 `kai-kou` 并回退合并提交）。

## 不做

- 不改任何功能代码。
- README 内容重写放到评测报告完成之后（需要真实数字）。

## A 实施记录（2026-10-08）

生成 7 条真实未标注样本的 56 个位置、56 段 M4A（任一识别器报错的并集，数量不人为压到预计范围）。构造样本和不确定识别排除。页面无外部依赖，支持本机草稿保存、三选一与 JSON 导出。导入前校验编号、位置、重复项和选择值；部分选择、听不清均保持未标注；完整样本标为 user-listening，有自动 .bak 备份。合成导出通过 CLI 在临时清单跑通，未替用户标注真实数据。

打开方式：本机 `http://127.0.0.1:5188/`，已启动仅监听 localhost 的静态服务；也可以双击 `eval/speech/labeling/index.html`（扁平化后位于仓库根的 eval 下）。页面 56 行、168 个单选项，实际音频元数据加载成功，首段长 2.42 秒。导出后运行 `node scripts/eval-apply-labels.js <导出文件路径>`。生成片段、页面和备份均忽略，不提交。

B 完成后本地路径会移至仓库根，localhost 链接保持不变；文件移动不影响浏览器已保存的选择。
