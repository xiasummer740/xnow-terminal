const log = require('../common/log')
const os = require('os')
const uid = require('../common/uid')
const { customRequire } = require('../lib/custom-require')

const widgetInfo = {
  name: 'Local FTP Server',
  description: 'A local FTP server to share files over FTP protocol.',
  version: '1.0.0',
  author: 'ZHAO Xudong',
  type: 'instance',
  builtin: true,
  configs: [
    {
      name: 'host',
      type: 'string',
      default: '0.0.0.0',
      description: 'The IP address to bind the FTP server to'
    },
    {
      name: 'port',
      type: 'number',
      default: 2121,
      description: 'The port number to listen on'
    },
    {
      name: 'directory',
      type: 'string',
      default: os.homedir(),
      description: 'The directory to serve files from (default: user\'s home directory)'
    },
    {
      name: 'anonymous',
      type: 'boolean',
      default: false,
      description: 'Allow anonymous FTP access'
    },
    {
      name: 'username',
      type: 'string',
      default: 'ftpuser',
      description: 'Username for FTP authentication (used when anonymous is false)'
    },
    {
      name: 'password',
      type: 'string',
      default: 'ftppass',
      description: 'Password for FTP authentication (used when anonymous is false)'
    },
    {
      name: 'autoRun',
      type: 'boolean',
      default: false,
      description: 'Automatically start this FTP server when the app launches'
    }
  ]
}

function getDefaultConfig () {
  return widgetInfo.configs.reduce((acc, config) => {
    acc[config.name] = config.default
    return acc
  }, {})
}

function widgetRun (instanceConfig) {
  const config = { ...getDefaultConfig(), ...instanceConfig }
  const instanceId = uid()
  let server = null
  let FtpSrv = null

  const start = async () => {
    if (server) {
      throw new Error('Server is already running')
    }

    FtpSrv = await customRequire('@electerm/ftp-srv', {
      isCustomModule: true,
      downloadModule: true
    })

    server = new FtpSrv({
      url: `ftp://${config.host}:${config.port}`,
      anonymous: config.anonymous,
      root: config.directory
    })

    if (!config.anonymous) {
      server.on('login', ({ username, password }, resolve, reject) => {
        if (username === config.username && password === config.password) {
          return resolve({ root: config.directory })
        }
        return reject(new Error('Invalid username or password'))
      })
    }

    server.on('client-error', ({ connection, context, error }) => {
      log.info('FTP 客户端错误：', error)
    })

    return new Promise((resolve, reject) => {
      server.listen()
        .then(() => {
          const url = config.anonymous
            ? `ftp://${config.host}:${config.port}`
            : `ftp://${config.username}:${config.password}@${config.host}:${config.port}`
          const serverInfo = {
            url,
            path: config.directory
          }
          const msg = `${widgetInfo.name} 正在运行：${serverInfo.url}`
          log.info(msg)
          log.info(`文件服务目录：${serverInfo.path}`)
          if (!config.anonymous) {
            log.info(`登录凭证：${config.username} / ${config.password}`)
          } else {
            log.info('已启用匿名访问')
          }
          resolve({ serverInfo, msg, success: true })
        })
        .catch(reject)
    })
  }

  const stop = () => {
    return new Promise((resolve, reject) => {
      if (server) {
        server.close()
          .then(() => {
            log.info(`${widgetInfo.name} 已停止`)
            server = null
            resolve()
          })
          .catch((err) => {
            log.error('停止 FTP 服务器出错：', err)
            reject(err)
          })
      } else {
        log.info(`${widgetInfo.name} 未在运行`)
        resolve()
      }
    })
  }

  return {
    instanceId,
    start,
    stop
  }
}

module.exports = {
  widgetInfo,
  widgetRun
}
