# Skill 7：science-slides — 开题报告 PPT

**触发**：需要生成中文学术风格开题报告 PPT，通常在 report-writer 之后使用。

**依赖**：`pip install python-pptx`（通过 bash_exec 安装）

---

## 工作流（四步走）

```
Step 0  检测用户模板  ←  ~/slides/templates/*.pptx 或用户指定路径
         ↓ 有模板 → 模板模式（克隆背景复用）
         ↓ 无模板 → 从零绘制（academic-zh.md 默认样式）
Step 1  加载/初始化样式  ←  ~/slides/styles/academic-zh.md
Step 2  生成 HTML 预览  →  输出到聊天界面（用户确认配色与布局）
Step 3  生成完整 .pptx  →  state/projects/<slug>/slides/开题报告.pptx
```

---

## Step 0：检测用户模板（模板模式 vs 从零绘制）

检测路径（按优先级）：
1. 用户本次对话中提供的 `.pptx` 路径
2. `slides/templates/` 目录（workspace 相对路径，即 `~/.openclaw/workspace-scientist/slides/templates/`）下的 `.pptx` 文件（取最新修改的）
3. USER_CONFIG.md 中配置的 `template_path` 字段（绝对路径，如 `C:\Users\hp\Downloads\模版.pptx`）
4. 无模板 → 进入从零绘制流程

**模板检测代码**（Step 0 执行时运行）：
```python
import os, re, glob

def find_template(slug: str) -> str | None:
    """Return template path by priority, or None if not found."""
    workspace = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Priority 1: user-provided in conversation (passed as argument)
    # handled by caller

    # Priority 2: slides/templates/ in workspace
    tmpl_dir = os.path.join(workspace, "slides", "templates")
    if os.path.isdir(tmpl_dir):
        pptx_files = glob.glob(os.path.join(tmpl_dir, "*.pptx"))
        if pptx_files:
            return max(pptx_files, key=os.path.getmtime)

    # Priority 3: template_path field in USER_CONFIG.md
    config_path = os.path.join(workspace, "USER_CONFIG.md")
    if os.path.isfile(config_path):
        with open(config_path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r'\s*-\s*\*\*template_path\*\*:\s*(.+)', line)
                if m:
                    tp = m.group(1).strip()
                    if tp and os.path.isfile(tp):
                        return tp

    return None  # → 从零绘制
```

**模板缓存**：检测到模板后，立即复制到项目目录：
```python
import shutil, os

CACHE_PATH = f"state/projects/{slug}/slides/template_cache.pptx"
os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)

if not os.path.exists(CACHE_PATH):
    shutil.copy2(template_path, CACHE_PATH)
    print(f"Template cached: {CACHE_PATH}")
else:
    print(f"Using cached template: {CACHE_PATH}")

# 后续所有操作均从 CACHE_PATH 读取，不再依赖原始路径
template_path = CACHE_PATH
```

缓存规则：
- 同一项目首次使用时复制，之后复用缓存（即使原始文件被删除或移动）
- 用户更换模板时需显式说明 → 覆盖缓存后重新生成
- 缓存文件名固定为 `template_cache.pptx`，不含原始文件名（避免路径中文或空格问题）

**模板模式**：用 `Presentation(template_path)` 打开，继承背景图、主题配色、字体方案，用 `clone_slide` 复用内容页背景：

```python
from lxml import etree
import copy

def clone_slide(prs, source_slide):
    """克隆幻灯片，保留背景图和所有形状，重新映射图片关系。"""
    new_slide = prs.slides.add_slide(source_slide.slide_layout)
    # 复制所有非 layout 关系，建立 rId 映射
    rId_map = {}
    for rId, rel in source_slide.part.rels.items():
        if 'slideLayout' in rel.reltype:
            continue
        if not rel.is_external:
            new_rId = new_slide.part.relate_to(rel.target_part, rel.reltype)
            rId_map[rId] = new_rId
    # 深拷贝 spTree，替换 rId 引用
    src_xml = etree.tostring(source_slide.shapes._spTree, encoding='unicode')
    for old_rId, new_rId in rId_map.items():
        src_xml = src_xml.replace(f'"{old_rId}"', f'"{new_rId}"')
    new_spTree = etree.fromstring(src_xml)
    dst_spTree = new_slide.shapes._spTree
    dst_spTree.getparent().replace(dst_spTree, new_spTree)
    return new_slide
```

