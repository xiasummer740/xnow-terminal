/**
 * app entry
 */
const log = require('./common/log')
const { createApp } = require('./lib/create-app')
const globalState = require('./lib/glob-state')

globalState.set('initTime', Date.now())

log.debug('electron 启动')

const app = createApp()
globalState.set('app', app)
