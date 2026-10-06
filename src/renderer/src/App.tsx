import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NotesWindow } from '@/components/NotesWindow'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Welcome } from '@/components/Welcome'
import { useMenuCommands } from '@/hooks/use-menu-commands'
import { installFocusRescue } from '@/lib/focus-rescue'
import { useNotes } from '@/store/notes-store'

export function App() {
  const settings = useNotes((s) => s.settings)
  const hasLibrary = useNotes((s) => !!s.library)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])

  useEffect(() => {
    void useNotes.getState().init()
  }, [])
  useEffect(installFocusRescue, [])
  useMenuCommands(openSettings)

  if (!settings) return null

  return (
    <TooltipProvider delayDuration={600}>
      {settings.notesDir && hasLibrary ? <NotesWindow /> : <Welcome />}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ConfirmDialog />
      <ErrorToast />
    </TooltipProvider>
  )
}

function ErrorToast() {
  const error = useNotes((s) => s.error)
  const dismiss = useNotes((s) => s.dismissError)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(dismiss, 6000)
    return () => clearTimeout(timer)
  }, [error, dismiss])

  if (!error) return null
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover px-4 py-2.5 text-[13px] shadow-lg"
    >
      <span>{error}</span>
      <button aria-label="Dismiss" onClick={dismiss} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  )
}
