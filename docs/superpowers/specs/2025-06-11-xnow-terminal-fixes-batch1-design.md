# XNOW Terminal 第一批问题修复设计文档

## 概述

修复 XNOW Terminal 项目当前存在的 6 个问题（3 个严重 + 3 个轻度），涵盖安全漏洞、构建配置、数据兼容性和文档。

## 问题清单与修复方案

### 1. 🔴 命令注入漏洞

**涉及文件：** `src/app/server/dispatch-center.js`

**问题：** `local-tracert` 功能使用 `exec(\`tracert -d ${ip}\`)` 直接拼接用户输入的 IP 参数，存在命令注入风险。

**修复方案：** 在执行前对 `ip` 参数做严格合法性校验，只允许合法域名/IP字符集（字母、数字、`.`、`-`、`_`）。校验不通过则返回错误信息，不执行命令。

```js
// 新增校验
const isValidIp = /^[\w.\-]+$/.test(ip)
if (!isValidIp) {
  ws.s({ id, error: { message: 'Invalid IP address' } })
  return
}
```

### 2. 🔴 appId 回退

**涉及文件：** `electron-builder.json`

**问题：** 当前修改将 `appId` 从 `"com.xnow.terminal"` 变更为 `"org.electerm.electerm"`，导致构建产物与官方 electerm 冲突。

**修复方案：** 将 `appId` 改回 `"com.xnow.terminal"`。同时确认 `productName` 字段保留为 `"XNOW Terminal"`。

### 3. 🔴 safe-storage 解密兼容

**涉及文件：** `src/app/lib/nedb.js`、`src/app/lib/sqlite.js`

**问题：** 当 Electron safeStorage 在新环境下无法解密旧加密数据时（如证书变更、换机器），`safeDecrypt` 返回加密原文 `v2:safe:...`，上层 `JSON.parse` 解析失败报错。影响书签密码等加密字段的读取。

**修复方案：** 在 `nedb.js` 和 `sqlite.js` 的 `toDoc`/`decryptDoc` 函数中，`JSON.parse` catch 分支增加判断：如果 raw 字符串包含 `v2:safe:` 前缀，说明是解密失败的加密数据，返回空对象 `{}` 而非抛错。这样加密字段当不存在处理，不影响其他功能。

### 4. 🟢 README 文档修正

**涉及文件：** `README.md`、`README_cn.md`

**问题：** 文档中 `npm run dev` 命令在 package.json 中不存在，实际应为 `npm start`（Vite 开发服务器）。

**修复方案：** 将文档中 `npm run dev` 替换为 `npm start`。

### 5. 🟢 版本号统一

**涉及文件：** `build/vite/package.json`

**问题：** 版本号为 `3.13.0`，与主 package.json 的 `3.12.8` 不一致。

**修复方案：** 改为 `3.12.8` 以保持一致。

### 6. 🟢 electerm 残留引用

**涉及文件：** `src/app/lib/command-line.js`、`src/app/common/parse-quick-connect.js`、`src/app/common/app-props.js`

**问题：** 代码中仍有多处对外展示的文本使用 `electerm`（如 CLI 帮助、路径硬编码）。

**修复方案：**

| 文件 | 改动 |
|------|------|
| `command-line.js` | CLI 名称、帮助示例中 `electerm` → `xnow-terminal` |
| `parse-quick-connect.js` | 仅改注释文本，`electerm://` 协议保留不动（功能兼容） |
| `app-props.js` | `electerm.exe` 路径替换 → `xnow-terminal.exe` |

## 安全考虑

- 命令注入修复是本次最高优先级的安全修复
- safe-storage 解密兼容修复确保解密失败不导致整个应用崩溃

## 工作量评估

| 问题 | 改动文件数 | 预估时间 |
|------|-----------|---------|
| 命令注入漏洞 | 1 | 5 分钟 |
| appId 回退 | 1 | 2 分钟 |
| safe-storage 兼容 | 2 | 10 分钟 |
| README 修正 | 2 | 2 分钟 |
| 版本号统一 | 1 | 1 分钟 |
| electerm 残留 | 3 | 5 分钟 |

**总计：** 6 个问题，10 个文件变更，预估 30 分钟内完成。

## 验证标准

1. `npm start` 正常启动 Vite 开发服务器
2. `npm run app` 正常启动桌面应用，窗口显示
3. safe-storage 解密失败不再报 JSON parse 错误（日志中不再出现）
4. 构建配置中的 appId 为 `com.xnow.terminal`
5. 版本号统一为 `3.12.8`
6. CLI 帮助文本显示 `xnow-terminal`
