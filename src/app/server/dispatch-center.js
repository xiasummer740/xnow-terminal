/**
 * communication between webview and app
 * run functions in seprate process, avoid using electron.remote directly
 */

const fs = require('./fs')
const log = require('../common/log')
const { parseWsMessage } = require('./parse-ws-message')
const { Upgrade } = require('./download-upgrade')
const upgradeFuncs = require('../common/upgrade-funcs')

// 只有这几个方法能被客户端远程调用（ISSUES #4）
const upgradeFuncSet = new Set(upgradeFuncs)
const fetch = require('./fetch')
const sync = require('./sync')
const {
  createTerm,
  testTerm,
  resize,
  runCmd,
  tcpPing,
  toggleTerminalLog,
  toggleTerminalLogTimestamp,
  setTerminalLogPath,
  startTerminalLogFile
} = require('./terminal-api')
const globalState = require('./global-state')
const wsDec = require('./ws-dec')

const { isLoopbackOrigin, tokenEquals } = require('./ws-origin')

const { tokenElecterm } = process.env

function verify (req) {
  // 网页不受同源策略限制就能往本机端口发 WS，靠 Origin 把非回环来源挡掉（ISSUES #3）
  if (!isLoopbackOrigin(req.headers.origin)) {
    // 静默拒绝（不告诉对方是哪一项没过），但留一条审计日志
    log.warn('拒绝非回环来源的 WS 连接:', req.headers.origin)
    throw new Error('not valid origin')
  }
  const { token: to } = req.query
  if (!tokenEquals(to, tokenElecterm)) {
    log.warn('拒绝 token 不匹配的 WS 连接')
    throw new Error('not valid request')
  }
  // 原此处判 `requireAuth === 'yes'`：requireAuth 实际是主密码的 pbkdf2 哈希（或空串），
  // 永远不等于 'yes'；且唯一的写入点 POST /auth 没有任何客户端调用。
  // 也就是说这道"主密码门禁"从来没生效过 —— 已按实际情况删除，不再留一个假的门。
  // 本机 WS 的真实防线 = Origin 校验 + 强随机 token（见 ws-origin.js / ws-token.js）。
}

const initWs = function (app) {
  // upgrade
  app.ws('/upgrade/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    ws.on('close', () => {
      const inst = globalState.getUpgradeInst(id)
      if (inst) {
        inst.destroy()
      }
    })
    ws.on('message', async (message) => {
      const msg = parseWsMessage(message)
      if (!msg) return
      const { action } = msg

      if (action === 'upgrade-new') {
        const { id } = msg
        const opts = Object.assign({}, msg, {
          ws
        })
        const inst = new Upgrade(opts)
        globalState.setUpgradeInst(id, inst)
        await inst.init()
      } else if (action === 'upgrade-func') {
        const { id, func, args } = msg
        // func 来自客户端消息，不校验就能 `func: 'onEnd'` 直接跳到静默安装（ISSUES #4）
        if (!upgradeFuncSet.has(func)) {
          log.warn('拒绝未登记的升级操作:', func)
          return
        }
        const inst = globalState.getUpgradeInst(id)
        if (inst) {
          inst[func](...args)
        }
      }
    })
  })

  // common functions
  app.ws('/common/s', (ws, req) => {
    verify(req)
    wsDec(ws)
    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message)
        const { action } = msg
        if (action === 'fetch') {
          fetch(ws, msg)
        } else if (action === 'sync') {
          sync(ws, msg)
        } else if (action === 'fs') {
          fs(ws, msg)
        } else if (action === 'create-terminal') {
          createTerm(ws, msg)
        } else if (action === 'test-terminal') {
          testTerm(ws, msg)
        } else if (action === 'resize-terminal') {
          resize(ws, msg)
        } else if (action === 'toggle-terminal-log') {
          toggleTerminalLog(ws, msg)
        } else if (action === 'toggle-terminal-log-timestamp') {
          toggleTerminalLogTimestamp(ws, msg)
        } else if (action === 'set-terminal-log-path') {
          setTerminalLogPath(ws, msg)
        } else if (action === 'start-terminal-log-file') {
          startTerminalLogFile(ws, msg)
        } else if (action === 'run-cmd') {
          runCmd(ws, msg)
        } else if (action === 'tcp-ping') {
          tcpPing(ws, msg)
        }
      } catch (err) {
        log.error('通用 WS 错误', err)
      }
    })
  })
  // end
}

exports.verifyWs = verify
exports.initWs = initWs
