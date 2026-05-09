# 任务 4：图表生成 - 详细工作流程

本文档提供执行 initiating-coverage 技能任务 4（图表生成）的逐步说明。

## 任务概览

**目的**：为报告生成 25-35 张专业财务图表。

**前置条件**：⚠️ 开始前验证
- **必需**：任务 1 的公司研究
  - 公司历史、里程碑（用于时间线图表）
  - 管理团队、组织结构（用于组织结构图）
  - 产品组合（用于产品图表）
  - 客户细分（用于客户图表）
  - 竞争格局（用于竞争定位图表）
  - TAM 分析（用于市场规模图表）
- **必需**：任务 2 的财务模型
  - 按产品/地区划分的收入数据
  - 利润率趋势
  - 情景对比数据
- **必需**：任务 3 的估值分析
  - DCF 敏感性表
  - 可比公司数据
  - 估值区间
- **必需**：外部市场数据
  - 历史股价数据（Yahoo Finance、Bloomberg）
  - 历史估值倍数（图表 34 可选）

**⚠️ 关键：除非任务 1、2 和 3 已完成，否则不要开始此任务**

此任务需要前三个任务的输出。没有这些输出就开始会导致图表不完整。

**如果任务 1、2 或 3 中有任何一项未完成**：立即停止，并告知用户需要先完成哪些任务。具体要求是：
- 任务 1：公司研究文档（用于 9 张图表）
- 任务 2：包含全部 6 个标签页的财务模型（用于 8 张图表）
- 任务 3：已添加到模型中的估值标签页（用于 6 张图表）
- 外部数据访问（用于 2 张图表）

不要因缺少数据而尝试创建占位图表或跳过图表。

**输出**：25-35 个专业图表文件（PNG/JPG，300 DPI）

---

## 输入验证

**开始前 - 检查所有前置条件：**

### 任务 1 验证（公司研究）
- [ ] 任务 1 已完成？（公司研究文档存在）
- [ ] 公司历史和里程碑已记录？（用于图表 05、06）
- [ ] 管理团队和组织结构已描述？（用于图表 07）
- [ ] 产品组合已详述？（用于图表 08）
- [ ] 客户细分已分析？（用于图表 09）
- [ ] 竞争格局已映射？（用于图表 16、17、18）
- [ ] TAM 规模测算已完成？（用于图表 15）

### 任务 2 验证（财务模型）
- [ ] 任务 2 已完成？（财务模型 Excel 文件存在）
- [ ] 可获得按产品划分的收入明细？（用于图表 03 ⭐）
- [ ] 可获得按地区划分的收入明细？（用于图表 04 ⭐）
- [ ] 历史 + 预测财务数据完整？（用于图表 02、10、11、12）
- [ ] 情景分析（Bull/Base/Bear）已完成？（用于图表 14）
- [ ] 可获得运营指标？（用于图表 13）

### 任务 3 验证（估值）
- [ ] 任务 3 已完成？（估值标签页已添加到模型）
- [ ] DCF 敏感性矩阵存在？（用于图表 28 ⭐）
- [ ] 可获得 DCF 计算详情？（用于图表 29）
- [ ] 可比公司数据已收集？（用于图表 30、31）
- [ ] 估值区间已计算？（用于图表 32 ⭐）

### 外部数据验证
- [ ] 可以访问历史股价数据？（Yahoo Finance、Bloomberg，用于图表 01）
- [ ] 可以访问历史估值数据？（可选，用于图表 34）

**如果任何验证失败**：
- 缺少任务 1？ → 先完成任务 1（公司研究）
- 缺少任务 2？ → 先完成任务 2（财务建模）
- 缺少任务 3？ → 先完成任务 3（估值分析）
- 缺少外部数据？ → 从 Yahoo Finance、Bloomberg 或类似来源收集

---

## 图表要求：25 张必需 + 10 张可选

**重要**：任务 5（报告组装）将在报告中嵌入**创建的所有图表**。报告需要密集的视觉内容（每 200-300 个单词 1 张图表），因此要创建全面的图表覆盖。

### 4 张强制图表（不可协商）⭐

这 4 张图表是必须存在的关键可视化：

1. **chart_03**：按产品/分部划分的收入 - 堆叠面积图 ⭐
2. **chart_04**：按地区划分的收入 - 堆叠条形图 ⭐
3. **chart_28**：DCF 敏感性分析 - 双变量热图 ⭐
4. **chart_32**：估值足球场 - 横向条形图 ⭐

