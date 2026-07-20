import { getPref, setPref } from "../utils/prefs"
import type { Job, TranslateOptions } from "../utils/api"

const TASKS_PREF = "trackedTasks"
const MAX_TRACKED_TASKS = 50

export type DuplicateChoice = "overwrite" | "version"

export interface AttachedOutput {
  format: string
  itemKey: string
}

export interface TrackedTask {
  jobId: string
  sourceLibraryID: number
  sourceAttachmentKey: string
  parentItemKey?: string
  originalName: string
  options: TranslateOptions
  duplicateChoice: DuplicateChoice
  overwriteItemKeys: string[]
  status: Job["status"]
  progress: number | null
  error: string | null
  submittedAt: string
  completedAt?: string
  attachedAt?: string
  attachError?: string
  attachedOutputs: AttachedOutput[]
  noteItemKey?: string
}

function isTrackedTask(value: unknown): value is TrackedTask {
  if (!value || typeof value !== "object") return false
  const task = value as Partial<TrackedTask>
  return (
    typeof task.jobId === "string" &&
    typeof task.sourceLibraryID === "number" &&
    typeof task.sourceAttachmentKey === "string" &&
    typeof task.originalName === "string" &&
    typeof task.submittedAt === "string" &&
    !!task.options &&
    typeof task.options === "object"
  )
}

function normalizeTask(task: TrackedTask): TrackedTask {
  return {
    ...task,
    duplicateChoice: task.duplicateChoice === "overwrite" ? "overwrite" : "version",
    overwriteItemKeys: Array.isArray(task.overwriteItemKeys)
      ? task.overwriteItemKeys.filter((key): key is string => typeof key === "string")
      : [],
    attachedOutputs: Array.isArray(task.attachedOutputs)
      ? task.attachedOutputs.filter(
          (output): output is AttachedOutput =>
            !!output &&
            typeof output.format === "string" &&
            typeof output.itemKey === "string",
        )
      : [],
  }
}

export function loadTrackedTasks(): TrackedTask[] {
  const raw = getPref<string>(TASKS_PREF)
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value
      .filter(isTrackedTask)
      .map(normalizeTask)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, MAX_TRACKED_TASKS)
  } catch {
    return []
  }
}

export function saveTrackedTasks(tasks: TrackedTask[]): void {
  const trimmed = [...tasks]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, MAX_TRACKED_TASKS)
  setPref(TASKS_PREF, JSON.stringify(trimmed))
}

export function upsertTrackedTask(task: TrackedTask): void {
  const tasks = loadTrackedTasks()
  const index = tasks.findIndex((item) => item.jobId === task.jobId)
  if (index >= 0) tasks[index] = task
  else tasks.unshift(task)
  saveTrackedTasks(tasks)
}

export function getTrackedTask(jobId: string): TrackedTask | undefined {
  return loadTrackedTasks().find((task) => task.jobId === jobId)
}

export function isActiveStatus(status: Job["status"]): boolean {
  return status === "queued" || status === "processing"
}

export function updateTrackedJob(job: Job): TrackedTask | undefined {
  const task = getTrackedTask(job.id)
  if (!task) return undefined
  const next: TrackedTask = {
    ...task,
    status: job.status,
    progress: job.progress,
    error: job.error,
    completedAt:
      job.status === "succeeded" || job.status === "failed" || job.status === "canceled"
        ? job.completed_at || task.completedAt || new Date().toISOString()
        : task.completedAt,
  }
  upsertTrackedTask(next)
  return next
}

export function languageSuffix(targetLanguage: string): string {
  const normalized = targetLanguage.trim().toLowerCase()
  if (normalized === "zh-cn" || normalized === "zh-hans") return "zh"
  if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-hant") {
    return "zh-TW"
  }
  return targetLanguage.split("-")[0] || "translated"
}

function extensionForFormat(format: string): string {
  if (format === "pdf_bilingual" || format === "pdf_dual") return "pdf"
  if (format === "markdown") return "md"
  return format
}

export function outputBaseName(
  originalName: string,
  format: string,
  targetLanguage: string,
): string {
  const ext = extensionForFormat(format)
  const suffix =
    format === "pdf_bilingual" || format === "pdf_dual"
      ? "bilingual"
      : languageSuffix(targetLanguage)
  return `${originalName}_${suffix}.${ext}`
}

export function addVersionSuffix(filename: string, version: number): string {
  if (version <= 1) return filename
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return `${filename}_v${version}`
  return `${filename.slice(0, dot)}_v${version}${filename.slice(dot)}`
}

export function nextVersion(filename: string, existingNames: string[]): number {
  const dot = filename.lastIndexOf(".")
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ""
  let max = 0
  for (const name of existingNames) {
    if (name === filename) {
      max = Math.max(max, 1)
      continue
    }
    if (!name.startsWith(`${stem}_v`) || !name.endsWith(ext)) continue
    const raw = name.slice(stem.length + 2, ext ? -ext.length : undefined)
    const version = Number.parseInt(raw, 10)
    if (Number.isFinite(version)) max = Math.max(max, version)
  }
  return max + 1
}
