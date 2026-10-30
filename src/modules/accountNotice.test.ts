import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { config } from "../utils/config"
import { getString } from "../utils/locale"
import {
  type AccountNoticeContent,
  accountLabel,
  accountNoticeContent,
  showSignedInAccount,
} from "./accountNotice"
import { getCredentials, isLoggedIn, setCredentials } from "./auth"
import { clearGlossaryCache } from "./glossary"
import { clearAccountCache, getAccountSnapshot } from "./memberFeatures"
import { openConfigDialog } from "./translate"

// The notice after a browser sign-in: it names the account the plugin is now
// signed in to and lets the user sign out at once when it is not theirs.

const prefs = new Map<string, unknown>()
let meReply: Record<string, unknown> | Error = {}
let meCalls = 0

function request(_method: string, url: string): Promise<{ responseText: string }> {
  if (url.endsWith("/me")) {
    meCalls += 1
    if (meReply instanceof Error) return Promise.reject(meReply)
    return Promise.resolve({ responseText: JSON.stringify(meReply) })
  }
  if (url.includes("/glossaries")) {
    return Promise.resolve({ responseText: JSON.stringify({ data: [], count: 3 }) })
  }
  return Promise.resolve({ responseText: "{}" })
}

/** A rejection shaped like a non-2xx `Zotero.HTTP.request` answer. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { xhr: { status, responseText: "{}" } })
}

function stubZotero(locale = "en-US"): void {
  vi.stubGlobal("Zotero", {
    locale,
    HTTP: { request: vi.fn(request) },
    Prefs: {
      get: (key: string) => prefs.get(key),
      set: (key: string, value: unknown) => prefs.set(key, value),
      clear: (key: string) => prefs.delete(key),
    },
  })
}

type OpenNotice = (content: AccountNoticeContent, signOut: () => void) => void

function opened() {
  const open = vi.fn<OpenNotice>()
  return {
    open,
    content: () => open.mock.calls[0][0],
    signOut: () => open.mock.calls[0][1](),
  }
}

beforeEach(() => {
  prefs.clear()
  meReply = { email: "owner@example.com" }
  meCalls = 0
  vi.unstubAllGlobals()
  stubZotero()
  clearAccountCache()
  clearGlossaryCache()
  setCredentials("sk_live_first", "https://api.example.test/v1")
})

describe("account notice content", () => {
  it("names the signed-in account and offers to sign out", () => {
    const content = accountNoticeContent({
      state: "ok",
      account: { email: "owner@example.com" } as any,
    })
    expect(content.lines[0]).toContain("owner@example.com")
    expect(content.lines[1]).toBe(getString("account-notice-hint"))
    expect(content.signOutLabel).toBe(getString("account-notice-signout"))
  })

  it("still offers to sign out when the account could not be read", () => {
    const content = accountNoticeContent({ state: "unknown" })
    expect(content.lines[0]).toBe(getString("account-notice-unknown"))
    expect(content.signOutLabel).toBe(getString("account-notice-signout"))
  })

  it("explains a missing email as a membership matter when /me answered 403", () => {
    const content = accountNoticeContent({ state: "expired" })
    expect(content.lines[0]).toBe(getString("account-notice-membership"))
    expect(content.lines[1]).toBe(getString("account-notice-hint"))
  })

  it("labels the account by email, membership or unknown", () => {
    expect(accountLabel({ state: "ok", account: { email: "o@example.com" } as any })).toBe(
      "o@example.com",
    )
    expect(accountLabel({ state: "expired" })).toBe(getString("account-label-membership"))
    expect(accountLabel({ state: "unknown" })).toBe(getString("account-label-unknown"))
  })

  it("exists in both English and Simplified Chinese", () => {
    const keys = [
      "account-notice-title",
      "account-notice-email",
      "account-notice-unknown",
      "account-notice-membership",
      "account-notice-hint",
      "account-label-unknown",
      "account-label-membership",
      "dialog-account",
      "account-notice-signout",
      "account-notice-close",
      "account-notice-signed-out",
    ]
    const en = keys.map((key) => getString(key))
    stubZotero("zh-CN")
    const zh = keys.map((key) => getString(key))
    keys.forEach((key, i) => {
      expect(en[i]).not.toBe(key)
      expect(zh[i]).not.toBe(key)
      expect(zh[i]).not.toBe(en[i])
    })
    expect(getString("account-notice-email", { email: "a@b.c" })).toContain("a@b.c")
  })
})

describe("showSignedInAccount", () => {
  it("shows the account from a fresh /me read, not a cached one", async () => {
    meReply = { email: "stale@example.com" }
    await getAccountSnapshot(true)
    meReply = { email: "owner@example.com" }
    const notice = opened()
    await showSignedInAccount({ open: notice.open })
    expect(meCalls).toBe(2)
    expect(notice.open).toHaveBeenCalledTimes(1)
    expect(notice.content().lines[0]).toContain("owner@example.com")
    expect(notice.content().lines.join(" ")).not.toContain("stale@example.com")
  })

  it("signs out and notifies the caller when the account is not the user's", async () => {
    const onSignedOut = vi.fn()
    const notice = opened()
    await showSignedInAccount({ open: notice.open, onSignedOut })
    expect(isLoggedIn()).toBe(true)
    notice.signOut()
    expect(isLoggedIn()).toBe(false)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it("never signs out a newer sign-in from an older notice", async () => {
    const onSignedOut = vi.fn()
    const notice = opened()
    await showSignedInAccount({ open: notice.open, onSignedOut })
    setCredentials("sk_live_second", "https://api.example.test/v1")
    notice.signOut()
    expect(getCredentials()?.key).toBe("sk_live_second")
    expect(onSignedOut).not.toHaveBeenCalled()
  })

  it("words a 403 from /me as a membership matter", async () => {
    meReply = httpError(403)
    const notice = opened()
    await showSignedInAccount({ open: notice.open })
    expect(notice.content().lines[0]).toBe(getString("account-notice-membership"))
    expect(isLoggedIn()).toBe(true)
  })

  it("signs out, says so and lets the notice close even when the caller's refresh throws", async () => {
    const lines: string[] = []
    ;(Zotero as any)[config.addonInstance] = {
      data: {
        ztoolkit: {
          ProgressWindow: class {
            createLine(line: { text: string }) {
              lines.push(line.text)
              return this
            }
            show() {
              return this
            }
          },
        },
      },
    }
    const notice = opened()
    await showSignedInAccount({
      open: notice.open,
      onSignedOut: () => {
        throw new Error("pane is gone")
      },
    })
    expect(() => notice.signOut()).not.toThrow()
    expect(isLoggedIn()).toBe(false)
    expect(lines).toEqual([getString("account-notice-signed-out")])
  })

  it("explains when the account cannot be read and still allows signing out", async () => {
    meReply = new Error("offline")
    const notice = opened()
    await showSignedInAccount({ open: notice.open })
    expect(notice.content().lines[0]).toBe(getString("account-notice-unknown"))
    notice.signOut()
    expect(isLoggedIn()).toBe(false)
  })

  it("opens nothing when not signed in", async () => {
    prefs.clear()
    const notice = opened()
    await showSignedInAccount({ open: notice.open })
    expect(notice.open).not.toHaveBeenCalled()
    expect(meCalls).toBe(0)
  })

  it("opens nothing when the credentials change while the account loads", async () => {
    meReply = { email: "owner@example.com" }
    const http = (Zotero as any).HTTP
    http.request = vi.fn(async (method: string, url: string) => {
      const reply = await request(method, url)
      setCredentials("sk_live_second", "https://api.example.test/v1")
      return reply
    })
    const notice = opened()
    await showSignedInAccount({ open: notice.open })
    expect(notice.open).not.toHaveBeenCalled()
  })

  it("does not reject when the notice window fails to open", async () => {
    const open = vi.fn(() => {
      throw new Error("no window")
    })
    await expect(showSignedInAccount({ open })).resolves.toBeUndefined()
  })
})

describe("translation settings summary", () => {
  function confirmingWindow() {
    const confirm = vi.fn<(message: string) => boolean>().mockReturnValue(false)
    return { win: { confirm } as unknown as Window, confirm }
  }

  it("names the account the PDF goes to right after signing in", async () => {
    const { win, confirm } = confirmingWindow()
    expect(await openConfigDialog(win, true)).toBeNull()
    const summary = confirm.mock.calls[0][0]
    expect(summary).toContain(`${getString("dialog-account")}: owner@example.com`)
    expect(summary.indexOf("owner@example.com")).toBeLessThan(
      summary.indexOf(getString("dialog-target")),
    )
  })

  it("reads the account fresh instead of a cached snapshot", async () => {
    meReply = { email: "stale@example.com" }
    await getAccountSnapshot(true)
    meReply = { email: "owner@example.com" }
    const { win, confirm } = confirmingWindow()
    await openConfigDialog(win, true)
    expect(confirm.mock.calls[0][0]).toContain("owner@example.com")
    expect(confirm.mock.calls[0][0]).not.toContain("stale@example.com")
  })

  it("says why the account is missing when /me answers 403", async () => {
    meReply = httpError(403)
    const { win, confirm } = confirmingWindow()
    await openConfigDialog(win, true)
    expect(confirm.mock.calls[0][0]).toContain(
      `${getString("dialog-account")}: ${getString("account-label-membership")}`,
    )
  })

  it("is asked to name the account only after the translate command signed in", () => {
    const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "translate.ts"), "utf8")
    const command = source.slice(source.indexOf("async function onTranslateCommand"))
    const signIn = command.indexOf("await startLogin()")
    const flagged = command.indexOf("signedInHere = true")
    expect(signIn).toBeGreaterThan(-1)
    expect(flagged).toBeGreaterThan(signIn)
    expect(command.indexOf("openConfigDialog(win, signedInHere)")).toBeGreaterThan(flagged)
  })

  it("leaves the account out when the user was already signed in", async () => {
    const { win, confirm } = confirmingWindow()
    await openConfigDialog(win)
    expect(confirm.mock.calls[0][0]).not.toContain(`${getString("dialog-account")}:`)
  })
})
