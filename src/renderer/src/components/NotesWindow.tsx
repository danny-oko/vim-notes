import { useEffect, useRef, useState } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import type { MenuCommand } from '@shared/types'
import { ChevronLeft, LayoutGrid, List, ListChecks, PanelLeft, Search, Share, SquarePen, Trash2, X } from 'lucide-react'
import { NoteEditor } from '@/components/editor/NoteEditor'
import { editorHandle } from '@/components/editor/editor-handle'
import { toggleList } from '@/components/editor/text-commands'
import { NotesPane } from '@/components/notes/NoteList'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ToolbarButton } from '@/components/ToolbarButton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { deleteNoteWithConfirm, SEARCH_INPUT_ID } from '@/lib/actions'
import { notesInView } from '@/lib/note-order'
import { cn } from '@/lib/utils'
import { findNote, useNotes } from '@/store/notes-store'

/** The three-column Apple Notes window: folders │ notes │ editor. */
export function NotesWindow() {
  const settings = useNotes((s) => s.settings!)
  const galleryOpen = useNotes(
    (s) => s.settings!.viewMode === 'gallery' && s.focusedPane === 'editor' && !!s.selectedNoteId
  )
  const { updateSettings } = useNotes.getState()
  const gallery = settings.viewMode === 'gallery'
  // ⌘B hides folders + list together; in gallery view the notes are the main content.
  const listShown = gallery || settings.listVisible
  const sidebarShown = settings.sidebarVisible && listShown

  const sidebar = useAnimatedPanel(sidebarShown, settings.sidebarWidth, {
    onToggle: (shown) => listShown && void updateSettings({ sidebarVisible: shown }),
    onWidth: (sidebarWidth) => void updateSettings({ sidebarWidth })
  })
  const list = useAnimatedPanel(listShown, settings.listWidth, {
    onToggle: (shown) => !gallery && void updateSettings({ listVisible: shown }),
    onWidth: (listWidth) => !gallery && void updateSettings({ listWidth })
  })
  // Fixed after mount: changing a panel's defaultSize later makes the layout re-validate.
  const [initial] = useState(() => ({
    sidebar: sidebarShown ? settings.sidebarWidth : 0,
    list: listShown ? settings.listWidth : 0
  }))

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className={cn('h-full', (sidebar.animating || list.animating) && 'animate-panels')}
    >
      <ResizablePanel
        id="sidebar"
        panelRef={sidebar.ref}
        defaultSize={initial.sidebar}
        minSize={170}
        maxSize={360}
        collapsible
        collapsedSize={0}
        groupResizeBehavior="preserve-pixel-size"
        onResize={sidebar.onResize}
      >
        {/* Fixed min width so the sidebar slides instead of reflowing while animating. */}
        <div className="h-full min-w-[170px]">
          <Sidebar onToggle={() => void updateSettings({ sidebarVisible: false })} />
        </div>
      </ResizablePanel>
      <ResizableHandle className={cn('bg-notes-separator', !sidebarShown && 'opacity-0')} />
      {!galleryOpen && (
        <ResizablePanel
          id="list"
          panelRef={list.ref}
          defaultSize={gallery ? undefined : initial.list}
          minSize={gallery ? 300 : 220}
          maxSize={gallery ? undefined : 520}
          collapsible={!gallery}
          collapsedSize={0}
          groupResizeBehavior={gallery ? 'preserve-relative-size' : 'preserve-pixel-size'}
          onResize={list.onResize}
        >
          <div className={cn('flex h-full flex-col bg-background', !gallery && 'min-w-[220px]')}>
            <ListToolbar />
            <NotesPane />
          </div>
        </ResizablePanel>
      )}
      {!gallery && <ResizableHandle className={cn('bg-notes-separator', !listShown && 'opacity-0')} />}
      {(!gallery || galleryOpen) && (
        <ResizablePanel id="editor" minSize={320} className="flex flex-col bg-background">
          <EditorToolbar />
          <div className="min-h-0 flex-1">
            <NoteEditor />
          </div>
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  )
}

const PANEL_ANIMATION_MS = 220
const SAVE_WIDTH_DELAY_MS = 300

interface PanelCallbacks {
  /** The user dragged the panel closed or open. */
  onToggle(shown: boolean): void
  /** The user resized the panel; persisted so it survives hiding and restarts. */
  onWidth(width: number): void
}

/**
 * Shows/hides a side panel with a short slide, like Apple Notes, reopening it
 * at the width the user last chose. The width transition is only enabled while
 * toggling, so dragging a divider and resizing the window stay immediate.
 */
function useAnimatedPanel(visible: boolean, width: number, callbacks: PanelCallbacks) {
  const ref = useRef<PanelImperativeHandle | null>(null)
  const [animating, setAnimating] = useState(false)
  // Resize reports during the slide are animation frames, not user drags.
  const animatingRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef({ width, callbacks })
  // eslint-disable-next-line react-hooks/refs -- read only by the effect and resize handler
  latest.current = { width, callbacks }

  useEffect(() => {
    const panel = ref.current
    if (!panel || panel.isCollapsed() === !visible) return
    animatingRef.current = true
    setAnimating(true)
    // Let the transition class apply before the size changes.
    const frame = requestAnimationFrame(() => (visible ? panel.resize(latest.current.width) : panel.collapse()))
    const timer = setTimeout(() => {
      animatingRef.current = false
      setAnimating(false)
    }, PANEL_ANIMATION_MS + 50)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      animatingRef.current = false
    }
  }, [visible])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  const onResize = (size: { inPixels: number }): void => {
    if (animatingRef.current) return
    const shown = size.inPixels > 0
    if (shown !== visible) return latest.current.callbacks.onToggle(shown)
    const pixels = Math.round(size.inPixels)
    if (!shown || pixels === latest.current.width) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => latest.current.callbacks.onWidth(pixels), SAVE_WIDTH_DELAY_MS)
  }

  return { ref, animating, onResize }
}