### 25 张必需图表（完整集合）

创建以下全部 25 张图表。每张图表在任务 5 中都有特定用途：

**投资摘要部分（1 张图表）：**
- chart_01：股价表现（12-24 个月）

**财务表现部分（6 张图表）：**
- chart_02：收入增长轨迹
- chart_03：按产品划分的收入 - 堆叠面积 ⭐ 强制
- chart_04：按地区划分的收入 - 堆叠条形图 ⭐ 强制
- chart_10：毛利率演变
- chart_11：EBITDA 利润率推进
- chart_12：自由现金流趋势

**公司 101 部分（7 张图表）：**
- chart_05：公司概览/时间线
- chart_06：关键里程碑时间线
- chart_07：组织结构
- chart_08：产品组合概览
- chart_09：客户细分
- chart_15：市场规模演变（TAM）
- chart_16：竞争定位矩阵

**竞争与市场部分（2 张图表）：**
- chart_17：市场份额拆分
- chart_18：竞争基准比较

**情景分析部分（2 张图表）：**
- chart_13：运营指标仪表板
- chart_14：情景对比（Bull/Base/Bear）

**估值部分（7 张图表）：**
- chart_28：DCF 敏感性热图 ⭐ 强制
- chart_29：DCF 估值瀑布图
- chart_30：交易可比公司散点图
- chart_31：同业倍数比较
- chart_32：估值足球场 ⭐ 强制
- chart_33：目标价情景
- chart_34：历史估值倍数

**总计：25 张必需图表**

### 10 张可选图表（用于达到 30-35 张范围）

添加这些图表以增强视觉密度和叙事（达到总计 26-35 张）：

- chart_19：客户获取趋势
- chart_20：单位经济效益演变
- chart_21：产品路线图时间线
- chart_22：地理扩张地图
- chart_23：R&D 投资趋势
- chart_24：销售与营销效率
- chart_25：营运资本趋势
- chart_26：债务到期时间表
- chart_27：所有权结构
- chart_35：分析师目标价分布

**总范围：25-35 张图表（25 张必需 + 0-10 张可选）**

---

## 必需图表的数据源映射

理解每张图表的数据来源：

### 来自任务 1（公司研究）- 9 张图表
- chart_05：公司概览 → 任务 1：公司概览部分
- chart_06：关键里程碑 → 任务 1：公司历史部分
- chart_07：组织结构 → 任务 1：管理团队部分
- chart_08：产品组合 → 任务 1：产品与服务部分
- chart_09：客户细分 → 任务 1：客户与市场进入部分
- chart_15：市场规模演变 → 任务 1：市场机会（TAM）部分
- chart_16：竞争定位 → 任务 1：竞争格局部分
- chart_17：市场份额 → 任务 1：竞争格局部分
- chart_18：竞争基准比较 → 任务 1：竞争格局部分

### 来自任务 2（财务模型）- 8 张图表
- chart_02：收入增长 → 利润表标签页（收入行）
- chart_03：按产品划分的收入 ⭐ → 收入模型标签页（产品明细）
- chart_04：按地区划分的收入 ⭐ → 收入模型标签页（地区明细）
- chart_10：毛利率 → 利润表标签页（毛利润 / 收入）
- chart_11：EBITDA 利润率 → 利润表标签页（EBITDA / 收入）
- chart_12：自由现金流 → 现金流量表标签页（CFO - CapEx）
- chart_13：运营指标 → 多个标签页（利润表、现金流）
- chart_14：情景对比 → 情景标签页（Bull/Base/Bear）

### 来自任务 3（估值）- 6 张图表
- chart_28：DCF 敏感性 ⭐ → 敏感性分析标签页
- chart_29：DCF 瀑布图 → DCF 标签页（企业价值组成部分）
- chart_30：交易可比公司散点图 → 可比公司标签页
- chart_31：同业倍数 → 可比公司标签页
- chart_32：估值足球场 ⭐ → 估值摘要标签页
- chart_33：目标价情景 → 估值摘要标签页（或根据情景计算）

### 来自外部来源 - 2 张图表
- chart_01：股价表现 → Yahoo Finance、Bloomberg、Alpha Vantage
- chart_34：历史估值倍数 → Yahoo Finance、Bloomberg（历史 P/E、EV/EBITDA）

**重要**：需要完成全部三项任务（1、2、3），并且可以访问外部数据，才能创建全部 25 张必需图表。

