(function () {
  "use strict";
  const ui = window.StudyBridgeI18n;
  document.querySelector(".header-nav").insertAdjacentHTML("afterend", ui.selector());
  ui.bindStatic(document.body);
  ui.bindStatic(document.head.querySelector("title"));
})();
