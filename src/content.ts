chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type !== "MTCORD_READ_SESSION") return false;

  try {
    const stored = window.localStorage.getItem("token");
    const token = stored ? JSON.parse(stored) : null;
    if (typeof token === "string" && token.length > 20) {
      sendResponse({ ok: true, token });
    } else {
      sendResponse({ ok: false });
    }
  } catch {
    sendResponse({ ok: false });
  }
  return false;
});
