import { osResolve } from './resolve'

export default function () {
  return window.et.sessionLogPath || osResolve(window.store.appPath, 'xnow-terminal', 'session_logs')
}
