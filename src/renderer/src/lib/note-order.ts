import { noteTitle } from '@shared/note-text'
import type { Library, Note, Settings } from '@shared/types'
import { dateGroup } from './dates'

export type Selection = { kind: 'folder'; path: string } | { kind: 'trash' }

export interface NoteSection {
  label: string
  pinned?: boolean
  notes: Note[]
}

export function matchesSearch(note: Note, query: string): boolean {
  return note.content.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}

/** Notes belonging to the current folder, Recently Deleted, or search results. */
export function notesInView(library: Library, selection: Selection, search: string): Note[] {
  const query = search.trim()
  if (query) return library.notes.filter((note) => matchesSearch(note, query))
  if (selection.kind === 'trash') return library.trash
  return library.notes.filter((note) => note.folder === selection.path)
}

function sortKey(note: Note, sortBy: Settings['sortBy']): number {
  return sortBy === 'createdAt' ? note.createdAt : (note.deletedAt ?? note.updatedAt)
}

export function sortNotes(notes: Note[], sortBy: Settings['sortBy']): Note[] {
  if (sortBy === 'title') {
    return [...notes].sort((a, b) => noteTitle(a.content).localeCompare(noteTitle(b.content)))
  }
  return [...notes].sort((a, b) => sortKey(b, sortBy) - sortKey(a, sortBy))
}

/** Splits notes into the “Pinned / Today / Yesterday / …” sections of the list. */
export function sectionNotes(notes: Note[], settings: Pick<Settings, 'sortBy' | 'groupByDate'>): NoteSection[] {
  const sorted = sortNotes(notes, settings.sortBy)
  const pinned = sorted.filter((note) => note.pinned)
  const others = sorted.filter((note) => !note.pinned)
  const sections: NoteSection[] = []
  if (pinned.length) sections.push({ label: 'Pinned', pinned: true, notes: pinned })

  if (settings.groupByDate && settings.sortBy !== 'title') {
    for (const note of others) {
      const label = dateGroup(sortKey(note, settings.sortBy))
      const last = sections.at(-1)
      if (last && !last.pinned && last.label === label) last.notes.push(note)
      else sections.push({ label, notes: [note] })
    }
  } else if (others.length) {
    sections.push({ label: pinned.length ? 'Notes' : '', notes: others })
  }
  return sections
}

export function flattenSections(sections: NoteSection[]): Note[] {
  return sections.flatMap((section) => section.notes)
}
