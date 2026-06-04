# Skill 5：research-planner — 研究规划与实验设计

**触发**：文献综述完成，需将 Gap 转化为可执行研究计划。

**冲突驱动 Gap**：规划研究方向前检查 `evidence_memory.json` 中 `relations.type=Contradict` 的记录。若存在对立证据，优先将其转化为 Research Gap、研究问题或实验假设，并保留双方 EV-ID。

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful planning, Socratic branch, feasibility, baseline, or experiment
design decisions, append a `S5_ResearchPlanner` trajectory record. Do not treat
trajectory memory as evidence.

## 工作流

**Step 0：优先复用已有知识（搜索前必须执行）**

在做任何方向分析或搜索之前，先穷尽已有材料：

```
① python scripts/evidence_memory.py <slug> query "<研究方向>" --top-k 10
  → 检索 S3 精读积累的所有 EV，找出与候选方向相关的已有证据

② 读取 project.md 的「Research Gap」和「综述草稿」章节
  → S4 已识别的 Gap 直接作为方向候选来源，不重新推导

③ 读取 state/baselines.json，匹配当前领域标签
  → 命中 → 直接复用，无需搜索
```

**基于已有材料能回答的问题，禁止发起新搜索。**

判断是否需要补充搜索（三类情况，每类独立判断）：

| 问题 | 已有材料够用？ | 行动 |
|------|-------------|------|
| 方向是否已有人做了？ | S1-S3 维度覆盖了 recent + sota | 直接查 evidence_memory，不搜索 |
| baseline 代码是否可用？ | S3 笔记有 repo 链接 | 直接用，不搜索 |
| baseline 代码是否可用？ | S3 笔记没有 repo 链接 | 针对性查该论文 repo，不展开搜索 |
| 数据集 split 细节？ | S3 EV 有记录 | 直接用 |
| 数据集 split 细节？ | S3 EV 没有 | 查官方文档，不搜索新论文 |
| 方向时效（近期有无新论文）？ | S1-S2 距今 > 1 周 | 1-2 次定向 arXiv 查询，不重跑 Ladder |

**查询基线注册表**

读取 `state/baselines.json`，匹配当前领域标签：
- 命中 → 直接复用已知数据集/基线，无需重新搜索
- 未命中 → 搜索后将新发现写入注册表，供后续项目复用

**意图模糊时优先进入 Socratic 对话（不直接输出计划）**：

用户描述研究方向时，若未明确说"直接给计划"，先进行结构化对话引导：

| 层 | 问题类型 | 示例 |
|----|---------|------|
| 1 澄清 | 核心问题是什么？ | 「你希望这个研究解决的核心问题是什么？」 |
| 2 假设探测 | 这个方向隐含了哪个前提？ | 「这隐含了 [X] 这个假设，你认为成立吗？」 |
| 3 证据推理 | EV 支持与反驳各是什么？ | 「EV-xxx 支持，但 EV-yyy 有相反观点，你如何权衡？」 |
| 4 观点 | 用户偏好与约束 | 「方向 A vs B，你更倾向哪个，理由是？」 |
| 5 推论 | 选择后的主要瓶颈 | 「选 A 最可能遇到 [X]，选 B 是 [Y]，影响决策吗？」 |

**收敛条件**（满足任一则结束对话，进入 EXECUTOR）：
- 用户明确说出选择的方向
- 连续 2 轮无新信息涌现
- 用户主动说"给我计划" / "直接给方案"

**内部采用 Planner-Executor 微架构**：
1. Socratic 对话 → 引导用户明确方向（见上）
2. PLANNER 分析 Gap → 提出 2-3 个候选方向（含可行性评分）→ **等待用户选择**
3. 用户选择方向后 → **补充决策点**（见下）→ EXECUTOR 具体化实验设计
4. PLANNER 验证可行性 → 输出完整计划

---

**补充决策点（用户选定方向后、EXECUTOR 开始前执行）**

基于选定方向，检查以下四个缺口，有缺口触发对应补充，无缺口直接进入 EXECUTOR：

