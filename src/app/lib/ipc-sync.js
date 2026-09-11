/**
 * ipc main
 */

const {
  shell,
  clipboard
} = require('electron')
const log = require('../common/log')
const constants = require('../common/runtime-constants')
const windowMove = require('./window-drag-move.js')
const globalState = require('./glob-state')
const { transferKeys } = require('../server/transfer')
const fsFunctions = require('../common/fs-functions')
const os = require('os')
const {
  isTest
} = require('../common/app-props')
const {
  getScreenSize
} = require('./window-control')
const _ = require('./lodash.js')
const { getStorageKey } = require('./storage-key')
const logger = require('./logger')
const { safeOpenExternal } = require('./safe-open-external')

const isMaximized = () => {
  const {
    width: widthMax,
    height: heightMax,
    x: sx,
    y: sy
  } = getScreenSize()
  const win = globalState.get('win')
  const { width, height, x, y } = win.getBounds()
  return widthMax === width &&
    heightMax === height &&
    x === sx &&
    y === sy
}

module.exports = {
  getStorageKey,
  nodePtyCheck: () => {
    try {
      return !!require('node-pty')
    } catch (err) {
      log.error('加载 node-pty 失败：', err)
      return false
    }
  },
  windowMove,
  readClipboard: () => {
    return clipboard.readText()
  },
  writeClipboard: str => {
    clipboard.writeText(str)
  },
  resolve: (...args) => require('path').resolve(...args),
  join: (...args) => require('path').join(...args),
  basename: (...args) => require('path').basename(...args),
  showItemInFolder: (href) => {
    shell.showItemInFolder(href)
  },
  openExternal: (url) => {
    safeOpenExternal(url)
  },
  getArgs: () => {
    return globalState.get('rawArgs')
  },
  shouldAuth: () => globalState.get('requireAuth'),
  getLoadTime: () => {
    return globalState.get('loadTime')
      ? { loadTime: globalState.get('loadTime') }
      : { initTime: globalState.get('initTime') }
  },
  setLoadTime: (loadTime) => {
    globalState.set('loadTime', loadTime)
  },
  getInitTime: () => {
    return globalState.get('initTime')
  },
  isMaximized,
  // 同步 resizeWindow：先扩展窗口再更新 UI，避免终端宽度计算错误
  resizeWindowSync: ({ width, height }) => {
    const win = globalState.get('win')
    if (win && !win.isMaximized()) {
      win.setBounds({ width, height })
      logger.timeline('窗口resize', `width=${width} height=${height}`)
    }
  },
  isSecondInstance: () => {
    return isTest ? false : globalState.get('isSecondInstance')
  },
  osInfo: () => {
    return Object.keys(os).map((k, i) => {
      const vf = os[k]
      if (!_.isFunction(vf)) {
        return null
      }
      let v
      try {
        v = vf()
      } catch (e) {
        return null
      }
      if (!v) {
        return null
      }
      v = JSON.stringify(v, null, 2)
      return { k, v }
    }).filter(d => d)
  },
  getConstants: () => {
    return {
      sep: require('path').sep,
      ...constants,
      versions: JSON.stringify(process.versions),
      transferKeys,
      fsFunctions
    }
  }
}
