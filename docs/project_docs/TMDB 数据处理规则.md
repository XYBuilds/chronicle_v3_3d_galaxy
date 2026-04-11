# **TMDB 电影宇宙 \- 数据处理规则 (Data Processing Rules)**

本规则文档定义了 TMDB 原始数据在进入 UMAP 算法和前端数据库之前的清洗与过滤标准。严格的数据裁剪（Pruning）是保证三维宇宙拓扑结构健康、防止“数据黑洞”产生的核心前提。

## **1\. 预处理逻辑 (Preprocess)**

在进行任何特征提取和过滤之前，必须先对原始数据集进行去重与合并操作，以保证天体节点的唯一性：

* **主键去重**：合并具有相同 id (TMDB ID) 的电影条目。  
* **外部主键去重**：合并具有相同 imdb\_id (IMDb ID) 的电影条目，防止同一部电影因 TMDB 库中的重复收录而产生数据幽灵。

## **2\. 强制剔除规则 (Must Drop-outs)**

以下条件代表了数据的“硬伤”。命中以下任意一条规则的电影，**必须被无条件剔除**，绝不能进入 UMAP 降维计算或前端渲染引擎：

* **无流派归属**：genres \== null（缺少 UMAP 聚类的核心锚点）。  
* **零评价人数**：vote\_count \== 0 || vote\_count \== null（无法映射天体体积，缺乏大众共识）。  
* **零评分**：vote\_average \== 0 || vote\_average \== null（无法映射天体亮度发光度）。  
* **无时间锚点**：release\_date \== null（无法映射 Z 轴时空深度）。  
* **无剧情简介**：overview \== null 或仅空白（无法生成文本 Embedding，缺少 UMAP 语义锚点）。  
  * **优先回退**：将 `title`（若 `original_title` 与 `title` 不同，则拼接两者）作为替代文本输入句向量模型，保留该影片在宇宙中的存在（约 163 条，占 0.28%）。  
  * **最终兜底**：若 `title` 也为 null（数据报告显示仅 1 条），则剔除该行。  
* **动态阈值过滤 (Dynamic Threshold)**：  
  * **逻辑**：采用基于年度 95 分位数的分数级、平滑移动平均（Fractional, Smoothed Moving Average of the Annual 95th Percentile）来计算动态底线。  
  * **参数（以仓库脚本为准）**：实现与默认数值见 `scripts/dataset_processing/filter_dynamic_baseline_vote_count.py` —— **年度分位数 `quantile=0.95`**、**折算系数 `alpha=0.15`**、**滑动平均窗口年数 `rolling_window=6`**、**全年代绝对底线 `abs_min=1`**（均可通过 CLI 覆盖）。文档中的公式截图仅作示意，**可执行参数以脚本默认值与命令行为准**。  
  * **目的**：随着时代发展，电影的平均热度/评价人数标准在不断膨胀。使用该动态阈值能自适应地剔除每个时代“绝对意义上的长尾垃圾数据”，保证留下的都是相对该时代有足够代表性的作品。

## **3\. 潜在剔除规则 / 备选方案 (Potential Drop-outs / Alternative)**

以下条件通常代表数据质量不佳、受众极小或信息维度单一。可根据最终宇宙的渲染性能上限和节点数量目标，**灵活配置开关**来决定是否剔除。

> **当前阶段状态**：以下规则**均未启用**。首先以强制剔除规则（§2）通过的数据跑通全链路、验证产品交互后，再视实际效果逐条决定是否开启。

