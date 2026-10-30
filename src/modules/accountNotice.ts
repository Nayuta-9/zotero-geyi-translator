import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { logDebug } from "../utils/log"
import { clearCredentials, getCredentials } from "./auth"
import { clearGlossaryCache } from "./glossary"
import { type AccountSnapshot, clearAccountCache, getAccountSnapshot } from "./memberFeatures"

// After a browser sign-in, names the account the plugin is now signed in to
// and offers to sign out at once. The notice opens in its own non-modal window
// and the sign-in caller never waits for it.

export interface AccountNoticeContent {
  title: string
  lines: string[]
  signOutLabel: string
  closeLabel: string
}

export interface AccountNoticeOptions {
  /** Renders the notice; `signOut` runs when the user picks the sign-out action. */
  open?: (content: AccountNoticeContent, signOut: () => void) => void
  /** Runs after the notice signs the plugin out, for example to refresh a settings pane. */
  onSignedOut?: () => void
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

/** Notice text for the account snapshot read right after sign-in. */
export function accountNoticeContent(snapshot: AccountSnapshot): AccountNoticeContent {
  const email = snapshot.account?.email
  return {
    title: getString("account-notice-title"),
    lines: [
      email
        ? getString("account-notice-email", { email })
        : snapshot.state === "expired"
          ? getString("account-notice-membership")
          : getString("account-notice-unknown"),
      getString("account-notice-hint"),
    ],
    signOutLabel: getString("account-notice-signout"),
    closeLabel: getString("account-notice-close"),
  }
}

/**
 * Reads the account behind the credentials just stored, from the same
 * `/v1/me` snapshot the settings pane shows, and opens the notice.
 *
 * Nothing opens when the plugin was signed out or signed in again while the
 * account was loading. The sign-out action clears only the credentials this
 * notice was opened for, and it never throws, so the notice always closes.
 */
export async function showSignedInAccount(options: AccountNoticeOptions = {}): Promise<void> {
  const key = getCredentials()?.key
  if (!key) return
  clearAccountCache()
  const snapshot = await getAccountSnapshot(true)
  if (getCredentials()?.key !== key) return

  const signOut = () => {
    try {
      if (getCredentials()?.key !== key) return
      clearCredentials()
      clearGlossaryCache()
      clearAccountCache()
    } catch (error) {
      logDebug(`account notice sign-out failed: ${error}`)
      return
    }
    showSignedOutLine()
    try {
      options.onSignedOut?.()
    } catch (error) {
      logDebug(`account notice sign-out refresh failed: ${error}`)
    }
  }
  try {
    ;(options.open ?? openAccountNoticeWindow)(accountNoticeContent(snapshot), signOut)
  } catch (error) {
    logDebug(`account notice failed: ${error}`)
  }
}

function ztk(): any {
  return (Zotero as any)[config.addonInstance]?.data?.ztoolkit
}

function showSignedOutLine(): void {
  try {
    new (ztk().ProgressWindow)(config.addonName)
      .createLine({ text: getString("account-notice-signed-out"), type: "default" })
      .show()
  } catch (error) {
    logDebug(`signed-out notice failed: ${error}`)
  }
}

function openAccountNoticeWindow(content: AccountNoticeContent, signOut: () => void): void {
  const toolkit = ztk()
  if (!toolkit?.Dialog) return
  const dialog = new toolkit.Dialog(content.lines.length + 1, 1)
  dialog.addCell(0, 0, {
    tag: "h2",
    namespace: "html",
    properties: { textContent: content.title },
    styles: { margin: "0 0 12px 0" },
  })
  content.lines.forEach((line, index) => {
    dialog.addCell(index + 1, 0, {
      tag: "p",
      namespace: "html",
      properties: { textContent: line },
      styles: { maxWidth: "460px", margin: "0 0 10px 0", lineHeight: "1.5" },
    })
  })
  dialog.addButton(content.signOutLabel, "geyi-account-notice-signout", {
    callback: signOut,
  })
  dialog.addButton(content.closeLabel, "geyi-account-notice-close")
  dialog.open(content.title)
}
