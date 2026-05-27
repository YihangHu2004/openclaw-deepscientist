# Skill 7：claim-auditor — 引用忠实度审计

**触发**：report.md 生成后，或用户主动要求核查引用准确性。
**可选触发**：report-writer 验收门通过后自动建议运行（非强制）。

**目标**：抽样核查 AI 报告中的文献引用——claim_text 声明是否忠实于 original_text 原文，防止引用漂移（claim drift）。

**语言**：审计报告、漂移描述、修改建议均使用**中文**。`recommended_fix` 字段中的修改建议也用中文撰写；论文原文引用（`original_text`）保留英文原文。

---

> ⚠️ **禁止自生成审计脚本**：不得编写 run_audit.py 或任何自定义审计代码替代本流程。
> 门控必须且只能通过 `python scripts/gate_check.py <slug> 7` 执行。

## 审计流程（5 步）

开始审计前先运行 `python scripts/evidence_memory.py <slug> query "<topic>" --top-k 5`，快速定位高频使用证据；审计仍以 `evidence.json` 为准。

### Step 1：抽样

从 evidence.json 中按以下规则抽取（**分区加权**，防止 Related Work 外章节漏检）：

**按 confidence 抽取**：
- 全部 `confidence=high` 的 EV（核心声明必须核查）
- 随机抽取 50% 的 `confidence=medium` EV
- 不核查 `confidence=low`（摘要级证据已有注记）

**按 claim_location 章节加权**（在上述基础上额外保证）：
- Methodology 章节：该章所有 EV **全部核查**（无论 confidence）
- Expected Results 章节：该章所有 EV **全部核查**（无论 confidence）
- Related Work 章节：已由 confidence 规则覆盖，不额外扩大
- 其余章节：按 confidence 规则执行

> 原因：Methodology 和 Expected Results 的错误声明对研究方向误导最大，且历史上这两章引用密度偏低，需要强制全覆盖审计。

记录抽样摘要：
```markdown
## 审计抽样记录 · {日期}
- 抽样总数：N 条 / 全部 EV M 条（high 全查 X 条，medium 抽查 Y 条）
- 分章节：Methodology 全查 A 条 / Expected Results 全查 B 条 / 其他 C 条
- 覆盖率：{N/M}%
```

### Step 2：取回原文

对每条抽到的 EV，重新获取 `original_text` 对应的论文段落（`web_fetch arxiv.org/html/{paper_id}`），与 evidence.json 中存储的 `original_text` 比对：
- 一致 → `fetch_verified: true`
- 不一致（论文已更新版本）→ 标注 `fetch_verified: false`，更新 original_text

### Step 3：逐条核查（Claim vs Original）

> ⚠️ **强制写入规则**：每判定一条 EV，**立即**执行对应的 `ev_manager.py audit` 命令。
> 不得将审计结果仅记录在独立 markdown 文件中而跳过此命令——独立文件不是 evidence.json，gate_check.py 读不到。

对每条抽样 EV，判断后**当场执行**：

| 结果 | 判定标准 | 立即执行的命令 |
|------|---------|--------------|
| ✅ 忠实 | 核心数字、结论方向均可在 original_text 中直接找到 | `python scripts/ev_manager.py <slug> audit EV-xxx faithful` |
| ⚠️ 漂移 | 夸大/弱化/扩大范围，或添加 original_text 没有的信息 | `python scripts/ev_manager.py <slug> audit EV-xxx drifted --note "漂移描述\|修改建议"` |
| ❌ 无根据 | 无法在 original_text 中找到任何支撑 | `python scripts/ev_manager.py <slug> audit EV-xxx unsupported` |

**判定要点**（优先检查数字和限定词）：
- original 写 "on GSM8K" → claim 写 "在所有推理任务" → 漂移（扩大范围）
- original 写 "AUROC 0.8243" → claim 写 "优于所有对比模型" → 漂移（结论过强）
- original 限定实验条件 → claim 省略限定词 → 漂移

每条命令执行后脚本会打印确认信息（`✅ EV-xxx 审计结果已记录`），**看到确认才算完成，没有确认须重新执行**。

### Step 3.5：修复（审计后立即执行，不可跳过）

对所有 `drifted` 和 `unsupported` 条目：

1. **定位**：在 report.md 中找到引用该 EV 的句子（搜索 `[EV-xxx]`）
2. **修改报告正文**：
   - `drifted` → 按 `--note` 中的修改建议改写引用句，保持原 EV 标记
   - `unsupported` → 删除或替换为 `[MATERIAL GAP]`（若确实缺乏依据）
