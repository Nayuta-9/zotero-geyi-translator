import { beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "../utils/api"
import { clearGlossaryCache, getGlossaries } from "./glossary"

beforeEach(() => {
  clearGlossaryCache()
  vi.restoreAllMocks()
})

describe("GEYI-330 glossary cache", () => {
  it("reuses the read-only list within five minutes and supports forced refresh", async () => {
    const list = { data: [], count: 0, note: null }
    const request = vi.spyOn(api, "listGlossaries").mockResolvedValue(list)
    await getGlossaries()
    await getGlossaries()
    expect(request).toHaveBeenCalledTimes(1)
    await getGlossaries(true)
    expect(request).toHaveBeenCalledTimes(2)
  })
})
