import type { ChangeSpec, EditorState } from '@codemirror/state'
import { tidyNote } from '@shared/note-text'
import type { EditorView } from '@codemirror/view'

/**
 * Plain-text equivalents of Apple Notes' Format menu: lists and checklists are
 * written as ordinary line prefixes so the files stay readable anywhere.
 */
export type ListStyle = 'checklist' | 'bulleted' | 'dashed' | 'numbered'

const LIST_PREFIX = /^(\s*)(- \[[ xX]\] |• |- |(\d+)\. )/
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

/**
 * Enter on a list line continues the list, like Apple Notes: checklists add an
 * unchecked item, numbers count up. Enter on an empty item ends the list.
 */
export function continueList(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (!range.empty || state.selection.ranges.length > 1) return false
  const line = state.doc.lineAt(range.head)
  const match = LIST_PREFIX.exec(line.text)
  if (!match || range.head < line.from + match[0].length) return false

  if (!line.text.slice(match[0].length).trim()) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
      userEvent: 'delete'
    })
    return true
  }

  const [, indent, marker, number] = match
  const next = marker.startsWith('- [') ? '- [ ] ' : number ? `${Number(number) + 1}. ` : marker
  const insert = `\n${indent}${next}`
  view.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + insert.length },
    scrollIntoView: true,
    userEvent: 'input'
  })
  return true
}

/**
 * Applies tidyNote() to the editor as small, undoable edits so the cursor stays
 * put: trailing spaces per line, and blank lines at the start and end.
 */
export function tidyChanges(state: EditorState): ChangeSpec[] {
  const text = state.doc.toString()
  if (tidyNote(text) === text) return []
  if (!text.trim()) return [{ from: 0, to: text.length }]
  const lead = /^(?:[ \t]*\n)+/.exec(text)?.[0].length ?? 0
  const trail = /(?:\n[ \t]*)+$/.exec(text)?.index ?? text.length
  const changes: ChangeSpec[] = [{ from: 0, to: lead }]
  for (let n = state.doc.lineAt(lead).number; n <= state.doc.lineAt(trail).number; n++) {
    const line = state.doc.line(n)
    const spaces = /[ \t]+$/.exec(line.text)
    const from = line.from + (spaces?.index ?? line.length)
    if (spaces && from < trail) changes.push({ from, to: Math.min(line.to, trail) })
  }
  changes.push({ from: trail, to: text.length })
  return changes.filter((c) => (c as { to: number }).to > (c as { from: number }).from)
}

/** ⌘S / `:w`: tidy the visible text (the saved file is always tidy). */
export function tidyEditor(view: EditorView): boolean {
  const changes = tidyChanges(view.state)
  if (changes.length) view.dispatch({ changes, userEvent: 'input.tidy' })
  return true
}
