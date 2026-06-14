/**
 * Netdata API 封装
 */
async function ndFetch (host, path, timeout = 5000) {
  const r = await window.pre.runGlobalAsync('httpFetch', `http://${host}:19999${path}`, { timeout })
  const p = JSON.parse(r)
  if (p.status !== 200) throw new Error(`HTTP ${p.status}`)
  return JSON.parse(p.body)
}

export async function getServerOverview (host) {
  let cpu = 0, memPct = 0, diskPct = 0, netIn = '--', netOut = '--'
  let anySuccess = false

  // CPU (独立捕获错误)
  try {
    const d = await ndFetch(host, '/api/v1/data?chart=system.cpu&format=json&points=1&after=-1')
    const row = d?.data?.[0]; const lbl = d?.labels || []
    cpu = row ? parseFloat(lbl.reduce((s, l, i) => (l === 'user' || l === 'system') ? s + (row[i]||0) : s, 0).toFixed(1)) : 0
    anySuccess = true
  } catch {}

  // 内存
  try {
    const d = await ndFetch(host, '/api/v1/data?chart=system.ram&format=json&points=1&after=-1')
    const row = d?.data?.[0]; const lbl = d?.labels || []
    const u = lbl.indexOf('used'); const f = lbl.indexOf('free')
    const used = u>=0 ? row?.[u]||0 : 0; const free = f>=0 ? row?.[f]||0 : 0
    memPct = (used+free) > 0 ? parseFloat((used/(used+free)*100).toFixed(0)) : 0
    anySuccess = true
  } catch {}

  // 磁盘
  try {
    const d = await ndFetch(host, '/api/v1/data?chart=disk.util&format=json&points=1&after=-1')
    diskPct = parseFloat((d?.data?.[0]?.[1] || 0).toFixed(0))
    anySuccess = true
  } catch {}

  // 网络（试多个网卡名）
  try {
    for (const iface of ['net.ens3','net.eth0','net.enp0s3','net.enp1s0','net.venet0']) {
      try {
        const d = await ndFetch(host, `/api/v1/data?chart=${iface}&format=json&points=1&after=-1`, 3000)
        if (d?.data?.[0]) {
          netIn = ((d.data[0][1]||0) / 1048576).toFixed(1) + ' MB/s'
          netOut = ((d.data[0][2]||0) / 1048576).toFixed(1) + ' MB/s'
          break
        }
      } catch {}
    }
  } catch {}

  if (!anySuccess) return { online: false }
  return { online: true, cpu, memPct, diskPct, netIn, netOut }
}

export async function getAllServers (hosts) {
  const r = await Promise.allSettled(hosts.map(h =>
    getServerOverview(h).then(d => ({ host: h, ...d }))
  ))
  return r.map((v, i) => v.status === 'fulfilled' ? v.value : { host: hosts[i], online: false })
}
