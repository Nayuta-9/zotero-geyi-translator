import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getString } from "../utils/locale"
import { accountConfirmContent, accountLabel, promptAccountConfirm } from "./accountNotice"
import { setCredentials } from "./auth"
import { clearGlossaryCache } from "./glossary"
import { clearAccountCache, getAccountSnapshot } from "./memberFeatures"
import { openConfigDialog } from "./translate"

// Naming the account a key belongs to: the blocking confirmation a browser
// sign-in shows before keeping a new key, and the translation settings summary.

const prefs = new Map<string, unknown>()
let meReply: Record<string, unknown> | Error = {}

function request(_method: string, url: string): Promise<{ responseText: string }> {
  if (url.endsWith("/me")) {
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

beforeEach(() => {
  prefs.clear()
  meReply = { email: "owner@example.com" }
  vi.unstubAllGlobals()
  stubZotero()
  clearAccountCache()
  clearGlossaryCache()
  setCredentials("sk_live_first", "https://api.example.test/v1")
})

describe("account confirmation content", () => {
  it("names the account by its email", () => {
    const content = accountConfirmContent("victim.owner@example.com")
    expect(content.title).toBe(getString("account-confirm-title"))
    expect(content.message).toContain("victim.owner@example.com")
    expect(content.confirmLabel).toBe(getString("account-confirm-yes"))
    expect(content.rejectLabel).toBe(getString("account-confirm-no"))
  })

  it("says the account is unknown when the backend does not name it", () => {
    expect(accountConfirmContent(undefined).message).toContain(getString("account-confirm-unknown"))
  })

  it("inserts the account literally even when it contains replacement patterns", () => {
    const message = accountConfirmContent("$&$`…@example.com").message
    expect(message).toContain("$&$`…@example.com")
    expect(message).not.toContain("{account}")
  })

  it("tells the user to confirm only a sign-in started in their own Zotero", () => {
    expect(accountConfirmContent("a…@b.c").message).toContain("your own Zotero")
    stubZotero("zh-CN")
    expect(accountConfirmContent("a…@b.c").message).toContain("自己的 Zotero")
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
      "account-confirm-title",
      "account-confirm-body",
      "account-confirm-unknown",
      "account-confirm-yes",
      "account-confirm-no",
      "account-label-unknown",
      "account-label-membership",
      "dialog-account",
    ]
    const en = keys.map((key) => getString(key))
    stubZotero("zh-CN")
    const zh = keys.map((key) => getString(key))
    keys.forEach((key, i) => {
      expect(en[i]).not.toBe(key)
      expect(zh[i]).not.toBe(key)
      expect(zh[i]).not.toBe(en[i])
    })
  })
})

describe("promptAccountConfirm", () => {
  function stubPrompt(pressed: number) {
    const confirmEx = vi.fn().mockReturnValue(pressed)
    const prompt = {
      BUTTON_POS_0: 1,
      BUTTON_POS_1: 256,
      BUTTON_TITLE_IS_STRING: 127,
      BUTTON_POS_1_DEFAULT: 256 * 256 * 256,
      confirmEx,
    }
    vi.stubGlobal("Services", { prompt })
    return { confirmEx, prompt }
  }

  it("confirms only on the first button and makes rejection the default", () => {
    const { confirmEx, prompt } = stubPrompt(0)
    const parent = {} as Window
    const content = accountConfirmContent("victim.owner@example.com")
    expect(promptAccountConfirm(parent, content)).toBe(true)
    const [win, title, message, flags, yes, no] = confirmEx.mock.calls[0]
    expect(win).toBe(parent)
    expect(title).toBe(content.title)
    expect(message).toBe(content.message)
    expect(yes).toBe(content.confirmLabel)
    expect(no).toBe(content.rejectLabel)
    expect(flags & prompt.BUTTON_POS_1_DEFAULT).toBe(prompt.BUTTON_POS_1_DEFAULT)
  })

  it.each([1, 2, -1])("reads button %i, or a closed dialog, as a rejection", (pressed) => {
    stubPrompt(pressed)
    expect(promptAccountConfirm(null, accountConfirmContent(undefined))).toBe(false)
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
    const signIn = command.indexOf("await startLogin({ win })")
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
