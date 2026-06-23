# 可视化伴随指南

这是一个基于浏览器的脑暴辅助工具,用于在讨论过程中展示 mockup、图表和可选方案。

## 何时使用

按“每个问题”判断,不要按整场会话判断。判断标准是: **用户看到它是否会比读文字更容易理解?**

当内容本身是视觉内容时,使用浏览器:

- **UI mockup**:线框图、布局、导航结构、组件设计
- **架构图**:系统组件、数据流、关系图
- **并排视觉比较**:比较两个布局、两个配色、两个设计方向
- **视觉打磨**:问题涉及观感、间距、视觉层级
- **空间关系**:状态机、流程图、实体关系图

当内容是文字或表格时,使用终端:

- **需求和范围问题**:“X 是什么意思?”、“哪些功能在范围内?”
- **概念性 A/B/C 选择**:用文字描述的方案选择
- **权衡列表**:优缺点、对比表
- **技术决策**:API 设计、数据建模、架构方案选择
- **澄清问题**:任何答案主要是文字、不是视觉偏好的问题

一个关于 UI 的问题不一定是视觉问题。“你想要什么类型的向导?”是概念问题,在终端里问。“这几个向导布局哪个更合适?”是视觉问题,适合用浏览器展示。

## 工作方式

服务会监听一个目录里的 HTML 文件,并把最新的 HTML 页面展示到浏览器。你把 HTML 内容写入 `screen_dir`,用户在浏览器中查看并点击选择。选择记录会写入 `state_dir/events`,下一轮对话时读取。

**内容片段 vs 完整文档:** 如果 HTML 文件以 `<!DOCTYPE` 或 `<html` 开头,服务会原样提供,只注入 helper 脚本。否则,服务会自动用 frame template 包裹内容,添加页头、CSS 主题、选择状态提示和交互基础设施。**默认写内容片段。** 只有需要完全控制页面时才写完整 HTML 文档。

## 启动会话

```bash
# 启动服务并持久化内容(mockup 保存到项目内)
scripts/start-server.sh --project-dir /path/to/project

# 返回: {"type":"server-started","port":52341,"url":"http://localhost:52341",
#        "screen_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/content",
#        "state_dir":"/path/to/project/.superpowers/brainstorm/12345-1706000000/state"}
```

保存返回结果中的 `screen_dir` 和 `state_dir`。告诉用户打开返回的 URL。

**查找连接信息:** 服务会把启动 JSON 写入 `$STATE_DIR/server-info`。如果你在后台启动服务但没有捕获 stdout,读取这个文件获取 URL 和端口。使用 `--project-dir` 时,可以在 `<project>/.superpowers/brainstorm/` 下查找会话目录。

**注意:** 把项目根目录作为 `--project-dir` 传入,这样 mockup 会保存在 `.superpowers/brainstorm/` 下,服务重启后仍可查看。不传时文件会进入 `/tmp`,停止后会清理。提醒用户如果还没有忽略 `.superpowers/`,应把它加入 `.gitignore`。

## 各平台启动方式

**Claude Code(macOS / Linux):**

```bash
# 默认模式可用,脚本会自行后台运行服务
scripts/start-server.sh --project-dir /path/to/project
```

**Claude Code(Windows):**

```bash
# Windows 会自动使用前台模式,这会阻塞工具调用。
# 调用 Bash 工具时设置 run_in_background: true,让服务跨对话轮次存活。
scripts/start-server.sh --project-dir /path/to/project
```

通过 Bash 工具调用时,设置 `run_in_background: true`。下一轮读取 `$STATE_DIR/server-info` 获取 URL 和端口。

**Codex:**

```bash
# Codex 会清理后台进程。脚本会自动检测 CODEX_CI 并切换到前台模式。
# 正常运行即可,不需要额外参数。
scripts/start-server.sh --project-dir /path/to/project
```

**Gemini CLI:**

```bash
# 使用 --foreground,并在 shell 工具调用上设置 is_background: true,
# 让进程跨对话轮次存活。
scripts/start-server.sh --project-dir /path/to/project --foreground
```

**其他环境:** 服务必须能在后台跨对话轮次保持运行。如果环境会清理 detached/background 进程,使用 `--foreground`,并用对应平台的后台执行机制启动命令。

如果浏览器无法访问 URL,这在远程或容器环境中很常见,可以绑定非 loopback host:

```bash
scripts/start-server.sh \
  --project-dir /path/to/project \
  --host 0.0.0.0 \
  --url-host localhost
```

用 `--url-host` 控制返回 URL JSON 里显示的 hostname。

## 使用循环

1. **检查服务仍在运行**,然后把 HTML 写入 `screen_dir` 中的新文件:
   - 每次写入前检查 `$STATE_DIR/server-info` 是否存在。如果不存在,或 `$STATE_DIR/server-stopped` 存在,说明服务已停止,继续前先用 `start-server.sh` 重启。服务会在 30 分钟无活动后自动退出。
   - 使用语义化文件名,例如 `platform.html`、`visual-style.html`、`layout.html`。
   - **不要复用文件名**。每个屏幕都要新建文件。
   - 使用文件写入工具。**不要用 cat/heredoc**,避免终端输出噪声。
   - 服务会自动展示最新文件。

2. **告诉用户会看到什么,然后结束本轮回复:**
   - 每一步都提醒 URL,不要只在第一次提醒。
   - 简短说明屏幕内容,例如“现在展示首页的 3 个布局选项”。
   - 请用户回到终端反馈:“请看一下页面,告诉我你的想法。需要的话可以点击选项。”

