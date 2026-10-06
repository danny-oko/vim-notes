import { getCM } from '@replit/codemirror-vim'
import { editorHandle } from '@/components/editor/editor-handle'
import { useNotes, type Pane } from '@/store/notes-store'

const MODIFIER_KEYS = new Set(['Meta', 'Shift', 'Control', 'Alt', 'CapsLock', 'Fn'])

function paneElement(pane: Pane): HTMLElement | null {
  if (pane === 'editor') return useNotes.getState().selectedNoteId ? (editorHandle.view?.contentDOM ?? null) : null
  return document.querySelector<HTMLElement>(`[data-pane="${pane}"]`)
}

/** Puts keyboard focus back on the pane the user was last working in. */
export function restorePaneFocus(): void {
  paneElement(useNotes.getState().focusedPane)?.focus()
}

/**
 * Closing a dialog, a menu-bar command or a click on empty chrome can leave
 * focus on <body>: the editor still shows its cursor but Vim no longer gets
 * any keys. A key pressed while nothing has focus goes to the last used pane.
 */
export function installFocusRescue(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const active = document.activeElement
    if (!event.isTrusted || (active && active !== document.body) || event.metaKey || MODIFIER_KEYS.has(event.key)) return
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
    const target = paneElement(useNotes.getState().focusedPane)
    if (!target) return

    event.preventDefault()
    event.stopPropagation()
    target.focus()
    const replay = new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      bubbles: true,
      cancelable: true
    })
    const handled = !target.dispatchEvent(replay)
    // A replayed key can't type text by itself, so insert it ourselves.
    const view = editorHandle.view
    if (handled || !view || target !== view.contentDOM || event.key.length !== 1 || event.ctrlKey) return
    const vim = getCM(view)?.state.vim
    if (vim && !vim.insertMode) return
    view.dispatch(view.state.replaceSelection(event.key), { userEvent: 'input.type', scrollIntoView: true })
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => document.removeEventListener('keydown', onKeyDown, true)
}
