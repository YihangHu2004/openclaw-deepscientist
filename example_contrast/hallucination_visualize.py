#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
幻觉率可视化 - 生成对比图表

需要安装 matplotlib:
    pip install matplotlib
"""

import json
from pathlib import Path
from typing import Dict, List

PROJECTS = [
    "lima-alignment",
    "llm-data-creation",
    "llm-data-selection",
    "multi-task-pretraining",
    "unified-qa",
]

# 数据目录配置
DIRS_CONFIG = {
    "state/projects": {
        "agent_file": "evidence.json",
        "llm_file": "deepseek_evidence.json",
        "agent_label": "DeepClaw Agent",
        "llm_label": "DeepSeek (Regular LLM)",
        "color_agent": "#2ecc71",  # 绿色
        "color_llm": "#e74c3c",    # 红色
    },
}


def calculate_hallucination_stats(evidence_data: Dict) -> Dict:
    """计算幻觉统计数据"""
    items = evidence_data.get("items", [])

    # 过滤掉 source-paper 类型的条目
    ev_items = [item for item in items if item.get("type") != "source-paper"]

    total = len(ev_items)

    if total == 0:
        return {
            "total": 0,
            "audited": 0,
            "faithful": 0,
            "drifted": 0,
            "unsupported": 0,
            "hallucination_rate": 0.0,
        }

    audited = [item for item in ev_items if item.get("audit_result") is not None]
    audited_count = len(audited)

    faithful = sum(1 for item in audited if item.get("audit_result") == "faithful")
    drifted = sum(1 for item in audited if item.get("audit_result") == "drifted")
    unsupported = sum(1 for item in audited if item.get("audit_result") == "unsupported")

    hallucination_rate = (drifted + unsupported) / audited_count if audited_count > 0 else 0.0

    return {
        "total": total,
        "audited": audited_count,
        "faithful": faithful,
        "drifted": drifted,
        "unsupported": unsupported,
        "hallucination_rate": hallucination_rate,
    }


def load_stats(project: str, config: Dict) -> Dict:
    """加载指定项目的数据"""
    base_dir = Path(__file__).parent.parent / "state" / "projects" / project

    agent_path = base_dir / config["agent_file"]
    llm_path = base_dir / config["llm_file"]

    agent_stats = {"hallucination_rate": 0.0, "total": 0, "audited": 0, "faithful": 0, "drifted": 0, "unsupported": 0}
    llm_stats = {"hallucination_rate": 0.0, "total": 0, "audited": 0, "faithful": 0, "drifted": 0, "unsupported": 0}

    if agent_path.exists():
        with open(agent_path, encoding="utf-8") as f:
            agent_data = json.load(f)
        agent_stats = calculate_hallucination_stats(agent_data)

    if llm_path.exists():
        with open(llm_path, encoding="utf-8") as f:
            llm_data = json.load(f)
        llm_stats = calculate_hallucination_stats(llm_data)

    return agent_stats, llm_stats


def plot_comparison():
    """绘制幻觉率对比柱状图"""
    try:
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.use('Agg')
    except ImportError:
        print("请先安装 matplotlib: pip install matplotlib")
        return

    config = DIRS_CONFIG["state/projects"]

    projects = [p.replace("-", "\n") for p in PROJECTS]
    agent_rates = []
    llm_rates = []

    for project in PROJECTS:
        agent_stats, llm_stats = load_stats(project, config)
        agent_rates.append(agent_stats["hallucination_rate"] * 100)
        llm_rates.append(llm_stats["hallucination_rate"] * 100)

    x = range(len(PROJECTS))
    width = 0.35

    fig, ax = plt.subplots(figsize=(12, 6))

    bars1 = ax.bar([i - width/2 for i in x], agent_rates, width,
                   label=config["agent_label"],
                   color=config["color_agent"])
    bars2 = ax.bar([i + width/2 for i in x], llm_rates, width,
                   label=config["llm_label"],
                   color=config["color_llm"])

    ax.set_ylabel('Hallucination Rate (%)', fontsize=12)
    ax.set_title('Hallucination Rate Comparison:\nDeepClaw Agent vs DeepSeek (Regular LLM)', fontsize=14)
    ax.set_xticks(x)
    ax.set_xticklabels(projects, fontsize=9)
    ax.legend()
    ax.set_ylim(0, max(max(agent_rates) if agent_rates else 1,
                       max(llm_rates) if llm_rates else 1) * 1.3 + 5)

    # 添加数值标签
    for bar in bars1:
        height = bar.get_height()
        if height > 0:
            ax.annotate(f'{height:.1f}%', xy=(bar.get_x() + bar.get_width()/2, height),
                        xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=9)
    for bar in bars2:
        height = bar.get_height()
        if height > 0:
            ax.annotate(f'{height:.1f}%', xy=(bar.get_x() + bar.get_width()/2, height),
                        xytext=(0, 3), textcoords="offset points", ha='center', va='bottom', fontsize=9)

    plt.tight_layout()
    output_path = Path(__file__).parent.parent / "hallucination_comparison.png"
    plt.savefig(output_path, dpi=150)
    print(f"图表已保存: {output_path}")


def plot_overall_comparison():
    """绘制整体对比饼图"""
    try:
        import matplotlib.pyplot as plt
        import matplotlib
        matplotlib.use('Agg')
    except ImportError:
        return

    config = DIRS_CONFIG["state/projects"]

    total_agent_faithful = 0
    total_agent_hallucinated = 0
    total_llm_faithful = 0
    total_llm_hallucinated = 0

    for project in PROJECTS:
        agent_stats, llm_stats = load_stats(project, config)
        total_agent_faithful += agent_stats["faithful"]
        total_agent_hallucinated += agent_stats["drifted"] + agent_stats["unsupported"]
        total_llm_faithful += llm_stats["faithful"]
        total_llm_hallucinated += llm_stats["drifted"] + llm_stats["unsupported"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 5))

    # DeepClaw Agent 饼图
    ax1.pie([total_agent_faithful, total_agent_hallucinated],
            labels=['Faithful', 'Hallucinated'],
            colors=['#2ecc71', '#e74c3c'],
            autopct='%1.1f%%', startangle=90)
    ax1.set_title(f'{config["agent_label"]}\n({total_agent_faithful + total_agent_hallucinated} items)', fontsize=12)

    # DeepSeek-v4 饼图
    ax2.pie([total_llm_faithful, total_llm_hallucinated],
            labels=['Faithful', 'Hallucinated'],
            colors=['#2ecc71', '#e74c3c'],
            autopct='%1.1f%%', startangle=90)
    ax2.set_title(f'{config["llm_label"]}\n({total_llm_faithful + total_llm_hallucinated} items)', fontsize=12)

    plt.suptitle('Overall Faithfulness Comparison', fontsize=14, y=1.02)
    plt.tight_layout()
    output_path = Path(__file__).parent.parent / "hallucination_overall.png"
    plt.savefig(output_path, dpi=150)
    print(f"整体对比图已保存: {output_path}")


if __name__ == "__main__":
    plot_comparison()
    plot_overall_comparison()