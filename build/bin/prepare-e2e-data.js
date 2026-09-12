/**
 * 造 E2E 的种子数据（ISSUES E2E 线）
 *
 * ## 为什么需要这个
 *
 * 48 个 spec 里有 23 个的**第一句就是操作终端**（切分屏、开信息面板、跑 ls、
 * 文件管理器……），但**没有任何一个 spec 会先把终端建出来**，app 自己也不会
 * 在启动时开标签（实测：干净数据目录下 bookmarkCount=0、tabCount=0）。
 *
 * 于是这 23 个必定在第一步就超时——不是它们写错了，是**前提从来没被满足**。
 * 基线实测（31 条）：需要终端的全红，不需要终端的两条（00181.layout、
 * 005.3.web-bookmark）全绿，分界线干净得不像话。
 *
 * ## 怎么解决
 *
 * 用 app **本来就有的机制**，不改那 23 个 spec：
 * `store.openInitSessions()`（load-data.js:109）会把 `config.onStartSessions`
 * 里的书签**在启动时逐个开成标签**。所以只要预置「一条 local 书签 +
 * onStartSessions 指向它」，启动后终端就在那儿了。
 *
 * 顺手把 `language` 钉成 `en_us`：test/e2e/common/lang.js 是从
 * `@electerm/electerm-locales` 的 en_us 取词条的，整套 E2E 的隐含前提
 * 就是「界面跑在英文下」。而实测 app-options.js 里的 LC_ALL=**根本没生效**
 * （探针实测 config.language === 'zh_cn'，类型标签渲染成「本地」不是 "Local"），
 * 因为 default-setting.js:6 硬编码了 language: 'zh_cn'，locales.js:61
 * `if (config.language) return config.language` 直接把系统语言那条路短路了。
 * 所以语言只能从**配置**这一层压，环境变量压不动。
 *
 * ## 为什么可以纯明文写库
 *
 * sqlite.js:136 `if (!stored.startsWith(ENC_PREFIX)) return stored` ——
 * **没有 `enc:` 前缀的字符串原样返回**，然后 JSON.parse。所以直接写明文 JSON
 * 进去，app 读得出来。这一点很关键：
 *   - 不用拉起 Electron 调 safeStorage，纯 node:sqlite 就能造
 *   - Windows 的 safeStorage 是 DPAPI（绑当前用户账户），密文**换台机器就解不开**；
 *     明文没有这个绑定，所以同一份种子在 Windows / macOS / CI 上都能用
 *
 * ## 为什么不会触发迁移和升级（两个坑都绕开了）
 *
 * 1. **不动 NeDB 迁移**：migrate-1-to-2.js:31 checkMigrate 只在**发现 NeDB 文件**
 *    时才返回 true。我们造的目录里没有 NeDB 文件，不会迁移。
 * 2. **不动版本升级**：migrate/index.js:59 `if (dbVersion === emptyVersion) return false`
 *    —— 库里**没有 version 行**时 dbVersion 就是 '0.0.0'，直接短路，一个升级脚本都不跑。
 *    所以这里**故意不写 version 行**，写了反而会触发 200+ 个升级脚本。
 *
 * 表结构照抄 sqlite.js:88-113 的列表（15 张表，`data` 单独一个库），
 * 用 CREATE TABLE IF NOT EXISTS，和 app 自己建的一模一样。
 */

const fs = require('fs')
const { resolve } = require('path')
const { DatabaseSync } = require('node:sqlite')

const cwd = process.cwd()
const DATA_PATH = resolve(cwd, 'work/e2e-data')
const USER = 'default_user'
const DB_FOLDER = resolve(DATA_PATH, 'users', USER)
const MAIN_DB = resolve(DB_FOLDER, 'xnow.db')
const DATA_DB = resolve(DB_FOLDER, 'xnow_data.db')

// 固定 ID 而不是随机：种子要可复现，出问题时能直接拿这个 id 去库里捞
const LOCAL_BOOKMARK_ID = 'e2e-local'

// 形态来自实测：让 app 自己建一条 local 书签，再把 window.store.bookmarks 原样导出。
// 不是照文档猜的，字段一个不多一个不少。
const LOCAL_BOOKMARK = {
  id: LOCAL_BOOKMARK_ID,
  title: 'E2E Local',
  runScripts: [{ delay: 500, script: '' }],
  type: 'local',
  term: 'xterm-256color',
  displayRaw: false,
  color: '#0366d6',
  quickCommands: []
}

const USER_CONFIG = {
  // 界面英文 —— 整套 E2E 的断言都按 en_us 词条写的
  language: 'en_us',
  // 启动即开这条 local 书签的标签，这就是那 23 个 spec 缺的前提
  onStartSessions: [LOCAL_BOOKMARK_ID]
}

// 和 sqlite.js 的 tables 数组保持一致；`data` 落 xnow_data.db，其余落 xnow.db
const MAIN_TABLES = [
  'bookmarks',
  'bookmarkGroups',
  'addressBookmarks',
  'terminalThemes',
  'lastStates',
  'quickCommands',
  'log',
  'dbUpgradeLog',
  'profiles',
  'workspaces',
  'history',
  'terminalCommandHistory',
  'aiChatHistory',
  'autoRunWidgets'
]

function createTables (db, tables) {
  for (const t of tables) {
    db.exec(`CREATE TABLE IF NOT EXISTS \`${t}\` (_id TEXT PRIMARY KEY, data TEXT)`)
  }
}

function put (db, table, id, obj) {
  db.prepare(`INSERT OR REPLACE INTO \`${table}\` (_id, data) VALUES (?, ?)`)
    .run(id, JSON.stringify(obj))
}

function main () {
  // 每次重造，不判断"是否已存在"。
  // 理由：上一轮测试跑完库里会留下一堆书签/历史（基线那轮就留了 3 条书签、
  // 7 条 history），带着这些残留再跑，测试之间就不再是独立的了。
  // 这个目录是纯测试产物，重建成本接近零，换来的是每轮起点一致。
  if (fs.existsSync(DB_FOLDER)) {
    fs.rmSync(DB_FOLDER, { recursive: true, force: true })
    console.log('[prepare-e2e-data] 清掉上一轮的残留数据')
  }
  fs.mkdirSync(DB_FOLDER, { recursive: true })

  const mainDb = new DatabaseSync(MAIN_DB)
  const dataDb = new DatabaseSync(DATA_DB)

  createTables(mainDb, MAIN_TABLES)
  createTables(dataDb, ['data'])

  // 书签本体 + 它所属的默认分组（不在分组里的书签 UI 列表上看不到）
  put(mainDb, 'bookmarks', LOCAL_BOOKMARK_ID, LOCAL_BOOKMARK)
  put(mainDb, 'bookmarkGroups', 'default', {
    id: 'default',
    title: 'default',
    bookmarkIds: [LOCAL_BOOKMARK_ID],
    bookmarkGroupIds: []
  })

  // 注意：写的是明文，没有 `enc:` 前缀 —— 见文件头「为什么可以纯明文写库」
  put(dataDb, 'data', 'userConfig', USER_CONFIG)
  // 和真实安装保持一致；这一条本来就不加密
  put(dataDb, 'data', 'userConfigNoEncrypt', { allowMultiInstance: false })

  // 故意不写 `version` 行 —— 见文件头「为什么不会触发迁移和升级」

  mainDb.close()
  dataDb.close()

  console.log(`[prepare-e2e-data] 种子就绪：1 条 local 书签 + onStartSessions + language=en_us`)
  console.log(`[prepare-e2e-data] 数据目录 ${DATA_PATH}`)
}

main()
