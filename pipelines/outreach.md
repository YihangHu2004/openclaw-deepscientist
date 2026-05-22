# pipelines/outreach.md — DeepClaw 套磁流水线配置

> 仅当 intent_router 路由到 pipeline=outreach 时读取。
> 通用身份见 `SCIENTIST.md`，用户信息见 `USER_CONFIG.md` + `USER_PROFILE.md`。

---

## §O0 上下文确认（到达此文件时 STEP 0 已在 SCIENTIST.md 完成）

**当此文件被加载时，SCIENTIST.md §1.2 的 STEP 0（0-A/0-B/0-C）必须已经完成**：
- `<slug>` 已确认
- `state/outreach/<slug>/outreach_state.json` 已创建（init_outreach.py 已运行）
- 教授联系人已通过 `outreach_manager.py add` 写入，CTX-xxx ID 已知

如果以上任一项未完成 → **停止，返回 SCIENTIST.md §1.2 STEP 0 执行**。

### 加载顺序（到达 §O1 前必须完成）

1. `USER_PROFILE.md`（用户学术画像）
   - 不存在 → 停止并提示：
     ```
     ⚠️ USER_PROFILE.md 未找到
     请将 USER_PROFILE.example.md 复制为 USER_PROFILE.md 并填写个人信息后继续。
     ```
2. `state/outreach/<slug>/contacts.json`（联系人库，含 CTX-xxx）
3. `state/outreach/<slug>/outreach_state.json`（项目状态）

### 调研即时落盘规则（整个流水线强制）

每次获得新信息后立即运行（不得等到调研结束批量写入）：
```
exec: python3 scripts/outreach_manager.py <slug> note <CTX-xxx> "调研笔记内容"
```
禁止只在对话中输出分析而不调用 exec 落盘。

---

## §O1 单教授深度调研（O1a + O1b + O1c）

用户提供：教授姓名 / 主页 URL / 论文链接 / 邮箱（可选）

### O1a：主页抓取

**目标主页**（按优先级）：
1. 用户提供的直接 URL
2. web_search `"{教授姓名}" site:{机构域名} faculty`
3. web_search `"{教授姓名}" {机构} professor homepage`

**抓取内容**：
- 邮箱（正则 `[\w.+-]+@[\w-]+\.[\w.-]+`）
- 实验室/课题组主页链接（关键词：Lab / Group / Team）
- 招生信息（关键词：PhD students / openings / prospective / I am looking for / join my group）
- 当前在读学生列表（估算实验室规模）
- 在研项目（grants / projects 页面）
- 教授个人简历/bio

**若课题组主页存在**：追加抓取，提取：
- 实验室研究方向描述
- 毕业生去向（学术/工业）
- 实验室文化线索（acknowledgments, photos, lab values）

**邮箱处理**：
- 找到 → 写入 `contacts.json[CTX-xxx].email`，`email_status: found`
- 未找到 → `email_status: unverified`，标注"邮箱待确认"
- 用户提供 → `email_status: user_provided`，`email_verified: true`

调用脚本：
```bash
python scripts/outreach_manager.py <slug> note CTX-xxx "O1a: 主页抓取结果摘要"
```

---

### O1b：论文重要性评分

**获取论文列表**（按优先级）：
1. 教授主页上的 Publications 列表
2. `https://api.semanticscholar.org/graph/v1/author/search?query={name}&fields=papers`
3. web_search `site:scholar.google.com "{教授姓名}"`

**对每篇论文计算 paper_score**：

```
paper_score = 0.35 × time_weight
            + 0.30 × author_position_score
            + 0.20 × venue_score
            + 0.15 × citation_rate_score
```

| 维度 | 规则 |
|------|------|
| **time_weight** | 0-2年：1.0 / 3-4年：0.7 / 5年：0.45 / >5年：0.25 |
| **author_position_score** | 通讯/独立一作：1.0 / 最后一作：0.85 / 第二作：0.55 / 中间：0.25 |
| **venue_score** | 顶会顶刊(NeurIPS/ICML/ICLR/Nature/ACL/CVPR等)：1.0 / 二线：0.75 / Workshop/arXiv：0.4 / 未知：0.5 |
| **citation_rate_score** | ≥50/年：1.0 / 20-50：0.75 / 5-20：0.5 / <5：0.25 / 发表<6月：0.5 |

