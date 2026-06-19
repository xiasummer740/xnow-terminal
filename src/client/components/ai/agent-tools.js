import { Modal } from 'antd'
import { z } from '../../common/zod'
import { bookmarkSchemas } from '../../common/bookmark-schemas'
import { getInstalledSkills } from '../../common/skill-manager'

function buildAddBookmarkParameters () {
  const typeProperties = {}
  for (const [type, schema] of Object.entries(bookmarkSchemas)) {
    typeProperties[type] = z.toJSONSchema(z.object(schema))
  }

  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: Object.keys(bookmarkSchemas),
        description: 'Bookmark type'
      },
      ...Object.fromEntries(
        Object.entries(typeProperties).map(([type, schema]) => [
          type,
          { type: 'object', description: `Fields for ${type} bookmark`, ...schema }
        ])
      )
    },
    required: ['type']
  }
}

// 高危命令检测 — 只拦跑路级操作
const DANGEROUS_PATTERNS = [
  // Linux
  /^rm\s+(-rf\s+)?\/$/,
  /^rm\s+(-rf\s+)?\/\*/,
  /^mkfs/,
  /^dd\s+if=.*of=\/dev\//,
  /^>\s*\/dev\//,
  /^\s*reboot\s*$/,
  /^\s*shutdown\s/,
  /^\s*poweroff\s*$/,
  /^\s*halt\s*$/,
  // Windows
  /^format\s+\w+:/,
  /^del\s+\/f\s+\/s/,
  /^rd\s+\/s\s+\/q\s+\w:\\/,
  /^rmdir\s+\/s\s+\/q\s+\w:\\/,
  /^diskpart\s*$/,
  /^reg\s+delete/
]

function isDangerousCommand (cmd) {
  const trimmed = cmd.trim().toLowerCase()
  return DANGEROUS_PATTERNS.some(p => p.test(trimmed))
}

