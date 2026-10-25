import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MenuCommand, NotesApi } from '@shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: NotesApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseNotesDir: () => ipcRenderer.invoke('settings:chooseDir'),
  defaultNotesDir: () => ipcRenderer.invoke('settings:defaultDir'),
  revealNotesDir: () => ipcRenderer.invoke('settings:reveal'),

  loadLibrary: () => ipcRenderer.invoke('library:load'),
  createNote: (folder, content) => ipcRenderer.invoke('note:create', folder, content),
  saveNote: (id, content) => ipcRenderer.invoke('note:save', id, content),
  moveNote: (id, folder) => ipcRenderer.invoke('note:move', id, folder),
  setPinned: (id, pinned) => ipcRenderer.invoke('note:pin', id, pinned),
  deleteNote: (id) => ipcRenderer.invoke('note:delete', id),
  discardIfEmpty: (id) => ipcRenderer.invoke('note:discard', id),
  recoverNote: (id) => ipcRenderer.invoke('note:recover', id),
  revealNote: (id) => ipcRenderer.invoke('note:reveal', id),
  shareNote: (id) => ipcRenderer.invoke('note:share', id),

  createFolder: (parent, name) => ipcRenderer.invoke('folder:create', parent, name),
  renameFolder: (path, name) => ipcRenderer.invoke('folder:rename', path, name),
  deleteFolder: (path) => ipcRenderer.invoke('folder:delete', path),

  onLibraryChanged: (listener) => subscribe('library:changed', listener),
  onMenuCommand: (listener) => subscribe<MenuCommand>('menu', listener),
  onMenuAccelerator: (listener) => subscribe<string>('menu:accelerator', listener),

  getKeybindings: () => ipcRenderer.invoke('keybindings:get'),
  setUserKeybindings: (entries) => ipcRenderer.invoke('keybindings:set', entries),
  openKeybindingsFile: () => ipcRenderer.invoke('keybindings:open'),
  onKeybindingsChanged: (listener) => subscribe('keybindings:changed', listener),
  syncMenuState: (state) => ipcRenderer.send('menu:sync', state)
}

contextBridge.exposeInMainWorld('api', api)
