# Skill：outreach — 套磁流水线

**触发关键词（强制触发，不可跳过）**：
`套磁` / `套瓷` / `联系老师` / `联系教授` / `发邮件给教授` / `找导师` / `找实习` / `找RA` /
`outreach` / `cold email` / `professor` / `faculty` / `邮件模板` / `申请邮件` / `套导师`

**检测规则**：用户消息中出现上述任意词汇 → **立即进入本 Skill，在 Step 0 完成前禁止任何 web_search / web_fetch / exec 调用**。

**不适用**：纯文献调研（→ arxiv-search）；写论文（→ report-writer）。

---

## Step 0：项目初始化（HARD STOP — 每次必须执行）

**在进行任何调研或生成任何内容之前**，按顺序完成以下三步：

### 0-A：确认项目 Slug

向用户提问：
```
这次套磁属于哪个申请批次？请给一个英文标识符（如 phd-2027-fall 或 ra-2026-summer）
```

等待用户回答，拿到 slug 后继续。

### 0-B：初始化项目（exec 强制）

检查 `state/outreach/<slug>/outreach_state.json` 是否存在：
- 存在 → 跳过，显示"✅ 已有项目 <slug>，继续"
- 不存在 → 立即执行：

```
exec: python3 scripts/init_outreach.py <slug>
```

等待 exec 返回，确认输出中含"初始化完成"字样。

### 0-C：添加教授联系人（exec 强制）

向用户确认教授基础信息（姓名、机构，其余可选）：
```
请提供教授信息：
- 姓名：
- 机构：
- 主页（可选）：
- 邮箱（可选，不确定可以后续补充）：
- 类型：PhD / RA
```

信息确认后立即执行：
```
exec: python3 scripts/outreach_manager.py <slug> add \
  --name "<姓名>" --institution "<机构>" \
  [--homepage <url>] [--email <email>] [--type phd|ra]
```

等待 exec 返回，记录分配到的联系人 ID（如 CTX-001）。

**以上三步全部完成后，方可进入 O1 调研阶段。**

---

## Step 1 (O1)：深度调研

### O1a：主页与邮箱抓取

依次尝试（有结果即可停下，不必穷举）：
1. 用户提供的 homepage → `web_fetch <url>`
2. `web_search "<姓名> <机构> professor homepage"`
3. `web_search "<姓名> site:<机构域名> faculty"`

抓取后立即提取并持久化：
```
exec: python3 scripts/outreach_manager.py <slug> note <CTX-xxx> \
  "O1a: 邮箱=<email或未找到> | 主页=<url> | 招生状态=<found text或unknown>"
```

若邮箱已在主页找到，更新 email 字段：
```
exec: python3 scripts/outreach_manager.py <slug> note <CTX-xxx> \
  "找到邮箱：<email>，来源：<url>"
```

### O1b：论文重要性评分

获取论文列表（按优先级）：
1. 主页 Publications 页
2. `web_search "site:scholar.google.com <姓名>" `
3. `web_fetch https://api.semanticscholar.org/graph/v1/author/search?query=<姓名>&fields=papers,citationCount`

对每篇论文评分（paper_score = 0.35×时间 + 0.30×作者位置 + 0.20×期刊档次 + 0.15×引用率），得分 ≥ 0.5 的论文读全文（`web_fetch arxiv.org/html/<id>`）。

聚类输出 top-3 研究主线后立即持久化：
```
exec: python3 scripts/outreach_manager.py <slug> profile <CTX-xxx> \
  --themes "<主题1>:<分数>,<主题2>:<分数>" \
  --lab-style engineering|theory|interdisciplinary \
  --lab-activity active|moderate|inactive \
  --openings PhD|RA|unknown
```

**每获得一批有效信息就调用一次 note，不得攒到最后批量写入。**

### O1c：实验室风格推断

根据论文类型、主页措辞、学生规模推断风格。结果写入 profile 的 `--lab-style`。

### O1d：个人深度挖掘 + 流言板（见 pipelines/outreach.md §O1d 完整规格）

搜索范围（O1a 之外）：
- 个人 bio/talks/awards/教学/毕业生去向
- 课题组新闻、招募公告、在研项目
- Twitter/X、Reddit、新闻、YouTube 演讲、LinkedIn 校友

每条有价值信号立即落盘：
```
exec: python3 scripts/outreach_manager.py <slug> rumor <CTX-xxx> \
  --source <来源类型> --content "<内容摘要>" \
  [--url <链接>] --sentiment positive|negative|neutral \
  --relevance <相关维度>
```

