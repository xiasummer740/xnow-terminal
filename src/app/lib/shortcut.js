/**
 * shortcut controll
 */

const log = require('../common/log')

let shortcut

/**
 * init hotkey
 * @param {object} globalShortcut
 * @param {object} win
 * @param {object} config
 */
exports.initShortCut = (globalShortcut, win, config) => {
  shortcut = config.hotkey || ''
  if (shortcut) {
    globalShortcut.register(shortcut, () => {
      if (win.isFocused()) {
        win.minimize()
      } else {
        win.restore()
      }
    })
    const ok = globalShortcut.isRegistered(shortcut)
    if (!ok) {
      log.warn('快捷键注册失败。')
    }
  }
}

exports.changeHotkeyReg = (globalShortcut, win) => {
  return newHotkey => {
    if (shortcut) {
      globalShortcut.unregister(shortcut)
    }
    if (newHotkey) {
      globalShortcut.register(newHotkey, () => {
        win.show()
      })
      const ok = globalShortcut.isRegistered(newHotkey)
      if (ok) {
        shortcut = newHotkey
      }
      return ok
    } else {
      shortcut = ''
      return true
    }
  }
}