* **成人内容过滤**：adult \== True（剔除色情/成人限制级电影，保证宇宙内容的合规性与全年龄受众的安全浏览）。  
* **模糊日期占位符**：release\_date \== \*\*\*\*-01-01。**注意：当前策略为对占位符做 Temporal Jitter（见 Tech Spec §2.2），而非在此处剔除。** 仅当未来决定不做 Jitter 时才启用此规则。  
* **短片过滤**：runtime \<= 40（剔除大量学生作业、实验短片和先锋短片，保证“院线长片”的纯粹性）。  
* **双零财务黑洞**：budget \== 0.0 && revenue \== 0.0（剔除完全缺乏工业财务记录的极度边缘影片）。  
* **极低热度底线**：popularity \<= 0.01（剔除在 TMDB 算法中几乎无人问津的数据尘埃）。  
* **视觉残缺**：poster\_path \== null（剔除没有海报的电影。因为前端 HUD 需要展示海报，缺乏海报会严重影响“文物检视”的视觉一致性和高级感）。

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEQAAAAaCAYAAAAOl/o1AAACZ0lEQVR4Xu2XPYtTQRSGE1xB8BtcgzHJ5AsD4keRwsZSwUYL0UqtLLQQf4GNiKWdKIgiVoq1FjaysM3K2so2brGiWIiKohYurj5v7sw6HoIu5iYRmQcOd845M/fMfSd35qZQSCQSicTocM5dxr7/xi7YMUOmWK/XL1L3Rq1W2xkniK+pVCq7aa7yIfUVm6JugzE5ObmO4tuwV9h0tVptyW80Go5CZySK2nbcsKDmfWo+kCDYUrfbXR1y5XJ5i1+kb4j1gutX+XqG+B65oBtT5ECf+AI2b+NDoEidS9hsCLAQJfz3LNIu+X7x3mGfNC/ynZ/DcwQhNksQ/SRtTquEzdh43jCH/dRZZA534rjmhU2pLUHodzjODwWU3qvCNl7IVk1CnbWJvNGD+lr9BHmp9sgEoeDNUDSASHuIzTGBe3Hc0mq1trpsD/qj9fsFBvyifIwFKZVKa10myBf5XpAn+PNcj7lsD1l+xXIhTAR76rKNrGfaukkXbf9hwl5xhNpzweehT3pBFn1oglNme5RvknuNnQuxgeFmJ3zRozY3BnqvaLvd3qA2D/zIz+2z7Sj8qfPM+T0mF7jZrIp2Op31Njdu9Ip5QR7KR6DrtK+Go9ifOlPYwq8jB0Dqq6iNrxTGzuibYIV2yo63xPtM9N3ReyW4vsXeNJvNHfK1iPjTLsfPgt5PVIVsYhwwjyvx4iDg7fiEI3eXy0TwyR0itkS/gyH2V7hs19cHl8RYNttv1LDyG112ctzCnrs+fxuIfXDZV/Vj9UWM87bPfwWrvs9lJ91pmxM6ihHhOPlratt8IpFIJBKJxL/KD85ku6RdmKdKAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEcAAAAaCAYAAADloEE2AAAB8UlEQVR4Xu2Xu0sDQRDGDUZQfIBoPPK6y0uCWF5hoa1oZWUhRCsLS8FG8M+wiCCCWAliZ6FlOsVCECy1iNhZiIWlj2+SWTMuR1TMxnDsD4bcfbOP2W8vm0tXl8VisVgsv6FQKAx5nreLKDuO06/nm4E+JV0LFVjgC2KV41nPB+H7fo/rutNo/67nQkEqlerDAs8ymcy80ugaCz6hnGwrQZsp9JvM5XJuaM3BAjdpcdls1lEa7uOkwYA12TYI1VbXWwY/nosoplfPmQZzHtDiYrHYgNJQyzBpiD3ZNghj5mDQCcQTCpyjexS1zxNF+NE+/dqjQT6fH+PCvo1mpiNfoTmlOXRNGuVE00B4jtaaowrAZVRpPFEVUUKcwyxfdDFCR5qD3VzCoG9S46IqdA4gf0RfN5k3QceZQ4cfBrxDHEtdmcOmRWTOFOrMKRaLg0pLJBKjbE77zxwesEpPiNSFOTdSDwJtLtD//oexovdXYJwNNiIutNqC/+vXKooBD3VzcL8O/ZV2U+omCXrPSafTC554z0F+lurC506jZx0T5tTAoLeIBwoUdwmpm84Z3slrfP08vY8pvPob8hbHo8xRHeAK5iwrjTaW69Tj8wn8KxFMMoMdGpdiMpkcacdhLKH/U1hYGbHd7rktFovFYrFYwsYHyXmgdyV6ByUAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAG4AAAAbCAYAAACdtLqJAAAEc0lEQVR4Xu1YS0iVQRS+Fw2K3g8xX3fuvUgXKaiwB0UFQUFBtsigwFZtkpYFBdEiijYFbRICCaSVtKlFWFBBYgsjFxEUSg96IAqKhYGChff2ff9/znXuZGg+bijzweGfc+bMmZkzZ85//j8S8fDw8PDw8PDw+GdEjTEliURiWzwe3+52eswcCuHoDGjA7ZgiCmKxWA3s/cJzl9s5F4G9nAT9BN0AXQM9dXXyjuLi4sU8ONyOx27fVAF7B2mzvLy8zO2ba6iurl6AvaThn0vkk8nkcu7NUZsfYETOl81hH9125gC/GTRq60wLpaWlFYx0V25jvNQF2SFXVlZWthq2qtAsIA+d9aCjjD5HNQu804orKiq2SIRmuGFXB1G7kO8+1bP7IN9DuS2zAXsloL2ufDZRVFS0hHvhupV3daYFcVY/6A3oLERRytkGpVWPi4CDUtaYi+4YOg/8J+qCGnmw1MHi2/D8gOcmtadA+liHvhH2iz2ObbF1EAzlkKVBXaA+0GBkbJ1VMm4Q6zM6Bnwn6LW0P9Ou9uUD2HuSc3LPshbuqy8iAT1twFi7POtAb3H71gg/RFI9LOQdaJ+OwSHtBh12xrTz9lDGhTqO5MJblRfZd1C/8rQPPq3zELxl1FOekLW2win1oLvQXwm+A+1TosLqNAN5Exk8z5HX6HdRWVm5DP33ofd1MgTdy64NF7GwyOKej6hMfDMzqVIKC1aHzaCGyFgkc9IO1RNnMQUGYyQV5IwRR9FpPPScBYq9VuUlpVLG8QF4YOC7ecNEhzetU1/ulh6dMgB6IMGzAzSC9gbp50HSdp3FZ/eSD+jBaVALgiochdciSzZ1cIM0yA2SdzcuOmfGRmRlGVZKjjiIdtBtFUikMeKPk2fkg28x1m21ZBd0HNodMi7npkB2FdTr6lk899Oh++H8sPFS+/MBzF1tr0lBmZmgnpg0YOjjOBvPOlVkL7QtPKM8SGFwygqVy4KH+BQRD7IB1Ix2odw0FgtfjBUMctvSeCY5Rt6jvLk5m+et4ryYs15l1DFym/V2xcfSZnDQ7q21MRupUosTV06Z5ZvpAcZ+0EnKw/B5OsKuhIyV0oRn1LfIAp9Z8pxoRzsB6objDpBn5Bs5OOjUOPaC28XDI8m6hlVH9K5QjwFgyTjujrT/sI2+Nk2jf0HUCqgJabIVItfFb11LFGQjJ31OHSZ8VzE6gorHhO+PfqSYjczHJkx7wXuMSKVSSyF7zsjB8xGolnIelgnTVjbFxuQmyQHXasEC+QlQE28WnLrVhDcwQ724fNDL+2sUa1gFNgr9/Yz4uFOdmrAq7ZH2E9A30E2wBXjuxPhKWz9fiIVFUaN8vvDQTpuZ/HMCR6yFwXuy4R5x5CCdZsLK77o7BrJa0c9+DsBOnOMT8tlAyIE9BPWCurIGQqfyVxBtvOeBmrCs53yNosPD4ieF6g0zrVk2AmDaYyZcLz94b+G9GzNh+uQYe868wvou5afOK1B6nJrAw8PDw8PDw8PDw8PDw8Pjf+M3m9KK6RxxNEwAAAAASUVORK5CYII=>