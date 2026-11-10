import test from 'node:test'
import assert from 'node:assert/strict'

import { emptyLedger, recordCall } from '../src/ledger.js'
import { renderReceipt, shortTokens } from '../src/render.js'

/** 造一份有内容的账本。 */
function populated() {
  const ledger = emptyLedger(0)
  for (let i = 0; i < 6; i++) recordCall(ledger, { name: 'bash' }, { isError: i === 0 }, i)
  for (let i = 0; i < 4; i++) recordCall(ledger, { name: 'read' }, {}, 10 + i)
  recordCall(ledger, { name: 'edit', arguments: JSON.stringify({ path: 'src/index.ts' }) }, {}, 20)
  recordCall(ledger, { name: 'write', arguments: JSON.stringify({ path: 'README.md' }) }, {}, 21)
  return ledger
}

test('没有调用时给出说明而不是空表', () => {
  const text = renderReceipt(emptyLedger(0), undefined)
  assert.match(text, /还没有记录到工具调用/)
  assert.doesNotMatch(text, /\| 工具 \|/)
})

test('小票包含概览、分布与文件', () => {
  const text = renderReceipt(populated(), undefined)

  assert.match(text, /调用 12 次/)
  assert.match(text, /失败 1 次/)
  assert.match(text, /`bash` \| 6/)
  assert.match(text, /`read` \| 4/)
  assert.match(text, /碰过的文件 2 个/)
  assert.match(text, /`src\/index\.ts` — edit/)
  assert.match(text, /`README\.md` — write/)
  assert.match(text, /1 次调用返回错误：`bash` ×1/)
})

test('没有失败时不出现告警行', () => {
  const ledger = emptyLedger(0)
  recordCall(ledger, { name: 'read' }, {}, 1)
  const text = renderReceipt(ledger, undefined)
  assert.doesNotMatch(text, /⚠️/)
  assert.match(text, /无失败/)
})

test('提供预算时显示上下文占用', () => {
  const text = renderReceipt(populated(), { pressureTokens: 82000, contextWindow: 131072 })
  assert.match(text, /上下文/)
  assert.match(text, /82\.0k \/ 131\.1k · 63%/)
  assert.doesNotMatch(text, /已过 80%/)
})

test('上下文超过 80% 时给出提示', () => {
  const text = renderReceipt(populated(), { pressureTokens: 120000, contextWindow: 131072 })
  assert.match(text, /已过 80%/)
})

test('预算缺失或无效时不输出上下文行', () => {
  for (const budget of [undefined, {}, { pressureTokens: NaN, contextWindow: 100 }, { pressureTokens: 10, contextWindow: 0 }]) {
    assert.doesNotMatch(renderReceipt(populated(), budget), /上下文/)
  }
})

test('工具种类过多时折叠成一行，总数仍然守恒', () => {
  const ledger = emptyLedger(0)
  for (let i = 0; i < 20; i++) recordCall(ledger, { name: `tool-${i}` }, {}, i)

  const text = renderReceipt(ledger, undefined)
  assert.match(text, /其余 12 种工具 \| 12/)
  assert.equal(text.match(/^\| `tool-/gm)?.length, 8)
})

test('文件过多时截断并标注剩余数量', () => {
  const ledger = emptyLedger(0)
  for (let i = 0; i < 15; i++) {
    recordCall(ledger, { name: 'write', arguments: JSON.stringify({ path: `f${i}.ts` }) }, {}, i)
  }
  const text = renderReceipt(ledger, undefined)
  assert.match(text, /碰过的文件 15 个/)
  assert.match(text, /其余 5 个省略/)
})

test('渲染是纯函数：同一输入两次输出一致', () => {
  const ledger = populated()
  assert.equal(renderReceipt(ledger, { pressureTokens: 1, contextWindow: 2 }), renderReceipt(ledger, { pressureTokens: 1, contextWindow: 2 }))
})

test('shortTokens 覆盖各量级', () => {
  assert.equal(shortTokens(999), '999')
  assert.equal(shortTokens(1500), '1.5k')
  assert.equal(shortTokens(2_500_000), '2.50M')
  assert.equal(shortTokens(-1), '?')
  assert.equal(shortTokens(NaN), '?')
})
