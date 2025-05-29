class Workspace {
  constructor(id, state) {
    this.id = id;
    this.name = state.name;
    this.active = state.active;
    this.tabs = state.tabs;
    this.windowId = state.windowId;
    this.groups = state.groups || [];
    this.lastActiveTabId = state.lastActiveTabId || null;
  }

  static async create(id, state) {
    const wspId = id || Date.now();

    const wsp = new Workspace(wspId, state);

    await wsp._saveState();
    await WSPStorageManger.addWsp(wspId, state.windowId);

    return wsp;
  }

  static async getWorkspaces(windowId) {
    return await WSPStorageManger.getWorkspaces(windowId);
  }

  async destroy() {
    if (this.tabs.length > 0) {
      await browser.tabs.remove(this.tabs);
    }
    await WSPStorageManger.deleteWspState(this.id);
    await WSPStorageManger.removeWsp(this.id, this.windowId);
  }

  async activate(activeTabId = null) {
    if (this.tabs.length > 0) {

      for (const group of this.groups) {
        if (group.tabs.length > 0) {
          const groupId = await browser.tabs.group({tabIds: group.tabs});
          await browser.tabGroups.update(groupId, {
            title: group.title,
            color: group.color,
            collapsed: group.collapsed
          });
        }
      }

      await browser.tabs.show(this.tabs);
      await browser.tabs.update(activeTabId || this.lastActiveTabId || this.tabs[0], {active: true});
    }

    this.active = true;
    await this._saveState();
  }

  async hideTabs() {
    this.active = false;

    await browser.tabs.hide(this.tabs);
    await browser.tabs.ungroup(this.tabs);

    await this._saveState();
  }

  async updateTabGroups() {
    const groups = await browser.tabGroups.query({windowId: this.windowId});
    const tabs = await browser.tabs.query({windowId: this.windowId});

    this.groups = groups.map(group => {
      const tabIds = tabs
        .filter(tab => tab.groupId === group.id && this.tabs.includes(tab.id))
        .map(tab => tab.id);

      return {
        // groupId: group.id,
        title: group.title,
        color: group.color,
        collapsed: group.collapsed,
        tabs: tabIds
      };
    }).filter(group => group.tabs.length > 0);

    await this._saveState();
  }

  static async rename(wspId, wspName) {
    const state = await WSPStorageManger.getWspState(wspId);

    state.name = wspName;

    const wsp = new Workspace(wspId, state);

    await wsp._saveState();
  }

  async _saveState() {
    await WSPStorageManger.saveWspState(this.id, {
      id: this.id,
      name: this.name,
      active: this.active,
      tabs: this.tabs,
      groups: this.groups,
      windowId: this.windowId,
      lastActiveTabId: this.lastActiveTabId
    });
  }
}