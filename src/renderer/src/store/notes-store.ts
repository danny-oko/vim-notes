import { create } from 'zustand'
import { tidyNote } from '@shared/note-text'
import type { FolderPath, Library, Note, Settings } from '@shared/types'
import { flattenSections, notesInView, sectionNotes, type Selection } from '@/lib/note-order'

const api = window.api
const SAVE_DELAY_MS = 400

export type Pane = 'sidebar' | 'list' | 'editor'

interface NotesState {
  settings: Settings | null
  library: Library | null
  selection: Selection
  selectedNoteId: string | null
  search: string
  focusedPane: Pane
  /** Bumped on every focusPane() request; panes move focus only when it changes. */
  focusTick: number
  /** Folder whose name is being edited inline in the sidebar. */
  editingFolder: FolderPath | null
  /** Note that should open in Vim insert mode once the editor shows it. */
  startInsertFor: string | null
  error: string | null

  init(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  setNotesDir(dir: string): Promise<void>
  reload(): Promise<void>
  applyLibrary(library: Library): void

  selectFolder(selection: Selection): void
  selectNote(id: string | null): void
  setSearch(query: string): void
  /** Explicitly moves keyboard focus to a pane (keyboard shortcuts, :q, …). */
  focusPane(pane: Pane): void
  /** Records that a pane received focus by itself (click, Tab). Never moves focus. */
  paneFocused(pane: Pane): void
  setEditingFolder(path: FolderPath | null): void
  consumeStartInsert(): void
  showError(error: unknown): void
  dismissError(): void

  createNote(): Promise<void>
  editNote(id: string, content: string): void
  flushSaves(): Promise<void>
  duplicateNote(id: string): Promise<void>
  deleteNote(id: string): Promise<void>
  togglePin(id: string): Promise<void>
  moveNote(id: string, folder: FolderPath): Promise<void>
  recoverNote(id: string): Promise<void>

  /** ⌘Z / ⇧⌘Z outside the editor: undo/redo note deletes, moves, pins, folder renames. */
  undoFileOperation(): Promise<void>
  redoFileOperation(): Promise<void>
  /** ⇧⌘E: cycle focus editor → notes list → folders → editor. */
  focusExplorer(): void
  /** ⌘B: show or hide the folders and notes list together. */
  toggleList(): void

  createFolder(): Promise<void>
  renameFolder(path: FolderPath, name: string): Promise<void>
  deleteFolder(path: FolderPath): Promise<void>
}

// Unsaved edits live outside React state: they are an I/O concern, not UI.
const pendingContent = new Map<string, string>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
/**
 * Files are written tidied (see tidyNote) while the editor keeps exactly what
 * was typed, so a fresh blank line doesn't vanish under the cursor. Remember
 * both so the disk snapshot isn't mistaken for an outside edit.
 */
const lastWritten = new Map<string, { typed: string; onDisk: string }>()
/** Notes created in this session; if left empty they are discarded on leave. */
const freshNotes = new Set<string>()

/** An undoable change to files and folders (not to note text). */
interface FileOperation {
  undo(): Promise<void>
  redo(): Promise<void>
}
const fileUndoStack: FileOperation[] = []
const fileRedoStack: FileOperation[] = []
const MAX_FILE_UNDO = 100

function recordFileOperation(operation: FileOperation): void {
  fileUndoStack.push(operation)
  if (fileUndoStack.length > MAX_FILE_UNDO) fileUndoStack.shift()
  fileRedoStack.length = 0
}

const ROOT: Selection = { kind: 'folder', path: '' }

export function findNote(library: Library | null, id: string | null): Note | undefined {
  if (!library || !id) return undefined
  return library.notes.find((n) => n.id === id) ?? library.trash.find((n) => n.id === id)
}

/** The notes in the order they appear in the list. */
export function visibleNotes(state: Pick<NotesState, 'library' | 'settings' | 'selection' | 'search'>): Note[] {
  if (!state.library || !state.settings) return []
  return flattenSections(sectionNotes(notesInView(state.library, state.selection, state.search), state.settings))
}

function replaceNote(library: Library, note: Note): Library {
  const swap = (list: Note[]): Note[] => list.map((n) => (n.id === note.id ? note : n))
  return { ...library, notes: swap(library.notes), trash: swap(library.trash) }
}

export const useNotes = create<NotesState>()((set, get) => {
  async function attempt<T>(task: () => Promise<T>): Promise<T | undefined> {
    try {
      return await task()
    } catch (error) {
      get().showError(error)
      return undefined
    }
  }

  /** Runs `task`, reporting errors to the user. Returns whether it succeeded. */
  async function succeeds(task: () => Promise<unknown>): Promise<boolean> {
    try {
      await task()
      return true
    } catch (error) {
      get().showError(error)
      return false
    }
  }

  async function save(id: string): Promise<void> {
    clearTimeout(saveTimers.get(id))
    saveTimers.delete(id)
    const content = pendingContent.get(id)
    if (content === undefined) return
    pendingContent.delete(id)
    const saved = await attempt(() => api.saveNote(id, tidyNote(content)))
    if (!saved) return
    lastWritten.set(id, { typed: content, onDisk: saved.content })
    const { library } = get()
    if (!library) return
    // Keep newer keystrokes that arrived while the save was in flight.
    const newer = pendingContent.get(id)
    set({ library: replaceNote(library, { ...saved, content: newer ?? content }) })
  }

  /** Leaving an untouched new note removes it, as in Apple Notes. */
  async function discardIfUntouched(id: string | null): Promise<void> {
    if (!id || !freshNotes.has(id)) return
    const note = findNote(get().library, id)
    if (!note || note.content.trim()) return
    freshNotes.delete(id)
    await save(id)
    if (await attempt(() => api.discardIfEmpty(id))) {
      const { library } = get()
      if (library) set({ library: { ...library, notes: library.notes.filter((n) => n.id !== id) } })
    }
  }

  /** Picks the neighbour of `id` so the selection doesn't jump after a delete or move. */
  function neighbourOf(id: string): string | null {
    const list = visibleNotes(get())
    const index = list.findIndex((n) => n.id === id)
    return (list[index + 1] ?? list[index - 1])?.id ?? null
  }

  /** Moves a note to Recently Deleted (or erases it there). Returns false on failure. */
  async function removeNote(id: string): Promise<boolean> {
    await save(id)
    const next = neighbourOf(id)
    freshNotes.delete(id)
    if (!(await succeeds(() => api.deleteNote(id)))) return false
    if (get().selectedNoteId === id) set({ selectedNoteId: next })
    await get().reload()
    return true
  }

  async function relocateNote(id: string, folder: FolderPath): Promise<boolean> {
    await save(id)
    const next = neighbourOf(id)
    if (!(await attempt(() => api.moveNote(id, folder)))) return false
    if (get().selectedNoteId === id && !get().search) set({ selectedNoteId: next })
    await get().reload()
    return true
  }

  /** Renames a folder and keeps the selection inside it. Returns the new path. */
  async function renameFolderOnDisk(path: FolderPath, name: string): Promise<FolderPath | undefined> {
    await get().flushSaves()
    const folder = await attempt(() => api.renameFolder(path, name))
    if (!folder) return undefined
    const { selection } = get()
    if (selection.kind === 'folder' && (selection.path === path || selection.path.startsWith(path + '/'))) {
      set({ selection: { kind: 'folder', path: folder.path + selection.path.slice(path.length) } })
    }
    await get().reload()
    return folder.path
  }

  /** After an undo, show the restored note where it now lives. */
  async function reveal(id: string): Promise<void> {
    await get().reload()
    const note = get().library?.notes.find((n) => n.id === id)
    if (!note) return
    if (!get().search) set({ selection: { kind: 'folder', path: note.folder } })
    set({ selectedNoteId: id })
  }

  return {
    settings: null,
    library: null,
    selection: ROOT,
    selectedNoteId: null,
    search: '',
    focusedPane: 'list',
    focusTick: 0,
    editingFolder: null,
    startInsertFor: null,
    error: null,

    async init() {
      const settings = await api.getSettings()
      set({ settings })
      if (settings.notesDir) await get().reload()
      api.onLibraryChanged((library) => get().applyLibrary(library))
    },

    async updateSettings(patch) {
      const current = get().settings
      if (current) set({ settings: { ...current, ...patch } })
      const settings = await attempt(() => api.updateSettings(patch))
      if (settings) set({ settings })
    },

    async setNotesDir(dir) {
      await get().flushSaves()
      await get().updateSettings({ notesDir: dir })
      set({ library: null, selection: ROOT, selectedNoteId: null, search: '' })
      await get().reload()
    },

    async reload() {
      const library = await attempt(() => api.loadLibrary())
      if (library) get().applyLibrary(library)
    },

    applyLibrary(incoming) {
      // Local edits that haven't reached the disk yet win over the snapshot.
      const keepLocal = (note: Note): Note => {
        const written = lastWritten.get(note.id)
        const local = pendingContent.get(note.id) ?? (written?.onDisk === note.content ? written.typed : undefined)
        return local === undefined ? note : { ...note, content: local }
      }
      const library = { ...incoming, notes: incoming.notes.map(keepLocal) }
      const { selection, selectedNoteId } = get()
      const folderGone = selection.kind === 'folder' && selection.path !== '' && !library.folders.some((f) => f.path === selection.path)
      set({ library, selection: folderGone ? ROOT : selection })
      if (!findNote(library, selectedNoteId)) set({ selectedNoteId: visibleNotes(get())[0]?.id ?? null })
    },

    selectFolder(selection) {
      const { selectedNoteId } = get()
      set({ selection, search: '', editingFolder: null })
      void discardIfUntouched(selectedNoteId)
      set({ selectedNoteId: visibleNotes(get())[0]?.id ?? null })
    },

    selectNote(id) {
      const previous = get().selectedNoteId
      if (previous === id) return
      set({ selectedNoteId: id })
      void discardIfUntouched(previous)
    },

    setSearch(search) {
      set({ search })
      const list = visibleNotes(get())
      if (!list.some((n) => n.id === get().selectedNoteId)) set({ selectedNoteId: list[0]?.id ?? null })
    },

    focusPane: (focusedPane) => set((s) => ({ focusedPane, focusTick: s.focusTick + 1 })),
    paneFocused: (focusedPane) => get().focusedPane !== focusedPane && set({ focusedPane }),
    setEditingFolder: (editingFolder) => set({ editingFolder }),
    consumeStartInsert: () => set({ startInsertFor: null }),
    showError: (error) => set({ error: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error) }),
    dismissError: () => set({ error: null }),

    async createNote() {
      const state = get()
      if (!state.library) return
      const folder = state.selection.kind === 'folder' ? state.selection.path : ''
      const note = await attempt(() => api.createNote(folder))
      if (!note) return
      freshNotes.add(note.id)
      const library = get().library!
      set({
        library: { ...library, notes: [note, ...library.notes] },
        selection: { kind: 'folder', path: folder },
        search: '',
        focusedPane: 'editor',
        startInsertFor: note.id
      })
      get().selectNote(note.id)
    },

    editNote(id, content) {
      const { library } = get()
      const note = findNote(library, id)
      if (!library || !note || note.deletedAt || note.content === content) return
      if (tidyNote(content) === tidyNote(note.content)) {
        // Only trailing spaces or edge blank lines changed: the file stays as it is,
        // and the note shouldn't jump to the top of the list.
        if (pendingContent.has(id)) pendingContent.set(id, content)
        else lastWritten.set(id, { typed: content, onDisk: tidyNote(content) })
        return set({ library: replaceNote(library, { ...note, content }) })
      }
      pendingContent.set(id, content)
      if (content.trim()) freshNotes.delete(id)
      set({ library: replaceNote(library, { ...note, content, updatedAt: Date.now() }) })
      clearTimeout(saveTimers.get(id))
      saveTimers.set(id, setTimeout(() => void save(id), SAVE_DELAY_MS))
    },

    async flushSaves() {
      await Promise.all([...pendingContent.keys()].map(save))
    },

    async duplicateNote(id) {
      const note = findNote(get().library, id)
      if (!note || note.deletedAt) return
      await save(id)
      const copy = await attempt(() => api.createNote(note.folder, note.content))
      if (!copy) return
      const library = get().library!
      set({ library: { ...library, notes: [copy, ...library.notes] } })
      get().selectNote(copy.id)
    },

    async deleteNote(id) {
      const note = findNote(get().library, id)
      if (!note) return
      // Erasing from Recently Deleted is permanent (the user confirmed it).
      if (note.deletedAt !== undefined) return void (await removeNote(id))
      if (!(await removeNote(id))) return
      const wasPinned = note.pinned
      recordFileOperation({
        undo: async () => {
          await api.recoverNote(id)
          if (wasPinned) await api.setPinned(id, true)
          await reveal(id)
        },
        redo: async () => void (await removeNote(id))
      })
    },

    async togglePin(id) {
      const note = findNote(get().library, id)
      if (!note || note.deletedAt) return
      const flip = async (): Promise<void> => {
        await save(id)
        const current = findNote(get().library, id)
        if (!current) return
        const updated = await api.setPinned(id, !current.pinned)
        set({ library: replaceNote(get().library!, { ...updated, content: current.content }) })
      }
      if (!(await succeeds(flip))) return
      recordFileOperation({ undo: flip, redo: flip })
    },

    async moveNote(id, folder) {
      const from = findNote(get().library, id)?.folder
      if (from === undefined || from === folder) return
      if (!(await relocateNote(id, folder))) return
      recordFileOperation({
        undo: async () => {
          await api.moveNote(id, from)
          await reveal(id)
        },
        redo: async () => void (await relocateNote(id, folder))
      })
    },

    async recoverNote(id) {
      const next = neighbourOf(id)
      const recovered = await attempt(() => api.recoverNote(id))
      if (!recovered) return
      if (get().selectedNoteId === id) set({ selectedNoteId: next })
      await get().reload()
      recordFileOperation({
        undo: async () => void (await removeNote(id)),
        redo: async () => {
          await api.recoverNote(id)
          await get().reload()
        }
      })
    },

    async undoFileOperation() {
      const operation = fileUndoStack.pop()
      if (!operation) return
      if (!(await succeeds(operation.undo))) return
      fileRedoStack.push(operation)
      await get().reload()
    },

    async redoFileOperation() {
      const operation = fileRedoStack.pop()
      if (!operation) return
      if (!(await succeeds(operation.redo))) return
      fileUndoStack.push(operation)
      await get().reload()
    },

    focusExplorer() {
      const { focusedPane, settings, selectedNoteId } = get()
      if (!settings) return
      // Cycle editor → notes list → folders → editor, revealing hidden panels on the way.
      const order: Pane[] = ['list', 'sidebar', 'editor']
      let target = order[(order.indexOf(focusedPane) + 1) % order.length]
      if (target === 'editor' && !selectedNoteId) target = 'list'
      const patch: Partial<Settings> = {}
      if (target !== 'editor' && !settings.listVisible) patch.listVisible = true
      if (target === 'sidebar' && !settings.sidebarVisible) patch.sidebarVisible = true
      if (Object.keys(patch).length) void get().updateSettings(patch)
      get().focusPane(target)
    },

    toggleList() {
      const { settings, focusedPane } = get()
      if (!settings) return
      // In gallery view the notes are the main content, so only the folders hide.
      if (settings.viewMode === 'gallery') return void get().updateSettings({ sidebarVisible: !settings.sidebarVisible })
      const listVisible = !settings.listVisible
      void get().updateSettings({ listVisible })
      if (!listVisible && focusedPane !== 'editor') get().focusPane('editor')
    },

    async createFolder() {
      const folder = await attempt(() => api.createFolder('', 'New Folder'))
      if (!folder) return
      await get().reload()
      get().selectFolder({ kind: 'folder', path: folder.path })
      set({ editingFolder: folder.path, focusedPane: 'sidebar' })
    },

    async renameFolder(path, name) {
      set({ editingFolder: null })
      const oldName = path.split('/').pop()!
      if (!name.trim() || name === oldName) return
      const renamed = await renameFolderOnDisk(path, name)
      if (!renamed) return
      let current = renamed
      recordFileOperation({
        undo: async () => void (current = (await renameFolderOnDisk(current, oldName)) ?? current),
        redo: async () => void (current = (await renameFolderOnDisk(current, name)) ?? current)
      })
    },

    async deleteFolder(path) {
      await get().flushSaves()
      await attempt(() => api.deleteFolder(path))
      const { selection } = get()
      if (selection.kind === 'folder' && (selection.path === path || selection.path.startsWith(path + '/'))) {
        get().selectFolder(ROOT)
      }
      await get().reload()
    }
  }
})

// Flush unsaved edits when the window closes.
window.addEventListener('beforeunload', () => void useNotes.getState().flushSaves())
