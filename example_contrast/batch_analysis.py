#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幻觉率批量分析脚本 - 分析 example_contrast 下所有论文

使用方法:
    python batch_analysis.py
"""

import json
from pathlib import Path
from typing import Dict

PROJECTS = [
    "lima-alignment",
    "llm-data-creation",
    "llm-data-selection",
    "multi-task-pretraining",
    "unified-qa",
]


def calculate_stats(project_dir: Path) -> Dict:
    """计算单个项目的幻觉统计"""
    agent_data = json.load(open(project_dir / "evidence.json", encoding="utf-8"))
    fake_data = json.load(open(project_dir / "deepseek_evidence.json", encoding="utf-8"))

    def calc(data):
        items = [x for x in data.get("items", []) if x.get("type") != "source-paper"]
        audited = [x for x in items if x.get("audit_result") is not None]
        drifted = sum(1 for x in audited if x.get("audit_result") == "drifted")
        unsupported = sum(1 for x in audited if x.get("audit_result") == "unsupported")
        rate = (drifted + unsupported) / len(audited) if audited else 0.0
        return {"total": len(items), "audited": len(audited), "drifted": drifted, "unsupported": unsupported, "rate": rate}

    return {"agent": calc(agent_data), "fake": calc(fake_data)}


def main():
    print("=" * 70)
    print("幻觉率对比分析：DeepClaw Agent vs DeepSeek")
    print("=" * 70)

    all_results = []
    for project in PROJECTS:
        project_dir = Path(__file__).parent / project
        stats = calculate_stats(project_dir)
        all_results.append({"project": project, **stats})
        print(f"\n{project}:")
        print(f"  DeepClaw: {stats['agent']['rate']*100:.2f}% ({stats['agent']['drifted']} drifted, {stats['agent']['unsupported']} unsupported)")
        print(f"  DeepSeek: {stats['fake']['rate']*100:.2f}% ({stats['fake']['drifted']} drifted, {stats['fake']['unsupported']} unsupported)")

    # 汇总
    total_agent_audited = sum(r["agent"]["audited"] for r in all_results)
    total_fake_audited = sum(r["fake"]["audited"] for r in all_results)
    total_agent_hall = sum(r["agent"]["drifted"] + r["agent"]["unsupported"] for r in all_results)
    total_fake_hall = sum(r["fake"]["drifted"] + r["fake"]["unsupported"] for r in all_results)

    overall_agent = total_agent_hall / total_agent_audited if total_agent_audited > 0 else 0
    overall_fake = total_fake_hall / total_fake_audited if total_fake_audited > 0 else 0

    print("\n" + "=" * 70)
    print("汇总统计")
    print("=" * 70)
    print(f"DeepClaw Agent 整体幻觉率: {overall_agent*100:.2f}%")
    print(f"DeepSeek 整体幻觉率: {overall_fake*100:.2f}%")
    print(f"幻觉率差异: {(overall_fake - overall_agent)*100:+.2f}%")
    if overall_agent < overall_fake:
        reduction = (overall_fake - overall_agent) / overall_fake * 100
        print(f"DeepClaw 幻觉率降低: {reduction:.2f}%")
    print("=" * 70)


if __name__ == "__main__":
    main()
