/**
 * Netdata API 封装 — 直接拉 CPU、内存等指标
 */
async function ndFetch (host, path) {
  const r = await window.pre.runGlobalAsync('httpFetch', `http://${host}:19999${path}`)
  const p = JSON.parse(r)
  if (p.status !== 200) throw new Error(`HTTP ${p.status}`)
  return JSON.parse(p.body)
}

export async function getServerOverview (host) {
  try {
    // CPU: user + system 的和
    const cpu = await ndFetch(host, '/api/v1/data?chart=system.cpu&format=json&points=1&after=-1')
    const cpuData = cpu?.data?.[0]
    const cpuLabels = cpu?.labels || []
    const cpuPct = cpuData ? cpuLabels.reduce((sum, l, i) => {
      if (l === 'user' || l === 'system') return sum + (cpuData[i] || 0)
      return sum
    }, 0) : 0

    // 内存: used / (used + free) * 100
    const mem = await ndFetch(host, '/api/v1/data?chart=system.ram&format=json&points=1&after=-1')
    const memData = mem?.data?.[0]
    const memIdx = mem?.labels?.indexOf('used')
    const freeIdx = mem?.labels?.indexOf('free')
    const memUsed = memIdx >= 0 ? memData?.[memIdx] || 0 : 0
    const memFree = freeIdx >= 0 ? memData?.[freeIdx] || 0 : 0
    const memPct = (memUsed + memFree) > 0 ? (memUsed / (memUsed + memFree) * 100) : 0

    // 磁盘: disk.util 查看
    let diskPct = 0
    try {
      const disk = await ndFetch(host, '/api/v1/data?chart=disk.util&format=json&points=1&after=-1')
      diskPct = disk?.data?.[0]?.[1] || 0
    } catch { diskPct = 0 }

    return {
      online: true,
      cpu: parseFloat(cpuPct.toFixed(1)),
      memPct: parseFloat(memPct.toFixed(0)),
      diskPct: parseFloat(diskPct.toFixed(0))
    }
  } catch (e) {
    return { online: false, error: String(e).substring(0, 80) }
  }
}

export async function getAllServers (hosts) {
  const results = await Promise.allSettled(hosts.map(h =>
    getServerOverview(h).then(d => ({ host: h, ...d }))
  ))
  return results.map((r, i) => r.status === 'fulfilled' ? r.value : { host: hosts[i] || '', online: false })
}
