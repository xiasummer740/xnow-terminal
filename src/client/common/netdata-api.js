/**
 * Netdata API 封装
 */
export async function getServerOverview (host) {
  try {
    const result = await window.pre.runGlobalAsync('httpFetch', `http://${host}:19999/api/v1/info`)
    const parsed = JSON.parse(result)
    if (parsed.status !== 200) return { online: false, error: `HTTP ${parsed.status}` }
    return { online: true, cpu: 0, memory: '--', disk: '--' }
  } catch (e) {
    return { online: false, error: String(e).substring(0, 100) }
  }
}

export async function getAllServers (hosts) {
  const results = await Promise.allSettled(hosts.map(h =>
    getServerOverview(h).then(d => ({ host: h, ...d }))
  ))
  return results.map(r => r.status === 'fulfilled' ? r.value : { host: '', online: false, error: 'promise' })
}
