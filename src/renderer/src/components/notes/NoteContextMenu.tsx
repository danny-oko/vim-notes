import type { Note } from '@shared/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { deleteNoteWithConfirm } from '@/lib/actions'
import { useNotes } from '@/store/notes-store'

/** The right-click menu for a note in the list or gallery. */
export function NoteContextMenu({ note, children }: { note: Note; children: React.ReactElement }) {
  const folders = useNotes((s) => s.library!.folders)
  const { togglePin, duplicateNote, moveNote, recoverNote, selectNote } = useNotes.getState()
  const deleted = note.deletedAt !== undefined
  const destinations = [{ path: '', name: 'Notes', depth: 0 }, ...folders].filter((f) => f.path !== note.folder)

  return (
    <ContextMenu onOpenChange={(open) => open && selectNote(note.id)}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {deleted ? (
          <ContextMenuItem onSelect={() => void recoverNote(note.id)}>Recover</ContextMenuItem>
        ) : (
          <>
            <ContextMenuItem onSelect={() => void togglePin(note.id)}>{note.pinned ? 'Unpin Note' : 'Pin Note'}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void window.api.shareNote(note.id)}>Share Note…</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>Move to</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {destinations.map((folder) => (
                  <ContextMenuItem
                    key={folder.path}
                    style={{ paddingLeft: 8 + folder.depth * 12 }}
                    onSelect={() => void moveNote(note.id, folder.path)}
                  >
                    {folder.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onSelect={() => void duplicateNote(note.id)}>
              Duplicate Note<ContextMenuShortcut>⌘D</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem onSelect={() => void window.api.revealNote(note.id)}>Show in Finder</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => void deleteNoteWithConfirm(note.id)}>
          Delete<ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
