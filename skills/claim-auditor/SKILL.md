# Skill 7：claim-auditor — 引用忠实度审计

**触发**：report.md 生成后，或用户主动要求核查引用准确性。
**可选触发**：report-writer 验收门通过后自动建议运行（非强制）。

**目标**：抽样核查 AI 报告中的文献引用——claim_text 声明是否忠实于 original_text 原文，防止引用漂移（claim drift）。

---

> ⚠️ **禁止自生成审计脚本**：不得编写 run_audit.py 或任何自定义审计代码替代本流程。
> 门控必须且只能通过 `python scripts/gate_check.py <slug> 7` 执行。

## 审计流程（5 步）

### Step 1：抽样

从 evidence.json 中按优先级抽取：
- 全部 `confidence=high` 的 EV（核心声明必须核查）
- 随机抽取 30% 的 `confidence=medium` EV
- 不核查 `confidence=low`（摘要级证据已有注记）

记录抽样摘要：
```markdown
## 审计抽样记录 · {日期}
- 抽样总数：N 条 / 全部 EV M 条（high 全查 X 条，medium 抽查 Y 条）
- 覆盖率：{N/M}%
```

### Step 2：取回原文

对每条抽到的 EV，重新获取 `original_text` 对应的论文段落（`web_fetch arxiv.org/html/{paper_id}`），与 evidence.json 中存储的 `original_text` 比对：
- 一致 → `fetch_verified: true`
- 不一致（论文已更新版本）→ 标注 `fetch_verified: false`，更新 original_text

### Step 3：逐条核查（Claim vs Original）

对每条抽样 EV，判断：

| 结果 | 判定标准 | 写入 evidence.json |
|------|---------|-------------------|
| ✅ 忠实 | 核心数字、结论方向均可在 original_text 中直接找到 | `audit_result: faithful` |
| ⚠️ 漂移 | 夸大/弱化/扩大范围，或添加 original_text 没有的信息 | `audit_result: drifted`，必须填 `recommended_fix` |
| ❌ 无根据 | 无法在 original_text 中找到任何支撑 | `audit_result: unsupported`，必须修改报告正文 |

**判定要点**（优先检查数字和限定词）：
- original 写 "on GSM8K" → claim 写 "在所有推理任务" → 漂移（扩大范围）
- original 写 "AUROC 0.8243" → claim 写 "优于所有对比模型" → 漂移（结论过强）
- original 限定实验条件 → claim 省略限定词 → 漂移

漂移记录格式（必须填写 recommended_fix）：
```json
{
  "ev_id": "EV-012",
  "audit_result": "drifted",
  "drift_description": "original 限定了 GSM8K 数据集，claim 扩大为「所有数学推理任务」",
  "recommended_fix": "「该模型在 GSM8K 基准上达到 74.4% 准确率 [EV-012]」"
}
```

### Step 3.5：修复（审计后立即执行，不可跳过）

对所有 `drifted` 和 `unsupported` 条目：

1. **定位**：在 report.md 中找到引用该 EV 的句子（搜索 `[EV-xxx]`）
2. **修改报告正文**：
   - `drifted` → 按 `recommended_fix` 改写引用句，保持原 EV 标记
   - `unsupported` → 删除或替换为 `[MATERIAL GAP]`（若确实缺乏依据）
3. **更新 evidence.json**：
   - `drifted` 修复完成后 → `"audit_result": "fixed"`
   - `unsupported` 删除引用后 → `"audit_result": "removed"`
4. **不得**把漂移结果仅追加到附录而不修改正文

```python
# evidence.json 修复后示例
{
  "ev_id": "EV-012",
  "audit_result": "fixed",          # drifted → fixed
  "drift_description": "...",
  "recommended_fix": "...",
  "fix_applied": true               # 新增字段，确认已修改正文
}
```

### Step 4：输出审计报告

```markdown
## 引用忠实度审计报告 · {日期}

### 总览
- 抽样：N 条（high: X，medium: Y）
- 忠实：A 条（{A/N}%）
- 漂移：B 条 → 需修改
- 无根据：C 条 → 必须修改

### 漂移/无根据清单
| EV-ID | 问题 | 修改建议 |
|-------|------|---------|
| EV-012 | 扩大化 | ... |

### [MATERIAL GAP] 统计
- 报告中 [MATERIAL GAP] 标注：N 处
- 占总结论句数：{N/总}%（阈值 20%）
```

将审计报告追加到 `report.md` 末尾（附录节），同时更新 `evidence.json` 中被核查 EV 的 `audit_result` 字段（含修复结果）。**正文中的漂移句子必须已在 Step 3.5 中修改完毕。**

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

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. Step 3.5 修复完成后，重新签署物料护照（report.md 已被修改）
python scripts/passport.py <slug> sign state/projects/<slug>/report.md 7

# 2. 运行审计完整门（读取 evidence.json audit_result，计算忠实率）
python scripts/gate_check.py <slug> 7
```

- **PASS** → 更新 TODO.md `[x] S7：引用审计（忠实率 X%，漂移 B 条已修）`，进入 S8 paper-reviewer
- **FAIL** → 按阻断项提示继续修复，重新运行 `gate_check.py <slug> 7`

> ⚠️ 若 `passport verify` 显示哈希变更，属于预期行为（auditor 已修改正文）。
