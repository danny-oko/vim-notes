import type { LucideIcon } from 'lucide-react'
import type { MenuCommand } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcut } from '@/lib/keybindings'
import { cn } from '@/lib/utils'

interface ToolbarButtonProps {
  icon: LucideIcon
  label: string
  /** Shows this command's shortcut (from keybindings.json) in the tooltip. */
  command?: MenuCommand
  disabled?: boolean
  className?: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/** A borderless macOS-style toolbar button with a tooltip. */
export function ToolbarButton({ icon: Icon, label, command, disabled, className, onClick }: ToolbarButtonProps) {
  const shortcut = useShortcut(command)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          // Keep focus where it is (e.g. in the editor) when clicking toolbar buttons.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn('no-drag size-7 text-notes-toolbar-icon hover:bg-accent [&_svg]:size-[18px]', className)}
        >
          <Icon strokeWidth={1.75} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut && <span className="ml-2 opacity-60">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
