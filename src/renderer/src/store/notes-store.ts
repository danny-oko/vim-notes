import { create } from 'zustand'
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
  /** Bumped on every focus request so panes re-focus even if already “focused”. */
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
  setFocusedPane(pane: Pane): void
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

  createFolder(): Promise<void>
  renameFolder(path: FolderPath, name: string): Promise<void>
  deleteFolder(path: FolderPath): Promise<void>
}

// Unsaved edits live outside React state: they are an I/O concern, not UI.
const pendingContent = new Map<string, string>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Notes created in this session; if left empty they are discarded on leave. */
const freshNotes = new Set<string>()

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

  async function save(id: string): Promise<void> {
    clearTimeout(saveTimers.get(id))
    saveTimers.delete(id)
    const content = pendingContent.get(id)
    if (content === undefined) return
    pendingContent.delete(id)
    const saved = await attempt(() => api.saveNote(id, content))
    if (!saved) return
    const { library } = get()
    if (!library) return
    // Keep newer keystrokes that arrived while the save was in flight.
    const newer = pendingContent.get(id)
    set({ library: replaceNote(library, newer === undefined ? saved : { ...saved, content: newer }) })
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
        const local = pendingContent.get(note.id)
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

    setFocusedPane: (focusedPane) => set((s) => ({ focusedPane, focusTick: s.focusTick + 1 })),
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
      await save(id)
      const next = neighbourOf(id)
      freshNotes.delete(id)
      try {
        await api.deleteNote(id)
      } catch (error) {
        return get().showError(error)
      }
      if (get().selectedNoteId === id) set({ selectedNoteId: next })
      await get().reload()
    },

    async togglePin(id) {
      const note = findNote(get().library, id)
      if (!note || note.deletedAt) return
      await save(id)
      const updated = await attempt(() => api.setPinned(id, !note.pinned))
      if (updated) set({ library: replaceNote(get().library!, { ...updated, content: findNote(get().library, id)!.content }) })
    },

    async moveNote(id, folder) {
      await save(id)
      const next = neighbourOf(id)
      const moved = await attempt(() => api.moveNote(id, folder))
      if (!moved) return
      if (get().selectedNoteId === id && !get().search) set({ selectedNoteId: next })
      await get().reload()
    },

    async recoverNote(id) {
      const next = neighbourOf(id)
      const recovered = await attempt(() => api.recoverNote(id))
      if (!recovered) return
      if (get().selectedNoteId === id) set({ selectedNoteId: next })
      await get().reload()
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
      if (!name.trim() || name === path.split('/').pop()) return
      await get().flushSaves()
      const folder = await attempt(() => api.renameFolder(path, name))
      if (!folder) return
      const { selection } = get()
      if (selection.kind === 'folder' && (selection.path === path || selection.path.startsWith(path + '/'))) {
        set({ selection: { kind: 'folder', path: folder.path + selection.path.slice(path.length) } })
      }
      await get().reload()
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
