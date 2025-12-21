const fs = require('node:fs')
const path = require('node:path')
const { exec, execFileSync } = require('node:child_process')

function getRegExePath() {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows'
  return path.join(systemRoot, 'System32', 'reg.exe')
}

function regQuery(keyPath) {
  return execFileSync(getRegExePath(), ['query', keyPath], {
    encoding: 'utf-8',
    windowsHide: true,
    // 环境变量（尤其 PATH）可能很长，默认 1MB 容易触发 ENOBUFS
    maxBuffer: 1024 * 1024 * 50
  })
}

function regAdd(scope, name, value) {
  // 写入操作不需要 stdout；保留 stderr 用于权限/错误判断
  return execFileSync(getRegExePath(), ['add', scope, '/v', name, '/t', 'REG_EXPAND_SZ', '/d', value, '/f'], {
    encoding: 'utf-8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 50,
    stdio: ['ignore', 'ignore', 'pipe']
  })
}

function regDelete(scope, name) {
  return execFileSync(getRegExePath(), ['delete', scope, '/v', name, '/f'], {
    encoding: 'utf-8',
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 50,
    stdio: ['ignore', 'ignore', 'pipe']
  })
}

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 读文件
  readFile: function (file) {
    return fs.readFileSync(file, { encoding: 'utf-8' })
  },

  // 文本写入到下载目录
  writeTextFile: function (text) {
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.txt')
    fs.writeFileSync(filePath, text, { encoding: 'utf-8' })
    return filePath
  },

  // 图片写入到下载目录
  writeImageFile: function (base64Url) {
    const matchs = /^data:image\/([a-z]{1,20});base64,/i.exec(base64Url)
    if (!matchs) return
    const filePath = path.join(window.utools.getPath('downloads'), Date.now().toString() + '.' + matchs[1])
    fs.writeFileSync(filePath, base64Url.substring(matchs[0].length), { encoding: 'base64' })
    return filePath
  },

  // ===== 环境变量管理 API =====

  /**
   * 获取所有环境变量
   */
  getEnvVars: function () {
    try {
      // 读取系统环境变量
      const systemResult = regQuery('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
      const systemVars = this._parseRegOutput(systemResult)

      // 读取用户环境变量
      const userResult = regQuery('HKCU\\Environment')
      const userVars = this._parseRegOutput(userResult)

      return {
        systemVars: systemVars.sort(function (a, b) { return a.name.localeCompare(b.name) }),
        userVars: userVars.sort(function (a, b) { return a.name.localeCompare(b.name) })
      }
    } catch (error) {
      console.error('获取环境变量失败:', error)
      throw new Error('获取环境变量失败: ' + error.message)
    }
  },

  /**
   * 解析注册表输出
   */
  _parseRegOutput: function (output) {
    const vars = []
    const lines = output.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      // 跳过空行和标题行
      if (!line || line.startsWith('HKEY_') || line.includes('End of search')) continue

      // 匹配格式: NAME    REG_SZ/REG_EXPAND_SZ    VALUE
      const match = line.match(/^(\S+)\s+(REG_SZ|REG_EXPAND_SZ|REG_MULTI_SZ)\s+(.*)$/)
      if (match) {
        vars.push({
          name: match[1].trim(),
          value: match[3].trim()
        })
      }
    }

    return vars
  },

  /**
   * 设置环境变量
   */
  setEnvVar: function (name, value, isSystem) {
    if (isSystem === undefined) isSystem = false

    try {
      const scope = isSystem ? 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment'
      regAdd(scope, name, value)


      return { success: true }
    } catch (error) {
      console.error('设置环境变量失败:', error)
      const errorMsg = error.message || error.toString()
      // 检查是否是权限问题 - 支持中文和英文错误信息
      if (errorMsg.includes('Access is denied') || errorMsg.includes('拒绝访问') || errorMsg.indexOf('拒绝') !== -1 || errorMsg.includes('denied')) {
        throw new Error('权限不足：修改系统环境变量需要以管理员身份运行 uTools')
      }
      throw new Error('设置环境变量失败: ' + errorMsg)
    }
  },

  /**
   * 删除环境变量
   */
  deleteEnvVar: function (name, isSystem) {
    if (isSystem === undefined) isSystem = false

    try {
      const scope = isSystem ? 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' : 'HKCU\\Environment'
      regDelete(scope, name)


      return { success: true }
    } catch (error) {
      console.error('删除环境变量失败:', error)
      const errorMsg = error.message || error.toString()
      // 检查是否是权限问题 - 支持中文和英文错误信息
      if (errorMsg.includes('Access is denied') || errorMsg.includes('拒绝访问') || errorMsg.indexOf('拒绝') !== -1 || errorMsg.includes('denied')) {
        throw new Error('权限不足：删除系统环境变量需要以管理员身份运行 uTools')
      }
      throw new Error('删除环境变量失败: ' + errorMsg)
    }
  },



  /**
   * 检查是否有管理员权限
   */
  checkAdminPrivileges: function () {
    try {
      // 尝试写入测试以验证真实权限
      const testKey = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
      const testVarName = '_UTOOLS_ADMIN_TEST_'

      // 尝试创建一个测试变量
      execFileSync(getRegExePath(), ['add', testKey, '/v', testVarName, '/t', 'REG_SZ', '/d', 'test', '/f'], {
        encoding: 'utf-8',
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 50,
        stdio: ['ignore', 'ignore', 'pipe']
      })

      // 立即删除测试变量
      execFileSync(getRegExePath(), ['delete', testKey, '/v', testVarName, '/f'], {
        encoding: 'utf-8',
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 50,
        stdio: ['ignore', 'ignore', 'pipe']
      })

      return true
    } catch (error) {
      // 如果写入失败,说明没有管理员权限
      return false
    }
  },

  /**
   * 导出环境变量到文件
   */
  exportEnvVars: function (data, filePath) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
      return { success: true, path: filePath }
    } catch (error) {
      throw new Error('导出失败: ' + error.message)
    }
  },

  /**
   * 导出环境变量（使用默认路径）
   */
  exportEnvVarsWithDefaultPath: function (data, fileName) {
    try {
      const exportPath = window.utools.getPath('documents')
      const filePath = path.join(exportPath, fileName)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' })
      return { success: true, path: filePath }
    } catch (error) {
      throw new Error('导出失败: ' + error.message)
    }
  },

  /**
   * 路径拼接
   */
  joinPath: function () {
    return path.join.apply(path, arguments)
  },

  /**
   * 从文件导入环境变量
   */
  importEnvVars: function (filePath) {
    try {
      const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
      const data = JSON.parse(content)
      return { success: true, data: data }
    } catch (error) {
      throw new Error('导入失败: ' + error.message)
    }
  },

  /**
   * 打开文件夹
   */
  openFolder: function (folderPath) {
    try {
      if (fs.existsSync(folderPath)) {
        exec('explorer "' + folderPath + '"')
        return { success: true }
      } else {
        throw new Error('路径不存在')
      }
    } catch (error) {
      throw new Error('打开文件夹失败: ' + error.message)
    }
  },

  /**
   * 在资源管理器中显示文件
   */
  revealInExplorer: function (filePath) {
    try {
      if (fs.existsSync(filePath)) {
        exec('explorer /select,"' + filePath + '"')
        return { success: true }
      } else {
        throw new Error('文件不存在')
      }
    } catch (error) {
      throw new Error('打开失败: ' + error.message)
    }
  },

  /**
   * 导出JSON配置文件
   */
  exportConfig: function (configData, defaultFileName) {
    if (!defaultFileName) defaultFileName = 'config.json'

    try {
      const savePath = window.utools.showSaveDialog({
        title: '保存配置文件',
        defaultPath: path.join(window.utools.getPath('documents'), defaultFileName),
        buttonLabel: '保存',
        filters: [
          { name: 'JSON文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (savePath) {
        const jsonStr = JSON.stringify(configData, null, 2)
        fs.writeFileSync(savePath, jsonStr, { encoding: 'utf-8' })
        return { success: true, path: savePath }
      }
      return { success: false, message: '用户取消保存' }
    } catch (error) {
      return { success: false, message: error.message }
    }
  },

  /**
   * 导入JSON配置文件
   */
  importConfig: function () {
    try {
      const openPath = window.utools.showOpenDialog({
        title: '选择配置文件',
        defaultPath: window.utools.getPath('documents'),
        buttonLabel: '导入',
        filters: [
          { name: 'JSON文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (openPath && openPath.length > 0) {
        const filePath = openPath[0]
        const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
        const config = JSON.parse(content)
        return { success: true, data: config, path: filePath }
      }
      return { success: false, message: '用户取消选择' }
    } catch (error) {
      return { success: false, message: error.message }
    }
  },

  /**
   * 检查路径是否存在(只检查目录,不检查文件)
   */
  checkPathExists: function (pathStr) {
    try {
      // 去除 file: 前缀
      const cleanPath = pathStr.replace(/^file:/, '')

      // 检查路径是否存在
      if (!fs.existsSync(cleanPath)) {
        return false
      }

      // 只返回 true 如果是目录
      const stat = fs.statSync(cleanPath)
      return stat.isDirectory()
    } catch (error) {
      return false
    }
  },

  /**
   * 判断路径是否为目录(不是文件)
   * 返回 null 表示路径不存在,false 表示是文件,true 表示是目录
   */
  isDirectory: function (pathStr) {
    try {
      const cleanPath = pathStr.replace(/^file:/, '')
      if (!fs.existsSync(cleanPath)) {
        return null // 路径不存在
      }
      const stat = fs.statSync(cleanPath)
      return stat.isDirectory()
    } catch (error) {
      return null
    }
  },

  /**
   * 判断字符串是否为路径格式
   */
  isPathLike: function (str) {
    if (!str || typeof str !== 'string') return false
    // 去除 file: 前缀
    const cleanStr = str.replace(/^file:/, '')
    // Windows路径模式: C:\... 或 \\... 或包含 \ 或 /
    return /^[a-zA-Z]:[\\|/]/.test(cleanStr) || /^\\\\/.test(cleanStr) || cleanStr.includes('\\') || (cleanStr.includes('/') && !cleanStr.includes('://'))
  }
}
