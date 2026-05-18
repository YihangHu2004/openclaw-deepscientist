# Changelog

All notable changes to OpenClaw Scientist will be documented here.

## [0.2.0] - 2026-05-18

### 新增（借鉴 DeepScientist + ResearStudio）

**DS-1：SUMMARY.md 阶段摘要**
- 每个 Skill（S1-S7）完成后自动追加一条结构化摘要到 `SUMMARY.md`
- 内容包含：产出统计 / 关键数值 / 核心发现，供跨会话快速恢复上下文
- S7 写入最终项目完成摘要（含全流程产出清单）

**DS-3：全局基线注册表（baselines.json）**
- 新增 `state/baselines.json`：跨项目积累数据集与基线方法（schema 见 Part III）
- Skill 5 规划时先查注册表，命中则复用，未命中则搜索后写入
- §1.4 新增注册表格式说明；§1.2 项目目录新增全局文件引用

**RS-1：论文表格与图注专项提取**
- Skill 3 精读时，在 Trafilatura 提取完主文本后，额外用 BeautifulSoup 提取全部 `<table>` → Markdown 表格
- 同步提取 `<figcaption>` 图注（标题 + 位置说明）
- 表格数据优先用于 Skill 4 方法对比表；EV 引用表格数据时 claim_location 注明 "Table N"

**RS-2：Gap 子问题分解**
- Skill 5 研究计划模板新增「Gap 子问题分解」节
- 每个 Research Gap 转化为 N 条可证伪子问题（可用实验数值回答 yes/no）
- 子问题写入 SUMMARY.md 阶段 5 摘要，方便团队对齐研究目标

**RS-3：EV 置信度分级（confidence）**
- evidence.json 每条记录新增 `confidence` 字段：`high` / `medium` / `low`
- 按获取方式自动设定：全文实验数据 → high；截断全文 → medium；摘要 → low
- Skill 4 综述规则：核心数值声明须有 ≥1 条 high EV；low EV 引用须加注"待全文确认"
- Skill 3 提取规则新增置信度设置对照表

---

## [0.1.0] - 2026-05-18

### 初始版本

**核心功能**
- 7 个独立科研 Skill：arxiv-search、paper-reader、semantic-scholar、literature-synthesis、research-planner、report-writer、science-slides
- 双模式流水线：AUTO（全自动）与 INTERACTIVE（阶段审核）
- 严格顺序依赖链：S1+S2 → S3 → S4 → S5 → S6 → S7

**质量保障**
- 6 道验收门（文献覆盖门 / 精读完整门 / 综述质量门 / 研究计划门 / 报告完整门 / PPT 结构门）
- 证据协议（evidence.json）：每条 AI 声明追溯到原文段落，覆盖率 ≥ 80%

**文献相关性**
- 三步文献漏斗：搜索 → Triage 评分 → 精读
- Triage 四维评分：主题相关性 × 文献质量 × 可访问性 × 贡献类型
- 搜索停止信号（4 条件）：防止盲目扩大搜索范围
- 异议文献搜索：防止确认偏见

**技术实现**
- Trafilatura → BeautifulSoup → 正则 三层 HTML 提取降级
- SHA1 查询缓存（search_cache.json）：避免重复 API 调用
- 长文截断：5000 token 上限（前 2000 + 后 1000）
- arXiv API：严格顺序请求，间隔 ≥ 3 秒

**协作与安全**
- 三层数据分离：公开框架 / 本地个人配置 / 本地研究数据
- USER_CONFIG.md：个人信息隔离，不入 Git
- install.sh --update 模式：只更新框架，保留个人数据
- pipeline_state.json：进度持久化，支持跨会话断点续读
