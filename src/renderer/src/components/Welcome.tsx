import { useEffect, useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotes } from '@/store/notes-store'

/** First launch: ask where every note file should be created. */
export function Welcome() {
  const [defaultDir, setDefaultDir] = useState('')
  const setNotesDir = useNotes((s) => s.setNotesDir)

  useEffect(() => {
    void window.api.defaultNotesDir().then(setDefaultDir)
  }, [])

  const choose = async (): Promise<void> => {
    const dir = await window.api.chooseNotesDir()
    if (dir) await setNotesDir(dir)
  }

  return (
    <div className="drag-region flex h-full flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-notes-selection text-notes-selection-foreground shadow-sm">
        <NotebookPen className="size-8" strokeWidth={1.75} />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-bold">Welcome to Vim Notes</h1>
        <p className="text-[13px] text-muted-foreground">
          Every note is saved as its own text file. Choose the folder where your notes should live — you can change it
          later in Settings.
        </p>
      </div>
      <div className="no-drag flex flex-col items-center gap-2">
        <Button className="bg-notes-accent text-white hover:bg-notes-accent/90" onClick={() => void setNotesDir(defaultDir)} disabled={!defaultDir}>
          Use {defaultDir.replace(/^\/Users\/[^/]+/, '~') || 'Default Folder'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void choose()}>
          Choose Another Folder…
        </Button>
      </div>
    </div>
  )
}
