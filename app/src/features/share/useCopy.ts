import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../shared/toast'

/**
 * Copying, with the one answer a page has to give when the clipboard refuses.
 *
 * The address and the password both copy, and neither should have to know how
 * the failure is reported. The success notice is the confirmation the toast
 * corner already gives every other short action; a denied clipboard gets its
 * own sentence rather than looking like a copy that worked.
 */
export function useCopy(): (text: string) => Promise<void> {
  const toast = useToast()
  const { t } = useTranslation()
  return useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.show({ title: t('copied'), variant: 'success' })
      } catch {
        // Insecure origins and denied permissions both land here.
        toast.show({ title: t('copyFailed'), variant: 'error' })
      }
    },
    [toast, t],
  )
}
