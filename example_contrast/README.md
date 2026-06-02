# 幻觉率对比示例数据

本目录包含 5 篇论文的幻觉率对比数据，用于验证 DeepClaw Agent 证据协议的有效性。

## 目录结构

```
example_contrast/
├── README.md
├── hallucination_check.py          # 批量分析脚本（在根目录运行）
│
├── lima-alignment/                  # 论文1: LIMA: Less Is More for Alignment
│   ├── paper/                       # 论文 PDF 存放位置
│   ├── evidence.json                # DeepClaw Agent 证据
│   ├── deepseek_evidence.json        # DeepSeek（普通大模型）证据
│   └── hallucination_check.py       # 单篇分析脚本
│
├── llm-data-creation/              # 论文2: LLM 作为数据创造器
│   ├── paper/
│   ├── evidence.json
│   ├── deepseek_json.json
│   └── hallucination_check.py
│
├── llm-data-selection/              # 论文3: 基于学习百分比选择训练数据
│   ├── paper/
│   ├── evidence.json
│   ├── deepseek_json.json
│   └── hallucination_check.py
│
├── multi-task-pretraining/          # 论文4: MUPPET 多任务预训练
│   ├── paper/
│   ├── evidence.json
│   ├── deepseek_json.json
│   └── hallucination_check.py
│
└── unified-qa/                      # 论文5: UNIFIEDQA 统一问答模型
    ├── paper/
    ├── evidence.json
    ├── deepseek_json.json
    └── hallucination_check.py
```

## 数据说明

### evidence.json
DeepClaw Agent 生成的证据文件，包含：
- `original_text`: 原文逐字引用
- `claim_text`: AI 生成的声明
- `audit_result`: 审计结果（faithful/drifted/unsupported）

### deepseek_evidence.json
普通大模型（如 DeepSeek）直接阅读论文后生成的证据文件，无证据链约束。

## 运行方法

### 批量分析（在 example_contrast 根目录运行）
```bash
cd example_contrast
python hallucination_check.py
```

### 单篇分析（在具体论文文件夹运行）
```bash
cd example_contrast/lima-alignment
python hallucination_check.py
```

## 幻觉率计算

```
幻觉率 = (drifted + unsupported) / 已审计证据数
```

| 类型 | 说明 |
|------|------|
| faithful | 声明忠实于原文 |
| fixed | 原为漂移，已修复 |
| drifted | 部分幻觉（扩大范围/夸大） |
| unsupported | 完全幻觉（无原文支撑） |

## 预期结果

DeepClaw Agent 的幻觉率应显著低于普通大模型，证明证据协议的有效性。
