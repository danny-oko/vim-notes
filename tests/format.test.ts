import { expect, test } from 'bun:test'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { blockQuoteSpec, blockStyleSpec, inlineStyleSpec, type InlineStyle } from '../src/renderer/src/components/editor/format-commands'
import { noteLanguage } from '../src/renderer/src/components/editor/rich-text'
import { noteTitle, notePreview } from '../src/shared/note-text'

/** `|` marks the cursor, `«` `»` a selection. */
function stateOf(text: string): EditorState {
  const cursor = text.indexOf('|')
  const from = text.indexOf('«')
  const doc = text.replace(/[|«»]/g, '')
  const selection =
    cursor >= 0 ? EditorSelection.cursor(cursor) : EditorSelection.range(from, text.indexOf('»') - 1)
  const state = EditorState.create({ doc, selection, extensions: [noteLanguage] })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

function show(state: EditorState): string {
  const { from, to, empty } = state.selection.main
  const doc = state.doc.toString()
  return empty ? doc.slice(0, from) + '|' + doc.slice(from) : doc.slice(0, from) + '«' + doc.slice(from, to) + '»' + doc.slice(to)
}

const inline = (text: string, style: InlineStyle): string => {
  const state = stateOf(text)
  return show(state.update(inlineStyleSpec(state, style)).state)
}
const block = (text: string, style: Parameters<typeof blockStyleSpec>[1]): string => {
  const state = stateOf(text)
  return show(state.update(blockStyleSpec(state, style)).state)
}

test('font styles wrap the selection and keep it selected', () => {
  expect(inline('make «this» bold', 'bold')).toBe('make **«this»** bold')
  expect(inline('make «this» slanted', 'italic')).toBe('make *«this»* slanted')
  expect(inline('«under»', 'underline')).toBe('<u>«under»</u>')
  expect(inline('«gone»', 'strikethrough')).toBe('~~«gone»~~')
  expect(inline('«see»', 'highlight')).toBe('==«see»==')
  expect(inline('run «ls»', 'monostyled')).toBe('run `«ls»`')
})

test('applying a style again removes it', () => {
  expect(inline('make **«this»** bold', 'bold')).toBe('make «this» bold')
  expect(inline('a **wo|rd** here', 'bold')).toBe('a wo|rd here')
  expect(inline('<u>«under»</u>', 'underline')).toBe('«under»')
  expect(inline('***«both»***', 'italic')).toBe('**«both»**')
})

test('without a selection the word under the cursor is styled', () => {
  expect(inline('a wo|rd here', 'italic')).toBe('a *wo|rd* here')
  expect(inline('end |', 'bold')).toBe('end **|**')
})

test('multi-line selections style each line’s text, not list markers', () => {
  expect(inline('- [ ] «milk\n- [ ] eggs»', 'bold')).toBe('- [ ] **«milk**\n- [ ] **eggs»**')
  expect(inline('«# Title  \n\nbody»', 'italic')).toBe('«# *Title*  \n\n*body»*')
})

test('paragraph styles set the heading level', () => {
  expect(block('Shop|ping', 'title')).toBe('# Shop|ping')
  expect(block('# Shop|ping', 'heading')).toBe('## Shop|ping')
  expect(block('### Shop|ping', 'body')).toBe('Shop|ping')
  expect(block('## Shop|ping', 'heading')).toBe('Shop|ping')
  expect(block('> quo|te', 'subheading')).toBe('> ### quo|te')
})

test('block quote toggles', () => {
  const state = stateOf('«one\ntwo»')
  const quoted = state.update(blockQuoteSpec(state)).state
  expect(quoted.doc.toString()).toBe('> one\n> two')
  expect(quoted.update(blockQuoteSpec(quoted)).state.doc.toString()).toBe('one\ntwo')
})

test('titles and previews read without markup', () => {
  expect(noteTitle('# **Trip** plan\n> pack *light*')).toBe('Trip plan')
  expect(notePreview('# Trip\n> pack *light* and <u>early</u>')).toBe('pack light and early')
})
