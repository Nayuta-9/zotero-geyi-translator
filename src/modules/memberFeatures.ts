import { type AccountInfo, ApiError, api } from "../utils/api"
import { isLoggedIn } from "./auth"

// 会员权益的唯一读取入口(GEYI-422)。语义对齐网页端的 useMemberFeatures:
// **判断一律看后端下发的权益键,绝不在这里按 membership_tier 反推**——档位到权益的
// 映射只有后端 features.py 一份(GEYI-403),插件复刻一张就必然漂移(advanced 停售档、
// unlimited 特权合成档都是现成的反例)。
//
// 三态是这一层的全部要点,写反的症状分别是「付费用户被误锁」和「过期用户看着能用、
// 点了就 403」:
//   ok      —— /v1/me 正常返回。有 member_features 就按它判;字段缺失(旧后端)
//              则每一项都返回 undefined,交给调用方 fail-OPEN。
//   expired —— /v1/me 自己返回 403。会员过期时后端在 deps 层就拦下了整把 Key
//              (assert_api_key_membership),插件**永远拿不到「空 member_features」**,
//              只会拿到 403。所以这是一个确定的负面事实,该锁,不能并进 unknown。
//   unknown —— 未登录 / 网络失败 / 其它错误。什么都不知道,一律不锁。

export const MEMBER_FEATURE = {
  BILINGUAL: "bilingual",
  GLOSSARY: "glossary",
  CUSTOM_PROMPT: "custom_prompt",
  PPT_HIGH: "ppt_high",
  ZOTERO: "zotero",
  OPENAPI: "openapi",
  BATCH_SLOW: "batch_slow",
} as const

export type MemberFeature = (typeof MEMBER_FEATURE)[keyof typeof MEMBER_FEATURE]

/** 权益所需的最低档位 —— **仅用于挑选提示文案**,不参与任何判定。 */
export const FEATURE_MIN_TIER: Record<string, "research" | "professional"> = {
  [MEMBER_FEATURE.BILINGUAL]: "research",
  [MEMBER_FEATURE.GLOSSARY]: "research",
  [MEMBER_FEATURE.PPT_HIGH]: "research",
  [MEMBER_FEATURE.ZOTERO]: "research",
  [MEMBER_FEATURE.CUSTOM_PROMPT]: "professional",
  [MEMBER_FEATURE.OPENAPI]: "professional",
  [MEMBER_FEATURE.BATCH_SLOW]: "professional",
}

export type MembershipState = "ok" | "expired" | "unknown"

export interface AccountSnapshot {
  state: MembershipState
  account?: AccountInfo
}

const CACHE_MS = 60 * 1000
let cached: { value: AccountSnapshot; expiresAt: number } | undefined

/**
 * 取账户快照。默认走 60s 缓存;`force=true` 穿透(提交路径用,保证刚升级即解锁)。
 *
 * 失败**不写缓存** —— 否则一次网络抖动会把「不知道」钉死一分钟。
 */
export async function getAccountSnapshot(force = false): Promise<AccountSnapshot> {
  if (!isLoggedIn()) return { state: "unknown" }
  if (!force && cached && Date.now() < cached.expiresAt) return cached.value
  let value: AccountSnapshot
  try {
    value = { state: "ok", account: await api.me() }
  } catch (error) {
    // 403 = 会员过期/未开通(deps.assert_api_key_membership)。这是确定事实,可缓存。
    // 其它错误(网络、5xx、401 已在 api 层清凭证)一律 unknown,且不缓存。
    if (error instanceof ApiError && error.status === 403) {
      value = { state: "expired" }
    } else {
      return { state: "unknown" }
    }
  }
  cached = { value, expiresAt: Date.now() + CACHE_MS }
  return value
}

export function clearAccountCache(): void {
  cached = undefined
}

/**
 * 是否拥有某项权益。**三态返回**:`undefined` = 不知道,调用方必须按 fail-OPEN
 * 处理(不上锁、不改提交值),不能把它当 false。
 */
export function hasFeature(
  snapshot: AccountSnapshot,
  feature: MemberFeature,
): boolean | undefined {
  if (snapshot.state === "unknown") return undefined
  if (snapshot.state === "expired") return false
  const features = snapshot.account?.member_features
  if (features === undefined) return undefined
  return features.includes(feature)
}
