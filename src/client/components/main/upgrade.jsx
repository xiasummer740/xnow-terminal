import { PureComponent } from 'react'
import { CloseOutlined, MinusSquareOutlined, UpCircleOutlined } from '@ant-design/icons'
import { Button, Select, Space } from 'antd'
import {
  getLatestReleaseInfo,
  getLatestReleaseVersion,
  clearReleaseCache,
} from '../../common/update-check'
import upgrade from '../../common/upgrade'
import compare from '../../common/version-compare'
import Link from '../common/external-link'
import { isMac, isWin, packInfo, downloadUpgradeTimeout } from '../../common/constants'
import { checkSkipSrc } from '../../common/check-skip-src'
import { debounce } from 'lodash-es'
import newTerm from '../../common/new-terminal'
import Markdown from '../common/markdown'
import downloadMirrors from '../../common/download-mirrors'
import { refsStatic } from '../common/ref'
import message from '../common/message'
import './upgrade.styl'

const e = window.translate
const { homepage } = packInfo

const downloadMirrorList = ['github', 'gh-proxy', 'sourceforge', 'r2']

export default class Upgrade extends PureComponent {
  state = {
    mirror: downloadMirrorList[1],
  }

  downloadTimer = null

  componentDidMount() {
    if (window.et.isWebApp) {
      return
    }
    this.id = 'upgrade'
    refsStatic.add(this.id, this)
    this.cleanupTimer = setInterval(() => {
      const { noUpdateMessageExpires } = window.store.upgradeInfo
      if (noUpdateMessageExpires && Date.now() > noUpdateMessageExpires) {
        window.store.upgradeInfo.noUpdateMessage = ''
        window.store.upgradeInfo.noUpdateMessageExpires = 0
      }
    }, 1000)
  }

