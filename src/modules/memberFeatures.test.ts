import { beforeEach, describe, expect, it, vi } from "vitest"
import { type AccountInfo, ApiError, api } from "../utils/api"
import * as auth from "./auth"
import {
  clearAccountCache,
  getAccountSnapshot,
  hasFeature,
  MEMBER_FEATURE,
} from "./memberFeatures"

// 这一层只有两个容易写反的地方,写反的症状都很隐蔽,所以逐条钉死:
//   ① fail-OPEN:权益「不知道」时必须当成有,否则一次网络抖动就把付费用户的功能全锁掉
//   ② 403 ≠ 空权益集:会员过期时后端在 deps 层就拦下整把 Key,插件永远拿不到「空
//      member_features」,只会拿到 403。若把 403 并进「不知道」,设置页就会写着「已登录」
//      且所有选项可点,点了全 403 —— 那正是本次要修的症状。

const ACCOUNT: AccountInfo = {
  email: "u@example.com",
  credit_balance: 100,
  available: 80,
  held: 20,
  membership_tier: "research",
  membership_active: true,
  tier_expires_at: null,
  member_features: ["bilingual", "glossary", "ppt_high", "zotero"],
}

beforeEach(() => {
  clearAccountCache()
  vi.restoreAllMocks()
  vi.spyOn(auth, "isLoggedIn").mockReturnValue(true)
})

describe("账户快照缓存", () => {
  it("60 秒内复用同一次请求,force 可穿透", async () => {
    const request = vi.spyOn(api, "me").mockResolvedValue(ACCOUNT)
    await getAccountSnapshot()
    await getAccountSnapshot()
    expect(request).toHaveBeenCalledTimes(1)
    await getAccountSnapshot(true)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("clearAccountCache 之后重新取", async () => {
    const request = vi.spyOn(api, "me").mockResolvedValue(ACCOUNT)
    await getAccountSnapshot()
    clearAccountCache()
    await getAccountSnapshot()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("网络失败不写缓存 —— 否则一次抖动会把「不知道」钉死一分钟", async () => {
    const request = vi.spyOn(api, "me").mockRejectedValue(new Error("offline"))
    expect((await getAccountSnapshot()).state).toBe("unknown")
    expect((await getAccountSnapshot()).state).toBe("unknown")
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("未登录直接返回 unknown,不打网络", async () => {
    vi.spyOn(auth, "isLoggedIn").mockReturnValue(false)
    const request = vi.spyOn(api, "me").mockResolvedValue(ACCOUNT)
    expect((await getAccountSnapshot()).state).toBe("unknown")
    expect(request).not.toHaveBeenCalled()
  })
})

describe("权益判定的三态", () => {
  it("有下发时按权益键判,不按档位反推", async () => {
    vi.spyOn(api, "me").mockResolvedValue(ACCOUNT)
    const snap = await getAccountSnapshot()
    expect(hasFeature(snap, MEMBER_FEATURE.BILINGUAL)).toBe(true)
    // 研究级没有 batch_slow —— 这正是要锁住的那一项。
    expect(hasFeature(snap, MEMBER_FEATURE.BATCH_SLOW)).toBe(false)
  })

  it("旧后端没下发 member_features 时一律返回 undefined(fail-OPEN)", async () => {
    const legacy = { ...ACCOUNT }
    delete (legacy as { member_features?: string[] }).member_features
    vi.spyOn(api, "me").mockResolvedValue(legacy)
    const snap = await getAccountSnapshot()
    expect(snap.state).toBe("ok")
    expect(hasFeature(snap, MEMBER_FEATURE.BILINGUAL)).toBeUndefined()
    expect(hasFeature(snap, MEMBER_FEATURE.BATCH_SLOW)).toBeUndefined()
  })

  it("离线时一律 undefined —— 不许把「不知道」当成「没有」", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new Error("offline"))
    const snap = await getAccountSnapshot()
    expect(snap.state).toBe("unknown")
    expect(hasFeature(snap, MEMBER_FEATURE.BILINGUAL)).toBeUndefined()
  })

  it("403 是 expired 而不是 unknown,且权益判定为 false(该锁就锁)", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(403, "会员已过期"))
    const snap = await getAccountSnapshot()
    expect(snap.state).toBe("expired")
    expect(hasFeature(snap, MEMBER_FEATURE.BILINGUAL)).toBe(false)
    expect(hasFeature(snap, MEMBER_FEATURE.BATCH_SLOW)).toBe(false)
  })

  it("401 走 unknown —— 凭证失效由 api 层处理,不该被当成会员过期", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "unauthorized"))
    expect((await getAccountSnapshot()).state).toBe("unknown")
  })

  it("空权益集是确定事实,不等于未知", async () => {
    vi.spyOn(api, "me").mockResolvedValue({ ...ACCOUNT, member_features: [] })
    const snap = await getAccountSnapshot()
    expect(hasFeature(snap, MEMBER_FEATURE.BILINGUAL)).toBe(false)
  })
})
