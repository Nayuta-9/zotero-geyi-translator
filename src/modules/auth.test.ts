import { beforeEach, describe, expect, it, vi } from "vitest"
import { getString } from "../utils/locale"
import {
  isLoggedIn,
  LoginError,
  loginFailureReason,
  pollOutcome,
  showLoginFailure,
  startLogin,
} from "./auth"

// Browser sign-in outcomes: the poll statuses that end polling early, the
// local timeout and network give-up, and the dialogs that explain each one.

type PollReply = { status: string; [key: string]: unknown } | Error

const prefs = new Map<string, unknown>()
let clock = 0
let pollReplies: PollReply[] = []
let pollUrls: string[] = []
const launchURL = vi.fn()

function request(_method: string, url: string): Promise<{ responseText: string }> {
  if (url.includes("/plugin/authorize/start")) {
    return Promise.resolve({
      responseText: JSON.stringify({
        authorize_url: "https://www.geyi.net/plugin/authorize?state=st",
        state_token: "header.payload+/=.sig",
        callback_port: 23119,
      }),
    })
  }
  if (url.includes("/plugin/authorize/poll")) {
    pollUrls.push(url)
    const reply = pollReplies.length > 1 ? pollReplies.shift()! : pollReplies[0]
    if (reply instanceof Error) return Promise.reject(reply)
    return Promise.resolve({ responseText: JSON.stringify(reply) })
  }
  return Promise.resolve({ responseText: "{}" })
}

function stubZotero(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal("Zotero", {
    locale: "en-US",
    HTTP: { request: vi.fn(request) },
    launchURL,
    Promise: {
      delay: async (ms: number) => {
        clock += ms
      },
    },
    Prefs: {
      get: (key: string) => prefs.get(key),
      set: (key: string, value: unknown) => prefs.set(key, value),
      clear: (key: string) => prefs.delete(key),
    },
    ...overrides,
  })
}

async function loginFailure(): Promise<LoginError> {
  const error = await startLogin().then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LoginError)
  return error as LoginError
}

beforeEach(() => {
  prefs.clear()
  clock = 0
  pollReplies = []
  pollUrls = []
  launchURL.mockClear()
  vi.restoreAllMocks()
  vi.spyOn(Date, "now").mockImplementation(() => clock)
  stubZotero()
})

describe("poll status mapping", () => {
  it("keeps the known statuses and reads anything else as pending", () => {
    expect(pollOutcome("ready")).toBe("ready")
    expect(pollOutcome("not_eligible")).toBe("not_eligible")
    expect(pollOutcome("cancelled")).toBe("cancelled")
    expect(pollOutcome("expired")).toBe("expired")
    expect(pollOutcome("pending")).toBe("pending")
    expect(pollOutcome("some_future_status")).toBe("pending")
    expect(pollOutcome(undefined)).toBe("pending")
  })
})

