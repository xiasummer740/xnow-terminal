import { Modal } from 'antd'
import { z } from '../../common/zod'
import { bookmarkSchemas } from '../../common/bookmark-schemas'
import { isDangerousCommand } from '../../common/dangerous-command'

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
      name: 'get_terminal_selection',
      description: '读取用户在终端里**手动选中**的那段文字（用户说「我选中的这个」「这段」时用）。不是选中状态就返回空。',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: '终端标签页 ID。省略则用当前活动标签页。'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_terminal_idle',
      description: '等终端输出停下来（命令跑完）再读结果。跑耗时命令后不要用固定 sleep，用这个。最长等 120 秒。',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: '终端标签页 ID。省略则用当前活动标签页。'
          },
          timeout: {
            type: 'number',
            description: '最长等待毫秒数，默认 30000，上限 120000。'
          },
          lines: {
            type: 'number',
            description: '停止后返回多少行输出，默认 50。'
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
      name: 'reload_tab',
      description: '重新连接/刷新一个标签页（断线重连时用）。注意这会中断该标签页上正在跑的命令。',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: '标签页 ID。省略则用当前活动标签页。'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_tab',
      description: '复制一个标签页（用相同的连接参数开一个新标签页）。开同一台机器的第二个窗口时用这个，比重新建书签快。',
      parameters: {
        type: 'object',
        properties: {
          tabId: {
            type: 'string',
            description: '要复制的标签页 ID（必填，没有默认值）。'
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
      name: 'get_bookmark',
      description: '按 ID 读取单个书签的完整信息（含 SSH/Telnet 等类型专属字段）。改书签前先用它确认当前值。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '书签 ID。'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_bookmark',
      description: '修改已有书签的字段（部分更新，只传要改的字段，其余保持不变）。先用 get_bookmark 查到 id 和当前值。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '要修改的书签 ID。'
          },
          updates: {
            type: 'object',
            description: '要更新的字段，例如 {"title":"新名字"} 或 {"port":2222}。只写需要改的键。'
          }
        },
        required: ['id', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_bookmark',
      description: '删除一个书签。删除不可撤销，调用前必须先用 get_bookmark 确认 id 对应的确实是用户想删的那个，并在回复里说明删了什么。',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: '要删除的书签 ID。'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_bookmark_groups',
      description: '列出所有书签分组（树形，含各组 id、标题、层级和父子关系）。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_bookmark_group',
      description: '新建一个书签分组。传 parentId 会建在该分组下（成为第二级），不传则建在顶层。',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '分组名称。'
          },
          parentId: {
            type: 'string',
            description: '父分组 ID。省略则建在顶层。'
          }
        },
        required: ['title']
      }
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
      name: 'zmodem_upload',
      description: '通过 ZMODEM（rz/sz）在终端里上传本地文件到远端。目标机器要装了 rz/sz 或 trzsz。会绕过文件选择框，直接用你给的路径。',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: '要上传的本地文件完整路径列表（至少一个）。'
          },
          tabId: {
            type: 'string',
            description: '终端标签页 ID。省略则用当前活动标签页。'
          },
          protocol: {
            type: 'string',
            enum: ['rzsz', 'trzsz'],
            description: '传输协议，默认 rzsz（用 rz 命令）。'
          }
        },
        required: ['files']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zmodem_download',
      description: '通过 ZMODEM（sz/tsz）把远端文件下载到本地目录。会绕过文件夹选择框，直接用你给的本地目录。',
      parameters: {
        type: 'object',
        properties: {
          remoteFiles: {
            type: 'array',
            items: { type: 'string' },
            description: '远端文件路径列表（至少一个）。'
          },
          saveFolder: {
            type: 'string',
            description: '本地保存目录的完整路径（必填）。'
          },
          tabId: {
            type: 'string',
            description: '终端标签页 ID。省略则用当前活动标签页。'
          },
          protocol: {
            type: 'string',
            enum: ['rzsz', 'trzsz'],
            description: '传输协议，默认 rzsz（用 sz 命令）。'
          }
        },
        required: ['remoteFiles', 'saveFolder']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_settings',
      description: '读取应用当前设置（不含 API 密钥等敏感项）。回答「我的主题是什么」「同步开了吗」这类问题时用。',
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
    case 'get_terminal_selection':
      return JSON.stringify(store.mcpGetTerminalSelection(args))
    case 'wait_for_terminal_idle':
      return JSON.stringify(await store.mcpWaitForTerminalIdle(args))
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
    case 'reload_tab':
      return JSON.stringify(store.mcpReloadTab(args))
    case 'duplicate_tab':
      return JSON.stringify(store.mcpDuplicateTab(args))
    case 'list_bookmarks':
      return JSON.stringify(store.mcpListBookmarks())
    case 'open_bookmark':
      return JSON.stringify(store.mcpOpenBookmark(args))
    case 'add_bookmark': {
      const { type } = args
      const typeFields = args[type] || {}
      return JSON.stringify(await store.mcpAddBookmark({ type, ...typeFields }))
    }
    case 'get_bookmark':
      return JSON.stringify(store.mcpGetBookmark(args))
    case 'edit_bookmark':
      return JSON.stringify(store.mcpEditBookmark(args))
    case 'delete_bookmark':
      return JSON.stringify(store.mcpDeleteBookmark(args))
    case 'list_bookmark_groups':
      return JSON.stringify(store.mcpListBookmarkGroups())
    case 'add_bookmark_group':
      return JSON.stringify(await store.mcpAddBookmarkGroup(args))
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
    case 'zmodem_upload':
      return JSON.stringify(store.mcpZmodemUpload(args))
    case 'zmodem_download':
      return JSON.stringify(store.mcpZmodemDownload(args))
    case 'get_settings':
      return JSON.stringify(store.mcpGetSettings())
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
    default:
      // 曾经这里会去技能表里找一圈，找到就回一句「请参考技能说明使用」（ISSUES #36）。
      // 那段已经删掉：技能工具不再报给模型了（见 agent.js 的 callBackendAIchatWithTools），
      // 模型不可能合法地调到一个技能工具 —— 落到这里只剩"模型编了个工具名"，
      // 那就照实说不知道，别再回一句会让人以为"其实能用"的话。
      throw new Error(`Unknown agent tool: ${toolName}`)
  }
}
