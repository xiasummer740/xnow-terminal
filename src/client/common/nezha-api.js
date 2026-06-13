/**
 * 哪吒监控 Dashboard API 封装
 * 提供 REST API 和 WebSocket 调用
 */

/**
 * 从 store 中读取哪吒监控配置
 */
function getConfig () {
  const config = window.store?.config?.nezha
  if (!config) {
    return { dashboardUrl: '', apiToken: '', masterBookmarkId: '' }
  }
  return config
}

/**
 * 验证 Dashboard 地址和 Token 是否有效
 * @param {string} dashboardUrl - Dashboard 地址
 * @param {string} apiToken - API Token
 * @returns {Promise<{success: boolean, data?: object[], error?: string}>}
 */
export async function testConnection (dashboardUrl, apiToken) {
  try {
    const url = `${dashboardUrl.replace(/\/+$/, '')}/api/v1/server`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `请求失败 (${res.status}${text ? ': ' + text : ''})`
      }
    }
    const data = await res.json()
    return { success: true, data: Array.isArray(data) ? data : [] }
  } catch (err) {
    return {
      success: false,
      error: err.message || '连接失败，请检查地址和网络'
    }
  }
}

/**
 * 获取服务器列表
 * 从 store 读取配置后请求 Dashboard API
 * @returns {Promise<object[]>}
 */
export async function getServerList () {
  const { dashboardUrl, apiToken } = getConfig()
  if (!dashboardUrl || !apiToken) {
    return []
  }
  try {
    const url = `${dashboardUrl.replace(/\/+$/, '')}/api/v1/server`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    })
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 获取指定服务器的指标历史
 * @param {string|number} serverId - 服务器 ID
 * @param {'cpu'|'memory'|'disk'|'gpu'} metric - 指标类型
 * @param {string} [period='1d'] - 时间范围，如 '1d', '7d'
 * @returns {Promise<object[]>}
 */
export async function getServerMetrics (serverId, metric, period = '1d') {
  const { dashboardUrl, apiToken } = getConfig()
  if (!dashboardUrl || !apiToken || !serverId) {
    return []
  }
  try {
    const base = dashboardUrl.replace(/\/+$/, '')
    const url = `${base}/api/v1/server/${serverId}/metrics?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(period)}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    })
    if (!res.ok) {
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 创建 WebSocket 连接接收实时服务器状态
 * 自动将 http:// 转为 ws://，https:// 转为 wss://
 * @returns {WebSocket|null}
 */
export function connectServerWs () {
  const { dashboardUrl, apiToken } = getConfig()
  if (!dashboardUrl || !apiToken) {
    return null
  }
  try {
    const wsBase = dashboardUrl
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:')
    const url = `${wsBase.replace(/\/+$/, '')}/api/v1/ws/server?token=${encodeURIComponent(apiToken)}`
    return new WebSocket(url)
  } catch {
    return null
  }
}
