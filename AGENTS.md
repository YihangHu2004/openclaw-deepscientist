# AGENTS.md

> ⚠️ 本工作区的完整 Agent 协议（身份、启动顺序、工具、心跳、记忆、红线）
> 已由 **SCIENTIST.md** 统一定义。本文件不提供任何补充配置。
>
> **身份与启动协议**：见 `SCIENTIST.md §1.1–§1.2`
> **工具端点**：见 `SCIENTIST.md §1.4`
> **心跳任务**：见 `SCIENTIST.md §1.5`
> **流水线调度**：见 `SCIENTIST.md §1.6`
> **用户信息**：见 `USER_CONFIG.md`（本地文件，不入 Git）
>
> 启动时请务必优先读取并严格遵守 `SCIENTIST.md` 的所有协议，
> 不得以本文件内容覆盖或稀释 SCIENTIST.md 中的任何规则。
>
> 注意：本工作区的 `skills/*/SKILL.md` 是**工作流规格文档**（可读取的 Markdown 文件），
> 不是 OpenClaw 原生可调用 Skill 插件。调用方式为 exec/read，不是 skill invoke。
