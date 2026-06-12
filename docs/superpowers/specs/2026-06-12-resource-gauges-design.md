# 系统资源仪表盘 设计文档

## 概述

将终端信息面板中的系统资源监控区域从 Ant Design 进度条改为 4 个圆形仪表盘 + CPU 历史折线图，统一视觉风格，提升信息密度。

## 修改范围

### 涉及文件

| 文件 | 改动 |
|------|------|
| `src/client/components/terminal-info/resource.jsx` | **重写** — 用 SVG 仪表盘替换 Ant Design Progress |
| `src/client/components/terminal-info/terminal-info.jsx` | **微调** — 向 Resource 组件传递 disks 数据 |
| `src/client/components/terminal-info/terminal-info.styl` | **追加** — 仪表盘相关样式 |
| `src/client/components/terminal-info/run-cmd.jsx` | **微调** — CPU 保留小数精度，添加 coreCount 字段 |

### 不改的文件

- `disk.jsx` — 磁盘表格保持不变（仪表盘只汇总根分区）
- 其余 terminal-info 组件不碰

## 布局

```
┌──────────────────────────────────┐
│  ┌──────────┐  ┌──────────┐     │
│  │  CPU     │  │  内存    │     │
│  │  0.13%   │  │  13.55%  │     │
│  │ CPU:2核  │  │ 337M/2.4G│     │
│  └──────────┘  └──────────┘     │
│  ┌──────────┐  ┌──────────┐     │
│  │ 交换分区  │  │  存储    │     │
│  │   0%     │  │  5.42%   │     │
│  │ 0B/1.25G │  │ 2.37G/43G│     │
│  └──────────┘  └──────────┘     │
│  ┌──────────────────────────┐   │
│  │ 📈 CPU History           │   │
│  │ 100% ┤  ██               │   │
│  │  75% ┤ ████              │   │
│  │  50% ┤████               │   │
│  │  25% ┤ ██                │   │
│  │   0% ┤───────时间───────→│   │
│  └──────────────────────────┘   │
└──────────────────────────────────┘
```

## 组件设计

### 1. SVG 圆形仪表盘 (Gauge)

纯 SVG 实现，不引入第三方：

```
props: { percent, size, strokeWidth, color, label, detail }
```

- 背景圆弧 + 前景进度弧（`stroke-dasharray` + `stroke-dashoffset`）
- 圆弧起点 12 点钟方向，顺时针
- 中心大字显示百分比
- 下方小字显示标签和详细数值
- 颜色区间：<50% 绿色 / 50-70% 蓝色 / 70-90% 黄色 / ≥90% 红色

### 2. CPU History 折线图

- 保留最近 60 个数据点（5 分钟，每 5 秒采集一次）
- 使用 `useRef` 存储历史数组，不触发重渲染
- SVG polyline 绘制
- Y 轴 0/25/50/75/100%，X 轴时间标签
- 表头带折线图图标

### 3. 数据处理

| 数据 | 来源 | 百分比计算 | 显示精度 |
|------|------|-----------|---------|
| CPU | `cpu` prop (如 "13.55%") | `parseFloat` 直接取 | 2 位小数 |
| 内存 | `mem` prop ({total, used}) | `used/total * 100` | 2 位小数 |
| 交换分区 | `swap` prop ({total, used}) | `used/total * 100` | 2 位小数 |
| 存储 | `disks` 数组 → 根分区 `/` | `used/size * 100` | 2 位小数 |

## 停止条件

1. ✅ 4 个仪表盘正确显示（CPU/内存/交换分区/存储）
2. ✅ CPU 历史折线图实时滚动
3. ✅ 现有功能不受影响（切换开关、远程条件等）
4. ✅ Stylus 编译通过
