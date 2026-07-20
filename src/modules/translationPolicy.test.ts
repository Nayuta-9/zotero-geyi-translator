import { describe, expect, it } from "vitest"
import {
  automaticSpeedMode,
  LARGE_DOCUMENT_MIN_PAGES,
} from "./translationPolicy"

describe("large-document speed policy", () => {
  it("preselects slow for the only pipeline eligible for the large-document tier", () => {
    expect(LARGE_DOCUMENT_MIN_PAGES).toBe(100)
    expect(automaticSpeedMode("reflow", "high")).toBe("slow")
  })

  it("does not apply the slow tier to standard precision or preserve layout", () => {
    expect(automaticSpeedMode("reflow", "standard")).toBe("fast")
    expect(automaticSpeedMode("preserve", "high")).toBe("fast")
    expect(automaticSpeedMode("preserve", "standard")).toBe("fast")
  })
})
