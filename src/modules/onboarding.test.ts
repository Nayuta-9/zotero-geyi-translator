import { beforeEach, describe, expect, it, vi } from "vitest"
import { config } from "../utils/config"
import {
  needsOnboarding,
  ONBOARDING_PREF,
  onboardingContent,
  showOnboardingIfNeeded,
} from "./onboarding"

// First-run guidance: shown once per installed version, never blocking, and
// covering sign-in, right-click translation and the membership requirement.

const prefs = new Map<string, unknown>()
const PREF_KEY = `${config.prefsPrefix}.${ONBOARDING_PREF}`

function stubZotero(locale = "en-US"): void {
  vi.stubGlobal("Zotero", {
    locale,
    Promise: { delay: async () => undefined },
    Prefs: {
      get: (key: string) => prefs.get(key),
      set: (key: string, value: unknown) => prefs.set(key, value),
      clear: (key: string) => prefs.delete(key),
    },
  })
}

beforeEach(() => {
  prefs.clear()
  stubZotero()
})

describe("when the guidance is due", () => {
  it("is due on a new install and after an upgrade, not again for the same version", () => {
    expect(needsOnboarding(undefined, "1.2.3")).toBe(true)
    expect(needsOnboarding("", "1.2.3")).toBe(true)
    expect(needsOnboarding("1.2.2", "1.2.3")).toBe(true)
    expect(needsOnboarding("1.2.3", "1.2.3")).toBe(false)
  })

  it("opens once on first start and not on the next start", async () => {
    const open = vi.fn()
    expect(await showOnboardingIfNeeded(open)).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
    expect(prefs.get(PREF_KEY)).toBe(config.version)

    expect(await showOnboardingIfNeeded(open)).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("opens again after an upgrade", async () => {
    prefs.set(PREF_KEY, "0.0.1")
    const open = vi.fn()
    expect(await showOnboardingIfNeeded(open)).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("is not retried on every start when the window fails to open", async () => {
    const open = vi.fn(() => {
      throw new Error("no window")
    })
    await expect(showOnboardingIfNeeded(open)).resolves.toBe(true)
    await showOnboardingIfNeeded(open)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe("guidance content", () => {
  it("covers sign-in, right-click translation and the membership requirement while signed out", () => {
    const content = onboardingContent(false)
    expect(content.showSignIn).toBe(true)
    const text = content.lines.join("\n")
    expect(text).toContain("Settings → Geyi Translator")
    expect(text).toContain("Translate with Geyi")
    expect(text).toContain("Research plan")
    expect(text).toContain("1-day trial")
  })

  it("drops the sign-in step once signed in", () => {
    const content = onboardingContent(true)
    expect(content.showSignIn).toBe(false)
    expect(content.lines).toHaveLength(2)
    expect(content.lines.join("\n")).toContain("Translate with Geyi")
  })

  it("is localized for Simplified Chinese", () => {
    stubZotero("zh-CN")
    const content = onboardingContent(false)
    expect(content.title).toBe("欢迎使用格译 Zotero 插件")
    const text = content.lines.join("\n")
    expect(text).toContain("用格译翻译")
    expect(text).toContain("研究级")
    expect(text).toContain("1 天体验")
  })
})

describe("startup wiring", () => {
  it("starts the guidance without awaiting it", async () => {
    const { readFileSync } = await import("node:fs")
    const { dirname, resolve } = await import("node:path")
    const { fileURLToPath } = await import("node:url")
    const hooks = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../hooks.ts"),
      "utf8",
    )
    expect(hooks).toContain("void showOnboardingIfNeeded()")
    expect(hooks).not.toContain("await showOnboardingIfNeeded")
  })
})
