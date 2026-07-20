import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  addVersionSuffix,
  languageSuffix,
  loadTrackedTasks,
  nextVersion,
  outputBaseName,
  saveTrackedTasks,
  type TrackedTask,
} from "./taskState"

const prefs = new Map<string, string | number | boolean>()

beforeEach(() => {
  prefs.clear()
  vi.stubGlobal("Zotero", {
    Prefs: {
      get: (key: string) => prefs.get(key),
      set: (key: string, value: string | number | boolean) => prefs.set(key, value),
      clear: (key: string) => prefs.delete(key),
    },
  })
})

describe("GEYI-329 output naming", () => {
  it("uses the acceptance-test suffixes", () => {
    expect(outputBaseName("paper", "pdf", "zh-CN")).toBe("paper_zh.pdf")
    expect(outputBaseName("paper", "pdf_bilingual", "zh-CN")).toBe(
      "paper_bilingual.pdf",
    )
    expect(outputBaseName("paper", "docx", "zh-CN")).toBe("paper_zh.docx")
  })

  it("keeps useful language suffixes", () => {
    expect(languageSuffix("zh-TW")).toBe("zh-TW")
    expect(languageSuffix("ja-JP")).toBe("ja")
  })

  it("increments versions without skipping the base version", () => {
    const base = "paper_zh.pdf"
    expect(nextVersion(base, [])).toBe(1)
    expect(nextVersion(base, [base])).toBe(2)
    expect(nextVersion(base, [base, "paper_zh_v2.pdf", "other.pdf"])).toBe(3)
    expect(addVersionSuffix(base, 3)).toBe("paper_zh_v3.pdf")
  })
})

describe("GEYI-329 tracked task persistence", () => {
  it("round-trips and sorts newest first", () => {
    const makeTask = (jobId: string, submittedAt: string): TrackedTask => ({
      jobId,
      sourceLibraryID: 1,
      sourceAttachmentKey: `source-${jobId}`,
      originalName: `paper-${jobId}`,
      options: {
        targetLanguage: "zh-CN",
        layoutMode: "reflow",
        precisionMode: "high",
      },
      duplicateChoice: "version",
      overwriteItemKeys: [],
      status: "queued",
      progress: 0,
      error: null,
      submittedAt,
      attachedOutputs: [],
    })
    saveTrackedTasks([
      makeTask("old", "2026-07-20T01:00:00.000Z"),
      makeTask("new", "2026-07-20T02:00:00.000Z"),
    ])
    expect(loadTrackedTasks().map((task) => task.jobId)).toEqual(["new", "old"])
  })

  it("rejects malformed persisted data", () => {
    prefs.set("extensions.zotero.geyi.trackedTasks", "not-json")
    expect(loadTrackedTasks()).toEqual([])
  })
})
