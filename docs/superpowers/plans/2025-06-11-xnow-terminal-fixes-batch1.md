# XNOW Terminal 第一批问题修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 XNOW Terminal 的 6 个问题（3 个安全/配置严重 + 3 个轻度文档/残留）

**架构说明：** 本次修复不涉及架构变更，针对独立文件做定点修复。每个修复之间无依赖关系，可按任意顺序执行。

**涉及文件：** 10 个文件（7 个 js/jsx + 2 个 md + 1 个 json）

---

## 文件结构

| 文件 | 改动类型 | 职责 |
|------|---------|------|
| `src/app/server/dispatch-center.js` | 修改（+7 行） | 命令注入防护 |
| `electron-builder.json` | 修改（1 行） | appId 恢复 |
| `src/app/lib/nedb.js` | 修改（+4 行） | safe-storage 解密容错 |
| `src/app/lib/sqlite.js` | 修改（+4 行） | safe-storage 解密容错 |
| `README.md` | 修改（1 行） | 文档修正 |
| `README_cn.md` | 修改（1 行） | 文档修正 |
| `build/vite/package.json` | 修改（1 行） | 版本号统一 |
| `src/app/lib/command-line.js` | 修改（多处文本） | electerm 残留清理 |
| `src/app/common/parse-quick-connect.js` | 修改（仅注释） | electerm 残留清理 |
| `src/app/common/app-props.js` | 修改（1 行） | electerm 残留清理 |

---

### Task 1: 修复命令注入漏洞

**文件：** `src/app/server/dispatch-center.js`

- [ ] **Step 1.1: 在 `local-tracert` 分支添加 IP 校验**

在 `dispatch-center.js` 第 101-109 行的 `local-tracert` 分支中，`exec` 调用前增加参数合法性校验：

```js
        } else if (action === 'local-tracert') {
          const { id, ip } = msg
          if (!ip) {
            ws.s({ id, error: { message: 'IP is required' } })
            return
          }
          // 安全校验：只允许合法 IP/域名字符
          if (!/^[\w.\-]+$/.test(ip)) {
            ws.s({ id, error: { message: 'Invalid IP address' } })
            return
          }
          exec(`tracert -d ${ip}`, { timeout: 90000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
            ws.s({ id, data: stdout || (err ? err.message : '') })
          })
        }
```

- [ ] **Step 1.2: 确认改动正确**

Run: `grep -n "isValidIp\|/^\[\\\\w" src/app/server/dispatch-center.js`
Expected: 显示新加的校验正则行

---

### Task 2: 修复 appId 回退

**文件：** `electron-builder.json`

- [ ] **Step 2.1: 将 appId 改回 `com.xnow.terminal`**

修改第 2 行：
```json
{
  "appId": "com.xnow.terminal",
```

- [ ] **Step 2.2: 确认 productName 存在**

确认 `electron-builder.json` 中已有 `productName` 字段（或从 `package.json` 的 `name` 继承）。当前文件没有显式 `productName` 字段，但 diff 显示之前有 `"productName": "XNOW Terminal"`，看是否需要补回。

检查当前 electron-builder.json 是否包含 productName，如果没有则在 appId 下一行添加：
```json
  "productName": "XNOW Terminal",
```

- [ ] **Step 2.3: 确认改动**

Run: `grep -n "appId\|productName" electron-builder.json`
Expected: `appId: com.xnow.terminal` + `productName: XNOW Terminal`

---

### Task 3: 修复 safe-storage 解密兼容

**文件：** `src/app/lib/nedb.js`、`src/app/lib/sqlite.js`

- [ ] **Step 3.1: 修改 nedb.js 的 decryptDoc 函数**

在 `nedb.js` 第 95-102 行 `decryptDoc` 的 catch 分支增加 `v2:safe:` 检测：

```js
      try {
        const plain = decryptData(doc._encdata)
        const parsed = JSON.parse(plain)
        const { _encdata: _, ...rest } = doc
        return { ...rest, ...parsed }
      } catch (e) {
        // 当 safeStorage 解密失败时，加密原文 (v2:safe:...) 无法 JSON.parse
        // 静默忽略，当该字段不存在处理
        if (typeof doc._encdata === 'string' && doc._encdata.includes('v2:safe:')) {
          const { _encdata: _, ...rest } = doc
          return rest
        }
        return doc
      }
```

- [ ] **Step 3.2: 修改 sqlite.js 的 toDoc 函数**

在 `sqlite.js` 第 104-107 行的 catch 分支增加 `v2:safe:` 检测：

```js
      try {
        r = JSON.parse(raw || '{}')
      } catch (e) {
        // 当 safeStorage 解密失败时，加密原文 (v2:safe:...) 无法 JSON.parse
        // 静默忽略，当该字段不存在处理
        if (raw && raw.includes('v2:safe:')) {
          r = {}
        } else {
          console.error(`Error parsing JSON for row ${row._id}:`, e.message)
        }
      }
```

