# Changelog

本文件记录 `dsh-session-receipt` 的对外变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] — 2026-11-10

首个正式版本，可供插件市场上架。

### 新增

- `/receipt` 斜杠命令：随时生成当前会话小票，命令结果由 UI 直接呈现，**不进入模型上下文、不消耗令牌**。
- `session_receipt` 工具：模型可以主动获取同一份小票，用户不必记命令。
- 记账内容：调用总次数、按工具的次数分布、碰过的文件及其工具类型、失败次数与失败工具、上下文占用百分比。
- 上下文占用超过 80% 时附带压缩提示。
- 多会话隔离：每个会话一本账，互不污染。

### 变更

- 源码拆分为 `index.js`（接线）、`src/ledger.js`（聚合）、`src/render.js`（渲染），渲染为纯函数。
- 移除对 `@deepseek-ai/dsh-tools` 的运行时依赖，改为直接向注册表提交原始工具定义。**链接安装与 git 安装因此可以正常加载**（旧版会因解析不到该包而静默不激活）。

### 质量

- 31 项单元测试覆盖聚合、渲染、接线与降级路径。
- 在真实 dsh `0.2.2-rc.1` 上完成安装与加载验证。

## [0.1.0] — 2026-11-10

### 新增

- 初版：`tools/result` 事件观测、`/receipt` 命令、`session_receipt` 工具。

[1.0.0]: https://github.com/york0307/dsh-session-receipt/releases/tag/v1.0.0
[0.1.0]: https://github.com/york0307/dsh-session-receipt/releases/tag/v0.1.0
