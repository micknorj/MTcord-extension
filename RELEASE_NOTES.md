MTcord v0.1.1

- Updated the shared Mick's Tools interface and restored bottom-of-page credits.
- Kept the package and both browser manifest versions in sync.
- Aligned Firefox's minimum version with its built-in no-data-collection declaration (Firefox 140+).
- Added automatic release ZIP validation and SHA-256 checksums.
- Included the project license, attribution, and complete runtime dependency license terms in each ZIP.
- Updated a vulnerable development dependency; dependency audits report no known vulnerabilities at preparation time.

Download the ZIP for your browser, rather than GitHub's source archives:

- `MTcord-v0.1.1-chromium.zip`: extract and load the folder using the browser's **Load unpacked** option.
- `MTcord-v0.1.1-firefox.zip`: unsigned, for temporary installation through `about:debugging#/runtime/this-firefox`. Permanent installation in standard Firefox requires Mozilla signing.
- `SHA256SUMS.txt`: SHA-256 hashes of both ZIP files.

MTcord uses an existing signed-in Discord tab. It is independent of Discord, and has no analytics, telemetry, credential storage, or intermediary service. See the README and security policy for permissions, limitations, and installation instructions.
