# 哪吒监控集成设计方案

## 概述

将哪吒监控（Nezha）集成到 XNOW Terminal 中，实现书签中 VPS 的全自动部署监控、实时状态查看、一键 SSH 联动的完整闭环。

## 背景

- XNOW Terminal 现有「VPS看板」为书签 VPS 的订阅信息管理（到期/价格/流量）
- XNOW Terminal 现有 SSH 会话内监控（TerminalInfoResource）为单机实时监控
- 哪吒监控是开源 Go 写的主控-被控架构监控系统，支持多服务器集中监控

## 目标

1. 在 XNOW 中集成哪吒监控的实时数据
2. 实现从 XNOW 内一键部署哪吒主控和被控
3. 打通书签、监控、SSH 的体验闭环

---

## 一、数据模型

### 全局哪吒配置（存入 XNOW config）

```json
{
  "nezha": {
    "dashboardUrl": "http://your-server:8008",
    "apiToken": "nzp_xxxxxxxxxxxx",
    "masterBookmarkId": "uuid-of-master-server"
  }
}
```

- `dashboardUrl`：哪吒 Dashboard 地址
- `apiToken`：Personal Access Token（`nzp_` 开头）
- `masterBookmarkId`：部署了主控的书签 ID，用于后续维护

### 书签关联（书签可选字段）

```json
{
  "id": "xxx",
  "title": "日本VPS",
  "host": "10.0.0.1",
  "username": "root",
  // ... 现有字段不变 ...
  "nezhaServerId": 1
}
```

- `nezhaServerId`：哪吒监控中的服务器 ID，部署 Agent 后自动回填

---

## 二、配置页面

### 入口

在 XNOW 设置面板左侧导航中新增「哪吒监控」项（`settingList` 新增条目，`settingNezhaId` 常量）。

### 页面结构

```
┌─────────────────────────────────────────────┐
│  🖥️  哪吒监控配置                             │
│                                              │
│  ─── 部署主控 ───                             │
│                                              │
│  主控服务器：[选择书签 ▼]                      │
│                                              │
│  [ 🚀 一键部署主控 ]                          │
│                                              │
│  ─── 连接信息（部署后自动回填/也可手动填写） ── │
│                                              │
│  Dashboard 地址：[______________________]     │
│  API Token   ：[______________________]       │
│                                              │
│  [保存]  [连接测试]                           │
└──────────────────────────────────────────────┘
```

### 交互逻辑

1. 选书签 → 点「一键部署主控」→ 弹出全息部署窗口 → 自动完成 → 回填地址和 Token
2. 也可手动填已有哪吒地址
3. 「连接测试」验证地址和 Token 有效
4. 保存后配置生效

---

## 三、全自动部署流程

### 全息部署弹窗

部署时弹出一个半透明暗色终端风格窗口，满足：

- **只读界面**（`user-select: none`），唯一可交互的是右上角 × 取消按钮
- 实时滚动显示部署日志，等宽发光绿字
- 进度条带霓虹光效
- ✅ ❌ 状态标记带呼吸灯
- 完成后 3s 倒计时自动淡出关闭

### 部署主控（SSH 连接目标服务器后的步骤）

1. 检测系统类型（Debian/Ubuntu/CentOS）
2. 安装 Docker（如未安装）
3. 拉取哪吒 Dashboard 镜像（`nezhahq/dashboard:latest`）
4. 启动 Dashboard 服务（映射端口 8008）
5. 创建管理员账号
6. 生成 API Token（nzp_）
7. 自动回填到 XNOW 配置

### 批量部署被控

1. 在「实时监控」页签中点「部署 Agent」
2. 弹出服务器选择框，列出书签中未注册哪吒的 VPS
3. 勾选多台 → 点「批量安装」
4. 并行 SSH 到各服务器安装 Agent
5. Agent 自动注册到主控 Dashboard
6. 书签的 `nezhaServerId` 自动回填
7. 完成列表实时刷新

---

## 四、VPS 看板改造

将现有 VPS 看板 Modal 改造为双页签：

### 页签一：订阅信息（现有内容，不动）

