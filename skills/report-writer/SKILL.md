# Skill 6：report-writer — 完整科研报告

**触发**：研究规划完成，需生成完整科研提案或报告。

**输出**：`report.md`（可编辑）+ `report.html`（可分享，单列博客风格，内嵌 CSS）。

**语言**：报告**强制使用中文**撰写（章节标题、正文、摘要、参考文献说明均为中文）。不经用户明确文字指令不得切换为英文；论文原标题、专有名词、代码片段保留英文，其余一律中文。

---

## Trajectory Memory Protocol

Before executing this skill, follow `skills/trajectory-memory/SKILL.md`: read
`trajectory_context.md` and recent `trajectory_memory.jsonl` as workflow prior.
After meaningful report-structure, Sprint Contract, evidence coverage, or
revision decisions, append a `S6_ReportWriting` trajectory record. Do not treat
trajectory memory as evidence.

## 写作前证据预审（Sprint Contract）

先运行 `python scripts/evidence_memory.py <slug> query "<topic>" --top-k 5`，确认核心主题已有可用 EV；默认不使用 `unsupported` EV。

**先写预承诺评分标准，再动笔（预承诺后不得修改标准）**：
```markdown
## 报告质量预承诺 · {日期}
- EV 覆盖率目标：≥ 80%
- [MATERIAL GAP] 上限：≤ 总结论句数 20%
- 各章节 EV 最低数：
    引言            ≥ 2
    相关工作        ≥ 5
    研究空白与动机  ≥ 2  （必须有 EV 证明该 Gap 存在）
    研究方法        ≥ 4  （见下方句子级规则）
    实验设计        ≥ 3  （每个 baseline / dataset 各 ≥ 1 条）
    预期结果        ≥ 3  （每个预期指标必须对应已有 SOTA 数值的 EV）
- 不合格处理：返回精读，不降低标准
```

然后检查 evidence.json：
1. verified=true 的 EV 总数是否 ≥ 10
2. 对照上表逐章核查最低数，任一章不足 → 按以下优先级补充（**重读优先，搜索其次**）：
   - **优先**：search_cache.json 中已有相关论文 → 返回 S3 对该论文定向精读，提取所需 EV
   - **次选**：已有论文中无法提取 → 返回 S1/S2 针对缺口关键词补搜，找到后精读提取
   - `[MATERIAL GAP]` 仅用于穷尽以上两步后仍无文献依据的情况，不得提前使用
3. 统计已有 `[MATERIAL GAP]` 数量，超过 20% → 同上优先级补充，不得直接降级
4. 写作过程中遇到需要 EV 但当前 evidence.json 无对应记录的声明 → 立即暂停写作，优先重读已有论文补充，次选补搜，不得先写 `[MATERIAL GAP]` 占位再继续

---

## 报告章节结构

```markdown
# [研究主题] 科研报告
作者：{USER_NAME} | 机构：{USER_INSTITUTION} | 日期：{YYYY-MM-DD}

## 摘要（150-200 字）
## 一、引言
## 二、相关工作（使用 literature-synthesis 生成内容，保留 [EV-xxx] 标注）
## 三、研究空白与动机
## 四、研究方法
### 4.1 整体架构设计
### 4.2 核心模块与模型选型
### 4.3 技术可行性分析
## 五、实验设计
## 六、预期结果
## 七、时间规划
## 八、参考文献（APA 格式，来自论文库）
```

**四、研究方法** 子节强制内容：
- **4.1 核心方案**：具体说明**怎么做**——工具/算法/流程/系统的选择及理由。禁止空洞表述（如"本研究提出一种新方法"/"将采用先进技术"），每个关键技术决策必须落实到具体选择，并说明为什么选它而不是备选方案。
- **4.2 实施路径**：分步骤描述如何从零推进到可验证结果，每步有明确的输入/输出/工具。读完后应能判断这个方案能否实际执行。
- **4.3 可行性与风险**：主要障碍（≥ 2 条）及对应应对方案；若涉及计算资源，给出估算依据。

每个含文献结论的句子后附 `[EV-xxx]`；无证据支撑的声明必须改写或打 `[MATERIAL GAP]` 标签，不得删除信息缺口。

### 句子级强制 EV 触发规则（分章节）

**四、研究方法** — 以下句型必须挂 EV，否则视为无根据声明：
- "本研究采用 X 方法" → 必须有 EV 说明 X 的来源论文
- "受 X 工作启发" / "基于 X 框架" → 必须引用该工作的 EV
- "该设计可避免 / 改善 Y 问题" → 必须有 EV 支撑 Y 确实是已知问题
- 任何与已有方法的对比优势声明 → 必须有 EV 支撑被比较方法的局限
- **任何技术选择**（工具 / 算法 / 框架 / 方法）→ 必须说明选择理由，有 EV 支撑最佳；无 EV 时必须给出逻辑依据，不得只列名称
- **"本研究将 / 可以 / 能够 X"** 等执行声明 → 必须能回答"具体怎么做"，不能停留在意图层面

**五、实验设计** — 以下项目必须逐一挂 EV：
- 每个 **baseline 方法**：来源论文 EV + 原始报告指标（不得只写方法名）
- 每个 **数据集**：来源论文 EV + 规模/分割方式（不得只写数据集名）
- 评估指标的选择理由（若非领域通用指标）

