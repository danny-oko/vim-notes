import { useState } from 'react'
import { ChevronRight, Folder, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { deleteFolderWithConfirm } from '@/lib/actions'
import { cn } from '@/lib/utils'
import { useNotes } from '@/store/notes-store'

export const NOTE_DRAG_TYPE = 'application/x-vim-notes-id'

interface FolderRowProps {
  kind: 'notes' | 'folder' | 'trash'
  name: string
  path: string
  depth: number
  count?: number
  selected: boolean
  focused: boolean
  /** `undefined` when the folder has no subfolders. */
  expanded?: boolean
  onToggleExpanded?: () => void
}

export function FolderRow({ kind, name, path, depth, count, selected, focused, expanded, onToggleExpanded }: FolderRowProps) {
  const editing = useNotes((s) => kind === 'folder' && s.editingFolder === path)
  const { selectFolder, moveNote, setEditingFolder, renameFolder, createFolder } = useNotes.getState()
  const [dropping, setDropping] = useState(false)
  const Icon = kind === 'trash' ? Trash2 : Folder

  const select = (): void => selectFolder(kind === 'trash' ? { kind: 'trash' } : { kind: 'folder', path })

  const dropProps =
    kind === 'trash'
      ? {}
      : {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return
            e.preventDefault()
            setDropping(true)
          },
          onDragLeave: () => setDropping(false),
          onDrop: (e: React.DragEvent) => {
            setDropping(false)
            const id = e.dataTransfer.getData(NOTE_DRAG_TYPE)
            if (id) void moveNote(id, path)
          }
        }

  const row = (
    <div
      role="treeitem"
      aria-selected={selected}
      onClick={select}
      onDoubleClick={() => kind === 'folder' && setEditingFolder(path)}
      {...dropProps}
      style={{ paddingLeft: 4 + depth * 16 }}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md pr-2 text-[13px] transition-colors duration-100',
        selected && (focused ? 'bg-notes-selection text-notes-selection-foreground' : 'bg-notes-selection-inactive'),
        dropping && 'ring-2 ring-notes-accent ring-inset'
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {expanded !== undefined && (
          <ChevronRight
            className={cn('size-3 text-muted-foreground transition-transform', expanded && 'rotate-90')}
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpanded?.()
            }}
          />
        )}
      </span>
      <Icon className="size-4 shrink-0 text-notes-accent" strokeWidth={1.75} />
      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEditingFolder(null)
          }}
          onBlur={(e) => void renameFolder(path, e.currentTarget.value)}
          className="min-w-0 flex-1 rounded-sm bg-background px-1 outline-2 outline-notes-accent"
        />
      ) : (
        <span className="flex-1 truncate">{name}</span>
      )}
      {count !== undefined && !editing && <span className="text-muted-foreground tabular-nums">{count}</span>}
    </div>
  )

  if (kind === 'trash') return row

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => void createFolder()}>New Folder</ContextMenuItem>
        {kind === 'folder' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setEditingFolder(path)}>Rename Folder</ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => void deleteFolderWithConfirm(path)}>
              Delete Folder
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
