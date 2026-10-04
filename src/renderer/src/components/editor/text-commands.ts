import type { ChangeSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * Plain-text equivalents of Apple Notes' Format menu: lists and checklists are
 * written as ordinary line prefixes so the files stay readable anywhere.
 */
export type ListStyle = 'checklist' | 'bulleted' | 'dashed' | 'numbered'

const LIST_PREFIX = /^(\s*)(- \[[ xX]\] |• |- |\d+\. )/
const UNCHECKED = /^(\s*)- \[ \] /
const CHECKED = /^(\s*)- \[[xX]\] /

function prefixFor(style: ListStyle, index: number): string {
  switch (style) {
    case 'checklist':
      return '- [ ] '
    case 'bulleted':
      return '• '
    case 'dashed':
      return '- '
    case 'numbered':
      return `${index + 1}. `
  }
}

function styleOf(prefix: string): ListStyle {
  if (prefix.startsWith('- [')) return 'checklist'
  if (prefix === '• ') return 'bulleted'
  if (prefix === '- ') return 'dashed'
  return 'numbered'
}

function selectedLines(view: EditorView) {
  const { state } = view
  const lines = new Map<number, ReturnType<typeof state.doc.line>>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) lines.set(n, state.doc.line(n))
  }
  return [...lines.values()]
}

/** Toggles a list style on the selected lines, like Format ▸ Checklist/Bulleted List. */
export function toggleList(view: EditorView, style: ListStyle): boolean {
  const lines = selectedLines(view)
  const allStyled = lines.every((line) => {
    const match = LIST_PREFIX.exec(line.text)
    return match && styleOf(match[2]) === style
  })
  const changes: ChangeSpec[] = lines.map((line, index) => {
    const match = LIST_PREFIX.exec(line.text)
    const indent = match?.[1] ?? /^\s*/.exec(line.text)![0]
    const from = line.from + indent.length
    const to = match ? from + match[2].length : from
    return { from, to, insert: allStyled ? '' : prefixFor(style, index) }
  })
  view.dispatch({ changes, userEvent: 'input.format', scrollIntoView: true })
  return true
}

/** Format ▸ Mark as Checked. */
export function toggleChecked(view: EditorView): boolean {
  const changes: ChangeSpec[] = []
  for (const line of selectedLines(view)) {
    const unchecked = UNCHECKED.exec(line.text)
    const checked = CHECKED.exec(line.text)
    const match = unchecked ?? checked
    if (!match) continue
    const from = line.from + match[1].length
    changes.push({ from, to: from + 6, insert: unchecked ? '- [x] ' : '- [ ] ' })
  }
  if (changes.length === 0) return false
  view.dispatch({ changes, userEvent: 'input.format' })
  return true
}
