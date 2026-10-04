import { useRef } from 'react'

/**
 * What a navigable pane (notes list, gallery, sidebar) can do. Only the
 * provided actions get key bindings.
 */
export interface VimNavActions {
  /** Moves the selection by `delta` rows (j/k, ↓/↑, ⌃n/⌃p, counts like `5j`). */
  move(delta: number): void
  /** Jumps to the first or last item (gg / G, Home / End). */
  jump(to: 'first' | 'last'): void
  /** Rows moved by ⌃d / ⌃u. */
  halfPage?(): number
  /** Moves within a row, for grids (h/l, ←/→). */
  sideways?(delta: number): void
  /** Enter the item (l, o, Enter, Tab, →). */
  open?(): void
  /** Go back to the previous pane (h, ←, ⇧Tab). */
  back?(): void
  search?(): void
  create?(): void
  remove?(): void
  rename?(): void
}

const SEQUENCE_TIMEOUT_MS = 1000

/**
 * Vim motions for lists, like VSCodeVim in the explorer. Keys are matched by
 * physical position (`event.code`) so they work in any keyboard layout.
 */
export function useVimNav(actions: VimNavActions): (event: React.KeyboardEvent) => void {
  const pending = useRef({ count: '', prefix: '', at: 0 })

  return (event) => {
    if (event.target !== event.currentTarget || event.metaKey || event.altKey) return
    const state = pending.current
    if (Date.now() - state.at > SEQUENCE_TIMEOUT_MS) Object.assign(state, { count: '', prefix: '' })
    state.at = Date.now()

    const { code, key, shiftKey, ctrlKey } = event
    const count = Number(state.count) || 1
    const handled = (): void => {
      event.preventDefault()
      Object.assign(state, { count: '', prefix: '' })
    }

    // Count prefix: 5j, 10k…
    const digit = /^Digit(\d)$/.exec(code)?.[1]
    if (digit && !shiftKey && !ctrlKey && (digit !== '0' || state.count)) {
      state.count += digit
      event.preventDefault()
      return
    }

    // Two-key sequences: gg, dd.
    if (!ctrlKey && !shiftKey && (code === 'KeyG' || code === 'KeyD')) {
      const prefix = code === 'KeyG' ? 'g' : 'd'
      if (state.prefix === prefix) {
        if (prefix === 'g') actions.jump('first')
        else actions.remove?.()
        return handled()
      }
      if (prefix === 'd' && !actions.remove) return
      state.prefix = prefix
      event.preventDefault()
      return
    }

    if (ctrlKey) {
      if (code === 'KeyD' || code === 'KeyU') {
        const rows = actions.halfPage?.() ?? 10
        actions.move((code === 'KeyD' ? rows : -rows) * count)
      } else if (code === 'KeyN') actions.move(count)
      else if (code === 'KeyP') actions.move(-count)
      else return
      return handled()
    }

    if (code === 'KeyJ' || key === 'ArrowDown') actions.move(count)
    else if (code === 'KeyK' || key === 'ArrowUp') actions.move(-count)
    else if ((code === 'KeyG' && shiftKey) || key === 'End') actions.jump('last')
    else if (key === 'Home') actions.jump('first')
    else if (actions.sideways && (code === 'KeyH' || key === 'ArrowLeft')) actions.sideways(-count)
    else if (actions.sideways && (code === 'KeyL' || key === 'ArrowRight')) actions.sideways(count)
    else if (key === 'Tab' && shiftKey && actions.back) actions.back()
    else if ((code === 'KeyL' || code === 'KeyO' || key === 'Enter' || key === 'Tab' || key === 'ArrowRight') && actions.open)
      actions.open()
    else if ((code === 'KeyH' || key === 'ArrowLeft') && actions.back) actions.back()
    else if (code === 'Slash' && !shiftKey && actions.search) actions.search()
    else if (code === 'KeyA' && !shiftKey && actions.create) actions.create()
    else if (code === 'KeyR' && !shiftKey && actions.rename) actions.rename()
    else if ((key === 'Backspace' || key === 'Delete') && actions.remove) actions.remove()
    else if (key === 'Escape') Object.assign(state, { count: '', prefix: '' })
    else return
    handled()
  }
}
