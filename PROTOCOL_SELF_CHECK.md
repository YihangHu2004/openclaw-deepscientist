# PROTOCOL_SELF_CHECK.md
# DeepClaw 回复前自检清单

> 由 §0.0 第 2 步调用。逐条检查，任一 RED FLAG 触发则立即停止当前回复，执行对应补救。

---

## RED FLAGS — 立即停止

| # | 检查问题 | 违规表现 | 补救 |
|---|----------|----------|------|
| R1 | `init_project.py` 是否已运行且输出"初始化完成"？ | 没有运行就开始搜索/分析 | 停止，执行 RESEARCH STEP 0-C |
| R2 | 当前项目目录是否存在 `pipeline_state.json`？ | 目录存在但无该文件 | 停止，重新运行 `init_project.py <slug>` |
| R3 | 我是否在 RESEARCH STEP 0 完成前输出了任何研究内容？ | 在问 slug/mode 之前就写摘要/分析 | 撤销分析，重新从 STEP 0-A 开始 |
| R4 | 我是否在没有活跃项目时直接开始了文献搜索？ | `preflight.py` 输出 `ACTIVE_PROJECTS=0` 但仍在搜索 | 停止，进入 RESEARCH STEP 0 |
| R5 | `init_project.py` 运行是否成功（退出码 0）？ | 脚本报错但仍继续执行下一步 | 停止，向用户展示错误，等待确认后重试 |
| **R6** | **PDF-INPUT 模式下，PDF-0-D（问 slug+mode）和 PDF-0-E（init_project.py）是否已完成？** | 在问用户选择方向 / slug / 模式之前就输出了研究分析 | 停止，撤销分析内容，从 PDF-0-D 重新开始 |
| **R7** | **用户上传 PDF 时，是否严格按照 PDF-0-A→B→C→D→E 五步顺序执行？** | 跳过了中间某一步（如直接输出分析而未问 slug） | 停止，回到被跳过的步骤重新执行 |

---

## YELLOW FLAGS — 警告，谨慎继续

| # | 检查问题 | 说明 |
|---|----------|------|
| Y1 | gate_check.py 上次是否 PASS？ | FAIL 状态下继续进入下一阶段属于违规 |
| Y2 | evidence.json 条目是否 ≥ 10？ | S3 精读门控前必须确认 |
| Y3 | 本次搜索是否命中了 search_cache.json？ | 24h 内同 key 不重复请求 |
| Y4 | 引用的论文是否有对应 EV-xxx 记录？ | 无来源声明禁止写入报告 |

---

## 正常会话不适用此检查的场景

- 用户在问打招呼、meta 问题（"你是谁""能做什么"）
- 用户在回答 STEP 0 的 slug / 模式选择问题（等待输入阶段）
- heartbeat 心跳消息处理
- 已完成项目（status=done）的历史查询
