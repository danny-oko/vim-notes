import { useEffect, useMemo, useRef } from 'react'
import { Folder, Pin } from 'lucide-react'
import { notePreview, noteTitle } from '@shared/note-text'
import type { Note } from '@shared/types'
import { Highlight } from '@/components/Highlight'
import { NOTE_DRAG_TYPE } from '@/components/sidebar/FolderRow'
import { useVimNav } from '@/hooks/use-vim-nav'
import { deleteNoteWithConfirm, focusSearch } from '@/lib/actions'
import { formatListDate } from '@/lib/dates'
import { flattenSections, notesInView, sectionNotes } from '@/lib/note-order'
import { cn } from '@/lib/utils'
import { useNotes } from '@/store/notes-store'
import { NoteContextMenu } from './NoteContextMenu'
import { NoteGallery } from './NoteGallery'

/** Vim/arrow navigation over notes, shared by the list and gallery views. */
export function useNoteNav(notes: Note[], container: React.RefObject<HTMLElement | null>, columns = 1) {
  const selectedNoteId = useNotes((s) => s.selectedNoteId)
  const sidebarVisible = useNotes((s) => s.settings!.sidebarVisible)
  const { selectNote, focusPane, createNote } = useNotes.getState()
  const index = notes.findIndex((n) => n.id === selectedNoteId)
  const select = (i: number): void => {
    const note = notes[Math.min(Math.max(i, 0), notes.length - 1)]
    if (note) selectNote(note.id)
  }

  return useVimNav({
    move: (rows) => select(index + rows * columns),
    jump: (to) => select(to === 'first' ? 0 : notes.length - 1),
    halfPage: () => {
      const row = container.current?.querySelector<HTMLElement>('[role="option"]')?.offsetHeight || 60
      return Math.max(1, Math.floor((container.current?.clientHeight ?? 0) / row / 2))
    },
    sideways: columns > 1 ? (delta) => select(index + delta) : undefined,
    open: () => selectedNoteId && focusPane('editor'),
    back: sidebarVisible ? () => focusPane('sidebar') : undefined,
    search: focusSearch,
    create: () => void createNote(),
    remove: () => selectedNoteId && void deleteNoteWithConfirm(selectedNoteId)
  })
}

export function NotesPane() {
  const viewMode = useNotes((s) => s.settings!.viewMode)
  const isTrash = useNotes((s) => s.selection.kind === 'trash' && !s.search)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {isTrash && (
        <p className="mx-3 mt-2 rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
          Notes are available here for 30 days. After that time, notes will be permanently deleted.
        </p>
      )}
      {viewMode === 'gallery' ? <NoteGallery /> : <NoteList />}
    </div>
  )
}

function NoteList() {
  const library = useNotes((s) => s.library!)
  const settings = useNotes((s) => s.settings!)
  const selection = useNotes((s) => s.selection)
  const search = useNotes((s) => s.search)
  const selectedNoteId = useNotes((s) => s.selectedNoteId)
  const focused = useNotes((s) => s.focusedPane === 'list')
  const focusTick = useNotes((s) => s.focusTick)
  const { selectNote, focusPane, paneFocused } = useNotes.getState()
  const listRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(
    () => sectionNotes(notesInView(library, selection, search), settings),
    [library, selection, search, settings]
  )
  const ordered = useMemo(() => flattenSections(sections), [sections])
  const onKeyDown = useNoteNav(ordered, listRef)
  const showFolder = !!search.trim()
  const folderName = (path: string): string => (path ? path.split('/').pop()! : 'Notes')

  useEffect(() => {
    if (focused && !listRef.current?.contains(document.activeElement)) listRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedNoteId])

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Notes"
      tabIndex={0}
      onFocus={() => paneFocused('list')}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 outline-none"
    >
      {ordered.length === 0 && (
        <p className="pt-24 text-center text-[15px] text-muted-foreground">{search ? 'No Results' : 'No Notes'}</p>
      )}
      {sections.map((section) => (
        <section key={section.label || 'all'}>
          {section.label && (
            <h3 className="sticky top-0 z-10 flex items-center gap-1 bg-background px-2 pt-3.5 pb-1.5 text-[13px] font-bold">
              {section.pinned && <Pin className="size-3.5 fill-current" strokeWidth={1.75} />}
              {section.label}
            </h3>
          )}
          {section.notes.map((note, index) => {
            const selected = note.id === selectedNoteId
            const nextSelected = section.notes[index + 1]?.id === selectedNoteId
            return (
              <NoteContextMenu key={note.id} note={note}>
                <div
                  role="option"
                  aria-selected={selected}
                  draggable={note.deletedAt === undefined}
                  onDragStart={(e) => e.dataTransfer.setData(NOTE_DRAG_TYPE, note.id)}
                  onMouseDown={() => selectNote(note.id)}
                  onDoubleClick={() => focusPane('editor')}
                  className={cn(
                    'relative rounded-md px-4 py-2.5 transition-colors duration-100',
                    selected && (focused ? 'bg-notes-selection text-notes-selection-foreground' : 'bg-notes-selection-inactive')
                  )}
                >
                  <div className="truncate text-[13px] font-semibold">
                    <Highlight text={noteTitle(note.content)} query={search} />
                  </div>
                  <div className="flex gap-1.5 text-[13px]">
                    <span className="shrink-0">{formatListDate(note.deletedAt ?? note.updatedAt)}</span>
                    <span className={cn('truncate', selected && focused ? 'opacity-70' : 'text-muted-foreground')}>
                      <Highlight text={notePreview(note.content)} query={search} />
                    </span>
                  </div>
                  {showFolder && (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Folder className="size-3" strokeWidth={1.75} />
                      {folderName(note.folder)}
                    </div>
                  )}
                  {!selected && !nextSelected && index < section.notes.length - 1 && (
                    <div className="absolute inset-x-4 bottom-0 h-px bg-notes-separator" />
                  )}
                </div>
              </NoteContextMenu>
            )
          })}
        </section>
      ))}
    </div>
  )
}