**标准用法**：
```python
prs = Presentation(template_path)
COVER_PROTO   = prs.slides[0]   # 封面原型
CONTENT_PROTO = prs.slides[1]   # 内容页原型（含背景图）
N_PROTOS      = len(prs.slides) # 最后删除原始 demo 幻灯片

# 按需克隆
cover = clone_slide(prs, COVER_PROTO)
s2    = clone_slide(prs, CONTENT_PROTO)
# ... 其余内容页同理

# 删除原始 demo 幻灯片
for _ in range(N_PROTOS):
    rId = prs.slides._sldIdLst[0].rId
    prs.part.drop_rel(rId)
    del prs.slides._sldIdLst[0]
```

**设置占位符文字**（必须清除所有段落，防止模板残留文字）：
```python
from pptx.oxml.ns import qn

def set_placeholder(slide, idx, text, size_pt=None, bold=None, color=None):
    for ph in slide.placeholders:
        if ph.placeholder_format.idx == idx:
            tf = ph.text_frame
            tf.word_wrap = True
            # ⚠️ 必须删除第一段之后的所有段落（模板常有多段残留）
            txBody = tf._txBody
            for extra_p in txBody.findall(qn('a:p'))[1:]:
                txBody.remove(extra_p)
            p = tf.paragraphs[0]
            p.clear()
            run = p.add_run()
            run.text = text
            if size_pt: run.font.size = Pt(size_pt)
            if bold is not None: run.font.bold = bold
            if color: run.font.color.rgb = color
            return
```

---

## Step 1：样式加载

读取 `~/slides/styles/academic-zh.md`：
- **文件存在** → 加载其中的配色、字体、布局参数，覆盖以下默认值
- **文件不存在** → 用默认值生成该文件，并告知用户可修改

```bash
mkdir -p ~/slides/styles
```

### 默认样式（写入 `~/slides/styles/academic-zh.md`）

```markdown
# 学术中文 PPT 样式 · academic-zh

## 配色
- 主色（标题背景）: #1A3C8F
- 浅色（内容背景）: #EEF2FF
- 正文色: #1A1A2E
- 白字: #FFFFFF
- 强调色: #FF8C00

## 字体
- 标题: Microsoft YaHei Bold（备选 SimHei），32-40pt
- 正文: Microsoft YaHei（备选 SimSun），18-24pt
- 英文: Calibri（备选 Arial）
- 只用系统内置字体，禁止依赖嵌入字体

## 布局
- 尺寸: 13.33 × 7.5 英寸（16:9）
- 标题栏高度: 1.3 英寸
- 内容区左边距: 0.6 英寸，右边距: 0.6 英寸
- 内容区上边距: 1.6 英寸

## 规则
- 最多 6 条 bullet，每条 ≤ 20 汉字（6×6 原则）
- 全局最多 4 种颜色
- 超出 bullet 数 → 拆分为两张幻灯片
```

> **模板模式下**：配色从模板 theme 继承，academic-zh.md 中的配色仅用于 HTML 预览和手动绘制的补充元素（如强调色）。

---

## Step 2：HTML 预览（输出到聊天界面）

**在生成 .pptx 之前**，先向聊天界面输出 3 张关键幻灯片的 HTML 缩略图预览：
封面 / 研究背景 / 研究方案。用户确认样式后再生成完整 PPT。

使用以下模板，将样式参数替换为实际值后，直接在回复中输出：

