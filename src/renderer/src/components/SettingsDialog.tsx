import { Braces, FolderOpen } from 'lucide-react'
import type { NoteExtension, SortBy } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { restorePaneFocus } from '@/lib/focus-rescue'
import { useShortcut } from '@/lib/keybindings'
import { useNotes } from '@/store/notes-store'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0 flex-1">
        <Label className="text-[13px] font-normal">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] break-all text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Notes ▸ Settings… (⌘,) */
export function SettingsDialog({
  open,
  onOpenChange,
  onOpenShortcuts
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenShortcuts: () => void
}) {
  const settings = useNotes((s) => s.settings!)
  const vimKey = useShortcut('toggle-vim')
  const { updateSettings, setNotesDir } = useNotes.getState()

  const chooseFolder = async (): Promise<void> => {
    const dir = await window.api.chooseNotesDir()
    if (dir) await setNotesDir(dir)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // Opened from the menu there's no trigger to return to: go back to the pane.
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          restorePaneFocus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-[15px]">Settings</DialogTitle>
          <DialogDescription className="text-xs">Notes are stored as plain text files on this Mac.</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 text-[13px]">
          <Row label="Notes folder" hint={settings.notesDir ?? 'Not set'}>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void window.api.revealNotesDir()} aria-label="Open in Finder">
                <FolderOpen />
              </Button>
              <Button size="sm" variant="outline" onClick={() => void chooseFolder()}>
                Change…
              </Button>
            </div>
          </Row>
          <Row label="New note file type">
            <Select value={settings.extension} onValueChange={(value) => void updateSettings({ extension: value as NoteExtension })}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=".txt">Plain Text (.txt)</SelectItem>
                <SelectItem value=".md">Markdown (.md)</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Separator className="my-1.5" />

          <Row label="Sort notes by">
            <Select value={settings.sortBy} onValueChange={(value) => void updateSettings({ sortBy: value as SortBy })}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updatedAt">Date Edited</SelectItem>
                <SelectItem value="createdAt">Date Created</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Group notes by date">
            <Switch checked={settings.groupByDate} onCheckedChange={(groupByDate) => void updateSettings({ groupByDate })} />
          </Row>
          <Row label="New notes start with a title" hint="The first line is shown large and bold.">
            <Switch
              checked={settings.firstLineIsTitle}
              onCheckedChange={(firstLineIsTitle) => void updateSettings({ firstLineIsTitle })}
            />
          </Row>
          <Row label={`Default text size: ${settings.fontSize}pt`}>
            <Slider
              className="w-40"
              min={10}
              max={32}
              step={1}
              value={[settings.fontSize]}
              onValueChange={([fontSize]) => void updateSettings({ fontSize })}
            />
          </Row>

          <Separator className="my-1.5" />

          <Row label="Vim mode" hint={`Normal-mode keys work in every keyboard layout.${vimKey ? ` ${vimKey}` : ''}`}>
            <Switch checked={settings.vimEnabled} onCheckedChange={(vimEnabled) => void updateSettings({ vimEnabled })} />
          </Row>
          <Row label="Keyboard shortcuts" hint="Apple Notes defaults; change them like VS Code's keybindings.json.">
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void window.api.openKeybindingsFile()}
                aria-label="Open keybindings.json"
                title="Open keybindings.json"
              >
                <Braces />
              </Button>
              <Button size="sm" variant="outline" onClick={onOpenShortcuts}>
                Customize…
              </Button>
            </div>
          </Row>
        </div>
      </DialogContent>
    </Dialog>
  )
}
