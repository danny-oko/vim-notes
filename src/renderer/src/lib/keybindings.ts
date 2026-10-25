import { create } from 'zustand'
import { getCM } from '@replit/codemirror-vim'
import {
  commandForKey,
  displayKey,
  keyFromEvent,
  primaryKey,
  startsChord,
  type KeybindingsState,
  type WhenContext
} from '@shared/keybindings'
import type { MenuCommand } from '@shared/types'
import { editorHandle } from '@/components/editor/editor-handle'
import { useNotes } from '@/store/notes-store'

/**
 * Keyboard shortcuts from keybindings.json (see src/shared/keybindings.ts).
 * They're dispatched here rather than by the native menu, because only the
 * page knows what has focus, and because keys are matched by physical
 * position so ⇧⌘7 works the same in the ABC and Mongolian layouts.
 */
export const useKeybindings = create<{ state: KeybindingsState | null }>(() => ({ state: null }))

export function initKeybindings(): () => void {
  void window.api.getKeybindings().then((state) => useKeybindings.setState({ state }))
  return window.api.onKeybindingsChanged((state) => useKeybindings.setState({ state }))
}

/** `⇧⌘7`-style label for a command's shortcut, if it has one. */
export function shortcutLabel(command: MenuCommand): string | undefined {
  const bindings = useKeybindings.getState().state?.bindings
  const key = bindings && primaryKey(bindings, command)
  return key ? displayKey(key) : undefined
}

export function useShortcut(command: MenuCommand | undefined): string | undefined {
  return useKeybindings((s) => {
    const key = command && s.state && primaryKey(s.state.bindings, command)
    return key ? displayKey(key) : undefined
  })
}

function isTextField(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable && !editorHandle.view?.contentDOM.contains(element))
  )
}

/** Values for `when` clauses, read at the moment a key is pressed. */
export function currentContext(): WhenContext {
  const active = document.activeElement
  const view = editorHandle.view
  const notes = useNotes.getState()
  const editorFocus = editorHandle.hasFocus()
  const vim = view ? getCM(view)?.state.vim : undefined
  const hasSelection = !!view && view.state.selection.ranges.some((range) => !range.empty)
  const pane = active?.closest<HTMLElement>('[data-pane]')?.dataset.pane
  return {
    editorFocus,
    editorTextFocus: !!view && active === view.contentDOM,
    // In Vim's normal mode a leftover selection isn't one the user made: only visual mode counts.
    editorHasSelection: editorFocus && hasSelection && (!vim || vim.visualMode || vim.insertMode),
    inputFocus: isTextField(active),
    listFocus: pane === 'list',
    sidebarFocus: pane === 'sidebar',
    noteOpen: !!notes.selectedNoteId,
    vimEnabled: !!notes.settings?.vimEnabled,
    vimMode: !vim ? '' : vim.insertMode ? 'insert' : vim.visualMode ? 'visual' : vim.mode === 'replace' ? 'replace' : 'normal',
    dialogOpen: !!document.querySelector('[role="dialog"], [role="alertdialog"]')
  }
}

const CHORD_TIMEOUT_MS = 1500
/** How long after a keydown a menu key equivalent counts as that same key press. */
const SAME_PRESS_MS = 400

let chord: { prefix: string; at: number } | null = null
let lastKeyDown = { modifiers: '', at: 0 }

const modifiersOf = (key: string): string => key.split(' ').at(-1)!.split('+').slice(0, -1).join('+')

/** Marks an element (and its children) as recording a shortcut, so keys pass straight through. */
export const RECORDER_ATTRIBUTE = 'data-keybinding-recorder'

export function installKeybindings(run: (command: MenuCommand) => void): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.target instanceof Element && event.target.closest(`[${RECORDER_ATTRIBUTE}]`)) return
    const bindings = useKeybindings.getState().state?.bindings
    const key = keyFromEvent(event)
    if (!bindings || !key) return
    lastKeyDown = { modifiers: modifiersOf(key), at: Date.now() }

    const pending = chord && Date.now() - chord.at < CHORD_TIMEOUT_MS ? chord.prefix : null
    chord = null
    const context = currentContext()
    const full = pending ? `${pending} ${key}` : key
    const command = commandForKey(bindings, full, context)
    const consume = (): void => {
      event.preventDefault()
      event.stopPropagation()
    }

    if (command) {
      consume()
      run(command)
    } else if (!pending && startsChord(bindings, key, context)) {
      consume()
      chord = { prefix: key, at: Date.now() }
    } else if (pending) {
      // The second key of an unknown chord does nothing, as in VS Code.
      consume()
    }
  }
  window.addEventListener('keydown', onKeyDown, true)
  return () => window.removeEventListener('keydown', onKeyDown, true)
}

/**
 * macOS fired a menu item by its key equivalent. Usually the page saw the key
 * first and either ran a command or deliberately let it through (its `when`
 * didn't match), so only act when the page never got the key at all.
 */
export function handleMenuAccelerator(key: string, run: (command: MenuCommand) => void): void {
  if (Date.now() - lastKeyDown.at < SAME_PRESS_MS && lastKeyDown.modifiers === modifiersOf(key)) return
  const bindings = useKeybindings.getState().state?.bindings
  const command = bindings && commandForKey(bindings, key, currentContext())
  if (command) run(command)
}