---

## 逐步图表生成工作流程

### 步骤 1：设置环境

**安装所需库：**
```bash
pip install matplotlib seaborn pandas numpy plotly
```

**创建 Python 脚本头：**
```python
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from matplotlib.patches import Rectangle
import warnings
warnings.filterwarnings('ignore')

# Set global style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

# Global settings
DPI = 300
FIGURE_WIDTH = 10
FIGURE_HEIGHT = 6
TITLE_FONT_SIZE = 14
AXIS_FONT_SIZE = 12
LABEL_FONT_SIZE = 10
```

### 步骤 2：从模型和估值中提取数据

#### A. 提取收入数据
```python
# Revenue by Product (from Task 2 model)
years = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029]

# Extract from Excel or define manually from model
product_a = [100, 120, 145, 175, 210, 252, 302, 363, 435, 522]
product_b = [80, 95, 115, 138, 165, 198, 238, 285, 342, 411]
product_c = [50, 62, 78, 98, 122, 153, 191, 239, 299, 374]
product_d = [30, 38, 48, 61, 77, 97, 122, 153, 191, 239]

# Revenue by Geography
north_america = [150, 180, 220, 265, 320, 384, 461, 553, 664, 797]
europe = [80, 95, 115, 140, 170, 204, 245, 294, 353, 423]
asia_pacific = [40, 50, 63, 80, 101, 127, 159, 199, 249, 311]
rest_of_world = [20, 25, 32, 40, 51, 64, 80, 100, 125, 156]
```

#### B. 提取利润率数据
```python
# Margin evolution
gross_margin = [58.0, 59.2, 60.5, 61.8, 63.0, 64.5, 66.0, 67.0, 67.5, 68.0]
ebitda_margin = [12.0, 15.5, 18.8, 22.0, 25.0, 28.0, 30.5, 32.0, 33.0, 34.0]
fcf_margin = [8.0, 11.0, 14.5, 18.0, 21.0, 24.0, 26.5, 28.0, 29.0, 30.0]
```

#### C. 提取 DCF 敏感性数据
```python
# DCF Sensitivity (from Task 3 valuation)
wacc_values = [7.0, 8.0, 9.0, 10.0, 11.0, 12.0]
terminal_growth = [1.5, 2.0, 2.5, 3.0, 3.5]

# Price per share matrix (rows = WACC, columns = terminal growth)
dcf_sensitivity = np.array([
    [66, 71, 76, 82, 89],
    [58, 62, 67, 72, 78],
    [52, 55, 59, 63, 68],
    [47, 50, 53, 56, 60],
    [42, 45, 48, 51, 54],
    [39, 41, 44, 46, 49]
])
```

#### D. 提取估值区间
```python
# Valuation Football Field (from Task 3)
valuation_methods = ['DCF Analysis', 'Trading Comps\n(NTM)', 'Precedent\nTransactions']
valuation_low = [48, 45, 52]
valuation_high = [62, 57, 66]
current_price = 50
target_price = 55
```

### 步骤 3：创建强制图表

#### 图表 1：按产品划分的收入 - 堆叠面积图 ⭐ 强制

```python
def create_revenue_by_product_chart():
    """Create revenue by product stacked area chart"""

    fig, ax = plt.subplots(figsize=(10, 6))

    # Create stacked area chart
    ax.stackplot(years, product_a, product_b, product_c, product_d,
                 labels=['Product A', 'Product B', 'Product C', 'Product D'],
                 colors=['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'],
                 alpha=0.8)

    # Formatting
    ax.set_xlabel('Year', fontsize=12, fontweight='bold')
    ax.set_ylabel('Revenue ($M)', fontsize=12, fontweight='bold')
    ax.set_title('Figure 3 - Revenue by Product/Segment (2020-2029E)',
                 fontsize=14, fontweight='bold', pad=20)

    # Legend
    ax.legend(loc='upper left', frameon=False, fontsize=10)

    # Grid
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    ax.set_axisbelow(True)

    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    # Add vertical line to separate historical from projected
    ax.axvline(x=2024, color='gray', linestyle='--', linewidth=1, alpha=0.5)
    ax.text(2024.2, ax.get_ylim()[1]*0.95, 'Projected →',
            fontsize=9, color='gray', ha='left')

    # Source line
    fig.text(0.12, 0.02, 'Source: Company data, [Firm] estimates',
             fontsize=9, style='italic', color='gray')

    # Save
    plt.tight_layout()
    plt.savefig('chart_03_revenue_by_product_stacked_area.png',
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✓ Created: chart_03_revenue_by_product_stacked_area.png")

create_revenue_by_product_chart()
```

