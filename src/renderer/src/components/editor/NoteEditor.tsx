import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { Annotation, Compartment, EditorState, Transaction, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { getCM, Vim, vim } from '@replit/codemirror-vim'
import { saveNow } from '@/lib/actions'
import { formatEditorDate } from '@/lib/dates'
import { findNote, useNotes } from '@/store/notes-store'
import { Button } from '@/components/ui/button'
import { checkedItemStyle, titleLineStyle } from './decorations'
import { continueList, tidyChanges } from './text-commands'
import { editorHandle } from './editor-handle'
import { findBar } from './find-bar'
import { installExCommandLayoutFix, vimAnyLayout } from './vim-any-layout'
import { vimUndo } from './vim-undo'

/** Marks document replacements that come from disk rather than the user. */
const fromDisk = Annotation.define<boolean>()

const vimMode = new Compartment()
const readOnly = new Compartment()
const titleStyle = new Compartment()

const vimExtension = (enabled: boolean): Extension => (enabled ? [vim({ status: true }), vimAnyLayout(), vimUndo()] : [])
const readOnlyExtension = (locked: boolean): Extension =>
  locked ? [EditorState.readOnly.of(true), EditorState.changeFilter.of((tr) => !!tr.annotation(fromDisk))] : []
const titleExtension = (enabled: boolean): Extension => (enabled ? titleLineStyle : [])

// Vim ex commands that make sense for a notes app.
const notes = () => useNotes.getState()
const leaveEditor = () => notes().focusPane('list')
Vim.defineEx('write', 'w', () => void saveNow())
Vim.defineEx('quit', 'q', leaveEditor)
Vim.defineEx('wq', 'wq', () => void saveNow().then(leaveEditor))
Vim.defineEx('xit', 'x', () => void saveNow().then(leaveEditor))
Vim.defineEx('new', 'new', () => void notes().createNote())
Vim.defineEx('enew', 'ene', () => void notes().createNote())

export function NoteEditor() {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  /** Per-note editor states keep each note's undo history while switching. */
  const statesRef = useRef(new Map<string, EditorState>())
  const noteIdRef = useRef<string | null>(null)

  const settings = useNotes((s) => s.settings!)
  const note = useNotes((s) => findNote(s.library, s.selectedNoteId))
  const focusedPane = useNotes((s) => s.focusedPane)
  const focusTick = useNotes((s) => s.focusTick)
  const startInsertFor = useNotes((s) => s.startInsertFor)
  const recoverNote = useNotes((s) => s.recoverNote)
  const isDeleted = note?.deletedAt !== undefined

  const createState = (doc: string): EditorState =>
    EditorState.create({
      doc,
      extensions: [
        vimMode.of(vimExtension(settings.vimEnabled)),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        findBar(),
        keymap.of([{ key: 'Enter', run: continueList }, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        readOnly.of(readOnlyExtension(isDeleted)),
        titleStyle.of(titleExtension(settings.firstLineIsTitle)),
        checkedItemStyle,
        EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', 'aria-label': 'Note' }),
        EditorView.updateListener.of((update) => {
          const id = noteIdRef.current
          if (!id || !update.docChanged || update.transactions.some((tr) => tr.annotation(fromDisk))) return
          useNotes.getState().editNote(id, update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          focus: () => useNotes.getState().paneFocused('editor')
        })
      ]
    })

  // Create the single EditorView.
  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current! })
    viewRef.current = view
    editorHandle.set(view)
    const removeLayoutFix = installExCommandLayoutFix()
    return () => {
      removeLayoutFix()
      editorHandle.set(null)
      view.destroy()
    }
  }, [])

  // Swap documents when the selected note changes.
  useEffect(() => {
    const view = viewRef.current!
    const previous = noteIdRef.current
    if (previous) {
      // Leaving a note tidies its text (undoable when you come back).
      let state = view.state
      const changes = tidyChanges(state)
      if (changes.length) {
        state = state.update({ changes, userEvent: 'input.tidy' }).state
        useNotes.getState().editNote(previous, state.doc.toString())
      }
      statesRef.current.set(previous, state)
    }
    noteIdRef.current = note?.id ?? null
    if (!note) return view.setState(createState(''))

    const cached = statesRef.current.get(note.id)
    view.setState(cached && cached.doc.toString() === note.content ? cached : createState(note.content))
    view.dispatch({
      effects: [
        vimMode.reconfigure(vimExtension(settings.vimEnabled)),
        readOnly.reconfigure(readOnlyExtension(isDeleted)),
        titleStyle.reconfigure(titleExtension(settings.firstLineIsTitle))
      ]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  // Apply setting changes to the live editor.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        vimMode.reconfigure(vimExtension(settings.vimEnabled)),
        readOnly.reconfigure(readOnlyExtension(isDeleted)),
        titleStyle.reconfigure(titleExtension(settings.firstLineIsTitle))
      ]
    })
  }, [settings.vimEnabled, settings.firstLineIsTitle, isDeleted])

  // Pick up edits made to the file outside the app.
  useEffect(() => {
    const view = viewRef.current!
    if (!note || note.content === view.state.doc.toString()) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: note.content },
      // Outside edits aren't something the user can undo here.
      annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)]
    })
  }, [note?.content])

  // Explicit focus requests (Enter/Tab from the list, double-click…). Changing
  // the selected note alone must not steal focus, e.g. from the search field.
  useEffect(() => {
    const view = viewRef.current!
    if (focusedPane === 'editor' && noteIdRef.current && !view.hasFocus) view.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick])

  // New notes open in insert mode so you can start typing right away.
  useEffect(() => {
    const view = viewRef.current!
    if (!note || startInsertFor !== note.id) return
    useNotes.getState().consumeStartInsert()
    view.focus()
    const cm = getCM(view)
    if (cm && settings.vimEnabled && !cm.state.vim?.insertMode) Vim.handleKey(cm, 'i', 'mapping')
  }, [startInsertFor, note?.id])

  return (
    <div
      className="note-editor flex h-full flex-col overflow-y-auto bg-background"
      style={{ '--note-font-size': `${settings.fontSize}px` } as React.CSSProperties}
    >
      {isDeleted && (
        <div className="mx-5 mt-3 flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <span className="flex-1">Recently deleted notes can’t be edited. To edit this note, you’ll need to recover it.</span>
          <Button size="xs" variant="outline" onClick={() => note && recoverNote(note.id)}>
            Recover
          </Button>
        </div>
      )}
      <div className={note ? 'flex flex-1 flex-col' : 'hidden'}>
        <p className="pt-3 pb-2 text-center text-xs text-muted-foreground">
          {note && formatEditorDate(note.updatedAt)}
        </p>
        <div ref={hostRef} className="flex flex-1 flex-col px-5" />
      </div>
    </div>
  )
}
