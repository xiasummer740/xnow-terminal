# ISSUES — XNOW Terminal

> 全角色全面审查产出（v3.17.11 / build 分支 @ d69b3803）
> 生成日期：2026-09-11
> 证据原则：每条均带 file:line 或实测输出；**已证伪的假设已剔除，不列入**

状态：`待修` / `已修待验` / `已验证` / `不修(原因)`

---

## 🔴 P0 — 会丢用户数据 / 可直接导致本机沦陷

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 1 | IPC 桥 `runGlobalAsync(name,...)` 无白名单：渲染进程任意 JS 可按名字调主进程**全部**能力（文件读写、进程启动、数据库、已存凭据）。且全应用无 `will-navigate`/`setWindowOpenHandler`，AI 输出里的外链一点即导航 → preload 重新注入 → 直达 RCE | `preload/preload.js:31-42`、`lib/ipc.js:247-252,700-712`、`lib/create-window.js:90-119`、`lib/safe-open-external.js`、`components/ai/ai-output.jsx:97-101` | 已修已验 |
| 2 | `isPathSafe` 前缀比对可被 `\\?\` 绕过（实测 `\\?\C:\Windows\...` 放行）；且 `~/.ssh`、`Startup` 目录不在黑名单 → 任意读私钥 + 任意写开机自启 | `lib/path-safe.js`（原 `lib/ipc.js:142-158`） | 已修已验 |
| 3 | 本机 WS 服务唯一鉴权是 42 位 token（`nanoid(7)`，与所有 ID 共用熵源）；主密码门禁 `requireAuth === 'yes'` 是**死代码**（`requireAuth` 实际是 pbkdf2 哈希）；`/common/s` 按客户端给的 `func` 直接调 fs 函数，含 `runWinCmd`（拼 shell 跑 powershell） | `server/dispatch-center.js:29-45`、`server/session-server.js:50-61`、`server/ws-origin.js`、`common/ws-token.js`、`common/fs-functions.js`、`server/fs.js:12-25` | 已修已验（残留说明见下方「#3 修复说明」） |
| 4 | 自动更新下载的安装包**无签名/无哈希校验**，落盘后拼 bat `start /wait "x.exe" /S` 静默执行；镜像域为三方域名 | `server/download-upgrade.js:38-62,181-200`、`server/upgrade-verify.js` | 已修已验（**该路径当前从 UI 已不可达**，见下方「#4 修复说明」） |
| 5 | AI 对话**请求失败即删记录**（`removeAiHistory` → 落库 DELETE），用户刚打的字一起消失且无提示 | `ai/ai-chat-history-item.jsx:99`、`store/common.js:342-349` | 已修已验 |
| 6 | AI 历史超 100 条淘汰**方向反了**：数组旧→新，`splice(100)` 砍掉的是**刚 push 的最新那条** | `ai/ai-chat.jsx:25,68-75` | 已修已验 |
| 7 | 同步为全量覆盖、零冲突处理（冲突逻辑已被注释）。**一端为空即清空另一端**：新设备空书签上传 → 服务端被写成 `[]` → 老设备下载 → watch 逐条删库 | `store/sync.js`（3 处入口）、`watch.js:34-42` | 已修已验（致命方向已堵，见下方「#7 修复说明」） |
| 8 | 解密失败时**静默清空整条记录**（`safeDecrypt` 返回原文 → JSON.parse 失败 → `r = {}`），表现为"书签/密码全没了"且无告警 | `lib/sqlite.js:143-153`、`lib/nedb.js:92-109`、`lib/safe-storage.js:165-203` | 已修已验 |

---

## 🔴 P0 — 测试与 CI（实测：防线为零）

| # | 问题 | 证据 | 状态 |
|---|---|---|---|
| 9 | 3 个 mac 测试 workflow **已手工禁用 3 个月**；历史 **246 次运行 / 246 次失败 / 0 成功**，失败点在 `test` 步骤本身（非环境） | `gh workflow list --all`、`gh run list` | 待修 |
| 10 | `npm test` 在 Windows 上**找不到测试**：`test/e2e/00*.js` 作为 Playwright 位置参数是**正则不是 glob**（CI 是 sh 会先展开，本地 cmd.exe 不展开）→ `No tests found`，`test2/test3` 永不执行 | `package.json:25-27` | 已修已验 |
| 11 | `test/unit/` **21 个 spec（约 5984 行）从未被任何脚本执行**（`test-unit-ci` 指向的是 `test/unit-ci/`）；其中 `zod.spec.js` 依赖根本不存在的 zod 包 | `package.json:23` | 待修 |
| 12 | Playwright `1.28.1` 与 Electron `41.2.0` **结构性不兼容**（已实测）：1.28.1 在 Electron 主进程执行 `process.mainModule.require('electron')`，该 API 在 Node 22+/Electron 30+ 已移除 → `electron.launch` 必失败 | `playwright-core/lib/server/electron/electron.js:67` | 待修 |
| 13 | `npm run prepare-test` 在 Windows 上**静默失败却返回 0**（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 是 bash 语法，cmd.exe 不认）→ 永远装不上 Playwright 却无人察觉 | `package.json:18` 实测输出 | 待修（2026-09-11 现场复现：`node_modules` 下无 `@playwright`，npx 只得从 `G:\npm-cache\_npx` 拉临时副本，故所有 spec `Cannot find module '@playwright/test'`） |
| 14 | `.claude/tasks.json` 的 `test` 字段为**空字符串** —— 声称 build/start/test 自动化验证，测试环节空转 | `.claude/tasks.json` | 已修已验 |
| 15 | pre-push 钩子只跑 `npm run lint`，不跑测试；配合 #9 形成完整漏洞链：本地不拦 → CI 不跑 → 坏代码直达主干 | `build/bin/pre-push` | 已修已验 |
| 16 | `test3`（14 个 e2e + 全部 unit-ci）不在 `npm test` 里；项目 CLAUDE.md 写「`npm test` # E2E + 单元测试」与事实不符 | `package.json:22` vs `:27` | 已修已验 |
| 17 | 无 `playwright.config.js` → Playwright 默认扫描整个仓库，把 `test/unit/*` 全部误收集 | 项目根 | 待修 |

---

## 🟠 P1

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 18 | **上游同步断裂 3.5 个月**：fork 后 370 个自研 commit、**零次上游合并**；`git merge-tree` 实测 **90 个冲突文件**，其中 6 个是结构性冲突（上游**删除了** `terminal-info/` 整目录、把 `terminal.jsx` 从 1770 行拆成 30 个模块）。再拖将失去合并能力 | `d35b5e1e..HEAD` vs `upstream/master` | 待修 |
| 19 | 系统提示可被本地文件改写：`readClaudeSkills` 把 `~/.claude/skills/*/SKILL.md` **全文**塞进 system prompt；`verifySignature` 一律 `return true`（签名校验是装饰）；危险命令只靠 15 条 `^` 锚定正则，`rm -rf ~/`、`curl x\|bash`、`cat ~/.ssh/id_rsa` 全部漏过 | `lib/ipc.js:651-679`、`skill-manager.js:285-289`、`ai/agent-tools.js:31-55` | 待修 |
| 20 | Agent 循环**中止不了**且结果无上限膨胀：`createAIClient` 无 timeout、`stream:false` 从不注册 session 故 `stopStream` 无 sessionId 可杀；工具结果原样 push 进 messages（单次可达 1-2MB × 150 轮） | `lib/ai.js:32-57`、`ai/agent.js:302-397` | 待修 |
| 21 | 迁移后**整库明文落盘**：迁移写入用不带 enc/dec 的裸 sqlite，含 SSH 密码的记录长期明文（只有被用户再次编辑的那几条会加密） | `migrate/migrate-1-to-2.js:56-57,88-92` | 待修 |
| 22 | `find` 默认 `LIMIT 1000` 且**无任何调用方会传 `_limit`** → 导出备份被静默截断（还写 `totalBookmarks=1000`）；超出 1000 的历史 UI 不可见不可删 | `lib/sqlite.js:192-199`、`lib/ipc.js:478-490` | 待修 |
| 23 | `history` **无上限增长**（新条目分支直接 return，裁剪只在"命中已有条目"分支）→ 长期使用突破 1000 即触发 #22 | `store/tab.js:543-565` | 待修 |
| 24 | **安装不静默**，与「像微信一样静默更新」的既定偏好不符：`quitAndInstall()` 无参 → `isSilent=false` → 不追加 `/S` → 弹 NSIS 向导；且 `autoInstallOnAppQuit=false`，用户必须手点 | `lib/auto-updater.js:78-80`、`lib/ipc.js:337-339` | 已修已验 |
| 25 | **两份 electron-builder 配置分叉**，`npm run pb` 会把上游配置覆盖到根目录 → 之后本地发版带 `channel: ${env.WORKFLOW_NAME}`，产出的清单不叫 `latest.yml`，而客户端只认 `latest.yml` → **一键更新链路当场断掉**（且打包、发 release 全程不报错） | `build/bin/prepare-electron-build.js`、`build/bin/check-builder-config.js`、两处 `electron-builder.json` | 已修已验 |
| 26 | CI 全挂导致 **Mac/Linux 用户永远无法自动更新**（release 里零 mac/零 linux 产物；且 `build-mac.js` 只出 dmg，electron-updater 在 mac 需要 zip） | `.github/workflows/*`、`build/bin/build-mac.js:22` | **不修（祥哥 2026-09-12 拍板：不做，就 Windows 单平台）** |
| 27 | `npm run rx` 不跑 `npm run b` → 只跑 rx 时**渲染层是新代码、主进程可能是旧的**（含自动更新逻辑本身）。实测：148 个文件里 83 个不一致，5 个文件整个缺失（第 1/2 批安全修复全部进不了包） | `build/bin/release-xnow.js:41-52`、`build/bin/check-src-fresh.js` | 已修已验 |
| 28 | `db-upgrade.js` 弹窗 `keyboard:false` + 隐藏确定按钮且**无 try/catch**：`doUpgrade` 一旦 reject，弹窗永久无法关闭；且无论成败都无条件播报"Done / Database Upgraded"（硬编码英文） | `store/db-upgrade.js` 全文 | 已修已验 |
| 29 | 回环服务不校验 `Origin`/`Host`，且 `webview` 开了 `disablewebsecurity` → DNS rebinding / 网页标签页可打本机接口 | `server/server.js:29-39`、`web/web-session.jsx:128` | 待修 |
| 30 | MCP 组件**默认免鉴权**（apiKey 留空即跳过）把「执行终端命令」暴露在回环端口 | `widgets/widget-mcp-server.js:45-49,891` | 待修 |
| 31 | `httpFetch` 无任何 SSRF 校验（连 `isPrivateHost` 都没调）；`isPrivateHost` 只识别点分十进制，实测 `127.0.0.1.nip.io`、`[::ffff:127.0.0.1]`、`169.254.169.254` **全部放行** | `lib/ipc.js:632-649`、`:161-176` | 已修已验（判定挪到 `lib/ssrf-guard.js` 并补 DNS 判定，三个绕过全堵；`httpFetch` 按「监控必须能用」的口径接闸，见下） |
| 32 | 安装包 **blockmap 上传无兜底**（v3.17.8/v3.17.10 release 里缺失，本地 dist 却有）→ 差量更新退化为 116MB 全量 | `build/bin/release-xnow.js:54-67` | 待修 |

---

## 🟡 P2

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 33 | **界面显示英文原文**：61 个 `e()/t()` 用到的 key 在语言包里不存在，`translate` 回退为 key 本身。实测中文界面出现 `custom` / `Close` / `gist` / `Done` / `noData` / `fullscreen` / `SSH Agent Path`。其中 `e('Opacity')` vs 语言包 `opacity` 属**纯大小写不匹配**，改一处即可 | `entry/basic.js:52-56` + 60 处调用点 | 已修已验 |
| 34 | **17 个孤儿组件**（零 import），其中 `vps-dashboard/monitor-{cards,detail,table}.jsx` + `tab-monitor.jsx` 合计 **约 31.7KB 死 UI**；`ai-chat-entry.jsx` / `ai-float-window.jsx` 同样零引用 | 各文件 | 待修 |
| 35 | **504 行硬编码中文**（65 个文件），集中在自研模块：ai 131 / terminal-info 105 / vps-dashboard 67 / deploy 35 → 自研功能实际只支持中文 | 见 `temp/hardcoded-zh.js` 输出 | 待修 |
| 36 | 新增一个工具要改 **5 处**（schema、switch、mcp-handler 第二个 switch、TAB_ID_TOOLS、toolIcons），已造成实际能力缺失：store 有 32 个 `mcp*` 能力，Agent 只暴露 25 个 —— **AI 能建书签但改不了、删不掉**；技能自定义工具分支只回一句"请参考技能说明"，**从不执行** | `ai/agent-tools.js`、`store/mcp-handler.js`、`widgets/widget-mcp-server.js` | 待修 |
| 37 | `parse-quick-connect` **两份 454 行分叉**（app 版认 `xnow-terminal://`，client 版还是 `electerm://`）；两份手写 zod 垫片已漂移（app 版有 `ZodRecord`，client 版无） | `app/common/` vs `client/common/` | 待修 |
| 38 | `compactDatafile` **调用与签名不匹配**（传成 `dbName`），NeDB 永不压缩、sqlite 直接抛错；每次写满 100 次刷一条错误日志 | `lib/last-state.js:8-22` vs `lib/nedb.js:122-126` | 已修已验（顺带修好 NeDB 分支**返回 undefined 而非 Promise** —— 不改的话改对调用方反而会 `.catch` 崩） |
| 39 | `execSshCommand` 的 `hostVerifier` **永远返回 true** —— 检测到主机密钥变更只 `console.warn` 然后照常连接（同项目 `ssh-known-hosts.js` 有正确实现却没用上） | `lib/ipc.js:602-611` | 已修已验 |
| 40 | `--clear-config` 在数据目录被占用时**半删除并让应用起不来**（require 时已打开 db，Windows 删除失败 → 递归删除中断 → 异常无人 catch → 无窗口） | `lib/create-app.js:118-127` | 待修 |
| 41 | 迁移版本账本与业务数据**不在同一库**（账本在 `.nedb`，数据在 `xnow.db`），账本被删会重跑全部老迁移 | `migrate/index.js:36-82` | 待修 |
| 42 | 会话 WS 消息 `JSON.parse` 无 try/catch，一条畸形 JSON 即可打死会话进程；而进程级 handler 无条件吞异常把它伪装成正常 | `server/session-server.js`、`server/server.js:44-49` | 已修已验（sftp/transfer/升级 三处走 `parseWsMessage`，畸形丢消息不断连接；「吞异常」那半句描述见说明） |
| 43 | 深链接把含明文密码的 `ssh://user:pass@host` **写进日志**；任意网页 `<a href="ssh://...">` 一点即建带凭据的标签页 | `lib/deep-link.js:142,171` | 已修已验（日志泄露已堵，4 个入口全走 `redactCreds`；「一点即建标签页」那半句需祥哥拍板是否加确认，见下） |
| 44 | 单实例命名管道**无鉴权**，本机任意进程可注入命令行参数（可致任意文件读取 + 自动建连执行命令） | `lib/single-instance.js:16,43-50` | 待修 |
| 45 | `openExternal` **无协议白名单**，传 `file:///C:/evil.exe` 即由系统 shell 打开 | `lib/ipc-sync.js:63-64` | 已修已验（第 2 批 #1 顺带关闭，见下） |
| 46 | 凭据加密遗留路径：**固定全零 IV 的 CBC**、`isLegacyFormat` 把纯十六进制明文误判为密文、解密失败原样返回 | `lib/enc.js:15-16,71-72,99-112` | 待修 |
| 47 | SSH 算法集含已破解套件（`diffie-hellman-group1-sha1`、`hmac-md5`、`3des-cbc`、`arcfour*`、`ssh-dss`） | `server/ssh2-alg.js:25,31,36,66-70,78` | 已修已验（`group1-sha1`/`md5` 已从"每次连接都报价"降为"只在重试档"；**顺带修好了一条从未生效过的兜底路径**，见下） |
| 48 | 自定义 CSS 走 `style.innerHTML`，只过滤了 `@import` | `bg/custom-css.jsx:16-17` 等 | 待修 |
| 49 | 保存配置用 100ms `debounce` 且 `beforeExit` **不 flush** → 刚改完设置就关窗会丢 | `store/watch.js:86-91` | 待修 |
| 50 | `saveUserConfig` 跨 await 读-改-写（TOCTOU），并发保存互相覆盖 | `user-config-controller.js:31-52` | 待修 |
| 51 | 3 个继承自上游的死代码文件零引用：`download-mirrors.js`、`get-category-color.js`、`key-shift-pressed.js` | `client/common/` | 待修 |
| 52 | **用了 `log.*` 但从未 import `log`** → DNS 解析失败时不是记日志，而是抛 `ReferenceError: log is not defined`（Promise 内抛出 = 未处理拒绝）。写法上属"错误处理路径反而制造错误" | `common/lookup.js:10,19`（走 `lib/ipc.js:252` 暴露给渲染进程） | 已修已验 |
| 53 | **同上**：主题列表加载失败时 `log.info(e)` 抛 ReferenceError | `lib/iterm-theme.js:8` | 已修已验 |

---

## ✅ 已证伪 / 需要纠正的预期（避免误判）

| 说法 | 实测结论 |
|---|---|
| commit `617e8bd1`「升级自动清空旧数据，每次安装都是全新的」 | **标题与实现相反**。实测升级/自动更新**不删任何数据**：升级走静默路径必然命中 `StrCpy $myKeepAppData "1"`（保留），`customUnInstall` 只在用户手动卸载并点"是"时才 `RMDir`。书签/密码/历史/AI 对话安全。**建议改 commit message 与 CHANGELOG 措辞**，否则下次会误判 |
| i18n 缺失是 locale 依赖版本过旧 | **证伪**。`npm pack @electerm/electerm-locales@2.3.17` 实测：升到最新版也只有 411 条，61 个缺失 key 中仅 `downloadFromBrowser` 被补上。不是版本问题 |
| `Clo e` / `gi t` / `cu tom` —— 字母 s 被吞 | **证伪**。受控探针实测 `innerText`/`textContent`/语言包三者均完好（`"ssh user host close gist custom"` 原样返回）。是采集环节假象，非产品缺陷。真实问题是这些 key **不在语言包里**，故显示英文原文（见 #33） |
| Agent 循环中止逻辑 | 部分证伪：`store.mcpSendTerminalCommand` 不 await 是**有意为之**（与上游一致，先发命令再等空闲），非 bug |
| `app/lib/zod.js`、`app/lib/lodash.js` 是死代码 | **证伪**：分别被 3 个 / 7 个文件引用 |
| zmodem / xmodem / trzsz「多份实现」 | **证伪**：是协议两端（服务端 ↔ 客户端）配对镜像，符合预期 |
| `client` / `app` 存在循环依赖 | **证伪**：双向 0 处引用，分层干净 |

> 说明：**AI 叙述文本经 `<ReactMarkdown>` 渲染且未覆盖 `a` 组件** —— AI 输出里的 `[链接](http://evil.com)` 是真实可点链接，是 #1 攻击链的入口。修复 #1 时一并处理。

---

## 建议的修复顺序

**第 0 批（今天，成本 < 30 分钟，把防线从 0 变成 1）— ✅ 已完成 @ `0d2ba4b3`**

1. `.claude/tasks.json` 填 `"test": "npm run test-unit-ci"`（#14）✅
2. `build/bin/pre-push` 追加 `npm run test-unit-ci`（#15）✅
3. `package.json` 的 `test` 串上 `test3`（#16）✅
4. 修 e2e glob 为正则/子串（#10）✅

> ⚠️ **第 0 批只补齐了「单元测试」半条防线**（`test-unit-ci` 当时 19/19 通过，第 1 批新增 3 条解密安全用例后为 22/22，已接入 `npm test` + pre-push）。
> **「e2e」半条仍然是死的**：`test/e2e/00` 过滤本身已修好（实测匹配到 25 个 spec 文件，Playwright 确实在加载它们），
> 但 ① `@playwright/test` 从未装上（#13 现场复现）② 即便装上，1.28.1 与 Electron 41.2.0 结构性不兼容（#12）。
> **e2e 真正跑起来的前置条件 = 升级 Playwright（#12）+ 修 prepare-test（#13）+ 恢复 3 个 mac workflow（#9），属独立工作流。**

**第 1 批（本周，止血用户数据）— ✅ 已完成 @ `ca1c13a8` + #7**
#5 #6 #7 #8（AI 删记录 / 淘汰方向 / 同步覆盖 / 解密静默清空）+ #28（升级弹窗死锁）

---

### #7 修复说明（同步空数据覆盖）

**改法**：新增 `isEmptyOverwrite(本地, 外部)` 守卫 —— 外部是空数组、本地非空 → 拒绝覆盖、跳过该表、弹中文警告点名是哪几张表。
接在 3 个**外部数据入口**：`downloadSettingAction` 的 webdav 分支、gist 分支、`importAll`。

**为什么守卫不放在 `watch.js`**（重要，防后人改错地方）：
watch 是通用落库引擎，用户自己多选删光整表是**合法操作**。在 watch 拦「一次删光整表」会让删除不落库、重启后数据复活 —— 那是比原 bug 更严重的回归。
只有「外部数据源」边界才能确定不是用户意图，所以守卫必须在 sync/import 层。

**证据**（`temp/verify-issue7.js`，真启动 Electron + 隔离 profile）：
- 带守卫 **19/19 通过**：3 条本地书签在导入空数组后内存与落库都仍是 3；弹出中文警告「已跳过空数据同步…：书签」；正常非空导入仍生效；空对空不误报
- 反向证明 `--no-guard`（临时短路守卫）**本地数据真的被抹掉（内存 0 / 落库 0）** —— 证明这条测试抓得住问题，不是走过场

**遗留（同步语义设计问题，需祥哥拍板，不是缺陷）**：
本次只堵了「下载端被清空」这个**致害方向**。上传端仍是全量覆盖 —— 新设备仍会把服务端写成 `[]`，
此后老设备下载会被守卫拦下并提示（**数据安全，但同步暂时不同步**，任一端再编辑一次即可自愈）。
若要彻底根治，需要定一条语义规则：**「空」到底代表「没有数据」还是「删除指令」？**
- 选「没有数据」→ 上传端也跳过空表（对称，但用户删光本地后同步不出去，下次下载会复活）
- 选「删除指令」→ 维持现状（上传空表照写，靠下载端守卫兜住数据）
这是产品语义选择，改动小但影响所有同步行为，**不擅自决定**。

### #1 修复说明（IPC 桥白名单 + 导航闸门）

原报告把这条记为「一触即发」，所以按完整攻击链验，不只验单点。

**改法**（四层，缺一层链子就断不干净）：
1. `lib/ipc.js` —— `async` / `sync-func` 两条通道都加 **own-property 白名单**（`hasOwnProperty`）。
   原先 `asyncGlobals[name]` 直接取值，`name` 传 `constructor` / `__proto__` / `toString` 会落到 `Object.prototype` 上，
   等于把原型链成员也当能力暴露出去。
2. `lib/create-window.js` —— 主窗口导航闸门。`will-navigate`（点击链接）、`will-redirect`（服务端 302）、
   `setWindowOpenHandler`（`window.open` / `target=_blank`）**三条路各接一次**，只接 `will-navigate` 会漏后两条。
3. `components/ai/ai-output.jsx` —— AI 输出的 markdown 链接改走 `ExternalLink`，
   不再用 ReactMarkdown 默认的裸 `<a href>`（默认渲染一点就把整个窗口导航走）。
4. `lib/safe-open-external.js`（新增）—— `openExternal` 协议白名单。
   闸门把外链"交给系统浏览器"时，若协议是 `file:` / `javascript:` / `ms-msdt:` 之类，
   等于换个入口执行本地代码，所以递出去之前先过白名单，只放 http/https/ftp/ftps/mailto/tel。

**证据**（`temp/verify-issue1.js`，真启动 Electron + 隔离 profile）：**19/19 通过**
- 原型链成员被拒：`runGlobalAsync('constructor' / '__proto__' / 未知名)` 全部 `REJECTED: 未知的 IPC 调用`；`runSync('constructor')` 返回 `undefined`
- **零误伤**：客户端实际用到的 **84 个 IPC 名字**（async 63 + sync 21）逐个比对已登记键，**0 个未登记**
- 导航闸门：`location.href = file:///C:/Windows/System32/calc.exe` 后 origin 仍是 `http://127.0.0.1:5570`；`window.open(...)` 返回 `null`
- 端到端点击：**真点**渲染出来的 markdown 链接 → origin 不变 + 捕获到 `openExternal('http://example.com/page')`
- `openExternal('file://...')` 被静默拒绝，主进程日志确认

**盲点已排除**：`store.beforeExitApp` 里有一处**变量调用** `runGlobalAsync(name)`（全项目唯一非字面量调用点）。
追到源头：`name` 取自 `closeAction`，只可能是 `'closeApp'`（`create-window.js:24` 初值）或 `'exit'`（`system-menu.js:109`），
两者都已登记 → 白名单不会卡住退出 app。

### #2 修复说明（路径闸门）

**先复现再修**（`temp/probe-pathsafe.js` 最初逐字照抄旧实现）：实测 6 个口子**全部放行**。
其中最要命的是 `\\?\C:\Windows\...` —— `path.resolve` 会把 `\\?\` 前缀**原样带过去**（实测确认），
所以 resolve 结果永远匹配不上 `c:\windows\` 前缀，等于系统目录对 AI 文件工具全开放。

**改法**：抽成独立模块 `lib/path-safe.js`（与 `safe-open-external.js` 同一套路，纯函数、无 electron 依赖，可单元测试）
- 剥掉 `\\?\` / `\\.\` / `\\?\UNC\` 设备前缀再比对
- 用 realpath 按**真实落点**判，目录联接指向敏感目录也挡得住；目标不存在时向上找最近已存在祖先并接回剩余段
- 系统目录改从 `%SystemRoot%` / `%ProgramFiles%` / `%ProgramFiles(x86)%` / `%ProgramData%` 推导，不再写死 `C:`
- 补用户级敏感目录：`.ssh` / `.gnupg` / `.aws` / **`.xnow-terminal`（本应用自己的降级加密密钥）** / Windows Startup
- 前缀比对补分隔符边界，`C:\WindowsX` 不再被当成 `C:\Windows` 的子路径

**过程中自己踩的坑（已记，防重犯）**：realpath 回退最初写成「只取父目录真实落点」，
于是**不存在的** `~/.gnupg` 被收敛成 `~`，家目录整个进黑名单 —— 用户自己的项目全被拦。
是「正常业务路径必须放行」那条用例当场抓出来的。修法：向上找到已存在祖先后再把剩余段接回去。

**证据**：
- 单元测试 `test/unit-ci/path-safe.spec.js` **9/9**（全量 36/36）
- 实机 CDP `temp/verify-issue2.js` **11/11**：`\\?\` 读 SAM/hosts 被拦、`~/.ssh` 与密钥文件被拦、
  写 Startup 被拦**且确认文件未落盘**、`\\?\` 形式写 Startup 同样被拦、正经临时目录读写未被误伤
- 反向对照：修之前同一组用例实测全部放行（上面的 probe）

**第 2 批（安全闸门 —— 决定风险是"理论"还是"一触即发"）**
#1 ✅ #2 ✅ #3 ✅ #4 ✅

### #3 修复说明（本机 WS 鉴权）

**先取证**（不盲猜），三个事实推翻了原来的判断：

1. **主密码门禁是**双重**死的**：`verify` 里判 `requireAuth === 'yes'`，但 `requireAuth` 是主密码的
   pbkdf2 哈希（或空串），**永远不等于 `'yes'`**；而且唯一的写入点 `POST /auth` 全仓库 grep
   下来**没有任何客户端调用**。所以这道门从来没生效过，不是"配错了"，是压根没接上。
2. **fs 名单只发给了前端**：`getConstants().fsFunctions` 前端照着它拼 API，服务端 `fs[func](...args)`
   **从没校验过**。于是名单形同虚设：`constructor`/`__proto__`/`toString` 摸得到，名单外的
   `rm`/`symlink`/`chown` 照样能调。
3. **Origin 校验是安全的**：反复确认过 RDP/VNC/Spice 的 WebSocket 是渲染进程**自己**（回环来源）
   用 WASM 模块建的，不是从远端来源的 `<webview>` 里发的 —— 加 Origin 闸门不会误伤它们。

**改法**：
- **token 换熵源**：`common/ws-token.js` 用 `randomBytes(32).toString('base64url')`（43 字符 / 256 bit），
  不再复用给所有 ID 的 `nanoid(7)`（42 bit）
- **Origin 闸门**：`server/ws-origin.js` 用 `new URL(origin).hostname` 精确判回环，不用字符串包含 ——
  `http://127.0.0.1.evil.com`、`http://localhost.evil.com` 这类伪造字样一律拒
  （WS **不走 CORS 预检**，任何网页都能往本机端口发 WS，Origin 是第二道锁；无 Origin 头放行，因为
  脚本客户端仍受 token 约束）
- **token 定长比较**：`crypto.timingSafeEqual`，长度不同直接否
- **fs 名单前后端共用**：抽成 `common/fs-functions.js`，服务端按它校验，名单外的返回
  `不允许的文件操作: X`
- **删掉假的门**：`POST /auth` 及其孤儿 `globalState.authed` 一并删除，原处留注释说明为什么 ——
  留一个"看着能鉴权、实际无人调用也从未生效"的端点只会误导后来的人

**残留说明（不粉饰）**：名单**不是沙箱**。`runWinCmd`（拼 powershell）是真实功能
（`file-info-modal.jsx` 用它算 Windows 文件夹大小），仍在名单里。也就是说这轮修的是
「任意函数都能调」，不是「名单内的函数本身危险」。本机 WS 的真实防线 = **回环绑定 + Origin 校验 +
256 bit token**，三者叠加后，网页要打进来需要先知道 token。

**证据**：
- 单元测试 `test/unit-ci/ws-auth.spec.js` **5/5**（全量 41/41）
- 实机 CDP `temp/verify-issue3.js` **21/21**：token 43 字符；`constructor`/`__proto__`/`rm` 全部被拒
  **且目录仍在**；外站 Origin 与伪造回环域名 Origin 都读不到数据；错/空/前缀 token 全拒；
  一连串拒绝后正经连接照常
- **主流程实测**：真开一个本地终端，xterm 缓冲区出现 `C:\Users\Administrator>` ——
  终端数据只能经 `session-server` 的 WS 过来，说明改过的 `verify` 没有卡住正经会话
  （注：`status === 'success'` **不能**当判据，它在 `new WebSocket()` 之前就置位了，
  `terminal.jsx:1455` 拿到端口即置成功、1459 才建 WS —— 这条差点让我误判，已写进注释）


### #4 修复说明（升级包完整性校验）

**先取证，两个发现改变了这条的严重性判断：**

1. **现在有两条更新路径，出问题的是旧的那条**。主路径走 electron-updater
   （`autoUpdaterDownload` → `downloadUpdate()` → `quitAndInstall()`），它自己会按
   latest.yml 校验 sha512，**是安全的**。本 issue 指的是另一条自研路径
   （`server/download-upgrade.js` + `/upgrade/:id` WS）。
2. **这条自研路径已经从 UI 上摘掉了**：`b3bd2c3d`（2026-06-19，切 electron-updater 时）
   删掉了 `components/main/upgrade.jsx` 里的 `import upgrade from '../../common/upgrade'`，
   全仓库再无调用方 —— 客户端 `common/upgrade.js` 成了孤儿，服务端 `/upgrade/:id` 还挂着。
   所以它不是"一触即发"，而是**一个没人用、但仍可被 WS 调用的静默安装后门**。

3. **闸门装上后自己又发现一个洞，差点白修**：`upgrade-func` 的处理是
   `globalState.getUpgradeInst(id)[func](...args)`，**func 由客户端消息决定**。
   也就是说客户端可以直接发 `func: 'onEnd'` —— 一步跳过我刚加的完整性校验，
   直接写 bat 静默安装。**能被绕过的闸门不算闸门**，已一并堵掉
   （与 #3 的 fs 名单是同一类缺陷：拿客户端给的字符串去查对象/调方法）。
   这正是「缺陷回流」要防的：同类问题换个地方又冒出来。

**修法**（按"先把闸门装上"处理，不删功能）：
- 新增 `server/upgrade-verify.js`：算文件 sha512（流式，100MB+ 不读进内存）、
  解析 latest.yml、校验
- **期望值只从 GitHub 取**（release 里的 latest.yml，electron-builder 发布时生成）。
  绝不从镜像取 —— 否则投毒的镜像只要配一份假 yml 就能自圆其说
- 装之前先过校验，两种失败**分开处理**（一刀切会误伤或误放）：
  - **有期望值但对不上** → 文件是坏的或被人换过 → **删掉，且绝不打开**
  - **取不到期望值** → 只是"没能证明它是好的" → **保留文件，转手动安装**
    （手动 = 用户自己确认，与静默 `/S` 不是一回事；也照顾了墙内下得了镜像、
    取不到 GitHub 的场景）
- 顺手堵掉 `id` 直接拼进 bat 文件名的路径注入（`id` 来自客户端消息）
- **`upgrade-func` 加方法名单**（`common/upgrade-funcs.js` = pause/resume/destroy，
  与客户端 `transferKeys` 同一组），名单外的 func 一律拒绝并记日志

**顺带修的一处（已披露，非本 issue 诉求）**：非 Windows 分支原本给客户端发的是
`transfer:end:`，而客户端监听的是 `upgrade:end:` —— 事件名对不上，永远收不到完成回调。
已随 `manualInstall` 抽取消正。

**未做（留给祥哥拍板）**：这条路径整体已是孤儿。要不要**整个删掉**
（客户端 `common/upgrade.js` + 服务端 `/upgrade/:id` + `download-upgrade.js`），
还是等以后重新接回镜像下载能力？我没擅自删，因为它承载着"三方镜像加速"这个
可能是刻意保留的能力。

**证据**：
- 单元测试 `test/unit-ci/upgrade-verify.spec.js` **5/5**（全量 46/46）：
  用真 latest.yml 原文解析；多文件按名精确取、取不到返回 null（不退回第一条放行）；
  12 种畸形输入一律 null；sha512 对公开已知向量（非自算自比）
- 实机 `temp/verify-issue4.js` **18/18**：
  - 真网络走真 `getExpectedIntegrity` 解析真 latest.yml，解析出的 size 与 GitHub API
    报的 size **两个独立来源互证**一致
  - **真实产物**：把真安装包按 Range 截断到 2MB（模拟"下到一半断了"——原来这种文件
    会直接被静默安装），大小闸门当场拒掉
  - 加载**真类真方法**，只把落地的两个动作换成记录器，验四种输入下的决策：
    无期望值→转手动且保留文件；哈希不符→删文件+报错；校验通过→才进安装；截断→拒+删
  - 全程 `quitAndInstall` 一次未发、temp 下未留 `xnow-update-*.bat`（**没有真的装**）
  - **真 WS 打真服务端**：带 token + 回环 Origin 连 `/upgrade/:id`，发 `func: 'onEnd'`
    被拒并留日志，发 `func: 'pause'`（名单内）不被误拒 —— 一拒一放形成对照，
    证明它确实按客户端给的 func 去查名单了；`__proto__` 同样被拒，且没把服务进程搞崩

### #27 修复说明（发版打包的代码不是最新的）

**先取证，确认了这不是"可能"而是"已经"：**

`electron-builder` 打的是 `work/app`，而 `work/app` 里的东西来自两条不同的路径：

| 内容 | 谁刷新 |
|---|---|
| 渲染层 `work/app/assets` | `vite-build` |
| 主进程代码 `work/app/*.js` | 只有 `prepare.js` 的 `cp -r src/app work/` |

`npm run rx`（release-xnow.js）原来只跑 `vite-build` —— **主进程那一半从来没被刷新过**。
实测当下状态：`src/app` 148 个文件里 **83 个**与 `work/app` 不一致，
其中 `common/fs-functions.js`、`common/ws-token.js`、`common/upgrade-funcs.js`、
`lib/path-safe.js`、`server/ws-origin.js` 是**整个文件都不存在** ——
也就是说第 1/2 批的安全修复一个都进不了包。文件时间戳也对得上：
`src/app/lib/ipc.js` 是 9-12、`work/app/lib/ipc.js` 停在 6-19（上次跑 `npm run b` 那天）。

危险之处在于它是**静默**的：版本号是新的、安装包能装、GitHub release 正常，
只有用户装上去才发现修复没生效 —— 而且会误判成"修了没用"。

**改法**：
1. `release-xnow.js` 的构建步骤从 `npm run vite-build` 换成 `npm run b`
   （= `clean` + `compile`（含 vite-build）+ `prepare-file`，主进程代码由此刷新）
2. 打包前加一道**校验**：`build/bin/check-src-fresh.js` 逐文件比对 `work/app` 与 `src/app`，
   不一致就抛异常中止发布。光靠"记得跑对命令"不算防线，这一步才是
3. 顺带修正提交时机：原来先 bump 版本号 → commit → push → 再构建。
   现在改成 **构建成功之后再 commit + push**，于是
   (a) 构建失败不会留下一个"已推送但没有产物"的版本号提交；
   (b) `work/app/package.json` 由 prepare.js 生成、提交后不再被改写，发完版工作区是干净的
   （原来 rx 自己写一份、提交，之后若跑了 b 就会被改写 → 发完版工作区变脏）

**代价/副作用**（必须记）：每次发版多花几分钟复制 `node_modules`（`prepare.js` 会整份拷）。
换来的是"包里的代码确实等于当前 `src`"。另外 `prepare.js` 里那句 `yarn autoclean`
在本机是**静默失败**的（机器上没装 yarn，`shelljs.exec` 不抛异常），这是原有行为、
本次未动，但它意味着这条清理步骤长期没生效 —— 记在这里以免以后误以为它在工作。

**证据**：
- 单元测试 `test/unit-ci/release-chain.spec.js` **8/8**（全量 **55/55**）：
  拿临时目录造出"一致 / 差一字节 / 缺文件 / 子目录里不一致 / 打包目录多文件"五种情形，
  验校验器认不认得出（**一个永远返回"通过"的校验比没有校验更糟**，所以校验器本身必须被测）；
  另加两条"链路别被改回去"的静态断言（发布脚本必须跑 `npm run b`、必须调校验，
  `prepare.js` 里 `cp -r src/app work/` 那行必须在）
- 对**真实目录**跑校验器，两个方向都对：
  - 当前真 `work/app` → 退出码 1，报「查了 148 个文件，83 个有问题」并列出前 20 个
  - 一份真正最新的副本 → 退出码 0，「打包目录与源码一致（148 个文件）」
- `node --check` 语法通过、`standard` 干净

**未做**：没有真跑一次 `npm run b` + 打包。（它会 `rm -rf work`、删根目录 `node_modules/cpu-features`、
整份拷贝 `node_modules`，属于会动到原生模块目录的操作，按「原生模块不要碰」没有擅自执行。）
真正发版时 `npm run b` 是否一次跑通，仍是待验证项 —— 但它现在的失败方式是**大声报错**，
而不是像以前那样静默发出一个旧主进程的包。

**第 3 批（发版链路）**
#27 ✅ #24 ✅ #25 ✅ #26 ⛔不修（祥哥 2026-09-12 拍板：不做，就 Windows 单平台）

### #26 定为不修的理由（以及将来要做时的前提条件）

**决定**：不做 Mac/Linux 的自动更新，产品就 Windows 单平台。

**理由**：
- 发版本身走 `npm run rx`（本地），**不需要 CI**；CI 全套是上游 electerm 留下来的，
  19 个 workflow 没有一个在为这个 fork 服务
- mac 的 5 个 workflow 是**之前就手工禁用**的（`gh workflow list --all` 均为 `disabled_manually`）
- mac 自动更新不是"修好 CI 就行"：Squirrel.Mac 会校验签名，**必须有苹果开发者证书
  （$99/年）**才能让自动更新生效；配置里已有的 `notarize: true` / `hardenedRuntime: true`
  也都要证书配套。这是买资源，不是技术债
- Linux 免费可行，但目前没有用户；且要先修 CI 根因（见下）才有意义

**若将来要做，按这个顺序**（现在不做，仅记录，免得将来重新查一遍）：
1. **先修 CI 根因**：所有 workflow 都死在第一步 `npm i` 上 ——
   `@electerm/electerm-resource@1.3.7` 在 `cdn.npmmirror.com` 上 **404**。
   这个根因同时挂着 win-nsis，不修它任何 workflow 都起不来
2. Linux：给 `linux.target` 加 zip/AppImage 之类可供 electron-updater 消费的产物
3. mac：买苹果开发者账号 → 配签名/公证 → `mac.target` 从 `dmg` 改成 `["dmg","zip"]`
   （electron-updater 在 mac 只认 zip，dmg 不行 —— `build/bin/build-mac.js:22` 现在只出 dmg）

### #24 修复说明（安装要静默）

`electron-updater` 的签名是 `quitAndInstall(isSilent = false, isForceRunAfter = false)`，
而 `NsisUpdater.doInstall` 里是 `if (options.isSilent) args.push('/S')` ——
**不给参数就永远不追加 `/S`**，用户点了「立即安装并重启」，看到的是 NSIS 安装向导，
得自己一路点下去。改成 `quitAndInstall(true, true)`：静默安装 + 装完自动拉起应用，
跟按钮文案一致，也符合「像微信一样」的既定偏好。

同时把 `autoInstallOnAppQuit` 从 `false` 改成 `true`：下载好的更新在用户退出应用时装上，
下次启动就是新版。这**不是**"强制重启"——用户点了退出才生效，不打断正在做的事，
只是省掉"必须记得点一次立即重启"。

**代价/副作用**（必须记）：`autoInstallOnAppQuit = true` 之后，**一旦下载完成，
用户就没有"这次先不装"的余地了** —— 下次退出应用必定安装。风险不高（下载已完成
sha512 校验），但如果哪天想留个"我不想现在装"的口子，就把这一行改回 `false`（一行的事）。
另外界面上的"立即重启安装"按钮只在 `readyToInstall` 时才出现，所以参数不会出现
"还没下载就点安装"的情形。

**证据**：
- 单元测试 `test/unit-ci/auto-updater.spec.js` **5/5**（全量 **66/66**）：
  把 `electron-updater` 换成记录器、加载**真的** `auto-updater.js`，断言实际传出的参数
- 实机 `temp/verify-issue24.js` **10/10**：启动真 Electron，连**主进程** Node inspector，
  在运行中的进程里读实参 —— `autoInstallOnAppQuit === true`、`autoDownload === false`；
  把库里的 `quitAndInstall` 换成记录器后调我们模块，**真的传出 `[true, true]`**
  （替换成记录器所以没有真的退出安装，验证完应用仍在运行）；
  并核对 electron-updater 源码里两个参数的落点（`/S`、`--force-run`），证明参数不是形同虚设

### #25 修复说明（打包配置被上游覆盖）

**先说根因，比这条 issue 本身更值得记**：根目录 `electron-builder.json` 在**上游 electerm
是生成物**（`.gitignore:121` 就有 `/electron-builder.json`，那是上游的痕迹），
由 `npm run pb` 从 `build/electron-builder.json` 生成；而本 fork 把它当**手写配置**提交了。
同一个路径既是"上游生成物"又是"fork 的手写配置"，19 个上游 workflow 又都调 `npm run pb`
—— 误跑一次就静默把发版配置换成上游的。

**改了三个地方**：
1. `build/bin/check-builder-config.js`（新）：认这份配置是不是本 fork 的，
   逐条检查都对应一个具体后果 —— `appId`（安装身份，换了老用户更新装不上去）、
   `productName` / `nsis.artifactName`（发版脚本按名找产物）、`nsis.include`
   （丢了就没有「升级静默保留用户数据、手动卸载才询问清除」的卸载逻辑）、
   `win.publish.owner/repo`（发到哪）、以及 **`channel` 必须不存在**
   （有 channel 时不产出 `latest.yml`，客户端只认 `latest.yml` → 更新永远收不到）
2. `release-xnow.js`：**在改版本号之前**先校验这份配置 —— 校验放在最前面，
   因为构建要跑几分钟，等构建完再拦就白跑了
3. `prepare-electron-build.js`：覆盖前备份成 `.bak`（已存在就不覆盖，留住最早那份）、
   覆盖后明确喊话"你刚把本 fork 的配置换掉了"+ 恢复命令。
   备份是为了救**未提交的本地改动** —— 那种情况 `git checkout` 是救不回来的

**代价/副作用**：`npm run pb` 之后根目录配置确实是错的，`npm run rx` 会拒绝执行，
必须 `git checkout -- electron-builder.json` 才能发版。这是有意的（宁可拦下来），
但如果不小心在发版前跑了 pb，会多一步恢复动作。

**更彻底的做法（未做，留作候选）**：把 fork 的配置挪到别的路径（如
`build/electron-builder.xnow.json`），`rx` 用 `--config` 指过去，pb 就永远碰不到它 ——
从根上消掉这类事故。没做的原因：配置里的相对路径（`icon`、`nsis.include`）
是相对**项目根**还是**配置文件所在目录**解析的会影响打包结果，必须真打一次包才能验证，
而真打包要动原生模块目录、还得发一次 release 才能确认更新链路通 —— 不适合顺手做。

**证据**（真跑出来的，不是推演）：
- 单元测试 `test/unit-ci/release-chain.spec.js` +6 条（全量 **66/66**）：
  用**真文件**当正反样本 —— 本 fork 那份必须零问题、`build/electron-builder.json`
  必须被判不可用且点出 `appId` 与 `channel`；另测"只多一个 channel 也要拦"、
  "channel 是空串不算问题"（防误报）、"配置读不出来判不可用"（不误放行）
- 端到端实测（真跑了 `npm run pb` 复现事故）：跑 pb → 根配置 `appId` 变成
  `org.electerm.electerm`、`.bak` 已生成、警告已打印 → 校验器对这份配置
  **退出码 1** 并列出 7 个问题（含断更新链路的 `channel`）→ `git checkout` 恢复 →
  校验器**退出码 0** → 工作区干净、`.bak` 被 gitignore 忽略
#25 #24 #27 #26

### #45 关闭说明（openExternal 协议白名单）—— 第 2 批顺带关闭，此行原先漏更新

**没有新写代码**。第 2 批做 #1（IPC 桥 + 导航闸门）时已经一并解决了：
新增 `lib/safe-open-external.js` 做协议白名单（只放行
http/https/ftp/ftps/mailto/tel），`openExternal` 改走它。

**复核证据**（2026-09-12 重新查了一遍，确认不是"以为改了"）：
- `grep -rn "shell.openExternal" src/` —— 除 `safe-open-external.js` 自身外**零命中**，
  说明没有绕过白名单的裸调用点残留
- 三个调用点都走白名单：`lib/ipc-sync.js:66`、`lib/create-window.js:108,116`
- `git log` 显示 `safe-open-external.js` 由第 2 批 commit `bc3b0194` 新增，
  **不是上游自带**（上游原本就是裸 `shell.openExternal`）
- 已有测试 `test/unit-ci/safe-open-external.spec.js`，含
  `FILE:///C:/Windows/System32/calc.exe`、`httpfile:///C:/evil.exe`、
  `httpsomething:x` 这类"看起来像但不是"的用例；#1 的实机验证（`temp/verify-issue1.js` 19/19）
  里也真跑过 `openExternal('file://...')` 被拒

**教训（记录传承）**：这条是"修好了但台账没更新"，害我这次差点重做一遍。
批量修复顺带关掉别的条目时，要顺手把那些行也标掉。

### #39 修复说明（SSH 主机密钥校验形同虚设）

**原来的样子**：`execSshCommand` 在内存里记一份主机密钥，发现对不上时
`console.warn` 一句**然后照样连**（`return true`）。而这条路径是要往目标机
发密码和命令的（一键部署哪吒、VPS 监控），中间人把密钥换掉时用户看不到那句警告，
防护等于零。项目里其实已经有写好的 `ssh-known-hosts.js`（`session-ssh.js` 在用），
只是这条路径没接上去。

**为什么不用现成的 `createHostVerifier`**：那条是**交互式**的，会弹"是否信任该主机密钥"。
`execSshCommand` 没有终端可以问（点一下就批量执行），弹不出来。所以按 OpenSSH 的
`StrictHostKeyChecking=accept-new` 语义办，新增 `createAcceptNewHostVerifier`：

| 情况 | 行为 |
| --- | --- |
| known_hosts 里有且一致 | 放行 |
| **有但对不上 / 被 @revoked** | **拒绝连接** |
| 从没见过 | 记住它（写进 `~/.ssh/known_hosts`）再放行 |
| 读不了 / 写不了 known_hosts | **拒绝**（fail closed，不赌） |

关键是**没有"警告一下继续连"的中间态**。用真实文件还有个附带好处：用户在终端里
确认过的主机和这里共用同一份信任记录，不再是各记各的。

**顺带修的 UX 问题**：ssh2 校验失败时抛给上层的是它自己那句
`Host denied (verification failed)` —— 看不出是哪台机、哪个指纹对不上，
用户没法判断是"真被劫持"还是"机器重装了"，很可能就绕过防护了。
现在把详细原因（主机、端口、指纹、known_hosts 路径）转给用户。

**代价/副作用**：给目标机重装系统后主机密钥会变，这时一键部署**会被拒绝**，
报错里带了指纹和 known_hosts 路径，需要用户自己去删掉那条旧记录。
这是有意的取舍 —— 安全上的默认必须是"拒绝"，但确实多了一步手工操作，
预计会有人问"为什么突然部署不了"。报错信息就是为这个场景写的。
另外记录写的是 `~/.ssh/known_hosts`（与系统 `ssh` 共用），不是应用自己的目录。

**没做的**：`createHostVerifier` 那套交互式确认没动；终端里的会话行为不变。

**证据**（真起 SSH 服务端连出来的，不是推演）：
- 单元测试 `test/unit-ci/ssh-host-verifier.spec.js` +9 条（全量 **75/75**）：
  首次放行并落盘、同密钥不重复写、**换密钥拒绝**、`@revoked` 拒绝、
  非 22 端口"写进去的格式和认出来的格式必须同一套"、读写不了时 fail closed、
  审计回调抛异常不拖垮判断，外加两条静态断言（`ipc.js` 走的是这个工厂、
  被拒原因要转给用户）
- 实机验证 `temp/verify-issue39.js`（**12/12**）：用 ssh2 自带的 `Server` 起**真 SSH 服务端**，
  真的 `Client` 带上同一套校验器去连。四个场景：首次连上并落盘 → 同密钥连上且不重复写
  → **对端换密钥时被拒**（`Host denied (verification failed)`，改前会成功）
  → 被拒的密钥没落盘（再查仍是 `mismatch`）
- 实机验证 `temp/verify-issue39-ipc.js`（**9/9**）：把 electron 换成假的只为拿到
  `ipcMain` 注册的处理器，调**真的** `initIpc()` 取出**真的** `execSshCommand`，
  让它连真服务端 —— 证明用户实际收到的报错是带主机、端口、`SHA256:` 指纹和
  known_hosts 路径的那句，而不是 ssh2 那句看不懂的 `Host denied`
- 两次验证都用临时目录当 HOME，**没有碰真实的 `~/.ssh/known_hosts`**
#39

### #47 修复说明（SSH 已破解套件不再"每次连接都报价"）

**先纠正原行的描述**（查证后与代码不符，照原样修会做错）：

`algDefault()` **只给 `kex` / `hmac` / `compress` 三个键**，`cipher` 和 `serverHostKey`
缺省时 ssh2 用的是**它自己的默认表**。实测 ssh2 的 `DEFAULT_CIPHER` 里
**没有** `3des-cbc`/`arcfour*`/`blowfish`，`DEFAULT_SERVER_HOST_KEY` 里**没有** `ssh-dss`。

所以原行里"算法集含 `3des-cbc`、`arcfour*`、`ssh-dss`"这半句，指的是 `algAlt()`
（重试档）里的内容 —— 而**这些从来没被真正报价过**，原因见下。
真正"每次连接都在报价"的只有两个：`diffie-hellman-group1-sha1`（1024 位
Oakley Group 2，Logjam）和 `hmac-md5`/`hmac-md5-96`。**这两个才是要修的**。

**顺带挖出一个更要紧的问题：那条兜底路径从来没成功过。**

给"删掉弱算法会不会让老设备连不上"做实测时发现的：
`algAlt()` 的 `cipher` 里塞了 `blowfish-cbc` / `arcfour256` / `arcfour128` / `arcfour`，
**这个 ssh2 构建根本不支持它们**。而 ssh2 对显式数组里不认识的算法名是**直接抛错**
（`utils.js` `generateAlgorithmList` → `Unsupported algorithm: X`）——
也就是说 `algAlt()` 一调用就抛，`reTryAltAlg()` **从来没成功过**。

这条很关键：**只删 default 不修 alt 就是倒退**。改前老设备至少能在第一次握手
（default 里有 group1-sha1）连上；改后第一次失败、重试又抛错 → **彻底连不上**。
所以这一项必须两件事一起做，缺一不可。

**改法**（`server/ssh2-alg.js`）：

- `algDefault()` 移除 `diffie-hellman-group1-sha1`、`hmac-md5`、`hmac-md5-96`
- `algAlt()` = default 全集 + `LEGACY_KEX` / `LEGACY_HMAC` 加回来，**并删掉 4 个
  ssh2 不认识的 cipher**（`3des-cbc` 保留 —— 还有在役设备只认它）
- sha1 系列**有意保留在 default**：OpenSSH 自己也仍默认启用，一刀切会连不上一大批在役设备

**保留项 / 代价（说清楚，别当成漏修）**：`3des-cbc` 与 `ssh-dss` 仍在重试档里。
重试是**握手失败后自动触发一次**（`session-ssh.js:35` `reTryAltAlg`，由
`csFailMsg` 且 `!altAlg` 守卫），所以残留风险是：**能阻断首次握手的中间人可诱导
降级到重试档**。要彻底消除，就得把 `3des-cbc`/`ssh-dss` 也从重试档删掉 ——
代价是只认这几种的老交换机/老路由器**再也连不上**。这一条是**能力取舍**，
留给祥哥拍板（当前取"保留老设备兼容"，与重试档的设计意图一致）。

**证据**（三层，`temp/` 下）：

| 层 | 结果 |
|---|---|
| 单测 `test/unit-ci/ssh-alg-tier.spec.js` | 8/8（全套 `npm run test-unit-ci` 83/83） |
| 实机握手 `temp/verify-issue47.js` | 11/11 |
| 守卫有效性反证 `temp/verify-issue47-guard.js` | 旧代码抓出 4 个坏算法名、新代码 0 个 |

实机握手用真 ssh2 `Server`+`Client`，三个场景是关键：
① 强套件服务器 + `algDefault` → 连得上（基本盘没改坏）
② 只认 `group1-sha1`+`hmac-md5` 的服务器 + `algDefault` → **连不上**（符合预期，已不报价）
③ 同一台老服务器 + `algAlt` → **连得上**（兜底生效，老设备没被抛弃）

单测里那条「两档里的每个算法名 ssh2 都认识」就是钉住"兜底路径被写死"这个坑的 ——
它现在会拦住任何往算法表里塞 ssh2 不认识名字的改动。**用旧代码跑这条会失败**，
是用 `temp/verify-issue47-guard.js` 反证过的（两边都过的测试等于没测）。

### #31 / #38 / #42 / #43 修复说明（第 5 批：网络与输入面）

四条都遵守同一条纪律：**先证明原问题真的存在，再动手**。所以每条的单测里都有一句「反证」——
把旧实现/旧行为拿来跑同一批用例，证明它确实会挂（#31 的旧 `isPrivateHost`、
#47 的旧算法表都是这么做的）。**两边都过的测试等于没测。**

#### #31 SSRF —— 两处「想当然会做错」的地方

**① `isPrivateHost` 不能自己硬写字符串比对**，有两类它天然看不出来：

- `new URL()` 会把 `2130706433` / `0x7f000001` / `127.1` / `0177.0.0.1`
  **统一归一化成 `127.0.0.1`** —— 这部分不用自己还原，交给解析器就行；
- 但 IPv6 它**会重写成十六进制**：`[::ffff:169.254.169.254]` → `::ffff:a9fe:a9fe`。
  只按 `::ffff:` + 点分十进制去判会**直接漏掉**，得把末两组按十六进制还原回 IPv4。
- `127.0.0.1.nip.io` 这类**域名指向内网**，字符串比对永远无解 → 必须查 DNS，
  且**只要解析出的任一地址是内网就算内网**（DNS rebinding 的典型形态）。

**② `httpFetch` 不能照搬 `webFetchPage` 的策略 —— 会把功能砍掉。**
`httpFetch` 的调用方是 **netdata 监控（`netdata-api.js:5`）和哪吒 Dashboard
（`nezha-api.js:27`）**，地址是**用户自己配的服务器**，本来就可能是 `192.168.x.x`
甚至本机。内网一律拦 = 直接砍掉这两个功能。

所以分了两套判定：

| 用途 | 函数 | 策略 |
|---|---|---|
| `webFetchPage`（AI 抓网页，URL 来自模型输出，**不可信**） | `isPrivateHost` | 内网 / 环回 / 链路本地 / 保留段**全拦** + DNS 判定 |
| `httpFetch`（监控，地址是用户配的） | `isLinkLocalOrReserved` | **有意放行 RFC1918 与环回**，只拦「任何监控都不可能指向」的：链路本地（含 `169.254.169.254` 云元数据）/ 保留段 / 组播 / 元数据域名 + DNS 判定 |

窄策略**也必须查 DNS**：不然 `169.254.169.254.nip.io` 一样能绕过字符串判定。

> **代价/副作用**：DNS 判定在解析失败时**放行**（fail-open）。理由：解析不出来时
> 后面的请求本身也连不上，不存在「实际能打通却被放过」；反过来 fail-closed 会让
> DNS 抖一下就误伤正常请求。这是**有意的取舍，不是漏写**。

#### #38 `compactDatafile` —— 改对调用方之前，先看清被调方

原调用 `dbAction('compactDatafile')` 少传一个参数：`dbName` 被当成表名、`op` 变 `undefined`。
但**只把调用方改对会引入新崩溃** —— NeDB 分支里 `compactDatafile` 是同步调用 + 裸 `return`
（返回 `undefined`），而调用方写的是 `.catch(log.error)`，对 `undefined` 调 `.catch` 直接
TypeError。`dbAction` 其它所有分支都返回 Promise，所以按约定把这一支也包成 Promise
（异常走 reject）。**两处必须一起改。**

#### #42 会话 WS —— 原描述里「进程级 handler 无条件吞异常」这半句不准确

实测：**会话进程**（`session-server.js`）的 `uncaughtException` / `unhandledRejection`
是 `log.error` + `cleanup()` → **`process.exit(0)`，并不吞**；真会吞的是**父进程**
（`server/server.js:41-46`，只记日志继续跑）。所以畸形 JSON 的实际后果是
**会话进程被打死** —— 而那个进程里挂着同一会话的**全部终端**，
一条脏消息 = 用户所有标签页一起断。现在三处（sftp / transfer / 升级）统一走
`parseWsMessage`：**丢这条消息，不断连接**。

`dispatch-center.js` 的 `/common/s` 里那处裸 `JSON.parse` **没改** —— 它外层本来就有
`try`，抛出去不会变成致命异常。单测里那条静态检查也是按这个标准写的
（判「外层有没有 try」，而不是「有没有裸 JSON.parse」），避免误报。

#### #43 深链接 —— 只修了「写日志」这半句，「一点即建标签页」要祥哥拍板

**已修**：4 个入口（`open-url`、`second-instance` 的 `commandLine`、启动 argv、
**以及解析失败那条**）全部走 `redactCreds`。解析失败那条最容易漏，但它恰恰最可能
带密码（没解析成功 = 原样进日志）。覆盖三种形态，其中**不带协议的简写
`user:pass@host` 最容易漏** —— 只按 `scheme://` 写正则会**静默放过**这种最常见的写法，
那比不脱敏更糟（会以为已经安全了）。单测里特意用**真的 `parseQuickConnect`** 兜底：
凡解析出 `password` 的串，脱敏后都不能再出现该密码 —— 将来解析器加了新形态会失败，
逼着回来补脱敏。

**未改（需祥哥拍板）**：`handleDeepLink` 收到带凭据的 URL 会**直接建标签页、无确认**。
但「任意网页一点即建」这个前提**是打折扣的** —— OS 层协议注册是**用户在设置里手动开的**
（`deep-link-control.jsx:28`），不是自动注册的。要不要再加一道确认弹窗属于**交互变更**，
不擅自加。另外 URL 里的凭据是攻击者自己填的（不是偷来的），实际危害有限。

**证据**：新增单测 `ssrf-guard.spec.js` 14/14、`parse-ws-message.spec.js` 6/6、
`redact-url.spec.js` 8/8；全套 `npm run test-unit-ci` **111/111**（本批开始时 83）；
另跑 `temp/verify-issue39-ipc.js` 9/9，确认 `ipc.js` 改完仍能正常加载、#39 未被带坏。

**第 4 批（架构债）**
#39 ✅
#47 ✅
#31 ✅
#38 ✅
#42 ✅
#43 ✅
#18（先打 tag 冻结，按功能组重放，不要 bulk merge）
