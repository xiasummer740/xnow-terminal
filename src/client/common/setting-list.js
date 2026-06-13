import {
  settingSyncId,
  settingShortcutsId,
  settingTerminalId,
  settingAiId,
  settingPasswordsId,
  settingNezhaId
} from '../common/constants'

const e = window.translate

export default () => ([
  {
    id: settingTerminalId,
    title: e('terminal')
  },
  {
    id: settingShortcutsId,
    title: e('settingShortcuts')
  },
  {
    id: settingSyncId,
    title: e('settingSync')
  },
  {
    id: settingAiId,
    title: 'AI'
  },
  {
    id: settingPasswordsId,
    title: e('password')
  },
  {
    id: settingNezhaId,
    title: 'XNOW 监控'
  }
])