```html
<div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;font-family:'Microsoft YaHei',Arial,sans-serif">

  <!-- 幻灯片 1：封面 -->
  <div style="width:320px;height:180px;background:#1A3C8F;border-radius:6px;
              display:flex;flex-direction:column;justify-content:center;
              align-items:center;padding:20px;box-sizing:border-box;position:relative">
    <div style="color:#FF8C00;font-size:11px;letter-spacing:2px;margin-bottom:8px">开题报告</div>
    <div style="color:#fff;font-size:15px;font-weight:bold;text-align:center;line-height:1.4">
      {研究主题标题}
    </div>
    <div style="color:#EEF2FF;font-size:10px;margin-top:12px">{姓名} · {机构} · {日期}</div>
    <div style="position:absolute;bottom:8px;right:10px;color:#ffffff44;font-size:9px">1 / N</div>
  </div>

  <!-- 幻灯片 3：研究背景 -->
  <div style="width:320px;height:180px;background:#EEF2FF;border-radius:6px;
              overflow:hidden;position:relative">
    <div style="background:#1A3C8F;height:36px;display:flex;align-items:center;padding:0 14px">
      <span style="color:#fff;font-weight:bold;font-size:13px">研究背景与动机</span>
    </div>
    <div style="padding:10px 14px">
      <div style="color:#1A1A2E;font-size:10px;line-height:1.8">
        <div>▸ {背景要点 1，≤ 20 汉字}</div>
        <div>▸ {背景要点 2，≤ 20 汉字}</div>
        <div>▸ {背景要点 3，≤ 20 汉字}</div>
        <div style="color:#FF8C00;margin-top:6px;font-weight:bold">▸ {核心痛点/动机}</div>
      </div>
    </div>
    <div style="position:absolute;bottom:8px;right:10px;color:#1A3C8F66;font-size:9px">3 / N</div>
  </div>

  <!-- 幻灯片 7：研究方案 -->
  <div style="width:320px;height:180px;background:#EEF2FF;border-radius:6px;
              overflow:hidden;position:relative">
    <div style="background:#1A3C8F;height:36px;display:flex;align-items:center;padding:0 14px">
      <span style="color:#fff;font-weight:bold;font-size:13px">研究方案</span>
    </div>
    <div style="padding:10px 14px;display:flex;gap:10px">
      <div style="flex:1;background:#fff;border-radius:4px;padding:8px;font-size:9px;color:#1A1A2E;line-height:1.6">
        <div style="color:#1A3C8F;font-weight:bold;margin-bottom:4px">方法</div>
        <div>{方法要点 1}</div>
        <div>{方法要点 2}</div>
      </div>
      <div style="flex:1;background:#fff;border-radius:4px;padding:8px;font-size:9px;color:#1A1A2E;line-height:1.6">
        <div style="color:#FF8C00;font-weight:bold;margin-bottom:4px">创新点</div>
        <div>{创新点 1}</div>
        <div>{创新点 2}</div>
      </div>
    </div>
    <div style="position:absolute;bottom:8px;right:10px;color:#1A3C8F66;font-size:9px">7 / N</div>
  </div>

</div>
<p style="color:#666;font-size:12px;margin:4px 0">
  📐 以上为样式预览（蓝白学术风 · academic-zh）。
  如需调整配色/字体，请修改 <code>~/slides/styles/academic-zh.md</code> 后告知，或直接说明改动。
  确认后生成完整 .pptx。
</p>
```

**等待用户确认**后再进入 Step 3。若用户提出修改：
- 配色/字体改动 → 更新 `~/slides/styles/academic-zh.md` → 重新输出预览
- 内容改动 → 直接进入 Step 3 按新内容生成

---

## Step 3：生成完整 .pptx

### 标准结构（12-15 张）

| # | 幻灯片 | 内容来源 |
|---|--------|---------|
| 1 | 封面（题目/姓名/导师/日期） | USER_CONFIG.md |
| 2 | 目录 | 自动生成 |
| 3 | 研究背景与动机 | report.md §1 |
| 4-5 | 国内外研究现状（含对比表）| report.md §2 + literature-synthesis |
| 6 | 研究问题与假设 | report.md §3 |
| 7-8 | 研究方案与技术路线 | report.md §4 |
| 9 | 实验设计 | report.md §5 |
| 10 | 预期成果与创新点 | report.md §6 |
| 11 | 研究时间表（甘特图） | report.md §7 |
| 12 | 参考文献（核心 8-12 篇）| 论文库 |

