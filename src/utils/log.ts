import { getPref } from "./prefs"

type LogLevel = "error" | "info" | "debug"
const rank: Record<LogLevel, number> = { error: 0, info: 1, debug: 2 }

export function log(level: LogLevel, message: string): void {
  const configured = getPref<string>("logLevel") as LogLevel | undefined
  const threshold = rank[configured || "info"] ?? rank.info
  if (rank[level] > threshold) return
  try {
    Zotero.debug(`[geyi] ${level}: ${message}`)
  } catch {
    /* 日志不可用不影响插件主路径 */
  }
}

export const logError = (message: string): void => log("error", message)
export const logInfo = (message: string): void => log("info", message)
export const logDebug = (message: string): void => log("debug", message)
