import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CirclePlus, PanelLeft } from 'lucide-react'
import type { Folder } from '@shared/types'
import { ToolbarButton } from '@/components/ToolbarButton'
import { useVimNav } from '@/hooks/use-vim-nav'
import { deleteFolderWithConfirm, focusSearch } from '@/lib/actions'
import type { Selection } from '@/lib/note-order'
import { cn } from '@/lib/utils'
import { useNotes } from '@/store/notes-store'
import { FolderRow } from './FolderRow'

const isSameSelection = (a: Selection, b: Selection): boolean =>
  a.kind === b.kind && (a.kind === 'trash' || a.path === (b as { path: string }).path)

/** Folders whose ancestors are all expanded. */
function visibleFolders(folders: Folder[], collapsed: Set<string>): Folder[] {
  return folders.filter((folder) => {
    const parts = folder.path.split('/')
    return parts.slice(0, -1).every((_, i) => !collapsed.has(parts.slice(0, i + 1).join('/')))
  })
}

export function Sidebar({ onToggle }: { onToggle: () => void }) {
  const library = useNotes((s) => s.library!)
  const selection = useNotes((s) => s.selection)
  const focused = useNotes((s) => s.focusedPane === 'sidebar')
  const showCount = useNotes((s) => s.settings!.showNoteCount)
  const focusTick = useNotes((s) => s.focusTick)
  const { selectFolder, focusPane, paneFocused, createFolder, setEditingFolder } = useNotes.getState()
  const [collapsed, setCollapsed] = useState(new Set<string>())
  const [sectionOpen, setSectionOpen] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const note of library.notes) map.set(note.folder, (map.get(note.folder) ?? 0) + 1)
    return map
  }, [library.notes])

  const folders = visibleFolders(library.folders, collapsed)
  const items: Selection[] = [
    { kind: 'folder', path: '' },
    ...folders.map((f): Selection => ({ kind: 'folder', path: f.path })),
    ...(library.trash.length ? [{ kind: 'trash' } as Selection] : [])
  ]

  useEffect(() => {
    if (focused && !listRef.current?.contains(document.activeElement)) listRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick])

  const toggleCollapsed = (path: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const index = items.findIndex((item) => isSameSelection(item, selection))
  const selectedFolder = selection.kind === 'folder' && selection.path ? selection.path : null
  const onKeyDown = useVimNav({
    move: (delta) => selectFolder(items[Math.min(Math.max(index + delta, 0), items.length - 1)]),
    jump: (to) => selectFolder(items[to === 'first' ? 0 : items.length - 1]),
    open: () => focusPane('list'),
    search: focusSearch,
    create: () => void createFolder(),
    rename: selectedFolder ? () => setEditingFolder(selectedFolder) : undefined,
    remove: selectedFolder ? () => void deleteFolderWithConfirm(selectedFolder) : undefined
  })

  const hasChildren = (path: string): boolean => library.folders.some((f) => f.path.startsWith(path + '/'))

  return (
    <aside className="flex h-full flex-col bg-notes-sidebar">
      <div className="drag-region flex h-[52px] shrink-0 items-center pl-[84px]">
        <ToolbarButton icon={PanelLeft} label="Hide Folders" shortcut="⌥⌘S" onClick={onToggle} />
      </div>

      <div
        ref={listRef}
        role="tree"
        aria-label="Folders"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => paneFocused('sidebar')}
        className="flex-1 overflow-y-auto px-2.5 pb-2 outline-none"
      >
        <button
          className="group flex w-full items-center justify-between px-2 pt-1 pb-1 text-[11px] font-semibold text-muted-foreground"
          onClick={() => setSectionOpen((open) => !open)}
        >
          On My Mac
          <ChevronDown
            className={cn('size-3.5 opacity-0 transition group-hover:opacity-100', !sectionOpen && '-rotate-90')}
          />
        </button>

        {sectionOpen && (
          <>
            <FolderRow
              kind="notes"
              name="Notes"
              path=""
              depth={0}
              count={showCount ? (counts.get('') ?? 0) : undefined}
              selected={isSameSelection(selection, { kind: 'folder', path: '' })}
              focused={focused}
            />
            {folders.map((folder) => (
              <FolderRow
                key={folder.path}
                kind="folder"
                name={folder.name}
                path={folder.path}
                depth={folder.depth}
                count={showCount ? (counts.get(folder.path) ?? 0) : undefined}
                selected={isSameSelection(selection, { kind: 'folder', path: folder.path })}
                focused={focused}
                expanded={hasChildren(folder.path) ? !collapsed.has(folder.path) : undefined}
                onToggleExpanded={() => toggleCollapsed(folder.path)}
              />
            ))}
            {library.trash.length > 0 && (
              <FolderRow
                kind="trash"
                name="Recently Deleted"
                path=""
                depth={0}
                count={showCount ? library.trash.length : undefined}
                selected={selection.kind === 'trash'}
                focused={focused}
              />
            )}
          </>
        )}
      </div>

      <button
        className="no-drag flex shrink-0 items-center gap-1.5 px-4 py-3 text-[13px] text-muted-foreground hover:text-foreground"
        onClick={() => void createFolder()}
      >
        <CirclePlus className="size-4" strokeWidth={1.75} />
        New Folder
      </button>
    </aside>
  )
}
