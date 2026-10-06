(() => {
  function installClassmateChatBubbleFix() {
    let style = document.querySelector("#studybridge-classmate-chat-bubble-fix");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-classmate-chat-bubble-fix";
      document.head.appendChild(style);
    }

    style.textContent = `
      #classmatesPage .direct-message-list {
        align-content: end !important;
        gap: 10px !important;
      }

      #classmatesPage .direct-message {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: end !important;
        column-gap: 16px !important;
        width: fit-content !important;
        min-width: min(360px, 72vw) !important;
        max-width: min(720px, 86%) !important;
        min-height: 0 !important;
        padding: 10px 14px !important;
        border-radius: 8px !important;
        line-height: 1.42 !important;
        white-space: pre-wrap !important;
      }

      #classmatesPage .direct-message.mine {
        justify-self: end !important;
      }

      #classmatesPage .direct-message time {
        display: block !important;
        align-self: end !important;
        margin: 0 !important;
        white-space: nowrap !important;
        text-align: right !important;
      }

      @media (max-width: 640px) {
        #classmatesPage .direct-message {
          grid-template-columns: 1fr !important;
          min-width: min(260px, 82vw) !important;
          max-width: 92% !important;
        }

        #classmatesPage .direct-message time {
          margin-top: 4px !important;
        }
      }
    `;
  }

  installClassmateChatBubbleFix();
  setInterval(installClassmateChatBubbleFix, 1500);
})();
