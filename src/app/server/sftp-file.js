/**
 * sftp read/write file with timeout
 */

const { Readable, Writable } = require('stream')

const STREAM_TIMEOUT = 30000 // 30s

function createReadStreamFromString (str) {
  const s = new Readable()
  s._read = () => {}
  s.push(str)
  s.push(null)
  return s
}

function timedPromise (promise, ms) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`SFTP stream timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
}

class FakeWrite extends Writable {
  constructor (opts) {
    super(opts)
    this.opts = opts
  }

  _write (data, encoding, done) {
    this.opts.onData(data)
    done()
  }
}

function writeRemoteFile (sftp, path, str, mode) {
  return timedPromise(new Promise((resolve, reject) => {
    const writeStream = sftp.createWriteStream(path, {
      highWaterMark: 64 * 1024 * 4 * 4,
      mode
    })
    writeStream.on('close', () => {
      resolve('ok')
    })
    writeStream.on('error', (e) => {
      reject(e)
    })
    createReadStreamFromString(str).pipe(writeStream)
  }), STREAM_TIMEOUT)
}

function readRemoteFile (sftp, path) {
  return timedPromise(new Promise((resolve, reject) => {
    let final = Buffer.alloc(0)
    const writeStream = new FakeWrite({
      onData: data => {
        final = Buffer.concat([final, data])
      }
    })
    writeStream.on('finish', () => {
      resolve(final.toString())
    })
    writeStream.on('error', (e) => {
      reject(e)
    })
    sftp.createReadStream(path, {
      highWaterMark: 64 * 1024 * 4 * 4
    }).pipe(writeStream)
  }), STREAM_TIMEOUT)
}

module.exports = {
  readRemoteFile,
  writeRemoteFile
}
