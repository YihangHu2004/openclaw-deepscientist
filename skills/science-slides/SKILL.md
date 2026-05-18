# Skill 7：science-slides — 开题报告 PPT

**触发**：需要生成中文学术风格开题报告 PPT，通常在 report-writer 之后使用。

**依赖**：`pip install python-pptx`（通过 bash_exec 安装）

---

## 标准结构（12-15 张）

| # | 幻灯片 | 内容来源 |
|---|--------|---------|
| 1 | 封面（题目/姓名/导师/日期） | USER_CONFIG.md |
| 2 | 目录 | 自动生成 |
| 3 | 研究背景与动机 | report.md §1 |
| 4-5 | 国内外研究现状（含对比表）| report.md §2 + literature-synthesis |
| 6 | 研究问题与假设 | report.md §3 |
| 7-8 | 研究方案与技术路线 | report.md §4 |
| 9 | 实验设计 | report.md §5 |
| 10 | 预期成果与创新点 | report.md §6 |
| 11 | 研究时间表（甘特图） | report.md §7 |
| 12 | 参考文献（核心 8-12 篇）| 论文库 |

---

## 配色方案（蓝白学术风）

```python
THEME_BLUE    = RGBColor(0x1A, 0x3C, 0x8F)  # 标题背景
THEME_LIGHT   = RGBColor(0xEE, 0xF2, 0xFF)  # 内容背景
TEXT_DARK     = RGBColor(0x1A, 0x1A, 0x2E)  # 正文
TEXT_WHITE    = RGBColor(0xFF, 0xFF, 0xFF)  # 白字
ACCENT_ORANGE = RGBColor(0xFF, 0x8C, 0x00)  # 强调色
```

幻灯片尺寸：`13.33 × 7.5 英寸`（16:9 宽屏）

**内容规则（6×6）**：每张最多 6 条 bullet，每条不超过 20 汉字；超出则拆分为两张。

**甘特图**：用矩形块（`add_shape`）表示各阶段，不依赖外部图表库。

**输出路径**：`state/projects/<slug>/slides/开题报告.pptx`

更新 TODO.md：`- [x] 开题报告 PPT（N 张）`

写入 SUMMARY.md（追加，本次为最终摘要）：
```markdown
## 阶段 7 摘要 · {日期} · ✅ 项目完成
- PPT：{N 张，路径}
- 全流程耗时：{首次 Skill 1 日期} → {今日}
- 产出清单：project.md / report.md / report.html / 开题报告.pptx
- 关键数值：精读 {N} 篇 / EV {N} 条 / Related Work {N} 词 / Gap {N} 条
```

---

## 验收门：PPT 结构门

| 条件 | 要求 |
|------|------|
| 幻灯片数量 | ≥ 12 张 |
| 必要幻灯片 | 封面/目录/背景/现状/问题/方案/实验/成果/时间表/参考文献 均存在 |
| 内容规则 | 无幻灯片超过 6 条 bullet |
| 文件存在 | .pptx 文件实际存在于 slides/ 目录 |
