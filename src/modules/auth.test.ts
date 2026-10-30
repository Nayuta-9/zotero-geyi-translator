import { createHash, webcrypto } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getString } from "../utils/locale"
import {
  codeChallengeFor,
  createCodeVerifier,
  isLoggedIn,
  LoginError,
  loginFailureReason,
  pollOutcome,
  requestFailureKind,
  showLoginFailure,
  startLogin,
} from "./auth"

// Browser sign-in outcomes: the poll statuses that end polling early, the
// local timeout and network give-up, and the dialogs that explain each one.

type PollReply = { status: string; [key: string]: unknown } | Error | string

/** A rejection shaped like `Zotero.HTTP.UnexpectedStatusException`. */
function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, xmlhttp: { status } })
}

const prefs = new Map<string, unknown>()
let clock = 0
let pollReplies: PollReply[] = []
let pollUrls: string[] = []
let startUrls: string[] = []
let pollCalls: { method: string; options: Record<string, any> }[] = []
const launchURL = vi.fn()

function request(
  method: string,
  url: string,
  options: Record<string, any> = {},
): Promise<{ responseText: string }> {
  if (url.includes("/plugin/authorize/start")) {
    startUrls.push(url)
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
    pollCalls.push({ method, options })
    const reply = pollReplies.length > 1 ? pollReplies.shift()! : pollReplies[0]
    if (reply instanceof Error) return Promise.reject(reply)
    if (typeof reply === "string") return Promise.resolve({ responseText: reply })
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
  startUrls = []
  pollCalls = []
  launchURL.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.spyOn(Date, "now").mockImplementation(() => clock)
  stubZotero()
})

describe("code verifier and challenge", () => {
  it("derives the RFC 7636 example challenge", async () => {
    expect(await codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    )
  })

  it("draws 32 random bytes as 43 base64url characters", () => {
    const verifier = createCodeVerifier()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(verifier, "base64url")).toHaveLength(32)
    expect(createCodeVerifier()).not.toBe(verifier)
  })
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

describe("request failure classification", () => {
  it("tells server answers apart from requests that never got one", () => {
    expect(requestFailureKind(httpError(503))).toBe("busy")
    expect(requestFailureKind(httpError(500))).toBe("busy")
    expect(requestFailureKind(httpError(429))).toBe("busy")
    expect(requestFailureKind({ xmlhttp: { status: 502 } })).toBe("busy")
    expect(requestFailureKind(httpError(404))).toBe("rejected")
    expect(requestFailureKind(httpError(0))).toBe("network")
    expect(requestFailureKind(new Error("offline"))).toBe("network")
    expect(requestFailureKind(undefined)).toBe("network")
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
    const body = JSON.parse(pollCalls[0].options.body)
    expect(body.state).toBe("header.payload+/=.sig")
  })

  it("starts with the S256 challenge and proves the verifier only in the poll body", async () => {
    pollReplies = [{ status: "pending" }, { status: "cancelled" }]
    await loginFailure()

    const start = new URL(startUrls[0])
    expect(start.searchParams.has("nonce")).toBe(false)
    expect(start.searchParams.get("code_challenge_method")).toBe("S256")

    expect(pollCalls).toHaveLength(2)
    const verifier = JSON.parse(pollCalls[0].options.body).code_verifier
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    expect(start.searchParams.get("code_challenge")).toBe(challenge)

    for (const call of pollCalls) {
      expect(call.method).toBe("POST")
      expect(JSON.parse(call.options.body).code_verifier).toBe(verifier)
      expect(call.options.headers).toMatchObject({ "Content-Type": "application/json" })
      expect(call.options.logBodyLength).toBe(0)
    }
    for (const url of [...startUrls, ...pollUrls]) expect(url).not.toContain(verifier)
    expect(new URL(pollUrls[0]).search).toBe("")
    expect(JSON.stringify(launchURL.mock.calls)).not.toContain(verifier)
  })

  it("uses a fresh verifier for every sign-in", async () => {
    pollReplies = [{ status: "cancelled" }]
    await loginFailure()
    await loginFailure()
    const verifiers = pollCalls.map((call) => JSON.parse(call.options.body).code_verifier)
    expect(verifiers).toHaveLength(2)
    expect(verifiers[0]).not.toBe(verifiers[1])
    expect(new Set(startUrls).size).toBe(2)
  })

  it("falls back to the main window's WebCrypto when the plugin scope lacks it", async () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    stubZotero({ getMainWindow: () => ({ crypto: webcrypto }) })
    pollReplies = [{ status: "cancelled" }]
    const error = await loginFailure()
    expect(error.reason).toBe("cancelled")
    const verifier = JSON.parse(pollCalls[0].options.body).code_verifier
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    expect(new URL(startUrls[0]).searchParams.get("code_challenge")).toBe(challenge)
  })

  it("fails before any request when no WebCrypto digest is available", async () => {
    vi.stubGlobal("crypto", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
    stubZotero({ getMainWindow: () => null })
    const error = await loginFailure()
    expect(error.reason).toBe("failed")
    expect(startUrls).toHaveLength(0)
    expect(launchURL).not.toHaveBeenCalled()
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

  it("keeps retrying server errors until the authorization window ends", async () => {
    pollReplies = [{ status: "pending" }, httpError(503)]
    const error = await loginFailure()
    expect(error.reason).toBe("busy")
    expect(error.message).toBe(getString("login-busy"))
    expect(clock).toBeGreaterThanOrEqual(10 * 60 * 1000)
  })

  it("keeps polling through 429 and 5xx answers", async () => {
    pollReplies = [httpError(429), httpError(502), httpError(503), { status: "cancelled" }]
    const error = await loginFailure()
    expect(error.reason).toBe("cancelled")
  })

  it("restarts the network give-up clock when the server answers, even with an error", async () => {
    const offline = Array.from({ length: 25 }, () => new Error("offline"))
    pollReplies = [...offline, httpError(503), ...offline, { status: "not_eligible" }]
    const error = await loginFailure()
    expect(error.reason).toBe("not_eligible")
    expect(clock).toBeGreaterThan(60 * 1000)
  })

  it("treats a non-JSON success body as a server problem, not a network one", async () => {
    pollReplies = ["<html>gateway</html>"]
    const error = await loginFailure()
    expect(error.reason).toBe("busy")
  })

  it("stops at once when the server rejects the request", async () => {
    pollReplies = [httpError(404)]
    const error = await loginFailure()
    expect(error.reason).toBe("failed")
    expect(pollUrls).toHaveLength(1)
  })

  it("asks Zotero not to retry 5xx answers on its own", async () => {
    pollReplies = [{ status: "cancelled" }]
    await loginFailure()
    const calls = (Zotero.HTTP.request as ReturnType<typeof vi.fn>).mock.calls
    const authCalls = calls.filter(([, url]) => String(url).includes("/plugin/authorize/"))
    expect(authCalls).toHaveLength(2)
    for (const [, , options] of authCalls) {
      expect(options).toMatchObject({ errorDelayMax: 0 })
    }
  })

  it("reports a busy server when the authorization cannot start", async () => {
    stubZotero({
      HTTP: { request: vi.fn().mockRejectedValue(httpError(503)) },
    })
    const error = await loginFailure()
    expect(error.reason).toBe("busy")
    expect(launchURL).not.toHaveBeenCalled()
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
    ["busy", "login-busy"],
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
    "login-busy",
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
