# Manual test checklist

## Automated checks

Run the complete local check from the repository root before browser testing:

```sh
npm ci
npm test
npm run typecheck
npm run audit:prod
npm run package
```

## Browser setup

### Chromium

1. Open `chrome://extensions` or the equivalent extensions page.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select the repository's `dist/chromium` folder.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json` from the repository.

Repeat the checklist in both browser families.

## Connection and scope

- Open Discord and sign in
- Open MTcord from the browser toolbar
- Connect without entering or exposing a token
- Confirm server and direct-message scopes load
- Select one server and multiple channels
- Confirm changing the scope clears the current results and selection

## Search and results

- Run text and date searches
- Run searches for your messages, media and files
- Confirm results appear before the complete history is loaded
- Use **Load more**
- Select one message
- Select all complete matches
- Confirm changing any filter clears the current results and selection
- Confirm partial failures remain visible

## Export and download

- Export one channel as a direct JSON file
- Export multiple channels as a ZIP with one folder per channel
- Download one media item directly
- Download multiple media items as a ZIP
- Download files separately from media
- Confirm downloaded attachment names use `username-dd-mm-yy-xxx.ext`
- Confirm JSON exports exclude credentials, attachment URLs and internal state

## Deletion and cancellation

- Confirm deletion includes only messages owned by the signed-in account
- Confirm the exact deletion count appears once before confirmation
- Cancel complete-match resolution, downloading and deletion
- Confirm work completed before cancellation remains completed
- Confirm ambiguous deletion failures are not retried automatically

## Interface

- Cycle System, Light and Dark appearance
- Confirm appearance returns to System after reloading MTcord
- Confirm `Messages will appear here.` is centered horizontally and vertically before a search
- Confirm Export remains on one line
- Confirm theme and hover color changes fade over 140 ms instead of jumping
- Confirm Connect and Reconnect have no hover fill or color change
- Confirm the results status bar is hidden while idle and appears only during actions, progress or errors
- Check the layout above and below 980 px, 720 px, 560 px and 420 px
- Confirm controls, toolbars, messages and dialogs remain visible without horizontal page overflow
- Test keyboard focus, dialog focus and Escape where applicable

## Package inspection

```powershell
Get-ChildItem .\packages\*.zip | Select-Object Name, Length
tar.exe -tf .\packages\MTcord-v0.1-chromium.zip
tar.exe -tf .\packages\MTcord-v0.1-firefox.zip
Get-FileHash .\packages\*.zip -Algorithm SHA256
```

Confirm that neither package contains source maps, tests, credentials, logs, screenshots or Discrub Classic branding.

## Release checklist

- Confirm `package.json` and both generated manifests report version `0.1.0`
- Confirm all automated checks pass
- Complete the browser checklist in Chromium and Firefox
- Inspect both release packages
- Record the SHA-256 hashes
- Create tag `v0.1.0` from the tested commit
- Attach `MTcord-v0.1-chromium.zip` and `MTcord-v0.1-firefox.zip` to the GitHub release
- Describe the Firefox package as temporary and unsigned
- Confirm the release links and installation steps from a clean browser profile