export const agentTools = [
  {
    type: 'function',
    function: {
      name: 'send_terminal_command',
      description: 'Send a command to a terminal tab and wait for it to finish. Returns the command output.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute'
          },
          tabId: {
            type: 'string',
            description: 'Terminal tab ID. Omit to use the active terminal.'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_terminal_output',
      description: 'Read the current visible output from a terminal.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'Terminal tab ID. Omit for active terminal.'
          },
          lines: {
            type: 'number',
            description: 'Number of recent lines to read (default 50).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_local_terminal',
      description: 'Open a new local terminal tab. Returns the new tab ID.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: 'List all open terminal tabs with their IDs, titles, hosts, and types.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_active_tab',
      description: 'Get the currently active terminal tab.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: 'Switch to a different terminal tab.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'The tab ID to switch to.'
          }
        },
        required: ['tabId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: 'Close a terminal tab by its ID. Use this to clean up tabs after a task is finished.',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: 'The tab ID to close.'
          }
        },
        required: ['tabId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_bookmarks',
      description: 'List all saved bookmarks (SSH, Telnet, VNC, etc.).',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_bookmark',
      description: 'Open a saved bookmark as a new terminal tab.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The bookmark ID to open.'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_bookmark',
      description: 'Create a new bookmark. Specify the type and provide type-specific fields. Supported types: ' + Object.keys(bookmarkSchemas).join(', ') + '.',
      parameters: buildAddBookmarkParameters()
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_tab',
      description: 'Open a terminal tab directly with connection parameters without creating a bookmark. Supported types: ' + Object.keys(bookmarkSchemas).join(', ') + '.',
      parameters: buildAddBookmarkParameters()
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_list',
      description: 'List files and directories at a remote path via SFTP. Requires an SSH/FTP tab.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote directory path to list.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_stat',
      description: 'Get file/directory stats (size, permissions, etc.) at a remote path via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote path to stat.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_read_file',
      description: 'Read the contents of a remote file via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file path to read.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_del',
      description: 'Delete a remote file or directory via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file or directory path to delete.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_upload',
      description: 'Upload a local file to a remote server via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          localPath: {
            type: 'string',
            description: 'Local file path to upload.'
          },
          remotePath: {
            type: 'string',
            description: 'Remote destination path.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['localPath', 'remotePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_download',
      description: 'Download a remote file to a local path via SFTP.',
      parameters: {
        type: 'object',
        properties: {
          remotePath: {
            type: 'string',
            description: 'Remote file path to download.'
          },
          localPath: {
            type: 'string',
            description: 'Local destination path.'
          },
          tabId: {
            type: 'string',
            description: 'SSH/FTP tab ID. Omit to use the active tab.'
          }
        },
        required: ['remotePath', 'localPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_transfer_list',
      description: 'List current active SFTP file transfers.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sftp_transfer_history',
      description: 'List past SFTP file transfer history.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_local_file',
      description: '读取本地文件内容（文本文件，最大1MB）。用于查看代码、日志、配置文件。',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string', description: '文件的完整路径' } },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_local_file',
      description: '写入/创建本地文件。自动创建父目录，已存在则覆盖。',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: '文件的完整路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录下的文件和子目录结构。',
      parameters: {
        type: 'object',
        properties: { dirPath: { type: 'string', description: '目录的完整路径' } },
        required: ['dirPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description: '在文件中搜索关键字。支持通配符过滤文件类型。',
      parameters: {
        type: 'object',
        properties: {
          rootPath: { type: 'string', description: '搜索根目录' },
          pattern: { type: 'string', description: '要搜索的关键字或正则' },
          glob: { type: 'string', description: '文件匹配模式如 *.js, *.py（默认所有文件）' }
        },
        required: ['rootPath', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch_page',
      description: '获取网页内容。用于查看文档、API返回、网页信息。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: '完整URL如 https://example.com' } },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'confirm_with_user',
      description: '向用户显示确认对话框，等待用户确认或取消后继续。在修改配置、删文件、重启服务等操作前调用此工具获取用户许可。',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: '向用户展示的确认信息，说明要做什么操作以及风险。'
          }
        },
        required: ['message']
      }
    }
  }
]

export async function executeToolCall (toolName, args) {
  const store = window.store
  switch (toolName) {
    case 'confirm_with_user': {
      const confirmed = await new Promise(resolve => {
        Modal.confirm({
          title: '🤖 AI 需要确认',
          content: args.message || '确认执行此操作吗？',
          okText: '确认',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false)
        })
      })
      return JSON.stringify({ confirmed, message: confirmed ? '用户已确认' : '用户已取消' })
    }
    case 'send_terminal_command': {
      // 高危命令弹窗确认
      const cmd = (args.command || '').trim()
      if (isDangerousCommand(cmd)) {
        const confirmed = await new Promise(resolve => {
          Modal.confirm({
            title: '⚠️ 危险操作确认',
            content: `AI 请求执行高危命令：\n\n\`${cmd}\`\n\n确认执行吗？`,
            okText: '确认执行',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => resolve(true),
            onCancel: () => resolve(false)
          })
        })
        if (!confirmed) {
          return JSON.stringify({ blocked: true, reason: '用户取消了危险操作', command: cmd })
        }
      }
      store.mcpSendTerminalCommand(args)
      const idleResult = await store.mcpWaitForTerminalIdle({
        tabId: args.tabId || store.activeTabId,
        timeout: 30000,
        lines: 100
      })
      return JSON.stringify(idleResult)
    }
    case 'get_terminal_output':
      return JSON.stringify(store.mcpGetTerminalOutput(args))
    case 'open_local_terminal':
      return JSON.stringify(store.mcpOpenLocalTerminal())
    case 'list_tabs':
      return JSON.stringify(store.mcpListTabs())
    case 'get_active_tab':
      return JSON.stringify(store.mcpGetActiveTab())
    case 'switch_tab':
      return JSON.stringify(store.mcpSwitchTab(args))
    case 'close_tab':
      return JSON.stringify(store.mcpCloseTab(args))
    case 'list_bookmarks':
      return JSON.stringify(store.mcpListBookmarks())
    case 'open_bookmark':
      return JSON.stringify(store.mcpOpenBookmark(args))
    case 'add_bookmark': {
      const { type } = args
      const typeFields = args[type] || {}
      return JSON.stringify(await store.mcpAddBookmark({ type, ...typeFields }))
    }
    case 'open_tab': {
      const { type } = args
      const typeFields = args[type] || {}
      return JSON.stringify(store.mcpOpenTab({ type, ...typeFields }))
    }
    case 'sftp_list':
      return JSON.stringify(await store.mcpSftpList(args))
    case 'sftp_stat':
      return JSON.stringify(await store.mcpSftpStat(args))
    case 'sftp_read_file':
      return JSON.stringify(await store.mcpSftpReadFile(args))
    case 'sftp_del':
      return JSON.stringify(await store.mcpSftpDel(args))
    case 'sftp_upload':
      return JSON.stringify(await store.mcpSftpUpload(args))
    case 'sftp_download':
      return JSON.stringify(await store.mcpSftpDownload(args))
    case 'sftp_transfer_list':
      return JSON.stringify(store.mcpSftpTransferList())
    case 'sftp_transfer_history':
      return JSON.stringify(store.mcpSftpTransferHistory())
    // ===== 新工具：文件系统 =====
    case 'read_local_file':
      return await window.pre.runGlobalAsync('readLocalFile', args.filePath)
    case 'write_local_file':
      return await window.pre.runGlobalAsync('writeLocalFile', args.filePath, args.content)
    case 'list_directory':
      return await window.pre.runGlobalAsync('listDirectory', args.dirPath)
    case 'grep_files':
      return await window.pre.runGlobalAsync('grepFiles', args.rootPath, args.pattern, args.glob || '*')
    case 'web_fetch_page':
      return await window.pre.runGlobalAsync('webFetchPage', args.url)
    default: {
      // 检查是否是已安装技能的自定义工具
      const allSkills = getInstalledSkills()
      for (const skill of allSkills) {
        const match = (skill.tools || []).find(t => t.name === toolName || t.function?.name === toolName)
        if (match) {
          return JSON.stringify({ info: `工具 ${toolName} 属于技能「${skill.name}」，请参考技能说明使用`, skill: skill.name })
        }
      }
      throw new Error(`Unknown agent tool: ${toolName}`)
    }
  }
}
