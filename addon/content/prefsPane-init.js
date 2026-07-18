// 设置面板加载桥接(GEYI-328)。此文件不被 esbuild 打包,由 preferences pane 的
// scripts 直接加载,在面板 window 作用域里运行,把控制权交给 bundle 内的 hooks。
/* global Zotero, window */
window.addEventListener(
  "load",
  () => {
    try {
      Zotero.GeyiTranslator?.hooks?.onPrefsLoad?.(window);
    } catch (e) {
      Zotero.debug(`[geyi] prefs pane load bridge error: ${e}`);
    }
  },
  { once: true },
);