保留现有的 VPS 到期/价格/流量/管理面板等订阅信息表格。

### 页签二：实时监控（新增）

三种视图模式，右上角切换按钮组：

#### 表格视图
- 一行一台服务器
- 列：名称、IP、CPU%、内存%、磁盘%、网络流量、在线状态、操作（SSH）
- 排序、搜索功能

#### 卡片视图
- 每台服务器一个卡片
- 迷你环形或条形仪表盘（CPU/内存/磁盘）
- 在线状态指示灯
- 点击卡片直接 SSH

#### 详情视图
- 点选某台服务器进入
- 完整仪表盘：环形 CPU/内存/磁盘/网络仪表
- CPU 历史曲线图
- 网络流量历史图
- 进程列表
- 有「← 返回」按钮回到列表

---

## 五、联动功能

### 监控 → SSH

在实时监控中点击某台服务器：
- 已有匹配书签 → 直接 SSH 连接
- 无匹配书签 → 弹出快速连接，IP 已自动填好

### 书签 → 监控

书签列表显示 Agent 状态小点：
- 🟢 已装 Agent，在线
- 🟡 已装 Agent，离线
- ⚪ 未装 Agent

### 部署自动关联

Agent 部署成功后，自动找到对应的书签并写入 `nezhaServerId`，实现双向关联。

---

## 六、哪吒 API 使用

### 认证

- PAT（Personal Access Token）：`nzp_` 开头
- 权限范围：`nezha:server:*`（服务器读权限）
- 通过 `Authorization: Bearer nzp_xxx` 请求头发送

### 关键 API 端点

| 用途 | 方法 | 路径 |
|------|------|------|
| 获取服务器列表 | GET | `/api/v1/server` |
| 实时状态推送 | WS | `/api/v1/ws/server` |
| 服务监控概览 | GET | `/api/v1/service` |
| 指标历史 | GET | `/api/v1/server/{id}/metrics?metric=cpu&period=1d` |

### 返回格式

```json
{
  "success": true,
  "data": { ... }
}
```

---

## 七、文件变更清单

### 新增文件
- `src/client/components/vps-dashboard/tab-monitor.jsx` — 实时监控页签
- `src/client/components/vps-dashboard/monitor-table.jsx` — 表格视图
- `src/client/components/vps-dashboard/monitor-cards.jsx` — 卡片视图
- `src/client/components/vps-dashboard/monitor-detail.jsx` — 详情视图
- `src/client/components/setting-panel/tab-nezha.jsx` — 哪吒配置页
- `src/client/components/deploy/deploy-modal.jsx` — 全息部署弹窗
- `src/client/components/deploy/deploy-agent.jsx` — Agent 部署逻辑
- `src/client/common/nezha-api.js` — 哪吒 API 封装（HTTP + WebSocket）

### 修改文件
- `src/client/components/sidebar/index.jsx` — 侧边栏 VPS看板 入口不变
- `src/client/components/vps-dashboard/vps-dashboard.jsx` — 改造为双页签
- `src/client/components/vps-dashboard/vps-dashboard.styl` — 新增样式
- `src/client/common/setting-list.js` — 新增「哪吒监控」导航项
- `src/client/components/setting-panel/tab-settings.jsx` — 新增渲染分支
- `src/client/common/constants.js` — 新增 `settingNezhaId` 常量
- `src/client/store/setting.js` — 新增相关方法
- `src/client/components/bookmark-form/common/fields.jsx` — 可选关联哪吒字段（后续）
- `src/client/components/tree-list/tree-list-item.jsx` — Agent 状态小点（后续）

---

## 八、实施顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 第一阶段 | API 封装 + 配置页面 + VPS 看板双页签改造 | 无 |
| 第二阶段 | 全息部署弹窗 + 主控一键部署 | 第一阶段 |
| 第三阶段 | 批量部署 Agent + 自动关联书签 | 第二阶段 |
| 第四阶段 | 联动功能 + 书签状态标记 | 第三阶段 |
| 第五阶段 | 细节优化 + 边缘情况处理 | 第四阶段 |