```
缺口 1：选定方向涉及 S1-S3 未覆盖的 method_* 流派
  → S5 内部执行定向 arXiv 查询：该流派关键词 top-k(20)
  → 对新论文打 Triage + dimension_tag，新 EV 写入 evidence.json 并更新 evidence_memory

缺口 2：选定方向的对立证据不足（evidence_memory 中 challenge 类 EV < 2 条）
  → S5 内部执行定向 arXiv 查询："{方向} challenges" / "{方法} limitations" top-k(20)
  → 新 EV 写入 evidence.json，更新 evidence_memory

缺口 3：S1-S2 距今 > 1 周，选定方向时效不确定
  → S5 内部执行 1-2 次定向 arXiv 查询（选定方向关键词 + sortBy=submittedDate）
  → 有新论文 → 摘要级评估，判断是否影响方向选择
  → 无新论文 → 记录「时效已确认」，继续

缺口 4：选定 baseline 无 repo 链接或代码可用性未知
  → S5 内部直接查该论文主页 / GitHub，不做 arXiv 搜索
  → 可用 → 记录 repo 链接到 baselines.json
  → 不可用 → 切换备选 baseline，不阻塞流程
```

补充完成后重新检查，直到无缺口。
**禁止**重跑 S1-S2 全部 Ladder，每次补充必须范围明确。

---

---

## 研究计划模板

```markdown
## 研究计划：{方向名}

### 研究问题
能否通过 X 方法改善 Y 问题在 Z 场景下的表现？

### 假设
若 [条件]，则 [可验证的预期结果，含具体指标] [EV-xxx 支撑该 Gap 的存在]

### Gap 子问题分解
若能回答以下全部子问题，则本 Research Gap 视为被填补：
1. 在数据集 {X} 上，{方法 Y} 的 {指标} 是否比 {baseline Z} 高 {K}%？（可证伪）
2. 该方法在 {场景/领域} 是否具备泛化性？（边界测试）
3. 相较于 {已有方法}，计算成本是否在 {合理范围}？（可行性约束）
（根据实际研究调整子问题数量，每条须可用实验数据回答 yes/no 或具体数值）

### 实验设计
| 数据集 | 任务类型 | 规模 | 来源 | 已有 EV 参考 |
| 基线方法 | 原文来源 | 代码链接 | 复现难度(1-5) |
- 主指标 / 辅助指标 / 基准线

### 架构设计草案
- 整体模块划分（各模块职责一句话描述）
- 数据流向（输入 → 各模块 → 输出）

### 模型选型决策
| 模块 | 候选模型/算法 | 选择理由（需有 EV 或明确标注待验证） | 备选方案 |
每个核心模块至少填一行，选择理由不得为空，否则 report-writer 阶段将 FAIL。

### 可行性评估
- 算力需求（显存估算 / 训练时长估算，需有 EV 依据或明确标注估算来源）
- 代码难度(1-5) / 数据获取方式
- 技术风险（≥ 2 条）及应对方案

### 时间表
| 阶段 | 任务 | 周期 |
| 1 | 环境搭建 + Baseline 复现 | 第 1-2 周 |
| 2 | 方法实现 | 第 3-4 周 |
| 3 | 实验运行 + 调参 | 第 5-6 周 |
| 4 | 结果分析 + 写作 | 第 7-8 周 |
```

Gap 分析中每条 limitation 引用 ≥ 1 EV-xxx（局限性来自论文，不来自感觉）。
更新项目状态 `planning → experimenting`，更新 TODO.md。

**可行性原则**：优先有开源 baseline；优先 A100 × 4 小时内完成；本科周期 3-6 个月要现实。

写入 SUMMARY.md（追加）：
```markdown
## 阶段 5 摘要 · {日期}
- 选定方向：{方向名}
- 核心假设：{一句话}
- 数据集：{列表} | 基线：{列表}
- 子问题：{N 条，每条一行}
- 风险：{主要 1-2 条}
```

---

## 验收门：研究计划门

| 条件 | 要求 |
|------|------|
| 假设可证伪 | 含可验证指标（数值/排名/对比） |
| 数据集 | ≥ 1 个已识别，含来源链接 |
| baseline 参考 | ≥ 1 个含原文 arXiv ID 或 DOI |
| 时间表 | ≥ 4 个阶段 |
| Gap-EV 绑定 | 研究动机引用 ≥ 2 条 EV-xxx |
| 子问题 | ≥ 2 条可证伪子问题 |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（project.md 含研究计划）
python scripts/passport.py <slug> sign state/projects/<slug>/project.md 5

# 2. 门控检查（研究计划门）
python scripts/gate_check.py <slug> 5
```

- PASS → 更新 TODO.md `[x] 阶段 5：研究规划`，进入 S6 report-writer
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程（通常需补充数值指标或数据集来源）
