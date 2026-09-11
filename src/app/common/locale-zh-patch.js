/**
 * 中文语言包补丁
 *
 * 上游 @electerm/electerm-locales 的词条不全，缺失的 key 会被
 * window.translate 原样回退成英文（见 src/client/entry/basic.js），
 * 界面就会出现 "custom" "gist" "Done" 这类英文。
 *
 * 该包在 node_modules 里不能直接改，所以在加载时把本表合并进 zh_cn。
 * 只补上游没有的 key，上游以后补齐了会自动以官方翻译为准。
 *
 * 协议名（SSH/SFTP/Telnet/RDP/VNC/FTP 等）与品牌名不译。
 */

// 上游语言包缺失、但代码里已经在用的 key
const missingKeys = {
  // 通用
  Done: '完成',
  confirm: '确认',
  op: '操作',
  actions: '操作',
  count: '数量',
  noData: '暂无数据',
  from: '来源',
  text: '文字',
  label: '标签',
  menu: '菜单',
  profile: '配置',
  templates: '模板',
  delay: '延迟',
  replace: '替换',
  ROOT: '根目录',
  'name needed': '需要名称',
  zoom: '缩放',
  index: '序号',

  // 终端外观
  Opacity: '不透明度',
  Blur: '模糊',
  Brightness: '亮度',
  Grayscale: '灰度',
  Contrast: '对比度',
  selectFontFamily: '选择字体',
  textBackground: '文字背景',
  terminalBackgroundText: '终端背景文字',
  enterTextForBackground: '输入背景文字',
  textColor: '文字颜色',
  colorValue: '颜色值',
  randomShape: '随机形状',

  // 会话 / 连接
  fullscreen: '全屏',
  exitFullscreen: '退出全屏',
  keepalive: '保活',
  width: '宽度',
  height: '高度',
  dynamicForward: '动态转发',
  'SSH Agent Path': 'SSH Agent 路径',
  loginPrompt: '登录提示符',
  passwordPrompt: '密码提示符',
  sftpPathFollowSshTip: 'SFTP 打开目录跟随 SSH 当前目录',

  // 书签表单
  category: '分类',
  secure: '安全',
  domain: '域',
  URL: '网址',
  'Please input URL': '请输入网址',
  'URL must start with http:// or https://': '网址必须以 http:// 或 https:// 开头',
  useragent: '用户代理',
  'MFA/OTP': 'MFA/OTP',
  clipViewport: '裁剪视口',
  qualityLevel: '画质',
  compressionLevel: '压缩级别',
  bookmark: '收藏',

  // 设置
  changePassword: '修改密码',
  passwords: '已保存密码',
  newPassword: '新密码',
  noPasswordsFound: '未找到已保存的密码',
  noWorkspaces: '暂无工作区',
  execWindows: 'Windows 执行命令',
  execMac: 'Mac 执行命令',
  execLinux: 'Linux 执行命令',
  deepLinkSkipped: '已跳过深链接注册',
  downloadFromBrowser: '从浏览器下载',
  stopWidgetFailed: '关闭小组件失败'
}

