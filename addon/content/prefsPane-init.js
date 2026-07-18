// 设置面板加载桥接(GEYI-328)。此文件不被 esbuild 打包,由 preferences pane 的
// scripts 直接加载,在面板 window 作用域里运行,把控制权交给 bundle 内的 hooks。
// 注意:Zotero 7 里此脚本执行时,设置窗口的 "load" 事件通常已触发过,故不能只等
// load —— 用 readyState 判断:已就绪就立即桥接,否则再挂 load。
/* global Zotero, window, document */
(function () {
  function bridge() {
    try {
      Zotero.GeyiTranslator?.hooks?.onPrefsLoad?.(window);
    } catch (e) {
      Zotero.debug(`[geyi] prefs pane load bridge error: ${e}`);
    }
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    bridge();
  } else {
    window.addEventListener("load", bridge, { once: true });
  }
})();
