import { syntaxTree } from '@codemirror/language'
import { ChangeSet, EditorSelection, type ChangeSpec, type EditorState, type TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'

/**
 * Apple Notes' Format menu, written as Markdown (see rich-text.ts): paragraph
 * styles are line prefixes, font styles wrap the text in markers.
 */
export type BlockStyle = 'title' | 'heading' | 'subheading' | 'body'
export type InlineStyle = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'highlight' | 'monostyled'

const HEADING_PREFIX: Record<BlockStyle, string> = { title: '# ', heading: '## ', subheading: '### ', body: '' }

const MARKERS: Record<InlineStyle, { open: string; close: string; node: string }> = {
  bold: { open: '**', close: '**', node: 'StrongEmphasis' },
  italic: { open: '*', close: '*', node: 'Emphasis' },
  underline: { open: '<u>', close: '</u>', node: 'Underline' },
  strikethrough: { open: '~~', close: '~~', node: 'Strikethrough' },
  highlight: { open: '==', close: '==', node: 'Highlight' },
  monostyled: { open: '`', close: '`', node: 'InlineCode' }
}

/** Indent, quote markers and heading prefix at the start of a line. */
const BLOCK_PREFIX = /^(\s*(?:> ?)*)(#{1,6} )?/
/** Everything before a line's text: indent, quote, heading and list markers. */
const LINE_PREFIX = /^\s*(?:> ?)*(?:#{1,6} )?(?:- \[[ xX]\] |• |[-*+] |\d+[.)] )?/

function selectedLines(state: EditorState) {
  const lines = new Map<number, ReturnType<typeof state.doc.line>>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) lines.set(n, state.doc.line(n))
  }
  return [...lines.values()]
}

/** Format ▸ Title / Heading / Subheading / Body. Applying the current style again makes the lines body text. */
export function blockStyleSpec(state: EditorState, style: BlockStyle): TransactionSpec {
  const lines = selectedLines(state)
  const prefix = HEADING_PREFIX[style]
  const already = style !== 'body' && lines.every((line) => (BLOCK_PREFIX.exec(line.text)![2] ?? '') === prefix)
  const changes: ChangeSpec[] = lines.map((line) => {
    const [, lead, heading = ''] = BLOCK_PREFIX.exec(line.text)!
    const from = line.from + lead.length
    return { from, to: from + heading.length, insert: already ? '' : prefix }
  })
  return { changes, userEvent: 'input.format', scrollIntoView: true }
}

/** Format ▸ Block Quote: toggles `> ` on the selected lines. */
export function blockQuoteSpec(state: EditorState): TransactionSpec {
  const lines = selectedLines(state).filter((line, _, all) => all.length === 1 || line.text.trim())
  const quoted = lines.every((line) => /^\s*> ?/.test(line.text))
  const changes: ChangeSpec[] = lines.map((line) => {
    const match = /^(\s*)(> ?)?/.exec(line.text)!
    const from = line.from + match[1].length
    return quoted ? { from, to: from + (match[2]?.length ?? 0) } : { from, insert: '> ' }
  })
  return { changes, userEvent: 'input.format', scrollIntoView: true }
}

/** The innermost `style` span that contains the whole range, if any. */
function enclosingSpan(state: EditorState, from: number, to: number, node: string) {
  let found: { from: number; to: number; open: number; close: number } | null = null
  syntaxTree(state).iterate({
    from,
    to,
    enter(ref) {
      if (ref.name !== node || ref.from > from || ref.to < to) return
      const first = ref.node.firstChild
      const last = ref.node.lastChild
      if (!first || !last || first === last || !first.name.endsWith('Mark') || !last.name.endsWith('Mark')) return
      found = { from: ref.from, to: ref.to, open: first.to - first.from, close: last.to - last.from }
    }
  })
  return found as { from: number; to: number; open: number; close: number } | null
}

/**
 * Format ▸ Font ▸ Bold, Italic…: wraps the selection in the style's markers,
 * or removes them when the selection is already in that style. Without a
 * selection it styles the word under the cursor.
 */
export function inlineStyleSpec(state: EditorState, style: InlineStyle): TransactionSpec {
  const { open, close, node } = MARKERS[style]
  const spec = state.changeByRange((range) => {
    const span = enclosingSpan(state, range.from, range.to, node)
    let changes: ChangeSpec[]
    if (span) {
      changes = [
        { from: span.from, to: span.from + span.open },
        { from: span.to - span.close, to: span.to }
      ]
    } else if (range.empty) {
      const word = state.wordAt(range.head)
      if (!word) {
        return {
          changes: { from: range.head, insert: open + close },
          range: EditorSelection.cursor(range.head + open.length)
        }
      }
      changes = [
        { from: word.from, insert: open },
        { from: word.to, insert: close }
      ]
    } else {
      // Markdown styles don't span lines: wrap the text of each selected line.
      changes = []
      const last = state.doc.lineAt(range.to).number
      for (let n = state.doc.lineAt(range.from).number; n <= last; n++) {
        const line = state.doc.line(n)
        let from = Math.max(range.from, line.from + LINE_PREFIX.exec(line.text)![0].length)
        let to = Math.min(range.to, line.to)
        const text = state.sliceDoc(from, to)
        from += text.length - text.trimStart().length
        to -= text.length - text.trimEnd().length
        if (to <= from) continue
        changes.push({ from, insert: open }, { from: to, insert: close })
      }
    }
    const set = ChangeSet.of(changes, state.doc.length)
    const mapped = range.empty
      ? EditorSelection.cursor(set.mapPos(range.head, 1))
      : EditorSelection.range(set.mapPos(range.anchor, range.anchor <= range.head ? 1 : -1), set.mapPos(range.head, range.anchor <= range.head ? -1 : 1))
    return { changes: set, range: mapped }
  })
  return { ...spec, userEvent: 'input.format', scrollIntoView: true }
}

/**
 * In Vim's normal or visual mode a selection *is* visual mode, so finish like
 * a Vim operator: back in normal mode with the cursor at the styled text.
 */
function run(view: EditorView, spec: TransactionSpec): boolean {
  const cm = getCM(view)
  const vim = cm?.state.vim
  if (vim?.visualMode) Vim.exitVisualMode(cm as Parameters<typeof Vim.exitVisualMode>[0], false)
  view.dispatch(spec)
  if (vim && !vim.insertMode) view.dispatch({ selection: EditorSelection.cursor(view.state.selection.main.from) })
  return true
}

export const setBlockStyle = (view: EditorView, style: BlockStyle): boolean => run(view, blockStyleSpec(view.state, style))
export const toggleBlockQuote = (view: EditorView): boolean => run(view, blockQuoteSpec(view.state))
export const toggleInlineStyle = (view: EditorView, style: InlineStyle): boolean => run(view, inlineStyleSpec(view.state, style))
