# 任务 2：财务建模 - 详细工作流

本文档提供执行首次覆盖技能中任务 2（财务建模）的逐步说明。

## 任务概览

**目的**：提取历史财务数据，并构建包含预测和情景的全面 Excel 财务模型。

**前置条件**：⚠️ 开始前请验证
- **必需**：可获取公司财务数据
  - 对上市公司：来自 SEC EDGAR 的最新 10-K 和近期 10-Q
  - 对私营公司：来自可用来源的财务报表或估计
  - 或：用户提供的已预先提取的历史财务数据
- **可选**：用于业务背景的公司研究（任务 1）

**输出**：包含 6 个必要标签页的 Excel 财务模型（.xlsx）：
1. 收入模型
2. 利润表
3. 现金流量表
4. 资产负债表
5. 情景
6. DCF 输入

---

## 输入验证

**开始前 - 检查：**

**选项 A：直接提取财务数据（最常见）**
- [ ] 是否可获取 10-K 文件（上市公司）？
- [ ] 或是否可获取财务报表（私营公司）？
- [ ] 是否准备好创建用于历史数据提取的 Excel 文件？

**选项 B：用户已有预先提取的财务数据**
- [ ] 是否已提供历史财务数据文件？（.xlsx 或其他格式）
- [ ] 是否包含 3-5 年的利润表、现金流量表、资产负债表？
- [ ] 数据是否干净并可直接使用？

**可选背景：**
- [ ] 公司研究（任务 1）是否已完成以理解业务？

**如果验证失败**：停止，并在继续前获取财务报表（10-K 或等同文件）。

---

## 模型结构和格式

### 颜色编码（行业标准）
- **蓝色文本**：硬编码输入（用户可更改）
- **黑色文本**：公式和计算
- **绿色文本**：链接到其他工作表
- **红色文本**：错误或标记（应解决）

### 格式标准
- 专业的边框和底纹
- 清晰的章节标题
- 分组行以便折叠
- 关键输入/输出使用命名区域
- 公式中不包含硬编码数字（除 12 个月等常数外）
- 清晰的单位（$ thousands、$ millions 等）

### 公式最佳实践
- 所有数字都应来自假设
- 更改一个假设 → 整个模型更新
- 无循环引用
- 关键单元格使用命名区域
- 保持公式简单且可审计
- 为复杂计算添加注释

---

## 逐步建模工作流

### 步骤 1：提取历史财务数据

**如果历史财务数据已提取，请跳到步骤 2。**

**对于上市公司：**

