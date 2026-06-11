# XNOW Terminal 技能商店 — 第二阶段 UI 设计

> 基于 `2025-06-11-xnow-terminal-skill-store-design.md` 的 Phase 2 详细设计

## 概述

实现技能商店的完整用户界面，让用户能浏览、安装、卸载和管理 AI 技能。

## 架构

```
AI Chat 面板 (ai-chat.jsx)
  └─ 📦 技能商店按钮 → store.showSkillStoreModal = true
       └─ SkillStoreModal (新组件)
            ├─ Tab: 技能商店 (SkillStoreTab)
            │    ├─ 分类栏 + 搜索 + 排序
            │    └─ 技能卡片网格 (3列)
            ├─ Tab: 已安装 (InstalledSkillsTab)
            │    └─ 已安装列表 (含卸载/更新按钮)
            └─ InstallConfirmModal (安装确认弹窗)
                 ├─ 技能信息
                 ├─ 权限列表 (风险等级色标)
                 └─ 代码预览 (可折叠)
```

## 入口点

在 `ai-chat.jsx` 的 AI 聊天工具栏中，设置齿轮图标旁添加一个「📦 技能商店」按钮（`ShopOutlined` 或自定义图标）。

点击后设置 `window.store.showSkillStoreModal = true`，触发 `SkillStoreModal` 渲染。

## 组件设计

### 1. SkillStoreModal

| 属性 | 值 |
|------|-----|
| 文件 | `src/client/components/ai/skill-store-modal.jsx` |
| 样式 | `src/client/components/ai/skill-store.styl` |
| 使用 Modal 组件 | `import Modal from '../common/modal'` |
| 宽度 | `80%`（同 AI Config Modal） |
| Tabs | antd `Tabs` 组件，两个 Tab：「🛒 技能商店」「📦 已安装」 |

Store 新增状态：
- `showSkillStoreModal: boolean` — 控制弹窗显隐
- `toggleSkillStore()` — 切换方法

### 2. SkillStoreTab（商店浏览）

**分类栏**：使用 antd `Segmented` 或自定义按钮组：
- 🏠 全部 / 🔧 运维 / 📊 监控 / 🔄 部署 / 🔒 安全 / 📁 文件 / 🤖 AI

**搜索框**：antd `Input.Search`，placeholder="搜索技能..."

**排序**：下拉选择「按热度」「按名称」「按评分」

**技能卡片**：3 列网格（antd `Row` + `Col` span={8}），每张卡片包含：
- 技能名称（粗体）
- 描述（一行截断）
- 版本号
- 评分（⭐⭐⭐ 文本模拟）
- 分类标签（小标签）
- 操作按钮：「安装」（primary）或「✓ 已安装」（禁用样式）

**数据来源**：`getAllAvailableSkills()` 从 skill-manager 获取

### 3. InstalledSkillsTab（已安装管理）

列表形式展示所有已安装技能：
- 技能名称 + 版本号
- 简短描述
- 来源标记（内置/市场/AI）
- 权限摘要（带风险色标的图标列表）
- 操作：[卸载] 或 [有更新] 按钮

**数据来源**：`getInstalledSkills()` + `loadIndex()` 从 skill-manager 获取

### 4. InstallConfirmModal（安装确认）

调用 `Modal.confirm()` 或自定义 Modal，展示：
- 技能名称 + 版本 + 作者
- 签名状态（✅/⚠️ 标签）
- 完整描述
- 权限列表：每个权限一行，带 🔑 图标和风险等级色标（红/黄/绿）
- 代码预览：antd `Collapse` 可折叠面板，展示技能 JSON
- 按钮：[取消] / [确认安装]

确认后调用 `installSkill(skill)` 并刷新列表。

### 5. 卸载确认

使用 antd `Popconfirm` 组件：「确定卸载该技能吗？」→ 确认后调用 `uninstallSkill(id)` 刷新。

## 数据流

```
用户点击 [📦] → store.showSkillStoreModal = true
  → SkillStoreModal 渲染
    → SkillStoreTab: getAllAvailableSkills() → 分类/搜索/排序 → 渲染卡片
    → InstalledSkillsTab: getInstalledSkills() → 渲染列表

用户点击 [安装] → InstallConfirmModal 展示权限
  → 用户确认 → installSkill(skill) → 刷新列表

用户点击 [卸载] → Popconfirm 确认
  → 确认 → uninstallSkill(id) → 刷新列表

关闭弹窗 → store.showSkillStoreModal = false
```

## Store 改动

`src/client/store/init-state.js`：
```js
showSkillStoreModal: false,    // 新增
```

`src/client/store/common.js` 新增方法：
```js
Store.prototype.toggleSkillStore = function () {
  this.showSkillStoreModal = !this.showSkillStoreModal
}
```

## 样式规范

遵循现有 AI 面板的暗色主题风格（参考 `ai.styl`）：
- 卡片背景：`#1a1a2e` 或类似深色底色
- 边框：细边框 `1px solid rgba(255,255,255,0.08)`
- 悬停效果：亮度提升或边框发光
- 权限等级色标：🔴 `#ff4d4f` / 🟡 `#faad14` / 🟢 `#52c41a`
- 已安装标签：绿色勾 ✓
- 安装按钮：antd `type="primary"`

## 内置技能列表扩容

在 `BUILTIN_SKILLS` 中补充 Phase 1 设计文档定义的 6 个技能：
1. 一键备份（已有）
2. 日志分析 — 新增
3. 网站监控 — 新增
4. 批量部署 — 新增
5. 端口扫描 — 新增
6. AI 代码审查 — 新增

## 验证条件

1. 📦 按钮在 AI 聊天工具栏可见，点击弹出技能商店 Modal
2. 商店 Tab 展示全部 6 个技能卡片，3 列排列
3. 分类筛选和搜索正常过滤
4. 点击「安装」弹出确认弹窗，显示权限列表
5. 确认后技能安装成功，卡片变为「✓ 已安装」
6. 已安装 Tab 显示已安装技能，可卸载
7. 卸载后技能回到未安装状态
8. Modal 关闭/打开正常，状态保持
