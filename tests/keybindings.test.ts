import { expect, test } from 'bun:test'
import {
  addKeybinding,
  commandForKey,
  compileWhen,
  COMMANDS,
  DEFAULT_KEYBINDINGS,
  displayKey,
  keyFromEvent,
  normalizeKey,
  parseJsonc,
  parseUserKeybindings,
  primaryKey,
  removeKeybinding,
  replaceKeybinding,
  resetKeybindings,
  resolveKeybindings,
  serializeKeybindings,
  startsChord,
  toAccelerator
} from '../src/shared/keybindings'

const event = (code: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}, key = '') => ({
  code,
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
})

test('keys are normalized like VS Code, in any modifier order or spelling', () => {
  expect(normalizeKey('Cmd+Shift+7')).toBe('shift+cmd+7')
  expect(normalizeKey('shift+cmd+7')).toBe('shift+cmd+7')
  expect(normalizeKey('meta+option+control+Up')).toBe('ctrl+alt+cmd+up')
  expect(normalizeKey('⇧+⌘+L')).toBe('shift+cmd+l')
  expect(normalizeKey("cmd+'")).toBe("cmd+'")
  expect(normalizeKey('cmd+plus')).toBe('cmd+=')
  expect(normalizeKey('  cmd+k   cmd+s ')).toBe('cmd+k cmd+s')
  expect(() => normalizeKey('cmd+')).toThrow()
  expect(() => normalizeKey('cmd+shift')).toThrow('no key')
  expect(() => normalizeKey('hyper+a')).toThrow('modifier')
  expect(() => normalizeKey('cmd+ö')).toThrow('unknown key')
  expect(() => normalizeKey('a b c')).toThrow('two parts')
})

test('every default binding is valid and names a real command', () => {
  for (const binding of DEFAULT_KEYBINDINGS) {
    expect(normalizeKey(binding.key)).toBe(binding.key)
    expect(Object.hasOwn(COMMANDS, binding.command)).toBe(true)
    if (binding.when) expect(() => compileWhen(binding.when)).not.toThrow()
  }
})

test('Apple Notes list shortcuts are the defaults', () => {
  const bindings = resolveKeybindings([])
  expect(primaryKey(bindings, 'bulleted-list')).toBe('shift+cmd+7')
  expect(primaryKey(bindings, 'dashed-list')).toBe('shift+cmd+8')
  expect(primaryKey(bindings, 'numbered-list')).toBe('shift+cmd+9')
  expect(primaryKey(bindings, 'checklist')).toBe('shift+cmd+l')
  expect(primaryKey(bindings, 'insert-divider')).toBe('cmd+l')
  expect(primaryKey(bindings, 'toggle-sidebar')).toBe('ctrl+cmd+s')
})

test('key events are read by physical position, so non-Latin layouts work', () => {
  // ⇧⌘7 on ABC types "&", on Mongolian-Cyrillic "7": both are the 7 key.
  expect(keyFromEvent(event('Digit7', { metaKey: true, shiftKey: true }, '&'))).toBe('shift+cmd+7')
  expect(keyFromEvent(event('Digit7', { metaKey: true, shiftKey: true }, '7'))).toBe('shift+cmd+7')
  // ⌘B on a Cyrillic layout reports the letter и.
  expect(keyFromEvent(event('KeyB', { metaKey: true }, 'и'))).toBe('cmd+b')
  expect(keyFromEvent(event('ArrowUp', { metaKey: true, ctrlKey: true }))).toBe('ctrl+cmd+up')
  expect(keyFromEvent(event('Quote', { metaKey: true }, 'э'))).toBe("cmd+'")
  expect(keyFromEvent(event('F5'))).toBe('f5')
  expect(keyFromEvent(event('MetaLeft', { metaKey: true }, 'Meta'))).toBeNull()
  expect(keyFromEvent(event('ShiftLeft', { shiftKey: true }, 'Shift'))).toBeNull()
})

