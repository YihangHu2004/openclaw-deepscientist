# Design

## Style Reference

**Cinematic-UI** (https://github.com/vineet-dwivedi/Cinematic-UI)
电影感暗色 UI，核心语言：纯黑画布 + 青蓝霓光 + 流畅运动感。

---

## Color System

```css
--bg-base:      #060d17   /* 深海蓝黑底 */
--bg-surface:   #0a1220   /* 面板层 */
--bg-elevated:  #0f1a2e   /* 卡片层 */
--border:       rgba(255,255,255,0.07)
--text-primary: #f1f5f9
--text-secondary: #94a3b8
--text-muted:   #475569

/* Accent — 从 Cinematic-UI 的青蓝霓光提炼 */
--nb-cyan:   #00c8e8   /* 主 accent */
--nb-lime:   #ccff00   /* 工具调用标识 */
--nb-orange: #ff6600   /* 思考块 */
--nb-pink:   #ff006e   /* 用户消息 */
--cm-emerald: #34d399  /* 状态/成功 */
```

颜色策略：**Committed** — `--nb-cyan` 作主 accent，其余颜色按语义分配角色，非装饰性堆叠。

---

## Typography

```
--font-brand: 'JetBrains Mono'   /* logo / 品牌标识 */
--font-mono:  'JetBrains Mono'   /* 代码、标签、元数据 */
--font-ui:    'Inter'            /* 正文、按钮、表单 */
```

- 正文行长上限 68ch
- 层级靠 scale + weight 对比（≥1.25 ratio），不靠颜色区分
- 小标签全大写 + 宽字距（`letter-spacing: 0.1em+`）

---

## Motion

参照 Cinematic-UI 的 Framer Motion 用法：
- 页面/消息出现：`translateY(8px)` + `opacity 0→1`，`ease-out-quart`，120–200ms
- 展开/折叠：height layout animation，不 animate `max-height`
- 工具调用旋转环：`linear infinite`（状态指示，非装饰）
- 禁止：bounce、elastic、纯装饰性 hover 爆炸效果

---

## Component Conventions

### Cards / 消息气泡
- `2px solid` 边框 + `3px 3px 0 <color>` 阴影（brutalist 硬阴影，非模糊）
- 无圆角或极小圆角（工具精密感）
- 背景用 `rgba` 透明叠加，保持深度

### Buttons
- Primary：`--nb-cyan` 边框 + 10% fill，hover 加亮
- Ghost：无背景，hover 显轻微 fill
- 禁用：降 opacity，不改颜色

### 工具调用卡片
- 深色背景（`#000a00`）+ `--nb-lime` 边框
- 等宽字体，可折叠，状态用色块 LED 标记

### 输入框
- 底部单线或完整边框，focus 时 `--nb-cyan` 发光
- 无圆角

---

## Layout

- 三栏：session列表（固定）/ 对话区（flex-1）/ 文件树（固定）
- 间距不均匀，用于建立节奏（Cinematic-UI 的顺序叙事逻辑）
- 内容密度优于留白——面向专家用户

---

## Anti-patterns（来自 PRODUCT.md）

- 奶油白 SaaS 风
- purple/blue 渐变文字（`background-clip: text` 禁用）
- 侧边彩色竖线（`border-left > 1px` 作装饰禁用）
- 无限嵌套卡片
- Glassmorphism 作默认风格
- Inter + 紫蓝渐变 + 无意义 hover 动效
