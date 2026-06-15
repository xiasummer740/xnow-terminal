import React, { useState, useEffect } from 'react'
import { Popover, ColorPicker as AntColorPicker } from 'antd'
import { defaultColors, getRandomHexColor } from '../../../common/rand-hex-color.js'
import { HexInput } from './hex-input.jsx'
import './color-picker.styl'

export function ColorPicker ({ value, onChange, ref, disabled, isRgba }) {
  const [visible, setVisible] = useState(false)
  // 如果 value 是暗色或未定义，替换为默认彩色
  const darkColors = ['#24292e', '#000000', '#333333', '#6a737d', '#586069', '#444']
  const finalValue = (value && !darkColors.includes(value.toLowerCase())) ? value : defaultColors[0]
  // 首次加载时自动修复暗色为彩色
  useEffect(() => {
    if (onChange && finalValue !== value) {
      onChange(finalValue)
    }
  }, [])

  const handleChange = (color) => {
    onChange(color)
    setVisible(false)
  }

  const handleVisibleChange = (vis) => {
    setVisible(vis)
  }

  function onColorChange (color) {
    handleChange(isRgba ? color.toRgbString() : color.toHexString())
  }

  function renderContent () {
    return (
      <div className='color-picker-box'>
        <div className='fix'>
          <div className='fleft color-picker-defaults'>
            {
              [...defaultColors, 'random'].map((color) => {
                const style = color === 'random' ? { color: '#000' } : { color }
                const p = {
                  className: 'color-picker-unit',
                  style,
                  onClick: () => {
                    if (color === 'random') return handleChange(getRandomHexColor())
                    handleChange(color)
                  }
                }
                return <div {...p} key={color}>● {color}</div>
              })
            }
          </div>
          <div className='fright'>
            <AntColorPicker
              value={finalValue}
              onChange={onColorChange}
            />
          </div>
        </div>
        <div className='pd1y'>
          <HexInput value={finalValue} onChange={handleChange} />
        </div>
      </div>
    )
  }

  const inner = (
    <div ref={ref} className='color-picker-choose' style={{ backgroundColor: finalValue }} />
  )

  if (disabled) return inner

  return (
    <Popover
      content={renderContent()}
      trigger='click'
      open={visible}
      placement='bottomLeft'
      onOpenChange={handleVisibleChange}
    >
      {inner}
    </Popover>
  )
}