// 本项目自研界面里硬编码的英文文案，改成 e('key') 后在此登记
const localKeys = {
  // AI
  'AI Config': 'AI 配置',
  'AI Assistant': 'AI 助手',
  Agent: '智能体',
  'API URL': 'API 地址',
  'API PATH': 'API 路径',
  'API Key': 'API 密钥',
  'API Token': 'API 令牌',
  'Enter your API key': '请输入 API 密钥',
  'Enter proxy URL (optional)': '请输入代理地址（可选）',
  'Proxy for AI API requests (e.g., socks5://127.0.0.1:1080)': 'AI 请求代理（例如 socks5://127.0.0.1:1080）',
  'Enter your prompt here': '在此输入你的问题',
  'Enter to send, Shift+Enter for new line': '回车发送，Shift+回车换行',
  'Stop this AI request': '停止本次 AI 请求',
  'Clear AI chat history': '清空 AI 对话记录',
  'AI request failed': 'AI 请求失败',
  'Model:': '模型：',
  'Role:': '角色：',
  'Base URL:': '接口地址：',
  'Time:': '时间：',
  'Arguments:': '参数：',
  'Result:': '结果：',

  // 批量操作 / 文件传输
  'Execution Log': '执行日志',
  'Choose some files to send': '选择要发送的文件',
  'Search in text...': '在文本中搜索…',

  // 书签表单
  cipher: '加密算法',
  serverHostKey: '服务端主机密钥',
  x11: 'X11 转发',

  // 设置
  Proxy: '代理',
  args: '参数',
  'Check gist': '检查 gist',
  'API Url': 'API 地址',
  'WebDAV username': 'WebDAV 用户名',
  'WebDAV password': 'WebDAV 密码',
  'No items': '暂无项目',
  'eg: https://xx.com/xx.png or /path/to/xx.png': '例如：https://xx.com/xx.png 或 /path/to/xx.png',

  // 网页认证
  'Authentication Required': '需要身份验证',
  Username: '用户名',
  Password: '密码',

  // 其他
  'Load Template': '加载模板',
  'Execute Workflow': '执行工作流',
  'hostname or ip': '主机名或 IP',
  with: '与',
  All: '全部',
  Login: '登录',
  'Protocol Status': '协议注册状态',
  'Normal buffer content': '普通缓冲区内容',
  'You can visit': '你可以访问',
  'to download new version.': '下载新版本。',
  'Gitee data sync is not recommended. For more information, please refer to the': '不建议使用 Gitee 做数据同步，详情请参阅',

  // 表格列名 / 数据库升级弹窗
  'NO.': '序号',
  Resolutions: '分辨率',
  'ssh configs': 'SSH 配置',
  'Migrating database': '正在迁移数据库',
  'Migrating database... please wait': '正在迁移数据库…请稍候',
  'Database Migrated': '数据库迁移完成',
  'Upgrading database': '正在升级数据库',
  'Database Upgraded': '数据库升级完成',
  'Database error': '数据库出错',
  'Database operation failed': '数据库操作失败',
  'Choose files to upload to remote desktop': '选择要上传到远程桌面的文件',

  // 设置面板左侧页签名（上游语言包缺这两个 key → 界面显示 BookmarkGroups / Widgets）
  bookmarkGroups: '书签分组',
  widgets: '小组件',

  // 协议名（上游缺 key → translate 回退后再首字母大写，会渲染成 Vnc / Rdp / Ftp 这种怪拼写）
  ssh: 'SSH',
  telnet: 'Telnet',
  vnc: 'VNC',
  rdp: 'RDP',
  ftp: 'FTP',
  spice: 'SPICE',
  serial: 'Serial',
  web: 'Web',

  // 设置同步（页签名 = syncTypes 的键，表单标签是 token/gistId）
  github: 'GitHub',
  gitee: 'Gitee',
  custom: '自定义',
  cloud: '云端',
  webdav: 'WebDAV',
  token: '令牌',
  gistId: 'Gist 编号',
  gist: 'Gist',
  'github access token': 'GitHub 访问令牌',
  'gitee access token': 'Gitee 访问令牌',
  'custom access token': '自定义服务令牌',
  'cloud access token': '云端访问令牌',
  'webdav access token': 'WebDAV 访问令牌',
  'github gist id': 'GitHub Gist 编号',
  'gitee gist id': 'Gitee Gist 编号',
  'custom gist id': '自定义服务编号',
  'cloud gist id': '云端编号',
  'webdav gist id': 'WebDAV 编号',
  'JWT Secret': 'JWT 密钥',
  'User ID': '用户编号',
  'Skip SSL verify': '跳过 SSL 证书校验',

  // UI 主题编辑器里的色位名（展示用标签，改的只是显示，取值仍用原 key）
  main: '主色',
  'main-dark': '主色（深）',
  'main-light': '主色（浅）',
  'text-light': '文字（浅）',
  'text-dark': '文字（深）',
  'text-disabled': '文字（禁用）',
  primary: '强调色',
  info: '信息色',
  success: '成功色',
  error: '错误色',
  warn: '警告色',
  'terminal:foreground': '终端：前景',
  'terminal:background': '终端：背景',
  'terminal:cursor': '终端：光标',
  'terminal:cursorAccent': '终端：光标高亮',
  'terminal:selectionBackground': '终端：选中背景',
  'terminal:black': '终端：黑',
  'terminal:red': '终端：红',
  'terminal:green': '终端：绿',
  'terminal:yellow': '终端：黄',
  'terminal:blue': '终端：蓝',
  'terminal:magenta': '终端：品红',
  'terminal:cyan': '终端：青',
  'terminal:white': '终端：白',
  'terminal:brightBlack': '终端：亮黑',
  'terminal:brightRed': '终端：亮红',
  'terminal:brightGreen': '终端：亮绿',
  'terminal:brightYellow': '终端：亮黄',
  'terminal:brightBlue': '终端：亮蓝',
  'terminal:brightMagenta': '终端：亮品红',
  'terminal:brightCyan': '终端：亮青',
  'terminal:brightWhite': '终端：亮白',

  // 设置项 / 关于页
  debug: '调试',
  Version: '版本',
  System: '系统',
  CAPS: '大写锁定',
  Try: '重试',
  'Select a widget to configure': '请选择要配置的小组件',
  'Actions:': '支持的动作：',
  'Changelog:': '更新日志：',
  Beta: '测试版',
  wiki: '文档',
  'src:': '来源：'
}

