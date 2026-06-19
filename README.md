# XNOW Terminal

> 基于 electerm 深度定制的终端/SSH/SFTP 客户端 — 为运维工程师打造。
>
> 集 AI 助手、VPS 监控看板、实时延迟检测于一体，让服务器管理更高效。

---

## 🖼️ 界面预览

> *截图待添加 — 运行项目后截取以下界面替换占位图*

### 主界面

![主界面](docs/screenshots/main.png)
<!-- 截取：终端主界面 + 多标签 + SSH 连接状态 -->

### VPS 作战看板

![VPS 看板](docs/screenshots/vps-dashboard.png)
<!-- 截取：VPS 信息面板，含到期时间/流量/价格/状态 -->

### 实时延迟监测

![延迟监测](docs/screenshots/ping-monitor.png)
<!-- 截取：底部实时延迟柱状图 + 信号灯 -->

### AI 助手

![AI 助手](docs/screenshots/ai-panel.png)
<!-- 截取：AI 对话面板 + Agent 模式执行任务 -->

### 右侧面板系统

![右侧面板](docs/screenshots/right-panels.png)
<!-- 截取：VPS 面板 + AI 面板同时打开 -->

---

## ✨ 功能亮点

### 🛡️ 运维增强

| 功能 | 说明 |
|------|------|
| 📊 **实时延迟监测** | SSH 协议层 TCP Ping，毫秒级 RTT 柱状图 + 底部三色信号灯 |
| 🃏 **VPS 作战看板** | 到期倒计时、月付价格、流量使用、过期红色告警、服务商面板一键跳转 |
| 🔗 **书签关联 VPS** | 书签绑定 VPS 扩展字段，状态一目了然 |
| 🔄 **自动重连** | SSH 断线自动恢复，不掉线 |
| 📁 **SSH+SFTP 分屏** | 终端和文件管理器同时操作，效率翻倍 |
| 🧭 **三网路由检测** | 去程 + 回程路由自动识别（CN2/4837/CMIN2 等） |
| 📈 **Ping 历史图表** | 延迟趋势图 + 丢包率统计 |

### 🤖 AI 增强

| 功能 | 说明 |
|------|------|
| 🧠 **AI 聊天** | 集成大模型，直接在终端提问 |
| 🔧 **Agent 模式** | AI Agent 自主分析服务器状态、执行诊断命令 |
| 📦 **技能商店** | 安装社区技能，一键排查常见问题 |
| 📋 **一键解释** | 选中终端输出，AI 自动分析 |

### 🎨 界面优化

| 功能 | 说明 |
|------|------|
| 🪟 **Windows 11 原生** | 云母材质、窗口圆角、原生标题栏 |
| 🇨🇳 **全中文界面** | 完整中文本地化 |
| 🖱️ **终端右键菜单** | 复制/粘贴/全选/清屏，快捷操作 |
| 📐 **可调右侧面板** | VPS 面板 + AI 面板，独立拖拽宽度 |
| 🎯 **实时布局适配** | 窗口缩放终端自适应，不遮挡 |
| ⚡ **高性能** | 基于 xterm.js + WebGL 渲染 |

### 📦 开箱即用

- 默认 SSH+SFTP 分屏 + 自动重连 + 中文
- 干净首页、零弹窗
- 书签导入/导出/分组
- 支持 SSH/Telnet/Serial/RDP/VNC/Spice
- 全局配置同步（GitHub Gist）

---

## 📥 下载

从 [GitHub Releases](https://github.com/xiasummer740/xnow-terminal/releases) 下载最新安装包。

| 平台 | 安装包 |
|------|--------|
| Windows x64 | `XNOW-Terminal-*-win-x64-installer.exe` |
| macOS | `XNOW-Terminal-*-mac-x64.dmg` / `*-mac-arm64.dmg` |
| Linux | `.deb` / `.rpm` / `.tar.gz` / `.snap` |

### 一键更新

内置 `electron-updater`，启动后自动检测 GitHub 新版本：
- 有新版发布 → 弹出更新提示
- 点击下载 → 进度条 → 重启即完成
- 类似微信的一键更新体验

---

## 🔧 开发

```bash
# 克隆
git clone https://github.com/xiasummer740/xnow-terminal.git
cd xnow-terminal

# 安装依赖
npm install

# 前端构建
npm run vite-build

# 启动开发模式
cd build/vite && node dev-server.js &
cd ../.. && NODE_ENV=development npx electron work/app/app.js
```

### 同步上游（electerm）

```bash
npm run sync-upstream
```

---

## 📦 构建发布

```bash
# 1. 更新版本
#    修改 package.json + work/app/package.json 中的 version

# 2. 前端构建
npm run vite-build

# 3. 打包并发布到 GitHub Releases
export GH_TOKEN=your_github_token
npx electron-builder --config electron-builder.json --win --x64 --publish always

# 4. 发布 GitHub Release（从 draft → public）
gh release edit v3.17.0 --draft=false
```

> 注意：`build-pty-electron.js` 是安全模式，正常构建不需要手动编译 node-pty。
> electron-builder 打包时自动处理原生模块（已配置 `npmRebuild: false`）。

---

## 🙏 致谢

- [electerm](https://github.com/electerm/electerm) — 本项目的上游基础（MIT 许可证）
- 所有贡献者和用户

---

## 📄 许可证

基于 [electerm](https://github.com/electerm/electerm) (MIT) 修改。  
本项目同样以 MIT 许可证发布。

---

> ⚡ XNOW Terminal — Make Terminal Smart Again.
