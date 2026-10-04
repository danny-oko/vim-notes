import { expect, test } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { tidyNote } from '../src/shared/note-text'
import { tidyChanges } from '../src/renderer/src/components/editor/text-commands'

test('editor tidy matches tidyNote', () => {
  const alphabet = [' ', '\t', '\n', '\n', 'a', 'б']
  for (let i = 0; i < 20000; i++) {
    const length = Math.floor(Math.random() * 14)
    const text = Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
    const state = EditorState.create({ doc: text })
    const result = state.update({ changes: tidyChanges(state) }).state.doc.toString()
    if (result !== tidyNote(text)) throw new Error(`mismatch for ${JSON.stringify(text)}: ${JSON.stringify(result)} vs ${JSON.stringify(tidyNote(text))}`)
  }
  expect(tidyNote('\n\n  Title  \nbody \t\n\n\n')).toBe('  Title\nbody')
})
