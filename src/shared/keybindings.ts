import type { MenuCommand } from './types'

/**
 * Keyboard shortcuts in VS Code's keybindings.json format:
 *
 *   [
 *     { "key": "cmd+shift+6", "command": "bulleted-list" },
 *     { "key": "cmd+shift+7", "command": "-bulleted-list" },
 *     { "key": "cmd+k cmd+s", "command": "keyboard-shortcuts", "when": "!inputFocus" }
 *   ]
 *
 * User entries are added after the defaults; a later entry wins over an
 * earlier one for the same key, and `"-command"` removes a binding. Keys are
 * matched by physical position on a US keyboard, so they work in any layout.
 */
export interface Keybinding {
  key: string
  command: string
  when?: string
}

export interface ResolvedKeybinding {
  /** Canonical form, e.g. `shift+cmd+7` or `cmd+k cmd+s`. */
  key: string
  command: MenuCommand
  when?: string
  source: 'default' | 'user'
}

export interface KeybindingsState {
  /** Absolute path of keybindings.json. */
  path: string
  /** Valid entries from keybindings.json, keys in canonical form. */
  user: Keybinding[]
  /** Defaults with the user entries applied, in priority order (last wins). */
  bindings: ResolvedKeybinding[]
  errors: string[]
  /** The file couldn't be read as a list of entries, so only defaults apply. */
  invalid: boolean
}

export interface CommandInfo {
  title: string
  category: 'File' | 'Edit' | 'Format' | 'Font' | 'View' | 'Vim Notes'
}

/** Every command, in the order shown in Keyboard Shortcuts. */
export const COMMANDS: Record<MenuCommand, CommandInfo> = {
  'new-note': { title: 'New Note', category: 'File' },
  'new-folder': { title: 'New Folder', category: 'File' },
  'pin-note': { title: 'Pin / Unpin Note', category: 'File' },
  'duplicate-note': { title: 'Duplicate Note', category: 'File' },
  save: { title: 'Save', category: 'File' },
  print: { title: 'Print…', category: 'File' },

  undo: { title: 'Undo', category: 'Edit' },
  redo: { title: 'Redo', category: 'Edit' },
  'delete-note': { title: 'Delete Note', category: 'Edit' },
  search: { title: 'Search All Notes', category: 'Edit' },
  find: { title: 'Find in Note', category: 'Edit' },
  'find-next': { title: 'Find Next', category: 'Edit' },
  'find-previous': { title: 'Find Previous', category: 'Edit' },

  'style-title': { title: 'Title', category: 'Format' },
  'style-heading': { title: 'Heading', category: 'Format' },
  'style-subheading': { title: 'Subheading', category: 'Format' },
  'style-body': { title: 'Body', category: 'Format' },
  'style-monostyled': { title: 'Monostyled', category: 'Format' },
  'bulleted-list': { title: 'Bulleted List', category: 'Format' },
  'dashed-list': { title: 'Dashed List', category: 'Format' },
  'numbered-list': { title: 'Numbered List', category: 'Format' },
  'block-quote': { title: 'Block Quote', category: 'Format' },
  checklist: { title: 'Checklist', category: 'Format' },
  'check-item': { title: 'Mark as Checked', category: 'Format' },
  'insert-divider': { title: 'Insert Divider Line', category: 'Format' },
  'move-line-up': { title: 'Move List Item Up', category: 'Format' },
  'move-line-down': { title: 'Move List Item Down', category: 'Format' },
  indent: { title: 'Increase Indentation', category: 'Format' },
  outdent: { title: 'Decrease Indentation', category: 'Format' },
  'toggle-vim': { title: 'Vim Mode', category: 'Format' },

  bold: { title: 'Bold', category: 'Font' },
  italic: { title: 'Italic', category: 'Font' },
  underline: { title: 'Underline', category: 'Font' },
  strikethrough: { title: 'Strikethrough', category: 'Font' },
  highlight: { title: 'Highlight', category: 'Font' },
  'font-bigger': { title: 'Bigger', category: 'Font' },
  'font-smaller': { title: 'Smaller', category: 'Font' },

  'view-list': { title: 'View as List', category: 'View' },
  'view-gallery': { title: 'View as Gallery', category: 'View' },
  'sort-updatedAt': { title: 'Sort by Date Edited', category: 'View' },
  'sort-createdAt': { title: 'Sort by Date Created', category: 'View' },
  'sort-title': { title: 'Sort by Title', category: 'View' },
  'toggle-group-by-date': { title: 'Group by Date', category: 'View' },
  'toggle-sidebar': { title: 'Show / Hide Folders', category: 'View' },
  'toggle-list': { title: 'Show / Hide Sidebar', category: 'View' },
  'focus-explorer': { title: 'Focus Notes List / Folders', category: 'View' },
  'toggle-note-count': { title: 'Show Note Count', category: 'View' },
  'zoom-in': { title: 'Zoom In', category: 'View' },
  'zoom-out': { title: 'Zoom Out', category: 'View' },
  'font-reset': { title: 'Actual Size', category: 'View' },

  settings: { title: 'Settings…', category: 'Vim Notes' },
  'keyboard-shortcuts': { title: 'Keyboard Shortcuts…', category: 'Vim Notes' },
  'open-keybindings-json': { title: 'Open Keyboard Shortcuts (JSON)', category: 'Vim Notes' }
}

