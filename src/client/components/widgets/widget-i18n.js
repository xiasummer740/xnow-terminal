/**
 * Widget 中文翻译映射
 */
const ZH_MAP = {
  // 小组件名称
  'Widgets': '小组件',
  'RunningInstances': '运行实例',
  'Batch Operation': '批量操作',
  'Static File Server': '静态文件服务器',
  'Local FTP Server': '本地FTP服务器',
  'MCP Server': 'MCP服务器',
  'File Renamer': '文件批量重命名',

  // 小组件描述
  'Define and execute multi-step SSH/SFTP workflows with progress tracking.': '定义并执行多步骤的 SSH/SFTP 工作流，带进度跟踪',
  'A simple local file server to serve static files from your computer.': '轻量级本地文件服务器，从本机分享静态文件',
  'A local FTP server to share files over FTP protocol.': '本地 FTP 服务器，通过 FTP 协议分享文件',
  'Expose electerm APIs via Model Context Protocol (MCP) for AI assistants and external tools.': '通过 MCP 协议开放 XNOW 接口，供 AI 助手和外部工具调用',
  'Batch rename files in a folder using customizable templates': '使用自定义模板批量重命名文件夹中的文件',

  // 通用按钮
  'Start widget': '启动',
  'Run widget': '运行',
  'Generate': '生成',
  'Already running, only one instance allowed': '已运行中，仅允许单例',
  'Downloading package may take some time on first use...': '首次下载依赖包可能需要一些时间...',
  'Start widget new instance': '启动新实例',

  // 配置项
  'host': '主机',
  'port': '端口',
  'directory': '目录',
  'maxAge': '缓存时间',
  'cacheControl': '缓存控制',
  'lastModified': 'Last-Modified',
  'etag': 'ETag',
  'index': '索引文件',
  'redirect': '目录重定向',
  'dotfiles': '点文件',
  'acceptRanges': '范围请求',
  'autoRun': '自动启动',
  'anonymous': '匿名访问',
  'username': '用户名',
  'password': '密码',
  'apiKey': 'API密钥',
  'enableBookmarks': '启用书签API',
  'bookmarkKeyword': '书签过滤关键词',
  'enableBookmarkGroups': '启用分组API',
  'enableSftp': '启用SFTP API',
  'enableSettings': '启用设置API',
  'commandBlacklist': '命令黑名单',
  'commandWhitelist': '命令白名单',
  'template': '模板',
  'includeSubfolders': '包含子文件夹',
  'fileTypes': '文件类型',
  'startNumber': '起始编号',
  'preserveCase': '保留大小写',

  // 描述
  'The IP address to bind the server to': '服务器绑定的 IP 地址',
  'The port number to listen on': '监听的端口号',
  'The directory to serve files from (default: user\'s home directory)': '文件服务根目录（默认：用户主目录）',
  'Browser cache max-age in milliseconds': '浏览器缓存时间（毫秒）',
  'Enable or disable setting Cache-Control response header': '启用/禁用 Cache-Control 响应头',
  'Enable or disable the Last-Modified header': '启用/禁用 Last-Modified 头',
  'Enable or disable etag generation': '启用/禁用 ETag 生成',
  'Name of the index file to serve': '默认索引文件名',
  'Enable or disable redirects when pathname is a directory': '目录路径是否自动重定向',
  'Option for serving dotfiles': '点文件处理策略',
  'Enable or disable accepting ranged requests': '启用/禁用范围请求',
  'Automatically run this widget when the app launches': '应用启动时自动运行',
  'The IP address to bind the MCP server to': 'MCP 服务器绑定的 IP 地址',
  'Optional API key for authenticating MCP requests. If set, clients must send this in the Authorization header as: Bearer <apiKey>. Leave empty to skip authentication.': 'MCP 请求的 API 密钥（可选）。设置后客户端需在 Authorization 头中传入 Bearer <密钥>',
  'Enable bookmark APIs (list, get, add, edit, delete)': '开启书签管理接口',
  'Filter keyword for bookmark list API. Only bookmarks with titles containing this keyword (case-insensitive) will be returned. Leave empty to return all bookmarks.': '书签列表过滤关键词，仅返回标题包含此关键词的书签',
  'Enable bookmark group APIs': '开启书签分组接口',
  'Enable SFTP APIs (list, stat, read, delete, upload, download, trzsz)': '开启 SFTP 操作接口',
  'Enable settings APIs': '开启设置接口',
  'Automatically start this MCP server when the app launches': '应用启动时自动启动 MCP 服务',
  'Newline-separated list of regex patterns. Commands matching any pattern are rejected. Built-in dangerous patterns are always active.': '命令黑名单正则（每行一个），匹配的命令将被阻止',
  'Newline-separated list of regex patterns. When non-empty, only commands matching at least one pattern are allowed (whitelist mode).': '命令白名单正则（每行一个），非空时仅允许匹配的命令',
  'The IP address to bind the FTP server to': 'FTP 服务器绑定的 IP 地址',
  'Allow anonymous FTP access': '允许匿名 FTP 访问',
  'Username for FTP authentication (used when anonymous is false)': 'FTP 登录用户名',
  'Password for FTP authentication (used when anonymous is false)': 'FTP 登录密码',
  'Automatically start this FTP server when the app launches': '应用启动时自动启动 FTP 服务',
  'The directory containing files to rename': '待重命名文件所在目录',
  'Template for new file names. Available tags:\n{n} - Sequential number (e.g., 1, 2, 3)\n{n:padding} - Padded number (e.g., {n:3} => 001, 002)\n{name} - Original filename without extension\n{ext} - File extension\n{date} - File creation date (YYYY-MM-DD)\n{time} - File creation time (HH-mm-ss)\n{random} - Random string': '文件名模板。可用标签：\n{n} 序号 | {n:3} 补零序号 | {name} 原名 | {ext} 扩展名 | {date} 日期 | {time} 时间 | {random} 随机',
  'Process files in subfolders': '处理子文件夹中的文件',
  'Comma-separated list of file extensions (e.g., jpg,png,gif) or * for all': '文件扩展名，逗号分隔（如 jpg,png）或 * 全部',
  'Starting number for sequential naming': '序号起始值',
  'Preserve case of original filenames': '保留原文件名大小写'
}

export function t (key) {
  return ZH_MAP[key] || key
}

export default { t }