#### 图表 2：按地区划分的收入 - 堆叠条形图 ⭐ 强制

```python
def create_revenue_by_geography_chart():
    """Create revenue by geography stacked bar chart"""

    years_labels = ['2020', '2021', '2022', '2023', '2024',
                    '2025E', '2026E', '2027E', '2028E', '2029E']

    fig, ax = plt.subplots(figsize=(10, 6))

    # Create stacked bar chart
    width = 0.6
    x = np.arange(len(years_labels))

    p1 = ax.bar(x, north_america, width, label='North America', color='#1f77b4')
    p2 = ax.bar(x, europe, width, bottom=north_america,
                label='Europe', color='#ff7f0e')
    p3 = ax.bar(x, asia_pacific, width,
                bottom=np.array(north_america) + np.array(europe),
                label='Asia-Pacific', color='#2ca02c')
    p4 = ax.bar(x, rest_of_world, width,
                bottom=np.array(north_america) + np.array(europe) + np.array(asia_pacific),
                label='Rest of World', color='#d62728')

    # Formatting
    ax.set_xlabel('Year', fontsize=12, fontweight='bold')
    ax.set_ylabel('Revenue ($M)', fontsize=12, fontweight='bold')
    ax.set_title('Figure 4 - Revenue by Geography (2020-2029E)',
                 fontsize=14, fontweight='bold', pad=20)
    ax.set_xticks(x)
    ax.set_xticklabels(years_labels, rotation=45, ha='right')

    # Legend
    ax.legend(loc='upper left', frameon=False, fontsize=10)

    # Grid
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    ax.set_axisbelow(True)

    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    # Source line
    fig.text(0.12, 0.02, 'Source: Company data, [Firm] estimates',
             fontsize=9, style='italic', color='gray')

    # Save
    plt.tight_layout()
    plt.savefig('chart_04_revenue_by_geography_stacked_bar.png',
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✓ Created: chart_04_revenue_by_geography_stacked_bar.png")

create_revenue_by_geography_chart()
```

#### 图表 3：DCF 敏感性 - 热图 ⭐ 强制

```python
def create_dcf_sensitivity_heatmap():
    """Create DCF sensitivity analysis heatmap"""

    # Create DataFrame
    df = pd.DataFrame(dcf_sensitivity,
                      index=[f'{w}%' for w in wacc_values],
                      columns=[f'{g}%' for g in terminal_growth])

    fig, ax = plt.subplots(figsize=(8, 6))

    # Create heatmap
    sns.heatmap(df, annot=True, fmt='d', cmap='RdYlGn',
                cbar_kws={'label': 'Price per Share ($)'},
                linewidths=0.5, linecolor='white',
                ax=ax, vmin=35, vmax=95)

    # Formatting
    ax.set_xlabel('Terminal Growth Rate', fontsize=12, fontweight='bold')
    ax.set_ylabel('WACC', fontsize=12, fontweight='bold')
    ax.set_title('Figure 28 - DCF Sensitivity Analysis ($/share)',
                 fontsize=14, fontweight='bold', pad=20)

    # Rotate y-axis labels
    plt.yticks(rotation=0)

    # Source line
    fig.text(0.12, 0.02, 'Source: [Firm] estimates',
             fontsize=9, style='italic', color='gray')

    # Save
    plt.tight_layout()
    plt.savefig('chart_28_dcf_sensitivity_heatmap.png',
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✓ Created: chart_28_dcf_sensitivity_heatmap.png")

create_dcf_sensitivity_heatmap()
```

#### 图表 4：估值足球场 ⭐ 强制

