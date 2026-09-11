import ReactMarkdown from 'react-markdown'
import { copy } from '../../common/clipboard'
import Link from '../common/external-link'
import { Tag } from 'antd'
import { CopyOutlined, PlayCircleOutlined } from '@ant-design/icons'
import getBrand from './get-brand'

const e = window.translate

export default function AIOutput ({ item }) {
  const {
    response,
    baseURLAI
  } = item
  if (!response) {
    return null
  }

  const { brand, brandUrl } = getBrand(baseURLAI)

  const renderCode = (props) => {
    const { node, className = '', children, ...rest } = props
    const code = String(children).replace(/\n$/, '')
    const inline = !className.includes('language-')
    if (inline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    }

    const copyToClipboard = () => {
      copy(code)
    }

    const runInTerminal = () => {
      // Filter out comments from the code before running
      const filteredCode = code
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          // Remove empty lines and comments
          if (!line) {
            return false
          }
          if (line.startsWith('#')) {
            return false
          }
          return true
        })
        .join('\n') // Join multiple commands with &&

      if (filteredCode) {
        window.store.runCommandInTerminal(filteredCode)
      }
    }

    return (
      <div className='code-block'>
        <div className='code-block-actions alignright'>
          <CopyOutlined
            className='code-action-icon pointer iblock'
            onClick={copyToClipboard}
            title={e('copy')}
          />
          <PlayCircleOutlined
            className='code-action-icon pointer mg1l iblock'
            onClick={runInTerminal}
          />
        </div>
        <pre>
          <code className={className} {...rest}>
            {children}
          </code>
        </pre>
      </div>
    )
  }

  function renderBrand () {
    if (!brand) {
      return null
    }
    return (
      <div className='pd1y'>
        <Link to={brandUrl}>
          <Tag>{brand}</Tag>
        </Link>
      </div>
    )
  }

  // AI 输出里的链接必须走 ExternalLink（= 系统浏览器），不能用 ReactMarkdown 的
  // 默认渲染。默认渲染是裸 <a href>，在主窗口里一点就把整个窗口导航到对方站点，
  // preload 随之重新注入 → 那个页面的 JS 能通过 IPC 桥读写本机文件（ISSUES #1）。
  const renderLink = ({ node, href, children, ...rest }) => {
    return (
      <Link to={href} {...rest}>{children}</Link>
    )
  }

  const mdProps = {
    children: response,
    components: {
      code: renderCode,
      a: renderLink
    }
  }

  return (
    <div className='pd1'>
      {renderBrand()}
      <ReactMarkdown {...mdProps} />
    </div>
  )
}