export const isCommand = (id: string): id is MenuCommand => Object.hasOwn(COMMANDS, id)

/** Apple Notes' shortcuts, plus a few VS Code-style extras. */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { key: 'cmd+n', command: 'new-note' },
  { key: 'shift+cmd+n', command: 'new-folder' },
  { key: 'cmd+d', command: 'duplicate-note' },
  { key: 'cmd+s', command: 'save' },
  { key: 'cmd+p', command: 'print' },

  { key: 'cmd+z', command: 'undo' },
  { key: 'shift+cmd+z', command: 'redo' },
  // In the note it deletes to the start of the line instead, like Apple Notes.
  { key: 'cmd+backspace', command: 'delete-note', when: '!inputFocus' },
  { key: 'alt+cmd+f', command: 'search' },
  { key: 'cmd+f', command: 'find' },
  { key: 'cmd+g', command: 'find-next' },
  { key: 'shift+cmd+g', command: 'find-previous' },

  { key: 'shift+cmd+t', command: 'style-title' },
  { key: 'shift+cmd+h', command: 'style-heading' },
  { key: 'shift+cmd+j', command: 'style-subheading' },
  { key: 'shift+cmd+b', command: 'style-body' },
  { key: 'shift+cmd+m', command: 'style-monostyled' },
  { key: 'shift+cmd+7', command: 'bulleted-list' },
  { key: 'shift+cmd+8', command: 'dashed-list' },
  { key: 'shift+cmd+9', command: 'numbered-list' },
  { key: "cmd+'", command: 'block-quote' },
  { key: 'shift+cmd+l', command: 'checklist' },
  { key: 'shift+cmd+u', command: 'check-item' },
  { key: 'cmd+l', command: 'insert-divider' },
  { key: 'ctrl+cmd+up', command: 'move-line-up' },
  { key: 'ctrl+cmd+down', command: 'move-line-down' },
  { key: 'cmd+]', command: 'indent' },
  { key: 'cmd+[', command: 'outdent' },
  { key: 'ctrl+cmd+v', command: 'toggle-vim' },

  { key: 'cmd+i', command: 'italic' },
  { key: 'cmd+u', command: 'underline' },
  { key: 'shift+cmd+x', command: 'strikethrough' },
  { key: 'cmd+=', command: 'font-bigger' },
  { key: 'cmd+-', command: 'font-smaller' },

  { key: 'cmd+1', command: 'view-list' },
  { key: 'cmd+2', command: 'view-gallery' },
  { key: 'alt+cmd+s', command: 'toggle-sidebar' },
  { key: 'ctrl+cmd+s', command: 'toggle-sidebar' },
  // VS Code's side bar. With text selected in the note, ⌘B bolds instead (next line wins).
  { key: 'cmd+b', command: 'toggle-list' },
  { key: 'cmd+b', command: 'bold', when: 'editorFocus && editorHasSelection' },
  { key: 'shift+cmd+e', command: 'focus-explorer' },
  { key: 'shift+cmd+.', command: 'zoom-in' },
  { key: 'shift+cmd+,', command: 'zoom-out' },
  { key: 'shift+cmd+0', command: 'font-reset' },

  { key: 'cmd+,', command: 'settings' },
  { key: 'alt+cmd+,', command: 'keyboard-shortcuts' }
]