```python
def create_valuation_football_field():
    """Create valuation football field chart"""

    fig, ax = plt.subplots(figsize=(10, 5))

    # Create horizontal bars
    y_positions = np.arange(len(valuation_methods))
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c']

    for i, (method, low, high, color) in enumerate(
            zip(valuation_methods, valuation_low, valuation_high, colors)):
        ax.barh(i, high - low, left=low, height=0.6,
                color=color, alpha=0.7, label=method)

        # Add value labels at ends
        ax.text(low - 1, i, f'${low}', va='center', ha='right', fontsize=10)
        ax.text(high + 1, i, f'${high}', va='center', ha='left', fontsize=10)

    # Add current price line
    ax.axvline(x=current_price, color='red', linestyle='--', linewidth=2,
               label=f'Current: ${current_price}', alpha=0.7)

    # Add target price line
    ax.axvline(x=target_price, color='black', linestyle='-', linewidth=2,
               label=f'Target: ${target_price}')

    # Formatting
    ax.set_yticks(y_positions)
    ax.set_yticklabels(valuation_methods, fontsize=11)
    ax.set_xlabel('Price Per Share ($)', fontsize=12, fontweight='bold')
    ax.set_title('Figure 32 - Valuation Football Field',
                 fontsize=14, fontweight='bold', pad=20)

    # Set x-axis limits
    ax.set_xlim(40, 70)

    # Remove spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)

    # Grid
    ax.grid(axis='x', alpha=0.3, linestyle='--')
    ax.set_axisbelow(True)

    # Legend
    ax.legend(loc='upper right', frameon=False, fontsize=9)

    # Source line
    fig.text(0.12, 0.02, 'Source: [Firm] estimates',
             fontsize=9, style='italic', color='gray')

    # Save
    plt.tight_layout()
    plt.savefig('chart_32_valuation_football_field.png',
                dpi=300, bbox_inches='tight', facecolor='white')
    plt.close()
    print("✓ Created: chart_32_valuation_football_field.png")

create_valuation_football_field()
```

### 步骤 4：创建剩余必需图表（图表 1-34）

**通过创建必需列表中的所有剩余图表，完成 25 张必需图表**。每张图表在任务 5 中都有特定用途。

#### 投资摘要（1 张图表）
```python
# chart_01: Stock Price Performance (12-24 months)
# - Line chart showing stock price over time vs. market index
# - Used on Page 1 of final report
```

#### 财务表现（chart_03 和 chart_04 之外的 5 张附加图表）
```python
# chart_02: Revenue Growth Trajectory
# chart_10: Gross Margin Evolution
# chart_11: EBITDA Margin Progression
# chart_12: Free Cash Flow Trend
# chart_14: Scenario Comparison (Bull/Base/Bear)
```

#### 公司 101 部分（7 张图表）
```python
# chart_05: Company Overview/Timeline
# chart_06: Key Milestones Timeline
# chart_07: Organizational Structure
# chart_08: Product Portfolio Overview
# chart_09: Customer Segmentation
# chart_15: Market Size Evolution (TAM)
# chart_16: Competitive Positioning Matrix
```

#### 竞争与市场（2 张图表）
```python
# chart_17: Market Share Breakdown
# chart_18: Competitive Benchmarking
```

#### 情景分析（1 张图表）
```python
# chart_13: Operating Metrics Dashboard
```

#### 估值部分（chart_28 和 chart_32 之外的 6 张附加图表）
```python
# chart_29: DCF Valuation Waterfall
# chart_30: Trading Comps Scatter Plot
# chart_31: Peer Multiples Comparison
# chart_33: Price Target Scenarios
# chart_34: Historical Valuation Multiples
```

**所有图表使用一致格式：**
- 300 DPI 分辨率
- 专业配色方案
- 清晰的标签、图例和标题
- 图编号（例如，“Figure 5 - Company Timeline”）
- 底部来源引用

### 步骤 4B：创建可选图表（用于总计 26-35 张）

**可选**：从此列表中添加 1-10 张附加图表，以提高视觉密度：

```python
# chart_19: Customer Acquisition Trends
# chart_20: Unit Economics Evolution
# chart_21: Product Roadmap Timeline
# chart_22: Geographic Expansion Map
# chart_23: R&D Investment Trends
# chart_24: Sales & Marketing Efficiency
# chart_25: Working Capital Trends
# chart_26: Debt Maturity Schedule
# chart_27: Ownership Structure
# chart_35: Analyst Price Target Distribution
```

这些可选图表提供额外的视觉叙事，并帮助达到任务 5 中“每 200-300 个单词 1 张图表”的密度目标。

### 步骤 5：创建图表索引

创建一个记录所有图表的文本文件：

