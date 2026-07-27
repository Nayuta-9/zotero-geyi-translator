export type SpeedMode = "fast" | "slow"

// 与后端 BATCH_API_MIN_PAGES 当前契约一致：只有满 100 页的高精度 AI 重排
// 才属于“大文件档”。插件先提交 slow 偏好，实际页数由后端解析并决定是否走 Batch；
// 不足门槛的文件仍走实时路径。
export const LARGE_DOCUMENT_MIN_PAGES = 100

/** 降级原因。shape=这个任务形态本就不适用；entitlement=会员档位不够。 */
export type DowngradeReason = "shape" | "entitlement" | null

/**
 * 任务**形态**是否够格走慢速档 —— 镜像后端 `batch_gate._batch_shape_eligible`：
 * 仅 reflow 且非标准档（标准档主翻译走轻量引擎，栈里没有批处理等价物）。
 *
 * 与后端保持镜像而不是自己发明判据：后端 `applicable_speed_mode` 会把不合形态的
 * 档位归一成 None，插件若判得比它宽，用户就会在摘要里看到一个根本不会生效的档。
 */
export function speedModeApplicable(
  layoutMode: string,
  precisionMode: string,
): boolean {
  return layoutMode === "reflow" && precisionMode !== "standard"
}

/**
 * 解算真正要提交的处理档 = 用户选择 ∩ 形态适用性 ∩ 会员权益（GEYI-422）。
 *
 * 这个函数替代了旧的 `automaticSpeedMode(layoutMode, precisionMode)`。旧版把
 * 「这个形态适合走 batch」直接当成「用户想要慢速档」，于是插件默认的 reflow+high
 * 恒推出 slow，而 slow 判的是**专业级**权益 FEATURE_BATCH_SLOW —— 只有研究级的
 * 插件用户（插件准入档位就是研究级）每次翻译都吃 403，且他从没选过慢速档。现在
 * 档位由用户在设置页显式选，默认 fast。
 *
 * `batchSlow` 三态是刻意的：
 * - `true`  有权益，尊重用户选择
 * - `false` 明确没有（含会员已过期）→ 回落 fast，避免必然的 403
 * - `undefined` 不知道（离线 / 旧后端没下发 member_features）→ **fail-OPEN**，
 *   保持用户选择照旧提交。这与本次改动前的行为一致，不是新增回归；把未知当成
 *   没有，会在后端抖动时把付费用户静默降级，那比 403 更难察觉。
 */
export function resolveSpeedMode(
  requested: string | undefined,
  layoutMode: string,
  precisionMode: string,
  opts: { batchSlow?: boolean } = {},
): { speed: SpeedMode; downgraded: DowngradeReason } {
  if (requested !== "slow") return { speed: "fast", downgraded: null }
  if (!speedModeApplicable(layoutMode, precisionMode)) {
    return { speed: "fast", downgraded: "shape" }
  }
  if (opts.batchSlow === false) return { speed: "fast", downgraded: "entitlement" }
  return { speed: "slow", downgraded: null }
}

/**
 * 解算输出产物与 bilingual 标志。双语对照是研究级权益 FEATURE_BILINGUAL，后端在
 * `public_api.create_translation` 里对 `bilingual=true` 判门。
 *
 * `bilingual` 权益同样三态，语义与 {@link resolveSpeedMode} 的 `batchSlow` 一致。
 *
 * 注：preserve 管线（BabelDOC）产出的双语键叫 `pdf_dual` 而非 `pdf_bilingual`，
 * 而后端又把 `effective_bilingual` 限定在 reflow —— 那处键名错配是既有缺陷，与
 * 会员等级无关，不在本函数职责内。
 */
export function resolveOutputs(
  outputFormats: string[],
  opts: { bilingual?: boolean } = {},
): { formats: string[]; bilingual: boolean; downgraded: DowngradeReason } {
  const wantsBilingual = outputFormats.includes("pdf_bilingual")
  if (!wantsBilingual) {
    return { formats: outputFormats, bilingual: false, downgraded: null }
  }
  if (opts.bilingual === false) {
    return {
      formats: outputFormats.map((f) => (f === "pdf_bilingual" ? "pdf" : f)),
      bilingual: false,
      downgraded: "entitlement",
    }
  }
  return { formats: outputFormats, bilingual: true, downgraded: null }
}

export interface SubmissionInput {
  layoutMode: string
  precisionMode: string
  /** 用户选择的处理档（设置页的 speedMode，或重试时沿用的当前设置）。 */
  speed?: string
  outputFormats?: string[]
}

export interface ResolvedSubmission {
  speed: SpeedMode
  bilingual: boolean
  outputFormats: string[]
  /** 被降级的项，供调用方向用户解释。空数组=用户选什么就提交什么。 */
  downgrades: Array<{ field: "speed" | "bilingual"; reason: Exclude<DowngradeReason, null> }>
}

/**
 * 提交参数的**唯一**解算入口（GEYI-422）。
 *
 * 存在的理由是插件有两条提交路径 —— 右键翻译走 `openConfigDialog`，「换管线重跑」
 * 走 `retryTrackedTask`，后者完全绕开前者。两处各算一次的写法已经出过事：主路径修好了，
 * 用户一点重试照样 403，而重试恰恰是翻译失败后最可能被点的按钮。所以解算收在这里，
 * 由 `runTranslation`（两条路径唯一的汇合点）调用一次。
 */
export function resolveSubmission(
  input: SubmissionInput,
  entitlements: { batchSlow?: boolean; bilingual?: boolean } = {},
): ResolvedSubmission {
  const formats = input.outputFormats?.length ? input.outputFormats : ["pdf"]
  const speed = resolveSpeedMode(
    input.speed,
    input.layoutMode,
    input.precisionMode,
    { batchSlow: entitlements.batchSlow },
  )
  const outputs = resolveOutputs(formats, { bilingual: entitlements.bilingual })
  const downgrades: ResolvedSubmission["downgrades"] = []
  if (speed.downgraded) downgrades.push({ field: "speed", reason: speed.downgraded })
  if (outputs.downgraded) {
    downgrades.push({ field: "bilingual", reason: outputs.downgraded })
  }
  return {
    speed: speed.speed,
    bilingual: outputs.bilingual,
    outputFormats: outputs.formats,
    downgrades,
  }
}

/** 后端上限未知（离线 / 旧后端未下发）时的并发回落值，与本次改动前的硬编码一致。 */
export const FALLBACK_CONCURRENCY = 3

/**
 * 同时进行的任务数上限。权威在后端（`task_service._TIER_ACTIVE`，按档位 1/3/8），
 * 插件的 pref 只用来让用户**主动调低**（网络差时少并发），不能反过来把档位允许的
 * 并发压下去 —— 所以取两者较小值，而 pref 的默认值是一个大数（见 addon/prefs.js），
 * 意思是「不设限，听后端的」。
 */
export function resolveConcurrencyCap(
  pref: number | undefined,
  backendLimit: number | undefined,
): number {
  const backend =
    typeof backendLimit === "number" && backendLimit > 0
      ? backendLimit
      : FALLBACK_CONCURRENCY
  const user = typeof pref === "number" && pref > 0 ? pref : backend
  return Math.max(1, Math.min(user, backend))
}
