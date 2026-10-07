(() => {
  if (window.__studybridgeChatBubbleCompactLiveV6) return;
  window.__studybridgeChatBubbleCompactLiveV6 = true;

  const style = document.createElement("style");
  style.id = "studybridge-chat-bubble-compact-live";
  style.textContent = `
    #directMessageList .direct-message {
      width: min(360px, 76%) !important;
      min-height: 44px !important;
      padding: 12px 14px !important;
      display: grid !important;
      align-content: center !important;
      gap: 6px !important;
      border-radius: 8px !important;
      line-height: 1.35 !important;
    }

    #directMessageList .direct-message time {
      justify-self: end !important;
      font-size: 11px !important;
      color: var(--muted) !important;
    }
  `;
  document.head.appendChild(style);
})();