```python
def create_chart_index():
    """Create index of all charts"""

    # 25 REQUIRED CHARTS
    required_charts = [
        "chart_01_stock_price_performance.png - Stock Price Performance (12-24M)",
        "chart_02_revenue_growth_trajectory.png - Revenue Growth Trajectory",
        "chart_03_revenue_by_product_stacked_area.png - Revenue by Product [MANDATORY]",
        "chart_04_revenue_by_geography_stacked_bar.png - Revenue by Geography [MANDATORY]",
        "chart_05_company_overview.png - Company Overview/Timeline",
        "chart_06_key_milestones_timeline.png - Key Milestones Timeline",
        "chart_07_organizational_structure.png - Organizational Structure",
        "chart_08_product_portfolio.png - Product Portfolio Overview",
        "chart_09_customer_segmentation.png - Customer Segmentation",
        "chart_10_gross_margin_evolution.png - Gross Margin Evolution",
        "chart_11_ebitda_margin_progression.png - EBITDA Margin Progression",
        "chart_12_free_cash_flow_trend.png - Free Cash Flow Trend",
        "chart_13_operating_metrics_dashboard.png - Operating Metrics Dashboard",
        "chart_14_scenario_comparison.png - Scenario Comparison (Bull/Base/Bear)",
        "chart_15_market_size_evolution.png - Market Size Evolution (TAM)",
        "chart_16_competitive_positioning.png - Competitive Positioning Matrix",
        "chart_17_market_share.png - Market Share Breakdown",
        "chart_18_competitive_benchmarking.png - Competitive Benchmarking",
        "chart_28_dcf_sensitivity_heatmap.png - DCF Sensitivity Heatmap [MANDATORY]",
        "chart_29_dcf_waterfall.png - DCF Valuation Waterfall",
        "chart_30_trading_comps_scatter.png - Trading Comps Scatter Plot",
        "chart_31_peer_multiples_comparison.png - Peer Multiples Comparison",
        "chart_32_valuation_football_field.png - Valuation Football Field [MANDATORY]",
        "chart_33_price_target_scenarios.png - Price Target Scenarios",
        "chart_34_historical_valuation_multiples.png - Historical Valuation Multiples",
    ]

    # 10 OPTIONAL CHARTS (for 26-35 range)
    optional_charts = [
        "chart_19_customer_acquisition_trends.png - Customer Acquisition Trends [OPTIONAL]",
        "chart_20_unit_economics_evolution.png - Unit Economics Evolution [OPTIONAL]",
        "chart_21_product_roadmap_timeline.png - Product Roadmap Timeline [OPTIONAL]",
        "chart_22_geographic_expansion_map.png - Geographic Expansion Map [OPTIONAL]",
        "chart_23_rd_investment_trends.png - R&D Investment Trends [OPTIONAL]",
        "chart_24_sales_marketing_efficiency.png - Sales & Marketing Efficiency [OPTIONAL]",
        "chart_25_working_capital_trends.png - Working Capital Trends [OPTIONAL]",
        "chart_26_debt_maturity_schedule.png - Debt Maturity Schedule [OPTIONAL]",
        "chart_27_ownership_structure.png - Ownership Structure [OPTIONAL]",
        "chart_35_analyst_price_targets.png - Analyst Price Target Distribution [OPTIONAL]",
    ]

    with open('chart_index.txt', 'w') as f:
        f.write("CHART INDEX FOR [COMPANY] EQUITY RESEARCH REPORT\n")
        f.write("=" * 60 + "\n\n")

        f.write("4 MANDATORY CHARTS (Must be present):\n")
        f.write("- chart_03: Revenue by Product (Stacked Area) ⭐\n")
        f.write("- chart_04: Revenue by Geography (Stacked Bar) ⭐\n")
        f.write("- chart_28: DCF Sensitivity (Heatmap) ⭐\n")
        f.write("- chart_32: Valuation Football Field ⭐\n\n")

        f.write("25 REQUIRED CHARTS:\n")
        for chart in required_charts:
            f.write(f"  {chart}\n")

        f.write("\n10 OPTIONAL CHARTS (for 26-35 total):\n")
        for chart in optional_charts:
            f.write(f"  {chart}\n")

        f.write("\n" + "=" * 60 + "\n")
        f.write("NOTE: Task 5 will embed ALL charts created (25-35) throughout\n")
        f.write("the report for visual density (1 chart every 200-300 words).\n")

    print("✓ Created: chart_index.txt")

create_chart_index()
```

### 步骤 6：质量检查

**运行验证检查：**

