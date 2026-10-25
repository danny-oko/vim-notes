import { app, BrowserWindow, dialog, ipcMain, shell, ShareMenu } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import type { Keybinding } from '@shared/keybindings'
import type { FolderPath, MenuState, Settings } from '@shared/types'
import { getKeybindings, openKeybindingsFile, setUserKeybindings, watchKeybindings } from './keybindings'
import { NoteLibrary } from './library'
import { buildMenu } from './menu'
import { getSettings, updateSettings } from './settings'

const WATCH_DEBOUNCE_MS = 250

let library: NoteLibrary | null = null
let watcher: FSWatcher | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function requireLibrary(): NoteLibrary {
  if (!library) throw new Error('Choose a folder for your notes first.')
  return library
}

/** Re-points the app at the configured notes directory. */
function openLibrary(dir: string | null): void {
  watcher?.close()
  watcher = null
  library = dir ? new NoteLibrary(dir, () => getSettings().extension) : null
}

/** Pushes a fresh snapshot to the UI whenever files change outside the app. */
function watchLibrary(current: NoteLibrary): void {
  let timer: NodeJS.Timeout | undefined
  watcher = watch(current.root, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (library === current) broadcast('library:changed', await current.load())
    }, WATCH_DEBOUNCE_MS)
  })
}

export const defaultNotesDir = (): string => join(app.getPath('documents'), 'Vim Notes')

export function registerIpc(): void {
  openLibrary(getSettings().notesDir)

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const before = getSettings().notesDir
    const next = updateSettings(patch)
    if (next.notesDir !== before) openLibrary(next.notesDir)
    return next
  })
  ipcMain.handle('settings:chooseDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose where to keep your notes',
      buttonLabel: 'Use This Folder',
      defaultPath: getSettings().notesDir ?? defaultNotesDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('settings:defaultDir', () => defaultNotesDir())
  ipcMain.handle('settings:reveal', () => {
    const dir = getSettings().notesDir
    if (dir) shell.openPath(dir)
  })

  ipcMain.handle('library:load', async () => {
    const lib = requireLibrary()
    const result = await lib.load() // creates the directory if needed
    if (!watcher) watchLibrary(lib)
    return result
  })
  ipcMain.handle('note:create', (_e, folder: FolderPath, content?: string) => requireLibrary().createNote(folder, content))
  ipcMain.handle('note:save', (_e, id: string, content: string) => requireLibrary().saveNote(id, content))
  ipcMain.handle('note:move', (_e, id: string, folder: FolderPath) => requireLibrary().moveNote(id, folder))
  ipcMain.handle('note:pin', (_e, id: string, pinned: boolean) => requireLibrary().setPinned(id, pinned))
  ipcMain.handle('note:delete', (_e, id: string) => requireLibrary().deleteNote(id))
  ipcMain.handle('note:discard', (_e, id: string) => requireLibrary().discardIfEmpty(id))
  ipcMain.handle('note:recover', (_e, id: string) => requireLibrary().recoverNote(id))
  ipcMain.handle('note:reveal', async (_e, id: string) => {
    shell.showItemInFolder((await requireLibrary().noteInfo(id)).path)
  })
  ipcMain.handle('note:share', async (e, id: string) => {
    const { note } = await requireLibrary().noteInfo(id)
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    new ShareMenu({ texts: [note.content] }).popup({ window: win })
  })

  ipcMain.handle('folder:create', (_e, parent: FolderPath, name: string) => requireLibrary().createFolder(parent, name))
  ipcMain.handle('folder:rename', (_e, path: FolderPath, name: string) => requireLibrary().renameFolder(path, name))
  ipcMain.handle('folder:delete', (_e, path: FolderPath) =>
    requireLibrary().deleteFolder(path, (abs) => shell.trashItem(abs))
  )

  ipcMain.on('menu:sync', (_e, state: MenuState) => buildMenu(state))

  ipcMain.handle('keybindings:get', () => getKeybindings())
  ipcMain.handle('keybindings:set', (_e, entries: Keybinding[]) => {
    const state = setUserKeybindings(entries)
    buildMenu()
    broadcast('keybindings:changed', state)
    return state
  })
  ipcMain.handle('keybindings:open', () => openKeybindingsFile())
  watchKeybindings((state) => {
    buildMenu()
    broadcast('keybindings:changed', state)
  })
}
