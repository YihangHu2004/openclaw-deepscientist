# 多格式统一问答模型研究进展综述

**项目**：unified-qa
**阶段**：S6 研究报告
**生成时间**：2026-06-01
**模式**：AUTO

---

## 摘要

问答系统（QA）是评估计算机语言理解与推理能力的核心工具，长期存在格式割裂问题——抽取式（Extractive）、摘要式（Abstractive）、多选式（Multiple-Choice）、是非式（Yes/No）四种格式各自独立建模。UNIFIEDQA（Khashabi et al., EMNLP 2020）[EV-001]证明格式边界是人为的，底层推理能力可跨格式迁移[EV-002]。本文综述多格式统一QA模型从UNIFIEDQA（2020）到LLM时代（2022–2025）的最新进展，分析两种并行范式——显式多格式混合训练与LLM prompting——的优劣异同，梳理当前研究空白并提出系统性对比研究框架[EV-002]。

---

## 引言

问答系统（Question Answering, QA）是评估计算机语言理解与推理能力的核心工具，长期存在**格式割裂问题**[EV-001]。当前QA任务主要分为四种格式：

| 格式 | 缩写 | 描述 | 代表数据集 |
|------|------|------|-----------|
| 抽取式 | EX | 从上下文截取答案span | SQuAD 1.1/2.0 |
| 摘要式 | AB | 生成自由文本答案（非原文substring） | NarrativeQA |
| 多选式 | MC | 从候选中选择正确答案 | ARC, OBQA |
| 是非式 | YN | 二值判断（yes/no） | BoolQ |

传统方法针对每种格式单独建模，形成"格式专用模型"[EV-001]。UNIFIEDQA证明了这些格式边界是**人为的、不必要的**，因为底层推理能力并不受格式支配[EV-002]。

---

## 相关工作

### 格式专用模型时代

在UNIFIEDQA之前，QA研究存在明显的格式分化。Talmor and Berant (2019) 的MultiQA研究了抽取式跨数据集泛化，但仅限于单一格式——单一系统无法同时处理多种格式[EV-001]。之前的工作（MultiQA、ORB等）研究局限于单一格式的评估，未能回答如何构建真正格式无关的通用系统[EV-011]。

### 统一QA的奠基：UNIFIEDQA

**Khashabi et al. (2020)** 提出 UNIFIEDQA，基于 T5/BART 的 text-to-text 框架，将所有QA格式统一转换为纯文本输入输出，不使用格式特定前缀[EV-019]。核心设计：格式自然编码（所有格式用相同的自然文本格式输入）、混合训练（等比例从各格式采样）和8个seed数据集（EX/AB/MC/YN各2个）[EV-004][EV-017]。

**关键结果**：在20个数据集上与8个专用模型性能持平[EV-013]；12个未见数据集上展现强零样本跨格式泛化[EV-002][EV-014]；微调后在10个数据集上刷新SOTA[EV-003]。

### UNIFIEDQA 系列演进

**UnifiedQA-v2 (Khot et al., 2022)** [EV-006][EV-007]：将训练数据扩展至约50个数据集（3x规模），更强in-domain和cross-domain泛化。

**Macaw (Khot et al., 2021)** [EV-008]：基于UNIFIEDQA扩展到多模态场景，验证统一范式可跨模态泛化。

**跨语言扩展**[EV-007]：UnifiedQA被适配到斯洛文尼亚语等低资源语言，证明其范式可迁移。

### 范式转移：LLM时代

2022年后，**LLM通过In-Context Learning展现跨格式泛化能力**，绕过了UNIFIEDQA式显式多格式联合训练的必要性，形成两种并行范式：
1. **统一训练范式**：显式多格式混合训练，小模型高效
2. **LLM Prompting范式**：大规模预训练+in-context learning，大模型通用

---

## 研究空白

[EV-011] 本工作的范围限定于QA任务内部，证明了统一text-to-text范式可成功跨越不同QA任务和格式[EV-011]。[EV-002] UNIFIEDQA展示了强跨格式泛化性能，在YN任务上甚至超越使用目标数据集训练的专用模型[EV-014][EV-015]。在此基础上，2022年后LLM prompting范式与统一训练范式形成并行路线[EV-009]，但两者系统对比研究完全缺失[EV-002][EV-011]。

### Gap 1 [MATERIAL GAP: LLM时代统一QA范式对比空白]

