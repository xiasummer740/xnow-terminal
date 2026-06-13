/**
 * app upgrade
 */

import { refsStatic } from '../components/common/ref'

export default Store => {
  Store.prototype.onCheckUpdate = (isManual = false) => {
    refsStatic.get('upgrade')?.handleCheckUpdate(isManual)
  }
  Store.prototype.getProxySetting = function () {
    const {
      proxy,
      enableGlobalProxy
    } = window.store.config
    if (!enableGlobalProxy) {
      return ''
    }
    return typeof proxy !== 'string' ? '' : proxy
  }
}
