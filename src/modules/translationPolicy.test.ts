import { describe, expect, it } from "vitest"
import {
  FALLBACK_CONCURRENCY,
  LARGE_DOCUMENT_MIN_PAGES,
  resolveConcurrencyCap,
  resolveOutputs,
  resolveSpeedMode,
  resolveSubmission,
  speedModeApplicable,
} from "./translationPolicy"

describe("形态适用性(镜像后端 batch_gate)", () => {
  it("只有 reflow + 非标准档够格走慢速档", () => {
    expect(LARGE_DOCUMENT_MIN_PAGES).toBe(100)
    expect(speedModeApplicable("reflow", "high")).toBe(true)
    expect(speedModeApplicable("reflow", "standard")).toBe(false)
    expect(speedModeApplicable("preserve", "high")).toBe(false)
    expect(speedModeApplicable("preserve", "standard")).toBe(false)
  })
})

describe("处理档解算(GEYI-422)", () => {
  it("默认的实时档不受任何权益影响", () => {
    expect(resolveSpeedMode("fast", "reflow", "high", { batchSlow: false })).toEqual({
      speed: "fast",
      downgraded: null,
    })
  })

  it("有权益时尊重用户选的慢速档", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", { batchSlow: true })).toEqual({
      speed: "slow",
      downgraded: null,
    })
  })

  // 这条是本次事故的核心:研究级用户没有 batch_slow,选了慢速档也必须回落成实时,
  // 否则 POST /v1/translations 必然 403。写反了就等于什么都没修。
  it("没有 batch_slow 权益时回落实时档,并标出原因是权益", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", { batchSlow: false })).toEqual({
      speed: "fast",
      downgraded: "entitlement",
    })
  })

  // 这条守 fail-OPEN:离线或旧后端没下发 member_features 时,权益是 undefined。
  // 若把它当成 false,付费用户会在后端抖动时被静默降级 —— 那比 403 更难察觉。
  it("权益未知时保持用户选择(fail-OPEN),不擅自降级", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", {})).toEqual({
      speed: "slow",
      downgraded: null,
    })
    expect(resolveSpeedMode("slow", "reflow", "high")).toEqual({
      speed: "slow",
      downgraded: null,
    })
  })

  it("形态不合格时回落实时档,且原因不是权益", () => {
    expect(resolveSpeedMode("slow", "preserve", "high", { batchSlow: true })).toEqual({
      speed: "fast",
      downgraded: "shape",
    })
    expect(resolveSpeedMode("slow", "reflow", "standard", { batchSlow: true })).toEqual({
      speed: "fast",
      downgraded: "shape",
    })
  })

  it("未知/缺失的档位值一律按实时处理", () => {
    expect(resolveSpeedMode(undefined, "reflow", "high", { batchSlow: true }).speed).toBe(
      "fast",
    )
    expect(resolveSpeedMode("turbo", "reflow", "high", { batchSlow: true }).speed).toBe(
      "fast",
    )
  })
})

describe("输出产物解算", () => {
  it("没请求双语时原样返回", () => {
    expect(resolveOutputs(["pdf"], { bilingual: false })).toEqual({
      formats: ["pdf"],
      bilingual: false,
      downgraded: null,
    })
  })

  it("有权益时保留双语请求", () => {
    expect(resolveOutputs(["pdf_bilingual"], { bilingual: true })).toEqual({
      formats: ["pdf_bilingual"],
      bilingual: true,
      downgraded: null,
    })
  })

  it("没有 bilingual 权益时把双语降成单语 PDF", () => {
    expect(resolveOutputs(["pdf_bilingual"], { bilingual: false })).toEqual({
      formats: ["pdf"],
      bilingual: false,
      downgraded: "entitlement",
    })
  })

  it("权益未知时不动用户的选择(fail-OPEN)", () => {
    expect(resolveOutputs(["pdf_bilingual"], {})).toEqual({
      formats: ["pdf_bilingual"],
      bilingual: true,
      downgraded: null,
    })
  })
})

describe("提交参数的统一解算入口", () => {
  // 这个入口存在的唯一理由:插件有两条提交路径(右键翻译 / 换管线重跑),各算一次
  // 必然漏一条。下面这条用例的输入形状就是重试路径的 TrackedTask.options。
  it("重试路径(带上次记下的 options)同样被降级,不会绕过权益", () => {
    const trackedOptions = {
      layoutMode: "reflow",
      precisionMode: "high",
      speed: "slow",
      outputFormats: ["pdf_bilingual"],
    }
    const out = resolveSubmission(trackedOptions, {
      batchSlow: false,
      bilingual: false,
    })
    expect(out.speed).toBe("fast")
    expect(out.bilingual).toBe(false)
    expect(out.outputFormats).toEqual(["pdf"])
    expect(out.downgrades).toEqual([
      { field: "speed", reason: "entitlement" },
      { field: "bilingual", reason: "entitlement" },
    ])
  })

  it("权益齐全时原样提交,不产生降级说明", () => {
    const out = resolveSubmission(
      {
        layoutMode: "reflow",
        precisionMode: "high",
        speed: "slow",
        outputFormats: ["pdf_bilingual"],
      },
      { batchSlow: true, bilingual: true },
    )
    expect(out.speed).toBe("slow")
    expect(out.bilingual).toBe(true)
    expect(out.downgrades).toEqual([])
  })

  it("缺 outputFormats 时按单语 PDF 兜底", () => {
    const out = resolveSubmission({ layoutMode: "reflow", precisionMode: "high" })
    expect(out.outputFormats).toEqual(["pdf"])
    expect(out.bilingual).toBe(false)
    expect(out.speed).toBe("fast")
  })
})

describe("并发上限", () => {
  it("后端上限未知时回落到既有的硬编码值", () => {
    expect(resolveConcurrencyCap(undefined, undefined)).toBe(FALLBACK_CONCURRENCY)
    expect(resolveConcurrencyCap(99, undefined)).toBe(FALLBACK_CONCURRENCY)
  })

  // 专业级后端允许 8,而插件此前硬编码 3 —— 该放开的地方之前被压住了。
  it("pref 是「不设限」时完全跟随后端档位", () => {
    expect(resolveConcurrencyCap(99, 8)).toBe(8)
    expect(resolveConcurrencyCap(99, 1)).toBe(1)
  })

  it("用户可以主动调低,但不能超过后端档位", () => {
    expect(resolveConcurrencyCap(2, 8)).toBe(2)
    expect(resolveConcurrencyCap(20, 3)).toBe(3)
  })

  it("非法值不会算出 0 或负数", () => {
    expect(resolveConcurrencyCap(0, 8)).toBe(8)
    expect(resolveConcurrencyCap(-5, 8)).toBe(8)
    expect(resolveConcurrencyCap(2, -1)).toBe(2)
  })
})