3. **下一轮对话中**,用户在终端回复后:
   - 如果 `$STATE_DIR/events` 存在,读取它。这里包含用户在浏览器中的交互,每行一个 JSON 对象。
   - 把浏览器交互与用户终端文字合并理解。
   - 终端消息是主要反馈;`state_dir/events` 只是结构化交互数据。

4. **迭代或前进:**
   - 如果反馈改变当前屏幕,写一个新文件,例如 `layout-v2.html`。
   - 只有当前步骤已经验证后,才进入下一个问题。

5. **回到终端时清空旧画面:**
   - 当下一步不需要浏览器时,例如澄清问题或权衡讨论,推送一个等待页,避免用户继续盯着已经过期的选择。

   ```html
   <!-- filename: waiting.html (或 waiting-2.html 等) -->
   <div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
     <p class="subtitle">接下来回到终端继续...</p>
   </div>
   ```

   下一次出现视觉问题时,再照常推送新的内容文件。

6. 重复直到完成。

## 编写内容片段

只写页面主体内容。服务会自动用 frame template 包裹它,添加页头、主题 CSS、选择提示和所有交互基础设施。

**最小示例:**

```html
<h2>哪个布局更合适?</h2>
<p class="subtitle">重点考虑可读性和视觉层级</p>

<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>单列布局</h3>
      <p>干净、聚焦的阅读体验</p>
    </div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content">
      <h3>双列布局</h3>
      <p>侧边导航配合主内容区</p>
    </div>
  </div>
</div>
```

这样就够了。不需要 `<html>`、CSS 或 `<script>` 标签。服务会提供这些能力。

## 可用 CSS 类

frame template 为内容提供以下 CSS 类。

### 选项(A/B/C)

```html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content">
      <h3>标题</h3>
      <p>说明</p>
    </div>
  </div>
</div>
```

**多选:** 给容器添加 `data-multiselect`,允许用户选择多个选项。每次点击都会切换选中状态,提示条会显示选中数量。

```html
<div class="options" data-multiselect>
  <!-- 同样的 option 结构,用户可以选中或取消多个选项 -->
</div>
```

### 卡片(视觉设计)

```html
<div class="cards">
  <div class="card" data-choice="design1" onclick="toggleSelect(this)">
    <div class="card-image"><!-- mockup 内容 --></div>
    <div class="card-body">
      <h3>名称</h3>
      <p>说明</p>
    </div>
  </div>
</div>
```

### Mockup 容器

```html
<div class="mockup">
  <div class="mockup-header">预览:仪表盘布局</div>
  <div class="mockup-body"><!-- mockup HTML --></div>
</div>
```

### 分栏视图(并排)

```html
<div class="split">
  <div class="mockup"><!-- 左侧 --></div>
  <div class="mockup"><!-- 右侧 --></div>
</div>
```

### 优缺点

```html
<div class="pros-cons">
  <div class="pros"><h4>优点</h4><ul><li>收益</li></ul></div>
  <div class="cons"><h4>缺点</h4><ul><li>代价</li></ul></div>
</div>
```

### Mock 元素(线框图积木)

```html
<div class="mock-nav">Logo | 首页 | 关于 | 联系</div>
<div style="display: flex;">
  <div class="mock-sidebar">导航</div>
  <div class="mock-content">主内容区域</div>
</div>
<button class="mock-button">操作按钮</button>
<input class="mock-input" placeholder="输入框">
<div class="placeholder">占位区域</div>
```

### 排版和区块

- `h2`:页面标题
- `h3`:区块标题
- `.subtitle`:标题下方的辅助文本
- `.section`:带底部间距的内容区块
- `.label`:小号大写标签文本

## 浏览器事件格式

用户在浏览器中点击选项时,交互会记录到 `$STATE_DIR/events`,每行一个 JSON 对象。推送新屏幕时,这个文件会自动清空。

```jsonl
{"type":"click","choice":"a","text":"选项 A - 简单布局","timestamp":1706000101}
{"type":"click","choice":"c","text":"选项 C - 复杂网格","timestamp":1706000108}
{"type":"click","choice":"b","text":"选项 B - 混合方案","timestamp":1706000115}
```

完整事件流能展示用户的探索路径。用户可能在最终决定前点击多个选项。最后一个 `choice` 事件通常是最终选择,但点击模式也可能暴露犹豫或偏好,值得追问。

如果 `$STATE_DIR/events` 不存在,说明用户没有在浏览器中交互,只使用终端文本反馈。

## 设计建议

- **按问题调节保真度**:布局问题用线框图,视觉打磨问题再提高精度。
- **每页都说明问题**:写“哪个布局更显专业?”,不要只写“选一个”。
- **先迭代再前进**:如果反馈改变当前屏幕,写一个新版本。
- **每屏最多 2-4 个选项**。
- **必要时使用真实内容**:例如摄影作品集应使用真实图片。占位内容会掩盖设计问题。
- **保持 mockup 简洁**:聚焦布局和结构,不要追求像素级设计稿。

## 文件命名

- 使用语义化名称,例如 `platform.html`、`visual-style.html`、`layout.html`。
- 不要复用文件名。每个屏幕必须是新文件。
- 迭代时追加版本后缀,例如 `layout-v2.html`、`layout-v3.html`。
- 服务按修改时间展示最新文件。

## 清理

```bash
scripts/stop-server.sh $SESSION_DIR
```

如果会话使用了 `--project-dir`,mockup 文件会保留在 `.superpowers/brainstorm/` 中,方便之后查看。只有 `/tmp` 会话会在停止时删除。

## 参考

- Frame template(CSS 参考):`scripts/frame-template.html`
- Helper script(客户端交互):`scripts/helper.js`
