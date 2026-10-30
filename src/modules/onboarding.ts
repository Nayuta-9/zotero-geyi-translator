import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { logDebug } from "../utils/log"
import { getPref, setPref } from "../utils/prefs"
import { showSignedInAccount } from "./accountNotice"
import { isLoggedIn, showLoginFailure, startLogin } from "./auth"

// First-run guidance shown once per installed version, so a new install and
// every upgrade show it on their first start. It opens in its own non-modal
// window and startup never waits for it.

export const ONBOARDING_PREF = "onboardingSeenVersion"
// Lets the main window finish drawing before the guidance window opens.
const SHOW_DELAY_MS = 1500

export interface OnboardingContent {
  title: string
  lines: string[]
  showSignIn: boolean
}

/** Whether the guidance is still due for `currentVersion`. */
export function needsOnboarding(seenVersion: unknown, currentVersion: string): boolean {
  return seenVersion !== currentVersion
}

/** Guidance text; the sign-in step and button appear only while signed out. */
export function onboardingContent(loggedIn: boolean): OnboardingContent {
  return {
    title: getString("onboarding-title"),
    lines: [
      ...(loggedIn ? [] : [getString("onboarding-login")]),
      getString("onboarding-translate"),
      getString("onboarding-membership"),
    ],
    showSignIn: !loggedIn,
  }
}

/**
 * Shows the guidance when the running version has not shown it yet. The
 * version is recorded before the window opens, so a window that fails to open
 * is not retried on every start. Resolves to whether the guidance was due.
 */
export async function showOnboardingIfNeeded(
  open: (content: OnboardingContent) => void = openOnboardingWindow,
): Promise<boolean> {
  if (!needsOnboarding(getPref<string>(ONBOARDING_PREF), config.version)) return false
  setPref(ONBOARDING_PREF, config.version)
  try {
    await Zotero.Promise.delay(SHOW_DELAY_MS)
    open(onboardingContent(isLoggedIn()))
  } catch (error) {
    logDebug(`onboarding window failed: ${error}`)
  }
  return true
}

function ztk(): any {
  return (Zotero as any)[config.addonInstance]?.data?.ztoolkit
}

function openOnboardingWindow(content: OnboardingContent): void {
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
  if (content.showSignIn) {
    dialog.addButton(getString("onboarding-signin"), "geyi-onboarding-signin", {
      callback: () => void signInFromOnboarding(),
    })
  }
  dialog.addButton(getString("onboarding-close"), "geyi-onboarding-close")
  dialog.open(content.title)
}

async function signInFromOnboarding(): Promise<void> {
  try {
    await startLogin()
  } catch (error) {
    const win = Zotero.getMainWindow() as unknown as Window | null
    if (win) showLoginFailure(win, error)
    return
  }
  void showSignedInAccount()
}
