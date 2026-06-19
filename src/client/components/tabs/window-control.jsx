/**
 * btns
 */

import { CloseOutlined, MinusOutlined, BorderOutlined, SwitcherOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
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
      <Tooltip title={e('minimize')} placement='bottom'>
        <div className='window-control-box window-control-minimize' onClick={minimize}>
          <MinusOutlined className='iblock font14 widnow-control-icon' />
        </div>
      </Tooltip>
      <Tooltip title={maximized ? e('unmaximize') : e('maximize')} placement='bottom'>
        <div
          className='window-control-box window-control-maximize'
          onClick={maximized ? unmaximize : maximize}
        >
          {maximized
            ? <SwitcherOutlined className='iblock font14 widnow-control-icon icon-maximize is-max' />
            : <BorderOutlined className='iblock font14 widnow-control-icon icon-maximize' />}
        </div>
      </Tooltip>
      <Tooltip title={e('close')} placement='bottom'>
        <div className='window-control-box window-control-close' onClick={closeApp}>
          <CloseOutlined className='iblock font14 widnow-control-icon' />
        </div>
      </Tooltip>
    </div>
  )
}
