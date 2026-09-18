let sourceTabId: number | undefined;

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id && tab.url?.startsWith("https://discord.com/")) {
    sourceTabId = tab.id;
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.type !== "MTCORD_GET_SESSION") return false;

  void (async () => {
    let target = sourceTabId;
    if (!target) {
      const tabs = await chrome.tabs.query({ url: "https://discord.com/*" });
      target = tabs.find((tab) => tab.active)?.id ?? tabs[0]?.id;
    }

    if (!target) {
      sendResponse({ ok: false });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(target, {
        type: "MTCORD_READ_SESSION",
      });
      sendResponse(response ?? { ok: false });
    } catch {
      sendResponse({ ok: false });
    }
  })();

  return true;
});
