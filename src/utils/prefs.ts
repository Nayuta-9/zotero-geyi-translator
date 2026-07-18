import { config } from "./config"

// 偏好读写(GEYI-328)。global=true → 键为完整路径(extensions.zotero.geyi.*)。
export function getPref<T extends string | number | boolean>(
  key: string,
): T | undefined {
  try {
    return Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true) as T
  } catch {
    return undefined
  }
}

export function setPref(key: string, value: string | number | boolean): void {
  Zotero.Prefs.set(`${config.prefsPrefix}.${key}`, value, true)
}

export function clearPref(key: string): void {
  try {
    Zotero.Prefs.clear(`${config.prefsPrefix}.${key}`, true)
  } catch {
    /* 键不存在即忽略 */
  }
}
