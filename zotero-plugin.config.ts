import { defineConfig } from "zotero-plugin-scaffold"
import pkg from "./package.json" with { type: "json" }

// GEYI-328：Zotero 7 插件构建配置(zotero-plugin-scaffold)。esbuild 打包 src/index.ts →
// addon/content/scripts/geyi.js,拷贝 addon/ 并做占位符替换,压成 .xpi,生成 update.json。
// update.json 的 update_link 指向网页端托管地址(与 GEYI-327 的 public/plugin/ 一致)。
const UPDATE_BASE = "https://www.geyi.net/plugin"

export default defineConfig({
  source: ["src", "addon"],
  dist: "build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: `${UPDATE_BASE}/update.json`,
  xpiDownloadLink: `${UPDATE_BASE}/zotero-geyi.xpi`,

  build: {
    assets: ["addon/**/*.*"],
    define: {
      addonName: pkg.config.addonName,
      addonID: pkg.config.addonID,
      addonRef: pkg.config.addonRef,
      addonInstance: pkg.config.addonInstance,
      prefsPrefix: pkg.config.prefsPrefix,
      version: pkg.version,
      updateURL: `${UPDATE_BASE}/update.json`,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: { __env__: `"production"` },
        bundle: true,
        target: "firefox115",
        outfile: `build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
  },
})
