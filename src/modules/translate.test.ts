/**
 * GEYI-645:翻译进度浮窗只负责提交阶段,不再全程悬在主窗右下角。
 *
 * 改之前:`makeProgress()` 传 `closeOnClick: false`,而 `startCloseTimer` 只在
 * **终态**才调 —— 于是一次十几分钟的翻译,这个置顶浮窗就悬十几分钟;而同一份
 * 状态(进度百分比、状态文案、错误文案)条目面板里每 3 秒刷一次,一样不少。
 *
 * GEYI-618 已查清浮窗是 Zotero 平台的独立 chrome 窗口,位置尺寸插件都改不了,
 * 所以方向是「让它早点关」。
 *
 * 这里钉五件事:
 *   1. 任务一入库(面板已接管)浮窗就进入关闭流程 —— 而不是等终态;
 *   2. 关闭有兜底:`startCloseTimer` 会被鼠标划过取消,必须再补一记 `close()`;
 *   3. 关掉之后**不再**对这个窗口做周期性 `changeLine`(本票点名的「踩空」风险,
 *      处理方式是根本不把 pw 传进轮询);
 *   4. 失败终态仍然看得见 —— 浮窗提前关了,补一条系统通知,别让失败反而比成功
 *      更不可见;
 *   5. 轮询不因 UI 层异常而静默死掉(否则产物永远回填不上)。
 *
 * ⚠️ 这些是**行为**断言,不是视觉断言。浮窗真在屏幕上何时消失,本仓的
 * typecheck / vitest / build 三样一样都验不出来,必须真实 Zotero 客户端目视。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8")

// ---------------------------------------------------------------------------
// 提交阶段浮窗的收尾 —— 对 src/modules/translate.ts 的源码断言
// ---------------------------------------------------------------------------
// 为什么读源码而不是跑 runTranslation:那条函数要 Zotero.Items / 附件读字节 /
// 网络 / 面板注册全套环境,把它整个 stub 起来的桩比被测逻辑还长,而本票要钉的
// 结论恰恰是「调用顺序」这种源码层面就能看死的东西。仓里已有同款写法
// (scripts/build.test.ts、taskPane.test.ts 的图标尺寸网)。
const SOURCE = read("./translate.ts")

describe("提交阶段浮窗(GEYI-645)", () => {
  it("入库 + 面板接管之后立刻收尾,不等终态", () => {
    const enqueue = SOURCE.indexOf("upsertTrackedTask(task)")
    const paneTakesOver = SOURCE.indexOf("refreshTaskPane()", enqueue)
    const closing = SOURCE.indexOf("closeSubmitProgress(pw)")
    const poll = SOURCE.indexOf("startPolling(job.id")
    expect(enqueue).toBeGreaterThan(-1)
    expect(paneTakesOver).toBeGreaterThan(enqueue)
    // 关闭必须排在「面板已接管」之后、轮询开始之前。
    expect(closing).toBeGreaterThan(paneTakesOver)
    expect(poll).toBeGreaterThan(closing)
  })

  it("窗口消失前把「进度去哪儿看」说清楚,而不是留一句「翻译中…」", () => {
    // 留着 progress-translating 会让窗口一消失被读成「任务没了」。
    const tail = SOURCE.slice(SOURCE.indexOf("upsertTrackedTask(task)"))
    expect(tail).toContain('getString("progress-submitted")')
    const en = read("../utils/locale.ts")
    expect(en).toContain('"progress-submitted"')
    // 中英必须都有 —— 少一边到不了对应语言的用户眼前。
    expect(en.match(/"progress-submitted"/g)?.length).toBe(2)
  })

  it("关闭有兜底:startCloseTimer 之外还有一记 close()", () => {
    const fn = SOURCE.slice(
      SOURCE.indexOf("function closeSubmitProgress"),
      SOURCE.indexOf("function updateProgressWindow"),
    )
    // 只靠 startCloseTimer 不够:Zotero 的 _onMouseOver 会 _disableTimeout(),
    // 用户手正好在主窗上,浮窗就又不走了 —— 而本票要的正是「无论如何别悬着」。
    expect(fn).toContain("startCloseTimer")
    expect(fn).toContain("close?.()")
    // 用 Zotero.Promise.delay 而不是 setTimeout(模块作用域里没有可靠的 setTimeout)。
    expect(fn).toContain("Zotero.Promise.delay")
  })

  it("关掉之后不再对它做周期性 changeLine(本票点名的踩空风险)", () => {
    // 处理方式:根本不把 pw 传进轮询,下游那些 `pw?.` 于是结构性成为 no-op。
    expect(SOURCE).toContain("startPolling(job.id, win)")
    expect(SOURCE).not.toContain("startPolling(job.id, pw, win)")
    const sig = SOURCE.slice(SOURCE.indexOf("function startPolling("))
    expect(sig.slice(0, 60)).not.toContain("pw")
  })
})

describe("终态与轮询韧性(GEYI-645 的连带面)", () => {
  it("失败终态补上系统通知 —— 浮窗提前关了,别让失败比成功更不可见", () => {
    // lastIndexOf:上面 434 行的 `else if (…)` 是同一串的子串,indexOf 会先命中
    // 它 —— 那样断言仍会过,但过的理由是错的。
    const failBranch = SOURCE.slice(
      SOURCE.lastIndexOf('if (job.status === "failed" || job.status === "canceled") {'),
    )
    expect(failBranch).toContain("notifyOnComplete")
    expect(failBranch).toContain("notify(")
    // 用同一个开关:关掉通知的人两种终态都不想被打扰。
    const gate = failBranch.slice(0, failBranch.indexOf("return true"))
    expect(gate).toContain('getPref<boolean>("notifyOnComplete") !== false')
  })

  it("成功终态原有的系统通知一条没动", () => {
    const okBranch = SOURCE.slice(
      SOURCE.indexOf('if (job.status === "succeeded") {'),
      SOURCE.lastIndexOf('if (job.status === "failed" || job.status === "canceled") {'),
    )
    expect(okBranch).not.toBe("")
    expect(okBranch).toContain('getPref<boolean>("notifyOnComplete") !== false')
    expect(okBranch).toContain('getString("notify-done"')
  })

  it("轮询循环有 catch,UI 层异常不该吃掉产物回填", () => {
    const poll = SOURCE.slice(SOURCE.indexOf("function startPolling("))
    const body = poll.slice(0, poll.indexOf("\n}"))
    // 原先只有 try/finally:handleJob 抛一次,轮询静默死掉、activePolls 被清,
    // 任务从此永远停在「翻译中」。
    expect(body).toContain("} catch (error) {")
    expect(body).toContain("Zotero.logError")
    expect(body).toContain("} finally {")
  })
})

// ---------------------------------------------------------------------------
// 图标深色主题(同属观感,本票附带)
// ---------------------------------------------------------------------------

describe("图标在深色主题下跟随前景色(GEYI-645 附带)", () => {
  const files = ["icon.svg", "icon-16.svg", "icon-20.svg"]

  for (const name of files) {
    it(`${name} 给 near-black 那条 path 备了深色主题的覆盖`, () => {
      const svg = read(`../../addon/content/icons/${name}`)
      expect(svg).toContain("@media (prefers-color-scheme: dark)")
      expect(svg).toContain('class="geyi-ink"')
      expect(svg).toContain(".geyi-ink { fill: #e8e8e8; }")
    })

    it(`${name} 不改浅色下的既有观感(媒体查询不命中就完全维持原样)`, () => {
      const svg = read(`../../addon/content/icons/${name}`)
      // presentation 属性原样留着:媒体查询在 Zotero 的渲染上下文里若不生效,
      // 图标与改动前逐像素一致 —— 这条修改**不可能比现在更差**。
      expect(svg).toContain('fill="#333333"')
      // 品牌橙深浅都读得清,两边都不该动。
      expect(svg.match(/fill="#D14109"/g)?.length).toBe(2)
      expect(svg).not.toContain("#D14109;")
    })
  }

  it("尺寸网没被这次改动带坏(GEYI-618 那条约束仍然成立)", () => {
    for (const size of [16, 20]) {
      const svg = read(`../../addon/content/icons/icon-${size}.svg`)
      expect(svg).toContain(`width="${size}"`)
      expect(svg).toContain(`height="${size}"`)
    }
  })
})

// ---------------------------------------------------------------------------
// 自证前提 —— 上面靠源码字面量断言,这里保证那些锚点今天还在
// ---------------------------------------------------------------------------

describe("自证前提", () => {
  beforeEach(() => {
    vi.stubGlobal("Zotero", {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("被断言的那些函数名确实存在于源码里", () => {
    // 任何一个被改名而断言没跟着改,上面整组测试会悄悄变成恒真。
    for (const anchor of [
      "function closeSubmitProgress",
      "function updateProgressWindow",
      "function startPolling(",
      "async function handleJob(",
      "upsertTrackedTask(task)",
    ]) {
      expect(SOURCE).toContain(anchor)
    }
  })

  it("浮窗仍然是 closeOnClick:false —— 所以「早点关」是唯一出路", () => {
    // 若哪天改成 closeOnClick:true,本票的前提就变了,这条该红给人看。
    expect(SOURCE).toContain("closeOnClick: false")
  })
})
