export default function AppDrag (props) {
  return (
    <div style={{ position: 'relative' }}>
      {/* 顶部拖条：只有这一小条可拖动窗口 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 8,
        WebkitAppRegion: 'drag', zIndex: 999
      }} />
      {props.children}
    </div>
  )
}