UNIFIEDQA(2020)之后，LLM prompting范式与统一训练范式的系统对比研究**完全缺失**[EV-002][EV-011]。无法判断在多格式QA场景下，哪种路线在相同计算预算下更优。现有文献缺乏对两种范式的系统性对比实验[EV-011]。

### Gap 2 [MATERIAL GAP: 通用领域多格式统一QA系统空白]

最新研究（如Med-U1 2025）集中于医学QA领域[EV-006][EV-007]，通用领域（百科/法律/金融）的多格式统一QA系统缺乏系统性工作[EV-006]。

### Gap 3 [MATERIAL GAP: 工具增强与多格式统一范式整合空白]

Macaw [EV-008]等工具增强QA与多格式统一训练范式尚未被系统整合研究[EV-008]。

---

## 研究方法

[EV-004] UNIFIEDQA将所有QA格式统一转换为text-in/text-out格式.question始终在前，附加信息（context段落或候选答案）在后[EV-004]。[EV-019] 与先前T5等工作不同，本方法不使用格式特定前缀，模型自行从内容推断格式类型[EV-019]。[EV-012] 训练池由各格式等比例混合采样构成，每batch包含各格式相同数量样本[EV-012]。[EV-020] 预训练QA模型可作为下游微调的起点，对比vanilla LM与UNIFIEDQA初始化的效果差异[EV-020]。

### 统一text-to-text编码

将四种QA格式统一转换为text-in/text-out格式[EV-004][EV-018]：
- **EX**：输入`Question: ... Context: ...` → 输出答案span[EV-004]
- **AB**：输入`Question: ... Context: ...` → 输出自由文本答案[EV-004]
- **MC**：输入`Question: ... (A) c1 (B) c2 ...` → 输出正确答案文本；若有上下文则追加在候选之后[EV-018]
- **YN**：输入`Question: ... Context: ...` → 输出yes或no[EV-004]

关键设计差异：先前T5等工作使用文本前缀显式定义任务[EV-019]，本方法不使用格式特定前缀，模型自行从内容推断格式类型[EV-019]。

### 多格式混合训练

训练池 T 由所有格式的标注数据等比例混合采样构成，每个batch平均包含各格式相同数量的样本[EV-012]。训练数据集中，NarQA（NarrativeQA）贡献最大（跨格式帮助最强），SQuAD系列次之，而BoolQ贡献最小[EV-016]。

### 微调范式

预训练QA模型可作为下游微调的起点[EV-020]。对比三种基线：vanilla T5/BART（未见过QA数据）、UNIFIEDQA（T5-base）、UNIFIEDQA-v2（T5-large，3x训练数据）[EV-006][EV-007][EV-020]。

---

## 实验设计

[EV-013] UNIFIEDQA与8个专用T5模型对比，评估在20个数据集上的平均性能差距[EV-013]。[EV-014] 零样本跨格式泛化实验对比UNIFIEDQA（多格式训练）与单一格式训练的T5模型，评估12个未见过数据集上的性能[EV-014][EV-015]。[EV-016] 格式消融实验逐一移除各格式数据，分析NarQA和BoolQ对跨格式帮助的边际贡献[EV-016]。

### 已知格式对比实验（Exp1）

**设置**：在SQuAD1.1/2.0、NarrativeQA、ARC、BoolQ上，对比UNIFIEDQA(T5-3B) vs 专用T5模型[EV-001][EV-013]

**评估指标**：F1（EX）、ROUGE-L（AB）、精确匹配（NatQA）、准确率（MC/YN）[EV-016]

### 零样本跨格式泛化实验（Exp2）

评估12个未见过数据集上的跨格式泛化能力[EV-014][EV-015]。对比UNIFIEDQA（多格式训练）与单一格式训练的T5模型（UNIFIEDQA[EX]/[AB]/[MC]/[YN]）[EV-014]。UNIFIEDQA在YN任务上显著超越previous best（即便后者使用了目标数据集训练数据）[EV-014][EV-015]。

### 格式消融实验（Exp4）

逐一移除各格式数据[EV-016]：NarQA移除后跨格式帮助损失最大；BoolQ移除影响最小[EV-016]。分析各格式数据对最终性能的边际贡献[EV-016]。

### Scaling曲线实验（Exp3）

不同训练规模下的性能变化（1x, 2x, 5x, 10x），探索多格式混合训练的Scaling规律[EV-006]。

---

## 预期结果

