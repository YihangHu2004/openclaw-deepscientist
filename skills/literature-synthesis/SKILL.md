# Skill 4：literature-synthesis — 文献综述生成

**触发**：项目中已积累 ≥ 5 篇论文笔记，需要相关工作综述 / 对比表 / Gap 列表。

**输入**：`state/projects/<slug>/project.md` 中的论文库 + `evidence.json`。

**证据记忆预检**：开始写 相关工作 前先运行 `python scripts/evidence_memory.py <slug> query "<topic>" --top-k 5`，优先使用返回的 EV。

**冲突证据优先**：若 `evidence_memory.json` 中存在 `relations.type=Contradict` 的记录，撰写综述和 Research Gap 时必须优先整合这些对立证据，明确说明分歧双方及其对应 EV-ID。

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful synthesis, contrast-table, gap, or sprint-contract decisions,
append a `S4_LitReview` trajectory record. Do not treat trajectory memory as
evidence.

## 生成步骤

**Step 1：分类整理**
- 时间线（演进脉络）
- 方法类别（prompt-based / fine-tuning / RLHF 等）

**Step 2：相关工作综述草稿（强制中文，不经用户明确指令不切换英文）**

每段至少引用 **1 个 EV-xxx**，禁止无引用结论。论文原标题保留英文，所有分析文字使用中文：
```markdown
**[方法类别 A]** {话题} 的早期研究主要聚焦于……{Citation1} 提出了……[EV-001]
然而，这类方法存在共同局限：……

**[方法类别 B]** 近期研究转向……{Citation2} 在……数据集上验证了……[EV-007, EV-012]
```
引用格式：`(Wei et al., 2022) [EV-023]`

**confidence 使用规则**：
- 含数值指标的核心声明 → 必须有 ≥1 条 `high` confidence EV
- `low` confidence EV 只可辅助佐证，不得作为结论主要依据
- 引用 `low` EV 时加注：`（摘要级证据，待全文确认）`

写完后更新 evidence.json 对应 EV 记录的 `claim_text` 和 `claim_location`。

**Step 3：方法对比表**（优先使用 paper-reader 提取的 `<table>` 数据）
```markdown
| 论文 | 年份 | 方法类型 | 核心创新 | 数据集 | 主要指标 | 局限性 |
```
（≥ 5 行）

**Step 4：研究脉络时间线**
```
2020 → [奠基] 2021 → [改进] 2022 → [突破] 2023 → [当前前沿，仍存在 A、B 问题]
```

**Step 5：Research Gap 列表**（每条引用 ≥ 1 EV-xxx，局限性来自论文而非感觉）
```markdown
1. **未解决问题**：... [EV-xxx]
2. **评估缺口**：... [EV-xxx]
3. **方法局限**：... [EV-xxx]
```

**Step 6：Sprint Contract 预承诺（评估标准盲写）**

在写 相关工作 之前，先写下评分标准（**不得在看到草稿后再修改标准**）：
```markdown
## 综述质量预承诺 · {日期}
- 我认为本轮综述合格的标准是：
  1. 相关工作每段至少有 1 条 high EV 支撑数值声明
  2. Gap 列表不少于 3 条，每条可追溯到具体论文的局限性字段
  3. 对比表覆盖 ≥ 5 篇论文，方法类型不少于 2 种
  4. [MATERIAL GAP] 标注数量 ≤ 总结论句数的 20%
- 不合格时：返回 paper-reader 补充精读，而非降低标准
```
预承诺写入 `project.md` 综述章节头部，草稿完成后按预承诺标准核查，不得事后修改评分准则。

将以上写入 `project.md` 综述章节，更新 TODO.md。

**质量要求**：每段 ≥ 2 引用；指标数据来自原文 EV；Gap 基于局限性字段；`[MATERIAL GAP]` 须显式标出而非绕过。

写入 SUMMARY.md（追加）：
```markdown
## 阶段 4 摘要 · {日期}
- 相关工作综述：{N 字，N 段，N 个 EV 引用}
- Research Gap：{N 条，列出每条一句话}
- 主要争议：{异议文献的核心反驳}
- 对比表：{N 行，方法覆盖时间跨度}
```

---

## 验收门：综述质量门

| 条件 | 要求 |
|------|------|
| 相关工作综述长度 | ≥ 300 字（中文）/ ≥ 200 词（英文，需用户明确指定） |
| EV 引用密度 | 每段 ≥ 1 个 [EV-xxx] |
| Research Gap | ≥ 3 条，每条引用 ≥ 1 EV-xxx |
| 对比表 | ≥ 5 行 |
| 争议点 | ≥ 1 条异议文献观点已写入 |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（project.md 含 相关工作 + Gap 列表）
python scripts/passport.py <slug> sign state/projects/<slug>/project.md 4

# 2. 门控检查（综述质量门）
python scripts/gate_check.py <slug> 4
```

- PASS → 更新 TODO.md `[x] 阶段 4：文献综述`，进入 S5 research-planner
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程（通常需补充 Gap 条目或 EV 引用）
