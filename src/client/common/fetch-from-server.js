/**
 * fetch from server
 */

import initWs from './ws'
import generate from './uid'
import { NewPromise } from './promise-timeout'

const id = 's'
window.et.wsOpened = false

export const initWsCommon = async () => {
  if (window.et.wsOpened) {
    return
  }
  const ws = await initWs('common', id, undefined, true)
  if (!ws) {
    return
  }
  window.et.wsOpened = true
  ws.onclose = () => {
    window.et.wsOpened = false
  }
  window.et.commonWs = ws
  window.store.wsInited = true
}

window.pre.ipcOnEvent('power-resume', initWsCommon)

const wsFetch = async (data) => {
  if (!window.et.wsOpened) {
    await initWsCommon()
  }
  const id = generate()
  return new NewPromise((resolve, reject) => {
    window.et.commonWs.once((arg) => {
      if (arg.error) {
        const msg = typeof arg.error === 'string' ? arg.error : arg.error.message
        console.error('fetch error', msg)
        return reject(new Error(msg))
      }
      resolve(arg.data)
    }, id)
    window.et.commonWs.s({
      id,
      ...data
    })
  })
}
window.wsFetch = wsFetch
export default wsFetch
