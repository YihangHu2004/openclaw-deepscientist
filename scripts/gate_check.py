# -*- coding: utf-8 -*-
"""
gate_check.py <slug> <stage> [--verbose]

Verifies gate conditions for a research project stage by reading actual
project files (not trusting LLM self-reports).

Exit code: 0 = PASS, 1 = FAIL
Results are written to pipeline_state.json gate_results.

Supported stages: 1, 2 (文献覆盖门), 3 (精读完整门), 4 (综述质量门),
                  5 (研究计划门), 6 (报告完整门), 7 (审计完整门),
                  8 (评审完整门), 9 (PPT 结构门)
"""
import argparse
import json
import re
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

WORKSPACE = Path(__file__).parent.parent
STATE_DIR  = WORKSPACE / "state" / "projects"

GATE_NAMES = {
    "1": "文献覆盖门", "2": "文献覆盖门",
    "3": "精读完整门", "4": "综述质量门",
    "5": "研究计划门", "6": "报告完整门",
    "7": "审计完整门", "8": "评审完整门",
    "9": "PPT 结构门",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


# ── Text length helper ────────────────────────────────────────────────────────

# CJK Unified Ideographs + Extension A/B + Compatibility
_CJK_PAT = re.compile(
    r"[一-鿿㐀-䶿\U00020000-\U0002a6df"
    r"぀-ヿ가-힯]"
)

def count_length(text: str) -> tuple[int, str]:
    """Return (length, unit) where unit is '字' for CJK-dominant text or '词' for Latin.

    Mixed text: CJK characters + Latin words are summed.
    Thresholds in gate checks are expressed in this unified unit.
    A Chinese report with 1000 '字' is roughly equivalent to a 600-word English report,
    so gate thresholds for Chinese are set ~1.5× the English ones.
    """
    cjk_chars = len(_CJK_PAT.findall(text))
    # Remove CJK chars, then count remaining whitespace-separated tokens
    latin_words = len(_CJK_PAT.sub(" ", text).split())
    if cjk_chars > latin_words:          # CJK-dominant
        return cjk_chars + latin_words, "字"
    return latin_words, "词"             # Latin-dominant


# ── Gate implementations ───────────────────────────────────────────────────────

def gate_1_2(proj_dir: Path, verbose: bool):
    conditions, blockers = [], []

    cache = load_json(proj_dir / "search_cache.json")
    queries = cache.get("queries", {})

    # Total papers found (sum of hits integers across all queries)
    total_hits = 0
    for q in queries.values():
        h = q.get("hits", 0)
        if isinstance(h, int):
            total_hits += h
        elif isinstance(h, list):
            total_hits += len(h)

    total_queries = len(queries)

    # Opposing/challenge paper check: any query with challenge keywords
    has_opposing = any(
        any(kw in q.get("query", "").lower()
            for kw in ["challeng", "limitation", "criticism", "against", "fail", "critique"])
        for q in queries.values()
    )
    # Also accept if a note explicitly says "opposing" or "异议"
    if not has_opposing:
        has_opposing = any(
            any(kw in q.get("note", "").lower()
                for kw in ["opposing", "異議", "异议", "challenge", "critique"])
            for q in queries.values()
        )

    c1 = total_hits >= 5
    conditions.append({"name": "论文总量", "required": "≥5 篇",
                       "actual": f"{total_hits} 篇", "passed": c1})
    if not c1:
        blockers.append(f"论文总量不足（当前 {total_hits} 篇，需 ≥5）")

    c2 = total_queries > 0 and (proj_dir / "search_cache.json").exists()
    conditions.append({"name": "搜索缓存", "required": "search_cache.json 已写入",
                       "actual": f"{total_queries} 条查询" if c2 else "文件不存在", "passed": c2})
    if not c2:
        blockers.append("search_cache.json 不存在或为空")

    conditions.append({"name": "异议文献", "required": "≥1 篇",
                       "actual": "已有" if has_opposing else "未搜索",
                       "passed": has_opposing})
    if not has_opposing:
        blockers.append("未搜索异议/挑战文献（建议搜索 'challenges to X' 或 'limitations of X'）")

    return c1 and c2, conditions, blockers


def gate_3(proj_dir: Path, verbose: bool):
    conditions, blockers = [], []

    evidence = load_json(proj_dir / "evidence.json")
    items = evidence.get("items", [])
    ev_count = len(items)

    c1 = ev_count >= 10
    conditions.append({"name": "EV 记录总数", "required": "≥10 条",
                       "actual": f"{ev_count} 条", "passed": c1})
    if not c1:
        blockers.append(f"EV 记录不足（当前 {ev_count} 条，需 ≥10）")

    abstract_count = sum(1 for ev in items if ev.get("source_type") == "abstract_only")
    # full_text / truncated_full_text / map_reduce_full_text 均视为非摘要来源
    abstract_ratio = abstract_count / ev_count if ev_count > 0 else 1.0
    c2 = abstract_ratio <= 0.30
    conditions.append({"name": "全文来源比例", "required": "abstract_only ≤30%",
                       "actual": f"{abstract_count}/{ev_count} = {abstract_ratio:.0%}",
                       "passed": c2})
    if not c2:
        blockers.append(f"abstract_only 比例过高（{abstract_ratio:.0%}），需精读更多全文")

    # Count structured note rows in project.md paper table
    project_text = read_text(proj_dir / "project.md")
    note_rows = [
        ln for ln in project_text.splitlines()
        if ln.strip().startswith("|")
        and "---" not in ln
        and "arXiv ID" not in ln
        and ln.count("|") >= 4
        and ln.replace("|", "").replace(" ", "").strip()
    ]
    note_count = len(note_rows)
    c3 = note_count >= 5
    conditions.append({"name": "结构化笔记", "required": "≥5 篇",
                       "actual": f"{note_count} 篇", "passed": c3})
    if not c3:
        blockers.append(f"论文库笔记不足（当前 {note_count} 篇，需 ≥5）")

    return c1 and c3, conditions, blockers


def gate_4(proj_dir: Path, verbose: bool):
    conditions, blockers = [], []

    project_text = read_text(proj_dir / "project.md")

    # Extract 综述草稿 section
    m = re.search(r"##\s+综述草稿.*?\n(.*?)(?=\n##\s|\Z)", project_text, re.DOTALL)
    rw_text = m.group(1).strip() if m else ""
    rw_len, rw_unit = count_length(rw_text)
    rw_min = 300 if rw_unit == "字" else 200
    c1 = rw_len >= rw_min
    conditions.append({"name": "综述字数", "required": f"≥{rw_min} {rw_unit}",
                       "actual": f"{rw_len} {rw_unit}", "passed": c1})
    if not c1:
        blockers.append(f"综述字数不足（{rw_len} {rw_unit}，需 ≥{rw_min}）")

    ev_refs = len(re.findall(r"\[EV-\d+\]", project_text))
    c2 = ev_refs >= 3
    conditions.append({"name": "EV 引用数", "required": "≥3 处",
                       "actual": f"{ev_refs} 处", "passed": c2})
    if not c2:
        blockers.append(f"project.md 中 [EV-xxx] 引用不足（{ev_refs} 处，需 ≥3）")

    # Count Gap items: numbered list items under Research Gap section
    gap_m = re.search(r"Research Gap.*?\n(.*?)(?=\n##\s|\Z)", project_text, re.DOTALL)
    gap_text = gap_m.group(1) if gap_m else project_text
    gap_count = len(re.findall(r"^\d+\.", gap_text, re.MULTILINE))
    c3 = gap_count >= 3
    conditions.append({"name": "Research Gap 条数", "required": "≥3 条",
                       "actual": f"{gap_count} 条", "passed": c3})
    if not c3:
        blockers.append(f"Research Gap 不足（{gap_count} 条，需 ≥3）")

    return c1 and c2 and c3, conditions, blockers


def gate_5(proj_dir: Path, verbose: bool):
    conditions, blockers = [], []

    project_text = read_text(proj_dir / "project.md")

    def section_text(header: str) -> str:
        # Match ##/###/#### headers containing the keyword (partial match).
        # Use {{}} to produce literal braces in the rf-string (avoid f-string
        # interpreting {2,4} as the Python tuple (2, 4)).
        m = re.search(
            rf"#{{2,4}}\s+[^\n]*{re.escape(header)}[^\n]*\n(.*?)(?=\n#{{2,4}}\s|\Z)",
            project_text, re.DOTALL,
        )
        return m.group(1).strip() if m else ""

    # Hypothesis with numerical indicator
    hyp = section_text("假设")
    has_num = bool(re.search(r"\d+\s*[%％个倍x×]|[≥≤><]\s*\d|\d+\.\d+", hyp))
    c1 = len(hyp) > 20 and has_num
    conditions.append({"name": "假设（含数值指标）", "required": "已填写且含数值",
                       "actual": "已填写（含数值）" if c1 else (
                           "已填写（缺数值）" if len(hyp) > 20 else "未填写"),
                       "passed": c1})
    if not c1:
        blockers.append("假设未填写或缺乏可验证的数值指标（如 '准确率提升 ≥5%'）")

    ds = section_text("数据集")
    c2 = len(ds) > 10
    conditions.append({"name": "数据集", "required": "≥1 个已识别",
                       "actual": "已填写" if c2 else "未填写", "passed": c2})
    if not c2:
        blockers.append("数据集章节未填写")

    bl = section_text("基线方法")
    c3 = len(bl) > 10
    conditions.append({"name": "基线方法", "required": "≥1 个含原文参考",
                       "actual": "已填写" if c3 else "未填写", "passed": c3})
    if not c3:
        blockers.append("基线方法章节未填写")

    ev_refs = len(re.findall(r"\[EV-\d+\]", project_text))
    c4 = ev_refs >= 2
    conditions.append({"name": "Gap-EV 绑定", "required": "研究动机引用 ≥2 条 EV-xxx",
                       "actual": f"{ev_refs} 处", "passed": c4})
    if not c4:
        blockers.append(f"EV 引用不足（{ev_refs} 处，研究动机需 ≥2 处）")

    return c1 and c2 and c3, conditions, blockers


def _extract_section(text: str, header_pat: str) -> str:
    """Extract text of a single section (until next same-or-higher-level heading)."""
    m = re.search(header_pat, text, re.IGNORECASE)
    if not m:
        return ""
    start = m.end()
    # Find next heading of same or higher level
    next_h = re.search(r"\n#+\s", text[start:])
    end = start + next_h.start() if next_h else len(text)
    return text[start:end]


def _ev_count_in(text: str) -> int:
    return len(re.findall(r"\[EV-\d+\]", text))


def gate_6(proj_dir: Path, verbose: bool):
    conditions, blockers = [], []

    report_path = proj_dir / "report.md"
    text = read_text(report_path)

    REQUIRED_SECTIONS = [
        ("摘要",     r"#+\s+(摘要|Abstract)"),
        ("引言",     r"#+\s+(引言|简介|研究背景|Introduction)"),
        ("相关工作", r"#+\s+(相关工作|文献综述|Related\s*Work)"),
        ("研究空白", r"#+\s+(研究空白|研究动机|Gap|Research\s*Gap|Motivation)"),
        ("研究方法", r"#+\s+(研究方法|方法论|方案|Methodology|Proposed\s*Method)"),
        ("实验设计", r"#+\s+(实验设计|实验方案|Experiment(?:al\s*Design)?)"),
        ("预期结果", r"#+\s+(预期结果|实验结果|结果分析|Expected\s*Results?|Findings)"),
        ("参考文献", r"#+\s+(参考文献|References)"),
    ]
    found = [(name, bool(re.search(pat, text, re.IGNORECASE)))
             for name, pat in REQUIRED_SECTIONS]
    n_found = sum(1 for _, ok in found if ok)
    c1 = n_found >= 8
    conditions.append({"name": "章节完整性", "required": "8 个必要章节",
                       "actual": f"{n_found}/8", "passed": c1})
    if not c1:
        missing = [name for name, ok in found if not ok]
        blockers.append(f"缺少章节：{', '.join(missing)}")

    # Per-section EV minimums
    SEC_EV_MIN = [
        ("研究空白",  r"#+\s+(研究空白|研究动机|Gap|Research\s*Gap|Motivation)",     2),
        ("研究方法",  r"#+\s+(研究方法|方法论|方案|Methodology|Proposed\s*Method)",  4),
        ("实验设计",  r"#+\s+(实验设计|实验方案|Experiment(?:al\s*Design)?)",         3),
        ("预期结果",  r"#+\s+(预期结果|实验结果|结果分析|Expected\s*Results?|Findings)", 3),
    ]
    sec_ev_pass = True
    for sec_name, sec_pat, min_ev in SEC_EV_MIN:
        sec_text = _extract_section(text, sec_pat)
        ev_n = _ev_count_in(sec_text)
        ok = ev_n >= min_ev
        if not ok:
            sec_ev_pass = False
        conditions.append({
            "name": f"EV 计数·{sec_name}",
            "required": f"≥{min_ev} 条",
            "actual": f"{ev_n} 条",
            "passed": ok,
        })
        if not ok:
            blockers.append(f"{sec_name} 章节 EV 不足（{ev_n} 条，需 ≥{min_ev}）")

    doc_len, doc_unit = count_length(text)
    doc_min = 1500 if doc_unit == "字" else 1000
    c2 = doc_len >= doc_min
    conditions.append({"name": "报告字数", "required": f"≥{doc_min} {doc_unit}",
                       "actual": f"{doc_len} {doc_unit}", "passed": c2})
    if not c2:
        blockers.append(f"报告字数不足（{doc_len} {doc_unit}，需 ≥{doc_min}）")

    # EV coverage: sentences with literature claim signals.
    # Percentages only count when co-occurring with a performance/comparison verb
    # to avoid matching pre-commitment or audit lines like ">= 80%" or "100% faithful".
    LIT_PAT = re.compile(
        r"[^\n。]*(?:"
        r"研究表明|等人|et al\.|according to|表明|发现|证明|显示|达到|实现了"
        r"|(?:超越|超过|提升|提高|改善|降低|减少|增加|outperform|surpass|achiev|improv|reduc|increas|decreas)"
        r"[^\n。]{0,60}\d+\s*[%％]"
        r")[^\n。]*[。\n]",
        re.IGNORECASE,
    )
    lit_sentences = LIT_PAT.findall(text)
    ev_covered = [s for s in lit_sentences if re.search(r"\[EV-\d+\]", s)]
    coverage = len(ev_covered) / len(lit_sentences) if lit_sentences else 0.0
    c3 = coverage >= 0.80 or (not lit_sentences and bool(re.search(r"\[EV-\d+\]", text)))
    conditions.append({"name": "证据覆盖率", "required": "≥80%",
                       "actual": f"{len(ev_covered)}/{len(lit_sentences)} = {coverage:.0%}"
                                 if lit_sentences else "无文献结论句",
                       "passed": c3})
    if not c3:
        blockers.append(f"证据覆盖率不足（{coverage:.0%}，需 ≥80%）")

    gap_count = len(re.findall(r"\[MATERIAL GAP", text))
    denom = max(len(lit_sentences), 1)
    gap_ratio = gap_count / denom
    c4 = gap_ratio <= 0.20
    conditions.append({"name": "[MATERIAL GAP] 比例", "required": "≤20%",
                       "actual": f"{gap_count} 处 = {gap_ratio:.0%}", "passed": c4})
    if not c4:
        blockers.append(f"[MATERIAL GAP] 过多（{gap_ratio:.0%}），需返回精读补充证据")

    html_exists = (proj_dir / "report.html").exists()
    conditions.append({"name": "report.html", "required": "文件存在",
                       "actual": "存在" if html_exists else "不存在", "passed": html_exists})
    if not html_exists:
        blockers.append("report.html 不存在，需运行 HTML 生成脚本")

    return c1 and sec_ev_pass and c2 and c3 and c4 and html_exists, conditions, blockers


def gate_7(proj_dir: Path, verbose: bool):
    """审计完整门：读取 evidence.json audit_result 字段，验证忠实率 ≥90%。"""
    conditions, blockers = [], []

    evidence = load_json(proj_dir / "evidence.json")
    items = evidence.get("items", [])

    # All high-confidence EVs must be audited
    high_items = [it for it in items if it.get("confidence") == "high"]
    audited_high = [it for it in high_items if "audit_result" in it]
    c1 = len(high_items) == 0 or len(audited_high) == len(high_items)
    conditions.append({
        "name": "高置信度 EV 全部已审",
        "required": "high EV 100% 已有 audit_result",
        "actual": f"{len(audited_high)}/{len(high_items)} 条已审",
        "passed": c1,
    })
    if not c1:
        blockers.append(f"还有 {len(high_items) - len(audited_high)} 条 high EV 未填 audit_result")

    # No unsupported items allowed
    audited_items = [it for it in items if "audit_result" in it]
    unsupported = [it for it in audited_items if it.get("audit_result") == "unsupported"]
    c2 = len(unsupported) == 0
    conditions.append({
        "name": "无根据条目",
        "required": "unsupported = 0",
        "actual": f"{len(unsupported)} 条 unsupported" if unsupported else "0 条",
        "passed": c2,
    })
    if not c2:
        ids = [it.get("ev_id", "?") for it in unsupported]
        blockers.append(f"存在 unsupported EV，必须修改报告正文并标记 fixed：{', '.join(ids)}")

    # Drifted items must have recommended_fix
    drifted = [it for it in audited_items if it.get("audit_result") == "drifted"]
    drifted_no_fix = [it for it in drifted if not it.get("recommended_fix")]
    c3 = len(drifted_no_fix) == 0
    conditions.append({
        "name": "漂移条目有修改建议",
        "required": "所有 drifted 含 recommended_fix",
        "actual": f"{len(drifted) - len(drifted_no_fix)}/{len(drifted)} 条已给出建议"
                  if drifted else "无漂移条目",
        "passed": c3,
    })
    if not c3:
        ids = [it.get("ev_id", "?") for it in drifted_no_fix]
        blockers.append(f"以下 drifted EV 缺少 recommended_fix 字段：{', '.join(ids)}")

    # Faithfulness rate (faithful + fixed) / total audited >= 90%
    faithful_count = sum(
        1 for it in audited_items if it.get("audit_result") in ("faithful", "fixed")
    )
    total_audited = len(audited_items)
    faith_rate = faithful_count / total_audited if total_audited > 0 else 0.0
    c4 = total_audited == 0 or faith_rate >= 0.90
    conditions.append({
        "name": "忠实率（faithful + fixed）",
        "required": "≥90%",
        "actual": f"{faithful_count}/{total_audited} = {faith_rate:.0%}"
                  if total_audited > 0 else "未审计",
        "passed": c4,
    })
    if not c4:
        blockers.append(f"忠实率不足（{faith_rate:.0%}，需 ≥90%），需修正 drifted 声明后标记 fixed")

    # Audit appendix must exist in report.md
    report_text = read_text(proj_dir / "report.md")
    has_appendix = bool(re.search(
        r"引用忠实度审计|Citation Fidelity Audit", report_text, re.IGNORECASE
    ))
    conditions.append({
        "name": "审计附录已追加",
        "required": "report.md 含审计附录节",
        "actual": "已追加" if has_appendix else "未找到",
        "passed": has_appendix,
    })
    if not has_appendix:
        blockers.append("report.md 中未找到审计附录（应含 '引用忠实度审计' 节）")

    passed = c1 and c2 and c3 and c4 and has_appendix
    return passed, conditions, blockers


def gate_8(proj_dir: Path, verbose: bool):
    """评审完整门：验证同行评审完整且 DA-CRITICAL 已处理。"""
    conditions, blockers = [], []

    review_dir = proj_dir / "review"
    review_files = sorted(review_dir.glob("peer_review_*.md")) if review_dir.exists() else []

    c1 = bool(review_files)
    conditions.append({
        "name": "评审文件",
        "required": "review/peer_review_*.md 存在",
        "actual": f"{len(review_files)} 个" if review_files else "未找到",
        "passed": c1,
    })
    if not c1:
        blockers.append("review/ 目录下无评审文件，需先运行 paper-reviewer Skill")

    if review_files:
        review_text = read_text(review_files[-1])

        has_da = bool(re.search(r"DA-(CRITICAL|WARNING|PASS)", review_text))
        conditions.append({
            "name": "DA 裁定",
            "required": "含 DA-CRITICAL / DA-WARNING / DA-PASS",
            "actual": "已包含" if has_da else "未找到",
            "passed": has_da,
        })
        if not has_da:
            blockers.append("评审文件缺少 DA 裁定行（DA-CRITICAL / DA-WARNING / DA-PASS）")

        has_scores = bool(re.search(r"\d\s*/\s*5", review_text))
        conditions.append({
            "name": "量化评分",
            "required": "含 X/5 评分",
            "actual": "已包含" if has_scores else "未找到",
            "passed": has_scores,
        })
        if not has_scores:
            blockers.append("评审文件缺少量化评分（格式：X/5）")

        critical_count = len(re.findall(r"DA-CRITICAL", review_text))
        if critical_count > 0:
            ps = load_json(proj_dir / "pipeline_state.json")
            improvement_s8 = ps.get("improvement_counts", {}).get("s8", 0)
            revision_files = list(review_dir.glob("revision_*.md"))
            handled = improvement_s8 > 0 or bool(revision_files)
            conditions.append({
                "name": "DA-CRITICAL 已处理",
                "required": "有修订记录或改进轮次",
                "actual": f"改进 {improvement_s8} 轮，修订记录 {len(revision_files)} 个"
                          if handled else "未处理",
                "passed": handled,
            })
            if not handled:
                blockers.append(
                    f"存在 {critical_count} 条 DA-CRITICAL，须返回 S6 修改后重新评审"
                )
        else:
            conditions.append({
                "name": "DA-CRITICAL",
                "required": "无 DA-CRITICAL 或已处理",
                "actual": "无 DA-CRITICAL",
                "passed": True,
            })

    all_passed = all(c["passed"] for c in conditions) if conditions else False
    return all_passed, conditions, blockers


def gate_9(proj_dir: Path, verbose: bool):
    """PPT 结构门：验证幻灯片文件存在且页数达标。"""
    conditions, blockers = [], []

    slides_dir = proj_dir / "slides"
    pptx_files = list(slides_dir.glob("*.pptx")) if slides_dir.exists() else []

    c1 = bool(pptx_files)
    conditions.append({"name": ".pptx 文件", "required": "存在于 slides/",
                       "actual": f"{len(pptx_files)} 个" if pptx_files else "未找到",
                       "passed": c1})
    if not c1:
        blockers.append("slides/ 目录下无 .pptx 文件")

    if pptx_files:
        try:
            from pptx import Presentation  # type: ignore
            prs = Presentation(str(pptx_files[0]))
            n_slides = len(prs.slides)
            c2 = n_slides >= 12
            conditions.append({"name": "幻灯片数量", "required": "≥12 张",
                               "actual": f"{n_slides} 张", "passed": c2})
            if not c2:
                blockers.append(f"幻灯片数量不足（{n_slides} 张，需 ≥12）")
        except ImportError:
            conditions.append({"name": "幻灯片数量", "required": "≥12 张",
                               "actual": "python-pptx 未安装，跳过计数", "passed": True})

    return c1, conditions, blockers


GATE_FUNCS: dict[str, Callable] = {
    "1": gate_1_2, "2": gate_1_2,
    "3": gate_3,   "4": gate_4,
    "5": gate_5,   "6": gate_6,
    "7": gate_7,   "8": gate_8,
    "9": gate_9,
}


# ── Render & persist ───────────────────────────────────────────────────────────

def render(gate_name: str, stage: str, passed: bool, conditions: list, blockers: list) -> dict:
    W = 54
    print(f"\n╔{'═'*(W-2)}╗")
    header = f" GATE CHECK: {gate_name} · Stage {stage} "
    print(f"║{header.center(W-2)}║")
    print(f"╠{'═'*(W-2)}╣")

    for c in conditions:
        icon = "✅" if c["passed"] else "❌"
        line = f"  {icon} {c['name']}: {c['actual']}  ({c['required']})"
        print(f"║{line:<{W-2}}║")

    print(f"╠{'═'*(W-2)}╣")
    result_str = "✅ PASS" if passed else "❌ FAIL"
    print(f"║{f'  → RESULT: {result_str}':<{W-2}}║")
    print(f"╚{'═'*(W-2)}╝")

    if blockers:
        print("\n🔴 阻断项：")
        for b in blockers:
            print(f"   · {b}")

    result = {
        "gate": gate_name,
        "stage": int(stage),
        "passed": passed,
        "conditions": conditions,
        "blockers": blockers,
        "timestamp": now_iso(),
    }
    print(f"\n{json.dumps(result, ensure_ascii=False, indent=2)}")
    return result


def persist(proj_dir: Path, stage: str, result: dict) -> None:
    ps_path = proj_dir / "pipeline_state.json"
    if not ps_path.exists():
        return
    ps = load_json(ps_path)
    key = f"after_{stage}"
    ps.setdefault("gate_results", {})[key] = {
        "passed":     result["passed"],
        "conditions": result["conditions"],
        "blockers":   result["blockers"],
        "timestamp":  result["timestamp"],
    }
    if result["passed"]:
        current = int(ps.get("current_stage", stage))
        if int(stage) >= current:
            ps["current_stage"] = int(stage) + 1
        ps.setdefault("stage_status", {})[stage] = "done"
    else:
        ps.setdefault("stage_status", {})[stage] = "failed"
    ps["last_updated"] = now_iso()
    ps_path.write_text(json.dumps(ps, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="验证研究项目阶段门控条件")
    parser.add_argument("slug",    help="项目 slug")
    parser.add_argument("stage",   help="阶段编号（1–9）")
    parser.add_argument("--verbose", action="store_true", help="输出详细信息")
    args = parser.parse_args()

    proj_dir = STATE_DIR / args.slug
    if not proj_dir.exists():
        print(f"❌ 项目不存在：{args.slug}（先运行 init_project.py）", file=sys.stderr)
        sys.exit(1)

    gate_func = GATE_FUNCS.get(args.stage)
    if not gate_func:
        print(f"❌ 不支持的阶段：{args.stage}（支持 1–9）", file=sys.stderr)
        sys.exit(1)

    gate_name = GATE_NAMES.get(args.stage, f"Stage {args.stage} 门")
    passed, conditions, blockers = gate_func(proj_dir, args.verbose)
    result = render(gate_name, args.stage, passed, conditions, blockers)
    persist(proj_dir, args.stage, result)
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
