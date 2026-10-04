import { useEffect, useMemo, useRef, useState } from 'react'
import { noteTitle } from '@shared/note-text'
import { NOTE_DRAG_TYPE } from '@/components/sidebar/FolderRow'
import { formatListDate } from '@/lib/dates'
import { flattenSections, notesInView, sectionNotes } from '@/lib/note-order'
import { cn } from '@/lib/utils'
import { useNotes } from '@/store/notes-store'
import { NoteContextMenu } from './NoteContextMenu'
import { useListKeys } from './NoteList'

/** View ▸ as Gallery: notes as thumbnails; opening one shows it full width. */
export function NoteGallery() {
  const library = useNotes((s) => s.library!)
  const settings = useNotes((s) => s.settings!)
  const selection = useNotes((s) => s.selection)
  const search = useNotes((s) => s.search)
  const selectedNoteId = useNotes((s) => s.selectedNoteId)
  const focused = useNotes((s) => s.focusedPane === 'list')
  const focusTick = useNotes((s) => s.focusTick)
  const { selectNote, setFocusedPane } = useNotes.getState()
  const gridRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)

  const sections = useMemo(
    () => sectionNotes(notesInView(library, selection, search), settings),
    [library, selection, search, settings]
  )
  const onKeyDown = useListKeys(flattenSections(sections), columns)

  useEffect(() => {
    const grid = gridRef.current!
    const observer = new ResizeObserver(() => {
      const first = grid.querySelector<HTMLElement>('[data-grid]')
      if (first) setColumns(getComputedStyle(first).gridTemplateColumns.split(' ').length)
    })
    observer.observe(grid)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (focused && !gridRef.current?.contains(document.activeElement)) gridRef.current?.focus()
  }, [focused, focusTick])

  return (
    <div
      ref={gridRef}
      role="listbox"
      aria-label="Notes"
      tabIndex={0}
      onFocus={() => setFocusedPane('list')}
      onKeyDown={(e) => onKeyDown(e, () => setFocusedPane('editor'))}
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 outline-none"
    >
      {sections.length === 0 && <p className="pt-24 text-center text-[15px] text-muted-foreground">No Notes</p>}
      {sections.map((section) => (
        <section key={section.label || 'all'}>
          {section.label && <h3 className="pt-4 pb-2 text-[13px] font-bold">{section.label}</h3>}
          <div data-grid className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4 gap-y-5">
            {section.notes.map((note) => {
              const selected = note.id === selectedNoteId
              const [title, ...body] = note.content.split('\n')
              return (
                <NoteContextMenu key={note.id} note={note}>
                  <div
                    role="option"
                    aria-selected={selected}
                    draggable={note.deletedAt === undefined}
                    onDragStart={(e) => e.dataTransfer.setData(NOTE_DRAG_TYPE, note.id)}
                    onMouseDown={() => selectNote(note.id)}
                    onDoubleClick={() => setFocusedPane('editor')}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        'aspect-[4/3] w-full overflow-hidden rounded-lg border bg-card p-2.5 text-[8px] leading-snug whitespace-pre-wrap shadow-xs',
                        selected && (focused ? 'border-transparent ring-[3px] ring-notes-selection' : 'ring-2 ring-border')
                      )}
                    >
                      <div className="mb-0.5 text-[11px] font-bold">{title}</div>
                      <div className="text-muted-foreground">{body.join('\n').slice(0, 600)}</div>
                    </div>
                    <div
                      className={cn(
                        'max-w-full truncate rounded-md px-1.5 text-xs font-semibold',
                        selected && focused && 'bg-notes-selection text-notes-selection-foreground'
                      )}
                    >
                      {noteTitle(note.content)}
                    </div>
                    <div className="-mt-1 text-[11px] text-muted-foreground">{formatListDate(note.updatedAt)}</div>
                  </div>
                </NoteContextMenu>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
