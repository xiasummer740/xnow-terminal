const express = require('express')
const app = express()
const log = require('../common/log')
const { initWs } = require('./dispatch-center')
const {
  isDev
} = require('../common/runtime-constants')
const initFileServer = require('../lib/file-server')
const appDec = require('./app-wrap')

appDec(app)

app.get('/run', function (req, res) {
  res.send('ok')
})
// POST /auth 已删除（ISSUES #3）：
// 它原本把 globalState.authed 置真，但 ① 没有任何客户端调用它（全仓库 grep 过）
// ② 它比对的是主密码的 pbkdf2 哈希（process.env.requireAuth），拿哈希当口令用本身就是错的
// ③ 唯一的读取方是 dispatch-center 的 verify，而那段判断恒为假，已一并删除
// 留着一个看似能鉴权、实际无人使用也从未生效的端点，只会误导后来的人。
if (!isDev) {
  initFileServer(app)
}
initWs(app)

const runServer = function () {
  const { electermPort, electermHost } = process.env
  const server = app.listen(electermPort, electermHost, () => {
    log.info('服务端', '运行于', electermHost, electermPort)
    process.send({ serverInited: true })
  })
  server.on('error', (err) => {
    log.error('服务端', '启动失败', err.message)
    process.exit(1)
  })
}

// start
runServer()

process.on('uncaughtException', (err) => {
  log.error('未捕获异常', err)
})
process.on('unhandledRejection', (err) => {
  log.error('未处理的 Promise 拒绝', err)
})

process.on('SIGTERM', () => {
  log.info('服务端', '收到 SIGTERM，正在关闭')
  process.exit(0)
})
