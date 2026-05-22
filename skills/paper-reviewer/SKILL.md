# Skill 8：paper-reviewer — 双流同行评审

**触发**：report.md 完成后，用户需要获得批判性反馈；或在 report-writer + claim-auditor 之后运行。

**模式**：
- `full`（默认）：5 人评审团（4 个标准评审 + 1 个 Devil's Advocate）
- `quick`：仅运行 DA 快速扫描（10 分钟内）
- `methodology`：聚焦研究设计与实验方法

---

## 评审团结构

| 角色 | 职责 | 评分框架 |
|------|------|---------|
| 评审 A（主题专家） | 评价研究贡献的学术价值 | 标准评分卡 |
| 评审 B（方法专家） | 核查实验设计与统计合理性 | 标准评分卡 |
| 评审 C（写作审稿人） | 论证逻辑 + 表达清晰度 | 标准评分卡 |
| 评审 D（领域外视角） | 可复现性 + 跨领域适用性 | 标准评分卡 |
| **Devil's Advocate (DA)** | 主动寻找逻辑谬误、竞争性解释、被忽视的反驳 | **独立框架，不使用标准评分卡** |

---

## Sprint Contract：评审预承诺

每位评审（含 DA）在**阅读报告前**写下评分维度和通过标准（防止后验合理化）：

```markdown
## 评审预承诺 · 评审 {A/B/C/D/DA} · {日期}
- 我将重点考察：{具体维度，如：实验 baseline 选择是否公平}
- 通过阈值：{如：每个 Gap 必须有 ≥1 条直接 EV 支撑}
- 如果发现 [X]，我会评为：{具体处理方式}
```

预承诺写入审查记录，阅读报告后不得修改评分标准。

---

## 标准评分卡（评审 A/B/C/D）

每位评审独立给出：

```markdown
## 评审 {角色} 评分 · {日期}

### 研究贡献（1-5）：{N}
{理由，引用 report.md 具体章节}

### 方法合理性（1-5）：{N}
{理由}

### 证据质量（1-5）：{N}
{EV 覆盖率 / [MATERIAL GAP] 数量 / 有无 unsupported 引用}

### 可复现性（1-5）：{N}
{数据集说明 / 实验参数 / 代码可用性}

### 总体建议
- [Accept] / [Minor Revision] / [Major Revision] / [Reject]
- 必须修改项（列出 ≤ 3 条）：
- 建议改进项（列出 ≤ 3 条）：
```

---

## Devil's Advocate 框架（独立，不使用评分卡）

DA 的任务是**主动寻找问题**，而非按维度评分：

```markdown
## Devil's Advocate 报告 · {日期}

### 竞争性解释
> 作者声明 [X] 导致 [Y]，但也可能是 [Z] 导致 [Y]，报告是否排除了这种解释？
{具体分析}

### 逻辑漏洞
> [章节 N] 的推理路径：前提 A + 前提 B → 结论 C，但前提 B 依赖 [未证明的假设]
{具体分析}

### 被忽视的对立文献
> 报告未引用 [X et al., 2024]，该文献对报告核心主张有直接挑战
{简要说明}

### DA 裁决
- 🔴 DA-CRITICAL（阻断）：{必须解决，否则结论不可信}
- 🟡 DA-WARNING（建议）：{建议回应，可选择性说明立场}
```

**DA-CRITICAL 项**：必须在报告中明确回应，或修改相应章节，才能通过评审门。

---

## 共识汇总

4 位标准评审 + DA 完成后，汇总共识：

```markdown
## 评审共识 · {日期}

### 共识级别
- CONSENSUS-4：所有 4 位评审一致同意
- CONSENSUS-3：3 位同意，1 位保留意见
- SPLIT：2-2 分歧
- DA-CRITICAL：DA 提出阻断问题（权重独立）

### 总体决定
{Accept / Minor Revision / Major Revision / Reject}

### 必须修改（共识项）
1. {问题} → {建议}
2. ...

### DA-CRITICAL 待回应项
1. {具体问题}
```

---

## 改进循环（Revision Loop）

