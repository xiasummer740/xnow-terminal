/**
 * Netdata API 封装
 */
async function ndFetch (host, path) {
  const r = await window.pre.runGlobalAsync('httpFetch', `http://${host}:19999${path}`)
  const p = JSON.parse(r)
  if (p.status !== 200) throw new Error(`HTTP ${p.status}`)
  return JSON.parse(p.body)
}

export async function getServerOverview (host) {
  try {
    // CPU (user+system)
    const cpu = await ndFetch(host, '/api/v1/data?chart=system.cpu&format=json&points=1&after=-1')
    const d = cpu?.data?.[0]
    const lbl = cpu?.labels || []
    const cpuPct = d ? lbl.reduce((s, l, i) => (l === 'user' || l === 'system') ? s + (d[i]||0) : s, 0) : 0

    // 内存 (used/total)
    const mem = await ndFetch(host, '/api/v1/data?chart=system.ram&format=json&points=1&after=-1')
    const md = mem?.data?.[0]
    const ml = mem?.labels || []
    const usedIdx = ml.indexOf('used'); const freeIdx = ml.indexOf('free')
    const used = usedIdx >= 0 ? md?.[usedIdx]||0 : 0
    const free = freeIdx >= 0 ? md?.[freeIdx]||0 : 0
    const memPct = (used+free) > 0 ? (used/(used+free)*100) : 0

    // 磁盘利用率
    let diskPct = 0
    try { const disk = await ndFetch(host, '/api/v1/data?chart=disk.util&format=json&points=1&after=-1')
      diskPct = disk?.data?.[0]?.[1] || 0 } catch {}

    // 网络流量
    let netIn = 0, netOut = 0
    try {
      const net = await ndFetch(host, '/api/v1/data?chart=net.ens3&format=json&points=1&after=-1')
      if (!net?.data?.[0]) { const net2 = await ndFetch(host, '/api/v1/data?chart=net.eth0&format=json&points=1&after=-1')
        netIn = net2?.data?.[0]?.[1] || 0; netOut = net2?.data?.[0]?.[2] || 0 }
      else { netIn = net?.data?.[0]?.[1] || 0; netOut = net?.data?.[0]?.[2] || 0 }
    } catch {}

    return {
      online: true,
      cpu: parseFloat(cpuPct.toFixed(1)),
      memPct: parseFloat(memPct.toFixed(0)),
      diskPct: parseFloat(diskPct.toFixed(0)),
      netIn: (netIn / 1024 / 1024).toFixed(1) + ' MB/s',
      netOut: (netOut / 1024 / 1024).toFixed(1) + ' MB/s'
    }
  } catch (e) {
    return { online: false }
  }
}

export async function getAllServers (hosts) {
  const r = await Promise.allSettled(hosts.map(h =>
    getServerOverview(h).then(d => ({ host: h, ...d }))
  ))
  return r.map((v, i) => v.status === 'fulfilled' ? v.value : { host: hosts[i], online: false })
}
