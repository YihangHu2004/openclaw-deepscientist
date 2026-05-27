# Skill 6：report-writer — 完整科研报告

**触发**：研究规划完成，需生成完整科研提案或报告。

**输出**：`report.md`（可编辑）+ `report.html`（可分享，单列博客风格，内嵌 CSS）。

---

## 写作前证据预审（Sprint Contract）

先运行 `python scripts/evidence_memory.py <slug> query "<topic>" --top-k 5`，确认核心主题已有可用 EV；默认不使用 `unsupported` EV。

**先写预承诺评分标准，再动笔（预承诺后不得修改标准）**：
```markdown
## 报告质量预承诺 · {日期}
- EV 覆盖率目标：≥ 80%
- [MATERIAL GAP] 上限：≤ 总结论句数 20%
- 各章节 EV 最低数：Intro ≥ 2 / Related Work ≥ 5 / Methodology ≥ 2 / Experiment ≥ 2
- 不合格处理：返回精读，不降低标准
```

然后检查 evidence.json：
1. verified=true 的 EV 总数是否 ≥ 10
2. 各章节各有 ≥ 2 条 EV 支撑
3. 统计已有 `[MATERIAL GAP]` 数量，超过 20% 则先返回 paper-reader 补充
4. 覆盖率不足时 → 返回精读补充，或标注"证据不足"降级

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
## 五、实验设计
## 六、预期结果
## 七、时间规划
## 八、参考文献（APA 格式，来自论文库）
```

每个含文献结论的句子后附 `[EV-xxx]`；无证据支撑的声明必须改写或打 `[MATERIAL GAP]` 标签，不得删除信息缺口。

---

## HTML 生成（exec）

```python
import markdown, datetime
with open('report.md', encoding='utf-8') as f:
    body = markdown.markdown(f.read(), extensions=['tables','fenced_code','toc'])

css = """body{font-family:-apple-system,'PingFang SC',sans-serif;max-width:800px;
  margin:0 auto;padding:40px 20px;background:#fafafa;color:#222;line-height:1.7}
h1,h2,h3{color:#1a1a2e;border-bottom:1px solid #e0e0e0;padding-bottom:8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px}
th{background:#f0f4ff}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}
pre{background:#f4f4f4;padding:16px;border-radius:8px;overflow-x:auto}
blockquote{border-left:4px solid #4a90e2;padding-left:16px;color:#555}"""

html = f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>{css}</style></head><body>{body}<hr><p style="color:#999;text-align:center;font-size:.85em">由DeepClaw 🦞 生成 · {datetime.date.today()}</p></body></html>'
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
- 章节字数：Abstract {N} / Related Work {N} / Methodology {N}
```

---

## 验收门：报告完整门

| 条件 | 要求 |
|------|------|
| 章节完整 | 8 个必要章节均存在（Abstract / Introduction / Related Work / Gap / Methodology / Experiment / Results / References） |
| EV 标注 | 含文献结论的句子后有 [EV-xxx] |
| 证据覆盖率 | ≥ 80%（含文献结论句中有 EV 引用的比例） |
| EV 位置记录 | evidence.json 中所有 EV 的 claim_location 已填写 |
| 报告字数 | ≥ 1000 词 |
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
