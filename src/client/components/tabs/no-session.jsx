import LogoElem from '../common/logo-elem.jsx'
import './no-session.styl'

export default function NoSessionPanel ({ height }) {
  return (
    <div className='no-sessions' style={{ height: height + 'px' }}>
      <div className='pd3'>
        <LogoElem />
      </div>
    </div>
  )
}
