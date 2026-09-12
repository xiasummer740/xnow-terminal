/**
 * 解析 WS 文本帧，畸形 JSON 只丢这一条，**不让进程退出**（ISSUES #42）
 *
 * 原来 sftp / transfer / 升级 三条 WS 路径都是裸的 `JSON.parse(message)`。
 * 这个 throw 发生在 `ws.on('message')` 回调里 —— 没有外层 catch，直接变成
 * `uncaughtException`，而会话进程的处理器是
 * `cleanup()` + `process.exit(0)`：**一条脏消息就能打死整个进程**，
 * 而这个进程里挂着同一个会话的**全部终端**（用户看到所有标签页一起断）。
 *
 * 触发门槛也不高：客户端版本不一致、消息被截断、甚至是网络上的一帧乱码都够。
 * 所以这里的选择很明确 —— **丢消息，不断连接**。
 *
 * @returns {object|null} 解析成功返回对象；畸形则记一条日志并返回 null
 */
const log = require('../common/log')

function parseWsMessage (message) {
  try {
    return JSON.parse(message)
  } catch (e) {
    // 只记长度不记内容：内容可能含用户输入/凭据，且畸形串往往很长
    const size = message && message.length !== undefined ? message.length : -1
    log.error('WS 消息不是合法 JSON，已丢弃（长度 ' + size + '）：', e.message)
    return null
  }
}

module.exports = { parseWsMessage }
