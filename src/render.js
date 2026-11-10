/**
 * 小票渲染 —— 纯函数，不做 I/O、不读时钟。
 *
 * 保持纯粹有两个好处：可以完整单元测试；会话日志回放时输出稳定可复现。
 *
 * @module dsh-session-receipt/render
 */

/** 分布表最多列出的工具数，其余折叠成一行。 */
const MAX_TOOL_ROWS = 8

/** 文件清单最多列出的条数。 */
const MAX_FILE_ROWS = 10

/** 上下文用到这个百分比就给出提示。 */
const CONTEXT_WARN_PCT = 80

/** 把 token 数写成人类可读的短形式。 */
export function shortTokens(n) {
  if (!Number.isFinite(n) || n < 0) return '?'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

/** 按计数降序取前 n 项。 */
function topEntries(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

/**
 * 把一份账本渲染成 Markdown 卡片。
 * @param {import('./ledger.js').Ledger} ledger
 * @param {{pressureTokens?: number, contextWindow?: number} | undefined} budget
 * @returns {string}
 */
export function renderReceipt(ledger, budget) {
  const lines = ['### 🧾 本次会话小票', '']

  if (ledger.calls === 0) {
    lines.push('还没有记录到工具调用。装好之后产生的新调用才会进入小票。')
    return lines.join('\n')
  }

  // 概览：调用量、失败量、跨度。
  const minutes = Math.max(1, Math.round((ledger.lastAt - ledger.started) / 60000))
  const failureNote = ledger.failures === 0 ? '无失败' : `失败 ${ledger.failures} 次`
  lines.push(`**调用 ${ledger.calls} 次** · ${failureNote} · 跨度 ${minutes} 分钟`)
  lines.push('')

  // 工具分布。
  const shown = topEntries(ledger.byTool, MAX_TOOL_ROWS)
  lines.push('| 工具 | 次数 |', '| --- | --- |')
  for (const [tool, count] of shown) lines.push(`| \`${tool}\` | ${count} |`)
  const hiddenTools = ledger.byTool.size - shown.length
  if (hiddenTools > 0) {
    const hiddenCalls = ledger.calls - shown.reduce((sum, [, count]) => sum + count, 0)
    lines.push(`| 其余 ${hiddenTools} 种工具 | ${hiddenCalls} |`)
  }
  lines.push('')

  // 改动文件。
  if (ledger.files.size > 0) {
    lines.push(`**碰过的文件 ${ledger.files.size} 个**`, '')
    for (const [path, tools] of [...ledger.files.entries()].slice(0, MAX_FILE_ROWS)) {
      lines.push(`- \`${path}\` — ${[...tools].join('/')}`)
    }
    if (ledger.files.size > MAX_FILE_ROWS) lines.push(`- 其余 ${ledger.files.size - MAX_FILE_ROWS} 个省略`)
    lines.push('')
  }

  // 上下文占用，仅在 tokenMeter 提供数据时出现。
  const pressure = budget?.pressureTokens
  const window = budget?.contextWindow
  if (Number.isFinite(pressure) && Number.isFinite(window) && window > 0) {
    const pct = Math.round((pressure / window) * 100)
    lines.push(`**上下文** ${shortTokens(pressure)} / ${shortTokens(window)} · ${pct}%`)
    if (pct >= CONTEXT_WARN_PCT) lines.push('', '> 上下文已过 80%，建议压缩或开一个新会话再继续。')
    lines.push('')
  }

  // 失败提示。
  if (ledger.failures > 0) {
    const worst = topEntries(ledger.failedByTool, 3)
      .map(([tool, count]) => `\`${tool}\` ×${count}`)
      .join('、')
    lines.push(`> ⚠️ ${ledger.failures} 次调用返回错误：${worst}`)
  }

  return lines.join('\n').trimEnd()
}
