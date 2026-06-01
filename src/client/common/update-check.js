/**
 * 检查 XNOW 最新 Release 版本
 */
import fetch from './fetch-from-server'
import { packInfo } from './constants'
import dayjs from 'dayjs'

const RELEASE_API = 'https://api.github.com/repos/xiasummer740/xnow-terminal/releases/latest'
const RELEASE_PAGE = 'https://github.com/xiasummer740/xnow-terminal/releases/latest'

async function fetchData (url) {
  const data = {
    action: 'fetch',
    options: {
      url,
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'XNOW-Terminal'
      }
    },
    proxy: window.store.getProxySetting()
  }
  return fetch(data).catch(() => null)
}

export async function getLatestReleaseVersion () {
  try {
    const res = await fetchData(RELEASE_API)
    if (res?.tag_name) {
      // 去掉 v 前缀
      const ver = res.tag_name.replace(/^v/, '')
      const currentVer = packInfo.version
      if (ver && ver !== currentVer) {
        return { tag_name: ver, html_url: res.html_url }
      }
    }
    return null
  } catch { return null }
}

export async function getLatestReleaseInfo () {
  try {
    const res = await fetchData(RELEASE_API)
    if (res?.body) {
      return {
        body: res.body,
        date: dayjs(res.published_at).format('YYYY-MM-DD'),
        html_url: res.html_url || RELEASE_PAGE
      }
    }
    return null
  } catch { return null }
}