/** Context keys usable in `when` clauses. */
export const CONTEXT_KEYS: Record<string, string> = {
  editorFocus: 'The note (or its find bar) has keyboard focus',
  editorTextFocus: 'The note text itself has keyboard focus',
  editorHasSelection: 'Text is selected in the note (Vim visual mode counts)',
  inputFocus: 'A text field, such as Search or the find bar, has focus',
  listFocus: 'The notes list or gallery has focus',
  sidebarFocus: 'The folders sidebar has focus',
  noteOpen: 'A note is open',
  vimEnabled: 'Vim mode is on',
  vimMode: "Vim's mode in the note: 'normal', 'insert', 'visual' or 'replace'",
  dialogOpen: 'A dialog is open'
}

export type WhenContext = Record<string, boolean | string | undefined>

/* ── Keys ──────────────────────────────────────────────────────────────── */

const MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'cmd'] as const
type Modifier = (typeof MODIFIER_ORDER)[number]

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  '⌃': 'ctrl',
  shift: 'shift',
  '⇧': 'shift',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  '⌥': 'alt',
  cmd: 'cmd',
  command: 'cmd',
  meta: 'cmd',
  '⌘': 'cmd'
}

const PUNCTUATION = ['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/']
const FUNCTION_KEYS = Array.from({ length: 20 }, (_, i) => `f${i + 1}`)
const NAMED_KEYS = [
  'enter',
  'escape',
  'tab',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  ...FUNCTION_KEYS
]
const VALID_KEYS = new Set([...'abcdefghijklmnopqrstuvwxyz0123456789', ...PUNCTUATION, ...NAMED_KEYS])

const KEY_ALIASES: Record<string, string> = {
  return: 'enter',
  esc: 'escape',
  del: 'delete',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  plus: '=',
  equal: '=',
  minus: '-',
  comma: ',',
  period: '.',
  slash: '/',
  backslash: '\\',
  quote: "'",
  semicolon: ';',
  backquote: '`',
  bracketleft: '[',
  bracketright: ']'
}

/** `KeyboardEvent.code` → key name. Physical position, independent of the layout. */
const CODE_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Space: 'space',
  Backspace: 'backspace',
  Delete: 'delete',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown'
}

/** Normalizes one combination such as `Cmd+Shift+7` to `shift+cmd+7`. */
function parseCombo(text: string): string {
  const parts = text.toLowerCase().split('+').map((part) => part.trim())
  if (parts.some((part) => !part)) throw new Error(`"${text}" is not a valid key`)
  const name = KEY_ALIASES[parts.at(-1)!] ?? parts.at(-1)!
  if (MODIFIER_ALIASES[name]) throw new Error(`"${text}" has no key besides modifiers`)
  if (!VALID_KEYS.has(name)) throw new Error(`unknown key "${parts.at(-1)}" in "${text}"`)
  const modifiers = new Set<Modifier>()
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part]
    if (!modifier) throw new Error(`unknown modifier "${part}" in "${text}"`)
    modifiers.add(modifier)
  }
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), name].join('+')
}

/** Canonical form of a key or chord (`cmd+k cmd+s`); throws on invalid input. */
export function normalizeKey(text: string): string {
  const combos = text.trim().split(/\s+/)
  if (!combos[0]) throw new Error('empty key')
  if (combos.length > 2) throw new Error(`"${text}": chords can have at most two parts`)
  return combos.map(parseCombo).join(' ')
}

export interface KeyEventLike {
  code: string
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** The canonical combination for a keydown, or null for a lone modifier or unknown key. */
export function keyFromEvent(event: KeyEventLike): string | null {
  const code = event.code
  let name: string | undefined
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3).toLowerCase()
  else if (/^Digit\d$/.test(code)) name = code.slice(5)
  else if (/^F\d{1,2}$/.test(code)) name = code.toLowerCase()
  else name = CODE_KEYS[code]
  if (!name) {
    // Unusual keyboards (no `code`): fall back on the character typed.
    const key = KEY_ALIASES[event.key.toLowerCase()] ?? event.key.toLowerCase()
    if (!VALID_KEYS.has(key)) return null
    name = key
  }
  const modifiers: Modifier[] = []
  if (event.ctrlKey) modifiers.push('ctrl')
  if (event.shiftKey) modifiers.push('shift')
  if (event.altKey) modifiers.push('alt')
  if (event.metaKey) modifiers.push('cmd')
  return [...modifiers, name].join('+')
}

const SYMBOLS: Record<string, string> = { ctrl: '⌃', alt: '⌥', shift: '⇧', cmd: '⌘' }
const KEY_SYMBOLS: Record<string, string> = {
  enter: '↩',
  escape: '⎋',
  tab: '⇥',
  space: 'Space',
  backspace: '⌫',
  delete: '⌦',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  home: '↖',
  end: '↘',
  pageup: '⇞',
  pagedown: '⇟'
}

