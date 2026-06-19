import { createRoot } from 'react-dom/client'
import 'antd/dist/reset.css'
import '@fontsource/maple-mono/index.css'
import Main from '../components/main/index.jsx'

// 渲染进程全局异常捕获（自动设 window.onerror + unhandledrejection）
import '../common/client-logger.js'

// 全局字体回退：中英文混排时使用优雅的 Fallback
const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after {
    font-family: 'Maple Mono', 'Microsoft YaHei', 'PingFang SC',
                 'Noto Sans SC', -apple-system, sans-serif !important;
  }
  .terminal, .xterm, .xterm-rows, .xterm-rows * {
    font-family: 'Maple Mono', 'Courier New', 'Noto Sans SC', monospace !important;
  }
  ::selection {
    background: rgba(24, 144, 255, 0.3) !important;
    color: #fff !important;
  }
  ::-moz-selection {
    background: rgba(24, 144, 255, 0.3) !important;
    color: #fff !important;
  }
`
document.head.appendChild(style)

const rootElement = createRoot(document.getElementById('container'))
rootElement.render(
  <Main />
)