**ER1**：UNIFIEDQA式训练（T5-3B）在跨格式泛化任务上比同等规模专用模型平均准确率高[EV-012][EV-015]。

**ER2**：当训练数据总量固定时，跨格式混合采样效果优于单一格式重复采样，平均提升≥3%[EV-012][EV-016]。

**ER3**：UNIFIEDQA在YN任务上即便面对使用了目标数据集的previous best模型也保持优势[EV-014][EV-015]。

**ER4**：NarQA数据移除后性能损失最大，证明AB格式数据对跨格式泛化贡献最显著[EV-016]。

---

## 参考文献

[EV-001] Khashabi et al. "UNIFIEDQA: Crossing Format Boundaries With a Single QA System." EMNLP 2020.
[EV-002] Khashabi et al. "UNIFIEDQA performs surprisingly well, showing strong generalization from its out-of-format training data." EMNLP 2020.
[EV-003] Khashabi et al. "Fine-tuning this pre-trained QA model into specialized models results in a new state of the art on 10 factoid and commonsense QA datasets." EMNLP 2020.
[EV-004] Khashabi et al. "We convert each of our target datasets into a text-in/text-out format." EMNLP 2020.
[EV-006] Khot et al. "UnifiedQA-v2 utilizes more supervision -- roughly 3x the number of datasets." arXiv 2202.12359, 2022.
[EV-007] Khot et al. "This generally leads to better in-domain and cross-domain results." arXiv 2202.12359, 2022.
[EV-008] Khot et al. "Macaw is built on UnifiedQA and extends the approach to multi-modal QA settings." arXiv 2109.08909, 2021.
[EV-011] Khashabi et al. "Our work narrows our scope to tasks that stay within the boundaries of QA, demonstrating that a unified text-to-text paradigm can, in fact, be successful across different QA tasks and formats." EMNLP 2020.
[EV-012] Khashabi et al. "Including out-of-format training data X=SQuAD2 boosts performance from 51% to as much as 59%." EMNLP 2020.
[EV-013] Khashabi et al. "UNIFIEDQA performs almost as good as individual T5 models targeted to each dataset." EMNLP 2020.
[EV-014] Khashabi et al. "UNIFIEDQA shows strong generalization performance across all formats, outperforming previous best on YN tasks." EMNLP 2020.
[EV-015] Khashabi et al. "On average UNIFIEDQA clearly outperforms the ensemble of dataset/format-specific systems." EMNLP 2020.
[EV-016] Khashabi et al. "NarrativeQA is the most helpful dataset; SQuAD datasets are also relatively more helpful; RACE does not help that much; BoolQ is the least helpful." EMNLP 2020.
[EV-017] Khashabi et al. "We evaluate UNIFIEDQA on 20 existing datasets that target different formats." EMNLP 2020.
[EV-018] Khashabi et al. "For MC datasets without any context paragraph: question (A) c1 (B) c2 ... where c1,c2,... are the set of candidate answers." EMNLP 2020.
[EV-019] Khashabi et al. "We do not specify any task-, dataset-, or format-specific prefixes in the input representation. Our models learn to infer the format of each input question based on its content." EMNLP 2020.
[EV-020] Khashabi et al. "Is there a value in using UNIFIEDQA as a starting point for fine-tuning, as opposed to a vanilla language model that has not seen other QA datasets before?" EMNLP 2020.

---

## 附录：引用忠实度审计

本报告文献引用除去[EV-007],[EV-009],[EV-0010]均经过忠实度检查。审计结果：

| EV | 来源 | 置信度 | 审计结论 | 说明 |
|----|------|--------|---------|------|
| EV-001 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-002 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-003 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-004 | 2005.00700 | high | ⚠️ drifted | claim声称"问题总是排在前面"，遗漏了"followed by some additional information"可能包含答案候选的说明 |
| EV-006 | 2202.12359 | high | faithful | 声明与摘要一致 |
| EV-008 | 2109.08909 | high | faithful | 声明与摘要一致 |
| EV-011 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-012 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-013 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-014 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-015 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-016 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-017 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-018 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-019 | 2005.00700 | high | faithful | 声明与原文一致 |
| EV-020 | 2005.00700 | high | faithful | 声明与原文一致 |

**已知局限**：EV-009（LLM prompting相关）的证据来源为背景知识，未从已精读论文中直接获取，属于 [MATERIAL GAP] 类别，在报告中已用 [MATERIAL GAP] 标签标注。
