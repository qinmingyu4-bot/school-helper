(function () {
  "use strict";
  const ui = window.StudyBridgeI18n;
  document.querySelector(".header-nav").insertAdjacentHTML("afterend", ui.selector());
  ui.bindStatic(document.body);
  ui.bindStatic(document.head.querySelector("title"));
  const description = document.head.querySelector('meta[name="description"]');
  const source = description.content;
  const updateDescription = () => { description.content = ui.text(source); };
  updateDescription();
  ui.subscribe(updateDescription);
})();
