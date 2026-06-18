import { PureComponent } from 'react'
import { CloseOutlined, DownloadOutlined, MinusSquareOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import {
  getLatestReleaseInfo,
  getLatestReleaseVersion,
  clearReleaseCache
} from '../../common/update-check'
import upgrade from '../../common/upgrade'
import compare from '../../common/version-compare'
import Link from '../common/external-link'
import { isMac, isWin, packInfo, downloadUpgradeTimeout } from '../../common/constants'
import { checkSkipSrc } from '../../common/check-skip-src'
import { debounce } from 'lodash-es'
import newTerm from '../../common/new-terminal'
import Markdown from '../common/markdown'
import { refsStatic } from '../common/ref'
import message from '../common/message'
import './upgrade.styl'

const e = window.translate
const { homepage } = packInfo

const downloadMirrorList = ['github', 'gh-proxy', 'sourceforge', 'r2']

export default class Upgrade extends PureComponent {
  state = {
    mirror: downloadMirrorList[3]
  }

  downloadTimer = null

  componentDidMount () {
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

  componentWillUnmount () {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    clearTimeout(this.downloadTimer)
    this.update?.destroy()
  }

  handleCheckUpdate = (isManual) => {
    window.pre.runGlobalAsync('autoUpdaterCheck')
  }

  changeProps = (update) => {
    Object.assign(window.store.upgradeInfo, update)
  }

  handleMinimize = () => {
    this.changeProps({
      showUpgradeModal: false
    })
    window.store.focus()
  }

  handleClose = () => {
    this.changeProps({
      showUpgradeModal: false,
      shouldUpgrade: false,
      error: ''
    })
  }

  handleMirrorChange = (mirror) => {
    this.setState({
      mirror
    })
  }

  onData = (upgradePercent) => {
    clearTimeout(this.downloadTimer)
    if (upgradePercent >= 100) {
      this.update && this.update.destroy()
      return this.handleClose()
    }
    this.changeProps({
      upgradePercent
    })
  }

  onError = (e) => {
    clearTimeout(this.downloadTimer)
    // All mirrors exhausted — show manual download link
    if (e.message === 'ALL_MIRRORS_FAILED') {
      this.cancel()
      this.changeProps({
        error: '',
        showManualDownload: true,
        downloadUrl: e.downloadUrl || 'https://github.com/xiasummer740/xnow-terminal/releases/latest'
      })
      return
    }
    this.cancel()
    this.changeProps({
      error: e.message
    })
  }

  cancel = () => {
    clearTimeout(this.downloadTimer)
    this.update && this.update.destroy()
    this.changeProps({
      upgrading: false,
      upgradePercent: 0
    })
  }

  timeout = () => {
    this.cancel()
    message.error('Download timeout, please try again')
  }

  onEnd = () => {
    clearTimeout(this.downloadTimer)
    this.update && this.update.destroy()
    this.handleClose()
  }

  doUpgrade = debounce(async () => {
    // electron-updater 下载
    window.pre.runGlobalAsync('autoUpdaterDownload')
  }, 100)

  handleSkipVersion = () => {
    window.store.setConfig({
      skipVersion: this.props.upgradeInfo.remoteVersion
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
      error: ''
    })
    const releaseVer = await getLatestReleaseVersion()
    this.changeProps({
      checkingRemoteVersion: false
    })
    // 检查是否返回了错误信息
    if (releaseVer?.error) {
      return this.changeProps({
        error: releaseVer.error
      })
    }
    // 已是最新版本
    if (releaseVer?.upToDate) {
      if (isManual) {
        this.changeProps({
          noUpdateMessage: '当前已是最新版本 v' + window.et.version.split('-')[0],
          noUpdateMessageExpires: Date.now() + 3000
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
          noUpdateMessage: '当前已是最新版本 v' + window.et.version.split('-')[0],
          noUpdateMessageExpires: Date.now() + 3000
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
      showUpgradeModal: true
    })
  }

  renderError = (err) => {
    return (
      <div className='upgrade-panel'>
        <div className='upgrade-panel-title fix'>
          <span className='fleft'>
            {e('fail')}: {err}
          </span>
          <span className='fright'>
            <CloseOutlined
              className='pointer font16 close-upgrade-panel'
              onClick={this.handleClose}
            />
          </span>
        </div>
        <div className='upgrade-panel-body'>
          You can visit
          <Link to={homepage} className='mg1x'>
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
      <div className='pd1t'>
        <div className='bold'>Changelog:</div>
        <Markdown text={releaseInfo.body} />
        <Link to={packInfo.releases}>{e('moreChangeLog')}</Link>
      </div>
    )
  }

  renderSkipVersion = () => {
    return (
      <Button onClick={this.handleSkipVersion} icon={<CloseOutlined />} className='mg1l mg1b'>
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
          <Link to={url} className='mg1l'>
            GitHub Releases
          </Link>
        </p>
        {this.renderChangeLog()}
      </div>
    )
  }

  renderUpgradeContent = () => {
    const { downloading, percent, readyToInstall } = this.props.upgradeInfo
    if (downloading) {
      return (
        <div style={{ padding: '12px 0' }}>
          <p style={{ marginBottom: 8, color: '#888' }}>正在下载更新...</p>
          <div style={{
            width: '100%', height: 6, background: '#333', borderRadius: 3, overflow: 'hidden'
          }}>
            <div style={{
              width: (percent || 0) + '%', height: '100%',
              background: 'linear-gradient(90deg, #52c41a, #73d13d)',
              borderRadius: 3, transition: 'width 0.3s'
            }} />
          </div>
          <p style={{ marginTop: 6, fontSize: 12, color: '#888' }}>{percent || 0}%</p>
        </div>
      )
    }
    if (readyToInstall) {
      return (
        <div>
          <p style={{ color: '#52c41a', marginBottom: 12 }}>更新已下载完成！</p>
          <Button type='primary' onClick={() => window.pre.runGlobalAsync('autoUpdaterInstall')}>
            立即安装并重启
          </Button>
        </div>
      )
    }
    return (
      <div>
        <p style={{ color: '#888' }}>新版本可用，点击下载更新。</p>
        <div className='pd1t'>
          <Button type='primary' onClick={() => this.doUpgrade()} icon={<DownloadOutlined />}>
            下载更新
          </Button>
        </div>
        <div className='pd1t'>{this.renderLinks()}</div>
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
        <div className='upgrade-panel-title fix'>
          <span className='fleft'>
            {e('newVersion')}{' '}
            <b>
              {remoteVersion} [{releaseInfo.date}]
            </b>
          </span>
          <span className='fright'>
            <MinusSquareOutlined
              className='pointer font16 close-upgrade-panel'
              onClick={this.handleMinimize}
            />
          </span>
        </div>
        <div className='upgrade-panel-body'>{this.renderUpgradeContent()}</div>
      </div>
    )
  }

  renderManualDownload = () => {
    const { downloadUrl } = this.props.upgradeInfo
    return (
      <div className='upgrade-panel'>
        <div className='upgrade-panel-title fix'>
          <span className='fleft'>下载失败</span>
          <span className='fright'>
            <CloseOutlined
              className='pointer font16 close-upgrade-panel'
              onClick={this.handleClose}
            />
          </span>
        </div>
        <div className='upgrade-panel-body'>
          <p style={{ color: '#ff4d4f', marginBottom: 12 }}>
            自动下载失败，请手动下载安装：
          </p>
          <p>
            <Link to={downloadUrl} className='mg1x'>
              <DownloadOutlined style={{ marginRight: 6 }} />
              点击下载 v{this.props.upgradeInfo.remoteVersion} 安装包
            </Link>
          </p>
          <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
            下载完成后手动安装，之后即可使用一键升级。
          </p>
          <Button size='small' onClick={this.handleCheckUpdate} style={{ marginTop: 8 }}>
            检查更新
          </Button>
        </div>
      </div>
    )
  }

  render () {
    const { shouldUpgrade, checking, error, showManualDownload } = this.props.upgradeInfo
    if (showManualDownload) {
      return this.renderManualDownload()
    }
    if (error) {
      return this.renderError(error)
    }
    if (checking) {
      return null
    }
    if (!shouldUpgrade) {
      return null
    }
    return this.renderUpgradePanel()
  }
}
