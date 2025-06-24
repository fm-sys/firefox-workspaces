async function applyTheme() {
  try {
    const { colors = {}, properties = {} } = await browser.theme.getCurrent();

    // Mappings: theme.colors → CSS-Variablen
    const map = {
      toolbar:          '--bg-toolbar',
      frame_inactive:   '--bg-toolbar-inactive',
      toolbar_text:     '--text-toolbar',
      sidebar_text:     '--text-sidebar',
      popup:            '--bg-popup',
      popup_border:     '--border-popup',
      popup_highlight:  '--highlight-popup',
      popup_text:       '--text-popup',
      button:           '--button-bg',
      button_hover:     '--button-hover',
      button_active:    '--button-active',
      button_primary:   '--button-primary',
      button_primary_hover: '--button-primary-hover',
      button_primary_active: '--button-primary-active',
      button_primary_color: '--button-primary-text',
      input_background: '--input-bg',
      input_color:      '--input-text',
    };

    for (const [key, varName] of Object.entries(map)) {
      if (colors[key]) {
        document.documentElement.style.setProperty(varName, colors[key]);
      }
    }

    // Optional: System-Font aus properties übernehmen
    if (properties.color_scheme === 'dark') {
      document.documentElement.style.setProperty('--ui-font', 'menu');
    }
  }
  catch (e) {
    console.warn('Theme konnte nicht gelesen werden:', e);
  }
}

// Initial anwenden
(async () => {
  await applyTheme();
})();

// Auf Theme-Änderungen reagieren
browser.theme.onUpdated.addListener(applyTheme);


function showCustomDialog({ message, withInput = false, defaultValue = "" }) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("custom-dialog-backdrop");
    const msgEl = document.getElementById("custom-dialog-message");
    const inputEl = document.getElementById("custom-dialog-input");
    const okBtn = document.getElementById("custom-dialog-ok");
    const cancelBtn = document.getElementById("custom-dialog-cancel");

    msgEl.textContent = message;
    inputEl.hidden = !withInput;
    inputEl.value = defaultValue;

    updateOkButtonState();

    backdrop.classList.add("show");
    inputEl.focus();
    inputEl.select();

    function cleanup(result) {
      backdrop.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      inputEl.removeEventListener("input", updateOkButtonState);
      inputEl.removeEventListener("keydown", onKeyDown);
      resolve(result);
    }

    function onOk() {
      cleanup(withInput ? inputEl.value : true);
    }

    function onCancel() {
      cleanup(false);
    }

    function updateOkButtonState() {
      okBtn.disabled = withInput && inputEl.value.trim().length === 0;
    }

    function onKeyDown(e) {
      if (e.key === "Enter" && !okBtn.disabled) {
        onOk();
      }
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    inputEl.addEventListener("input", updateOkButtonState);

    if (withInput) {
      inputEl.addEventListener("keydown", onKeyDown);
    }
  });
}




class WorkspaceUI {
  constructor() {
    this.workspaces = [];
  }

  async initialize() {
    const currentWindowId = (await browser.windows.getCurrent()).id;

    if (await this._callBackgroundTask("getPrimaryWindowId") !== currentWindowId) {
      document.getElementById("createNewWsp").style.display = "none";
      document.getElementById("wsp-list").innerHTML = "<li class='no-wsp'>Workspaces are only available in the primary window.</li>";
      return;
    }

    this.workspaces.push(...await this.getWorkspaces(currentWindowId));
    this.displayWorkspaces();
    this.handleEvents();
  }

  async getWorkspaces(currentWindowId) {
    const workspaces = await this._callBackgroundTask("getWorkspaces", { windowId: currentWindowId });
    workspaces.sort((a, b) => a.name.localeCompare(b.name));
    return workspaces;
  }

  displayWorkspaces() {
    this.workspaces.forEach(workspace => this._addWorkspace(workspace));
  }

  handleEvents() {
    document.getElementById("createNewWsp").addEventListener("click", async (e) => {
      const windowId = (await browser.windows.getCurrent()).id;
      const wspId = Date.now();

      const inputValue = await showCustomDialog({ message: "Create workspace:", withInput: true, defaultValue: await this._callBackgroundTask("getWorkspaceName") });
      if (inputValue === false) {
        return; // User cancelled the dialog
      }

      const wspName = inputValue.trim();
      if (wspName.length === 0) {
        return;
      }

      const wsp = {
        id: wspId,
        name: wspName,
        active: true,
        tabs: [],
        windowId: windowId
      };

      // create a new workspace
      await this._callBackgroundTask("createWorkspace", wsp);

      // create a temp tab for the new workspace
      // this would be added to the workspace in the background script
      const tempTab = await browser.tabs.create({
        active: true,
        windowId
      });

      // hide all other tabs from other workspaces
      await this._callBackgroundTask("hideInactiveWspTabs", { windowId });

      wsp.tabs.push(tempTab.id);
      this.workspaces.push(wsp);

      // remove previously active list item
      this._removePreviouslyActiveLi();

      this._addWorkspace(wsp);

    });

  }