3. **更新审计状态**（正文改完后立即执行）：
   ```bash
   # drifted 已修复 → fixed
   python scripts/ev_manager.py <slug> audit EV-xxx faithful
   # unsupported 已移除 → 标记 unsupported 即为最终状态，无需再执行
   ```
4. **不得**把漂移结果仅追加到附录而不修改正文

### Step 3.6：Report 句-原文直接匹配核查

> 这一步弥补 Step 3 的结构盲点：Step 3 核查 `claim_text`（agent 写 EV 时记录的意图），
> 但如果 report.md 事后被编辑且未同步更新 `claim_text`，漂移会被漏掉。

```bash
python scripts/ev_manager.py <slug> verify-report state/projects/<slug>/report.md
```

脚本自动：
- 提取 report.md 中每条含 `[EV-xxx]` 的句子，写入 `evidence.json` 对应条目的 `report_sentence` 字段
- 输出两类需处理项：
  - **❌ 幽灵 EV**：报告引用了 evidence.json 中不存在的 EV-xxx → 删除引用或补录记录
  - **⚠️ 需语义核查**：EV 存在但 `claim_text` 为空或未填 → agent 逐条处理

对每条 ⚠️ 输出项，对照脚本给出的 `报告引用句` vs `EV 原文`，判定：

| 判定 | 处置 |
|------|------|
| 报告句忠实于原文 | `ev_manager.py <slug> audit <ev_id> faithful` |
| 报告句夸大/扩范围 | 按 Step 3.5 规则改写报告句 → `audit <ev_id> drifted --note "..."` |
| 报告句无法在原文找到支撑 | 删除或改为 `[MATERIAL GAP]` → `audit <ev_id> unsupported` |

---

### Step 3.7：假设 EV 审计（color coding）

**第一步：列出所有需要核查的 EV**

```bash
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md
```

脚本自动：
- 定位 report.md 中的假设章节（假设 / 研究假设 / Hypothesis）
- 列出每条 `[EV-xxx]` 引用的**假设句子** + **EV 原文（original_text）**，并排展示
- 已有 `hypothesis_audit` 的显示当前评级；未审的标 ⚪ 待审并给出执行命令

**第二步：逐条判定，立即执行 mark-hypothesis**

对每条 ⚪ 待审的 EV，对照脚本输出的"假设句 vs EV 原文"判定：

| 评级 | 判定标准 |
|------|---------|
| 🟢 green | `original_text` 明确、直接支撑假设声明（数字、方向、结论一致） |
| 🟡 yellow | 间接支撑，或原文有限定条件（数据集/场景）而假设未标注 |
| 🔴 red | 原文无支撑，或与假设声明矛盾 |

判定后**立即**执行（一条 EV 一条命令，看到确认才算完成）：
```bash
python scripts/ev_manager.py <slug> mark-hypothesis EV-xxx \
  --result green|yellow|red \
  --sentence "修改前的原始假设句（完整）" \
  --discrepancy "若 yellow/red：差异说明" \
  --corrected "若 yellow/red：修正后写入 report 的句子"
```

**第三步：修改 report.md 正文**（对 🟡 和 🔴）
- 🟡：在假设句中补充原文限定词或降低断言强度，保留 `[EV-xxx]`
- 🔴：删除声明或替换为 `[MATERIAL GAP: <描述>]`，移除 `[EV-xxx]`

**第四步：将颜色标记写入 report.md**

所有 EV 核查完毕后执行：
```bash
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md --apply
```

脚本自动：
- 在假设章节每个 `[EV-xxx]` 后追加对应颜色 emoji：`[EV-007]🟢` / `[EV-008]🟡` / `[EV-009]🔴`
- 在假设章节末尾追加核查摘要表：
  ```
  > **假设 EV 核查记录 · {日期}**
  > | EV | 评级 | 说明 |
  > | EV-007 | 🟢 | 支撑充分 |
  > | EV-008 | 🟡 | 已添加 GSM8K 数据集限定词 |
  > | EV-009 | 🔴 | 原文无支撑 → 已改为 [MATERIAL GAP] |
  ```
- evidence.json 中 `hypothesis_audit` 块保留原始记录，`claim_text` / `audit_result` 字段不变

---

### Step 4：输出审计报告（必须追加到 report.md，不得另存为独立文件）

> ⚠️ **强制路径**：审计附录只能追加到 `report.md` 末尾。
> 将结果写到 `review/claim_audit_*.md` 或其他独立文件**不能替代**本步骤——gate_check.py 只检查 report.md 是否含 `引用忠实度审计` 节。

在 report.md 末尾追加（exec 方式写入，不得手动粘贴后忘记保存）：

