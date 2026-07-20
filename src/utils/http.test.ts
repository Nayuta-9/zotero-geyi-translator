import { beforeEach, describe, expect, it, vi } from "vitest"
import { config } from "./config"
import { withPluginIdentity } from "./http"

const CookieSandbox = vi.fn(function CookieSandbox(this: any, ...args: unknown[]) {
  this.args = args
})

beforeEach(() => {
  CookieSandbox.mockClear()
  vi.stubGlobal("Zotero", { CookieSandbox })
})

describe("GEYI-330 plugin request identity", () => {
  it("sets both the real-UA sandbox and the gateway fallback header", () => {
    const result = withPluginIdentity("https://example.test/v1/me", {
      headers: { Authorization: "Bearer test" },
    })
    expect(CookieSandbox).toHaveBeenCalledWith(
      null,
      "https://example.test/v1/me",
      "",
      config.userAgent,
    )
    expect(result.headers).toEqual({
      "X-Geyi-Client": config.userAgent,
      Authorization: "Bearer test",
    })
    expect(result.cookieSandbox).toBeTruthy()
  })
})
