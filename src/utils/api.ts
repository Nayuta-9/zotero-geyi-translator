import { getCredentials } from "../modules/auth"

// 格译开放 API(/v1)客户端(GEYI-328)。凭证(api_key + api_base_url)来自授权流后落库
// 的加密偏好(见 modules/auth)。走 Zotero.HTTP.request —— Zotero 的 XHR 不受网页 CORS
// 约束,可直接跨域调后端。大文件(≥32MiB)走签名 URL 二段上传,其余走 multipart 直传。

export const LARGE_FILE_THRESHOLD = 32 * 1024 * 1024

// TS 5.7 把 Uint8Array 泛型收紧成 Uint8Array<ArrayBufferLike>,不再直接满足 BlobPart
// (期望 ArrayBuffer 背衬)。Zotero 里 IOUtils.read 恒返回普通 ArrayBuffer 背衬,故按
// BlobPart 处理运行期安全;用 unknown 中转过类型闸。
function blobFrom(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface EstimateResult {
  estimated_credits: number
  page_count: number | null
  page_count_source: string
  credits_per_page: number
  min_credits_per_task: number
  is_estimate_exact: boolean
  available_credits: number
  sufficient_balance: boolean
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

/** 统一的 Zotero.HTTP 请求 → JSON;非 2xx 抛 ApiError(带后端中文 detail)。 */
async function requestJSON(
  method: string,
  url: string,
  opts: {
    headers?: Record<string, string>
    body?: unknown
    responseType?: string
  } = {},
): Promise<any> {
  let xhr: XMLHttpRequest
  try {
    xhr = await Zotero.HTTP.request(method, url, {
      headers: opts.headers,
      body: opts.body as any,
      responseType: "text",
      // 非 2xx 不抛,由我们读取 detail 后抛结构化错误。
      successCodes: false as any,
    })
  } catch (e: any) {
    throw new ApiError(0, e?.message || "Network error")
  }
  const status = xhr.status
  const text = xhr.responseText || ""
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (status < 200 || status >= 300) {
    const detail =
      (parsed && (typeof parsed.detail === "string" ? parsed.detail : parsed.detail?.message)) ||
      `HTTP ${status}`
    throw new ApiError(status, detail)
  }
  return parsed
}

function encodeForm(fields: Record<string, string | number | boolean | undefined>): string {
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

  /** 预估:PDF/单图精确(需上传字节),故走 multipart /v1/estimate。 */
  async estimate(
    file: { name: string; bytes: Uint8Array; contentType: string },
    opts: TranslateOptions,
  ): Promise<EstimateResult> {
    const { key, base } = requireCreds()
    const fd = new FormData()
    fd.append("file", blobFrom(file.bytes, file.contentType), file.name)
    fd.append("layout_mode", opts.layoutMode)
    fd.append("precision_mode", opts.precisionMode)
    fd.append("speed", opts.speed || "fast")
    return requestJSON("POST", `${base}/estimate`, { headers: authHeaders(key), body: fd })
  },

  /** 创建作业。<32MiB multipart 直传;否则签名 URL 二段上传。返回 job。 */
  async createTranslation(
    file: { name: string; bytes: Uint8Array; contentType: string },
    opts: TranslateOptions,
  ): Promise<Job> {
    const { key, base } = requireCreds()
    const common = {
      source_language: opts.sourceLanguage || "auto",
      target_language: opts.targetLanguage,
      layout_mode: opts.layoutMode,
      precision_mode: opts.precisionMode,
      bilingual: opts.bilingual ? "true" : "false",
      on_scanned: "auto_ocr",
      speed: opts.speed || "fast",
    }

    if (file.bytes.length < LARGE_FILE_THRESHOLD) {
      const fd = new FormData()
      fd.append("file", blobFrom(file.bytes, file.contentType), file.name)
      for (const [k, v] of Object.entries(common)) fd.append(k, v)
      return requestJSON("POST", `${base}/translations`, {
        headers: authHeaders(key),
        body: fd,
      })
    }

    // 大文件:申请签名 PUT → 直传 GCS → 用 upload_id 建作业。
    const target = await requestJSON("POST", `${base}/uploads`, {
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        content_type: file.contentType,
        file_size: file.bytes.length,
      }),
    })
    await Zotero.HTTP.request("PUT", target.upload_url, {
      headers: { "Content-Type": file.contentType },
      body: file.bytes as any,
    })
    return requestJSON("POST", `${base}/translations`, {
      headers: { ...authHeaders(key), "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm({
        upload_id: target.upload_id,
        filename: file.name,
        file_size: file.bytes.length,
        ...common,
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

  async getDownloadUrl(jobId: string, fmt: string): Promise<{ url: string; filename: string }> {
    const { key, base } = requireCreds()
    return requestJSON("GET", `${base}/translations/${jobId}/outputs/${fmt}`, {
      headers: authHeaders(key),
    })
  },
}