test('keys display with Apple symbols and become Electron accelerators', () => {
  expect(displayKey('shift+cmd+7')).toBe('⇧⌘7')
  expect(displayKey('ctrl+alt+shift+cmd+up')).toBe('⌃⌥⇧⌘↑')
  expect(displayKey('cmd+backspace')).toBe('⌘⌫')
  expect(displayKey('cmd+k cmd+s')).toBe('⌘K ⌘S')
  expect(toAccelerator('shift+cmd+7')).toBe('Shift+Cmd+7')
  expect(toAccelerator('ctrl+cmd+up')).toBe('Ctrl+Cmd+Up')
  expect(toAccelerator("cmd+'")).toBe("Cmd+'")
  expect(toAccelerator('cmd+k cmd+s')).toBeUndefined()
})

test('when clauses support !, &&, ||, ==, != and parentheses', () => {
  const ctx = { editorFocus: true, editorHasSelection: false, vimMode: 'normal', listFocus: false }
  expect(compileWhen(undefined)(ctx)).toBe(true)
  expect(compileWhen('editorFocus')(ctx)).toBe(true)
  expect(compileWhen('!editorFocus')(ctx)).toBe(false)
  expect(compileWhen('editorFocus && editorHasSelection')(ctx)).toBe(false)
  expect(compileWhen('editorHasSelection || editorFocus')(ctx)).toBe(true)
  expect(compileWhen("vimMode == 'normal'")(ctx)).toBe(true)
  expect(compileWhen('vimMode != insert')(ctx)).toBe(true)
  expect(compileWhen('!(listFocus || editorHasSelection) && editorFocus')(ctx)).toBe(true)
  expect(compileWhen('unknownKey')(ctx)).toBe(false)
  expect(() => compileWhen('editorFocus &&')).toThrow()
  expect(() => compileWhen('(editorFocus')).toThrow()
  expect(() => compileWhen('editorFocus $ x')).toThrow()
})

test('⌘B hides the sidebar, or bolds when text is selected in the note', () => {
  const bindings = resolveKeybindings([])
  expect(commandForKey(bindings, 'cmd+b', { editorFocus: true, editorHasSelection: false })).toBe('toggle-list')
  expect(commandForKey(bindings, 'cmd+b', { editorFocus: true, editorHasSelection: true })).toBe('bold')
  expect(commandForKey(bindings, 'cmd+backspace', { inputFocus: true })).toBeNull()
  expect(commandForKey(bindings, 'cmd+backspace', { listFocus: true })).toBe('delete-note')
})

test('keybindings.json is JSON with comments and trailing commas', () => {
  expect(parseJsonc('// hi\n[ /* x */ { "key": "a//b", "command": "c", }, ]')).toEqual([{ key: 'a//b', command: 'c' }])
  expect(parseJsonc('["a \\" // not a comment"]')).toEqual(['a " // not a comment'])
})

test('user entries add, override and remove defaults (VS Code semantics)', () => {
  const { entries, errors, invalid } = parseUserKeybindings(`[
    // bullet on ⇧⌘6, like I'm used to
    { "key": "cmd+shift+6", "command": "bulleted-list" },
    { "key": "cmd+shift+7", "command": "-bulleted-list" },
    { "command": "-print" },
    { "key": "cmd+shift+8", "command": "numbered-list" },
    { "key": "cmd+k cmd+s", "command": "keyboard-shortcuts" },
  ]`)
  expect(errors).toEqual([])
  expect(invalid).toBe(false)
  const bindings = resolveKeybindings(entries)
  const ctx = { editorFocus: true }
  expect(commandForKey(bindings, 'shift+cmd+6', ctx)).toBe('bulleted-list')
  expect(commandForKey(bindings, 'shift+cmd+7', ctx)).toBeNull()
  expect(primaryKey(bindings, 'print')).toBeUndefined()
  // Later entries win over the default dashed list on the same key.
  expect(commandForKey(bindings, 'shift+cmd+8', ctx)).toBe('numbered-list')
  expect(startsChord(bindings, 'cmd+k', ctx)).toBe(true)
  expect(commandForKey(bindings, 'cmd+k cmd+s', ctx)).toBe('keyboard-shortcuts')
  expect(primaryKey(bindings, 'keyboard-shortcuts')).toBe('alt+cmd+,')
})

