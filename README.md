# Workspaces - _a beautiful workspace manager for Firefox_

Let's group your tabs into workspaces to navigate through tabs more efficiently.

This extension utilizes tab show and hide APIs so giving it a permission to keep tabs hidden is required.

## Screenshots

[coming shortly]

## Development

Testing can be done by loading the extension in Firefox via `about:debugging#/runtime/this-firefox`. 

To build the extension, zip the `backend/`, `icons/`, `popup/` and `manifest.json` files together. The resulting zip file can be installed in Firefox via `about:addons` (disable `xpinstall.signatures.required`) or upload it as official release.

## Acknowledgements

This extension was based on [workspace-manager](https://addons.mozilla.org/de/firefox/addon/workspace-manager/) with major adoptions to support tab groups and feature a native look and feel.