/**
 * load font list after start
 */

const log = require('../common/log')

exports.loadFontList = () => {
  return require('font-list').getFonts()
    .then(fonts => {
      return fonts.map(f => f.replace(/"/g, ''))
    })
    .catch(err => {
      log.error('加载字体列表出错')
      log.error(err)
      return []
    })
}
