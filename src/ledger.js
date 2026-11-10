/**
 * 会话账本 —— 纯数据聚合，不含任何渲染或宿主依赖。
 *
 * 这一层刻意与 DSH 解耦：输入只有"一次工具调用"，输出是普通对象。
 * 因此它可以被单元测试完整覆盖，不需要启动宿主。
 *
 * @module dsh-session-receipt/ledger
 */

/** 同时保留的会话账本上限，超出后丢弃最早的一份，避免长期运行攒内存。 */
export const MAX_SESSIONS = 50

/** 视为"写文件"的工具名。用白名单而非前缀猜测，避免把 `read` 之类误计。 */
export const WRITE_TOOLS = new Set([
  'write',
  'edit',
  'multi_edit',
  'multiedit',
  'apply_patch',
  'str_replace_editor',
  'notebook_edit',
  'create_file',
])

/**
 * 一份会话账本。
 * @typedef {object} Ledger
 * @property {number} started 首次记录的时间戳（毫秒）
 * @property {number} lastAt 最近一次记录的时间戳（毫秒）
 * @property {number} calls 工具调用总次数
 * @property {Map<string, number>} byTool 工具名 → 次数
 * @property {Map<string, Set<string>>} files 文件路径 → 碰过它的工具名集合
 * @property {number} failures 失败的调用次数
 * @property {Map<string, number>} failedByTool 失败的工具名 → 次数
 */

/**
 * 新建一份空账本。
 * @param {number} now 起始时间戳
 * @returns {Ledger}
 */
export function emptyLedger(now) {
  return {
    started: now,
    lastAt: now,
    calls: 0,
    byTool: new Map(),
    files: new Map(),
    failures: 0,
    failedByTool: new Map(),
  }
}

/** 递增一个 Map 里的计数。 */
function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/**
 * 从一次工具调用的原始参数里取出它涉及的路径。
 * 参数是模型给的 JSON 字符串，任何形状都可能出现，所以全程容错。
 * @param {unknown} raw `exec.arguments`
 * @returns {string | undefined}
 */
export function pathOf(raw) {
  let args = raw
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return undefined
    }
  }
  if (args === null || typeof args !== 'object') return undefined
  for (const key of ['path', 'file_path', 'filePath', 'filename']) {
    const value = args[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * 把一次已完成的工具调用记进账本。就地修改。
 * @param {Ledger} ledger 目标账本
 * @param {{name?: unknown, arguments?: unknown}} exec 调用身份
 * @param {{isError?: unknown}} result 归一化结果
 * @param {number} now 当前时间戳
 * @returns {void}
 */
export function recordCall(ledger, exec, result, now) {
  const toolName = typeof exec?.name === 'string' ? exec.name : 'unknown'

  ledger.calls += 1
  ledger.lastAt = now
  bump(ledger.byTool, toolName)

  if (result?.isError === true) {
    ledger.failures += 1
    bump(ledger.failedByTool, toolName)
  }

  if (WRITE_TOOLS.has(toolName)) {
    const path = pathOf(exec?.arguments)
    if (path !== undefined) {
      const tools = ledger.files.get(path)
      if (tools === undefined) ledger.files.set(path, new Set([toolName]))
      else tools.add(toolName)
    }
  }
}

/**
 * 按会话 id 管理账本的容器。超过上限时按加入顺序淘汰最早的。
 */
export class LedgerStore {
  /** @type {Map<string, Ledger>} */
  #ledgers = new Map()

  /** 当前保存的会话数。 */
  get size() {
    return this.#ledgers.size
  }

  /**
   * 取（或创建）一个会话的账本。
   * @param {string} sessionId
   * @param {number} now
   * @returns {Ledger}
   */
  for(sessionId, now) {
    let ledger = this.#ledgers.get(sessionId)
    if (ledger === undefined) {
      ledger = emptyLedger(now)
      this.#ledgers.set(sessionId, ledger)
      while (this.#ledgers.size > MAX_SESSIONS) {
        const oldest = this.#ledgers.keys().next()
        if (oldest.done) break
        this.#ledgers.delete(oldest.value)
      }
    }
    return ledger
  }

  /** 清空全部账本（测试与热重载用）。 */
  clear() {
    this.#ledgers.clear()
  }
}
