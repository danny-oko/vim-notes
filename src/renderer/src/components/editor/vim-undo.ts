import { redo, undo, undoDepth, isolateHistory } from '@codemirror/commands'
import { EditorSelection, EditorState, StateEffect, StateField, Transaction, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'

/**
 * Undo that behaves like VSCodeVim:
 *  - `u` / `⌃r` undo and redo one whole Vim change: a normal-mode command
 *    (`dd`, `x`, `p`…) or everything typed between entering insert mode and
 *    pressing Esc (`ciw` + typing counts as one change).
 *  - `⌘Z` / `⇧⌘Z` use the editor's finer-grained history (typing chunks),
 *    like VS Code's native undo.
 *
 * Both share CodeMirror's history. We isolate a new history event at the start
 * of every Vim change and remember its depth, so `u` can undo back to it.
 */
interface VimUndoState {
  /** History depths at which each Vim change started, oldest first. */
  checkpoints: readonly number[]
  /** How many history events each `u` removed, for `⌃r`. */
  redoSizes: readonly number[]
  /** Whether a Vim change is in progress (insert session or current command). */
  open: boolean
}

const beginChange = StateEffect.define<number>()
const endChange = StateEffect.define<null>()
const setStacks = StateEffect.define<Pick<VimUndoState, 'checkpoints' | 'redoSizes'>>()

const vimUndoState = StateField.define<VimUndoState>({
  create: () => ({ checkpoints: [], redoSizes: [], open: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(beginChange)) value = { checkpoints: [...value.checkpoints, effect.value], redoSizes: [], open: true }
      else if (effect.is(endChange)) value = { ...value, open: false }
      else if (effect.is(setStacks)) value = { ...effect.value, open: false }
    }
    return value
  }
})

const isUndoRedo = (tr: Transaction): boolean => tr.isUserEvent('undo') || tr.isUserEvent('redo')

/** Starts a new undo unit when the first edit of a Vim change happens. */
const changeStarter = EditorState.transactionExtender.of((tr) => {
  const recorded = tr.annotation(Transaction.addToHistory) !== false
  if (!tr.docChanged || !recorded || isUndoRedo(tr) || tr.startState.field(vimUndoState).open) return null
  return {
    effects: beginChange.of(undoDepth(tr.startState)),
    annotations: isolateHistory.of('before')
  }
})

function isInsertMode(view: EditorView): boolean {
  return !!getCM(view)?.state.vim?.insertMode
}

/** Closes the current change once a normal-mode command finishes or insert mode ends. */
const changeCloser = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      getCM(view)?.on('vim-mode-change', this.onModeChange)
    }
    onModeChange = (event: { mode: string }): void => {
      if (event.mode !== 'insert') this.close()
    }
    update(update: { docChanged: boolean; view: EditorView }): void {
      if (!update.docChanged || isInsertMode(this.view)) return
      // A normal-mode command dispatches synchronously; close right after it.
      queueMicrotask(() => {
        if (!isInsertMode(this.view)) this.close()
      })
    }
    close(): void {
      if (this.view.state.field(vimUndoState, false)?.open) this.view.dispatch({ effects: endChange.of(null) })
    }
    destroy(): void {
      getCM(this.view)?.off('vim-mode-change', this.onModeChange)
    }
  }
)

function collapseSelection(view: EditorView): void {
  const { main } = view.state.selection
  if (!main.empty) view.dispatch({ selection: EditorSelection.cursor(main.from) })
}

/** `u`: undo the last whole Vim change. */
function undoVimChange(view: EditorView): void {
  const { checkpoints, redoSizes } = view.state.field(vimUndoState)
  const depth = undoDepth(view.state)
  // Checkpoints at or above the current depth were already undone (e.g. with ⌘Z).
  const remaining = checkpoints.filter((d) => d < depth)
  const target = remaining.pop() ?? 0
  let steps = 0
  while (undoDepth(view.state) > target && undo(view)) steps++
  if (steps === 0) return
  view.dispatch({ effects: setStacks.of({ checkpoints: remaining, redoSizes: [...redoSizes, steps] }) })
  collapseSelection(view)
}

/** `⌃r`: redo the last change undone with `u`. */
function redoVimChange(view: EditorView): void {
  const { checkpoints, redoSizes } = view.state.field(vimUndoState)
  const steps = redoSizes.at(-1) ?? 1
  const start = undoDepth(view.state)
  let done = 0
  while (done < steps && redo(view)) done++
  if (done === 0) return
  view.dispatch({ effects: setStacks.of({ checkpoints: [...checkpoints, start], redoSizes: redoSizes.slice(0, -1) }) })
  collapseSelection(view)
}

/** ⌘Z / ⇧⌘Z: one fine-grained history step, like VS Code's native undo. */
export function nativeUndo(view: EditorView): boolean {
  const ok = undo(view)
  const state = view.state.field(vimUndoState, false)
  if (ok && state) view.dispatch({ effects: setStacks.of({ checkpoints: state.checkpoints, redoSizes: [] }) })
  return ok
}

export function nativeRedo(view: EditorView): boolean {
  const ok = redo(view)
  const state = view.state.field(vimUndoState, false)
  if (ok && state) view.dispatch({ effects: setStacks.of({ checkpoints: state.checkpoints, redoSizes: [] }) })
  return ok
}

Vim.defineAction('vimNotesUndo', (cm, args) => {
  for (let i = 0; i < (args.repeat ?? 1); i++) undoVimChange(cm.cm6)
})
Vim.defineAction('vimNotesRedo', (cm, args) => {
  for (let i = 0; i < (args.repeat ?? 1); i++) redoVimChange(cm.cm6)
})
Vim.mapCommand('u', 'action', 'vimNotesUndo', {}, { context: 'normal' })
Vim.mapCommand('<C-r>', 'action', 'vimNotesRedo', {}, {})

/** Include only while Vim mode is on. */
export function vimUndo(): Extension {
  return [vimUndoState, changeStarter, changeCloser]
}
