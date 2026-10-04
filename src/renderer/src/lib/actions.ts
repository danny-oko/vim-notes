import { noteTitle } from '@shared/note-text'
import { confirm } from '@/components/ConfirmDialog'
import { findNote, useNotes } from '@/store/notes-store'

/**
 * User-facing actions that need confirmation, shared by menus, toolbar
 * buttons, context menus and keyboard shortcuts.
 */
export async function deleteNoteWithConfirm(id: string): Promise<void> {
  const { library, deleteNote } = useNotes.getState()
  const note = findNote(library, id)
  if (!note) return
  if (note.deletedAt !== undefined) {
    const ok = await confirm({
      title: `Delete “${noteTitle(note.content)}”?`,
      description: 'This note will be deleted immediately. You can’t undo this action.',
      action: 'Delete'
    })
    if (!ok) return
  }
  await deleteNote(id)
}

export async function deleteFolderWithConfirm(path: string): Promise<void> {
  const ok = await confirm({
    title: `Delete “${path.split('/').pop()}”?`,
    description:
      'Are you sure you want to delete this folder? All notes and any subfolders will be moved to Recently Deleted.',
    action: 'Delete Folder'
  })
  if (ok) await useNotes.getState().deleteFolder(path)
}

export const SEARCH_INPUT_ID = 'notes-search'

export function focusSearch(): void {
  document.getElementById(SEARCH_INPUT_ID)?.focus()
}

/** Prints only the note's text, not the whole window. */
export function printNote(content: string): void {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const pre = doc.createElement('pre')
  pre.textContent = content
  pre.style.cssText = 'font: 12pt -apple-system, sans-serif; white-space: pre-wrap; margin: 0'
  doc.body.appendChild(pre)
  frame.contentWindow!.addEventListener('afterprint', () => frame.remove())
  frame.contentWindow!.print()
}
