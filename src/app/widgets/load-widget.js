// load-widget.js

const fs = require('fs')
const path = require('path')
const log = require('../common/log')

// Store running widget instances
const runningInstances = new Map()
const widgetIdPattern = /^[a-z0-9-]+$/

function resolveWidgetPath (widgetId, widgetDirectory = __dirname) {
  if (typeof widgetId !== 'string' || !widgetIdPattern.test(widgetId)) {
    throw new Error(`Invalid widget ID: ${widgetId}`)
  }

  const widgetPath = path.resolve(widgetDirectory, `widget-${widgetId}.js`)
  const relativePath = path.relative(widgetDirectory, widgetPath)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid widget ID: ${widgetId}`)
  }

  return widgetPath
}

function listWidgetsFromFolder (widgetDirectory = __dirname) {
  const widgetFiles = fs.readdirSync(widgetDirectory).filter(file => file.startsWith('widget-') && file.endsWith('.js'))
  const res = []
  for (const file of widgetFiles) {
    try {
      const widgetModule = require(path.join(widgetDirectory, file))
      res.push({
        id: file.slice(7, -3),
        info: widgetModule.widgetInfo
      })
    } catch (error) {
      log.error(`从文件 ${file} 加载小组件出错：`, error)
      continue
    }
  }
  return res
}

function listWidgets () {
  const widgets1 = listWidgetsFromFolder()
  return widgets1
  // if (process.versions.electron === undefined) {
  //   return widgets1
  // }
  // const {
  //   appPath
  // } = require('../common/app-props')
  // const userWidgetsDir = path.resolve(
  //   appPath, 'widgets'
  // )
  // // Ensure user widgets directory exists when app starts
  // try {
  //   if (!fs.existsSync(userWidgetsDir)) {
  //     fs.mkdirSync(userWidgetsDir, { recursive: true })
  //   }
  // } catch (err) {
  //   log.error(`Failed to create user widgets directory ${userWidgetsDir}:`, err)
  // }
  // const widgets2 = listWidgetsFromFolder(
  //   userWidgetsDir
  // )
  // return [
  //   ...widgets1,
  //   ...widgets2
  // ]
}

function hasRunningInstance (widgetId) {
  for (const [, instance] of runningInstances) {
    if (instance.widgetId === widgetId) {
      return true
    }
  }
  return false
}

function runWidget (widgetId, config) {
  const widget = require(resolveWidgetPath(widgetId))

  const { type, singleInstance } = widget.widgetInfo
  if (type !== 'instance') {
    return widget.widgetRun(config)
  }

  // Check if singleInstance widget already has a running instance
  if (singleInstance && hasRunningInstance(widgetId)) {
    return Promise.reject(new Error(`Widget ${widgetId} already has a running instance. Only one instance is allowed.`))
  }

  const instance = widget.widgetRun(config)
  instance.widgetId = widgetId
  runningInstances.set(instance.instanceId, instance)

  return instance.start()
    .then((result) => {
      return {
        instanceId: instance.instanceId,
        widgetId,
        singleInstance: !!singleInstance,
        ...result
      }
    })
    .catch((err) => {
      runningInstances.delete(instance.instanceId)
      return instance.stop().catch(() => {}).then(() => { throw err })
    })
}

function stopWidget (instanceId) {
  const instance = runningInstances.get(instanceId)
  if (!instance) {
    log.error(`未找到 instanceId 对应的运行中实例：${instanceId}`)
    return
  }

  return instance.stop()
    .then(() => {
      runningInstances.delete(instanceId)
      return { instanceId, status: 'stopped' }
    })
}

async function runWidgetFunc (instanceId, funcName, ...args) {
  const instance = runningInstances.get(instanceId)
  if (!instance) {
    throw new Error(`No running instance found for instanceId: ${instanceId}`)
  }

  if (typeof instance[funcName] !== 'function') {
    throw new Error(`Function ${funcName} not found in widget instance`)
  }

  try {
    const result = await instance[funcName](...args)
    return result
  } catch (error) {
    log.error(`在小组件实例 ${instanceId} 上执行 ${funcName} 出错：`, error)
    throw error
  }
}

async function cleanup () {
  if (runningInstances.size === 0) {
    return
  }

  const stopPromises = []

  for (const [instanceId, instance] of runningInstances) {
    log.info(`正在停止小组件实例：${instanceId}`)
    try {
      const stopPromise = instance.stop()
        .then(() => {
          log.info(`已成功停止小组件实例：${instanceId}`)
        })
        .catch(err => {
          log.error(`停止小组件实例 ${instanceId} 出错：`, err)
        })
      stopPromises.push(stopPromise)
    } catch (err) {
      log.error(`发起停止小组件实例 ${instanceId} 的操作出错：`, err)
    }
  }

  try {
    await Promise.allSettled(stopPromises)
    runningInstances.clear()
    log.info('所有小组件实例均已停止')
  } catch (err) {
    log.error('清理时出错：', err)
  }
}

// Register cleanup handlers only for process exit signals
function registerCleanupHandlers () {
  process.on('SIGTERM', async () => {
    log.info('收到 SIGTERM，正在清理小组件...')
    await cleanup()
  })
}

// Initialize cleanup handlers
registerCleanupHandlers()

module.exports = {
  listWidgets,
  runWidget,
  stopWidget,
  runWidgetFunc
}
