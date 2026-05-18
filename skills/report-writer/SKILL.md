# Skill 6：report-writer — 完整科研报告

**触发**：研究规划完成，需生成完整科研提案或报告。

**输出**：`report.md`（可编辑）+ `report.html`（可分享，单列博客风格，内嵌 CSS）。

---

## 写作前证据预审（Sprint Contract）

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

## Abstract（100-150 词英文）
## 1. Introduction
## 2. Related Work（使用 literature-synthesis 生成内容，保留 [EV-xxx] 标注）
## 3. Research Gap & Motivation
## 4. Proposed Methodology
## 5. Experiment Design
## 6. Expected Results
## 7. Timeline
## 8. References（APA 格式，来自论文库）
```

每个含文献结论的句子后附 `[EV-xxx]`；无证据支撑的声明必须改写或打 `[MATERIAL GAP]` 标签，不得删除信息缺口。

---

## HTML 生成（bash_exec）

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

html = f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>{css}</style></head><body>{body}<hr><p style="color:#999;text-align:center;font-size:.85em">由小科 🔬 生成 · {datetime.date.today()}</p></body></html>'
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