**主题聚类**：
- 对 paper_score ≥ 0.45 的论文提取标题关键词
- 手动分组为 2-5 个主题（如：CoT reasoning / multimodal / efficient inference）
- 每个主题的总分 = 该主题内论文 paper_score 之和（归一化到 0-1）
- 输出：top-3 主题，每个附代表论文和得分

**全文读取**（对 score ≥ 0.6 的论文）：
- 优先 `https://arxiv.org/html/{id}`（Trafilatura 语义提取）
- 备选 `https://arxiv.org/pdf/{id}`
- 超过 5000 tokens：保留前 2000 + 后 1000

调用脚本：
```bash
python scripts/outreach_manager.py <slug> profile CTX-xxx \
  --themes "CoT reasoning:0.82,math reasoning:0.71,program synthesis:0.58" \
  --lab-activity active
```

---

### O1c：实验室风格推断

根据以下信号判断：

| 信号 | 推断 |
|------|------|
| 近2年顶会论文≥3篇 | lab_activity: active |
| 论文多为系统实现/工程优化 | lab_style: engineering |
| 论文多为定理/数学证明 | lab_style: theory |
| 论文跨多个领域 | lab_style: interdisciplinary |
| 实验室页面有多张合作照片/活动 | 推断开放、活跃氛围 |
| 网站列出毕业生去工业界比例高 | 工程导向 |
| 有明确的"recruiting"声明 | current_openings: PhD/RA |

---

### O1d：个人深度挖掘 + 课题组动态 + 流言板

O1a/b/c 聚焦学术档案，O1d 聚焦"这个人是什么样的"。由于目标信息分散在各通用平台，且很多平台有登录墙，需要先建立身份索引再分平台探测。

---

#### 阶段 0：身份索引（先做，3分钟）

在任何平台搜索前，从 O1a 结果和一次综合搜索中提取教授的全部网络身份：

```
web_search: "{姓名}" professor "{机构}" twitter OR github OR linkedin OR blog
```

提取并记录：
- **Twitter/X handle**（若主页有链接优先用；否则从搜索结果找）
- **实验室名称**（官方全称，用于后续搜索）
- **Google Scholar 个人页 URL**（`scholar.google.com/citations?user=...`）
- **GitHub 用户名**（部分工程型教授有）
- **博客/个人网站**（非机构域名的个人博客）
- **DBLP 作者页**（`dblp.org/pid/...`）

将所有找到的身份记为 note：
```bash
python scripts/outreach_manager.py <slug> note CTX-xxx \
  "O1d身份索引: twitter=@handle | lab=Lab Name | scholar=url | github=user"
```

---

#### 阶段 1：主页深挖（抓取 O1a 已获得的主页，提取更多维度）

对 O1a 中抓取的主页重新扫描，关注以下页面/字段（这些在 O1a 中被跳过）：

| 目标页面 | 提取内容 | rumor 分类 |
|----------|---------|-----------|
| Talks / Invited Talks | 近2年演讲列表（会议+年份+主题） | `conference_talk` / `awards` |
| Awards & Honors | 获奖列表、Fellowship | `awards` |
| Teaching | 近期授课（了解教学负担） | `personality` |
| Students / Alumni | 毕业生去向（学术/工业比例）；在读生数量 | `mentorship` / `lab_culture` |
| Bio / About | 研究哲学、个人陈述 | `homepage_bio` / `personality` |

若以上页面不在主页根目录，尝试：
```
web_fetch: {homepage}/talks  或  {homepage}/people  或  {homepage}/about
```

---

#### 阶段 2：课题组主页（若 lab_homepage 已知）

```
web_fetch: {lab_homepage}/news       # 实验室新闻
web_fetch: {lab_homepage}/join       # 招募信息
web_fetch: {lab_homepage}/projects   # 在研项目与资金
web_fetch: {lab_homepage}/people     # 成员规模与构成
```

若 lab_homepage 未知，尝试：
```
web_search: "{实验室名称}" site:{机构域名}
web_search: "{姓名}" lab news 2024 2025 site:{机构域名}
```

---

#### 阶段 3：平台分层搜索（各平台策略不同）

⚠️ **访问现实**：Twitter/LinkedIn 主要内容在登录墙后，`web_fetch` 大概率失败。主要依赖 `web_search` 摘要片段，不要在 web_fetch 失败后重试多次。

---

**A. Twitter/X**（优先用已知 handle，否则间接获取）

```
# 若 handle 已知：
web_search: site:x.com/{handle}         # 获取 Google 缓存的推文摘要
web_fetch: https://x.com/{handle}       # 尝试一次，失败则跳过

# 若 handle 未知：
web_search: "{姓名}" twitter machine learning 2024 2025
web_search: "{姓名}" "{机构}" @  site:x.com
```

