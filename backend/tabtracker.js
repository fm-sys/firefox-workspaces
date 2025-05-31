let currentTabs = [];

async function updateTabList(excludeTabId = null) {
  try {
    const tabs = await browser.tabs.query({windowId: await WSPStorageManger.getPrimaryWindowId()});
    currentTabs = tabs.filter(tab => tab.id !== excludeTabId).map(tab => ({
      id: tab.id,
      index: tab.index,
    }));
    await WSPStorageManger.saveWindowTabIndexMapping(currentTabs);
    console.log("Updated tab list:", currentTabs);
  } catch (e) {
    console.error("Error updating tab list", e);
  }
}

// Listen to all events that can change tab state
browser.tabs.onCreated.addListener(updateTabList);
browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (!removeInfo.isWindowClosing) {
    await updateTabList(tabId);  // actually called directly before removing the tab
  }
});
browser.tabs.onMoved.addListener(updateTabList);
browser.tabs.onAttached.addListener(updateTabList);
browser.tabs.onDetached.addListener(updateTabList);

// Initial population
updateTabList();
