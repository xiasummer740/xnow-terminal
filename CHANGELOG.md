# Changelog

## v3.17.11 (当前)

- chore: `.claude/tasks.json` 自动化验证（build → start → test）
- feat: 升级自动清空旧数据，每次安装全新体验

## v3.17.10

- feat: AI Agent Phase 4 — Tab 锁定扩展 + 内置技能自动注入 + confirm 工具 + Windows 高危命令拦截
- feat: 向 AI Agent 注入 CLAUDE.md 铁律（7 条）
- fix: release-xnow.js Windows 兼容（jq 单引号改双引号）

## v3.17.9

- feat: AI Agent Phase 3 — 技能系统打通（工具注册 + 内置技能）

## v3.17.8

- feat: AI Agent Phase 2 — xiangge-env 方法论注入（排错/方案/审查）

## v3.17.7

- feat: AI Agent Phase 1 — Tab 上下文 + 高危弹窗 + Tab 锁定 + 焦点保护

## v3.17.6

- refactor: 更新通知 UX 改造 — 弹窗改角标 + 关于页
- chore: release-xnow.js 上传兜底 + 自动补传缺失文件

## v3.17.5

- fix: electron-updater 检测更新后自动弹出升级面板（showUpgradeModal）

## v3.17.4

- fix: 本地终端提示符不显示 — 初始发回车触发
- chore: 一键发布脚本 `npm run rx`

## v3.17.3

- fix: upgrade.jsx releaseInfo 空指针崩溃
- fix: 本地终端 conpty.node 缺失 — postinstall 同步编译产物
- fix: 标签栏 + 按钮点击无反应 — 缺少 no-drag

## v3.17.0 — 正式版 + 一键更新

- feat: 一键自动更新（electron-updater）
- fix: 窗口拖拽缩小右侧面板覆盖终端
- fix: 面板拖拽终端自适应 + 全项目 lint 修复
- feat: 日志系统（异常捕获 + 时间线 + 查看器）
- refactor: 窗口拖动重构（CSS drag）+ AI resize 实时同步
- fix: 窗口控制修复 + VPS 面板显示 IP

## v3.16.0

- feat: 实时延迟柱状图 + 丢包率，历史图表只使用 SSH 数据
- fix: 布局使用实际窗口宽度替代膨胀的 innerWidth
- fix: VPS 面板按钮点击后窗口异常扩展
- fix: VPS 面板遮挡终端窗口问题
- docs: 新增 CONTEXT.md（领域语言 + ADR + 文件索引）

## v3.15.0

- feat: AI 悬浮窗（AIFloatWindow）— 独立拖拽窗口
- feat: AI 平台扩展
- feat: Ping 系统并发优化
- refactor: 提取 AI 悬浮窗状态常量

## v3.14.0 — 安全加固 + UI 优化

- feat: 后台 Ping 服务 — TCP 探测所有书签 VPS
- feat: 网络延迟历史记录（1h/6h/24h/3d）+ 丢包率 + 平滑曲线
- feat: 设置页添加后台监控和平滑开关（全局持久化）
- fix: 标签弹性布局修复 — 多标签自动缩窄不溢出
- fix: SFTP 改为垂直分栏（终端下方），默认 70/30 比例
- fix: 拖拽时仅更新 DOM 不触发 store 重绘，解决面板黏鼠标
- style: 激活标签蓝紫渐变流动动画

## v3.13.0

- fix: 丢包记录到历史（-1），超时不记录导致丢包率始终 0%
- fix: 历史延迟弹窗加大到 720px
- feat: Netdata 卡片视图仪表盘 — 真实 CPU/内存/磁盘数据
- feat: 批量部署 Agent UI — 选择多台 VPS 一键安装
- fix: 连接测试改用主进程 httpFetch 绕过 Electron CORS 限制
- fix: Agent 改用 Docker 镜像运行 / 二进制直接部署

## v3.12.x 及更早

完整历史请查看 `git log` 或 [GitHub Releases](https://github.com/xiasummer740/xnow-terminal/releases)。

> 格式基于 [Keep a Changelog](https://keepachangelog.com/)。