```python
import os

def verify_charts():
    """Verify all charts were created successfully"""

    mandatory_charts = [
        'chart_03_revenue_by_product_stacked_area.png',
        'chart_04_revenue_by_geography_stacked_bar.png',
        'chart_28_dcf_sensitivity_heatmap.png',
        'chart_32_valuation_football_field.png'
    ]

    print("\n" + "="*60)
    print("CHART GENERATION VERIFICATION")
    print("="*60)

    # Check mandatory charts
    print("\n1. MANDATORY CHARTS:")
    all_mandatory_present = True
    for chart in mandatory_charts:
        if os.path.exists(chart):
            size = os.path.getsize(chart) / 1024  # KB
            print(f"   ✓ {chart} ({size:.1f} KB)")
        else:
            print(f"   ✗ MISSING: {chart}")
            all_mandatory_present = False

    # Count total charts
    chart_files = [f for f in os.listdir('.') if f.startswith('chart_') and f.endswith('.png')]
    print(f"\n2. TOTAL CHARTS: {len(chart_files)}")
    print(f"   Target: 25-35 charts")
    print(f"   Status: {'✓ PASS' if 25 <= len(chart_files) <= 35 else '⚠ WARNING'}")

    # Check file sizes (should be > 50KB for 300 DPI)
    print("\n3. FILE SIZE CHECK:")
    small_files = []
    for chart in chart_files[:5]:  # Sample first 5
        size = os.path.getsize(chart) / 1024
        if size < 50:
            small_files.append(chart)
        print(f"   {chart}: {size:.1f} KB")

    if small_files:
        print(f"   ⚠ WARNING: {len(small_files)} files may be low resolution")
    else:
        print(f"   ✓ All sampled files have adequate size")

    # Final verdict
    print("\n" + "="*60)
    if all_mandatory_present and 25 <= len(chart_files) <= 35:
        print("✓ VERIFICATION PASSED - Ready for Task 5")
    else:
        print("✗ VERIFICATION FAILED - Review missing charts")
    print("="*60 + "\n")

verify_charts()
```

---

## 质量标准

### 视觉质量
- [ ] 高分辨率（最低 300 DPI）
- [ ] 专业配色方案（所有图表保持一致）
- [ ] 清晰、易读的文本（字体不小于 9pt）
- [ ] 合适的宽高比（无变形）
- [ ] 无像素化或伪影

### 数据准确性
- [ ] 数据与来源一致（财务模型和估值）
- [ ] 单位和标签正确（百万美元、百分比等）
- [ ] 比例尺和范围合适
- [ ] 各图表时间区间一致
- [ ] 计算已验证

### 格式质量
- [ ] 所有图表样式一致
- [ ] 图编号正确（顺序编号）
- [ ] 标题和说明清晰
- [ ] 每张图表都有来源引用
- [ ] 外观专业

### 完整性
- [ ] 全部 4 张强制图表已创建
- [ ] 总计 25-35 张图表
- [ ] 文件命名正确（chart_01、chart_02 等）
- [ ] 图表索引已创建
- [ ] 准备好嵌入 Word

---

## 图表类型参考

### 何时使用每种图表类型

**折线图**：时间序列趋势（收入、利润率、股价）

**堆叠面积图**：按产品划分的收入 ⭐、市场规模构成

**堆叠条形图**：按地区划分的收入 ⭐、季度拆分

**热图**：DCF 敏感性 ⭐、相关矩阵

**横向条形图**：估值足球场 ⭐、同业排名

**瀑布图**：收入桥、利润率分析、DCF 组成

**散点/气泡图**：增长 vs. 估值、竞争定位

**2×2 矩阵**：竞争定位、产品组合

---

## 文件命名约定

**始终使用此格式：**
```
chart_[NUMBER]_[DESCRIPTION].png

Examples:
chart_01_stock_price_performance.png
chart_03_revenue_by_product_stacked_area.png
chart_28_dcf_sensitivity_heatmap.png
```

**根据图表在报告中的位置而不是创建顺序对图表顺序编号**。

---

## 常见图表生成问题

### 问题 1：低分辨率
**问题**：图表看起来像素化
**解决方案**：确保 `plt.savefig()` 中设置 `dpi=300`

### 问题 2：文本被裁切
**问题**：标签或标题在边缘被裁切
**解决方案**：在 `plt.savefig()` 中使用 `bbox_inches='tight'`

### 问题 3：颜色不佳
**问题**：颜色看起来不专业
**解决方案**：使用 Tableau10 等成熟调色板，或定义自定义企业颜色

