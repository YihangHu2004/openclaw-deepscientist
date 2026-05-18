# Changelog

All notable changes to OpenClaw Scientist will be documented here.

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
