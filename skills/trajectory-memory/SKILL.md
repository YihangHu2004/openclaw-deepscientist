---
name: trajectory-memory
description: Use when any research pipeline skill needs project-local JSONL ReAct trajectory memory, reusable prior context from similar projects, or durable thought/action/observation/reflection logging. Applies before and after arxiv-search, semantic-scholar, paper-reader, literature-synthesis, research-planner, report-writer, claim-auditor, paper-reviewer, and science-slides.
---

# Skill: trajectory-memory

This is a cross-cutting companion skill for the research pipeline. It does not
replace evidence management. It tells the agent how to use project-local
trajectory memory as workflow memory.

## Scope

Use this skill whenever a project-stage skill starts, resumes, or finishes a
meaningful tool/action step.

The project-local memory files are:

```text
state/projects/<slug>/trajectory_context.md
state/projects/<slug>/trajectory_memory.jsonl
```

`trajectory_context.md` contains reusable workflow priors retrieved from similar
old projects when the project was initialized.

`trajectory_memory.jsonl` contains this project's own append-only ReAct trace.

## Hard Rules

1. Treat trajectory memory as workflow prior only.
2. Never treat trajectory memory as literature evidence.
3. Any paper claim, metric, dataset fact, limitation, or citation still requires
   an EV record in `evidence.json`.
4. Do not copy old-project conclusions into the new project without current
   evidence.
5. Do not use root-level/global `trajectory_memory.jsonl`; memory is
   project-local.
6. Do not bulk-load huge JSONL logs. Use `get_recent_context()` or stream recent
   records only.

## Start-Of-Skill Protocol

Before executing a research-stage skill:

1. Identify the active `<slug>`.
2. Read `state/projects/<slug>/trajectory_context.md` if it exists.
3. Read the current project's recent trajectory context:

```bash
python scripts/trajectory_logger.py state/projects/<slug> recent --n 5
```

4. Use the retrieved context to avoid repeated failed searches, reuse useful
   workflow patterns, and preserve known project-specific constraints.
5. If the context conflicts with `evidence.json`, `project.md`, or the user's
   latest instruction, prefer the current project files and user instruction.

## Logging Protocol

After each meaningful action, append one ReAct step:

```bash
python scripts/trajectory_logger.py state/projects/<slug> log \
  --phase "<phase>" \
  --thought "<why this action is needed before execution>" \
  --action-name "<tool_or_script_name>" \
  --action-param key=value \
  --observation "<objective result after execution>" \
  --reflection "<optional lesson, retry reason, or next constraint>"
```

Use stable phase names such as:

```text
S1_ArxivSearch
S2_SemanticScholar
S3_PaperReader
S4_LitReview
S5_ResearchPlanner
S6_ReportWriting
S7_ClaimAudit
S8_PaperReview
S9_ScienceSlides
Project_Init
Session_Restore
```

## New-Project Reuse Protocol

New projects must be initialized with topic keywords so old project memories can
be retrieved by similarity:

```bash
python scripts/init_project.py <slug> --mode AUTO|INTERACTIVE \
  --topic "<research topic>" \
  --keywords <kw1> <kw2> <kw3>
```

This calls `scripts/project_reuse.py`, ranks existing project-local memories,
and writes the selected snippets to:

```text
state/projects/<slug>/trajectory_context.md
```

If no old project shares keywords, no old trajectory should be injected.

## Stage Guidance

- S1/S2 search: reuse prior successful and failed query patterns, but run fresh
  searches for the current topic.
- S3 reading: reuse extraction tactics and known failure modes, but create new
  EV records from current papers only.
- S4 synthesis: use old workflow structure if helpful; all claims still need
  current EV citations.
- S5 planning: reuse feasibility lessons, baseline pitfalls, and experiment
  design cautions; verify datasets and baselines for the current project.
- S6 writing: use remembered report structure and audit issues; never cite
  trajectory memory.
- S7/S8 audit/review: use memory to identify recurring risk patterns; judge the
  current artifacts directly.
- S9 slides: reuse presentation workflow lessons only.

## Completion Check

A stage that used tools or made durable decisions should leave at least one
new `trajectory_memory.jsonl` record unless the stage was read-only.

Before finishing a stage, confirm:

```text
trajectory_context.md was considered
recent trajectory_memory.jsonl was considered
new meaningful action was logged
evidence claims still point to evidence.json
```