describe("startLogin", () => {
  it.each(["not_eligible", "cancelled", "expired"] as const)(
    "stops at the first %s status instead of waiting for the timeout",
    async (status) => {
      pollReplies = [{ status: "pending" }, { status }]
      const error = await loginFailure()
      expect(error.reason).toBe(status)
      expect(pollUrls).toHaveLength(2)
      expect(clock).toBeLessThan(10_000)
      expect(isLoggedIn()).toBe(false)
    },
  )

  it("opens the consent page and polls with the signed state", async () => {
    pollReplies = [{ status: "cancelled" }]
    await loginFailure()
    expect(launchURL).toHaveBeenCalledWith(
      "https://www.geyi.net/plugin/authorize?state=st",
    )
    const url = new URL(pollUrls[0])
    expect(url.searchParams.get("state")).toBe("header.payload+/=.sig")
    expect(url.searchParams.get("nonce")).toMatch(/^[0-9a-f]{48}$/)
  })

  it("keeps polling through unknown statuses and signs in on ready", async () => {
    pollReplies = [
      { status: "some_future_status" },
      {
        status: "ready",
        api_key: "sk_live_abc",
        api_base_url: "https://api.example.test/v1",
      },
    ]
    await startLogin()
    expect(pollUrls).toHaveLength(2)
    expect(isLoggedIn()).toBe(true)
  })

  it("reports a timeout once the authorization window has passed", async () => {
    pollReplies = [{ status: "pending" }]
    const error = await loginFailure()
    expect(error.reason).toBe("timeout")
    expect(clock).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })

  it("reports a network error after a sustained outage", async () => {
    pollReplies = [{ status: "pending" }, new Error("offline")]
    const error = await loginFailure()
    expect(error.reason).toBe("network")
    expect(clock).toBeLessThan(2 * 60 * 1000)
  })

  it("rides out a brief outage", async () => {
    pollReplies = [
      new Error("offline"),
      new Error("offline"),
      { status: "pending" },
      { status: "cancelled" },
    ]
    const error = await loginFailure()
    expect(error.reason).toBe("cancelled")
  })

  it("reports a network error when the authorization cannot start", async () => {
    stubZotero({
      HTTP: { request: vi.fn().mockRejectedValue(new Error("offline")) },
    })
    const error = await loginFailure()
    expect(error.reason).toBe("network")
    expect(launchURL).not.toHaveBeenCalled()
  })

  it("explains the failure in the error message", async () => {
    pollReplies = [{ status: "not_eligible" }]
    const error = await loginFailure()
    expect(error.message).toBe(getString("login-not-eligible"))
  })
})

describe("showLoginFailure", () => {
  function fakeWindow(confirmResult: boolean) {
    return {
      alert: vi.fn(),
      confirm: vi.fn().mockReturnValue(confirmResult),
    } as unknown as Window & {
      alert: ReturnType<typeof vi.fn>
      confirm: ReturnType<typeof vi.fn>
    }
  }

  it("offers the plans page for an ineligible membership", () => {
    const win = fakeWindow(true)
    showLoginFailure(win, new LoginError("not_eligible"))
    expect(win.confirm).toHaveBeenCalledWith(
      expect.stringContaining(getString("login-not-eligible")),
    )
    expect(win.confirm).toHaveBeenCalledWith(
      expect.stringContaining(getString("dialog-upgrade")),
    )
    expect(launchURL).toHaveBeenCalledWith(
      "https://www.geyi.net/billing?source=zotero_plugin",
    )
    expect(win.alert).not.toHaveBeenCalled()
  })

  it("does not open the plans page when the user declines", () => {
    const win = fakeWindow(false)
    showLoginFailure(win, new LoginError("not_eligible"))
    expect(launchURL).not.toHaveBeenCalled()
  })

  it.each([
    ["cancelled", "login-cancelled"],
    ["expired", "login-expired"],
    ["timeout", "login-timeout"],
    ["network", "login-network"],
  ] as const)("shows the %s explanation", (reason, key) => {
    const win = fakeWindow(true)
    showLoginFailure(win, new LoginError(reason))
    expect(win.alert).toHaveBeenCalledWith(getString(key))
    expect(win.confirm).not.toHaveBeenCalled()
  })

  it("falls back to the generic message for other errors", () => {
    const win = fakeWindow(true)
    showLoginFailure(win, new Error("boom"))
    expect(loginFailureReason(new Error("boom"))).toBe("failed")
    expect(win.alert).toHaveBeenCalledWith(getString("auth-failed"))
  })
})

describe("login failure strings", () => {
  const keys = [
    "login-not-eligible",
    "login-cancelled",
    "login-expired",
    "login-timeout",
    "login-network",
  ]

  it("exist in both English and Simplified Chinese", () => {
    const en = keys.map((key) => getString(key))
    stubZotero({ locale: "zh-CN" })
    const zh = keys.map((key) => getString(key))
    keys.forEach((key, i) => {
      expect(en[i]).not.toBe(key)
      expect(zh[i]).not.toBe(key)
      expect(zh[i]).not.toBe(en[i])
    })
    expect(new Set(en).size).toBe(keys.length)
  })

  it("names the required tier for an ineligible membership", () => {
    expect(getString("login-not-eligible")).toContain("Research plan")
    stubZotero({ locale: "zh-CN" })
    expect(getString("login-not-eligible")).toContain("研究级")
  })
})
