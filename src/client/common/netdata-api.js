/**
 * Netdata API 封装
 */
export async function getServerOverview (host) {
  try {
    const url = `http://${host}:19999/api/v1/allmetrics?format=json`
    const result = await window.pre.runGlobalAsync('httpFetch', url)
    const parsed = JSON.parse(result)
    if (parsed.status !== 200) {
      console.warn('[netdata]', host, 'HTTP', parsed.status)
      return { online: false, error: `HTTP ${parsed.status}` }
    }
    const data = JSON.parse(parsed.body)
    const cpu = data?.['system.cpu']?.data?.[0]?.[1]
    return { online: cpu != null, cpu: cpu ?? 0, memory: '--', disk: '--', netIn: 0, netOut: 0 }
  } catch (e) {
    console.warn('[netdata]', host, e.message)
    return { online: false, error: e.message }
  }
}

export async function getAllServers (hosts) {
  const results = await Promise.allSettled(hosts.map(h =>
    getServerOverview(h).then(d => ({ host: h, ...d }))
  ))
  return results.map(r => r.status === 'fulfilled' ? r.value : { host: '', online: false })
}
