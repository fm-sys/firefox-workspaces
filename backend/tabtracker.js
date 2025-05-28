class TabTracker {
  constructor() {
    this.windows = new Map(); // windowId → [ { id, index, url } ]

    this._initListeners();
    this._initializeState();
  }

  async _initializeState() {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      this._addTab(tab);
    }
  }

  _initListeners() {
    browser.tabs.onCreated.addListener(tab => this._addTab(tab));
    browser.tabs.onUpdated.addListener(
      (tabId, changeInfo, tab) => {
        this._updateTab(tab);
      },
      {properties: ["url"]}
    );
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
      if (removeInfo.isWindowClosing) {
        return;
      }
      this._removeTab(tabId, removeInfo.windowId);
    });
    browser.tabs.onAttached.addListener((tabId, attachInfo) => {
      browser.tabs.get(tabId).then(tab => this._addTab(tab));
    });
    browser.tabs.onDetached.addListener((tabId, detachInfo) => {
      this._removeTab(tabId, detachInfo.oldWindowId);
    });
    browser.tabs.onMoved.addListener((tabId, moveInfo) => {
      browser.tabs.get(tabId).then(tab => this._updateTab(tab));
    });
    // browser.windows.onRemoved.addListener(windowId => {
    //   setTimeout(() => {
    //     this.windows.delete(windowId);
    //   }, 1000);
    // });
  }

  _addTab(tab) {
    if (!tab.id || tab.windowId === undefined) return;

    const entry = {id: tab.id, index: tab.index, url: tab.url || ''};

    if (!this.windows.has(tab.windowId)) {
      this.windows.set(tab.windowId, []);
    }

    const list = this.windows.get(tab.windowId);
    const existingIndex = list.findIndex(t => t.id === tab.id);

    if (existingIndex !== -1) {
      list[existingIndex] = entry;
    } else {
      list.push(entry);
    }
  }

  _updateTab(tab) {
    const list = this.windows.get(tab.windowId);
    if (!list) return;

    const i = list.findIndex(t => t.id === tab.id);
    if (i !== -1) {
      list[i] = {id: tab.id, index: tab.index, url: tab.url || ''};
    } else {
      list.push({id: tab.id, index: tab.index, url: tab.url || ''});
    }
  }

  _removeTab(tabId, windowId) {
    const list = this.windows.get(windowId);
    if (!list) return;

    const i = list.findIndex(t => t.id === tabId);
    if (i !== -1) list.splice(i, 1);
  }

  getTabs(windowId) {
    return this.windows.get(windowId) || [];
  }

  getAll() {
    return this.windows;
  }
}


const tabTracker = new TabTracker();