# dsh-session-receipt

> 一次会话到底做了什么，一张小票说清楚。

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![dsh](https://img.shields.io/badge/dsh-0.2.x-4D6BFE)](https://github.com/deepseek-ai/deepseek-harness)
[![dependencies](https://img.shields.io/badge/runtime%20deps-none-brightgreen)](./package.json)

---

## 为什么需要它

长会话跑完，你面对的是几十条工具调用和一屏滚不到头的输出。要回答"这次到底改了哪些文件""刚才那几次报错是什么""上下文怎么又要满了"，只能往上翻。

`dsh-session-receipt` 在后台把每次工具调用记成一本账，任何时候问它，它给你一张票。

```
### 🧾 本次会话小票

**调用 14 次** · 失败 1 次 · 跨度 23 分钟

| 工具 | 次数 |
| --- | --- |
| `bash` | 6 |
| `read` | 4 |
| `edit` | 3 |
| `grep` | 1 |

**碰过的文件 2 个**

- `src/index.ts` — edit
- `README.md` — write

**上下文** 82.0k / 131k · 63%

> ⚠️ 1 次调用返回错误：`bash` ×1
```

## 安装

```sh
dsh plugin --profile <你的 profile> add dsh-session-receipt
```

装完重启 DSH 生效。卸载：

```sh
dsh plugin --profile <你的 profile> remove dsh-session-receipt
```

从源码或 tarball 安装：

```sh
dsh plugin --profile <你的 profile> add ./dsh-session-receipt-1.0.0.tgz
```

## 用法

两种触发方式，都不花令牌：

| 方式 | 场景 |
| --- | --- |
| 打 `/receipt` | 想立刻看一眼，命令结果由 UI 直接呈现，不进模型上下文 |
| 直接问"这个会话都干了什么" | 模型自己调用 `session_receipt` 工具取同一份数据 |

小票每装一次插件就为每个会话独立记账，切换会话看到的是各自的账。

## 它记录什么

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| 调用次数 / 工具分布 | `tools/result` 事件 | 全量统计，不含历史 |
| 碰过的文件 | 写文件类工具的参数 | 只认 `write` / `edit` 一类工具的 `path` 参数 |
| 失败次数 | 工具结果的 `isError` | 同时给出失败最多的工具名 |
| 上下文占用 | `tokenMeter.contextPressure` | 服务不存在时整行省略 |

## 隐私与安全

这是本插件最重要的设计承诺，可以在源码里逐条核对：

- **不联网。** 代码里没有任何网络调用，没有遥测，没有"匿名统计"。
- **不写盘。** 账本只存在宿主进程内存里，插件卸载即消失，不留临时文件。
- **不拦截。** 只订阅 `tools/result` 观测已完成的调用，不修改参数、不修改结果、不增加拒绝。
- **不读文件。** 文件路径来自工具参数本身，插件不会去读文件内容。
- **零运行时依赖。** 不 import 任何宿主包，安装时不会拉取、不会执行任何构建脚本。

## 兼容性

| dsh 版本 | 状态 |
| --- | --- |
| `0.2.2-rc.1` | 已实测：安装 + 加载通过 |
| 其它 `0.2.x` | 声明兼容（`engines.dsh: >=0.2.0 <0.3.0`），未逐一实测 |

## 设计取舍

| 决定 | 原因 |
| --- | --- |
| 只订阅 `tools/result`，不拦截 | 装错了也坏不了任何事；不改变任何工具的行为 |
| 内存聚合，不落盘 | 没有残留文件、没有隐私问题、不用清理 |
| 命令路径不进模型上下文 | 问多少次都不花钱 |
| `commands` / `tokenMeter` 缺失时降级 | 少一个服务就少一行输出，不会整个插件挂掉 |
| 每个会话最多留 50 份账本 | 长期运行不涨内存 |
| 没有配置项 | 零配置是特性，不是缺口；能调的参数越多，装完不生效的概率越高 |
| 无依赖、无构建步骤 | 安装时不需要授权构建脚本，装得上就是装得上 |

## 已知边界

- **只统计装上之后的调用**，插件加载前发生的调用不会追溯。
- **每张票只对应一个会话**，这是刻意的：跨会话汇总容易误导。
- 文件清单只认工具参数里的路径，**不解析 shell 命令中隐藏的写入**（例如 `sed -i`）。
- 上下文占用来自 `tokenMeter`，它是给用户看的参考值，不是计费口径。

## 开发

```sh
node --test          # 31 项单元测试
npm run pack:check   # 测试 + 检查发布产物内容
```

源码结构：

```
index.js        插件接线：订阅事件、注册命令与工具
src/ledger.js   账本聚合（纯数据，无宿主依赖）
src/render.js   小票渲染（纯函数）
test/           单元测试
```

## English

**Session receipt for DeepSeek Harness.** Passively tallies every tool call in a session and prints one card on demand: call counts by tool, files touched, failures, and context usage. Run `/receipt`, or just ask the agent what happened this session.

Zero configuration, zero runtime dependencies, no network, no filesystem writes, no extra model calls.

## License

[MIT](./LICENSE)