/** `shift+cmd+7` → `⇧⌘7`, in Apple's modifier order (⌃⌥⇧⌘). */
export function displayKey(key: string): string {
  return key
    .split(' ')
    .map((combo) => {
      const parts = combo.split('+')
      const name = parts.pop()!
      const modifiers = ['ctrl', 'alt', 'shift', 'cmd'].filter((m) => parts.includes(m)).map((m) => SYMBOLS[m])
      return modifiers.join('') + (KEY_SYMBOLS[name] ?? name.toUpperCase())
    })
    .join(' ')
}

const ACCELERATOR_KEYS: Record<string, string> = {
  enter: 'Return',
  escape: 'Escape',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}
const ACCELERATOR_MODIFIERS: Record<string, string> = { ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt', cmd: 'Cmd' }

/** Electron menu accelerator for a key, or undefined for chords (menus can't show them). */
export function toAccelerator(key: string): string | undefined {
  if (key.includes(' ')) return undefined
  const parts = key.split('+')
  const name = parts.pop()!
  return [...parts.map((m) => ACCELERATOR_MODIFIERS[m]), ACCELERATOR_KEYS[name] ?? name.toUpperCase()].join('+')
}

/* ── when clauses ──────────────────────────────────────────────────────── */

type Node =
  | { type: 'key'; name: string }
  | { type: 'literal'; value: boolean }
  | { type: 'not'; operand: Node }
  | { type: 'and' | 'or'; left: Node; right: Node }
  | { type: 'equals'; name: string; value: string; negate: boolean }

const TOKEN = /\s*(?:(&&|\|\||==|!=|!|\(|\))|'([^']*)'|"([^"]*)"|([A-Za-z_][\w.-]*))/y

function tokenize(source: string): string[] {
  const tokens: string[] = []
  TOKEN.lastIndex = 0
  let index = 0
  while (index < source.length) {
    if (!source.slice(index).trim()) break
    TOKEN.lastIndex = index
    const match = TOKEN.exec(source)
    if (!match) throw new Error(`unexpected "${source.slice(index).trim()[0]}" in when clause "${source}"`)
    const quoted = match[2] ?? match[3]
    // Quoted strings keep a marker so they can't be mistaken for operators.
    tokens.push(match[1] ?? (quoted !== undefined ? `'${quoted}` : match[4]))
    index = TOKEN.lastIndex
  }
  return tokens
}

function parseWhen(source: string): Node {
  const tokens = tokenize(source)
  let pos = 0
  const peek = (): string | undefined => tokens[pos]
  const fail = (): never => {
    throw new Error(`can't read when clause "${source}"`)
  }
  const isWord = (token: string | undefined): token is string =>
    !!token && !['&&', '||', '==', '!=', '!', '(', ')'].includes(token)

  const or = (): Node => {
    let left = and()
    while (peek() === '||') {
      pos++
      left = { type: 'or', left, right: and() }
    }
    return left
  }
  const and = (): Node => {
    let left = unary()
    while (peek() === '&&') {
      pos++
      left = { type: 'and', left, right: unary() }
    }
    return left
  }
  const unary = (): Node => {
    if (peek() === '!') {
      pos++
      return { type: 'not', operand: unary() }
    }
    if (peek() === '(') {
      pos++
      const inner = or()
      if (tokens[pos++] !== ')') fail()
      return inner
    }
    const token = tokens[pos++]
    if (!isWord(token) || token.startsWith("'")) return fail()
    if (token === 'true' || token === 'false') return { type: 'literal', value: token === 'true' }
    if (peek() === '==' || peek() === '!=') {
      const negate = tokens[pos++] === '!='
      const value = tokens[pos++]
      if (!isWord(value)) return fail()
      return { type: 'equals', name: token, value: value.replace(/^'/, ''), negate }
    }
    return { type: 'key', name: token }
  }

  const tree = or()
  if (pos !== tokens.length) fail()
  return tree
}

function evaluate(node: Node, context: WhenContext): boolean {
  switch (node.type) {
    case 'key':
      return !!context[node.name]
    case 'literal':
      return node.value
    case 'not':
      return !evaluate(node.operand, context)
    case 'and':
      return evaluate(node.left, context) && evaluate(node.right, context)
    case 'or':
      return evaluate(node.left, context) || evaluate(node.right, context)
    case 'equals':
      return (String(context[node.name] ?? '') === node.value) !== node.negate
  }
}

function contextKeysOf(node: Node, keys: Set<string> = new Set()): Set<string> {
  if (node.type === 'key' || node.type === 'equals') keys.add(node.name)
  else if (node.type === 'not') contextKeysOf(node.operand, keys)
  else if (node.type === 'and' || node.type === 'or') {
    contextKeysOf(node.left, keys)
    contextKeysOf(node.right, keys)
  }
  return keys
}

export type WhenFunction = (context: WhenContext) => boolean

const compiled = new Map<string, WhenFunction>()

/** Compiles a VS Code-style when clause (`!`, `&&`, `||`, `==`, `!=`, parentheses); throws on bad syntax. */
export function compileWhen(source: string | undefined): WhenFunction {
  const key = source?.trim() ?? ''
  let fn = compiled.get(key)
  if (!fn) {
    const tree = key ? parseWhen(key) : null
    fn = tree ? (context) => evaluate(tree, context) : () => true
    compiled.set(key, fn)
  }
  return fn
}

/* ── keybindings.json ──────────────────────────────────────────────────── */

/** JSON with comments and trailing commas, as VS Code writes it. */
export function parseJsonc(text: string): unknown {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      const start = i
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      out += text.slice(start, i + 1)
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 1
      out += ' '
    } else out += char
  }
  // Trailing commas: `[1, 2,]` and `{ "a": 1, }`.
  return JSON.parse(out.replace(/,(\s*[\]}])/g, '$1'))
}

