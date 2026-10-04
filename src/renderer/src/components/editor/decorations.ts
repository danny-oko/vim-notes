import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view'

function linePlugin(build: (view: EditorView) => DecorationSet) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = build(view)
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view)
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}

const titleLine = Decoration.line({ class: 'cm-title-line' })
const checkedLine = Decoration.line({ class: 'cm-checked-line' })
const CHECKED_ITEM = /^\s*- \[[xX]\] /

/** “New notes start with: Title” — the first line is rendered as a big bold title. */
export const titleLineStyle = linePlugin(() => {
  const builder = new RangeSetBuilder<Decoration>()
  builder.add(0, 0, titleLine)
  return builder.finish()
})

/** Checked checklist items are dimmed and struck through, like in Apple Notes. */
export const checkedItemStyle = linePlugin((view) => {
  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      if (CHECKED_ITEM.test(line.text)) builder.add(line.from, line.from, checkedLine)
      pos = line.to + 1
    }
  }
  return builder.finish()
})