**关注**：发帖频率、是否回复学生/社区、研究热词、情绪风格（幽默/严肃/活跃/沉默）

---

**B. Reddit**（最容易获取，优先探测）

```
# 按相关子版块搜索（比 site:reddit.com 更精准）：
web_search: "{姓名}" site:reddit.com/r/MachineLearning
web_search: "{姓名}" site:reddit.com/r/gradadmissions
web_search: "{姓名}" site:reddit.com/r/cscareerquestions
web_search: "{姓名}" "{机构}" site:reddit.com

# 间接搜索（教授可能没被直接提名，但被间接讨论）：
web_search: "{实验室名称}" reddit
web_search: "{机构} {研究方向} PhD" site:reddit.com/r/gradadmissions
```

若找到帖子，`web_fetch` 该帖 URL 获取完整讨论内容。

---

**C. YouTube / 演讲视频**

```
web_search: "{姓名}" keynote OR "invited talk" site:youtube.com
web_search: "{姓名}" "{研究方向}" talk 2023 OR 2024 OR 2025
web_search: "{姓名}" NeurIPS OR ICML OR ICLR OR ACL talk
```

若找到视频，`web_fetch` 视频页面提取：标题、描述、评论摘要（演讲风格推断）。

---

**D. 新闻 / 媒体报道**

```
web_search: "{姓名}" interview 2024 2025
web_search: "{姓名}" "{机构}" press release
web_search: "{姓名}" site:technologyreview.com OR site:wired.com OR site:spectrum.ieee.org
web_search: "{姓名}" site:{机构域名} news
```

---

**E. 科研社区平台**（比论文库更"人味"）

```
# ResearchGate（可 web_fetch，有 Q&A 和关注数）
web_fetch: https://www.researchgate.net/profile/{姓名拼接}
web_search: "{姓名}" site:researchgate.net

# Google Scholar（h指数、合作网络）
web_fetch: {scholar_url}  # 从身份索引阶段获取的 URL

# Semantic Scholar 作者页（已在 O1b 用过，但作者主页有 co-author 图）
web_fetch: https://api.semanticscholar.org/graph/v1/author/search?query={姓名}&fields=hIndex,citationCount,paperCount
```

---

**F. LinkedIn**（优先用 Bright Data scraper，降级用 web_search）

若 `USER_CONFIG.md` 中已填写 `Bright Data API Token`，使用结构化抓取（质量更高）：

```bash
# 教授本人档案（需 LinkedIn 个人页 URL，通常在主页可找到）
python scripts/linkedin_scraper.py <slug> CTX-xxx profile \
  --url "https://www.linkedin.com/in/profx"

# PhD 校友去向（按姓氏 + 机构搜索）
python scripts/linkedin_scraper.py <slug> CTX-xxx alumni \
  --last-name "Smith" --institution "MIT" --count 15

# 教授 LinkedIn 近期动态（了解沟通风格）
python scripts/linkedin_scraper.py <slug> CTX-xxx posts \
  --url "https://www.linkedin.com/in/profx" --count 5
```

若无 API Token（脚本输出"跳过"），降级为 web_search 策略：

```
web_search: "PhD {lastname}" OR "advised by {lastname}" site:linkedin.com
web_search: "{实验室名称}" alumnus OR graduate site:linkedin.com
web_search: "{机构}" "{研究方向}" "PhD student" OR "postdoc" site:linkedin.com
```

从摘要片段提取：毕业生去向（Google/Meta/OpenAI/学术教职）、平均年限、在读生数量。

---

**G. 资助信息**（NSF/NIH 等公开数据库）

```
web_search: "{姓名}" NSF award 2023 2024 2025
web_fetch: https://www.nsf.gov/awardsearch/simpleSearchResult?queryText={lastname}&ActiveAwards=true

web_search: "{姓名}" NIH grant 2024
web_search: "{姓名}" DARPA OR DOE OR ARO research program
```

活跃的资助 = lab_activity:active + 短期内可能有 RA/PhD 名额。

---

**H. RateMyProfessors**（本科课堂评价，仅供参考）

```
web_search: "{姓名}" site:ratemyprofessors.com
```

若有评分，关注 mentorship/difficulty 维度的评语（研究生导师与本科教学风格可能不同，权重低）。

---

#### 流言板写入规则

每条有效信号立即执行一次 `rumor` 命令：