export interface ParsedKeybindings {
  entries: Keybinding[]
  errors: string[]
  invalid: boolean
}

/** Reads keybindings.json. Bad entries are reported and skipped, like VS Code does. */
export function parseUserKeybindings(text: string): ParsedKeybindings {
  if (!text.trim()) return { entries: [], errors: [], invalid: false }
  let data: unknown
  try {
    data = parseJsonc(text)
  } catch (error) {
    return { entries: [], errors: [`keybindings.json isn't valid JSON: ${(error as Error).message}`], invalid: true }
  }
  if (!Array.isArray(data)) {
    return { entries: [], errors: ['keybindings.json must be a list: [ { "key": …, "command": … } ]'], invalid: true }
  }

  const entries: Keybinding[] = []
  const errors: string[] = []
  data.forEach((raw, index) => {
    const label = `Entry ${index + 1}`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return void errors.push(`${label} isn't an object.`)
    const { key, command, when } = raw as Record<string, unknown>
    if (typeof command !== 'string' || !command) return void errors.push(`${label} needs a "command".`)
    const removal = command.startsWith('-')
    const id = removal ? command.slice(1) : command
    if (!isCommand(id)) return void errors.push(`${label}: unknown command "${id}".`)
    if (when !== undefined && typeof when !== 'string') return void errors.push(`${label}: "when" must be a string.`)

    let normalized = ''
    if (key !== undefined || !removal) {
      if (typeof key !== 'string') return void errors.push(`${label} (${command}) needs a "key".`)
      try {
        normalized = normalizeKey(key)
      } catch (error) {
        return void errors.push(`${label} (${command}): ${(error as Error).message}.`)
      }
    }
    if (when?.trim()) {
      try {
        compileWhen(when)
      } catch (error) {
        return void errors.push(`${label} (${command}): ${(error as Error).message}.`)
      }
      const unknown = [...contextKeysOf(parseWhen(when.trim()))].filter((name) => !Object.hasOwn(CONTEXT_KEYS, name))
      if (unknown.length) errors.push(`${label} (${command}): unknown context key ${unknown.map((n) => `"${n}"`).join(', ')} is always false.`)
    }
    entries.push({ key: normalized, command, ...(when?.trim() ? { when: when.trim() } : {}) })
  })
  return { entries, errors, invalid: false }
}

const sameWhen = (a?: string, b?: string): boolean => (a?.trim() ?? '') === (b?.trim() ?? '')

/** Defaults followed by the user's entries; `-command` entries remove earlier matches. */
export function resolveKeybindings(user: Keybinding[], defaults: Keybinding[] = DEFAULT_KEYBINDINGS): ResolvedKeybinding[] {
  let result: ResolvedKeybinding[] = defaults.map((binding) => ({
    key: normalizeKey(binding.key),
    command: binding.command as MenuCommand,
    ...(binding.when ? { when: binding.when } : {}),
    source: 'default'
  }))
  for (const entry of user) {
    if (entry.command.startsWith('-')) {
      const command = entry.command.slice(1)
      result = result.filter(
        (b) => !(b.command === command && (!entry.key || b.key === entry.key) && (entry.when === undefined || sameWhen(b.when, entry.when)))
      )
    } else {
      result.push({ key: entry.key, command: entry.command as MenuCommand, ...(entry.when ? { when: entry.when } : {}), source: 'user' })
    }
  }
  return result
}

