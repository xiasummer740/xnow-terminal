/**
 * Common utilities for config initValues
 */
import { newBookmarkIdPrefix, authTypeMap } from '../../../common/constants.js'
import { defaultColors } from '../../../common/rand-hex-color.js'
import findBookmarkGroupId from '../../../common/find-bookmark-group-id.js'
import deepCopy from 'json-deep-copy'

/**
 * Creates base init values that are common across all session types
 * @param {Object} props - Props containing formData, bookmarkGroups, currentBookmarkGroupId, store
 * @param {string} sessionType - The session type constant
 * @param {Object} defaults - Session-specific default values
 * @returns {Object} Combined init values
 */
export function createBaseInitValues (props, sessionType, defaults = {}) {
  const { formData = {}, bookmarkGroups = [], currentBookmarkGroupId } = props
  const id = formData.id || ''

  // Determine bookmark group ID
  const initBookmarkGroupId = !id.startsWith(newBookmarkIdPrefix)
    ? findBookmarkGroupId(bookmarkGroups, id)
    : currentBookmarkGroupId

  // Start with defaults and formData
  const base = {
    ...defaults,
    ...deepCopy(formData),
    type: sessionType,
    category: initBookmarkGroupId
  }

  // 新建书签时自动分配不重复的彩色
  const isNew = id.startsWith(newBookmarkIdPrefix)
  if (isNew) {
    const usedColors = new Set(
      (window.store?.bookmarks || []).map(b => b.color).filter(Boolean)
    )
    const availColors = defaultColors.filter(c => !usedColors.has(c))
    base.color = availColors.length > 0 ? availColors[0] : defaultColors[0]
  }

  return base
}

/**
 * Common terminal-related defaults
 */
export function getTerminalDefaults (store) {
  return {
    term: store?.config?.terminalType,
    displayRaw: false,
    encode: 'utf-8'
  }
}

/**
 * Common SSH-related defaults
 */
export function getSshDefaults () {
  return {
    enableSsh: true,
    runScripts: [{
      delay: 500,
      script: ''
    }]
  }
}

/**
 * Common terminal background defaults
 */
export function getTerminalBackgroundDefaults (defaultSetting) {
  return {
    terminalBackground: {
      terminalBackgroundImagePath: defaultSetting.terminalBackgroundImagePath,
      terminalBackgroundFilterOpacity: defaultSetting.terminalBackgroundFilterOpacity,
      terminalBackgroundFilterBlur: defaultSetting.terminalBackgroundFilterBlur,
      terminalBackgroundFilterBrightness: defaultSetting.terminalBackgroundFilterBrightness,
      terminalBackgroundFilterGrayscale: defaultSetting.terminalBackgroundFilterGrayscale,
      terminalBackgroundFilterContrast: defaultSetting.terminalBackgroundFilterContrast,
      terminalBackgroundText: defaultSetting.terminalBackgroundText,
      terminalBackgroundTextSize: defaultSetting.terminalBackgroundTextSize,
      terminalBackgroundTextColor: defaultSetting.terminalBackgroundTextColor,
      terminalBackgroundTextFontFamily: defaultSetting.terminalBackgroundTextFontFamily
    }
  }
}

export function getAuthTypeDefault (props) {
  const r = {}
  if (window.store.defaultProfileId) {
    r.profile = window.store.defaultProfileId
    r.authType = authTypeMap.profiles
  }
  return r
}
