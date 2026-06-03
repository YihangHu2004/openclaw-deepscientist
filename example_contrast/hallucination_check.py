#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幻觉率对比分析脚本 v3

对比两种设置下的幻觉率：
1. state/projects/: DeepClaw Agent (evidence.json) vs 普通大模型 (fake_evidence.json)
2. example_contrast/: DeepClaw Agent (evidence.json) vs DeepSeek (deepseek-v4_evidence.json)

幻觉判定标准（基于 audit_result 字段）:
  - faithful: 声明忠实于原文，无幻觉
  - fixed: 原为漂移，但已修复
  - drifted: 部分幻觉（声明偏离原文）
  - unsupported: 完全幻觉（声明无原文支撑）
  - null/None: 未经过审计

幻觉率 = (drifted + unsupported) / total_audited
"""

import json
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# 项目列表
PROJECTS = [
    "lima-alignment",
    "llm-data-creation",
    "llm-data-selection",
    "multi-task-pretraining",
    "unified-qa",
]

# 数据目录配置
DIRS = {
    "state/projects": {
        "base_dir": "state/projects",
        "agent_file": "evidence.json",
        "llm_file": "deepseek_evidence.json",
        "agent_label": "DeepClaw Agent",
        "llm_label": "DeepSeek (Regular LLM)",
    },
}


def load_evidence_data(project: str, config: Dict) -> Tuple[Optional[Dict], Optional[Dict]]:
    """加载证据数据"""
    project_dir = Path(__file__).parent.parent / config["base_dir"] / project

    agent_path = project_dir / config["agent_file"]
    llm_path = project_dir / config["llm_file"]

    agent_data = None
    llm_data = None

    if agent_path.exists():
        with open(agent_path, "r", encoding="utf-8") as f:
            agent_data = json.load(f)

    if llm_path.exists():
        with open(llm_path, "r", encoding="utf-8") as f:
            llm_data = json.load(f)

    return agent_data, llm_data


def calculate_hallucination_stats(evidence_data: Dict, model_name: str = "") -> Dict:
    """计算幻觉统计数据"""
    items = evidence_data.get("items", [])

    # 过滤掉 source-paper 类型的条目
    ev_items = [item for item in items if item.get("type") != "source-paper"]

    total = len(ev_items)

    if total == 0:
        return {
            "total": 0,
            "audited": 0,
            "unaudited": 0,
            "faithful": 0,
            "fixed": 0,
            "drifted": 0,
            "unsupported": 0,
            "hallucination_rate": 0.0,
            "faithful_rate": 0.0,
        }

    audited = [item for item in ev_items if item.get("audit_result") is not None]
    unaudited = [item for item in ev_items if item.get("audit_result") is None]

    audited_count = len(audited)
    unaudited_count = len(unaudited)

    faithful = sum(1 for item in audited if item.get("audit_result") == "faithful")
    fixed = sum(1 for item in audited if item.get("audit_result") == "fixed")
    drifted = sum(1 for item in audited if item.get("audit_result") == "drifted")
    unsupported = sum(1 for item in audited if item.get("audit_result") == "unsupported")

    # 幻觉率只基于已审计条目计算
    hallucination_rate = (drifted + unsupported) / audited_count if audited_count > 0 else 0.0
    faithful_rate = (faithful + fixed) / audited_count if audited_count > 0 else 0.0

    return {
        "total": total,
        "audited": audited_count,
        "unaudited": unaudited_count,
        "faithful": faithful,
        "fixed": fixed,
        "drifted": drifted,
        "unsupported": unsupported,
        "hallucination_rate": hallucination_rate,
        "faithful_rate": faithful_rate,
    }


def analyze_project(project: str, config: Dict, data_dir: str) -> Dict:
    """分析单个项目的幻觉率"""
    agent_data, llm_data = load_evidence_data(project, config)

    if agent_data is None and llm_data is None:
        return None

    agent_stats = calculate_hallucination_stats(agent_data) if agent_data else {
        "total": 0, "audited": 0, "hallucination_rate": 0.0
    }
    llm_stats = calculate_hallucination_stats(llm_data) if llm_data else {
        "total": 0, "audited": 0, "hallucination_rate": 0.0
    }

    return {
        "project": project,
        "data_dir": data_dir,
        "agent_label": config["agent_label"],
        "llm_label": config["llm_label"],
        "agent_stats": agent_stats,
        "llm_stats": llm_stats,
    }


def print_stats(result: Dict):
    """打印统计数据"""
    print(f"\n{'='*70}")
    print(f"项目: {result['project']} ({result['data_dir']})")
    print("=" * 70)

    header = f"{'模型':<20} {'总数':>6} {'已审计':>8} {'未审计':>8} {'忠实':>6} {'漂移':>6} {'无据':>6} {'幻觉率':>10}"
    print(f"\n{header}")
    print("-" * 70)

    agent_line = (f"{result['agent_label']:<18} {result['agent_stats']['total']:>6} {result['agent_stats']['audited']:>8} "
                  f"{result['agent_stats']['unaudited']:>8} {result['agent_stats']['faithful']:>6} "
                  f"{result['agent_stats']['drifted']:>6} {result['agent_stats']['unsupported']:>6} "
                  f"{result['agent_stats']['hallucination_rate']*100:>9.2f}%")
    print(agent_line)

    llm_line = (f"{result['llm_label']:<18} {result['llm_stats']['total']:>6} {result['llm_stats']['audited']:>8} "
                 f"{result['llm_stats']['unaudited']:>8} {result['llm_stats']['faithful']:>6} "
                 f"{result['llm_stats']['drifted']:>6} {result['llm_stats']['unsupported']:>6} "
                 f"{result['llm_stats']['hallucination_rate']*100:>9.2f}%")
    print(llm_line)

    # 计算差异
    if result['llm_stats']['audited'] > 0 and result['agent_stats']['audited'] > 0:
        diff = result['llm_stats']['hallucination_rate'] - result['agent_stats']['hallucination_rate']
        print(f"\n幻觉率差异: {diff*100:+.2f}% ({result['llm_label']} - {result['agent_label']})")
        if diff > 0:
            print(f"  -> {result['agent_label']} 降低了 {diff*100:.2f}% 的幻觉率")
        elif diff < 0:
            print(f"  -> {result['llm_label']} 表现更好 ({abs(diff)*100:.2f}%)")
        else:
            print(f"  -> 两者幻觉率相同")


def analyze_directory(data_dir: str, config: Dict):
    """分析一个目录下的所有项目"""
    print(f"\n{'#'*70}")
    print(f"# 数据源: {data_dir}")
    print(f"# 对比: {config['agent_label']} vs {config['llm_label']}")
    print(f"{'#'*70}")

    all_results = []

    for project in PROJECTS:
        result = analyze_project(project, config, data_dir)
        if result:
            print_stats(result)
            all_results.append(result)

    if not all_results:
        return []

    # 汇总统计
    print("\n" + "=" * 70)
    print("汇总统计")
    print("=" * 70)

    total_agent_items = sum(r["agent_stats"]["total"] for r in all_results)
    total_llm_items = sum(r["llm_stats"]["total"] for r in all_results)
    total_agent_audited = sum(r["agent_stats"]["audited"] for r in all_results)
    total_llm_audited = sum(r["llm_stats"]["audited"] for r in all_results)

    total_agent_drifted = sum(r["agent_stats"]["drifted"] for r in all_results)
    total_agent_unsupported = sum(r["agent_stats"]["unsupported"] for r in all_results)
    total_llm_drifted = sum(r["llm_stats"]["drifted"] for r in all_results)
    total_llm_unsupported = sum(r["llm_stats"]["unsupported"] for r in all_results)

    overall_agent_rate = (total_agent_drifted + total_agent_unsupported) / total_agent_audited if total_agent_audited > 0 else 0
    overall_llm_rate = (total_llm_drifted + total_llm_unsupported) / total_llm_audited if total_llm_audited > 0 else 0

    print(f"\n{'模型':<20} {'总证据数':>10} {'已审计':>8} {'漂移':>6} {'无据':>6} {'幻觉率':>10}")
    print("-" * 70)
    print(f"{config['agent_label']:<18} {total_agent_items:>10} {total_agent_audited:>8} "
          f"{total_agent_drifted:>6} {total_agent_unsupported:>6} {overall_agent_rate*100:>9.2f}%")
    print(f"{config['llm_label']:<18} {total_llm_items:>10} {total_llm_audited:>8} "
          f"{total_llm_drifted:>6} {total_llm_unsupported:>6} {overall_llm_rate*100:>9.2f}%")

    print(f"\n整体幻觉率差异: {(overall_llm_rate - overall_agent_rate)*100:+.2f}%")

    if overall_agent_rate < overall_llm_rate:
        reduction = (overall_llm_rate - overall_agent_rate) / overall_llm_rate * 100 if overall_llm_rate > 0 else 0
        print(f"-> {config['agent_label']} 整体幻觉率降低了 {reduction:.2f}%")
    elif overall_agent_rate > overall_llm_rate:
        increase = (overall_agent_rate - overall_llm_rate) / overall_llm_rate * 100 if overall_llm_rate > 0 else 0
        print(f"-> {config['llm_label']} 整体幻觉率更低 ({increase:.2f}%)")
    else:
        print("-> 两者整体幻觉率相同")

    return all_results


def main():
    print("=" * 70)
    print("幻觉率对比分析")
    print("=" * 70)

    all_results = []

    for data_dir, config in DIRS.items():
        results = analyze_directory(data_dir, config)
        all_results.extend(results)

    # 生成可视化
    try:
        from hallucination_visualize import plot_comparison, plot_overall_comparison
        print("\n生成可视化图表...")
        plot_comparison()
        plot_overall_comparison()
        print("可视化完成！")
    except ImportError:
        print("\n(可视化模块未找到，跳过图表生成)")
    except Exception as e:
        print(f"\n生成可视化时出错: {e}")

    print("\n" + "=" * 70)
    print("分析完成")
    print("=" * 70)


if __name__ == "__main__":
    main()