import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LedgerStore,
  MAX_SESSIONS,
  emptyLedger,
  pathOf,
  recordCall,
} from '../src/ledger.js'

test('空账本从零开始', () => {
  const ledger = emptyLedger(1000)
  assert.equal(ledger.calls, 0)
  assert.equal(ledger.failures, 0)
  assert.equal(ledger.byTool.size, 0)
  assert.equal(ledger.files.size, 0)
  assert.equal(ledger.started, 1000)
})

test('统计调用次数与工具分布', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'bash' }, {}, 1)
  recordCall(ledger, { name: 'bash' }, {}, 2)
  recordCall(ledger, { name: 'read' }, {}, 3)

  assert.equal(ledger.calls, 3)
  assert.equal(ledger.byTool.get('bash'), 2)
  assert.equal(ledger.byTool.get('read'), 1)
  assert.equal(ledger.lastAt, 3)
})

test('失败的调用单独计数，工具名保留', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'bash' }, { isError: true }, 1)
  recordCall(ledger, { name: 'bash' }, { isError: false }, 2)

  assert.equal(ledger.calls, 2)
  assert.equal(ledger.failures, 1)
  assert.equal(ledger.failedByTool.get('bash'), 1)
})

test('只有写文件类工具才登记路径', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'edit', arguments: JSON.stringify({ path: 'a.ts' }) }, {}, 1)
  recordCall(ledger, { name: 'read', arguments: JSON.stringify({ path: 'b.ts' }) }, {}, 2)

  assert.ok(ledger.files.has('a.ts'))
  assert.equal(ledger.files.has('b.ts'), false)
  assert.deepEqual([...ledger.files.get('a.ts')], ['edit'])
})

test('同一文件被多种工具碰过时保留全部工具名', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'edit', arguments: JSON.stringify({ path: 'a.ts' }) }, {}, 1)
  recordCall(ledger, { name: 'write', arguments: JSON.stringify({ path: 'a.ts' }) }, {}, 2)

  assert.deepEqual([...ledger.files.get('a.ts')].sort(), ['edit', 'write'])
})

test('拿不到路径时不登记，也不抛异常', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'edit', arguments: 'not json' }, {}, 1)
  recordCall(ledger, { name: 'edit' }, {}, 2)
  recordCall(ledger, { name: 'edit', arguments: JSON.stringify({ nope: 1 }) }, {}, 3)

  assert.equal(ledger.files.size, 0)
  assert.equal(ledger.calls, 3)
})

test('工具名缺失时记为 unknown，不崩溃', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, {}, {}, 1)
  assert.equal(ledger.byTool.get('unknown'), 1)
})

test('pathOf 兼容几种常见字段名', () => {
  assert.equal(pathOf(JSON.stringify({ path: 'p' })), 'p')
  assert.equal(pathOf(JSON.stringify({ file_path: 'q' })), 'q')
  assert.equal(pathOf(JSON.stringify({ filePath: 'r' })), 'r')
  assert.equal(pathOf(JSON.stringify({ filename: 's' })), 's')
  assert.equal(pathOf(JSON.stringify({ path: '' })), undefined)
  assert.equal(pathOf(''), undefined)
  assert.equal(pathOf(null), undefined)
})

test('账本超过上限时淘汰最早的一本', () => {
  const store = new LedgerStore()
  for (let i = 0; i <= MAX_SESSIONS; i++) store.for(`s${i}`, i)

  assert.equal(store.size, MAX_SESSIONS)
  // 最早插入的 s0 已被淘汰：再次取用会得到一本新账本。
  const revived = store.for('s0', 999)
  assert.equal(revived.started, 999)
  assert.equal(revived.calls, 0)
})

test('同一会话复用同一本账本', () => {
  const store = new LedgerStore()
  const a = store.for('x', 1)
  a.calls = 5
  const b = store.for('x', 2)
  assert.equal(b, a)
  assert.equal(b.calls, 5)
})
