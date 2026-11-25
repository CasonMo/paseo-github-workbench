# GitHub Workbench

在 Paseo 中浏览与处理 GitHub PR / Issue：看板一键派发 agent，可选自动评审与回写。

## 功能

- **看板（主视图）**：跨仓库列出你名下所有 open PR / issue，**以及你在别人仓库提的 PR / issue**（`gh search` 按 owner + author 两路搜索去重），按类型 / 仓库 / 关键词过滤；「派发 Agent」先在卡片内展开派发面板——提示词预填仓库模板（可编辑）、agent/模型/思考档位/权限模式预填仓库配置（可改），确认后才派发。详情面板的派发与 Fix broken checks 同样走该面板。
- **侧边栏未处理徽章**：菜单右侧显示待处理计数——尚未派发的 open PR/issue + 待确认合并 + 失败待重试的 run；每 30 秒轮询，为 0 时隐藏。
- **详情面板**：点击卡片查看描述、评论 Activity、PR checks 与评审状态；内联操作派发、发表评论、合并 / 自动合并（等 checks）、Fix broken checks。
- **一键派发，零配置**：自动匹配本地 Paseo project，没有就 `gh repo clone` 到插件管理目录；PR 用 worktree checkout，issue 用 branch-off worktree；默认模型用 Paseo provider 目录的默认项，无需选择。
- **派发 agent 可自定义**：每个仓库的 PR 评审 / Issue 处理可分别配置派发的 agent 与模型（provider/model）、思考档位、权限模式；留空即用 Paseo 默认。另有高级配置（JSON 对象）合并进 agent 配置，可设 `options` / `systemPrompt` / `toolPolicy` / `mcpServers`。手动派发与失败重试同样生效。
- **结果回写**：PR 评审输出结构化结论，通过则合并（默认需人工确认，可开全自动），有问题按模板评论回 PR；issue 处理结果按模板评论回 issue。合并锁定 agent 评审时的 commit：REST 合并调用携带评审时的 head SHA，PR head 变化时阻止合并并自动重新派发评审。自动合并不启用 GitHub 原生 auto-merge；checks 未过时 run 挂起留人工批准。缺少评审 SHA 的旧 run 一律重新评审，不允许合并。
- **新评论复用原 agent 跟进**：已派发过 agent 的 PR / issue 有新评论时，插件把新评论按跟进模板追加给原 agent 继续会话（保留 worktree 与上下文），不新开 agent；原 agent 已归档或不可用时自动回退新派发。插件自身的回写评论不触发跟进；agent 正在运行时评论会攒到下一轮批量处理。跟进提示词可按仓库编辑。
- **运行记录**：状态筛选、结论查看、批准合并 / 跳过 / 失败重试、跳转 agent。
- **自动化（可选）**：按仓库轮询，新 PR / 新 issue（可按 label、author 白名单过滤）自动派发；提示词与评论模板可编辑；首次轮询只建基线，不会派发存量条目。
- **触屏键盘避让**：iPad / iPhone（原生 App 与触屏 web）唤起软键盘时，面板按真实键盘高度精确抬升，评论输入框、搜索框与下拉列表保持可见，收起自动复原；桌面端不受影响。

## 设置

- 依赖 daemon 机器上已安装并认证的 GitHub CLI（`gh auth login`）。
- 看板与手动派发无需任何配置。自动化在「自动化」页添加仓库监听即可；展开仓库卡片可为 PR 评审 / Issue 处理选择派发 agent、模型、思考档位、权限模式与高级 JSON 配置（provider 目录来自 Paseo daemon 快照，仅本机读取）。

## 数据与权限

- 通过本机 `gh` CLI 访问 GitHub：读取 PR / issue，发表评论，合并 PR（合并默认需人工确认），clone 公开/有权限的仓库。
- PR / issue 的标题、正文与评论会渲染进 agent 提示词，发送给你在 Paseo 中配置的 agent provider（模型）；agent 输出以评论或合并形式回写 GitHub。
- 配置与运行记录保存在 daemon 机器 `~/.local/state/paseo-github-workbench/state.json`；自动 clone 的仓库在同目录 `repos/` 下。
- 除 GitHub 与你配置的 agent provider 外，不发送数据到任何第三方服务。

## 已知限制

- 事件发现为轮询（分钟级延迟），非 webhook 实时。
- PR 正文与 issue 内容会进入 agent 提示词，属于不可信输入；评审 agent 不应被授予合并权限，合并动作由插件执行。