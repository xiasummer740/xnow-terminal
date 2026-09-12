# XNOW Terminal

> 全局规则见 `xiangge-env/CLAUDE.md`（17条规则 + 验证报告 + 独立复审）
> 本文件只含项目特有信息，不重复全局规则。

v3.17.11 | Electron 41 + React 19 + Vite 8 + Antd
终端/SSH/SFTP/Telnet/串口/RDP/VNC/Spice 客户端

## Commands

```bash
npm start        # 开发模式
npm run build    # 构建
npm test         # Playwright E2E + 单元测试
```

## 项目特有规则

- **C++ 原生模块（.node）不要碰**：重编会破坏预编译二进制导致 electron-builder 编不过
- **测试在 test/e2e/** 下，不在根目录 e2e/
- **E2E 测试分 3 组跑**：`test1` `test2` `test3`
- **`work/app` 会过期，改完 `src/app` 必须整体同步再验证**：`work/app` 是 `src/app` 的拷贝，只重打前端（`npm run build`）**不会**带上主进程改动。
  - 别只拷"我改的那几个文件" —— 旧副本缺的是**所有新增文件**，拷一个进来会立刻被它 require 的兄弟文件拖垮。2026-09-12 实测：只拷 `lib/create-window.js` 进 6 月的旧副本，启动即弹 `Cannot find module './safe-open-external'`。
  - 正确做法是整体覆盖：`cp -r src/app/. work/app/`（`src/app` 里没有 `assets`/`node_modules`/`package.json`，覆盖安全），或用 `npm run b` 全量重建。
  - 验证任何渲染层改动前，**先删掉测试目录下的 `Cache` / `Code Cache` / `GPUCache`**：bundle 文件名不带 hash（`electerm-<version>.js`），Chromium 会直接复用缓存里的旧包，改了等于没改，实测白跑过两轮。