/** The command a key runs in this context: the last matching binding wins. */
export function commandForKey(bindings: ResolvedKeybinding[], key: string, context: WhenContext): MenuCommand | null {
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i]
    if (binding.key === key && compileWhen(binding.when)(context)) return binding.command
  }
  return null
}

/** Whether `key` starts a chord that could still complete in this context. */
export function startsChord(bindings: ResolvedKeybinding[], key: string, context: WhenContext): boolean {
  return bindings.some((b) => b.key.startsWith(`${key} `) && compileWhen(b.when)(context))
}

/** The shortcut shown for a command in menus and tooltips: its last single-key binding. */
export function primaryKey(bindings: ResolvedKeybinding[], command: MenuCommand): string | undefined {
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i]
    if (binding.command === command && !binding.key.includes(' ')) return binding.key
  }
  return undefined
}

/* ── Edits made in the Keyboard Shortcuts window ───────────────────────── */

/** Adds `key` for `command`, undoing an earlier removal of the same default instead when there was one. */
export function addKeybinding(user: Keybinding[], command: MenuCommand, key: string, when?: string): Keybinding[] {
  const removal = user.findIndex((e) => e.command === `-${command}` && e.key === key && sameWhen(e.when, when))
  if (removal >= 0) return user.filter((_, i) => i !== removal)
  return [...user, { key, command, ...(when ? { when } : {}) }]
}

export function removeKeybinding(user: Keybinding[], binding: ResolvedKeybinding): Keybinding[] {
  if (binding.source === 'user') {
    let index = -1
    user.forEach((e, i) => {
      if (e.command === binding.command && e.key === binding.key && sameWhen(e.when, binding.when)) index = i
    })
    if (index >= 0) return user.filter((_, i) => i !== index)
  }
  return [...user, { key: binding.key, command: `-${binding.command}`, ...(binding.when ? { when: binding.when } : {}) }]
}

export function replaceKeybinding(user: Keybinding[], binding: ResolvedKeybinding, key: string): Keybinding[] {
  return addKeybinding(removeKeybinding(user, binding), binding.command, key, binding.when)
}

/** Back to the default shortcuts for one command. */
export function resetKeybindings(user: Keybinding[], command: MenuCommand): Keybinding[] {
  return user.filter((e) => e.command !== command && e.command !== `-${command}`)
}

const entryJson = (entry: Keybinding): string => {
  const fields = [`"key": ${JSON.stringify(entry.key)}`, `"command": ${JSON.stringify(entry.command)}`]
  if (entry.when) fields.push(`"when": ${JSON.stringify(entry.when)}`)
  return `  { ${fields.join(', ')} }`
}

/** The text of keybindings.json, with the defaults listed underneath for reference. */
export function serializeKeybindings(user: Keybinding[]): string {
  const defaults = DEFAULT_KEYBINDINGS.map((b) => `//${entryJson({ ...b, key: normalizeKey(b.key) }).slice(1)}`)
  const contexts = Object.entries(CONTEXT_KEYS).map(([name, about]) => `//   ${name.padEnd(20)} ${about}`)
  return [
    '// Vim Notes keyboard shortcuts, in the same format as VS Code\'s keybindings.json.',
    '// Entries here are added after the defaults (the last match wins); "-command" removes a default.',
    '// Keys: ctrl, shift, alt (option), cmd + a key, e.g. "cmd+shift+7"; chords like "cmd+k cmd+s".',
    '// Keys are matched by position on a US keyboard, so they work in every keyboard layout.',
    '// Changes apply as soon as you save. Edits made in Vim Notes ▸ Keyboard Shortcuts rewrite this file.',
    '[',
    user.map(entryJson).join(',\n'),
    ']',
    '',
    '// Default shortcuts:',
    ...defaults,
    '//',
    '// Commands without a default shortcut:',
    ...Object.keys(COMMANDS)
      .filter((id) => !DEFAULT_KEYBINDINGS.some((b) => b.command === id))
      .map((id) => `//   ${id}`),
    '//',
    '// Context keys for "when" (combine with !, &&, ||, == and !=):',
    ...contexts,
    ''
  ]
    .filter((line, i, lines) => !(line === '' && lines[i - 1] === '['))
    .join('\n')
}
