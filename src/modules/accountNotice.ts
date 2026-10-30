import { getString } from "../utils/locale"
import type { AccountSnapshot } from "./memberFeatures"

// Names the account a key belongs to: in the translation settings summary,
// and in the blocking confirmation a browser sign-in shows before the plugin
// keeps a newly issued key.

/** Text and buttons of the account confirmation dialog. */
export interface AccountConfirmContent {
  title: string
  message: string
  confirmLabel: string
  rejectLabel: string
}

/**
 * Names the signed-in account in a few words: its email, or why it is
 * missing. A 403 from `/v1/me` (snapshot state `expired`) means the account
 * has no membership that includes the plugin.
 */
export function accountLabel(snapshot: AccountSnapshot): string {
  const email = snapshot.account?.email
  if (email) return email
  return snapshot.state === "expired"
    ? getString("account-label-membership")
    : getString("account-label-unknown")
}

/**
 * Confirmation text for a newly issued key. `email` is the email of the key's
 * account; without it the text says the account is unknown.
 */
export function accountConfirmContent(email: string | undefined): AccountConfirmContent {
  return {
    title: getString("account-confirm-title"),
    message: getString("account-confirm-body", {
      account: email || getString("account-confirm-unknown"),
    }),
    confirmLabel: getString("account-confirm-yes"),
    rejectLabel: getString("account-confirm-no"),
  }
}

/**
 * Asks in a modal dialog over `parent` whether the account is the user's.
 * Returns `true` only when the confirm button is pressed; the reject button is
 * the default, and closing the dialog counts as a rejection.
 */
export function promptAccountConfirm(
  parent: Window | null | undefined,
  content: AccountConfirmContent,
): boolean {
  const prompt = (Services as any).prompt
  const flags =
    prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING +
    prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_IS_STRING +
    prompt.BUTTON_POS_1_DEFAULT
  const pressed = prompt.confirmEx(
    parent ?? null,
    content.title,
    content.message,
    flags,
    content.confirmLabel,
    content.rejectLabel,
    null,
    null,
    { value: false },
  )
  return pressed === 0
}
