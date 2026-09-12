/**
 * ui theme
 */

import { useEffect } from 'react'
import { safeCustomCss } from '../../common/sanitize-css'

const themeDomId = 'custom-css'

export default function CustomCss (props) {
  const { customCss, configLoaded } = props

  useEffect(() => {
    if (configLoaded) {
      const style = document.getElementById(themeDomId)
      if (style) {
        style.innerHTML = safeCustomCss(customCss)
      }
    }
  }, [customCss, configLoaded])

  return null
}
