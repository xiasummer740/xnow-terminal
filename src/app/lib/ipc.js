	    // ===== 远程命令执行（用于部署哪吒） =====
	    execSshCommand: async (opts) => {
	      const { Client } = require('@electerm/ssh2')
	      const host = opts.host || opts.ipv4
	      const port = opts.port || 22
	      const username = opts.username || 'root'
	      const timeout = opts.timeout || 60000

	      return new Promise((resolve, reject) => {
	        let settled = false
	        const conn = new Client()
	        const timer = setTimeout(() => {
	          if (settled) return
	          settled = true
	          conn.end()
	          reject(new Error('SSH 连接超时'))
	        }, timeout)

	        conn.on('ready', () => {
	          if (settled) return
	          clearTimeout(timer)
	          conn.exec(opts.command, (err, stream) => {
	            if (err) {
	              conn.end()
	              if (settled) return
	              settled = true
	              return reject(err)
	            }
	            let output = ''
	            stream.on('data', (data) => { output += data.toString() })
	            stream.stderr.on('data', (data) => { output += data.toString() })
	            stream.on('close', (code) => {
	              conn.end()
	              if (settled) return
	              settled = true
	              resolve(output.trim())
	            })
	          })
	        })

	        conn.on('error', (err) => {
	          if (settled) return
	          settled = true
	          clearTimeout(timer)
	          reject(err)
	        })

	        conn.connect({
	          host,
	          port,
	          username,
	          password: opts.password,
	          privateKey: opts.privateKey,
	          readyTimeout: timeout,
	          keepaliveInterval: 0
	        })
	      })
	    },
	    // ===== 签发哪吒 JWT（用 Dashboard 的 jwt_secret_key） =====
	    signNezhaJwt: (secret) => {
	      const jwt = require('jsonwebtoken')
	      return jwt.sign({
	        id: 1,
	        username: 'admin@xnow.tech',
	        role: 1
	      }, secret, { expiresIn: '1h' })
	    },