import { ChevronLeft, LayoutGrid, List, ListChecks, PanelLeft, Search, Share, SquarePen, Trash2, X } from 'lucide-react'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { editorHandle } from '@/components/editor/editor-handle'
import { toggleList } from '@/components/editor/text-commands'
import { NotesPane } from '@/components/notes/NoteList'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ToolbarButton } from '@/components/ToolbarButton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { deleteNoteWithConfirm } from '@/lib/actions'
import { notesInView } from '@/lib/note-order'
import { findNote, useNotes } from '@/store/notes-store'

export const SEARCH_INPUT_ID = 'notes-search'

/** The three-column Apple Notes window: folders │ notes │ editor. */
export function NotesWindow() {
  const settings = useNotes((s) => s.settings!)
  const galleryOpen = useNotes(
    (s) => s.settings!.viewMode === 'gallery' && s.focusedPane === 'editor' && !!s.selectedNoteId
  )
  const toggleSidebar = (): void => void useNotes.getState().updateSettings({ sidebarVisible: !settings.sidebarVisible })
  const gallery = settings.viewMode === 'gallery'

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {settings.sidebarVisible && (
        <>
          <ResizablePanel id="sidebar" defaultSize={220} minSize={170} maxSize={360} groupResizeBehavior="preserve-pixel-size">
            <Sidebar onToggle={toggleSidebar} />
          </ResizablePanel>
          <ResizableHandle className="bg-notes-separator" />
        </>
      )}
      {!galleryOpen && (
        <ResizablePanel
          id="list"
          defaultSize={gallery ? undefined : 290}
          minSize={gallery ? 300 : 220}
          maxSize={gallery ? undefined : 520}
          groupResizeBehavior={gallery ? 'preserve-relative-size' : 'preserve-pixel-size'}
          className="flex flex-col bg-background"
        >
          <ListToolbar onToggleSidebar={toggleSidebar} />
          <NotesPane />
        </ResizablePanel>
      )}
      {!gallery && <ResizableHandle className="bg-notes-separator" />}
      {(!gallery || galleryOpen) && (
        <ResizablePanel id="editor" minSize={320} className="flex flex-col bg-background">
          <EditorToolbar onToggleSidebar={toggleSidebar} />
          <div className="min-h-0 flex-1">
            <NoteEditor />
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  )
}

function SidebarToggle({ onToggle }: { onToggle: () => void }) {
  const visible = useNotes((s) => s.settings!.sidebarVisible)
  if (visible) return null
  // Leave room for the traffic lights when the sidebar is hidden.
  return (
    <div className="flex shrink-0 items-center pl-[72px]">
      <ToolbarButton icon={PanelLeft} label="Show Folders" shortcut="⌥⌘S" onClick={onToggle} />
    </div>
  )
}

function ListToolbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const library = useNotes((s) => s.library!)
  const selection = useNotes((s) => s.selection)
  const search = useNotes((s) => s.search)
  const viewMode = useNotes((s) => s.settings!.viewMode)
  const selectedNoteId = useNotes((s) => s.selectedNoteId)
  const count = notesInView(library, selection, search).length

  const title = search.trim()
    ? 'Results'
    : selection.kind === 'trash'
      ? 'Recently Deleted'
      : selection.path
        ? selection.path.split('/').pop()
        : 'Notes'

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-center gap-1 pr-2.5">
      <SidebarToggle onToggle={onToggleSidebar} />
      <div className="min-w-0 flex-1 pl-4 leading-tight">
        <div className="truncate text-[13px] font-bold">{title}</div>
        <div className="text-[11px] text-muted-foreground">
          {count} {count === 1 ? 'note' : 'notes'}
        </div>
      </div>
      <ToggleGroup
        type="single"
        size="sm"
        value={viewMode}
        onValueChange={(value) => value && void useNotes.getState().updateSettings({ viewMode: value as 'list' | 'gallery' })}
        className="no-drag"
      >
        <ToggleGroupItem value="list" aria-label="View as List" className="h-7 px-2 text-notes-toolbar-icon">
          <List strokeWidth={1.75} />
        </ToggleGroupItem>
        <ToggleGroupItem value="gallery" aria-label="View as Gallery" className="h-7 px-2 text-notes-toolbar-icon">
          <LayoutGrid strokeWidth={1.75} />
        </ToggleGroupItem>
      </ToggleGroup>
      <ToolbarButton
        icon={Trash2}
        label="Delete"
        shortcut="⌘⌫"
        disabled={!selectedNoteId}
        onClick={() => selectedNoteId && void deleteNoteWithConfirm(selectedNoteId)}
      />
      {viewMode === 'gallery' && (
        <>
          <ToolbarButton icon={SquarePen} label="New Note" shortcut="⌘N" onClick={() => void useNotes.getState().createNote()} />
          <SearchField />
        </>
      )}
    </div>
  )
}

function EditorToolbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const note = useNotes((s) => findNote(s.library, s.selectedNoteId))
  const gallery = useNotes((s) => s.settings!.viewMode === 'gallery')
  const { createNote, setFocusedPane } = useNotes.getState()
  const editable = !!note && note.deletedAt === undefined

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-center gap-1 px-2.5">
      {gallery && (
        <>
          <SidebarToggle onToggle={onToggleSidebar} />
          <ToolbarButton icon={ChevronLeft} label="Back to Gallery" onClick={() => setFocusedPane('list')} />
        </>
      )}
      <ToolbarButton icon={SquarePen} label="New Note" shortcut="⌘N" onClick={() => void createNote()} />
      <ToolbarButton
        icon={ListChecks}
        label="Checklist"
        shortcut="⇧⌘L"
        disabled={!editable}
        onClick={() => editorHandle.view && toggleList(editorHandle.view, 'checklist')}
      />
      <div className="flex-1" />
      <ToolbarButton icon={Share} label="Share" disabled={!note} onClick={() => note && void window.api.shareNote(note.id)} />
      <SearchField />
    </div>
  )
}

function SearchField() {
  const search = useNotes((s) => s.search)
  const { setSearch, setFocusedPane } = useNotes.getState()

  return (
    <div className="no-drag relative ml-1 w-44">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        id={SEARCH_INPUT_ID}
        value={search}
        placeholder="Search"
        spellCheck={false}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSearch('')
            e.currentTarget.blur()
            setFocusedPane('list')
          } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
            setFocusedPane('list')
          } else return
          e.preventDefault()
        }}
        className="h-7 w-full rounded-md border border-transparent bg-accent pr-6 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-notes-accent focus:ring-3 focus:ring-ring/40"
      />
      {search && (
        <button
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/60 text-background"
          onClick={() => setSearch('')}
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