### 问题 4：标签重叠
**问题**：轴标签重叠
**解决方案**：旋转标签（例如 `rotation=45`）或减小字体大小

### 问题 5：空白
**问题**：图表周围空白过多
**解决方案**：保存前使用 `plt.tight_layout()`

---

## 成功标准

成功的图表包应当：
1. **包含全部 4 张强制图表**（已验证）⭐
   - chart_03：按产品划分的收入
   - chart_04：按地区划分的收入
   - chart_28：DCF 敏感性
   - chart_32：估值足球场
2. **创建至少 25 张必需图表**（已验证）
3. **可选：1-10 张附加图表**，达到总计 26-35 张
4. 所有图表具有一致的专业样式
5. 高分辨率（300 DPI），达到打印质量
6. 每张图表都有清晰的标签、图例和标题
7. 包含正确的图编号和来源引用
8. 准备好立即嵌入 Word
9. 覆盖所有关键财务指标和分析
10. 讲述补充书面分析的视觉故事
11. 准确且可追溯至源数据（模型/估值）
12. 所有图表与图表索引一起打包到 zip 文件中

**记住**：任务 5 会在整个报告中嵌入创建的所有图表（25-35 张），以达到视觉密度。

---

## 输出文件

完成任务 4 后，交付物包括：

**25 个必需图表文件（最低）：**
1. chart_01_stock_price_performance.png
2. chart_02_revenue_growth_trajectory.png
3. chart_03_revenue_by_product_stacked_area.png ⭐ 强制
4. chart_04_revenue_by_geography_stacked_bar.png ⭐ 强制
5. chart_05_company_overview.png
6. chart_06_key_milestones_timeline.png
7. chart_07_organizational_structure.png
8. chart_08_product_portfolio.png
9. chart_09_customer_segmentation.png
10. chart_10_gross_margin_evolution.png
11. chart_11_ebitda_margin_progression.png
12. chart_12_free_cash_flow_trend.png
13. chart_13_operating_metrics_dashboard.png
14. chart_14_scenario_comparison.png
15. chart_15_market_size_evolution.png
16. chart_16_competitive_positioning.png
17. chart_17_market_share.png
18. chart_18_competitive_benchmarking.png
19-27. *为可选图表预留（如果创建）*
28. chart_28_dcf_sensitivity_heatmap.png ⭐ 强制
29. chart_29_dcf_waterfall.png
30. chart_30_trading_comps_scatter.png
31. chart_31_peer_multiples_comparison.png
32. chart_32_valuation_football_field.png ⭐ 强制
33. chart_33_price_target_scenarios.png
34. chart_34_historical_valuation_multiples.png
35. *为可选图表预留（如果创建）*

**10 个可选图表文件（用于总计 26-35 张）：**
- chart_19 through chart_27, chart_35（如果创建）

**图表索引**（1 个文本文件）：
- chart_index.txt（列出所有图表及描述和类别）

**所有图表文件必须是：**
- 300 DPI 分辨率（打印质量）
- 6-10 英寸宽（标准 Word 嵌入尺寸）
- 白色背景（专业外观）
- PNG 格式（无损质量）
- 准备好立即嵌入 Word

**最后一步：打包所有图表**

创建一个包含所有图表文件和图表索引的 zip 文件：

```
[Company]_Charts_[Date].zip
├── chart_01_stock_price_performance.png
├── chart_02_revenue_growth_trajectory.png
├── chart_03_revenue_by_product_stacked_area.png ⭐
├── chart_04_revenue_by_geography_stacked_bar.png ⭐
├── chart_05_company_overview.png
├── ... (all 25-35 chart files)
├── chart_28_dcf_sensitivity_heatmap.png ⭐
├── chart_32_valuation_football_field.png ⭐
├── chart_34_historical_valuation_multiples.png
└── chart_index.txt
```

**示例**：`Tesla_Charts_2024-10-28.zip`

**为什么这很重要**：任务 5 会在整个报告中嵌入创建的所有图表（25-35 张）。报告需要视觉密度（每 200-300 个单词 1 张图表），因此所有图表都有用途，即用于特定分析部分，或用于视觉叙事和页面密度。
- 验证全部 25-35 张图表都存在
- 为任务 5（报告组装）提取图表

---

## 后续步骤

完成任务 4 后，zip 文件将用于：
- **任务 5（报告组装）**：提取图表，并在最终 DOCX 报告中的适当位置嵌入全部图表

4 张强制图表对报告的估值和财务分析部分至关重要。
