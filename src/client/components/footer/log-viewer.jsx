/**
 * 日志查看器（仅开发版）
 * 点击 Footer 日志按钮弹出，显示系统临时目录下的 xnow-debug.log
 */
import { useState, useEffect, useCallback } from 'react'
import { Modal, Button } from 'antd'
import { FileTextOutlined, ReloadOutlined } from '@ant-design/icons'

const LOG_LINES_MAX = 500

export default function LogViewer () {
  const [visible, setVisible] = useState(false)
  const [logContent, setLogContent] = useState('')
  const [loading, setLoading] = useState(false)

  const loadLog = useCallback(async () => {
    setLoading(true)
    try {
      if (window.pre && window.pre.runGlobalAsync) {
        const content = await window.pre.runGlobalAsync('readLog')
        const lines = content.split('\n')
        const tail = lines.slice(-LOG_LINES_MAX).join('\n')
        setLogContent(tail || '(日志文件为空)')
      } else {
        setLogContent('(无法读取日志：pre API 不可用)')
      }
    } catch (e) {
      setLogContent('(读取日志失败: ' + (e.message || String(e)) + ')')
    }
    setLoading(false)
  }, [])

  const handleOpen = useCallback(() => {
    setVisible(true)
    loadLog()
  }, [loadLog])

  const handleClose = useCallback(() => {
    setVisible(false)
  }, [])

  // 只在开发版显示按钮
  const isDev = window.et && window.et.isDev
  if (!isDev) return null

  return (
    <>
      <div className='terminal-footer-unit'>
        <FileTextOutlined
          onClick={handleOpen}
          className='pointer font14'
          title='查看日志'
        />
      </div>
      <Modal
        title={
          <span>
            <FileTextOutlined className='mr8' />
            运行日志
          </span>
        }
        open={visible}
        onCancel={handleClose}
        footer={null}
        width={800}
        style={{ top: 40 }}
      >
        <div style={{ marginBottom: 8, textAlign: 'right' }}>
          <Button
            size='small'
            icon={<ReloadOutlined />}
            onClick={loadLog}
            loading={loading}
          >
            刷新
          </Button>
        </div>
        <pre
          style={{
            background: '#1a1a2e',
            color: '#e0e0e0',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            maxHeight: 500,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
            fontFamily: "'Maple Mono', 'Consolas', monospace"
          }}
        >
          {loading ? '加载中...' : logContent}
        </pre>
      </Modal>
    </>
  )
}
