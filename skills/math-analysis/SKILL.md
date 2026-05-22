# Skill：math-analysis — 定量分析与数学验证

**类型**：Companion Skill（按需使用，LLM 自行判断何时调用）

## 工具选择

| 场景 | 用哪个 |
|------|--------|
| 自然语言问题（"积分 x²sinx"、"解方程组"、"单位换算"） | `wolfram__wolfram_query` |
| 需要分步推导过程 | `wolfram__wolfram_full` |
| 验证两个表达式是否等价 | `wolfram__wolfram_check_equation` |
| 从论文汇总统计重现 p 值 / 置信区间 | exec + scipy（见 A） |
| 计算效应量 / 相对提升 | exec + numpy（见 B） |
| 符号推导（需要精确控制变量/假设） | exec + sympy（见 C） |

**优先用 Wolfram 工具**（`wolfram__wolfram_query` / `wolfram__wolfram_full` / `wolfram__wolfram_check_equation`）：自然语言直接问，返回快、结果准。exec + Python 用于需要精确数值重现或 Wolfram 无法处理的自定义统计场景。

**⚠️ Wolfram 工具已知限制**：
- ❌ **不支持 PDE 求解**（如 `u_t = u_xx`）
- ❌ **不支持抽象 Σ 求和符号**（如 `sum_j exp(x_j/T)`）
- ❌ **不支持自定义函数/多步编程**
- ✅ **能用** ODE 求解、具体导数/积分/展开、方程验证
- 遇到以上限制时降级至 Python SymPy 或 scipy（见 C / A 节）

---

## A. 统计验证

核查论文 p 值、置信区间是否可从汇总统计重现：

```python
from scipy import stats
import numpy as np

# 独立样本 Welch's t 检验
def verify_ttest(mean1, std1, n1, mean2, std2, n2, reported_p=None):
    se = np.sqrt(std1**2/n1 + std2**2/n2)
    t  = (mean1 - mean2) / se
    df = (std1**2/n1 + std2**2/n2)**2 / (
         (std1**2/n1)**2/(n1-1) + (std2**2/n2)**2/(n2-1))
    p  = 2 * stats.t.sf(abs(t), df)
    ci95 = stats.t.ppf(0.975, df) * se
    print(f"t={t:.4f}  df={df:.1f}  p={p:.6f}  CI95=±{ci95:.4f}")
    if reported_p: print(f"论文声明 p={reported_p}  一致={abs(p-reported_p)<0.01}")

# 比例检验（准确率差值显著性）
def verify_proportion(p1, n1, p2, n2, reported_p=None):
    z, p = stats.proportions_ztest([int(p1*n1), int(p2*n2)], [n1, n2])
    print(f"z={z:.4f}  p={p:.6f}")
    if reported_p: print(f"论文声明 p={reported_p}  一致={abs(p-reported_p)<0.01}")
```

---

## B. 效应量

```python
import numpy as np

def cohens_d(mean1, std1, n1, mean2, std2, n2):
    pooled = np.sqrt(((n1-1)*std1**2 + (n2-1)*std2**2) / (n1+n2-2))
    d = (mean1 - mean2) / pooled
    label = ("negligible" if abs(d)<0.2 else "small" if abs(d)<0.5
             else "medium" if abs(d)<0.8 else "large")
    print(f"Cohen's d = {d:.4f}  ({label})")

def relative_improvement(baseline, improved):
    print(f"绝对提升: {improved-baseline:.4f}  相对提升: {(improved-baseline)/abs(baseline)*100:.2f}%")
```

---

## C. 符号数学（SymPy）

验证公式推导、化简、求导、积分：

```python
from sympy import *
x, y, n = symbols('x y n')

# 验证等式
lhs, rhs = (x+y)**2, x**2 + 2*x*y + y**2
print("等式成立:", simplify(lhs - rhs) == 0)

# 求导 / 积分 / 极限
print(diff(sin(x)**2, x))
print(integrate(exp(-x**2), (x, -oo, oo)))
print(limit(sin(x)/x, x, 0))
```

---

## 使用建议

- 验证论文数值声明时用 **A**（exec + scipy，精确重现）
- 判断效果大小（不仅看 p 值）时用 **B**
- 推导/核查公式时：简单问题用 `wolfram__wolfram_query`，复杂推导用 **C**（sympy，可精确控制假设）
- 结果若与论文出入 >10%，在 report.md 对应位置标注 `[MATERIAL GAP: 数值无法重现]`