LinkedIn 结构化抓取（若已配置 Bright Data Token）：
```
exec: python3 scripts/linkedin_scraper.py <slug> <CTX-xxx> profile --url <linkedin_url>
exec: python3 scripts/linkedin_scraper.py <slug> <CTX-xxx> alumni --last-name <姓> --institution <机构>
exec: python3 scripts/linkedin_scraper.py <slug> <CTX-xxx> posts --url <linkedin_url>
```
无 Token 时脚本自动跳过，改用 web_search 策略（见 pipelines/outreach.md §O1d）。

O1d 完成后查看流言板：
```
exec: python3 scripts/outreach_manager.py <slug> rumor-board <CTX-xxx>
```

---

## Step 1.5 (O1.5)：邮箱确认（HARD STOP）

展示当前 email 状态：
```
╔══ 邮箱确认 ══════════════════════════════════╗
║  教授：<name> @ <institution>               ║
║  当前邮箱：<email 或 "未找到">              ║
╚══════════════════════════════════════════════╝
请确认邮箱，或提供正确邮箱后继续。
```

用户确认后执行：
```
exec: python3 scripts/outreach_manager.py <slug> verify-email <CTX-xxx> "<email>"
```

---

## Step 2 (O2)：画像匹配

读取 `USER_PROFILE.md`，与教授 top-3 研究主线逐条比对，找 ≥2 个具体交集（方法/数据集/任务名）。

根据 lab_style + lab_activity 选择邮件风格：
- A（活跃+工程型）/ B（资深+正式型）/ C（交叉+开放型）

写入：
```
exec: python3 scripts/outreach_manager.py <slug> profile <CTX-xxx> \
  --style A|B|C \
  --match-points "<交集1>;<交集2>"
```

---

## Step 3 (O3)：起草邮件

根据风格 A/B/C + 类型 PhD/RA 选择模板（见 pipelines/outreach.md §O3），填入具体内容后写入文件：
```
exec: python3 -c "
content = '''<邮件全文>'''
open('state/outreach/<slug>/drafts/<CTX-xxx>.md', 'w', encoding='utf-8').write(content)
"
```

---

## Step 4 (O4)：质量门

```
exec: python3 scripts/outreach_gate_check.py <slug> G3 <CTX-xxx>
```

展示完整输出。FAIL → 修改草稿 → 重新检查。

---

## Step 5 (O5)：用户审阅

展示草稿，等待用户操作：
- 确认发送 → `exec: python3 scripts/outreach_manager.py <slug> mark-sent <CTX-xxx> --type phd|ra`
- 需修改 → 返回 Step 3
- 记录回复 → `exec: python3 scripts/outreach_manager.py <slug> mark-replied <CTX-xxx> --sentiment positive|negative|neutral`

完成后展示统计：
```
exec: python3 scripts/outreach_manager.py <slug> stats
```

---

## 执行步骤（强制）

| 节点 | 必须调用 | 时机 |
|------|---------|------|
| Step 0-B | `init_outreach.py <slug>` | 项目不存在时 |
| Step 0-C | `outreach_manager.py <slug> add` | 添加每位教授时 |
| O1a 完成 | `outreach_manager.py <slug> note` | 每次获得主页信息 |
| O1b 完成 | `outreach_manager.py <slug> profile --themes ...` | 论文评分完成后 |
| O1d 每条信号 | `outreach_manager.py <slug> rumor --source ... --content ...` | 每发现一条软信号后立即执行 |
| O1d 完成 | `outreach_manager.py <slug> rumor-board <CTX-xxx>` | O1d 结束后展示流言板 |
| O1.5 | `outreach_manager.py <slug> verify-email` | 用户确认邮箱后 |
| O2 完成 | `outreach_manager.py <slug> profile --style --match-points` | 匹配完成后 |
| O3 完成 | `python3 -c "open(...).write(...)"` | 草稿写入磁盘 |
| O4 | `outreach_gate_check.py <slug> G3 <CTX>` | 草稿完成后 |
| O5 | `outreach_manager.py <slug> mark-sent` | 用户确认发送后 |

---

## 红线

- 禁止在 Step 0 完成前做任何 web_search / web_fetch
- 禁止编造或假设邮箱：只使用 verify-email 确认过的地址
- 禁止只在对话中输出分析而不调用 exec 落盘
- 禁止自动发送邮件：O5 必须等用户明确确认
