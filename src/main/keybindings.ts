import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  parseUserKeybindings,
  resolveKeybindings,
  serializeKeybindings,
  type Keybinding,
  type KeybindingsState
} from '@shared/keybindings'

const WATCH_DEBOUNCE_MS = 100

const keybindingsFile = (): string => join(app.getPath('userData'), 'keybindings.json')

let cache: KeybindingsState | null = null

function load(): KeybindingsState {
  const path = keybindingsFile()
  let text = ''
  const errors: string[] = []
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(`Can't read keybindings.json: ${(error as Error).message}`)
  }
  const parsed = parseUserKeybindings(text)
  return {
    path,
    user: parsed.entries,
    bindings: resolveKeybindings(parsed.entries),
    errors: [...errors, ...parsed.errors],
    invalid: parsed.invalid
  }
}

export function getKeybindings(): KeybindingsState {
  return (cache ??= load())
}

function write(entries: Keybinding[]): void {
  const path = keybindingsFile()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeKeybindings(entries))
}

/** Saves edits from the Keyboard Shortcuts window. Never overwrites a file the user broke by hand. */
export function setUserKeybindings(entries: Keybinding[]): KeybindingsState {
  const current = load()
  if (current.invalid) throw new Error('keybindings.json has errors. Fix them in the file first.')
  // Round-trip through the parser so only valid entries reach the file.
  const checked = parseUserKeybindings(JSON.stringify(entries))
  write(checked.entries)
  return (cache = load())
}

/** Opens keybindings.json in the default editor for JSON (VS Code, if installed), else TextEdit. */
export async function openKeybindingsFile(): Promise<void> {
  const path = keybindingsFile()
  if (!existsSync(path)) write([])
  const error = await shell.openPath(path)
  if (error) execFile('open', ['-t', path])
}

/** Applies edits to keybindings.json as soon as it's saved, from any editor. */
export function watchKeybindings(onChange: (state: KeybindingsState) => void): FSWatcher {
  const path = keybindingsFile()
  mkdirSync(dirname(path), { recursive: true })
  let timer: NodeJS.Timeout | undefined
  // Watch the folder: editors often save by replacing the file.
  return watch(dirname(path), (_event, file) => {
    if (file !== 'keybindings.json') return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const next = load()
      if (JSON.stringify(next) === JSON.stringify(cache)) return
      cache = next
      onChange(next)
    }, WATCH_DEBOUNCE_MS)
  })
}
