# XNOW 终端

> 基于 electerm 深度定制的终端/SSH/SFTP 客户端 — 为运维工程师打造。

## 功能亮点

### 运维增强
- 📊 **实时延迟监测** — SSH 协议层 RTT，柱状图 + 底部信号灯，秒级刷新
- 🃏 **VPS 作战看板** — 到期倒计时、价格流量一览、过期红色告警
- 🔗 **书签关联 VPS 面板** — 一键跳转服务商管理页面
- 🔄 **自动重连** — 断线自动恢复，无需手动操作
- 📁 **SSH+SFTP 分屏** — 终端和文件管理同时显示，独立折叠

### 界面优化
- 🪟 Windows 11 原生窗口圆角
- 🇨🇳 全中文界面
- 🖱️ 终端右键菜单（复制/粘贴/全选/清屏）
- 💾 一键全量备份/恢复

### 开箱即用
- 默认 SSH+SFTP 分屏 + 自动重连 + 中文
- 干净首页，无弹窗无自动连接
- 书签导入导出，换电脑无忧

## 快速开始

### 下载安装（推荐）
从 [Releases](https://github.com/xiasummer740/xnow-terminal/releases) 下载最新安装包，双击安装。

### 开发模式
```bash
git clone https://github.com/xiasummer740/xnow-terminal.git
cd xnow-terminal
npm install && cd server && npm install && cd ../client && npm install && cd ..
npm start
```

## 同步官方更新

```bash
npm run sync-upstream   # 拉取 electerm 官方更新并合并
```

## 许可证

基于 [electerm](https://github.com/electerm/electerm) (MIT License) 修改。
