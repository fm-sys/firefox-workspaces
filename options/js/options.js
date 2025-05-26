class OptionsUI {
  constructor() {
    this.optionsKeys = {
      rememberWorkspaces: false // key: default value
    }
  }

  initialize() {
    this.handleEvents();
  }

  static async readOption(optionKey) {
    const key = `ld-option-${optionKey}`;
    const results = await browser.storage.local.get(key);
    // console.log('readOption \'' + key + '\':', results[key]);
    return results[key] || null;
  }

  // option is { name: abc, value: xyz }
  static async saveOption(option) {
    // console.log('saveOption \'' + option.name + '\' with value: \'' + option.value + '\'');
    const key = `ld-option-${option.name}`;
    await browser.storage.local.set({
      [key]: option.value
    });
  }

  async restoreOptions() {
    await Promise.all(Object.entries(this.optionsKeys).map(async ([optionKey, optionDefaultValue]) => {
      const value = await OptionsUI.readOption(optionKey);
      document.getElementById(optionKey).checked = value || optionDefaultValue; // id is option key
    }));
  }

  async saveOptions() {
    await Promise.all(Object.keys(this.optionsKeys).map(async (optionKey) => {
      const value = document.getElementById(optionKey).checked;
      // console.log('saving option ' + optionKey + ' with value: ' + value);
      await OptionsUI.saveOption({ name: optionKey, value });
    }));
  }

  handleEvents() {
    // load options values on load
    document.addEventListener('DOMContentLoaded', () => {
      this.restoreOptions.call(this); // call restoreOptions while passing this context to it
    });

    document.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveOptions.call(this); // call saveOptions while passing this context to it
    });
  }
}

const options = new OptionsUI();
options.initialize();