```markdown
---

## 引用忠实度审计 · {日期}

### 总览
- 抽样：N 条（high: X 全查，medium: Y 抽查）
- 忠实：A 条（{A/N}%）
- 漂移→已修：B 条
- 无根据→已移除：C 条

### 明细

| EV-ID | 置信度 | 来源 | 判定 | 说明 |
|-------|--------|------|------|------|
| EV-001 | high | full_text | ✅ faithful | ... |
| EV-012 | high | full_text | ✅ fixed | 原漂移：扩大范围，已修正 |

### [MATERIAL GAP] 统计
- [MATERIAL GAP] 标注：N 处（占总结论句数 {比例}%，阈值 20%）
```

**检查确认**：追加完成后搜索 report.md 确认含 `## 引用忠实度审计` 标题，gate_check.py 以此为通过依据。

---

## 输出路径

- 审计报告：追加到 `state/projects/<slug>/report.md`（附录节，含 Step 3.5 修复后的最终统计）
- 更新 `evidence.json`：每条被审 EV 含 `audit_result`（faithful / fixed / removed）/ `drift_description` / `fix_applied`
- 更新 TODO.md：`- [x] 引用忠实度审计（N 条，漂移 B 条已修，无根据 C 条已移除）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 7 摘要 · {日期} · 引用审计
- 抽样：N 条 / 全部 M 条
- 忠实率（修复后）：{A+fixed}/N = {%}%
- 漂移→已修：B 条
- 无根据→已移除：C 条
- [MATERIAL GAP]：N 处（{比例}%）
```

---

## 验收门：审计完整门

| 条件 | 要求 |
|------|------|
| 抽样覆盖 | high EV 全部核查；medium EV 抽查 ≥ 30% |
| 无根据 EV | 所有 `unsupported` 条目已修改报告正文，标记为 `removed` |
| 漂移 EV | 所有 `drifted` 条目已按 `recommended_fix` 修改正文，标记为 `fixed` |
| 忠实率 | （faithful + fixed）/ 已审 ≥ 90% |
| 审计报告 | 已追加到 report.md 附录（含修复后统计） |

**通过条件由 `gate_check.py` 自动验证（读取 evidence.json audit_result 字段）。**

---

## 执行步骤（强制，按序不可跳过）

```bash
# ── Step 3 期间：每判定一条 EV，立即执行（不可攒到最后批量执行）──────────────
python scripts/ev_manager.py <slug> audit EV-001 faithful
python scripts/ev_manager.py <slug> audit EV-002 drifted --note "问题描述|修改建议"
python scripts/ev_manager.py <slug> audit EV-003 unsupported
# …每条 EV 一行，看到 "✅ EV-xxx 审计结果已记录" 才算完成

# ── Step 3.6：Report 句-原文直接匹配（Step 3 全部执行完后）─────────────────
python scripts/ev_manager.py <slug> verify-report state/projects/<slug>/report.md

# ── Step 3.7：假设 EV 核查 ──────────────────────────────────────────────────
# 3.7-A：列出假设章节所有待核查 EV（假设句 vs 原文并排展示）
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md

# 3.7-B：逐条判定，立即记录（每条 EV 一行）
python scripts/ev_manager.py <slug> mark-hypothesis EV-xxx \
  --result green|yellow|red \
  --sentence "原句" [--discrepancy "..." --corrected "..."]

# 3.7-C：所有 EV 核查完后，将颜色写入 report.md（emoji 后缀 + 摘要表）
python scripts/ev_manager.py <slug> check-hypothesis state/projects/<slug>/report.md --apply

# ── Step 4：把审计附录追加到 report.md（必须，不可另存为独立文件）────────────
# 用 exec 方式将审计摘要表追加到 report.md 末尾，确认含"## 引用忠实度审计"标题

# ── 收尾 ────────────────────────────────────────────────────────────────────
# report.md 已修改（Step 3.5 + Step 4），重新签署物料护照
python scripts/passport.py <slug> sign state/projects/<slug>/report.md 7

# 运行审计完整门（读取 evidence.json，gate 通过才可进入 S8）
python scripts/gate_check.py <slug> 7
```

**PASS 判据（gate_check.py 自动检查）**：
- evidence.json：所有 high EV 已有 audit_result；无 unsupported；faithful+fixed ≥ 90%
- report.md：含 `引用忠实度审计` 节

- **PASS** → 更新 TODO.md `[x] S7：引用审计（忠实率 X%，漂移 B 条已修）`，进入 S8 paper-reviewer
- **FAIL** → 按阻断项提示继续修复，重新运行 `gate_check.py <slug> 7`

> ⚠️ 若 `passport verify` 显示哈希变更，属于预期行为（auditor 已修改正文）。
