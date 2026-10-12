// Service worker: context menu "Add to Anki-ji" → remember the selection, then open the popup.
const MENU_ID = "anki-ji-add";

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.contextMenus.create({ id: MENU_ID, title: "Add to Anki-ji", contexts: ["selection"] });
  if (details.reason === "install") {
    const { server, token } = await chrome.storage.sync.get(["server", "token"]);
    if (!server || !token) chrome.runtime.openOptionsPage();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  await chrome.storage.session.set({ capture: { text: info.selectionText ?? "", url: info.pageUrl ?? tab?.url ?? "", title: tab?.title ?? "", at: Date.now() } });
  try {
    await chrome.action.openPopup();
  } catch {
    // older Chrome / no focused window: fall back to a small popup window
    await chrome.windows.create({ url: chrome.runtime.getURL("popup.html?window=1"), type: "popup", width: 440, height: 600 });
  }
});
