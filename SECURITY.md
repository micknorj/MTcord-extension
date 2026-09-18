# Security policy

## Supported versions

The latest published version is supported for security fixes.

Development builds may change before release. Older versions may stop receiving fixes after a newer version is published.

## Reporting a vulnerability

Do not post Discord credentials, authorization values, cookies, private messages or sensitive attachment links in a public GitHub issue.

Use [GitHub private vulnerability reporting](https://github.com/micknorj/MTcord-extension/security/advisories/new) if it is available for this repository.

A useful report should include:

- Affected extension version and browser
- Description of the issue
- Steps to reproduce it
- Expected behavior
- Actual behavior
- Sanitized logs, if relevant

Do not include:

- Discord session tokens
- Authorization headers
- Cookies
- Private messages
- Private attachment URLs
- Personal account information

## Security model

MTcord reads the session token stored by the open Discord page only after the user selects Connect. The token is passed to the extension in memory and used only for requests to Discord.

MTcord has no token-entry interface, intermediary server, analytics or telemetry.

The extension uses the permissions documented in the [README](README.md#permissions). It does not request access to all websites, browsing history or cookies.

## Runtime data

Session credentials, message results, selections, appearance, progress and operation failures remain in memory. MTcord does not intentionally write this state to browser storage, logs or project files.

Closing the MTcord page discards its application state.

## Networking

Authenticated API requests are restricted to `discord.com`.

Attachment previews and downloads accept only Discord-hosted URLs on `cdn.discordapp.com` and `media.discordapp.net`. Attachment downloads omit browser credentials.

MTcord does not send Discord data to a service operated by MTcord.

## Content and exports

Message content is rendered as text rather than raw HTML.

JSON exports exclude session credentials, authorization headers, cookies, attachment URLs, internal state and logs.

Exported filenames are sanitized for Windows, reserved names and path traversal. Multiple files are packaged in memory with bounded output paths.

## Deletion safety

Deletion is limited to messages owned by the signed-in Discord account.

MTcord resolves the complete matching set, validates ownership again and presents the exact count before confirmation. Deletion then runs sequentially.

Rate-limit responses may be retried after the server-provided delay. Ambiguous or non-rate-limit failures are reported and are not retried automatically.

## Resource limits

Attachment downloads are limited to 512 MB in memory per operation. Cancellation stops remaining work but does not reverse exports, downloads or deletions already completed.

## Disclaimer

MTcord is an independent project and is not affiliated with or endorsed by Discord.
