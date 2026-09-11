import { ColorPicker } from '../bookmark-form/common/color-picker'

// 色位名（main / terminal:red 之类）是主题配置里的 key，这里只翻显示，取值仍用原 key
const e = window.translate

export default function ThemeEditSlot (props) {
  const {
    name,
    value,
    disabled
  } = props
  function onChange (v) {
    props.onChange(v, name)
  }
  const pickerProps = {
    value,
    onChange,
    isRgba: value.startsWith('rgba'),
    disabled
  }
  return (
    <div className='theme-edit-slot'>
      <span className='iblock mg1r'>{e(name)}</span>
      <span className='iblock'>
        <ColorPicker
          {...pickerProps}
        />
      </span>
    </div>
  )
}