```bash
python scripts/outreach_manager.py <slug> rumor CTX-xxx \
  --source <来源类型> \
  --content "<内容摘要（50-150字）>" \
  [--url <原始链接>] \
  --sentiment positive|negative|neutral \
  --relevance <维度>
```

**写入标准**：
- ✅ 写入：有具体信息的（"教授在 2025 ICML 做了关于 X 的 keynote"）
- ✅ 写入：明确的情感信号（"Reddit 用户说该教授 respond 很慢但 feedback 质量高"）
- ❌ 不写入：搜索无结果（在 note 里说明 "Twitter: 未找到账号"）
- ❌ 不写入：无信息量的（"该教授存在 LinkedIn 档案"）

**O1d 结束后展示流言板**：
```bash
python scripts/outreach_manager.py <slug> rumor-board CTX-xxx
```

**O1d 完成信号**（以下维度各至少有1条记录，或 note 中注明"未找到"）：
- 教授个人性格/沟通风格（来自 twitter / blog / talks）
- 实验室文化或师生关系（来自 reddit / linkedin / alumni）
- 近期动态：招募/资助/项目（来自 lab_news / nsf / homepage）

---

## §O1.5 邮箱确认 HARD STOP

**这是强制等待点。在用户确认邮箱之前，不得进入 O2。**

展示给用户：
```
╔══ 邮箱确认 ══════════════════════════════════════════╗
║  教授：{name} @ {institution}                       ║
║  找到邮箱：{email}（来源：{email_status}）           ║
║  或：未找到邮箱，请提供                             ║
╠══════════════════════════════════════════════════════╣
║  请确认此邮箱正确，或提供正确邮箱后继续             ║
╚══════════════════════════════════════════════════════╝
```

用户确认后运行：
```bash
python scripts/outreach_manager.py <slug> verify-email CTX-xxx "confirmed@email.edu"
```

---

## §O2 画像构建与用户匹配

读取 `USER_PROFILE.md` 中的研究方向和项目，逐条与教授 top-3 研究主题对比：

**匹配原则**：
- 找 ≥2 个**具体**交集（方法名/数据集名/任务名，不接受"都研究NLP"这种泛称）
- 好交集示例："both use GSM8K benchmark" / "shared interest in chain-of-thought step verification" / "I use a similar CoT distillation approach in my project X"
- 坏交集示例："both work on LLM" / "interested in the same area"

**邮件风格决策**（基于教授画像）：

| 风格 | 触发条件 | 写法特征 |
|------|---------|---------|
| A · 技术对等型 | lab_activity=active + 近2年≥3篇顶会 + lab_style=engineering | 开门见山谈方法/结果，无寒暄，≤120词 |
| B · 学术正式型 | 资深教授（建组>10年）或 lab_style=theory 或大实验室 | 结构化段落，尊重传统学术格式，≤150词 |
| C · 探索合作型 | lab_style=interdisciplinary 或跨领域论文 或 homepage tone 开放 | 强调共同兴趣+开放问题，略长可至160词 |

调用脚本：
```bash
python scripts/outreach_manager.py <slug> profile CTX-xxx \
  --style A \
  --match-points "both use GSM8K;both work on CoT step-level verification"
```

---

## §O3 邮件起草

根据风格（A/B/C）和类型（PhD/RA）选择模板，填入具体内容。

### 风格 A · 技术对等型（PhD，≤120词）

```
Subject: Prospective PhD Student — [Research Area]

Dear Professor [Last Name],

Your recent paper "[Exact Paper Title]" caught my attention, particularly
[one specific technical contribution in ≤1 sentence].

I am a [year] student at [institution] working on [your area]. In my project
[Project Name], I [brief description with one concrete result].
This connects directly to your work on [specific link].

I am applying for PhD positions starting [semester] and would be very
interested in joining your group. I have attached my CV.

Best,
[Name]
```

### 风格 B · 学术正式型（PhD，≤150词）

```
Subject: PhD Application Inquiry — [Your Research Area]

Dear Professor [Last Name],

I am writing to express my interest in pursuing a PhD in your research
group. I came across your work on "[Paper Title]" and was particularly
drawn to [specific aspect in ≤1 sentence].

I am currently a [year] student at [institution], where I have been
working on [research area]. My project [Project Name] focuses on
[brief description], achieving [result if any]. This experience has
prepared me to contribute to [specific direction in professor's work].

I am applying to PhD programs for [semester] and believe my background
aligns well with your group's research. I would be honored to discuss
potential opportunities.

Sincerely,
[Name]
```

