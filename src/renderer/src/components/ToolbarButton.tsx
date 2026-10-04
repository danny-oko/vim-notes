import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface ToolbarButtonProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  disabled?: boolean
  className?: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

/** A borderless macOS-style toolbar button with a tooltip. */
export function ToolbarButton({ icon: Icon, label, shortcut, disabled, className, onClick }: ToolbarButtonProps) {
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
