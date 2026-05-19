# Skill 8：claim-auditor — 引用忠实度审计

**触发**：report.md 生成后，或用户主动要求核查引用准确性。
**可选触发**：report-writer 验收门通过后自动建议运行（非强制）。

**目标**：抽样核查 AI 报告中的文献引用——claim_text 声明是否忠实于 original_text 原文，防止引用漂移（claim drift）。

---

## 审计流程（4 步）

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

| 结果 | 标准 | 处理 |
|------|------|------|
| ✅ 忠实 | claim_text 的核心信息点均可在 original_text 中找到出处 | `audit_result: faithful` |
| ⚠️ 漂移 | claim_text 夸大/弱化/添加了 original_text 没有的信息 | `audit_result: drifted`，记录差异 |
| ❌ 无根据 | claim_text 声明无法在 original_text 中找到任何支撑 | `audit_result: unsupported`，必须修改报告 |

漂移记录格式：
```json
{
  "ev_id": "EV-012",
  "audit_result": "drifted",
  "original_text": "achieves 74.4% on GSM8K",
  "claim_text": "在所有数学推理任务上达到 74.4% 准确率",
  "drift_description": "original 限定了 GSM8K 数据集，claim 扩大为「所有数学推理任务」",
  "recommended_fix": "「该模型在 GSM8K 基准上达到 74.4% 准确率 [EV-012]」"
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

将审计报告追加到 `report.md` 末尾（不修改正文，仅追加附录），并更新 `evidence.json` 中被核查 EV 的 `audit_result` 字段。

---

## 输出路径

- 审计报告：追加到 `state/projects/<slug>/report.md`（附录节）
- 更新 `evidence.json`：每条被审 EV 新增字段 `audit_result` / `drift_description`
- 更新 TODO.md：`- [x] 引用忠实度审计（N 条，漂移 B 条已修）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 8 摘要 · {日期} · 引用审计
- 抽样：N 条 / 全部 M 条
- 忠实率：{A/N}%
- 漂移：B 条（已修 / 待修）
- 无根据：C 条（已修 / 待修）
- [MATERIAL GAP]：N 处（{比例}%）
```

---

## 验收门：审计完整门

| 条件 | 要求 |
|------|------|
| 抽样覆盖 | high EV 全部核查；medium EV 抽查 ≥ 30% |
| 无根据 EV | 所有 `unsupported` 条目已修改报告正文 |
| 漂移 EV | 所有 `drifted` 条目已给出修改建议（可用户决定是否采纳） |
| 审计报告 | 已追加到 report.md 附录 |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（report.md 在 claim-auditor 修订后重新签署）
python scripts/passport.py <slug> sign state/projects/<slug>/report.md 8

# 2. 验证文件完整性（对比 S6 签署的哈希）
python scripts/passport.py <slug> verify state/projects/<slug>/report.md

# 注：本阶段为可选阶段，无独立 gate_check 门控
#     验证输出⚠️表示报告在 S6 签署后发生了变更（预期行为，auditor 修订了正文）
```

- 完成 → 更新 TODO.md `[x] 阶段 8：引用审计`，可选继续 S9 paper-reviewer
- `unsupported` EV 已修改正文，重新签署物料护照
