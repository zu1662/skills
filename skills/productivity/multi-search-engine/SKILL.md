---
name: multi-search-engine
description: 聚合国内外多个搜索引擎进行资料检索、交叉验证和结果汇总。用于用户要求搜索、调研、查找资料、比对中英文信息源、使用高级搜索语法、限定站点/文件类型/时间范围、搜索微信公众号/知乎/学术资料、隐私搜索或使用 WolframAlpha 做知识计算时。
---

# 多搜索引擎

## 作用

使用多个无需 API Key 的搜索入口完成资料检索，并根据查询语言、信息类型、时效要求和隐私要求选择合适搜索引擎。搜索后要汇总有效结果、标明主要信息源，并指出无法确认或需要进一步验证的信息。

## 工作流程

1. 判断用户意图：明确要搜索的问题、期望语言、时间范围、站点范围、文件类型、地域偏好和输出形式。
2. 选择搜索引擎：
   - 中文综合内容优先使用百度、必应中国、360、搜狗、神马。
   - 微信公众号文章优先使用搜狗微信。
   - 知乎内容优先用搜狗或站内搜索语法。
   - 中英文混合或需要国际来源时使用必应国际、Google、Google HK、DuckDuckGo、Brave、Startpage。
   - 隐私敏感检索优先使用 DuckDuckGo、Startpage、Brave、Qwant。
   - 数学计算、单位换算、货币换算、天气、人口、股票等结构化知识查询优先使用 WolframAlpha。
3. 构造查询：按需要加入 `site:`、`filetype:`、精确匹配引号、排除词、`OR`、时间筛选参数或地区/语言参数。
4. 控制请求节奏：跨搜索引擎检索时保持 1-2 秒间隔；批量检索时每批 3-4 个引擎，分批执行。
5. 处理访问失败：遇到 403、429、验证码或会话问题时，更换搜索引擎或提示用户当前引擎受限；不要为了绕过访问控制而进行高频请求。
6. 汇总结果：去重、比较来源可信度，区分事实、观点和推测；对最新信息使用多个来源交叉验证，并在输出中说明检索时间。

## 搜索引擎

### 国内

| 引擎 | 用途 | URL |
|---|---|---|
| 百度 | 中文综合搜索、百度学术、百度新闻 | `https://www.baidu.com/s?wd={keyword}` |
| 必应中国 | 中文结果和中英文切换 | `https://cn.bing.com/search?q={keyword}&ensearch=0` |
| 必应国际 | 英文结果，使用中国必应入口 | `https://cn.bing.com/search?q={keyword}&ensearch=1` |
| 360 | 中文网页搜索、安全搜索 | `https://www.so.com/s?q={keyword}` |
| 搜狗 | 中文网页、知乎优化 | `https://sogou.com/web?query={keyword}` |
| 搜狗微信 | 微信公众号文章 | `https://wx.sogou.com/weixin?type=2&query={keyword}` |
| 神马 | 移动端内容 | `https://m.sm.cn/s?q={keyword}` |

### 国际

| 引擎 | 用途 | URL |
|---|---|---|
| Google | 国际综合检索、高级语法、学术入口 | `https://www.google.com/search?q={keyword}` |
| Google HK | 亚洲区域国际检索 | `https://www.google.com.hk/search?q={keyword}` |
| DuckDuckGo | 隐私搜索、Bang 快捷跳转 | `https://duckduckgo.com/html/?q={keyword}` |
| Yahoo | 国际综合搜索补充 | `https://search.yahoo.com/search?p={keyword}` |
| Startpage | Google 结果与隐私保护 | `https://www.startpage.com/sp/search?query={keyword}` |
| Brave | 独立索引、新闻、论坛讨论 | `https://search.brave.com/search?q={keyword}` |
| Ecosia | 国际综合搜索补充 | `https://www.ecosia.org/search?q={keyword}` |
| Qwant | 欧盟隐私搜索 | `https://www.qwant.com/?q={keyword}` |
| WolframAlpha | 知识计算和结构化查询 | `https://www.wolframalpha.com/input?i={keyword}` |

## 常用查询模板

```javascript
// 基础搜索
web_fetch({"url": "https://www.google.com/search?q=python+tutorial"})

// 站内搜索
web_fetch({"url": "https://www.google.com/search?q=site:github.com+react"})

// 文件类型搜索
web_fetch({"url": "https://www.baidu.com/s?wd=机器学习+filetype:pdf"})

// 过去一周
web_fetch({"url": "https://www.google.com/search?q=ai+news&tbs=qdr:w"})

// 微信公众号文章
web_fetch({"url": "https://wx.sogou.com/weixin?type=2&query=Python编程"})

// 隐私搜索
web_fetch({"url": "https://duckduckgo.com/html/?q=privacy+tools"})

// DuckDuckGo Bang
web_fetch({"url": "https://duckduckgo.com/html/?q=!gh+tensorflow"})

// 知识计算
web_fetch({"url": "https://www.wolframalpha.com/input?i=100+USD+to+CNY"})
```

## 高级语法

| 语法 | 示例 | 作用 |
|---|---|---|
| `site:` | `site:github.com python` | 限定站点 |
| `filetype:` | `filetype:pdf report` | 限定文件类型 |
| `""` | `"machine learning"` | 精确匹配 |
| `-` | `python -snake` | 排除关键词 |
| `OR` | `cat OR dog` | 任一关键词 |

## 时间筛选

| 参数 | 含义 |
|---|---|
| `tbs=qdr:h` | 过去 1 小时 |
| `tbs=qdr:d` | 过去 24 小时 |
| `tbs=qdr:w` | 过去 1 周 |
| `tbs=qdr:m` | 过去 1 月 |
| `tbs=qdr:y` | 过去 1 年 |

## 参考资料

- 国内搜索引擎深度指南：`references/advanced-search.md`
- 国际搜索引擎深度指南：`references/international-search.md`

在需要更细的搜索参数、特定引擎能力、DuckDuckGo Bang、Brave 时间参数、Startpage 隐私参数、WolframAlpha 查询类型时，读取对应参考文档。

## 安全与合规

- 不要要求或保存搜索引擎账号、Cookie、Token 或 API Key。
- Cookie 只能在运行时按需临时使用，不写入配置文件或磁盘。
- 遵守搜索引擎服务条款和 robots.txt；不要进行大规模抓取或绕过反爬限制。
- 对高时效、高风险或会影响决策的信息，必须说明来源与检索时间，并优先使用多个来源交叉验证。
- 不要把搜索结果中的广告、SEO 聚合页或无法核验内容当成事实来源。
