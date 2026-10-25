import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'
import type { MarkdownConfig } from '@lezer/markdown'
import { Strikethrough } from '@lezer/markdown'

/**
 * Note styles are stored as plain Markdown, so files stay readable anywhere:
 *
 *   # Title   ## Heading   ### Subheading   > Block quote
 *   **bold**  *italic*  <u>underline</u>  ~~strikethrough~~  ==highlight==  `monostyled`
 *
 * The editor renders them in place and hides the markup, except on the lines
 * the cursor is on, so Vim motions always see and edit the real text.
 */

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\p{P}\p{S}]/u

/** `<u>underline</u>`, as understood by GitHub, Obsidian and most Markdown viewers. */
const Underline: MarkdownConfig = {
  defineNodes: ['Underline', 'UnderlineMark'],
  parseInline: [
    {
      name: 'Underline',
      parse(cx, next, pos) {
        if (next !== 60 /* < */) return -1
        if (cx.slice(pos, pos + 3).toLowerCase() === '<u>') return cx.addDelimiter(UnderlineDelim, pos, pos + 3, true, false)
        if (cx.slice(pos, pos + 4).toLowerCase() === '</u>') return cx.addDelimiter(UnderlineDelim, pos, pos + 4, false, true)
        return -1
      },
      before: 'HTMLTag'
    }
  ]
}
const UnderlineDelim = { resolve: 'Underline', mark: 'UnderlineMark' }

/** `==highlight==`, like Obsidian and Bear. */
const Highlight: MarkdownConfig = {
  defineNodes: ['Highlight', 'HighlightMark'],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1
        const before = cx.slice(pos - 1, pos)
        const after = cx.slice(pos + 2, pos + 3)
        const spaceBefore = /\s|^$/.test(before)
        const spaceAfter = /\s|^$/.test(after)
        const punctBefore = PUNCTUATION.test(before)
        const punctAfter = PUNCTUATION.test(after)
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter)
        )
      },
      after: 'Emphasis'
    }
  ]
}
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' }

/**
 * Notes are mostly prose, so leave out Markdown that misfires on plain text:
 * four-space indents aren't code, and a line of `---` doesn't make the line
 * above it a heading.
 */
const NotesFlavour: MarkdownConfig = {
  remove: ['IndentedCode', 'SetextHeading', 'HTMLBlock', 'LinkReference']
}

export const noteLanguage = markdown({
  extensions: [Strikethrough, Underline, Highlight, NotesFlavour],
  addKeymap: false,
  completeHTMLTags: false,
  pasteURLAsLink: false
})

/** Inline styles: syntax node → CSS class. */
const INLINE_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-bold',
  Emphasis: 'cm-italic',
  Underline: 'cm-underline',
  Strikethrough: 'cm-strike',
  Highlight: 'cm-highlight',
  InlineCode: 'cm-monostyled'
}
const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: 'cm-h1',
  ATXHeading2: 'cm-h2',
  ATXHeading3: 'cm-h3',
  ATXHeading4: 'cm-h4',
  ATXHeading5: 'cm-h4',
  ATXHeading6: 'cm-h4'
}
const MARKUP = new Set(['EmphasisMark', 'UnderlineMark', 'StrikethroughMark', 'HighlightMark', 'HeaderMark', 'QuoteMark', 'CodeMark'])

const markCache = new Map<string, Decoration>()
const mark = (cls: string): Decoration => {
  let deco = markCache.get(cls)
  if (!deco) markCache.set(cls, (deco = Decoration.mark({ class: cls })))
  return deco
}
const lineCache = new Map<string, Decoration>()
const line = (cls: string): Decoration => {
  let deco = lineCache.get(cls)
  if (!deco) lineCache.set(cls, (deco = Decoration.line({ class: cls })))
  return deco
}
const hidden = Decoration.replace({})
const dimmed = Decoration.mark({ class: 'cm-markup' })

/** Line numbers touched by a selection range; their markup stays visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) lines.add(n)
  }
  return lines
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const active = activeLines(state)
  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(state)

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const name = node.name
        if (name === 'FencedCode') {
          for (let pos = node.from; pos <= node.to; ) {
            const l = state.doc.lineAt(pos)
            decorations.push(line('cm-code-block').range(l.from))
            pos = l.to + 1
          }
          // Code is shown as typed, fences included.
          return false
        }
        if (name === 'HorizontalRule') {
          // Format ▸ Divider Line: a rule, showing the `---` only while editing that line.
          const l = state.doc.lineAt(node.from)
          if (active.has(l.number)) decorations.push(dimmed.range(node.from, node.to))
          else decorations.push(line('cm-divider').range(l.from), hidden.range(node.from, node.to))
          return false
        }
        const heading = HEADING_CLASS[name]
        if (heading) return void decorations.push(line(heading).range(state.doc.lineAt(node.from).from))
        if (name === 'Blockquote') {
          for (let pos = node.from; pos <= node.to; ) {
            const l = state.doc.lineAt(pos)
            decorations.push(line('cm-quote').range(l.from))
            pos = l.to + 1
          }
          return
        }
        const cls = INLINE_CLASS[name]
        if (cls && node.to > node.from) return void decorations.push(mark(cls).range(node.from, node.to))
        if (MARKUP.has(name)) {
          if (name === 'CodeMark' && node.node.parent?.name !== 'InlineCode') return
          let end = node.to
          // `# ` and `> `: hide the space after the marker too.
          if ((name === 'HeaderMark' || name === 'QuoteMark') && state.sliceDoc(end, end + 1) === ' ') end++
          const lineNumber = state.doc.lineAt(node.from).number
          if (active.has(lineNumber)) decorations.push(dimmed.range(node.from, end))
          else if (end > node.from) decorations.push(hidden.range(node.from, end))
        }
      }
    })
  }
  return Decoration.set(decorations, true)
}

const richTextDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = buildDecorations(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

export function richText(): Extension {
  return [noteLanguage, richTextDecorations]
}
