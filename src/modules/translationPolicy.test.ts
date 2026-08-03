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
  // GEYI-528:慢速档已撤除,后端 batch_gate 形态门恒 False,镜像判据随之恒 false。
  // 原契约是「只有 reflow + 非标准档够格」。
  it("恒 false —— 慢速档已撤除", () => {
    expect(LARGE_DOCUMENT_MIN_PAGES).toBe(100)
    expect(speedModeApplicable("reflow", "high")).toBe(false)
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

  // GEYI-528:撤除后无论权益如何,一律回落实时档,降级原因恒为 shape。
  it("撤除后即便有权益也回落实时档", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", { batchSlow: true })).toEqual({
      speed: "fast",
      downgraded: "shape",
    })
  })

  // 原契约(GEYI-422):研究级用户没有 batch_slow,选慢速必须回落,否则必 403。
  // GEYI-528 撤除后形态门先一步拦下,降级原因变成 shape —— 权益门不再有机会生效。
  it("没有 batch_slow 权益时同样回落实时档", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", { batchSlow: false })).toEqual({
      speed: "fast",
      downgraded: "shape",
    })
  })

  // 原契约守 fail-OPEN(权益 undefined 时不擅自降级)。GEYI-528 撤除后形态门恒
  // 关闭,fail-OPEN 已无适用场景 —— 无论权益已知与否都回落实时档。
  it("权益未知时同样回落实时档", () => {
    expect(resolveSpeedMode("slow", "reflow", "high", {})).toEqual({
      speed: "fast",
      downgraded: "shape",
    })
    expect(resolveSpeedMode("slow", "reflow", "high")).toEqual({
      speed: "fast",
      downgraded: "shape",
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
    // GEYI-528:speed 的降级原因从 entitlement 变成 shape(形态门先一步拦下);
    // bilingual 的权益门不受影响。
    expect(out.downgrades).toEqual([
      { field: "speed", reason: "shape" },
      { field: "bilingual", reason: "entitlement" },
    ])
  })

  it("权益齐全时原样提交,除已撤除的慢速档外不产生降级说明", () => {
    const out = resolveSubmission(
      {
        layoutMode: "reflow",
        precisionMode: "high",
        speed: "slow",
        outputFormats: ["pdf_bilingual"],
      },
      { batchSlow: true, bilingual: true },
    )
    // GEYI-528:慢速档已撤除,即便权益齐全也回落实时档。
    expect(out.speed).toBe("fast")
    expect(out.bilingual).toBe(true)
    expect(out.downgrades).toEqual([{ field: "speed", reason: "shape" }])
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