1. **下载 10-K 文件**
   - 前往 SEC EDGAR (https://www.sec.gov/edgar/searchedgar/companysearch.html)
   - 搜索公司名称或股票代码
   - 下载最新 10-K（年度报告）
   - 导航至 Item 8：Financial Statements and Supplementary Data

2. **创建历史财务数据 Excel 文件**
   - 文件名：`[Company]_Historical_Financials_[Date].xlsx`
   - 此文件将作为模型的基础

3. **提取利润表（3-5 年）**
   - 创建工作表 1："Historical Income Statement"
   - 提取 3-5 年的所有项目：
     - 收入（总额以及按分部，如已披露）
     - 收入成本 / COGS
     - 毛利润
     - 运营费用（R&D、Sales & Marketing、G&A 分项列示）
     - EBITDA（如未披露则计算：EBIT + D&A）
     - EBIT / 营业利润
     - 利息费用/收入
     - 其他收入/费用
     - 税前利润
     - 所得税和税率
     - 净利润
     - EPS（基本和摊薄）
     - 流通股数（基本和摊薄）

4. **提取现金流量表（3-5 年）**
   - 创建工作表 2："Historical Cash Flow"
   - 提取所有项目：
     - 经营活动（从净利润开始）
     - 折旧与摊销
     - 股权激励费用
     - 营运资本变化（应收账款、存货、应付账款）
     - 经营活动现金流
     - 投资活动（CapEx、收购）
     - 融资活动（债务发行/偿还、股权、股息）
     - 现金净变化
     - 期初和期末现金

5. **提取资产负债表（3-5 年）**
   - 创建工作表 3："Historical Balance Sheet"
   - 提取所有项目：
     - 流动资产（现金、应收账款、存货、其他）
     - 非流动资产（PP&E、无形资产、商誉）
     - 总资产
     - 流动负债（应付账款、应计费用、流动债务）
     - 非流动负债（长期债务、递延税项）
     - 总负债
     - 股东权益（普通股、留存收益）
     - 总负债 + 权益

6. **计算历史指标**
   - 创建工作表 4："Historical Metrics"
   - 根据报表计算：
     - 收入增长 %（YoY）
     - 毛利率 %
     - EBITDA 利润率 %
     - 营业利润率 %
     - 净利率 %
     - 自由现金流（CFO - CapEx）
     - FCF 利润率 %
     - ROIC（近似值：NOPAT / Invested Capital）
     - 债务/权益比率
     - 流动比率（Current Assets / Current Liabilities）

7. **记录来源和备注**
   - 创建工作表 5："Notes"
   - 记录：
     - 10-K 文件日期和财年年末
     - 任何注明的一次性项目或调整
     - 非 GAAP 与 GAAP 差异
     - 分部拆分（如按产品/地域拆分收入）
     - 数据质量备注和限制

**对于私营公司：**

1. **收集可用数据**
   - 财务报表（如可获得）
   - 含收入数字的新闻稿
   - 融资公告
   - 行业估计或可比公司数据

2. **创建简化历史文件**
   - 估计收入（如可获得）
   - 估计利润率（如需要，来自可比公司）
   - 关键比率和指标
   - 记录所有假设和来源

**验证：**
- [ ] 已提取全部 3 张财务报表（3-5 年）
- [ ] 数字在报表之间勾稽一致（净利润衔接）
- [ ] 关键指标计算正确
- [ ] Excel 文件已保存且可打开
- [ ] 数据来源已记录（10-K 日期、页码）

**预测模型的基础现已完成。继续步骤 2。**
   - 资本支出
   - 营运资本项目
   - 债务和利息费用
   - 股数（基本和摊薄）

3. **整理历史数据以便录入**
   - 准备 3-5 年实际数据
   - 将直接录入利润表、现金流量表和资产负债表标签页
   - 历史年份在列中，预测年份随后

4. **计算历史趋势**
   - 收入 CAGR
   - 利润率演进
   - 运营费用杠杆
   - 营运资本模式
   - CapEx 占收入百分比
   - 这些趋势将为预测假设提供依据

**注**：假设将直接以蓝色文本输入记录在各标签页中，而不是记录在单独标签页中。

### 步骤 2：收入建模

**关键：这是模型中最重要且最详细的部分。**

#### A. 按产品/类别划分的收入（20-30 行）

创建详细表格：
```
                        2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
产品类别 A
  子产品 A1            XX      XX      XX      XX      XX      XX      XX      XX      XX
  子产品 A2            XX      XX      XX      XX      XX      XX      XX      XX      XX
  子产品 A3            XX      XX      XX      XX      XX      XX      XX      XX      XX
  类别 A 合计          XX      XX      XX      XX      XX      XX      XX      XX      XX
  占总收入 %           X%      X%      X%      X%      X%      X%      X%      X%      X%
  YoY 增长 %           -       X%      X%      X%      X%      X%      X%      X%      X%

产品类别 B
  [类似结构]

[继续列示所有产品类别]

服务收入                XX      XX      XX      XX      XX      XX      XX      XX      XX
其他收入                XX      XX      XX      XX      XX      XX      XX      XX      XX

总收入                  XX      XX      XX      XX      XX      XX      XX      XX      XX
总收入增长 %            -       X%      X%      X%      X%      X%      X%      X%      X%
```

**关键要求：**
- 显示每个类别的绝对收入（$M）
- 计算每个类别占总收入百分比
- 显示每个类别的 YoY 增长 %
- 必须包含细分子类别（不仅仅是 3-5 个顶层类别）
- 显示随时间变化的结构转移
- 将所有预测链接到假设标签页

#### B. 按地域划分的收入（15-20 行）

创建详细表格：
```
                        2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
北美
  美国                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  加拿大                XX      XX      XX      XX      XX      XX      XX      XX      XX
  墨西哥                XX      XX      XX      XX      XX      XX      XX      XX      XX
  北美合计              XX      XX      XX      XX      XX      XX      XX      XX      XX
  占总额 %              X%      X%      X%      X%      X%      X%      X%      X%      X%
  YoY 增长 %            -       X%      X%      X%      X%      X%      X%      X%      X%

欧洲
  英国                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  德国                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  法国                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他欧洲              XX      XX      XX      XX      XX      XX      XX      XX      XX
  欧洲合计              XX      XX      XX      XX      XX      XX      XX      XX      XX
  占总额 %              X%      X%      X%      X%      X%      X%      X%      X%      X%
  YoY 增长 %            -       X%      X%      X%      X%      X%      X%      X%      X%

亚太
  [类似结构]

世界其他地区
  [类似结构]

总收入                  XX      XX      XX      XX      XX      XX      XX      XX      XX
```

**验证：**
- 按产品收入合计 = 按地域收入合计 = 总收入
- 所有百分比合计为 100%
- 增长率计算正确

#### C. 按渠道划分的收入（如适用）

```
                        2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
直销                    XX      XX      XX      XX      XX      XX      XX      XX      XX
电商/线上               XX      XX      XX      XX      XX      XX      XX      XX      XX
批发/合作伙伴           XX      XX      XX      XX      XX      XX      XX      XX      XX
零售门店
  公司自营门店          XX      XX      XX      XX      XX      XX      XX      XX      XX
  门店数量              XX      XX      XX      XX      XX      XX      XX      XX      XX
  单店销售额            XX      XX      XX      XX      XX      XX      XX      XX      XX
其他渠道                XX      XX      XX      XX      XX      XX      XX      XX      XX

总收入                  XX      XX      XX      XX      XX      XX      XX      XX      XX
```

### 步骤 3：运营费用建模

#### A. 收入成本
1. **拆分 COGS 组成**
   - 产品成本（材料、制造）
   - 运输和物流
   - 服务交付成本
   - 其他直接成本

2. **链接到收入**
   - 将 COGS 计算为收入百分比
   - 按年份建模毛利率
   - 链接到假设标签页

#### B. R&D 费用
```
研发                    2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
R&D 人数                XX      XX      XX      XX      XX      XX      XX      XX      XX
R&D 人均薪酬            XX      XX      XX      XX      XX      XX      XX      XX      XX
R&D 人员成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
R&D 其他成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
R&D 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
占收入 %                X%      X%      X%      X%      X%      X%      X%      X%      X%
```

#### C. 销售与营销费用
```
销售与营销              2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
S&M 人数                XX      XX      XX      XX      XX      XX      XX      XX      XX
S&M 人均薪酬            XX      XX      XX      XX      XX      XX      XX      XX      XX
S&M 人员成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
营销支出                XX      XX      XX      XX      XX      XX      XX      XX      XX
S&M 其他成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
S&M 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
占收入 %                X%      X%      X%      X%      X%      X%      X%      X%      X%
```

#### D. 一般与行政
```
G&A                     2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E
G&A 人数                XX      XX      XX      XX      XX      XX      XX      XX      XX
G&A 人均薪酬            XX      XX      XX      XX      XX      XX      XX      XX      XX
G&A 人员成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
G&A 其他成本            XX      XX      XX      XX      XX      XX      XX      XX      XX
G&A 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
占收入 %                X%      X%      X%      X%      X%      X%      X%      X%      X%
```

#### E. 折旧与摊销
- 链接到 CapEx 明细表
- 应用假设中的折旧率
- 计算年度 D&A

### 步骤 4：构建利润表

**创建包含 40-50 个项目的完整 P&L：**

```
利润表                  2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E

收入
[链接到收入模型标签页]
总收入                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  YoY 增长 %            -       X%      X%      X%      X%      X%      X%      X%      X%

收入成本
[链接到 COGS 拆分]
COGS 合计               XX      XX      XX      XX      XX      XX      XX      XX      XX

毛利润                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  毛利率 %              X%      X%      X%      X%      X%      X%      X%      X%      X%

运营费用
R&D 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
  占收入 %              X%      X%      X%      X%      X%      X%      X%      X%      X%
S&M 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
  占收入 %              X%      X%      X%      X%      X%      X%      X%      X%      X%
G&A 合计                XX      XX      XX      XX      XX      XX      XX      XX      XX
  占收入 %              X%      X%      X%      X%      X%      X%      X%      X%      X%
折旧与摊销              XX      XX      XX      XX      XX      XX      XX      XX      XX

运营费用合计            XX      XX      XX      XX      XX      XX      XX      XX      XX
  占收入 %              X%      X%      X%      X%      X%      X%      X%      X%      X%

EBITDA                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  EBITDA 利润率 %       X%      X%      X%      X%      X%      X%      X%      X%      X%

EBIT                    XX      XX      XX      XX      XX      XX      XX      XX      XX
  EBIT 利润率 %         X%      X%      X%      X%      X%      X%      X%      X%      X%

利息费用                (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
利息收入                XX      XX      XX      XX      XX      XX      XX      XX      XX
其他收入/（费用）       XX      XX      XX      XX      XX      XX      XX      XX      XX

税前利润                XX      XX      XX      XX      XX      XX      XX      XX      XX

所得税                  (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
  税率 %                X%      X%      X%      X%      X%      X%      X%      X%      X%

净利润                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  净利率 %              X%      X%      X%      X%      X%      X%      X%      X%      X%

流通股数
基本股数 (M)            XX      XX      XX      XX      XX      XX      XX      XX      XX
摊薄股数 (M)            XX      XX      XX      XX      XX      XX      XX      XX      XX

每股收益
基本 EPS                $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX
摊薄 EPS                $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX   $X.XX
```

### 步骤 5：构建现金流量表

```
现金流量表              2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E

经营活动
净利润                  XX      XX      XX      XX      XX      XX      XX      XX      XX
调整：
  折旧与摊销            XX      XX      XX      XX      XX      XX      XX      XX      XX
  股权激励费用          XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他非现金项目        XX      XX      XX      XX      XX      XX      XX      XX      XX

营运资本变化：
  应收账款              (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
  存货                  (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
  应付账款              XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他营运资本          (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)

经营活动现金流          XX      XX      XX      XX      XX      XX      XX      XX      XX

投资活动
资本支出                (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
收购                    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
其他投资                XX      XX      XX      XX      XX      XX      XX      XX      XX

投资活动现金流          (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)

自由现金流              XX      XX      XX      XX      XX      XX      XX      XX      XX
  FCF 利润率 %          X%      X%      X%      X%      X%      X%      X%      X%      X%

融资活动
债务发行                XX      XX      XX      XX      XX      XX      XX      XX      XX
债务偿还                (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
股权发行                XX      XX      XX      XX      XX      XX      XX      XX      XX
支付股息                (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
其他融资                XX      XX      XX      XX      XX      XX      XX      XX      XX

融资活动现金流          XX      XX      XX      XX      XX      XX      XX      XX      XX

现金净变化              XX      XX      XX      XX      XX      XX      XX      XX      XX

期初现金                XX      XX      XX      XX      XX      XX      XX      XX      XX
期末现金                XX      XX      XX      XX      XX      XX      XX      XX      XX
```

### 步骤 6：构建资产负债表

创建包含 35-45 个项目的完整资产负债表：

```
资产负债表              2021A   2022A   2023A   2024A   2025E   2026E   2027E   2028E   2029E

资产
流动资产：
  现金及等价物          XX      XX      XX      XX      XX      XX      XX      XX      XX
  应收账款              XX      XX      XX      XX      XX      XX      XX      XX      XX
  存货                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  预付费用              XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他流动资产          XX      XX      XX      XX      XX      XX      XX      XX      XX
流动资产合计            XX      XX      XX      XX      XX      XX      XX      XX      XX

非流动资产：
  PP&E, gross           XX      XX      XX      XX      XX      XX      XX      XX      XX
  累计折旧              (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
  PP&E, net             XX      XX      XX      XX      XX      XX      XX      XX      XX
  无形资产              XX      XX      XX      XX      XX      XX      XX      XX      XX
  商誉                  XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他非流动资产        XX      XX      XX      XX      XX      XX      XX      XX      XX
非流动资产合计          XX      XX      XX      XX      XX      XX      XX      XX      XX

总资产                  XX      XX      XX      XX      XX      XX      XX      XX      XX

负债
流动负债：
  应付账款              XX      XX      XX      XX      XX      XX      XX      XX      XX
  应计费用              XX      XX      XX      XX      XX      XX      XX      XX      XX
  递延收入              XX      XX      XX      XX      XX      XX      XX      XX      XX
  流动债务              XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他流动负债          XX      XX      XX      XX      XX      XX      XX      XX      XX
流动负债合计            XX      XX      XX      XX      XX      XX      XX      XX      XX

非流动负债：
  长期债务              XX      XX      XX      XX      XX      XX      XX      XX      XX
  递延税项              XX      XX      XX      XX      XX      XX      XX      XX      XX
  其他非流动负债        XX      XX      XX      XX      XX      XX      XX      XX      XX
非流动负债合计          XX      XX      XX      XX      XX      XX      XX      XX      XX

总负债                  XX      XX      XX      XX      XX      XX      XX      XX      XX

权益
  普通股                XX      XX      XX      XX      XX      XX      XX      XX      XX
  资本公积              XX      XX      XX      XX      XX      XX      XX      XX      XX
  留存收益              XX      XX      XX      XX      XX      XX      XX      XX      XX
  库藏股                (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)    (XX)
  其他权益              XX      XX      XX      XX      XX      XX      XX      XX      XX
权益合计                XX      XX      XX      XX      XX      XX      XX      XX      XX

总负债 + 权益           XX      XX      XX      XX      XX      XX      XX      XX      XX

平衡检查                OK      OK      OK      OK      OK      OK      OK      OK      OK
```

**平衡检查公式：**
- 每年总资产必须等于总负债 + 权益
- 将任何不平衡以红色标记

### 步骤 7：构建 DCF 输入标签页

为估值（任务 3）准备输入：

```
DCF 输入                2025E   2026E   2027E   2028E   2029E

EBIT                    XX      XX      XX      XX      XX
税率                    X%      X%      X%      X%      X%
NOPAT                   XX      XX      XX      XX      XX

加：D&A                 XX      XX      XX      XX      XX
减：CapEx               (XX)    (XX)    (XX)    (XX)    (XX)
减：NWC 变化            (XX)    (XX)    (XX)    (XX)    (XX)

无杠杆 FCF              XX      XX      XX      XX      XX

终端年份指标：
  2029E 收入            $X,XXX
  2029E EBITDA          $XXX
  2029E EBIT            $XXX
  2029E 无杠杆 FCF      $XXX
```

### 步骤 8：构建情景标签页

用不同假设创建三种情景：

#### 情景假设表
```
假设                            牛市        基准        熊市
收入 CAGR (2025-2029)           XX%         XX%         XX%
2029E 毛利率                    XX%         XX%         XX%
2029E EBITDA 利润率             XX%         XX%         XX%
CapEx 占收入百分比              X%          X%          X%
[添加其他关键假设]
```

#### 情景输出表
```
指标                            牛市        基准        熊市
2029E 收入 ($M)                 $X,XXX      $X,XXX      $X,XXX
2029E EBITDA ($M)               $XXX        $XXX        $XXX
2029E EBITDA 利润率             XX%         XX%         XX%
2029E 净利润 ($M)               $XXX        $XXX        $XXX
2029E EPS                       $X.XX       $X.XX       $X.XX
2029E FCF ($M)                  $XXX        $XXX        $XXX
2029E FCF 利润率                XX%         XX%         XX%

2025-2029 累计 FCF ($M)         $XXX        $XXX        $XXX
```

**记录情景依据：**
- 牛市情景：[描述乐观但可实现的假设]
- 基准情景：[描述最可能的情景]
- 熊市情景：[描述下行风险和触发因素]

### 步骤 9：质量检查

**验证模型完整性：**
1. [ ] 测试所有公式（抽查计算）
2. [ ] 更改假设 → 验证模型正确更新
3. [ ] 测试情景切换
4. [ ] 验证颜色编码（蓝/黑/绿）
5. [ ] 检查所有年份资产负债表平衡
6. [ ] 验证无循环引用（Excel 会标记）
7. [ ] 检查预测中是否存在硬编码数字
8. [ ] 验证所有跨表链接正常工作
9. [ ] 测试收入合计在所有标签页之间勾稽一致
10. [ ] 审阅格式和展示

---

## 质量标准

### 模型完整性
- 所有公式在工作表之间正确链接
- 预测中没有硬编码数字（假设标签页除外）
- 无循环引用
- 所有年份资产负债表平衡
- 情景切换正常工作

### 完整性
- 全部 6 个必要标签页：收入模型、利润表、现金流量表、资产负债表、情景、DCF 输入
- 利润表中有 40-50 个项目
- 收入模型中有 20-30 行（产品拆分）
- 收入模型中有 15-20 行（地域拆分）
- 包含所有项目的完整现金流量表和资产负债表
- 牛市/基准/熊市情景完整

### 专业格式
- 一致的颜色编码（蓝/黑/绿）
- 清晰的标题和标签
- 适当的边框和底纹
- 关键单元格使用命名区域
- 分组行以便折叠
- 单位清晰标注（$ thousands vs. $ millions）

### 文档记录
- 假设附带依据记录（带注释的蓝色文本单元格）
- 数据来源记录在单元格注释或标签页内备注部分
- 复杂计算用注释解释
- 描述方法论

---

## 文件命名约定

将财务模型保存为：
`[Company]_Financial_Model_[Date].xlsx`

示例：`Tesla_Financial_Model_2024-10-27.xlsx`

---

## 成功标准

成功的财务模型应：
1. 包含全部 6 个必要标签页（收入模型、利润表、现金流量表、资产负债表、情景、DCF 输入）
2. 完全动态（更改假设 → 模型更新）
3. 预测中没有硬编码数字
4. 包含详细收入拆分（按产品 20-30 行，按地域 15-20 行）
5. 利润表包含 40-50 个项目
6. 包含牛市/基准/熊市情景
7. 采用颜色编码进行专业格式化
8. 正确平衡（资产负债表、现金流）
9. 可审计且易于跟踪
10. 通过适当的 FCF 计算支持估值分析

---

## 常见模型类型 - 特殊考虑

### 高增长科技/SaaS
- 重点关注 ARR 增长和净留存
- 按产品线和地域建模
- 大量 R&D 和 S&M 支出
- 盈利路径时间线
- 单位经济性（LTV/CAC）

### 电商/零售
- 按产品类别和渠道划分收入
- 门店数量和可比门店增长（如适用）
- 存货周转和营运资本
- 履约成本
- 客户获取

### 制造/工业
- 产能利用率
- 原材料成本和定价
- 毛利率桥（销量/价格/结构/成本）
- CapEx 密集型模型
- 营运资本周期

---

## 后续步骤

完成任务 2 后，财务模型将用于：
- **任务 3（估值）**：DCF 输入、预测财务数据
- **任务 4（图表）**：用于收入趋势、利润率图表、情景比较的数据
- **任务 5（报告组装）**：用于报告表格和分析的财务数据