### python-pptx 代码规范

**单位**：必须用 `pptx.util` 的具名单位，禁止裸数字：
```python
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

# ✅ 正确
tf.width = Inches(6.0)
tf.font.size = Pt(24)

# ❌ 错误（裸数字会被解释为 EMU，产生极小/极大尺寸）
tf.width = 6
tf.font.size = 24
```

**字体**：只用系统内置字体（参考 `~/slides/styles/academic-zh.md`）：
```python
# ✅ 安全
run.font.name = "Microsoft YaHei"    # Windows
run.font.name = "PingFang SC"        # macOS
# ❌ 不安全（需嵌入字体才能在其他机器正常显示）
run.font.name = "Noto Sans CJK SC"
```

**图片**：必须显式指定尺寸，禁止依赖自动适应：
```python
# ✅ 正确
slide.shapes.add_picture(img_path, Inches(1), Inches(1.5), width=Inches(4))
# ❌ 错误（auto-fit 经常失效）
slide.shapes.add_picture(img_path, Inches(1), Inches(1.5))
```

**配色从样式加载**：
```python
# 模板模式：从模板 theme 读取（accent1=主色，accent2=强调色）
# 从零绘制：从 ~/slides/styles/academic-zh.md 读取后赋值
THEME_BLUE    = RGBColor(0x1A, 0x3C, 0x8F)
THEME_LIGHT   = RGBColor(0xEE, 0xF2, 0xFF)
TEXT_DARK     = RGBColor(0x1A, 0x1A, 0x2E)
TEXT_WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
ACCENT_ORANGE = RGBColor(0xFF, 0x8C, 0x00)
```

**甘特图**：用 `add_shape(MSO_SHAPE_TYPE.RECTANGLE)` 绘制，不依赖外部图表库。

### 版本管理

每次生成后记录到 `~/slides/projects/<slug>/versions.md`：
```markdown
## v{N} · {日期}
- 幻灯片数：{N} 张
- 主要变化：{初始生成 / 修改 X 处}
- 文件：{路径}
```

**输出路径**：`state/projects/<slug>/slides/开题报告.pptx`

更新 TODO.md：`- [x] 开题报告 PPT（N 张）`

写入 SUMMARY.md（追加，本次为最终摘要）：
```markdown
## 阶段 7 摘要 · {日期} · ✅ 项目完成
- PPT：{N 张，路径}
- 样式：{模板模式（template.pptx）| academic-zh（~/slides/styles/academic-zh.md）}
- 全流程耗时：{首次 Skill 1 日期} → {今日}
- 产出清单：project.md / report.md / report.html / 开题报告.pptx
- 关键数值：精读 {N} 篇 / EV {N} 条 / Related Work {N} 词 / Gap {N} 条
```

---

## 验收门：PPT 结构门

| 条件 | 要求 |
|------|------|
| 幻灯片数量 | ≥ 12 张 |
| 必要幻灯片 | 封面/目录/背景/现状/问题/方案/实验/成果/时间表/参考文献 均存在 |
| 内容规则 | 无幻灯片超过 6 条 bullet |
| 文件存在 | .pptx 文件实际存在于 slides/ 目录 |
| 样式来源 | 模板文件已存在 **或** academic-zh.md 已存在 |
| 用户确认 | HTML 预览已展示并经用户确认 |

---

## 执行步骤（强制）

完成本阶段内容后，按顺序执行：

```bash
# 1. 签署物料护照（.pptx 文件是本阶段产出）
python scripts/passport.py <slug> sign state/projects/<slug>/slides/开题报告.pptx 7

# 2. 门控检查（PPT 结构门）
python scripts/gate_check.py <slug> 7
```

- PASS → 更新 TODO.md `[x] 阶段 7：开题 PPT`，流水线主干完成
- FAIL → 展示缺失项，执行 SCIENTIST.md §1.6 失败处理流程（通常需补充幻灯片数量或必要章节）
