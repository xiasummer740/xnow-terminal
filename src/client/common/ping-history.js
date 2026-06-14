/**
 * Ping 历史记录 — localStorage 轻量存储
 * 每次 ping 入队，每 30s 批量写入一次
 * 最多保留 5000 条（约 150KB），3 天数据
 */

const LOSS_TIMEOUT = 3000
const SAVE_INTERVAL = 30000

function getKey (host) {
  return 'ph_' + host.replace(/[^a-zA-Z0-9.-]/g, '_')
}

function loadAll (host) {
  try {
    const raw = localStorage.getItem(getKey(host))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveAll (host, data) {
  try {
    if (data.length > 5000) data.splice(0, data.length - 5000)
    localStorage.setItem(getKey(host), JSON.stringify(data))
  } catch {
    if (data.length > 100) { data.splice(0, Math.floor(data.length / 2)); saveAll(host, data) }
  }
}

const queues = {}
export function addPing (host, latency) {
  const now = Date.now()
  if (!queues[host]) queues[host] = []
  queues[host].push({ t: now, v: latency })

  const last = queues[host]._lastWrite || 0
  if (now - last < SAVE_INTERVAL) return
  queues[host]._lastWrite = now

  const data = loadAll(host)
  data.push(...(queues[host] || []))
  queues[host] = []
  const cutoff = now - 259200000
  saveAll(host, data.filter(p => p.t >= cutoff))
}

export function loadHistory (host) {
  const all = loadAll(host)
  const cutoff = Date.now() - 259200000
  return all.filter(p => p.t >= cutoff)
}

export function getAggregatedHistory (host, range, smooth = true) {
  const all = loadHistory(host)
  if (!all.length) return { points: [], lossRate: 0, total: 0, lost: 0 }

  const now = Date.now()
  const rangeMs = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '3d': 259200000 }
  const filtered = all.filter(p => p.t >= now - (rangeMs[range] || 3600000))
  if (!filtered.length) return { points: [], lossRate: 0, total: 0, lost: 0 }

  const total = filtered.length
  const lost = filtered.filter(p => p.v < 0 || p.v >= LOSS_TIMEOUT).length

  const binSizes = { '1h': 30000, '6h': 120000, '24h': 600000, '3d': 1800000 }
  const binSize = binSizes[range] || 30000
  const bins = {}
  for (const p of filtered) {
    if (p.v < 0 || p.v >= LOSS_TIMEOUT) continue
    const k = Math.floor(p.t / binSize) * binSize
    if (!bins[k]) bins[k] = { sum: 0, count: 0 }
    bins[k].sum += p.v; bins[k].count++
  }

  let points = Object.entries(bins).map(([t, d]) => ({ t: +t, v: Math.round(d.sum / d.count) })).sort((a, b) => a.t - b.t)

  if (smooth && points.length > 10) {
    const w = Math.max(1, Math.floor(points.length / 15))
    points = points.map((p, i) => {
      const s = Math.max(0, i - w), e = Math.min(points.length, i + w + 1)
      const sl = points.slice(s, e)
      return { t: p.t, v: Math.round(sl.reduce((a, b) => a + b.v, 0) / sl.length) }
    })
  }

  return { points, lossRate: total ? Math.round(lost / total * 1000) / 10 : 0, total, lost }
}
