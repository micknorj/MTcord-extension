# Discrub Classic baseline

MTcord was rebuilt from Discrub Classic baseline commit `86a2b4570a29432c2fb9355b5ba7bcb086d4d978`.

The baseline completed TypeScript and Vite compilation. Its final manifest-cleaning command failed under Linux because it passed a Bash here-string through `sh` and required `jq`. MTcord replaced that process with separate reproducible Chromium and Firefox builds that do not depend on that shell command.

## Decisions

| Area | Decision | Result |
| --- | --- | --- |
| MIT license and attribution | Keep | Preserved in the [license](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md) |
| Chromium and Firefox foundation | Rework | Separate builds generated from one source tree |
| Existing-session authentication | Rework | Memory-only session transfer with no token-entry interface |
| Discord requests and search | Rework | Small typed client with validation, cancellation and rate-limit handling |
| React and Vite | Keep | Retained without MUI, Emotion or Redux |
| Discrub interface and theme | Remove | Replaced with the Mick's Tools interface |
| HTML and CSV export | Remove | JSON export only |
| Editing, reactions, tags and rich embeds | Remove | Excluded from MTcord |
| Purge and configurable delays | Remove | Replaced with ownership-validated sequential deletion |
| Settings, donations and remote announcements | Remove | Excluded from MTcord |
| Legacy screenshots and documentation | Remove | Replaced with MTcord documentation |
| StreamSaver subsystem | Remove | Replaced with direct and ZIP downloads |

## Dependencies

Runtime dependencies were reduced to React, React DOM and fflate.

MUI, Emotion, Redux, date libraries, CSV, Markdown, syntax highlighting, printing, StreamSaver and dependencies used only by removed features were excluded.
