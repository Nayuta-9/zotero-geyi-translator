import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { registerTaskPane, unregisterTaskPane } from "./taskPane"

// GEYI-618 的回归网。事故原文:插件用**同一条**带值的 Fluent 消息同时喂给
// header.l10nID 和 sidenav.l10nID。Zotero 把 header 的 id 挂在 <collapsible-section>
// 上、sidenav 的 id 挂在侧栏 28px 按钮上;Fluent 见消息有值就拿它覆写元素的
// textContent —— 面板整块被一行纯文本顶掉,按钮里则多出一列竖排文字压在图标上。
// 图标同样只有一张 32×32,而两个槽位都是 CSS background 且没有 background-size,
// 于是按固有尺寸绘制再被容器裁掉。
//
// 这张网把「消息只能带属性、两个槽位不能共用、图标按槽位给尺寸」钉死:任何一条被
// 改回去都会红。

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")

const LOCALES = {
  "zh-CN": "../../addon/locale/zh-CN/geyi.ftl",
  "en-US": "../../addon/locale/en-US/geyi.ftl",
}

interface FtlMessage {
  /** 消息本体的值;为 null 表示这是一条「只有属性」的消息。 */
  value: string | null
  attributes: Record<string, string>
}

/** 够用的 FTL 子集解析:只关心「有没有值」和「有哪些属性」。 */
function parseFtl(source: string): Record<string, FtlMessage> {
  const messages: Record<string, FtlMessage> = {}
  let current: string | undefined
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const attribute = line.match(/^\s+\.([A-Za-z][\w-]*)\s*=\s*(.*)$/)
    if (attribute && current) {
      messages[current].attributes[attribute[1]] = attribute[2].trim()
      continue
    }
    const message = line.match(/^([A-Za-z][\w-]*)\s*=\s*(.*)$/)
    if (message) {
      current = message[1]
      const value = message[2].trim()
      messages[current] = { value: value.length ? value : null, attributes: {} }
    }
  }
  return messages
}

interface SectionOptions {
  paneID: string
  header: { l10nID: string; icon: string }
  sidenav: { l10nID: string; icon: string }
}

let section: SectionOptions

beforeEach(() => {
  vi.stubGlobal("Zotero", {
    ItemPaneManager: {
      registerSection: (options: SectionOptions) => {
        section = options
        return options.paneID
      },
      unregisterSection: () => {},
    },
  })
  registerTaskPane({
    refresh: async () => {},
    retry: async () => {},
    report: () => {},
  })
})

afterEach(() => {
  unregisterTaskPane()
  vi.unstubAllGlobals()
})

describe("条目面板 section 的 l10n 注册(GEYI-618)", () => {
  it("标题与侧栏按钮用两条不同的消息,不共用一条", () => {
    expect(section.header.l10nID).not.toBe(section.sidenav.l10nID)
  })

  for (const [locale, path] of Object.entries(LOCALES)) {
    describe(locale, () => {
      const messages = parseFtl(read(path))

      it("标题消息只带 .label,没有值(有值会把整个 section 的内容顶掉)", () => {
        const message = messages[section.header.l10nID]
        expect(message, `${locale} 缺少 ${section.header.l10nID}`).toBeDefined()
        expect(message.value).toBeNull()
        expect(message.attributes.label?.length).toBeGreaterThan(0)
      })

      it("侧栏消息只带 .tooltiptext,没有值(有值会在图标上压一列竖排文字)", () => {
        const message = messages[section.sidenav.l10nID]
        expect(message, `${locale} 缺少 ${section.sidenav.l10nID}`).toBeDefined()
        expect(message.value).toBeNull()
        expect(message.attributes.tooltiptext?.length).toBeGreaterThan(0)
      })
    })
  }

  it("两个语言文件定义同一批消息,不会有一边漏键", () => {
    const [zh, en] = Object.values(LOCALES).map((path) =>
      Object.keys(parseFtl(read(path))).sort(),
    )
    expect(zh).toEqual(en)
  })
})

describe("条目面板 section 的图标尺寸(GEYI-618)", () => {
  // Zotero 两个槽位都用 CSS background 画图标且不设 background-size:标题图标的
  // 格子是 16×16,侧栏按钮 28×28 内自带图标是 20×20。图标的固有尺寸必须对上,
  // 否则会被容器裁掉一圈、并明显大过相邻的内置图标。
  const cases = [
    { slot: "header", size: 16, pick: () => section.header.icon },
    { slot: "sidenav", size: 20, pick: () => section.sidenav.icon },
  ]

  for (const { slot, size, pick } of cases) {
    it(`${slot} 用 ${size}px 的图标文件`, () => {
      const icon = pick()
      expect(icon).toContain(`/icons/icon-${size}.svg`)
      const svg = read(`../../addon/content/icons/icon-${size}.svg`)
      expect(svg).toContain(`width="${size}"`)
      expect(svg).toContain(`height="${size}"`)
    })
  }

  it("两个槽位不再共用那张 32×32 的通用图标", () => {
    expect(section.header.icon).not.toMatch(/\/icons\/icon\.svg$/)
    expect(section.sidenav.icon).not.toMatch(/\/icons\/icon\.svg$/)
  })
})