- [ ] **Step 3.3: 确认改动**

Run: `grep -n "v2:safe:" src/app/lib/nedb.js src/app/lib/sqlite.js`
Expected: 两个文件都包含新加的 `v2:safe:` 检测逻辑

---

### Task 4: 修正 README 文档

**文件：** `README.md`、`README_cn.md`

- [ ] **Step 4.1: 修改英文 README**

`README.md` 中 `npm run dev` → `npm start`：

```bash
  npm start
```

- [ ] **Step 4.2: 修改中文 README**

`README_cn.md` 中同样修改：

```bash
  npm start
```

- [ ] **Step 4.3: 确认改动**

Run: `grep -n "npm run dev\|npm start" README.md README_cn.md`
Expected: 不再出现 `npm run dev`，`npm start` 出现在开发说明位置

---

### Task 5: 统一版本号

**文件：** `build/vite/package.json`

- [ ] **Step 5.1: 修改版本号**

`build/vite/package.json` 第 3 行 `"version": "3.13.0"` → `"version": "3.12.8"`

- [ ] **Step 5.2: 确认改动**

Run: `grep '"version"' build/vite/package.json package.json`
Expected: 两个文件版本号一致（`3.12.8`）

---

### Task 6: 清理 electerm 残留引用

**文件：** `src/app/lib/command-line.js`、`src/app/common/parse-quick-connect.js`、`src/app/common/app-props.js`

- [ ] **Step 6.1: 修改 command-line.js**

将 CLI 名称和帮助示例中的 `electerm` 替换为 `xnow-terminal`：

```js
    .name('xnow-terminal')
    .description('XNOW Terminal - command line interface')
    .usage('[options]')
    .help(`
Examples:
  xnow-terminal user@xx.com
  xnow-terminal user@xx.com:22
  xnow-terminal --password password --set-env "SECRET=xxx USER=hhhh" user@xx.com:22
  xnow-terminal -l user -P 22 -i /path/to/private-key -pw password xx.com -T -t "XX Server"
  xnow-terminal -sp 30976
  xnow-terminal -bo "/home/root/works.json"
  xnow-terminal -tp "telnet" -opts '{"host":"192.168.1.1","port":23,"username":"root","password":"123456"}'

Environment Variables:
  DATA_PATH=/custom/path/to/xnow-terminal-data xnow-terminal
  NO_PROXY_SERVER=1 xnow-terminal
  PROXY_BYPASS_LIST="127.0.0.1, 127.0.0.1" xnow-terminal
`)
```

注意：`-sp` 参数格式（端口）和环境变量 `DATA_PATH` 中的目录名保持为 `electerm`（与数据目录兼容，不应改动）。

- [ ] **Step 6.2: 修改 parse-quick-connect.js（仅注释）**

只改注释中的 `electerm` → `xnow-terminal`，协议名 `electerm://` 保留不动（功能兼容）。

```js
/**
 * Supported Protocols: ssh, telnet, vnc, rdp, spice, serial, ftp, http, https, electerm
 *
 * xnow-terminal:// Format (default type is ssh):
 * xnow-terminal://[username:password@]host[:port]?type=ssh&anyQueryParam=anyValue
 * xnow-terminal://host?type=telnet
 * xnow-terminal://user@host:22?type=vnc
 */
```

- [ ] **Step 6.3: 修改 app-props.js**

```js
  const exePath = app.getPath('exe').replace('\\xnow-terminal.exe', '')
  const p = exePath + '\\' + 'xnow-terminal'
```

- [ ] **Step 6.4: 确认改动**

Run: `grep -n "electerm" src/app/lib/command-line.js src/app/common/parse-quick-connect.js src/app/common/app-props.js | grep -v "//\|electerm://\|@electerm\|comment" | head -10`
Expected: 没有对外展示的 `electerm` 文本残留

---

## 验证条件

所有 task 完成后，按以下顺序验证：

1. **语法检查：** `node -c src/app/server/dispatch-center.js && node -c src/app/lib/nedb.js && node -c src/app/lib/sqlite.js`
   - 预期：所有文件无语法错误

2. **开发服务器启动：** `cd build/vite && node dev-server.js`（启动后按 Ctrl+C 停止，或检查端口 5570 监听）
   - 预期：server started at http://127.0.0.1:5570

3. **版本号一致性：** `grep '"version"' package.json build/vite/package.json`
   - 预期：两个文件都显示 `3.12.8`

4. **构建配置：** `grep "appId" electron-builder.json`
   - 预期：`"appId": "com.xnow.terminal"`

## 依赖关系

所有 Task 之间无依赖关系，可以并行或按任意顺序执行。
