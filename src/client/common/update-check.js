/**
 * 检查 XNOW 最新 Release 版本
 */
import fetch from './fetch-from-server'
import { packInfo } from './constants'

const RELEASE_API = 'https://api.github.com/repos/xiasummer740/xnow-terminal/releases/latest'

// 缓存 10 分钟避免 GitHub API 限频
const CACHE_TTL = 10 * 60 * 1000
let cache = { data: null, time: 0 }

async function fetchData(url) {
  const data = {
    action: 'fetch',
    options: {
      url,
      timeout: 15000,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'XNOW-Terminal',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
    proxy: window.store.getProxySetting(),
  }
  return fetch(data).catch(() => null)
}

export async function getLatestReleaseVersion() {
  try {
    if (cache.data && Date.now() - cache.time < CACHE_TTL) {
      return cache.data
    }
    const res = await fetchData(RELEASE_API)
    // 返回错误字符串时说明请求失败
    if (typeof res === 'string') {
      return { error: res }
    }
    if (res?.tag_name) {
      const ver = res.tag_name.replace(/^v/, '')
      const currentVer = packInfo.version
      const result = ver !== currentVer ? { tag_name: ver, html_url: res.html_url } : null
      cache = { data: result, time: Date.now() }
      return result
    }
    return null
  } catch {
    return null
  }
}

export async function getLatestReleaseInfo() {
  try {
    const res = await fetchData(RELEASE_API)
    if (res?.body) {
      return {
        body: res.body,
        date: res.published_at ? new Date(res.published_at).toISOString().slice(0, 10) : '',
        html_url: res.html_url || 'https://github.com/xiasummer740/xnow-terminal/releases/latest',
      }
    }
    return null
  } catch {
    return null
  }
}

/** 清空缓存（手动检查时调用） */
export function clearReleaseCache() {
  cache = { data: null, time: 0 }
}