**六、预期结果** — 以下句型必须挂 EV：
- "预期在 X 数据集上达到 Y 指标" → 必须有 EV 说明当前 SOTA 是多少（不得凭空声明提升幅度）
- "预计优于 baseline Z" → 必须有 EV 记录 Z 的当前数值
- 任何百分比改进预期 → 必须对应实际已有数值，不得无锚点估算

---

## HTML 生成（exec）

```python
import markdown, datetime
with open('report.md', encoding='utf-8') as f:
    body = markdown.markdown(f.read(), extensions=['tables','fenced_code','toc'])

css = """
:root{color-scheme:light}
*{box-sizing:border-box}
body{font-family:-apple-system,'PingFang SC','Helvetica Neue',sans-serif;max-width:860px;
  margin:0 auto;padding:48px 28px;background:#ffffff !important;color:#1a1a1a !important;line-height:1.8}
h1{font-size:1.9em;color:#0f172a !important;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-top:0}
h2{font-size:1.4em;color:#1e3a5f !important;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:2em}
h3{font-size:1.15em;color:#334155 !important;margin-top:1.5em}
p{color:#1a1a1a !important}
a{color:#2563eb !important}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #cbd5e1;padding:8px 14px;color:#1a1a1a !important;background:#ffffff !important}
th{background:#f1f5f9 !important;font-weight:600}
tr:nth-child(even) td{background:#f8fafc !important}
code{background:#f1f5f9 !important;color:#0f172a !important;padding:2px 6px;border-radius:4px;font-size:.9em}
pre{background:#f1f5f9 !important;color:#0f172a !important;padding:16px;border-radius:8px;overflow-x:auto}
blockquote{border-left:4px solid #3b82f6;padding-left:16px;color:#475569 !important;background:#f8fafc !important;margin:1em 0;padding:12px 16px;border-radius:0 6px 6px 0}
hr{border:none;border-top:1px solid #e2e8f0;margin:2em 0}
"""

html = f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="color-scheme" content="light"><style>{css}</style></head><body>{body}<hr><p style="color:#94a3b8 !important;text-align:center;font-size:.85em">由DeepClaw 🦞 生成 · {datetime.date.today()}</p></body></html>'
with open('report.html','w',encoding='utf-8') as f:
    f.write(html)
print("report.html 已生成")
```

若 markdown 库未安装：`pip install markdown`

更新 TODO.md：`- [x] 完整科研报告（report.md + report.html）`

写入 SUMMARY.md（追加）：
```markdown
## 阶段 6 摘要 · {日期}
- 报告：{N 词，N 章节}
- EV 覆盖率：{N}%（有引用 / 含文献结论句总数）
- 章节字数：摘要 {N} / 相关工作 {N} / 研究方法 {N}
```

---

## 验收门：报告完整门

| 条件 | 要求 |
|------|------|
| 章节完整 | 8 个必要章节均存在（摘要 / 引言 / 相关工作 / 研究空白 / 研究方法 / 实验设计 / 预期结果 / 参考文献） |
| **可行性方案完整** | 研究方法章节必须包含 4.1 核心方案、4.2 实施路径、4.3 可行性与风险三个子节，任一缺失 → FAIL |
| **方案可落地** | 4.1 / 4.2 中每个关键技术决策必须具体到"能判断能否执行"；出现"将采用先进方法"等空洞表述 → FAIL |
| **风险与应对** | 4.3 节主要障碍 ≥ 2 条，每条有对应应对方案 |
| **报告语言** | **正文为中文**（论文原标题、专有名词、代码片段除外）；检测方法：随机抽取 5 段正文，中文字符占比 ≥ 60%，否则 FAIL，必须重写为中文 |
| EV 标注 | 含文献结论的句子后有 [EV-xxx] |
| 证据覆盖率 | ≥ 80%（含文献结论句中有 EV 引用的比例） |
| 分章节 EV 最低数 | 相关工作 ≥ 5 / 研究空白 ≥ 2 / 研究方法 ≥ 4 / 实验设计 ≥ 3 / 预期结果 ≥ 3 |
| 研究方法句子级 | 每个方法来源、设计决策、优势声明均有 EV 或 [MATERIAL GAP] |
| 预期结果句子级 | 每个预期指标对应已有 SOTA 数值的 EV，无凭空估算 |
| EV 位置记录 | evidence.json 中所有 EV 的 claim_location 已填写 |
| 报告字数 | ≥ 1000 字（中文字符计数） |
| 文件存在 | report.md + report.html 均存在 |
| [MATERIAL GAP] 上限 | ≤ 总结论句数的 20% |
| 预承诺记录 | 报告质量预承诺已写入 report.md 头部 |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（report.md 是本阶段核心产出）
python scripts/passport.py <slug> sign state/projects/<slug>/report.md 6

# 2. 验证 EV 覆盖率（要求 ≥80%）
python scripts/ev_manager.py <slug> coverage state/projects/<slug>/report.md

# 3. 验证 MATERIAL GAP 比例（要求 ≤20%）
python scripts/ev_manager.py <slug> gap-count state/projects/<slug>/report.md

# 4. 门控检查（报告完整门）
python scripts/gate_check.py <slug> 6
```

- PASS → 更新 TODO.md `[x] 阶段 6：科研报告`，进入 S7 claim-auditor（强制审计）
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程（常见原因：EV 覆盖率不足或章节缺失）
