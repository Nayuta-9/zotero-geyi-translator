import { api, type GlossaryList } from "../utils/api"

const CACHE_MS = 5 * 60 * 1000
let cached: { value: GlossaryList; expiresAt: number } | undefined

/** GEYI-330/AC-11:账户个人术语全量自动应用；这里只读缓存条目数，最长 5 分钟。 */
export async function getGlossaries(force = false): Promise<GlossaryList> {
  if (!force && cached && Date.now() < cached.expiresAt) return cached.value
  const value = await api.listGlossaries(0, 100)
  cached = { value, expiresAt: Date.now() + CACHE_MS }
  return value
}

export function clearGlossaryCache(): void {
  cached = undefined
}
