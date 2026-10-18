import { useEffect, useMemo, useRef, useState } from 'react'
import { Braces, Plus, RotateCcw, Search, TriangleAlert, X } from 'lucide-react'
import {
  addKeybinding,
  COMMANDS,
  displayKey,
  keyFromEvent,
  removeKeybinding,
  replaceKeybinding,
  resetKeybindings,
  type CommandInfo,
  type Keybinding,
  type ResolvedKeybinding
} from '@shared/keybindings'
import type { MenuCommand } from '@shared/types'
import { confirm } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RECORDER_ATTRIBUTE, useKeybindings } from '@/lib/keybindings'
import { restorePaneFocus } from '@/lib/focus-rescue'
import { cn } from '@/lib/utils'

/** Which shortcut is being recorded: a new one for a command, or a replacement for an existing binding. */
type Recording = { command: MenuCommand; binding?: ResolvedKeybinding }

const CATEGORIES: CommandInfo['category'][] = ['File', 'Edit', 'Format', 'Font', 'View', 'Vim Notes']

/** Keys that can't be a shortcut on their own without breaking typing. */
const needsModifier = (key: string): boolean => !/(^|\+)(cmd|ctrl|alt)\+/.test(key) && !/(^|\+)f\d+$/.test(key)

const sameWhen = (a?: string, b?: string): boolean => (a ?? '') === (b ?? '')

function modifierSymbols(event: React.KeyboardEvent): string {
  return `${event.ctrlKey ? '⌃' : ''}${event.altKey ? '⌥' : ''}${event.shiftKey ? '⇧' : ''}${event.metaKey ? '⌘' : ''}`
}

/** Captures the next key combination. Esc cancels; keys go nowhere else meanwhile. */
function KeyRecorder({ onDone, onCancel }: { onDone: (key: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [held, setHeld] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => ref.current?.focus(), [])

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Press the new shortcut"
      {...{ [RECORDER_ATTRIBUTE]: '' }}
      onBlur={onCancel}
      onKeyUp={(e) => setHeld(modifierSymbols(e))}
      onKeyDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const key = keyFromEvent(e.nativeEvent)
        if (!key) return setHeld(modifierSymbols(e))
        if (key === 'escape') return onCancel()
        if (needsModifier(key)) return setHint('Add ⌘, ⌃ or ⌥: plain keys are for typing.')
        onDone(key)
      }}
      className="flex h-6 min-w-36 items-center rounded-md border border-notes-accent bg-background px-2 text-xs ring-3 ring-ring/40 outline-none"
    >
      <span className={cn(!held && 'text-muted-foreground')}>{held || hint || 'Press keys… (Esc to cancel)'}</span>
    </div>
  )
}

