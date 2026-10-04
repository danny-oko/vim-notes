import { Prec, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'

/**
 * Vim commands are defined in terms of the US QWERTY layout. When the user
 * types with another layout (Cyrillic, Greek, Hebrew, Korean, Japanese IME…)
 * we look at the *physical* key that was pressed and translate it back, so
 * `hjkl`, `:w`, `/`, `dd`, `ciw`… keep working without switching layouts.
 * Insert mode is untouched, so text is still typed in the user's language.
 */
const US_QWERTY: Record<string, readonly [string, string]> = {
  Backquote: ['`', '~'],
  Minus: ['-', '_'],
  Equal: ['=', '+'],
  BracketLeft: ['[', '{'],
  BracketRight: [']', '}'],
  Backslash: ['\\', '|'],
  Semicolon: [';', ':'],
  Quote: ["'", '"'],
  Comma: [',', '<'],
  Period: ['.', '>'],
  Slash: ['/', '?'],
  Digit1: ['1', '!'],
  Digit2: ['2', '@'],
  Digit3: ['3', '#'],
  Digit4: ['4', '$'],
  Digit5: ['5', '%'],
  Digit6: ['6', '^'],
  Digit7: ['7', '&'],
  Digit8: ['8', '*'],
  Digit9: ['9', '('],
  Digit0: ['0', ')']
}
for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
  US_QWERTY[`Key${letter.toUpperCase()}`] = [letter, letter.toUpperCase()]
}

/** Keys produced by an IME or a non-Latin layout rather than a plain ASCII character. */
function isForeignKey(event: KeyboardEvent): boolean {
  if (event.key === 'Process' || event.key === 'Unidentified') return true
  return event.key.length === 1 && event.key.charCodeAt(0) > 127
}

/** The character the same physical key would type on a US keyboard, if it differs. */
export function latinKeyFor(event: KeyboardEvent): string | null {
  // Option+key on macOS deliberately types symbols (å, ß…); leave those alone.
  if (event.metaKey || event.altKey || !isForeignKey(event)) return null
  const pair = US_QWERTY[event.code]
  return pair ? pair[event.shiftKey ? 1 : 0] : null
}

/**
 * Tear down an in-progress IME composition. Re-attaching the scroller is the
 * same trick @replit/codemirror-vim uses internally.
 */
function endComposition(view: EditorView): void {
  const parent = view.scrollDOM.parentElement
  if (!parent) return
  const sibling = view.scrollDOM.nextSibling
  view.scrollDOM.remove()
  parent.insertBefore(view.scrollDOM, sibling)
  view.focus()
}

interface VimPlugin {
  handleKey(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'preventDefault' | 'stopPropagation'>, view: EditorView): boolean
}

function normalModeState(view: EditorView) {
  const cm = getCM(view)
  const vim = cm?.state.vim
  if (!cm || !vim || vim.insertMode) return null
  return { vim, plugin: cm.state.vimPlugin as VimPlugin }
}

export function vimAnyLayout(): Extension {
  let swallowComposition = false

  return Prec.highest([
    EditorView.domEventHandlers({
      keydown(event, view) {
        const state = normalModeState(view)
        // After f/t/r/m… Vim expects a literal character: let “fж” find “ж”.
        if (!state || state.vim.expectLiteralNext) return false
        const key = latinKeyFor(event)
        if (!key) return false

        state.plugin.handleKey(
          {
            key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: false,
            metaKey: false,
            shiftKey: event.shiftKey,
            preventDefault: () => event.preventDefault(),
            stopPropagation: () => event.stopPropagation()
          },
          view
        )
        event.preventDefault()
        swallowComposition = event.key === 'Process' || event.key === 'Unidentified'
        return true
      },
      compositionstart(_event, view) {
        if (swallowComposition) queueMicrotask(() => endComposition(view))
        return false
      },
      compositionend() {
        swallowComposition = false
        return false
      }
    }),
    // An IME may still emit text for a key we already handled as a command.
    EditorView.inputHandler.of((view) => {
      if (!swallowComposition || !normalModeState(view)) return false
      swallowComposition = false
      endComposition(view)
      return true
    })
  ])
}

/**
 * The `:` command line is a plain <input>. Translate foreign keys there too so
 * `:w`, `:q`, `:s/…` work, but keep `/` and `?` searches in the user's language.
 */
export function installExCommandLayoutFix(): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.closest('.cm-vim-panel')) return
    if (input.previousSibling?.textContent !== ':') return
    const key = latinKeyFor(event)
    if (!key) return
    event.preventDefault()
    input.setRangeText(key, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  document.addEventListener('keydown', onKeyDown, true)
  return () => document.removeEventListener('keydown', onKeyDown, true)
}
