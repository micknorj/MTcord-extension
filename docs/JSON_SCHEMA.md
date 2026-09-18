# JSON export schema

MTcord exports one JSON document per channel. Messages are ordered from oldest to newest within each document.

## File layout

A single-channel export is downloaded directly as `<scope>.json`.

A multi-channel export is downloaded as `<scope>.zip`. Each channel has a sanitized folder containing `messages.json`. A channel ID is added when sanitized names would otherwise conflict.

## Schema

```json
{
  "schemaVersion": 1,
  "server": {
    "id": "123",
    "name": "Example server"
  },
  "channel": {
    "id": "456",
    "name": "general"
  },
  "messages": [
    {
      "id": "789",
      "author": {
        "id": "101",
        "username": "username",
        "displayName": "Display name"
      },
      "timestamp": "2026-09-18T10:00:00.000Z",
      "editedTimestamp": null,
      "content": "Example message",
      "replyTo": null,
      "attachments": [
        {
          "id": "202",
          "filename": "file.pdf",
          "contentType": "application/pdf",
          "size": 12345
        }
      ]
    }
  ]
}
```

Direct-message exports use `null` for `server`.

`replyTo` is `null` or an object containing the referenced `messageId`. Attachment entries contain metadata only; the attachment content is not embedded in the JSON export.

## Excluded data

Exports do not contain session credentials, authorization headers, cookies, signed attachment URLs, application state or logs.
