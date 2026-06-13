/**
 * 全息部署弹窗 — 终端风格日志展示
 *
 * 特性：
 * - user-select: none，只读
 * - 等宽发光绿字，实时日志滚动
 * - 完成后 3s 倒计时自动关闭
 */
import { useState, useEffect, useRef } from 'react'
import { Modal, Progress } from 'antd'

const ICONS = {
  pending: '○',
  running: '▶',
  success: '✅',
  error: '❌',
}

export default function DeployModal({
  open,
  onClose,
  onCancel,
  title = '🚀 XNOW 部署引擎',
  steps = [],
  closable = true,
}) {
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [steps])

  const total = steps.length
  const done = steps.filter((s) => s.status === 'success' || s.status === 'error').length
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = steps.every((s) => s.status === 'success' || s.status === 'error')
  const allSuccess = steps.every((s) => s.status === 'success')

  useEffect(() => {
    if (!allDone || !allSuccess) return
    const timer = setTimeout(() => {
      onClose?.()
    }, 3000)
    return () => clearTimeout(timer)
  }, [allDone, allSuccess, onClose])

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={700}
      closable={!allDone && closable}
      maskClosable={false}
      destroyOnClose
      style={{ userSelect: 'none' }}
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.75)' },
        content: {
          background: 'rgba(8, 10, 8, 0.93)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(0, 255, 65, 0.12)',
          borderRadius: 10,
          boxShadow: '0 0 30px rgba(0, 255, 65, 0.05)',
        },
        header: {
          background: 'transparent',
          borderBottom: '1px solid rgba(0, 255, 65, 0.08)',
        },
      }}
      modalRender={(node) => (
        <div style={{ fontFamily: "'Maple Mono', 'Courier New', Consolas, monospace" }}>{node}</div>
      )}
    >
      <div style={{ color: '#00ff41', fontSize: 13, lineHeight: 1.7 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 16,
            color: '#00ff41',
            letterSpacing: 1,
          }}
        >
          {title}
        </div>
        <div
          ref={logRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            marginBottom: 14,
            padding: '6px 0',
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                marginBottom: 5,
                opacity: step.status === 'pending' ? 0.35 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              <span style={{ marginRight: 10, fontSize: 14 }}>
                {ICONS[step.status] || ICONS.pending}
              </span>
              <span
                style={{
                  color:
                    step.status === 'error'
                      ? '#ff4d4f'
                      : step.status === 'success'
                        ? '#52c41a'
                        : step.status === 'running'
                          ? '#00ff41'
                          : '#666',
                }}
              >
                {step.message}
              </span>
              {step.status === 'running' && (
                <span style={{ marginLeft: 6, animation: 'none' }}>...</span>
              )}
            </div>
          ))}
        </div>
        {!allDone && (
          <Progress
            percent={percent}
            strokeColor="#00ff41"
            trailColor="#1a2a1a"
            showInfo={false}
            style={{ marginBottom: 6 }}
          />
        )}
        {allDone && (
          <div
            style={{
              textAlign: 'center',
              padding: '8px 0 4px',
              color: allSuccess ? '#52c41a' : '#ff4d4f',
              fontSize: 13,
              letterSpacing: 0.5,
            }}
          >
            {allSuccess
              ? `✅ 部署完成！${done}/${total} 步骤全部成功 · 3s 后自动关闭`
              : '❌ 部署未完成，请检查日志后重试'}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * 创建初始步骤状态数组
 * @param {string[]} messages - 步骤消息列表
 * @returns {{message: string, status: string}[]}
 */
export function createSteps(messages) {
  return messages.map((msg) => ({ message: msg, status: 'pending' }))
}

/**
 * 更新指定步骤的状态（不可变）
 * @param {{message: string, status: string}[]} steps
 * @param {number} index
 * @param {'pending'|'running'|'success'|'error'} status
 * @returns {{message: string, status: string}[]}
 */
export function updateStep(steps, index, status) {
  return steps.map((s, i) => (i === index ? { ...s, status } : s))
}