/** Re-opens a hidden panel; leaves room for the traffic lights when nothing is on the left. */
function ShowPanelButton({ label, command, onClick }: { label: string; command: MenuCommand; onClick: () => void }) {
  return (
    <div className="flex shrink-0 items-center pl-[72px]">
      <ToolbarButton icon={PanelLeft} label={label} command={command} onClick={onClick} />
    </div>
  )
}

function ListToolbar() {
  const library = useNotes((s) => s.library!)
  const selection = useNotes((s) => s.selection)
  const search = useNotes((s) => s.search)
  const viewMode = useNotes((s) => s.settings!.viewMode)
  const selectedNoteId = useNotes((s) => s.selectedNoteId)
  const sidebarVisible = useNotes((s) => s.settings!.sidebarVisible)
  const { updateSettings } = useNotes.getState()
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
      {!sidebarVisible && (
        <ShowPanelButton label="Show Folders" command="toggle-sidebar" onClick={() => void updateSettings({ sidebarVisible: true })} />
      )}
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
        command="delete-note"
        disabled={!selectedNoteId}
        onClick={() => selectedNoteId && void deleteNoteWithConfirm(selectedNoteId)}
      />
      {viewMode === 'gallery' && (
        <>
          <ToolbarButton icon={SquarePen} label="New Note" command="new-note" onClick={() => void useNotes.getState().createNote()} />
          <SearchField />
        </>
      )}
    </div>
  )
}

function EditorToolbar() {
  const note = useNotes((s) => findNote(s.library, s.selectedNoteId))
  const gallery = useNotes((s) => s.settings!.viewMode === 'gallery')
  const listVisible = useNotes((s) => s.settings!.listVisible)
  const sidebarVisible = useNotes((s) => s.settings!.sidebarVisible)
  const { createNote, focusPane, updateSettings } = useNotes.getState()
  const editable = !!note && note.deletedAt === undefined

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-center gap-1 px-2.5">
      {!gallery && !listVisible && <ShowPanelButton label="Show Sidebar" command="toggle-list" onClick={() => useNotes.getState().toggleList()} />}
      {gallery && (
        <>
          {!sidebarVisible && (
            <ShowPanelButton label="Show Folders" command="toggle-sidebar" onClick={() => void updateSettings({ sidebarVisible: true })} />
          )}
          <ToolbarButton icon={ChevronLeft} label="Back to Gallery" onClick={() => focusPane('list')} />
        </>
      )}
      <ToolbarButton icon={SquarePen} label="New Note" command="new-note" onClick={() => void createNote()} />
      <ToolbarButton
        icon={ListChecks}
        label="Checklist"
        command="checklist"
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
  const { setSearch, focusPane } = useNotes.getState()

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
            focusPane('list')
          } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
            focusPane('list')
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
