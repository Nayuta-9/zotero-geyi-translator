import { beforeEach, describe, expect, it, vi } from "vitest"
import { getString } from "../utils/locale"
import {
  type AccountNoticeContent,
  accountNoticeContent,
  showSignedInAccount,
} from "./accountNotice"
import { getCredentials, isLoggedIn, setCredentials } from "./auth"
import { getAccountSnapshot } from "./memberFeatures"

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
  return Promise.resolve({ responseText: "{}" })
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
  setCredentials("sk_live_first", "https://api.example.test/v1")
})

describe("account notice content", () => {
  it("names the signed-in account and offers to sign out", () => {
    const content = accountNoticeContent("owner@example.com")
    expect(content.lines[0]).toContain("owner@example.com")
    expect(content.lines[1]).toBe(getString("account-notice-hint"))
    expect(content.signOutLabel).toBe(getString("account-notice-signout"))
  })

  it("still offers to sign out when the account could not be read", () => {
    const content = accountNoticeContent(undefined)
    expect(content.lines[0]).toBe(getString("account-notice-unknown"))
    expect(content.signOutLabel).toBe(getString("account-notice-signout"))
  })

  it("exists in both English and Simplified Chinese", () => {
    const keys = [
      "account-notice-title",
      "account-notice-email",
      "account-notice-unknown",
      "account-notice-hint",
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
