import type { EditorView } from '@codemirror/view'

/** The single editor instance, so menu commands can act on it. */
let current: EditorView | null = null

export const editorHandle = {
  get view(): EditorView | null {
    return current
  },
  set(view: EditorView | null): void {
    current = view
  },
  hasFocus(): boolean {
    return !!current && current.dom.contains(document.activeElement)
  }
}
