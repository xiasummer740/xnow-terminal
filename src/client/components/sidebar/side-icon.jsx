import classNames from 'classnames'

export default function SideIcon (props) {
  const {
    show,
    className,
    title = '',
    active,
    children,
    onClick
  } = props
  if (show === false) {
    return null
  }
  const cls = classNames(className, 'control-icon-wrap', {
    active
  })
  return (
    <div
      className={cls}
      title={title}
      onClick={onClick}
    >
      {children}
      <div className='control-icon-label'>{title}</div>
    </div>
  )
}
