/**
 * dsh-session-receipt —— 会话小票
 *
 * 把本次会话的工具调用记成一本账，随时出一张票：调用了什么、碰过哪些文件、
 * 失败几次、上下文还剩多少。
 *
 * 设计约束（决定了它的全部形态）：
 *   1. 纯观测：只订阅 `tools/result`，不拦截、不修改任何调用，装错了也不会坏事。
 *   2. 零配置：没有必填项、不写磁盘、不联网、不要 API Key。
 *   3. 零令牌：聚合在宿主内存里做，输出是本地的 Markdown，不额外调用模型。
 *   4. 降级安全：`commands` / `tokenMeter` 任一不存在时，剩余部分照常工作。
 *   5. 零依赖：本包没有任何裸模块 import。链接安装、git 安装、离线安装都不会
 *      因为解析不到宿主包而加载失败——这被真实安装验证过。
 *
 * @module dsh-session-receipt
 */

import { LedgerStore, emptyLedger, recordCall } from './src/ledger.js'
import { renderReceipt } from './src/render.js'

export const name = 'dsh-session-receipt'

/** 工具注册表就绪后才挂载；`commands` 与 `tokenMeter` 在 apply 内部按需注入。 */
export const inject = ['tools']

/**
 * 挂载插件。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  const store = new LedgerStore()

  /** 会话 id；拿不到就放弃这次记录，绝不猜。 */
  function sessionIdOf(agent) {
    const id = agent?.session?.id
    return typeof id === 'string' ? id : undefined
  }

  // ── 观测：只读聚合，不改结果 ────────────────────────────────────────────
  ctx.on('tools/result', (exec, result) => {
    try {
      const sessionId = sessionIdOf(exec?.agent)
      if (sessionId === undefined) return
      recordCall(store.for(sessionId, Date.now()), exec, result, Date.now())
    } catch {
      // 观测者绝不能让宿主的工具流水线因为小票而失败。
    }
  })

  // ── 数据：上下文占用（可选服务）──────────────────────────────────────────
  /** 最近一次读到的 tokenMeter，未挂载时为 undefined。 */
  let tokenMeter
  ctx.inject(['tokenMeter'], (scope) => {
    tokenMeter = scope.tokenMeter
  })

  /** 读取一个会话的上下文预算；服务缺失或调用失败时返回 undefined。 */
  function budgetOf(session) {
    try {
      if (tokenMeter === undefined || session === undefined) return undefined
      return tokenMeter.contextPressure(session)
    } catch {
      return undefined
    }
  }

  /** 为某个 agent 生成小票文本。 */
  function receiptFor(agent) {
    const sessionId = sessionIdOf(agent)
    // 拿不到会话 id 时用一本临时账本，不污染真实会话。
    const ledger = sessionId === undefined
      ? emptyLedger(Date.now())
      : store.for(sessionId, Date.now())
    return renderReceipt(ledger, budgetOf(agent?.session))
  }

  // ── 交付一：用户直接打的斜杠命令 ──────────────────────────────────────────
  // 命令结果由 UI 直接呈现，不进模型上下文，所以这条路径是零令牌的。
  ctx.inject(['commands'], (scope) => {
    scope.commands.register({
      name: 'receipt',
      description: '生成本次会话的小票：工具调用、碰过的文件、失败次数与上下文占用。',
      recordInput: false,
      handler: (invocation) => {
        try {
          return { kind: 'success', text: receiptFor(invocation?.agent) }
        } catch (error) {
          return { kind: 'error', text: `小票生成失败：${error instanceof Error ? error.message : String(error)}` }
        }
      },
    })
  })

  // ── 交付二：模型可调用的工具 ─────────────────────────────────────────────
  // 用户问"这个会话都干了什么"时，模型可以自己取数据，而不是让用户手打命令。
  // 直接注册原始定义：`parameters` 就是 JSON Schema，`output.schema` 是返回值规格。
  ctx.tools.register({
    name: 'session_receipt',
    description: 'Render a receipt for the current session: how many tool calls ran, which files were touched, how many failed, and how much context is used. Reads only local in-memory counters; costs no extra model calls.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(_args, exec) {
      return receiptFor(exec?.agent)
    },
    presentCall: () => ({ card: 'generic', title: 'Session receipt', kind: 'read' }),
  })
}