共识汇总完成后**必须**展示改进清单卡片，不得直接结束：

```
╔══════════════════════════════════════════════════════╗
║  📋 同行评审改进清单                                  ║
╠══════════════════════════════════════════════════════╣
║  🔴 DA-CRITICAL：N 项（必须处理，否则结论不可信）      ║
║  🟡 Major Revision：N 项（强烈建议修改）               ║
║  🟢 Minor Revision：N 项（可选）                      ║
╠══════════════════════════════════════════════════════╣
║  请选择：                                             ║
║    [1] 处理全部 DA-CRITICAL + Major 项                ║
║    [2] 仅处理 DA-CRITICAL（最小修改）                  ║
║    [3] 接受现状（在报告头部注明已知局限）               ║
║    [4] 暂停，稍后决定                                  ║
╚══════════════════════════════════════════════════════╝
```

**选 [1] 或 [2] 的执行路径**：

```
改进内容 → 分类路由：
  · 内容/论证问题 → 返回 S6 修改 report.md
  · 引用漂移问题 → 返回 S8 运行 claim-auditor
  · 文献缺失问题 → 返回 S3 补充精读

修改完成后：
  1. python scripts/passport.py <slug> sign state/projects/<slug>/report.md 9
  2. python scripts/gate_check.py <slug> 6   ← 验证修改后的报告仍通过 S6 门
  3. 在 review/ 目录追加修订记录：
       review/revision_{日期}.md（记录：哪些问题已解决 / 哪些有意保留）
  4. improvement_counts["s8"] += 1（写入 pipeline_state.json）
```

**改进轮次限制**：最多 3 轮。第 3 轮后若仍有 DA-CRITICAL 未解决，强制选 [3]（接受现状并注明）。

**选 [3] 的处理**：在 `report.md` 摘要后追加：
```markdown
## 已知局限（同行评审后确认）
- {DA-CRITICAL 或 Major 问题，说明为何保留}
```

---

## 输出路径

- 完整评审报告：`state/projects/<slug>/review/peer_review_{日期}.md`
- 更新 TODO.md：`- [x] 同行评审（{决定}，DA-CRITICAL: N 项）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 8 摘要 · {日期} · 同行评审
- 模式：{full / quick / methodology}
- 总体决定：{Accept / Minor Revision / Major Revision / Reject}
- 共识：CONSENSUS-4: N 项 / SPLIT: N 项 / DA-CRITICAL: N 项
- 必须修改：N 项（列出）
```

---

## 验收门：评审完整门

| 条件 | 要求 |
|------|------|
| 预承诺 | 全部评审角色在阅读前写下评分标准 |
| 标准评审 | 4 位评审均完成评分卡 |
| DA 报告 | DA 框架完整（竞争解释 + 逻辑漏洞 + 对立文献 + 裁决） |
| DA-CRITICAL | 所有 DA-CRITICAL 项已在报告中得到明确回应或修改 |
| 共识汇总 | 已生成共识报告并写入 review/ 目录 |

---

## 执行步骤（强制）

```bash
# 1. 生成共识报告后，签署物料护照
python scripts/passport.py <slug> sign state/projects/<slug>/review/peer_review_{日期}.md 8

# 2. 展示改进清单卡片，等待用户选择（见「改进循环」节）

# 3a. 若选 [1]/[2]：修改报告后执行
python scripts/passport.py <slug> sign state/projects/<slug>/report.md 8
python scripts/gate_check.py <slug> 6    # 确认修改后报告仍通过 S6 报告完整门

# 3b. 若选 [3]：在 report.md 追加「已知局限」节即可

# 4. 签署修订记录（若有改进）
python scripts/passport.py <slug> sign state/projects/<slug>/review/revision_{日期}.md 8

# 5. 运行评审完整门
python scripts/gate_check.py <slug> 8
```

- DA-CRITICAL 全部回应后 → 更新 TODO.md `[x] S8：同行评审（已完成改进）`
- 接受现状后 → 更新 TODO.md `[x] S8：同行评审（已注明已知局限）`
