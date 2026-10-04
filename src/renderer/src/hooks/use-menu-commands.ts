import { useEffect } from 'react'
import { indentLess, indentMore, moveLineDown, moveLineUp, redo, undo, deleteLineBoundaryBackward } from '@codemirror/commands'
import { findNext, findPrevious, openSearchPanel } from '@codemirror/search'
import type { EditorView } from '@codemirror/view'
import type { MenuCommand } from '@shared/types'
import { editorHandle } from '@/components/editor/editor-handle'
import { toggleChecked, toggleList } from '@/components/editor/text-commands'
import { SEARCH_INPUT_ID } from '@/components/NotesWindow'
import { deleteNoteWithConfirm, printNote } from '@/lib/actions'
import { findNote, useNotes } from '@/store/notes-store'

const MIN_FONT = 10
const MAX_FONT = 32
const DEFAULT_FONT = 15

/** Runs a CodeMirror command against the editor, if a note is open. */
function inEditor(command: (view: EditorView) => boolean): void {
  const view = editorHandle.view
  if (view && useNotes.getState().selectedNoteId) {
    command(view)
    view.focus()
  }
}

/** Wires the native application menu (and its shortcuts) to app actions. */
export function useMenuCommands(openSettings: () => void): void {
  useEffect(() => {
    const handle = (command: MenuCommand): void => {
      const state = useNotes.getState()
      const settings = state.settings
      if (!settings) return
      const note = findNote(state.library, state.selectedNoteId)
      const font = (size: number): void =>
        void state.updateSettings({ fontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, size)) })

      switch (command) {
        case 'new-note':
          return void state.createNote()
        case 'new-folder':
          return void state.createFolder()
        case 'duplicate-note':
          return note && void state.duplicateNote(note.id)
        case 'pin-note':
          return note && void state.togglePin(note.id)
        case 'delete-note':
          // ⌘⌫ inside the text deletes to the start of the line, as in Apple Notes.
          if (editorHandle.hasFocus()) return inEditor(deleteLineBoundaryBackward)
          return note && void deleteNoteWithConfirm(note.id)
        case 'print':
          return note && printNote(note.content)
        case 'undo':
          if (editorHandle.hasFocus()) return inEditor(undo)
          return void document.execCommand('undo')
        case 'redo':
          if (editorHandle.hasFocus()) return inEditor(redo)
          return void document.execCommand('redo')

        case 'search':
          return document.getElementById(SEARCH_INPUT_ID)?.focus()
        case 'find':
          return inEditor(openSearchPanel)
        case 'find-next':
          return inEditor(findNext)
        case 'find-previous':
          return inEditor(findPrevious)

        case 'checklist':
          return inEditor((view) => toggleList(view, 'checklist'))
        case 'check-item':
          return inEditor(toggleChecked)
        case 'bulleted-list':
          return inEditor((view) => toggleList(view, 'bulleted'))
        case 'dashed-list':
          return inEditor((view) => toggleList(view, 'dashed'))
        case 'numbered-list':
          return inEditor((view) => toggleList(view, 'numbered'))
        case 'move-line-up':
          return inEditor(moveLineUp)
        case 'move-line-down':
          return inEditor(moveLineDown)
        case 'indent':
          return inEditor(indentMore)
        case 'outdent':
          return inEditor(indentLess)

        case 'font-bigger':
          return font(settings.fontSize + 1)
        case 'font-smaller':
          return font(settings.fontSize - 1)
        case 'font-reset':
          return font(DEFAULT_FONT)

        case 'toggle-sidebar':
          return void state.updateSettings({ sidebarVisible: !settings.sidebarVisible })
        case 'view-list':
          return void state.updateSettings({ viewMode: 'list' })
        case 'view-gallery':
          return void state.updateSettings({ viewMode: 'gallery' })
        case 'sort-updatedAt':
        case 'sort-createdAt':
        case 'sort-title':
          return void state.updateSettings({ sortBy: command.slice(5) as 'updatedAt' | 'createdAt' | 'title' })
        case 'toggle-group-by-date':
          return void state.updateSettings({ groupByDate: !settings.groupByDate })
        case 'toggle-note-count':
          return void state.updateSettings({ showNoteCount: !settings.showNoteCount })
        case 'toggle-vim':
          return void state.updateSettings({ vimEnabled: !settings.vimEnabled })
        case 'settings':
          return openSettings()
      }
    }
    return window.api.onMenuCommand(handle)
  }, [openSettings])

  // Keep menu checkmarks and enabled states in sync with the app.
  useEffect(
    () =>
      useNotes.subscribe((state) => {
        if (!state.settings) return
        const { sortBy, groupByDate, viewMode, vimEnabled, sidebarVisible, showNoteCount } = state.settings
        const note = findNote(state.library, state.selectedNoteId)
        const next = { sortBy, groupByDate, viewMode, vimEnabled, sidebarVisible, showNoteCount, hasNote: !!note, notePinned: !!note?.pinned }
        const key = JSON.stringify(next)
        if (key === lastMenuState) return
        lastMenuState = key
        window.api.syncMenuState(next)
      }),
    []
  )
}

let lastMenuState = ''