  componentWillUnmount() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    clearTimeout(this.downloadTimer)
    this.update?.destroy()
  }

  appUpdateCheck = (isManual) => {
    this.getLatestRelease(isManual)?.catch(() => {})
  }

  changeProps = (update) => {
    Object.assign(window.store.upgradeInfo, update)
  }

  handleMinimize = () => {
    this.changeProps({
      showUpgradeModal: false,
    })
    window.store.focus()
  }

  handleClose = () => {
    this.changeProps({
      showUpgradeModal: false,
      shouldUpgrade: false,
      error: '',
    })
  }

  handleMirrorChange = (mirror) => {
    this.setState({
      mirror,
    })
  }

  onData = (upgradePercent) => {
    clearTimeout(this.downloadTimer)
    if (upgradePercent >= 100) {
      this.update && this.update.destroy()
      return this.handleClose()
    }
    this.changeProps({
      upgradePercent,
    })
  }

  onError = (e) => {
    this.changeProps({
      error: e.message,
    })
  }

  cancel = () => {
    this.update && this.update.destroy()
    this.changeProps({
      upgrading: false,
      upgradePercent: 0,
    })
  }

  timeout = () => {
    this.cancel()
    message.error('Download timeout, please try again')
  }

  onEnd = () => {
    this.handleClose()
  }

  doUpgrade = debounce(async () => {
    const { installSrc } = this.props
    if (!isMac && !isWin && installSrc === 'npm') {
      return window.store.addTab({
        ...newTerm(undefined, true),
        runScripts: [
          {
            script: 'npm install -g xnow-terminal',
            delay: 500,
          },
        ],
      })
    }
    this.changeProps({
      upgrading: true,
    })
    const proxy = window.store.getProxySetting()
    this.update = await upgrade({
      mirror: this.state.mirror,
      proxy,
      onData: this.onData,
      onEnd: this.onEnd,
      onError: this.onError,
    })
    this.downloadTimer = setTimeout(this.timeout, downloadUpgradeTimeout)
  }, 100)

  handleSkipVersion = () => {
    window.store.setConfig({
      skipVersion: this.props.upgradeInfo.remoteVersion,
    })
    this.handleClose()
  }

  getLatestRelease = async (isManual = false) => {
    const { installSrc } = this.props
    if (checkSkipSrc(installSrc)) {
      return
    }
    // 手动检查时跳过缓存
    if (isManual) {
      clearReleaseCache()
    }
    this.changeProps({
      checkingRemoteVersion: true,
      error: '',
    })
    const releaseVer = await getLatestReleaseVersion()
    this.changeProps({
      checkingRemoteVersion: false,
    })
    // 检查是否返回了错误信息
    if (releaseVer?.error) {
      return this.changeProps({
        error: releaseVer.error,
      })
    }
    // 已是最新版本
    if (releaseVer?.upToDate) {
      if (isManual) {
        this.changeProps({
          noUpdateMessage: e('noNeed'),
          noUpdateMessageExpires: Date.now() + 3000,
        })
      }
      return
    }
    const { skipVersion = 'v0.0.0' } = this.props
    const currentVer = 'v' + window.et.version.split('-')[0]
    const latestVer = releaseVer.tag_name
    if (!isManual && compare(skipVersion, latestVer) >= 0) {
      return
    }
    const shouldUpgrade = compare(currentVer, latestVer) < 0
    if (!shouldUpgrade) {
      if (isManual) {
        this.changeProps({
          noUpdateMessage: e('noNeed'),
          noUpdateMessageExpires: Date.now() + 3000,
        })
      }
      return
    }
    const canAutoUpgrade = installSrc || isWin || isMac
    let releaseInfo
    if (canAutoUpgrade) {
      releaseInfo = await getLatestReleaseInfo()
    }
    this.changeProps({
      shouldUpgrade,
      releaseInfo,
      remoteVersion: latestVer,
      canAutoUpgrade,
      showUpgradeModal: true,
    })
  }

  renderError = (err) => {
    return (
      <div className="upgrade-panel">
        <div className="upgrade-panel-title fix">
          <span className="fleft">
            {e('fail')}: {err}
          </span>
          <span className="fright">
            <CloseOutlined
              className="pointer font16 close-upgrade-panel"
              onClick={this.handleClose}
            />
          </span>
        </div>
        <div className="upgrade-panel-body">
          You can visit
          <Link to={homepage} className="mg1x">
            {homepage}
          </Link>{' '}
          to download new version.
        </div>
      </div>
    )
  }

  renderChangeLog = () => {
    const { releaseInfo } = this.props.upgradeInfo
    if (!releaseInfo) {
      return null
    }
    return (
      <div className="pd1t">
        <div className="bold">Changelog:</div>
        <Markdown text={releaseInfo.body} />
        <Link to={packInfo.releases}>{e('moreChangeLog')}</Link>
      </div>
    )
  }

  renderSkipVersion = () => {
    return (
      <Button onClick={this.handleSkipVersion} icon={<CloseOutlined />} className="mg1l mg1b">
        {e('skipThisVersion')}
      </Button>
    )
  }

  renderLinks = () => {
    const { releaseInfo } = this.props.upgradeInfo
    const url =
      releaseInfo?.html_url || 'https://github.com/xiasummer740/xnow-terminal/releases/latest'
    return (
      <div>
        <p>
          下载地址：
          <Link to={url} className="mg1l">
            GitHub Releases
          </Link>
        </p>
        {this.renderChangeLog()}
      </div>
    )
  }

  renderUpgradeContent = () => {
    const { remoteVersion, releaseInfo } = this.props.upgradeInfo
    return (
      <div>
        <p style={{ color: '#888' }}>当前已是最新版本，可手动检查更新。</p>
        <div className="pd1t">{this.renderLinks()}</div>
      </div>
    )
  }

  renderUpgradePanel = () => {
    const { remoteVersion, releaseInfo, showUpgradeModal } = this.props.upgradeInfo
    const cls = showUpgradeModal
      ? 'animate upgrade-panel'
      : 'animate upgrade-panel upgrade-panel-hide'
    return (
      <div className={cls}>
        <div className="upgrade-panel-title fix">
          <span className="fleft">
            {e('newVersion')}{' '}
            <b>
              {remoteVersion} [{releaseInfo.date}]
            </b>
          </span>
          <span className="fright">
            <MinusSquareOutlined
              className="pointer font16 close-upgrade-panel"
              onClick={this.handleMinimize}
            />
          </span>
        </div>
        <div className="upgrade-panel-body">{this.renderUpgradeContent()}</div>
      </div>
    )
  }

  render() {
    const { shouldUpgrade, checkingRemoteVersion, error } = this.props.upgradeInfo
    if (error) {
      return this.renderError(error)
    }
    if (!shouldUpgrade) {
      return null
    }
    if (checkingRemoteVersion) {
      return null
    }
    return this.renderUpgradePanel()
  }
}
