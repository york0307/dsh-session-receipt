import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, inject, name } from '../index.js'

/**
 * 造一个最小的宿主替身。
 * `inject` 严格照 cordis 的语义：依赖缺失时**根本不回调**，这样才测得出降级行为。
 */
function makeHost({ withCommands = true, withTokenMeter = true } = {}) {
  const registered = { tools: [], commands: [] }
  const listeners = new Map()

  const ctx = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, [])
      listeners.get(event).push(fn)
    },
    inject(deps, callback) {
      const scope = {}
      if (deps.includes('commands')) {
        if (!withCommands) return
        scope.commands = { register: (definition) => registered.commands.push(definition) }
      }
      if (deps.includes('tokenMeter')) {
        if (!withTokenMeter) return
        scope.tokenMeter = { contextPressure: () => ({ pressureTokens: 82000, contextWindow: 131072 }) }
      }
      callback(scope)
    },
    tools: { register: (definition) => registered.tools.push(definition) },
  }

  /** 模拟一次工具调用完成。 */
  const emit = (toolName, args, isError = false, sessionId = 'sess-1') => {
    for (const fn of listeners.get('tools/result') ?? []) {
      fn(
        { name: toolName, agent: { session: { id: sessionId } }, arguments: JSON.stringify(args) },
        { content: [], isError },
      )
    }
  }

  return { ctx, registered, emit }
}

const agent = { session: { id: 'sess-1' } }
const invocation = () => ({ agent, rawInput: '', attachments: [], signal: new AbortController().signal })

test('插件导出名与必需依赖', () => {
  assert.equal(name, 'dsh-session-receipt')
  assert.deepEqual(inject, ['tools'])
})

test('同时注册工具与命令', () => {
  const { ctx, registered } = makeHost()
  apply(ctx)

  assert.deepEqual(registered.tools.map((t) => t.name), ['session_receipt'])
  assert.deepEqual(registered.commands.map((c) => c.name), ['receipt'])
})

test('工具定义符合注册表契约', () => {
  const { ctx, registered } = makeHost()
  apply(ctx)
  const tool = registered.tools[0]

  assert.equal(typeof tool.output.render, 'function')
  assert.deepEqual(tool.output.schema, { type: 'string' })
  assert.deepEqual(tool.parameters, { type: 'object', properties: {} })
  assert.equal(typeof tool.execute, 'function')
})

test('事件流进入命令输出', () => {
  const { ctx, registered, emit } = makeHost()
  apply(ctx)

  emit('bash', { command: 'ls' })
  emit('bash', { command: 'ls' }, true)
  emit('edit', { path: 'src/a.ts' })

  const result = registered.commands[0].handler(invocation())
  assert.equal(result.kind, 'success')
  assert.match(result.text, /调用 3 次/)
  assert.match(result.text, /失败 1 次/)
  assert.match(result.text, /`src\/a\.ts` — edit/)
})

test('工具与命令对同一会话给出一致的输出', async () => {
  const { ctx, registered, emit } = makeHost()
  apply(ctx)
  emit('read', { path: 'x' })

  const fromCommand = registered.commands[0].handler(invocation())
  const fromTool = await registered.tools[0].execute({}, { agent })

  assert.equal(fromCommand.text, fromTool)
})

test('不同会话各自记账，互不污染', () => {
  const { ctx, registered, emit } = makeHost()
  apply(ctx)

  emit('bash', {}, false, 'sess-1')
  emit('read', {}, false, 'sess-1')
  emit('write', {}, false, 'sess-2')

  const one = registered.commands[0].handler({ agent: { session: { id: 'sess-1' } } })
  assert.match(one.text, /调用 2 次/)

  const two = registered.commands[0].handler({ agent: { session: { id: 'sess-2' } } })
  assert.match(two.text, /调用 1 次/)
})

test('缺少 tokenMeter 时不输出上下文行且不报错', () => {
  const { ctx, registered, emit } = makeHost({ withTokenMeter: false })
  apply(ctx)
  emit('bash', {})

  const result = registered.commands[0].handler(invocation())
  assert.equal(result.kind, 'success')
  assert.doesNotMatch(result.text, /上下文/)
})

test('缺少 commands 服务时工具照常注册', () => {
  const { ctx, registered } = makeHost({ withCommands: false })
  apply(ctx)

  assert.equal(registered.tools.length, 1)
  assert.equal(registered.commands.length, 0)
})

test('两个可选服务都缺失时插件仍可装载', async () => {
  const { ctx, registered } = makeHost({ withCommands: false, withTokenMeter: false })
  apply(ctx)
  const text = await registered.tools[0].execute({}, { agent })
  assert.match(text, /还没有记录到工具调用/)
})

test('没有会话 id 的调用被忽略，不产生账本也不抛异常', () => {
  const { ctx, registered, emit } = makeHost()
  apply(ctx)

  // null 不会被默认参数顶掉，用于模拟"宿主没给出会话 id"。
  assert.doesNotThrow(() => emit('bash', {}, false, null))
  const result = registered.commands[0].handler(invocation())
  assert.match(result.text, /还没有记录到工具调用/)
})

test('命令处理器在渲染异常时返回 error 而不是抛出', () => {
  const { ctx, registered } = makeHost()
  apply(ctx)

  // 传入畸形 invocation：没有 agent、没有 signal。
  const result = registered.commands[0].handler(undefined)
  assert.equal(result.kind, 'success')
  assert.match(result.text, /小票/)
})
