/**
 * XNOW 科技风主题配置
 */

function parsor (themeTxt) {
  return themeTxt.split('\n').reduce((prev, line) => {
    let [key = '', value = ''] = line.split('=')
    key = key.trim()
    value = value.trim()
    if (!key || !value) {
      return prev
    }
    prev[key] = value
    return prev
  }, {})
}

// XNOW 科技风 UI 主题（霓虹蓝/青色）
const xnowUiTheme = () => {
  return parsor(`
main=#0a0e1a
main-dark=#050810
main-light=#1a1f35
text=#e0f7ff
text-light=#ffffff
text-dark=#7a8fa8
text-disabled=#4a5a6f
primary=#00f5ff
info=#00d4ff
success=#00ff9f
error=#ff2e63
warn=#ffaa00
  `)
}

// XNOW 科技风终端主题
const xnowTerminalTheme = () => {
  return {
    foreground: '#e0f7ff',
    background: '#0a0e1a',
    cursor: '#00f5ff',
    cursorAccent: '#0a0e1a',
    selectionBackground: 'rgba(0, 245, 255, 0.3)',
    black: '#1a1f35',
    red: '#ff2e63',
    green: '#00ff9f',
    yellow: '#ffaa00',
    blue: '#0080ff',
    magenta: '#7b2ff7',
    cyan: '#00f5ff',
    white: '#e0f7ff',
    brightBlack: '#4a5a6f',
    brightRed: '#ff5582',
    brightGreen: '#33ffb8',
    brightYellow: '#ffcc33',
    brightBlue: '#3399ff',
    brightMagenta: '#a35fff',
    brightCyan: '#33f8ff',
    brightWhite: '#ffffff'
  }
}

export function xnowTheme () {
  return {
    id: 'xnow',
    name: 'XNOW 科技风',
    themeConfig: xnowTerminalTheme(),
    uiThemeConfig: xnowUiTheme()
  }
}
