/**
 * Netdata API 封装
 * 每个服务器独立运行 Netdata，通过后端转发请求绕过 CORS
 */
const BASE_KEYS = ['system.cpu', 'system.ram', 'system.disk', 'system.net']

/**
 * 通过后端获取某台服务器的 Netdata 指标
 */
async function fetchNetdata (host, apiPath) {
  const result = await window.pre.runGlobalAsync('httpFetch', `http://${host}:19999${apiPath}`)
  const parsed = JSON.parse(result)
  if (parsed.status !== 200) throw new Error(`HTTP ${parsed.status}`)
  return JSON.parse(parsed.body)
}

/**
 * 获取单台服务器的概要指标
 */
export async function getServerOverview (host) {
  try {
    const data = await fetchNetdata(host, '/api/v1/allmetrics?format=json')
    const cpu = data?.['system.cpu']?.data?.[0]?.[1]
    const ramTotal = data?.['system.ram']?.dimensions?.total ? 1 : 0
    const ramUsed = data?.['system.ram']?.data?.[0]?.[1]
    const disk = data?.['system.disk']?.data?.[0]?.[1]
    const netIn = data?.['system.net']?.data?.[0]?.[1]
    const netOut = data?.['system.net']?.data?.[0]?.[2]

    // 计算内存百分比
    const memPct = ramTotal > 0 ? ((ramUsed || 0) / ramTotal * 100) : 0

    return {
      online: true,
      cpu: cpu != null ? parseFloat(cpu.toFixed(1)) : 0,
      memory: memPct > 0 ? memPct.toFixed(0) + '%' : '--',
      disk: disk != null ? disk.toFixed(0) + '%' : '--',
      netIn: netIn || 0,
      netOut: netOut || 0
    }
  } catch {
    return { online: false }
  }
}

/**
 * 批量获取所有服务器的状态
 */
export async function getAllServers (hosts) {
  const results = await Promise.allSettled(
    hosts.map(h => getServerOverview(h).then(data => ({ host: h, ...data })))
  )
  return results.map(r => r.status === 'fulfilled' ? r.value : { host: '', online: false })
}

/**
 * 获取 CPU 历史
 */
export async function getCpuHistory (host) {
  try {
    const now = Date.now() / 1000
    const before = now - 3600
    const data = await fetchNetdata(host, `/api/v1/data?chart=system.cpu&format=json&points=60&after=${before}&before=${now}`)
    return (data?.data || []).map((row, i) => ({
      value: row[1] || 0,
      time: data?.labels?.[i] || ''
    }))
  } catch {
    return []
  }
}
