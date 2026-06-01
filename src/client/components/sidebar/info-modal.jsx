import {
  GithubOutlined,
  GlobalOutlined,
  HighlightOutlined,
  HomeOutlined,
  UserOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  AlignLeftOutlined,
  BugOutlined,
  HeartOutlined,
  ExportOutlined,
  ImportOutlined,
  CloudDownloadOutlined
} from '@ant-design/icons'
import { Tabs, Button, message, Upload, Space, Modal as AntModal } from 'antd'
import Modal from '../common/modal'
import Link from '../common/external-link'
import LogoElem from '../common/logo-elem'
import RunningTime from './app-running-time'
import { auto } from 'manate/react'
import { useState } from 'react'
import copy from 'json-deep-copy'
import time from '../../common/time'
import download from '../../common/download'

import {
  packInfo,
  infoTabs
} from '../../common/constants'
import { checkSkipSrc } from '../../common/check-skip-src'
import './info.styl'

const e = window.translate

export default auto(function InfoModal (props) {
  const [runtimeEnv, setRuntimeEnv] = useState(null)

  const handleChangeTab = key => {
    window.store.infoModalTab = key
    if (key === infoTabs.env && !runtimeEnv) {
      window.pre.runGlobalAsync('getEnv').then(env => setRuntimeEnv(env))
    }
  }

  const renderCheckUpdate = () => {
    if (window.et.isWebApp || checkSkipSrc(props.installSrc)) {
      return null
    }
    const {
      onCheckUpdate
    } = window.store
    const {
      upgradeInfo
    } = props
    const onCheckUpdating = upgradeInfo.checkingRemoteVersion || upgradeInfo.upgrading
    const { noUpdateMessage, noUpdateMessageExpires } = upgradeInfo
    const showMessage = noUpdateMessage && noUpdateMessageExpires && Date.now() < noUpdateMessageExpires
    return (
      <div className='mg1b mg2t'>
        <Button
          type='primary'
          loading={onCheckUpdating}
          onClick={() => onCheckUpdate(true)}
        >
          {e('checkForUpdate')}
        </Button>
        {showMessage && (
          <span className='mg1l update-msg'>{noUpdateMessage}</span>
        )}
      </div>
    )
  }

  const renderParsed = (obj, depth = 0) => {
    if (Array.isArray(obj)) {
      return (
        <ul className='pd2l'>
          {obj.map((item, i) => (
            <li key={i}>{renderParsed(item, depth + 1)}</li>
          ))}
        </ul>
      )
    } else if (typeof obj === 'object' && obj !== null) {
      return (
        <div className={depth > 0 ? 'pd2l' : ''}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} className='pd1b'>
              <b>{k}:</b> {renderParsed(v, depth + 1)}
            </div>
          ))}
        </div>
      )
    } else {
      return <span>{String(obj)}</span>
    }
  }

  const renderValue = (v) => {
    try {
      const parsed = JSON.parse(v)
      return renderParsed(parsed)
    } catch {
      return <span>{v}</span>
    }
  }

  const renderOSInfo = () => {
    return window.pre.osInfo().map(({ k, v }, i) => (
      <div className='pd1b' key={i + '_os_' + k}>
        <b className='bold'>{k}:</b>
        <span className='mg1l'>
          {renderValue(v)}
        </span>
      </div>
    ))
  }

  const { infoModalTab, commandLineHelp } = props
  const {
    showInfoModal
  } = window.store
  function onCloseAbout () {
    window.store.showInfoModal = false
  }
  if (!showInfoModal) {
    return null
  }
  const {
    name,
    devDependencies,
    dependencies,
    langugeRepo,
    author: {
      name: authorName,
      email,
      url: authorUrl
    },
    homepage,
    bugs: {
      url: bugReportLink
    },
    releases: releaseLink,
    privacyNoticeLink,
    sponsorLink,
    knownIssuesLink
  } = packInfo
  const link = releaseLink.replace('/releases', '')
  const { versions } = window.pre
  const deps = {
    ...devDependencies,
    ...dependencies
  }
  const envs = {
    ...versions,
    ...(runtimeEnv || {})
  }
  const title = (
    <div className='custom-modal-close-confirm-title font16'>
      <InfoCircleOutlined className='font20 mg1r' /> {e('about')} {name}
    </div>
  )
  const attrs = {
    title,
    width: window.innerWidth - 100,
    maskClosable: true,
    onCancel: onCloseAbout,
    open: true,
    wrapClassName: 'info-modal'
  }

  // 一键备份
  const handleExportAll = () => {
    const data = {
      version: packInfo.version,
      exportTime: time(undefined, 'YYYY-MM-DD-HH-mm-ss'),
      bookmarks: copy(window.store.bookmarks || []),
      bookmarkGroups: copy(window.store.bookmarkGroups || []),
      config: copy(window.store.config || {}),
      terminalThemes: copy(window.store.terminalThemes || []),
      addressBookmarks: copy(window.store.addressBookmarks || [])
    }
    const json = JSON.stringify(data, null, 2)
    download('xnow-backup-' + time(undefined, 'YYYY-MM-DD-HH-mm-ss') + '.json', json)
    message.success('备份已下载')
  }

  const handleImportAll = (file) => {
    AntModal.confirm({
      title: '确认导入',
      content: '导入备份将覆盖当前所有书签、分组和配置，确定继续？',
      okText: '确认导入',
      cancelText: '取消',
      onOk: () => {
        const reader = new FileReader()
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result)
            if (data.bookmarks) window.store.bookmarks = data.bookmarks
            if (data.bookmarkGroups) window.store.bookmarkGroups = data.bookmarkGroups
            if (data.config) Object.assign(window.store.config, data.config)
            if (data.terminalThemes) window.store.terminalThemes = data.terminalThemes
            if (data.addressBookmarks) window.store.addressBookmarks = data.addressBookmarks
            message.success('导入成功，请重启应用以完全生效')
          } catch (err) {
            message.error('文件格式错误')
          }
        }
        reader.readAsText(file)
      }
    })
    return false
  }

  const items = [
    {
      key: infoTabs.info,
      label: e('about'),
      children: (
        <>
          <LogoElem />
          <p className='mg2b'>{e('desc')}</p>
          <RunningTime />
          <p className='mg1b'>
            <HomeOutlined /> <b>{e('homepage')}/{e('download')} ➾</b>
            <Link to={homepage} className='mg1l'>
              {homepage}
            </Link>
          </p>
          <p className='mg1b'>
            <UserOutlined /> <b className='mg1r'>{e('author')} ➾</b>
            <Link to={authorUrl} className='mg1l'>
              {authorName} ({email})
            </Link>
          </p>
          <p className='mg1b'>
            <GithubOutlined /> <b className='mg1r'>github ➾</b>
            <Link to={link} className='mg1l'>
              {link}
            </Link>
          </p>
          <p className='mg1b'>
            <GlobalOutlined /> <b className='mg1r'>{e('language')} repo ➾</b>
            <Link to={langugeRepo} className='mg1l'>
              {langugeRepo}
            </Link>
          </p>
          <p className='mg1b'>
            <BugOutlined /> <b className='mg1r'>{e('bugReport')} ➾</b>
            <Link to={bugReportLink} className='mg1l'>
              {bugReportLink}
            </Link>
          </p>
          <p className='mg1b'>
            <HighlightOutlined /> <b className='mg1r'>{e('changeLog')} ➾</b>
            <Link to={releaseLink} className='mg1l'>
              {releaseLink}
            </Link>
          </p>
          <p className='mg1b'>
            <AlignLeftOutlined /> <b className='mg1r'>{e('knownIssues')} ➾</b>
            <Link to={knownIssuesLink} className='mg1l'>
              {knownIssuesLink}
            </Link>
          </p>
          <p className='mg1b'>
            <WarningOutlined /> <b className='mg1r'>{e('privacyNotice')} ➾</b>
            <Link to={privacyNoticeLink} className='mg1l'>
              {privacyNoticeLink}
            </Link>
          </p>
          <p className='mg1b'>
            <HeartOutlined /> <b className='mg1r'>{e('sponsorElecterm')} ➾</b>
            <Link to={sponsorLink} className='mg1l'>
              {sponsorLink}
            </Link>
          </p>
          <p className='mg1b'>
            <InfoCircleOutlined /> <b className='mg1r'>{window.store.installSrc}</b>
          </p>
          {renderCheckUpdate()}
        </>
      )
    },
    {
      key: infoTabs.deps,
      label: e('dependencies'),
      children: Object.keys(deps).map((k, i) => {
        const v = deps[k]
        return (
          <div className='pd1b' key={i + '_dp_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.env,
      label: e('env'),
      children: Object.keys(envs).map((k, i) => {
        const v = envs[k]
        return (
          <div className='pd1b' key={i + '_env_' + k}>
            <b className='bold'>{k}</b>:
            <span className='mg1l'>
              {v}
            </span>
          </div>
        )
      })
    },
    {
      key: infoTabs.os,
      label: e('os'),
      children: <div>{renderOSInfo()}</div>
    },
    {
      key: 'backup',
      label: '备份恢复',
      children: (
        <div style={{ padding: '16px 0' }}>
          <Space direction='vertical' size='middle' style={{ width: '100%' }}>
            <div>
              <h4><CloudDownloadOutlined className='mg1r' />一键全量备份</h4>
              <p style={{ color: '#888', marginBottom: 8 }}>导出所有书签、分组、配置、终端主题为一个 JSON 文件，换电脑时用它恢复。</p>
              <Button type='primary' icon={<ExportOutlined />} onClick={handleExportAll}>导出全部数据</Button>
            </div>
            <div>
              <h4><ImportOutlined className='mg1r' />从备份恢复</h4>
              <p style={{ color: '#888', marginBottom: 8 }}>选择之前导出的 JSON 备份文件，恢复所有数据。恢复后需重启应用。</p>
              <Upload accept='.json' showUploadList={false} beforeUpload={handleImportAll}>
                <Button icon={<ImportOutlined />}>导入备份文件</Button>
              </Upload>
            </div>
          </Space>
        </div>
      )
    }
  ]

  if (!window.et.isWebApp) {
    items.push({
      key: infoTabs.cmd,
      label: e('commandLineUsage'),
      children: (
        <pre>
          <code>{commandLineHelp}</code>
        </pre>
      )
    })
  }

  return (
    <Modal
      {...attrs}
    >
      <div className='about-wrap'>
        <Tabs
          activeKey={infoModalTab}
          onChange={handleChangeTab}
          items={items}
        />
      </div>
    </Modal>
  )
})
