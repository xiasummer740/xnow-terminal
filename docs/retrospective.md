# 右侧面板系统 — 开发复盘

## 问题回顾

将 AI 浮窗改为右侧停靠面板 + 新增 VPS 信息面板，共经历多轮修改，反复失败。

## 各轮问题根因

### 第一轮：面板黑屏不显示
- **根因**：`RightPanelContainer` 没包 `auto()`，store 属性变化不触发重渲染
- **修复**：加 `auto()` 包裹
- **教训**：任何读 store 的组件必须 `auto()` 包裹

### 第二轮：面板顺序反了
- **根因**：CSS `flex-direction: row-reverse` 导致 AI 面板在左、VPS 在右
- **修复**：改为 `flex-direction: row`
- **教训**：布局方向先确认再写代码

### 第三轮：Info 按钮失效
- **根因**：删了 RightSidePanel 但没更新 `openInfoPanel()`
- **修复**：改为切换 VPS 面板
- **教训**：替换组件必须 grep 所有引用点

### 第四轮：AI 面板挡住 Info 按钮
- **根因**：面板 `bottom: 0` 覆盖了底部 footer
- **修复**：改为 `bottom: 36px`
- **教训**：定位时考虑 Footer 高度

### 第五轮：VPS 弹出后又关闭（未解决）
- **根因**：**至今未定位到**
- **尝试的方案**：
  1. `addTab` 直接设置 `rightPanelVPSVisible = true` → 被关
  2. `watch.js` autoRun → 追踪循环
  3. RightPanelContainer `useEffect` → 时机不对
  4. 轮询 300ms 保护 → 组件卸载定时器消失
  5. CSS `display:none` 保持组件常驻 → 仍然被关
  6. 计算属性代替 flag → 仍然失败
- **可能原因**（未证实）：
  - 标签连接过程中 `activeTabId` 多次变化，最终指向一个无 `host` 的标签
  - 某个数据库或状态同步操作覆盖了 store 属性

### 附加问题
- **清屏按钮失效**：`AIPanel` 没包 `auto()`，`aiChatHistory` 变化不重渲染
- **AI 输入无响应**：同上
- **窗口展开/收缩**：`resizeWindow` IPC + `innerWidth` 同步时机复杂

## 后续原则

1. **一次只改 1-2 个文件**，改完验证再改下一个
2. **先确认 feedback loop**（明确怎么测、预期什么结果），再动手
3. **同一问题改 2 次还不行，换方案**，不堆叠补丁
4. **复杂功能先写计划**，尤其涉及多个组件协作的
5. **质量 checklist** 必须逐项打勾才能交工
