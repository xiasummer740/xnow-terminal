/**
 * 三网路由检测
 * 检测去程（本地→VPS）和回程（VPS→本地）路由，自动识别线路类型
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { runCmd, localTracert } from '../terminal/terminal-apis'
import { NewPromise } from '../../common/promise-timeout'

/* ========== 线路识别数据库 ========== */

// 中国运营商骨干网
const LINE_INFO = [
  // ─── 电信 CN2 (AS4809) — 国际精品线路 ───
  { prefix: '59.43.', name: 'CN2', asn: 'AS4809', color: '#722ed1', badge: 'CN2' },

  // ─── 电信 163 骨干 (AS4134) ───
  { prefix: '202.97.', name: '163骨干', asn: 'AS4134', color: '#1890ff', badge: '163' },
  { prefix: '218.104.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },
  { prefix: '218.105.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },
  { prefix: '218.106.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },
  { prefix: '218.107.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },
  { prefix: '218.108.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },
  { prefix: '218.240.', name: '中国电信', asn: 'AS4134', color: '#1890ff', badge: '电信' },

  // ─── 联通 CUII / 9929 (AS9929) — 联通精品 ───
  { prefix: '210.13.', name: '联通CUII', asn: 'AS9929', color: '#eb2f96', badge: '9929' },
  { prefix: '210.14.', name: '联通CUII', asn: 'AS9929', color: '#eb2f96', badge: '9929' },
  { prefix: '210.15.', name: '联通CUII', asn: 'AS9929', color: '#eb2f96', badge: '9929' },
  { prefix: '210.16.', name: '联通CUII', asn: 'AS9929', color: '#eb2f96', badge: '9929' },
  { prefix: '104.28.', name: '联通CUII', asn: 'AS9929', color: '#eb2f96', badge: '9929' },

  // ─── 联通 169 (AS4837) ───
  { prefix: '219.158.', name: '联通169', asn: 'AS4837', color: '#fa8c16', badge: '4837' },
  { prefix: '220.192.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '220.193.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '220.194.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.192.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.193.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.194.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.195.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.196.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.197.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.198.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.199.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },
  { prefix: '221.200.', name: '中国联通', asn: 'AS4837', color: '#fa8c16', badge: '联通' },

  // ─── 移动 CMI/CMIN2 (AS58453/AS9808) ───
  { prefix: '223.118.', name: 'CMI', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '223.119.', name: 'CMI', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '223.120.', name: 'CMI', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.176.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.177.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.178.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.179.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.180.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.181.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.182.', name: '移动国际', asn: 'AS58453', color: '#52c41a', badge: 'CMI' },
  { prefix: '221.183.', name: '移动骨干', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '221.184.', name: '移动骨干', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '221.185.', name: '移动骨干', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.136.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.137.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.138.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.139.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.140.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.141.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.142.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.143.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '218.200.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '218.201.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '218.202.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '218.203.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '221.130.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '221.131.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },
  { prefix: '211.103.', name: '移动', asn: 'AS9808', color: '#52c41a', badge: 'CMCC' },

  // ─── 中国通用 IP（103/106 段，运营商分配） ───
  { prefix: '103.', name: '中国骨干', asn: '', color: '#5b8def', badge: 'CN' },
  { prefix: '106.', name: '中国骨干', asn: '', color: '#5b8def', badge: 'CN' },

  // ─── 教育网 CERNET (AS4538) ───
  { prefix: '101.4.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '101.5.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '202.38.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '202.112.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '202.113.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '202.114.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },
  { prefix: '202.115.', name: '教育网', asn: 'AS4538', color: '#13c2c2', badge: 'CERNET' },

  // ─── 国际骨干 ───
  // Cogent / Level 3 (AS174) — 常见美国骨干
  { prefix: '154.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },
  { prefix: '38.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },
  { prefix: '206.148.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },
  { prefix: '206.72.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },
  { prefix: '208.54.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },
  { prefix: '216.38.', name: 'Cogent', asn: 'AS174', color: '#f50', badge: 'Cogent' },

  // NTT (AS2914)
  { prefix: '129.250.', name: 'NTT', asn: 'AS2914', color: '#fa8c16', badge: 'NTT' },

  // GTT (AS3257)
  { prefix: '213.200.', name: 'GTT', asn: 'AS3257', color: '#eb2f96', badge: 'GTT' },
  { prefix: '89.149.', name: 'GTT', asn: 'AS3257', color: '#eb2f96', badge: 'GTT' },
  { prefix: '77.67.', name: 'GTT', asn: 'AS3257', color: '#eb2f96', badge: 'GTT' },

  // Tata (AS6453)
  { prefix: '66.110.', name: 'Tata', asn: 'AS6453', color: '#13c2c2', badge: 'Tata' },

  // Telia (AS1299)
  { prefix: '62.115.', name: 'Telia', asn: 'AS1299', color: '#2f54eb', badge: 'Telia' },
  { prefix: '213.248.', name: 'Telia', asn: 'AS1299', color: '#2f54eb', badge: 'Telia' },
  { prefix: '80.239.', name: 'Telia', asn: 'AS1299', color: '#2f54eb', badge: 'Telia' },

  // HKIX / Equinix IX
  { prefix: '123.255.', name: 'HKIX', asn: '', color: '#a0d911', badge: 'HKIX' },

  // ─── 云厂商 ───
  { prefix: '47.', name: '阿里云/Azure', asn: '', color: '#ff7a45', badge: 'Cloud' },
  { prefix: '8.8.8.', name: 'Google DNS', asn: 'AS15169', color: '#52c41a', badge: 'Google' },
  { prefix: '8.8.4.', name: 'Google DNS', asn: 'AS15169', color: '#52c41a', badge: 'Google' },

  // Cloudflare
  { prefix: '104.16.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },
  { prefix: '104.17.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },
  { prefix: '104.18.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },
  { prefix: '104.19.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },
  { prefix: '172.64.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },
  { prefix: '188.114.', name: 'Cloudflare', asn: 'AS13335', color: '#f6821f', badge: 'CF' },

  // ─── AWS ───
  { prefix: '52.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '54.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '13.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '3.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '18.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '35.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },
  { prefix: '44.', name: 'AWS', asn: 'AS16509', color: '#ff9900', badge: 'AWS' },

  // 华为云
  { prefix: '121.36.', name: '华为云', asn: '', color: '#cf1322', badge: '华为云' },
  { prefix: '119.8.', name: '华为云', asn: '', color: '#cf1322', badge: '华为云' },
  { prefix: '124.70.', name: '华为云', asn: '', color: '#cf1322', badge: '华为云' },
  { prefix: '122.9.', name: '华为云', asn: '', color: '#cf1322', badge: '华为云' },

  // 腾讯云
  { prefix: '81.68.', name: '腾讯云', asn: '', color: '#0052d9', badge: '腾讯云' },

  // ─── VPS 商家常见 ───
  { prefix: '45.32.', name: 'Vultr/Choopa', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '108.61.', name: 'Vultr/Choopa', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '104.156.', name: 'Vultr', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '95.179.', name: 'Vultr', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '45.63.', name: 'Vultr', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '45.76.', name: 'Vultr', asn: 'AS20473', color: '#fa541c', badge: 'Vultr' },
  { prefix: '107.172.', name: 'BuyVM', asn: '', color: '#eb2f96', badge: 'BuyVM' },
  { prefix: '205.185.', name: 'BuyVM/FranTech', asn: '', color: '#eb2f96', badge: 'BuyVM' },

  // ─── 11.x.x.x — 中国运营商内网/公网 ───
  { prefix: '11.', name: '中国运营商', asn: '', color: '#5b8def', badge: 'CN' },
]

const LAN_PREFIXES = ['192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.']

const PRIVATE_IPS = ['127.0.0.', '0.0.0.0']

/* ========== 工具函数 ========== */

function identifyIp (ip) {
  if (!ip || ip === '*') return null

  // 先检查具体已知线路（按前缀由长到短匹配，避免 103. 抢在 103.170. 前面）
  for (const info of LINE_INFO) {
    if (ip.startsWith(info.prefix)) return info
  }

  // 检查局域网
  for (const p of LAN_PREFIXES) {
    if (ip.startsWith(p)) return { name: '局域网', asn: '', color: '#8c8c8c', badge: 'LAN' }
  }
  for (const p of PRIVATE_IPS) {
    if (ip.startsWith(p)) return { name: '本机', asn: '', color: '#8c8c8c', badge: 'LOCAL' }
  }

  return null
}

/**
 * 解析 Windows tracert -d 输出
 */
function parseTracertWindows (output) {
  if (!output) return []
  const hops = []
  const lines = output.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 " 1    <1 ms    <1 ms    <1 ms  192.168.1.1"
    const match = trimmed.match(/^\s*(\d+)\s+.*?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*$/)
    if (match) {
      hops.push({ hop: parseInt(match[1]), ip: match[2] })
    }
  }
  // 去重：同一跳多个 IP 时取最后出现的（更接近真实目标）
  const seen = {}
  return hops.filter(h => {
    if (seen[h.hop]) {
      seen[h.hop] = h
      return false
    }
    seen[h.hop] = h
    return true
  })
}

/**
 * 解析 Linux traceroute -n 输出
 */
function parseTracerouteLinux (output) {
  if (!output) return []
  const hops = []
  const lines = output.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(/^\s*(\d+)\s+((?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b)/)
    if (match) {
      hops.push({ hop: parseInt(match[1]), ip: match[2] })
    }
  }
  const seen = {}
  return hops.filter(h => {
    if (seen[h.hop]) {
      seen[h.hop] = h
      return false
    }
    seen[h.hop] = h
    return true
  })
}

function parseRoute (output, isWindows) {
  const hops = isWindows ? parseTracertWindows(output) : parseTracerouteLinux(output)
  return hops.map(h => ({
    ...h,
    info: identifyIp(h.ip)
  }))
}

/* ========== 样式常量 ========== */

const styles = {
  section: {
    padding: '4px 0 0'
  },
  title: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-light)',
    padding: '0 10px 4px', letterSpacing: 0.5,
    display: 'flex', alignItems: 'center', gap: 5
  },
  detectBtn: {
    fontSize: 11, cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4, padding: '2px 8px',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-dark)',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    transition: 'all 0.2s'
  },
  routeBlock: {
    padding: '0 10px', marginBottom: 4
  },
  subTitle: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-dark)',
    marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4
  },
  hopRow: {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, padding: '1px 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    fontVariantNumeric: 'tabular-nums'
  },
  hopNum: {
    color: 'var(--text-light)', width: 20, textAlign: 'right', flexShrink: 0, fontSize: 10
  },
  hopIp: {
    color: 'var(--text-dark)', fontFamily: 'monospace', flex: 1
  },
  badge: {
    fontSize: 9, fontWeight: 600, padding: '0 4px',
    borderRadius: 3, lineHeight: '16px', flexShrink: 0
  },
  loading: {
    fontSize: 11, color: 'var(--text-light)', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 5
  },
  error: {
    fontSize: 11, color: '#ff4d4f', padding: '3px 10px'
  },
  tip: {
    fontSize: 10, color: 'var(--text-light)', padding: '2px 10px', fontStyle: 'italic'
  }
}

/* ========== 子组件 ========== */

function HopRow ({ hop, ip, info }) {
  const badgeColor = info ? info.color : '#555'
  const badgeText = info ? info.badge : '?'
  const nameStr = info ? info.name : '未知节点'
  const asnStr = info && info.asn ? ` [${info.asn}]` : ''
  return (
    <div style={styles.hopRow}>
      <span style={styles.hopNum}>{hop}</span>
      <span style={styles.hopIp}>{ip}</span>
      <span style={{ ...styles.badge, background: badgeColor + '22', color: badgeColor, border: '1px solid ' + badgeColor + '44' }}>
        {badgeText}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-light)' }}>{nameStr}{asnStr}</span>
    </div>
  )
}

function RouteResult ({ title, icon, hops }) {
  if (!hops || hops.length === 0) return null
  return (
    <div style={styles.routeBlock}>
      <div style={styles.subTitle}>
        {icon}
        {title}
        <span style={{ fontSize: 10, color: 'var(--text-light)', fontWeight: 400 }}>
          ({hops.length} 跳)
        </span>
      </div>
      {hops.map(h => (
        <HopRow key={h.hop} hop={h.hop} ip={h.ip} info={h.info} />
      ))}
    </div>
  )
}

/* ========== 主组件 ========== */

export default function RouteDetect (props) {
  const { pid, host, isRemote } = props
  const [loading, setLoading] = useState(false)
  const [forwardHops, setForwardHops] = useState(null)
  const [returnHops, setReturnHops] = useState(null)
  const [error, setError] = useState('')
  const [detected, setDetected] = useState(false)
  const [vpsPublicIp, setVpsPublicIp] = useState('')
  const [localPublicIp, setLocalPublicIp] = useState('')
  const [localLanIp, setLocalLanIp] = useState('')

  const cancelledRef = useRef(false)

  useEffect(() => {
    return () => { cancelledRef.current = true }
  }, [])

  const detect = useCallback(async () => {
    if (!pid || !host || !isRemote) return
    setLoading(true)
    setError('')
    setForwardHops(null)
    setReturnHops(null)
    setDetected(false)
    setVpsPublicIp('')
    setLocalPublicIp('')
    setLocalLanIp('')

    let localError = ''

    try {
      // Step 1: 获取本机公网 IP（SSH 连接来源）
      let localIp = ''
      const ipResult = await runCmd(pid, 'echo $SSH_CLIENT | cut -d" " -f1')
      localIp = (ipResult || '').trim()
      if (!localIp) {
        const ipResult2 = await runCmd(pid, "echo $SSH_CONNECTION | awk '{print $1}'")
        localIp = (ipResult2 || '').trim()
      }
      setLocalPublicIp(localIp)

      // Step 2: 获取本机局域网 IP
      // 通过 SSH_CLIENT 的第二个字段是端口，不在本地；在本地跑 ipconfig 取默认网关接口的 IP
      // 这里用第1跳的IP来展示

      // Step 3: 获取 VPS 公网 IP（SSH 连接目标）
      let vpsIp = ''
      const vpsResult = await runCmd(pid, "echo $SSH_CONNECTION | awk '{print $3}'")
      vpsIp = (vpsResult || '').trim()
      if (!vpsIp) {
        const vpsResult2 = await runCmd(pid, "curl -s ifconfig.me || curl -s ip.sb || curl -s icanhazip.com")
        vpsIp = (vpsResult2 || '').trim()
      }
      setVpsPublicIp(vpsIp)

      if (cancelledRef.current) return

      // Step 3: 去程路由（本地 → VPS）— 45秒超时
      // 用书签的 host IP（即你实际连接的目标），而不是 SSH_CONNECTION 获取的
      // SSH_CONNECTION 可能显示 VPS 内网 IP（如 YX HK 的 NAT 环境）
      let forwardRaw = ''
      try {
        forwardRaw = await Promise.race([
          localTracert(host),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TRACERT_TIMEOUT')), 45000))
        ])
      } catch (e) {
        forwardRaw = ''
        if (e.message === 'TRACERT_TIMEOUT') {
          localError = '去程 tracert 超时（45s），已跳过'
        }
      }

      if (cancelledRef.current) return

      // Step 4: 回程路由（VPS → 本机）— 30秒超时
      let returnRaw = ''
      if (localIp) {
        try {
          returnRaw = await Promise.race([
            runCmd(pid, `traceroute -n ${localIp} 2>/dev/null || tracepath -n ${localIp} 2>/dev/null || echo ''`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TRACEROUTE_TIMEOUT')), 30000))
          ])
        } catch (e) {
          returnRaw = ''
          if (e.message === 'TRACEROUTE_TIMEOUT') {
            localError = (localError ? localError + '；' : '') + '回程 traceroute 超时（30s）'
          }
        }
      }

      if (cancelledRef.current) return

      const fHops = parseRoute(forwardRaw, true)
      const rHops = parseRoute(returnRaw, false)

      setForwardHops(fHops)
      setReturnHops(rHops)
      setDetected(true)
      if (localError) setError(localError)
    } catch (err) {
      if (!localError) setError(err.message || '检测失败')
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [pid, host, isRemote])

  if (!isRemote || !host) return null

  const hasResult = detected && (forwardHops?.length > 0 || returnHops?.length > 0)

  return (
    <div className='terminal-info-section' style={styles.section}>
      {/* 标题行 */}
      <div style={styles.title}>
        <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
          <circle cx='12' cy='12' r='3' />
          <path d='M12 2v4M22 12h-4M12 20v4M4 12H2M20 12h2M6.34 6.34L4.93 4.93M17.66 6.34l1.41-1.41M17.66 17.66l1.41 1.41M6.34 17.66L4.93 19.07' />
        </svg>
        三网路由检测
        {!loading && !hasResult && (
          <button
            onClick={detect}
            style={styles.detectBtn}
            onMouseEnter={e => { e.target.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.04)' }}
          >▶ 检测</button>
        )}
        {!loading && hasResult && (
          <button
            onClick={detect}
            style={{ ...styles.detectBtn, borderColor: 'rgba(82,196,26,0.3)' }}
            onMouseEnter={e => { e.target.style.background = 'rgba(82,196,26,0.1)' }}
            onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.04)' }}
          >↻ 重新检测</button>
        )}
      </div>

      {/* 检测中 */}
      {loading && (
        <div style={styles.loading}>
          <span className='spin' style={{
            display: 'inline-block', width: 10, height: 10,
            border: '2px solid var(--text-light)', borderRadius: '50%',
            borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite'
          }} />
          正在检测路由（需要 30-60 秒）...
        </div>
      )}

      {/* 错误提示 */}
      {error && <div style={styles.error}>⚠ {error}</div>}

      {/* 连接信息 */}
      {(hasResult) && (vpsPublicIp || localPublicIp) && (
        <div style={styles.tip}>
          连接: {host && `书签 ${host}`}{host && vpsPublicIp ? ' / ' : ''}{vpsPublicIp && `SSH识别 ${vpsPublicIp}`}{localPublicIp ? ` / 本机出口 ${localPublicIp}` : ''}
        </div>
      )}

      {/* 检测结果 */}
      {hasResult && (
        <>
          {/* 去程路由 */}
          {forwardHops?.length > 0 && !(forwardHops.length === 1 && forwardHops[0].ip.startsWith('127.')) && (
            <RouteResult
              title='去程路由（本地 → VPS）'
              icon={
                <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                  <line x1='5' y1='12' x2='19' y2='12' /><polyline points='12 5 19 12 12 19' />
                </svg>
              }
              hops={forwardHops}
            />
          )}
          {forwardHops?.length === 0 && (
            <div style={{ padding: '0 10px', marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)' }}>
                去程 tracert 无有效结果（可能被防火墙拦截）
              </div>
            </div>
          )}

          {forwardHops?.length === 1 && forwardHops[0].ip.startsWith('127.') && (
            <div style={{ padding: '0 10px', marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-light)' }}>
                去程 tracert 打到了本机回环，可能用了 SSH 隧道连接方式
              </div>
            </div>
          )}

          {/* 回程路由 */}
          {returnHops?.length > 0 && (
            <RouteResult
              title='回程路由（VPS → 本机）'
              icon={
                <svg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                  <line x1='19' y1='12' x2='5' y2='12' /><polyline points='12 19 5 12 12 5' />
                </svg>
              }
              hops={returnHops}
            />
          )}
        </>
      )}

      {/* 未检测 */}
      {!loading && !hasResult && !error && (
        <div style={{ padding: '0 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-light)' }}>
            点击「检测」查看本地到 VPS 的去程/回程路由
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
