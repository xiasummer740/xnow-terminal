/**
 * btns
 */

import { CloseOutlined, MinusOutlined, BorderOutlined, SwitcherOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import {
  isMacJs
} from '../../common/constants'

const e = window.translate

export default function WindowControl (props) {
  const { config } = props.store
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const { ipcOnEvent } = window.pre
    setMaximized(!!window.store.isMaximized)
    ipcOnEvent('window-state-change', (e, { isMaximized }) => {
      setMaximized(isMaximized)
    })
  }, [])

  if (config.useSystemTitleBar || isMacJs) {
    return null
  }
  const minimize = () => {
    window.pre.runGlobalAsync('minimize')
  }
  const maximize = () => {
    window.pre.runGlobalAsync('maximize')
    setMaximized(true)
  }
  const unmaximize = () => {
    window.pre.runGlobalAsync('unmaximize')
    setMaximized(false)
  }
  const closeApp = () => {
    window.store.exit()
  }
  return (
    <div className='window-controls'>
      <div className='window-control-box window-control-minimize' onClick={minimize}>
        <MinusOutlined title={e('minimize')} className='iblock font14 widnow-control-icon' />
      </div>
      <div
        className='window-control-box window-control-maximize'
        onClick={maximized ? unmaximize : maximize}
      >
        {maximized
          ? <SwitcherOutlined title={e('unmaximize')} className='iblock font14 widnow-control-icon icon-maximize is-max' />
          : <BorderOutlined title={e('maximize')} className='iblock font14 widnow-control-icon icon-maximize' />
        }
      </div>
      <div className='window-control-box window-control-close' onClick={closeApp}>
        <CloseOutlined title={e('close')} className='iblock font14 widnow-control-icon' />
      </div>
    </div>
  )
}