test('bad entries are reported and skipped; a broken file falls back to defaults', () => {
  const parsed = parseUserKeybindings(`[
    { "key": "cmd+shift+6", "command": "bullet-list" },
    { "key": "cmd+shift+q", "command": "save", "when": "editorFocus &&" },
    { "key": "cmd+nope", "command": "save" },
    { "command": "save" },
    { "key": "cmd+e", "command": "save", "when": "notAThing" },
    { "key": "cmd+j", "command": "find" }
  ]`)
  expect(parsed.invalid).toBe(false)
  expect(parsed.errors).toHaveLength(5)
  expect(parsed.errors[0]).toContain('unknown command "bullet-list"')
  expect(parsed.errors[4]).toContain('"notAThing"')
  // The warning about an unknown context key still keeps the entry.
  expect(parsed.entries.map((e) => e.key)).toEqual(['cmd+e', 'cmd+j'])

  expect(parseUserKeybindings('[ { "key": ').invalid).toBe(true)
  expect(parseUserKeybindings('{ "key": "cmd+a" }').invalid).toBe(true)
  expect(parseUserKeybindings('   ')).toEqual({ entries: [], errors: [], invalid: false })
})

test('edits from the Keyboard Shortcuts window keep keybindings.json minimal', () => {
  const defaults = resolveKeybindings([])
  const bullet = defaults.find((b) => b.command === 'bulleted-list')!

  // Changing a default removes it and adds the new key.
  let user = replaceKeybinding([], bullet, 'shift+cmd+6')
  expect(user).toEqual([
    { key: 'shift+cmd+7', command: '-bulleted-list' },
    { key: 'shift+cmd+6', command: 'bulleted-list' }
  ])
  // Changing it again edits the user entry instead of piling up entries.
  const custom = resolveKeybindings(user).find((b) => b.command === 'bulleted-list')!
  user = replaceKeybinding(user, custom, 'alt+cmd+6')
  expect(user).toEqual([
    { key: 'shift+cmd+7', command: '-bulleted-list' },
    { key: 'alt+cmd+6', command: 'bulleted-list' }
  ])
  // Re-adding the default just drops its removal.
  expect(addKeybinding(user, 'bulleted-list', 'shift+cmd+7')).toEqual([{ key: 'alt+cmd+6', command: 'bulleted-list' }])
  expect(resetKeybindings(user, 'bulleted-list')).toEqual([])

  // Removing a binding with a when clause keeps the clause, so only that binding goes.
  const bold = defaults.find((b) => b.command === 'bold')!
  const withoutBold = removeKeybinding([], bold)
  expect(withoutBold).toEqual([{ key: 'cmd+b', command: '-bold', when: 'editorFocus && editorHasSelection' }])
  expect(commandForKey(resolveKeybindings(withoutBold), 'cmd+b', { editorFocus: true, editorHasSelection: true })).toBe('toggle-list')
})

test('the written file reads back to the same entries', () => {
  const user = [
    { key: 'shift+cmd+7', command: '-bulleted-list' },
    { key: 'shift+cmd+6', command: 'bulleted-list', when: "editorFocus && vimMode != 'insert'" }
  ]
  const text = serializeKeybindings(user)
  expect(text).toContain('// Default shortcuts:')
  expect(parseUserKeybindings(text)).toEqual({ entries: user, errors: [], invalid: false })
  expect(parseUserKeybindings(serializeKeybindings([]))).toEqual({ entries: [], errors: [], invalid: false })
})
