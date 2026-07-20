export type SpeedMode = "fast" | "slow"

// 与后端 BATCH_API_MIN_PAGES 当前契约一致：只有满 100 页的高精度 AI 重排
// 才属于“大文件档”。插件先提交 slow 偏好，实际页数由后端解析并决定是否走 Batch；
// 不足门槛的文件仍走实时路径。
export const LARGE_DOCUMENT_MIN_PAGES = 100

export function automaticSpeedMode(
  layoutMode: string,
  precisionMode: string,
): SpeedMode {
  return layoutMode === "reflow" && precisionMode === "high" ? "slow" : "fast"
}