  async _callBackgroundTask(action, args) {
    const message = { action, ...args };

    return browser ? await browser.runtime.sendMessage(message) : null;
  }

  _createListItemAndRegisterListeners(workspace) {
    const li = document.createElement("li");
    li.classList.add("wsp-list-item");
    
    workspace.active && li.classList.add("active");

    li.dataset.wspId = workspace.id;

    const span1 = document.createElement("span");
    span1.spellcheck = false;
    span1.textContent = workspace.name;
    li.appendChild(span1);

    const span2 = document.createElement("span");
    span2.classList.add("tabs-qty");
    span2.textContent = "(" + workspace.tabs.length + " tabs)";
    li.appendChild(span2);

    const deleteBtn = document.createElement("a");
    deleteBtn.href = "#";
    deleteBtn.classList.add("edit-btn", "delete-btn");
    li.appendChild(deleteBtn);

    const renameBtn = document.createElement("a");
    renameBtn.href = "#";
    renameBtn.classList.add("edit-btn", "rename-btn");
    li.appendChild(renameBtn);

    li.dataset.originalText = span1.textContent;

    // select a workspace
    li.addEventListener("click", async (e) => {
      if (li.classList.contains("active")) {
        // if the workspace is already active, do nothing
        return;
      }

      const lis = document.getElementsByTagName("li");

      // uncheck other boxes
      for (let i = 0; i < lis.length; i++) {
        lis[i].classList.remove("active");
      }

      li.classList.add("active");

      // activate this workspace
      await this._callBackgroundTask("activateWorkspace", { wspId: workspace.id, windowId: workspace.windowId });

      // close popup
      window.close();
    });

    // rename a workspace by clicking on the rename button
    renameBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const inputValue = await showCustomDialog({ message: "Rename workspace:", withInput: true, defaultValue: li.dataset.originalText });
      if (inputValue !== false && inputValue !== li.dataset.originalText) {
        const wspName = inputValue.trim();
        if (wspName.length === 0) {
          return;
        }
        const wspId = li.dataset.wspId;
        li.dataset.originalText = wspName;
        span1.textContent = wspName;
        // rename a workspace
        await this._callBackgroundTask("renameWorkspace", { wspId, wspName });
      }
    });

    // delete a workspace
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const deleteConfirmed = await showCustomDialog({ message: `Are you sure you want to delete "${li.dataset.originalText}"?` });
      if (!deleteConfirmed) {
        return;
      }

      const liParent = li.parentElement;

      // removing the active workspace
      li.parentNode.removeChild(li);
      if (li.classList.contains("active")) {
        // set the first child of the parent to be active
        const firstChild = liParent.children[0];

        if (firstChild) {
          firstChild.classList.add("active");
          firstChild.firstElementChild.checked = true;
          await this._callBackgroundTask("activateWorkspace", { wspId: firstChild.dataset.wspId, windowId: workspace.windowId });
        }
      }
      await this._callBackgroundTask("destroyWsp", { wspId: workspace.id });
    });

    return li;
  }

  _addWorkspace(workspace) {
    const wspList = document.getElementById("wsp-list");

    const li = this._createListItemAndRegisterListeners(workspace);

    wspList.appendChild(li);

    // it could have been sorted in place while added to the list
    // however, this is easier to understand and implement
    // if performance is an issue, then switch back to sort on fly
    this._sortWorkspaces();

    return li;
  }

  // from https://www.w3schools.com/howto/howto_js_sort_list.asp
  _sortWorkspaces() {
    let list, i, switching, b, shouldSwitch;

    list = document.getElementById("wsp-list");

    switching = true;

    while (switching) {
      switching = false;

      b = list.getElementsByTagName("li");

      for (i = 0; i < b.length - 1; i++) {
        shouldSwitch = false;

        if (b[i].dataset.originalText.localeCompare(b[i+1].dataset.originalText) > 0) {
          shouldSwitch = true;
          break;
        }
      }

      if (shouldSwitch) {
        b[i].parentNode.insertBefore(b[i+1], b[i]);
        switching = true;
      }
    }
  }

  _removePreviouslyActiveLi() {
    const lis = document.getElementsByClassName("active");

    for (const li of lis) {
      li.classList.remove("active");
      li.firstElementChild.checked = false;
    }
  }
}

(async () => {
  const wsp = new WorkspaceUI();
  await wsp.initialize();
})();
