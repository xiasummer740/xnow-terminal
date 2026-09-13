/**
 * 【零引用 · 有意保留】ISSUES #34 —— 别当废代码删。
 * 继承自上游 electerm，删掉只会在将来合并上游时多出无谓冲突（与 #51 同一口径）。
 * 祥哥 2026-09-13 拍板：全部保留，不删。
 * 详见 ISSUES.md #34。
 */
import React from 'react'
import writeEmitter from 'manate/events/write-emitter'
import { run } from 'manate/utils'

export class Component extends React.Component {
  constructor (props) {
    super(props)
    this.isTrigger = null
    this.originalRender = this.render
    this.render = this.autoRender

    const originalDidMount = this.componentDidMount
    this.componentDidMount = () => {
      writeEmitter.on(this.handleWrite)
      if (originalDidMount) {
        originalDidMount.call(this)
      }
    }

    const originalWillUnmount = this.componentWillUnmount
    this.componentWillUnmount = () => {
      writeEmitter.off(this.handleWrite)
      if (originalWillUnmount) {
        originalWillUnmount.call(this)
      }
    }
  }

  handleWrite = (writeLog) => {
    if (this.isTrigger && this.isTrigger(writeLog)) {
      this.forceUpdate()
    }
  }

  autoRender = () => {
    const [element, isTrigger] = run(() => {
      return this.originalRender()
    })
    this.isTrigger = isTrigger
    return element
  }
}