function BindingChip({
  binding,
  conflicts,
  disabled,
  onChange,
  onRemove
}: {
  binding: ResolvedKeybinding
  conflicts: string[]
  disabled: boolean
  onChange: () => void
  onRemove: () => void
}) {
  const title = [
    binding.when && `When: ${binding.when}`,
    conflicts.length && `Also used by: ${conflicts.join(', ')}`,
    binding.source === 'user' ? 'From keybindings.json' : 'Default'
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <span
      title={title}
      className={cn(
        'group inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-muted/50 pr-0.5 pl-1.5 text-xs',
        binding.source === 'user' && 'border-notes-accent/50',
        conflicts.length > 0 && 'border-amber-500/70 bg-amber-500/10'
      )}
    >
      <button
        disabled={disabled}
        onClick={onChange}
        aria-label={`Change ${displayKey(binding.key)}`}
        className="font-medium tracking-wider whitespace-nowrap disabled:cursor-default"
      >
        {displayKey(binding.key)}
      </button>
      {binding.when && <span className="truncate font-mono text-[10px] text-muted-foreground">{binding.when}</span>}
      {!disabled && (
        <button
          aria-label={`Remove ${displayKey(binding.key)}`}
          onClick={onRemove}
          className="flex size-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

/** Vim Notes ▸ Keyboard Shortcuts… — a front end for keybindings.json, like VS Code's. */
export function KeyboardShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const state = useKeybindings((s) => s.state)
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<Recording | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) setRecording(null)
  }, [open])

  const save = async (next: Keybinding[]): Promise<void> => {
    setSaveError(null)
    try {
      await window.api.setUserKeybindings(next)
    } catch (error) {
      setSaveError(String((error as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  const groups = useMemo(() => {
    if (!state) return []
    const q = query.trim().toLowerCase()
    const matches = (id: string, info: CommandInfo, bindings: ResolvedKeybinding[]): boolean =>
      !q ||
      [info.title, id, info.category, ...bindings.flatMap((b) => [b.key, displayKey(b.key).toLowerCase(), b.when ?? ''])].some((text) =>
        text.toLowerCase().includes(q)
      )
    return CATEGORIES.map((category) => ({
      category,
      rows: (Object.entries(COMMANDS) as [MenuCommand, CommandInfo][])
        .filter(([, info]) => info.category === category)
        .map(([id, info]) => ({ id, info, bindings: state.bindings.filter((b) => b.command === id) }))
        .filter((row) => matches(row.id, row.info, row.bindings))
    })).filter((group) => group.rows.length)
  }, [state, query])

  if (!state) return null
  const locked = state.invalid
  const conflictsOf = (binding: ResolvedKeybinding): string[] =>
    state.bindings
      .filter((o) => o.key === binding.key && o.command !== binding.command && sameWhen(o.when, binding.when))
      .map((o) => COMMANDS[o.command].title)

  const record = (key: string): void => {
    if (!recording) return
    const { command, binding } = recording
    setRecording(null)
    if (binding?.key === key) return
    void save(binding ? replaceKeybinding(state.user, binding, key) : addKeybinding(state.user, command, key))
  }

  const resetAll = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Reset all keyboard shortcuts?',
      description: 'Every shortcut goes back to its default, and keybindings.json is emptied.',
      action: 'Reset All'
    })
    if (ok) await save([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          restorePaneFocus()
        }}
        // While recording, Esc cancels the recording rather than closing the window.
        onEscapeKeyDown={(e) => recording && e.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-[15px]">Keyboard Shortcuts</DialogTitle>
            <Button size="xs" variant="outline" onClick={() => void window.api.openKeybindingsFile()}>
              <Braces /> Open keybindings.json
            </Button>
          </div>
          <DialogDescription className="text-xs">
            Click a shortcut to change it. Saved to keybindings.json, the same format as VS Code; edits made there apply
            right away. Keys work by position, so shortcuts are the same in every keyboard layout.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, keys (cmd+shift+7, ⇧⌘7) or when clauses"
            spellCheck={false}
            className="h-7 w-full rounded-md border border-transparent bg-accent pr-2 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus:border-notes-accent focus:ring-3 focus:ring-ring/40"
          />
        </div>

        {(state.errors.length > 0 || saveError) && (
          <div role="alert" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 space-y-0.5">
              {saveError && <p>{saveError}</p>}
              {state.errors.map((error) => (
                <p key={error} className="break-words">
                  {error}
                </p>
              ))}
              {locked && <p className="text-muted-foreground">Only the defaults apply until keybindings.json is fixed.</p>}
            </div>
          </div>
        )}

        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 text-[13px]">
          {groups.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No matching commands</p>}
          {groups.map(({ category, rows }) => (
            <section key={category} className="pb-2">
              <h3 className="sticky top-0 z-10 bg-background py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {category}
              </h3>
              {rows.map(({ id, info, bindings }) => {
                const modified = state.user.some((e) => e.command === id || e.command === `-${id}`)
                const recordingHere = recording?.command === id
                return (
                  <div key={id} className="group/row flex min-h-9 items-center gap-3 rounded-md px-2 py-1 hover:bg-accent/50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{info.title}</div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground select-text">{id}</div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                      {bindings.map((binding) =>
                        recordingHere && recording.binding === binding ? (
                          <KeyRecorder key="recorder" onDone={record} onCancel={() => setRecording(null)} />
                        ) : (
                          <BindingChip
                            key={`${binding.key}|${binding.when ?? ''}|${binding.source}`}
                            binding={binding}
                            conflicts={conflictsOf(binding)}
                            disabled={locked}
                            onChange={() => setRecording({ command: id, binding })}
                            onRemove={() => void save(removeKeybinding(state.user, binding))}
                          />
                        )
                      )}
                      {recordingHere && !recording.binding && (
                        <KeyRecorder onDone={record} onCancel={() => setRecording(null)} />
                      )}
                    </div>
                    <div className="flex w-13 shrink-0 justify-end gap-0.5">
                      {!locked && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Add shortcut for ${info.title}`}
                          title="Add shortcut"
                          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                          onClick={() => setRecording({ command: id })}
                        >
                          <Plus />
                        </Button>
                      )}
                      {modified && !locked && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Reset ${info.title}`}
                          title="Reset to default"
                          onClick={() => void save(resetKeybindings(state.user, id))}
                        >
                          <RotateCcw />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
          <span>
            {state.user.length === 0 ? 'Using the default (Apple Notes) shortcuts.' : `${state.user.length} change${state.user.length === 1 ? '' : 's'} in keybindings.json`}
          </span>
          {state.user.length > 0 && !locked && (
            <Button size="xs" variant="ghost" onClick={() => void resetAll()}>
              Reset All…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
