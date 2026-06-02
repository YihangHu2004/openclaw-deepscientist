#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幻觉率检测脚本 - 针对单篇论文的幻觉率分析

使用方法:
    python hallucination_check.py

数据来源:
    - evidence.json: DeepClaw Agent 生成的证据
    - deepseek_evidence.json: 普通大模型（DeepSeek）生成的证据
"""

import json
from pathlib import Path
from typing import Dict, Tuple

def load_evidence_data() -> Tuple[Dict, Dict]:
    """加载 evidence.json 和 deepseek_evidence.json"""
    agent_data = json.load(open("evidence.json", encoding="utf-8"))
    fake_data = json.load(open("deepseek_evidence.json", encoding="utf-8"))
    return agent_data, fake_data


def calculate_stats(evidence_data: Dict) -> Dict:
    """计算幻觉统计数据"""
    items = evidence_data.get("items", [])
    ev_items = [item for item in items if item.get("type") != "source-paper"]
    total = len(ev_items)

    if total == 0:
        return {
            "total": 0, "audited": 0, "unaudited": 0,
            "faithful": 0, "fixed": 0, "drifted": 0, "unsupported": 0,
            "hallucination_rate": 0.0, "faithful_rate": 0.0
        }

    audited = [item for item in ev_items if item.get("audit_result") is not None]
    unaudited = [item for item in ev_items if item.get("audit_result") is None]
    audited_count = len(audited)
    unaudited_count = len(unaudited)

    faithful = sum(1 for item in audited if item.get("audit_result") == "faithful")
    fixed = sum(1 for item in audited if item.get("audit_result") == "fixed")
    drifted = sum(1 for item in audited if item.get("audit_result") == "drifted")
    unsupported = sum(1 for item in audited if item.get("audit_result") == "unsupported")

    hallucination_rate = (drifted + unsupported) / audited_count if audited_count > 0 else 0.0
    faithful_rate = (faithful + fixed) / audited_count if audited_count > 0 else 0.0

    return {
        "total": total, "audited": audited_count, "unaudited": unaudited_count,
        "faithful": faithful, "fixed": fixed, "drifted": drifted, "unsupported": unsupported,
        "hallucination_rate": hallucination_rate, "faithful_rate": faithful_rate
    }


def print_report():
    """打印报告"""
    project_name = Path.cwd().name
    print("=" * 60)
    print(f"论文项目: {project_name}")
    print("=" * 60)

    try:
        agent_data, fake_data = load_evidence_data()
    except FileNotFoundError as e:
        print(f"错误: 找不到文件 - {e}")
        return

    agent_stats = calculate_stats(agent_data)
    fake_stats = calculate_stats(fake_data)

    print(f"\n{'模型':<20} {'总数':>6} {'已审计':>8} {'未审计':>8} "
          f"{'忠实':>6} {'已修':>6} {'漂移':>6} {'无据':>6} {'幻觉率':>10}")
    print("-" * 90)
    print(f"{'DeepClaw Agent':<18} {agent_stats['total']:>6} {agent_stats['audited']:>8} "
          f"{agent_stats['unaudited']:>8} {agent_stats['faithful']:>6} {agent_stats['fixed']:>6} "
          f"{agent_stats['drifted']:>6} {agent_stats['unsupported']:>6} {agent_stats['hallucination_rate']*100:>9.2f}%")
    print(f"{'DeepSeek':<18} {fake_stats['total']:>6} {fake_stats['audited']:>8} "
          f"{fake_stats['unaudited']:>8} {fake_stats['faithful']:>6} {fake_stats['fixed']:>6} "
          f"{fake_stats['drifted']:>6} {fake_stats['unsupported']:>6} {fake_stats['hallucination_rate']*100:>9.2f}%")

    if fake_stats['audited'] > 0 and agent_stats['audited'] > 0:
        diff = fake_stats['hallucination_rate'] - agent_stats['hallucination_rate']
        print(f"\n幻觉率差异: {diff*100:+.2f}% (DeepSeek - DeepClaw)")
        if diff > 0:
            print(f"  -> DeepClaw 降低了 {diff*100:.2f}% 的幻觉率")
        elif diff < 0:
            print(f"  -> DeepSeek 表现更好 ({abs(diff)*100:.2f}%)")
        else:
            print(f"  -> 两者幻觉率相同")

    print("=" * 60)


if __name__ == "__main__":
    print_report()