### 风格 A · 技术对等型（RA，≤100词）

```
Subject: Research Assistant Inquiry — [Semester]

Dear Professor [Last Name],

I read "[Paper Title]" and found your approach to [specific method]
compelling. I'm a [year] student at [institution] with hands-on
experience in [relevant skill], currently working on [project].

I'd like to contribute to your group as an RA for [semester].
I could specifically help with [concrete task related to their work].

CV attached. Happy to chat if this could be useful.

Best,
[Name]
```

### 风格 C · 探索合作型（≤160词）

```
Subject: Research Interest — [Shared Topic]

Dear Professor [Last Name],

I've been following your lab's work on [theme], especially your paper
"[Title]" which raises interesting questions about [open problem].

I'm a [year] student at [institution] working on [related area].
In [Project Name], I've been exploring [connection to professor's work].
I find that [specific observation bridging both directions].

I'm applying for PhD positions for [semester] and would be excited to
explore this intersection further in your group. I'm genuinely curious
whether [specific technical question about their work].

I'd love to hear your thoughts if you have a moment.

Best,
[Name]
```

草稿写入路径：`state/outreach/<slug>/drafts/CTX-xxx.md`

写入后将 `status` 改为 `draft`：
```bash
python scripts/outreach_manager.py <slug> note CTX-xxx "O3完成：草稿写入 drafts/CTX-xxx.md"
```

---

## §O4 质量门 G3

```bash
python scripts/outreach_gate_check.py <slug> G3 CTX-xxx
```

G3 检查项（全部 PASS 才放行）：
1. 字数 ≤ 200（PhD）/ ≤ 150（RA）
2. 含≥1 具体论文/项目专有名词
3. 无套话黑名单词：`very passionate / deeply inspired / dream school / honored / truly fascinated / big fan`
4. 含 USER_PROFILE.md `keywords:` 中定义的关键词≥1
5. `email_verified == true`

FAIL → 修改草稿 → 重新检查（最多 2 次自动修改）。

---

## §O5 用户审阅与发送

展示最终草稿给用户，等待操作：
- 用户确认 → `mark-sent`
- 用户要求修改 → 返回 O3 重新起草
- 用户放弃 → 保持 `draft` 状态

```bash
python scripts/outreach_manager.py <slug> mark-sent CTX-xxx --type phd
python scripts/outreach_manager.py <slug> mark-replied CTX-xxx --sentiment positive
python scripts/outreach_manager.py <slug> stats
```

---

## §OX 脚本速查

```bash
# 新建 outreach 项目
python scripts/init_outreach.py <slug>

# 添加教授（用户提供信息）
python scripts/outreach_manager.py <slug> add \
  --name "Prof. Jane Smith" --institution MIT \
  --email j.smith@mit.edu \
  --homepage https://jsmith.csail.mit.edu \
  --paper-url https://arxiv.org/abs/2312.xxxxx \
  --type phd

# 调研笔记（O1 阶段）
python scripts/outreach_manager.py <slug> note CTX-001 "..."

# 写入画像（O1b+O1c+O2 阶段）
python scripts/outreach_manager.py <slug> profile CTX-001 \
  --themes "CoT:0.85,math reasoning:0.72" \
  --style A \
  --match-points "both use GSM8K;shared step-level verification interest" \
  --lab-style engineering --lab-activity active --openings PhD

# 确认邮箱（O1.5 HARD STOP）
python scripts/outreach_manager.py <slug> verify-email CTX-001 "j.smith@mit.edu"

# 质量门检查
python scripts/outreach_gate_check.py <slug> G3 CTX-001

# 发送 + 回复记录
python scripts/outreach_manager.py <slug> mark-sent CTX-001 --type phd
python scripts/outreach_manager.py <slug> mark-replied CTX-001 --sentiment positive

# 查看列表和统计
python scripts/outreach_manager.py <slug> list
python scripts/outreach_manager.py <slug> stats
```

---

## §OY 质量红线

- **不编造教授邮箱**：只使用主页找到或用户提供并确认的邮箱
- **不无来源声明**：邮件中提到的每个论文名/数据集名必须能在 contacts.json 中追溯
- **不跳过 O1.5**：邮箱未确认时 G3 门控会 FAIL，不得绕过
- **不自动发送**：发送操作须用户在 O5 明确确认，DeepClaw 不调用邮件客户端
- **不批量发送**：每封邮件独立研究，不复用未定制的模板文本
