import { create } from 'zustand'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { restorePaneFocus } from '@/lib/focus-rescue'

interface ConfirmRequest {
  title: string
  description: string
  action: string
  resolve: (confirmed: boolean) => void
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }))

/** Shows a macOS-style alert and resolves with the user's choice. */
export function confirm(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...options, resolve } }))
}

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request)
  const close = (confirmed: boolean): void => {
    request?.resolve(confirmed)
    useConfirmStore.setState({ request: null })
  }

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent
        size="sm"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          restorePaneFocus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[13px]">{request?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">{request?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" onClick={() => close(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction size="sm" variant="destructive" onClick={() => close(true)}>
            {request?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