// 书签表单 config 里裸写的中文字段名（fields.jsx 会统一过一遍翻译）
const formFieldKeys = {
  baudRate: '波特率',
  dataBits: '数据位',
  stopBits: '停止位',
  parity: '校验位',
  lock: '锁定',
  rtscts: 'RTS/CTS 流控',
  xon: 'XON 流控',
  xoff: 'XOFF 流控',
  xany: 'XANY 流控',
  txLineEnding: '发送换行符',
  rxLineEnding: '接收换行符',
  SetEnv: '环境变量',
  hideAddressBar: '隐藏地址栏',
  'Send Ctrl+Alt+Del': '发送 Ctrl+Alt+Del',
  'Select Screen': '选择屏幕',
  'XMODEM Send': 'XMODEM 发送',
  'XMODEM Receive': 'XMODEM 接收',
  Unknown: '未知',
  None: '无',
  'Set default cipher and serverHostKey': '恢复默认加密算法与服务端主机密钥'
}

// 表单校验提示
const validationKeys = {
  'Choose a folder to save file(s)': '选择保存文件夹',
  'Choose a file': '选择文件',
  'Choose files to upload': '选择要上传的文件',
  'Choose file(s) to send via XMODEM': '选择要通过 XMODEM 发送的文件',
  'Please input the AI role!': '请输入 AI 角色！',
  'Please input language': '请输入语言',
  'host required': '请填写主机',
  'port required': '请填写端口',
  'terminal type required': '请填写终端类型',
  'path required': '请填写路径',
  'path not valid': '路径无效',
  'Name required': '请填写名称',
  'Server URL is required': '请填写服务器地址',
  'Username is required': '请填写用户名',
  'Password is required': '请填写密码',
  'theme config required': '请填写主题配置',
  'theme name required': '请填写主题名称',
  'File downloaded from remote': '已从远程下载文件',
  'requires authentication': '需要身份验证',
  '520 chars max': '最多 520 个字符',
  '128 chars max': '最多 128 个字符',
  '1024 chars max': '最多 1024 个字符',
  '13000 chars max': '最多 13000 个字符',
  '130 chars max': '最多 130 个字符',
  '60 chars max': '最多 60 个字符',
  '200 chars max': '最多 200 个字符',
  '500 chars max': '最多 500 个字符',
  '100 chars max': '最多 100 个字符',
  '1100 chars max': '最多 1100 个字符',
  '1000 chars max': '最多 1000 个字符',
  '30 chars max': '最多 30 个字符'
}

const patch = Object.assign({}, missingKeys, localKeys, formFieldKeys, validationKeys)

/**
 * 把补丁合并进中文语言表（只补缺失项，不覆盖已有翻译）
 * @param {string} langId 语言 id，如 zh_cn
 * @param {object} langObj 语言表对象 { lang: { key: value } }
 */
function applyZhPatch (langId, langObj) {
  if (langId !== 'zh_cn' || !langObj || !langObj.lang) {
    return langObj
  }
  for (const [key, value] of Object.entries(patch)) {
    if (langObj.lang[key] === undefined) {
      langObj.lang[key] = value
    }
  }
  return langObj
}

module.exports = { applyZhPatch, patch }
