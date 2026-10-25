import type { Keybinding, KeybindingsState } from './keybindings'

/** Folder path relative to the notes root. `""` is the root ("Notes") folder. */
export type FolderPath = string

export interface Note {
  /** Stable for the lifetime of the app session, even across file renames. */
  id: string
  folder: FolderPath
  /** File name on disk, e.g. `Groceries.txt`. */
  fileName: string
  content: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  /** Set only for notes inside Recently Deleted. */
  deletedAt?: number
  /** Folder the note lived in before being deleted. */
  originalFolder?: FolderPath
}

export interface Folder {
  path: FolderPath
  name: string
  /** Nesting depth; 0 for top-level folders. */
  depth: number
}

export interface Library {
  root: string
  folders: Folder[]
  notes: Note[]
  trash: Note[]
}

export type SortBy = 'updatedAt' | 'createdAt' | 'title'
export type ViewMode = 'list' | 'gallery'
export type NoteExtension = '.txt' | '.md'

export interface Settings {
  notesDir: string | null
  extension: NoteExtension
  sortBy: SortBy
  groupByDate: boolean
  /** "New notes start with: Title" — renders the first line as a title. */
  firstLineIsTitle: boolean
  fontSize: number
  vimEnabled: boolean
  sidebarVisible: boolean
  /** Folders + notes list, toggled together with ⌘B like VS Code's side bar. */
  listVisible: boolean
  /** Widths in pixels, remembered across hiding/showing and restarts. */
  sidebarWidth: number
  listWidth: number
  showNoteCount: boolean
  viewMode: ViewMode
}

export const DEFAULT_SETTINGS: Settings = {
  notesDir: null,
  extension: '.txt',
  sortBy: 'updatedAt',
  groupByDate: true,
  firstLineIsTitle: true,
  fontSize: 15,
  vimEnabled: true,
  sidebarVisible: true,
  listVisible: true,
  sidebarWidth: 220,
  listWidth: 290,
  showNoteCount: true,
  viewMode: 'list'
}

/** Commands sent from the native application menu to the renderer. */
export type MenuCommand =
  | 'new-note'
  | 'save'
  | 'new-folder'
  | 'duplicate-note'
  | 'delete-note'
  | 'pin-note'
  | 'toggle-sidebar'
  | 'focus-explorer'
  | 'toggle-list'
  | 'view-list'
  | 'view-gallery'
  | 'search'
  | 'find'
  | 'find-next'
  | 'find-previous'
  | 'style-title'
  | 'style-heading'
  | 'style-subheading'
  | 'style-body'
  | 'style-monostyled'
  | 'block-quote'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'highlight'
  | 'checklist'
  | 'check-item'
  | 'bulleted-list'
  | 'dashed-list'
  | 'numbered-list'
  | 'insert-divider'
  | 'move-line-up'
  | 'move-line-down'
  | 'indent'
  | 'outdent'
  | 'font-bigger'
  | 'font-smaller'
  | 'zoom-in'
  | 'zoom-out'
  | 'font-reset'
  | 'sort-updatedAt'
  | 'sort-createdAt'
  | 'sort-title'
  | 'toggle-group-by-date'
  | 'toggle-note-count'
  | 'toggle-vim'
  | 'settings'
  | 'keyboard-shortcuts'
  | 'open-keybindings-json'
  | 'undo'
  | 'redo'
  | 'print'

export type MenuState = Pick<
  Settings,
  'sortBy' | 'groupByDate' | 'viewMode' | 'vimEnabled' | 'sidebarVisible' | 'listVisible' | 'showNoteCount'
> & { hasNote: boolean; notePinned: boolean }

export interface NotesApi {
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  chooseNotesDir(): Promise<string | null>
  defaultNotesDir(): Promise<string>
  revealNotesDir(): Promise<void>

  loadLibrary(): Promise<Library>
  createNote(folder: FolderPath, content?: string): Promise<Note>
  saveNote(id: string, content: string): Promise<Note>
  moveNote(id: string, folder: FolderPath): Promise<Note>
  setPinned(id: string, pinned: boolean): Promise<Note>
  deleteNote(id: string): Promise<void>
  /** Erases a note that was created but never written in, like Apple Notes does. */
  discardIfEmpty(id: string): Promise<boolean>
  recoverNote(id: string): Promise<Note>
  revealNote(id: string): Promise<void>
  shareNote(id: string): Promise<void>

  createFolder(parent: FolderPath, name: string): Promise<Folder>
  renameFolder(path: FolderPath, name: string): Promise<Folder>
  deleteFolder(path: FolderPath): Promise<void>

  onLibraryChanged(listener: (library: Library) => void): () => void
  onMenuCommand(listener: (command: MenuCommand) => void): () => void
  /**
   * A menu item fired by its key equivalent rather than a click. The renderer
   * owns keyboard shortcuts, so it decides what the key does (see keybindings.ts).
   */
  onMenuAccelerator(listener: (key: string) => void): () => void

  getKeybindings(): Promise<KeybindingsState>
  /** Rewrites keybindings.json with these user entries (from Keyboard Shortcuts). */
  setUserKeybindings(entries: Keybinding[]): Promise<KeybindingsState>
  /** Opens keybindings.json in the default editor for JSON files. */
  openKeybindingsFile(): Promise<void>
  onKeybindingsChanged(listener: (state: KeybindingsState) => void): () => void
  /** Keeps native menu checkmarks in sync with renderer state. */
  syncMenuState(state: MenuState): void
}
