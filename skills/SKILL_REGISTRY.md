# Skill 索引

所有 Skill 的完整规格见对应目录下的 `SKILL.md`。流水线顺序依赖链见 `SCIENTIST.md §1.6`。

---

## 标准流水线（S1–S7）

| # | Skill ID | 文件 | 职责 | 验收门 |
|---|----------|------|------|--------|
| S1 | arxiv-search | [skills/arxiv-search/SKILL.md](arxiv-search/SKILL.md) | arXiv 深度搜索 + Triage 评分 + 异议搜索 | 文献覆盖门 |
| S2 | semantic-scholar | [skills/semantic-scholar/SKILL.md](semantic-scholar/SKILL.md) | Semantic Scholar API + 引用链分析 | 文献覆盖门（与 S1 合并） |
| S3 | paper-reader | [skills/paper-reader/SKILL.md](paper-reader/SKILL.md) | 全文精读 + EV 提取 + [MATERIAL GAP] 标注 | 精读完整门 |
| S4 | literature-synthesis | [skills/literature-synthesis/SKILL.md](literature-synthesis/SKILL.md) | Related Work + 对比表 + Gap 列表 + Sprint Contract | 综述质量门 |
| S5 | research-planner | [skills/research-planner/SKILL.md](research-planner/SKILL.md) | Socratic 对话 + Gap→假设 + 实验设计 | 研究计划门 |
| S6 | report-writer | [skills/report-writer/SKILL.md](report-writer/SKILL.md) | 完整科研报告 + Sprint Contract + EV 覆盖率 | 报告完整门 |
| S7 | science-slides | [skills/science-slides/SKILL.md](science-slides/SKILL.md) | 开题 PPT（python-pptx，支持用户模板） | PPT 结构门 |

---

## 质量保障 Skill（S8–S9，按需触发）

| # | Skill ID | 文件 | 职责 | 典型触发时机 |
|---|----------|------|------|------------|
| S8 | claim-auditor | [skills/claim-auditor/SKILL.md](claim-auditor/SKILL.md) | 引用忠实度审计：核查 EV claim_text 是否忠实于 original_text | report.md 完成后；DA 要求验证时 |
| S9 | paper-reviewer | [skills/paper-reviewer/SKILL.md](paper-reviewer/SKILL.md) | 双流同行评审：4 位标准评审 + Devil's Advocate | S8 通过后；或用户请求批判性反馈时 |

---

## 调用说明

- **流水线模式**：S1 → S2 → S3 → S4 → S5 → S6 → S7，严格顺序依赖
- **S8/S9 独立触发**：不强制纳入流水线，可在 S6 完成后选择性运行
- **DA-CRITICAL 阻断**：S9 的 Devil's Advocate 若提出 DA-CRITICAL 项，必须在报告中明确回应后方可通过
- **各阶段摘要**：每个 Skill 完成后写入项目 `SUMMARY.md`，格式见各 SKILL.md 的「输出路径」节
