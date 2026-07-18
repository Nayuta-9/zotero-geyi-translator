import { getCredentials } from "../modules/auth"

// 格译开放 API(/v1)客户端(GEYI-328)。凭证(api_key + api_base_url)来自授权流后落库
// 的加密偏好(见 modules/auth)。走 Zotero.HTTP.request —— Zotero 的 XHR 不受网页 CORS
// 约束,可直接跨域调后端。
//
// 关键约束:Zotero.HTTP.request 的 body 只支持 string | Uint8Array,**不支持 FormData**。
// 故不走 multipart,所有文件统一走「签名 URL 二段上传」:申请 PUT URL → PUT 原始字节 →
// form-urlencoded 建作业。三步 body 分别是 JSON 串 / Uint8Array / urlencoded 串。

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface AccountInfo {
  email: string
  credit_balance: number
  available: number
  held: number
  membership_tier: string | null
  membership_active: boolean
  tier_expires_at: string | null
}

export interface Job {
  id: string
  status: "queued" | "processing" | "succeeded" | "failed" | "canceled"
  progress: number | null
  page_count: number | null
  filename: string | null
  error: string | null
}

export interface OutputItem {
  format: string
  filename: string
}

export interface TranslateOptions {
  targetLanguage: string
  sourceLanguage?: string
  layoutMode: string
  precisionMode: string
  bilingual?: boolean
  speed?: string
}

function requireCreds(): { key: string; base: string } {
  const c = getCredentials()
  if (!c) throw new ApiError(401, "Not signed in")
  return c
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` }
}

function parseDetail(text: string | undefined): string | null {
  if (!text) return null
  try {
    const j = JSON.parse(text)
    if (typeof j?.detail === "string") return j.detail
    if (typeof j?.detail?.message === "string") return j.detail.message
  } catch {
    /* 非 JSON */
  }
  return null
}

/** Zotero.HTTP.request → JSON。非 2xx 时 Zotero 抛带 xhr 的异常,从中读后端中文 detail。 */
async function requestJSON(
  method: string,
  url: string,
  opts: { headers?: Record<string, string>; body?: string | Uint8Array } = {},
): Promise<any> {
  let xhr: XMLHttpRequest
  try {
    xhr = await Zotero.HTTP.request(method, url, {
      headers: opts.headers,
      body: opts.body,
      responseType: "text",
    })
  } catch (e: any) {
    const exhr: XMLHttpRequest | undefined = e?.xhr
    if (exhr) {
      const detail = parseDetail(exhr.responseText) || `HTTP ${exhr.status}`
      throw new ApiError(exhr.status, detail)
    }
    throw new ApiError(0, e?.message || "Network error")
  }
  const text = xhr.responseText || ""
  return text ? JSON.parse(text) : null
}

function encodeForm(
  fields: Record<string, string | number | boolean | undefined>,
): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")
}

export const api = {
  async me(): Promise<AccountInfo> {
    const { key, base } = requireCreds()
    return requestJSON("GET", `${base}/me`, { headers: authHeaders(key) })
  },

  /** 建作业:签名 URL 二段上传(避开 multipart)。返回 job。 */
  async createTranslation(
    file: { name: string; bytes: Uint8Array; contentType: string },
    opts: TranslateOptions,
  ): Promise<Job> {
    const { key, base } = requireCreds()

    // 1. 申请签名 PUT 目标。
    const target = await requestJSON("POST", `${base}/uploads`, {
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.contentType,
        file_size: file.bytes.length,
      }),
    })

    // 2. 原始字节直传 GCS(签名 URL 自鉴权,不带 Bearer)。
    await Zotero.HTTP.request("PUT", target.upload_url, {
      headers: { "Content-Type": file.contentType },
      body: file.bytes,
    })

    // 3. 用 upload_id 建作业(form-urlencoded)。
    return requestJSON("POST", `${base}/translations`, {
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeForm({
        upload_id: target.upload_id,
        filename: file.name,
        file_size: file.bytes.length,
        source_language: opts.sourceLanguage || "auto",
        target_language: opts.targetLanguage,
        layout_mode: opts.layoutMode,
        precision_mode: opts.precisionMode,
        bilingual: opts.bilingual ? "true" : "false",
        on_scanned: "auto_ocr",
        speed: opts.speed || "fast",
      }),
    })
  },

  async getJob(jobId: string): Promise<Job> {
    const { key, base } = requireCreds()
    return requestJSON("GET", `${base}/translations/${jobId}`, {
      headers: authHeaders(key),
    })
  },

  async listOutputs(jobId: string): Promise<{ outputs: OutputItem[] }> {
    const { key, base } = requireCreds()
    return requestJSON("GET", `${base}/translations/${jobId}/outputs`, {
      headers: authHeaders(key),
    })
  },

  async getDownloadUrl(
    jobId: string,
    fmt: string,
  ): Promise<{ url: string; filename: string }> {
    const { key, base } = requireCreds()
    return requestJSON("GET", `${base}/translations/${jobId}/outputs/${fmt}`, {
      headers: authHeaders(key),
    })
  },
}
