// PageSaver turns editor changes into POST /ops batches: one second after the
// last change it diffs the document against the last saved snapshot and sends
// the result. Saves run one at a time, in order. A failed save stops the saver;
// the caller shows a toast and reloads the page.
import { MAX_OPS_PER_BATCH, changesPages } from '#/entities/item'
import type { Op } from '#/entities/item'
import { childList } from './blocks'
import type { Snapshot } from './blocks'
import { diffOps } from './diffOps'

export const SAVE_DELAY_MS = 1000

export interface PageSaverOptions {
  saved: Snapshot
  read: () => Snapshot
  send: (ops: Op[], refreshPages: boolean) => Promise<void>
  onError: (err: unknown) => void
  onSavingChange?: (saving: boolean) => void
  delay?: number
}

export class PageSaver {
  private saved: Snapshot
  private extra: Op[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private queue: Promise<void> = Promise.resolve()
  private failed = false

  constructor(private opts: PageSaverOptions) {
    this.saved = opts.saved
  }

  schedule() {
    if (this.failed) return
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () => void this.flush(),
      this.opts.delay ?? SAVE_DELAY_MS,
    )
  }

  // flush saves now, after any save already running.
  flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    this.queue = this.queue.then(() => this.run())
    return this.queue
  }

  // moveOut records that a block (with everything under it) was taken out of
  // this document and moved into another page: the next save sends that move
  // first, and the block is no longer compared, so it is not deleted. Call it
  // after flush() and right after removing the block from the editor.
  moveOut(blockId: string, pageId: string) {
    this.saved = without(this.saved, blockId)
    this.extra.push({ op: 'move', id: blockId, parentId: pageId })
  }

  private async run() {
    if (this.failed) return
    const next = this.opts.read()
    const ops = [...this.extra, ...diffOps(this.saved, next)]
    if (ops.length === 0) return
    const refresh =
      this.extra.length > 0 ||
      changesPages(ops) ||
      ops.some(
        (op) => op.op === 'move' && next.nodes.get(op.id)?.type === 'page',
      )
    this.opts.onSavingChange?.(true)
    try {
      // Batches run in order and each op sees the ones before it, so a long
      // diff can go in several batches.
      for (let i = 0; i < ops.length; i += MAX_OPS_PER_BATCH) {
        await this.opts.send(ops.slice(i, i + MAX_OPS_PER_BATCH), refresh)
      }
      this.saved = next
      this.extra = []
    } catch (err) {
      this.failed = true
      clearTimeout(this.timer)
      this.opts.onError(err)
    } finally {
      this.opts.onSavingChange?.(false)
    }
  }
}

// without returns the snapshot minus a node and everything under it.
function without(s: Snapshot, id: string): Snapshot {
  const node = s.nodes.get(id)
  if (!node) return s
  const nodes = new Map(s.nodes)
  const drop = (x: string) => {
    for (const c of childList(s, x)) drop(c)
    nodes.delete(x)
  }
  drop(id)
  const rootIds = s.rootIds.filter((x) => x !== id)
  const parent = nodes.get(node.parentId)
  if (parent)
    nodes.set(parent.id, {
      ...parent,
      childIds: parent.childIds.filter((x) => x !== id),
    })
  return { pageId: s.pageId, rootIds, nodes }
}
