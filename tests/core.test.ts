import test from "node:test";
import assert from "node:assert/strict";
import { abortableDelay, ApiError, parseSearchResponse } from "../src/lib/api.ts";
import { archiveMessage, createJsonFiles } from "../src/lib/export.ts";
import createManifest from "../src/manifest.ts";
import packageInfo from "../package.json" with { type: "json" };
import {
  applyLocalFilters,
  attachmentFilename,
  attachmentKind,
  deletionCandidates,
  publicAttachmentUrl,
  safeDiscordUrl,
  sanitizeFilename,
  uniqueMessages,
} from "../src/lib/utils.ts";
import type { Attachment, Channel, Message, SearchCriteria } from "../src/types.ts";

const image: Attachment = {
  id: "a1",
  filename: "photo.JPG",
  content_type: "image/jpeg",
  size: 1200,
  url: "https://cdn.discordapp.com/attachments/1/2/photo.JPG?ex=secret",
};

const documentFile: Attachment = {
  id: "a2",
  filename: "report.pdf",
  content_type: "application/pdf",
  size: 2200,
  url: "https://cdn.discordapp.com/attachments/1/2/report.pdf",
};

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    channel_id: "c1",
    author: { id: "u1", username: "mick" },
    content: "hello",
    timestamp: "2026-09-18T10:00:00.000Z",
    edited_timestamp: null,
    attachments: [],
    ...overrides,
  };
}

const noFilters: SearchCriteria = {
  query: "",
  fromDate: "",
  toDate: "",
  myMessagesOnly: false,
  media: false,
  files: false,
};

test("sanitizes path traversal, Windows-invalid characters, and reserved names", () => {
  assert.equal(sanitizeFilename("../../bad:<name>?.json"), "bad-name-.json");
  assert.equal(sanitizeFilename("CON"), "_CON");
  assert.equal(sanitizeFilename("..."), "untitled");
});

test("classifies media and files by MIME type and safe fallback extension", () => {
  assert.equal(attachmentKind(image), "media");
  assert.equal(attachmentKind(documentFile), "file");
  assert.equal(attachmentKind({ ...image, content_type: null, filename: "clip.webm" }), "media");
});

test("builds stable attachment filenames", () => {
  assert.equal(attachmentFilename(message(), image, 1), "mick-18-09-26-001.jpg");
});

test("filters by owner, dates, media, and files", () => {
  const input = [
    message({ id: "own-image", attachments: [image] }),
    message({ id: "own-file", timestamp: "2026-09-19T10:00:00.000Z", attachments: [documentFile] }),
    message({ id: "other-image", author: { id: "u2", username: "other" }, attachments: [image] }),
  ];
  assert.deepEqual(applyLocalFilters(input, { ...noFilters, myMessagesOnly: true, media: true, fromDate: "2026-09-18", toDate: "2026-09-18" }, "u1").map((item) => item.id), ["own-image"]);
  assert.deepEqual(applyLocalFilters(input, { ...noFilters, files: true }, "u1").map((item) => item.id), ["own-file"]);
});

test("deduplicates messages and orders newest first", () => {
  const result = uniqueMessages([
    message({ id: "old", timestamp: "2026-09-17T00:00:00.000Z" }),
    message({ id: "new", timestamp: "2026-09-18T00:00:00.000Z" }),
    message({ id: "old" }),
  ]);
  assert.deepEqual(result.map((item) => item.id), ["old", "new"]);
  assert.equal(result.length, 2);
});

test("restricts deletion candidates to the authenticated user", () => {
  const input = [message(), message({ id: "m2", author: { id: "u2", username: "other" } })];
  assert.deepEqual(deletionCandidates(input, "u1").map((item) => item.id), ["m1"]);
});

test("accepts only approved Discord attachment hosts", () => {
  assert.equal(safeDiscordUrl(image.url), true);
  assert.equal(safeDiscordUrl("https://example.com/file.png"), false);
  assert.equal(safeDiscordUrl("javascript:alert(1)"), false);
  assert.equal(publicAttachmentUrl(image.url), "https://cdn.discordapp.com/attachments/1/2/photo.JPG");
});

test("parses search groups and keeps the hit rather than context", () => {
  const hit = message({ id: "hit", hit: true });
  const context = message({ id: "context" });
  const result = parseSearchResponse({ total_results: 1, messages: [[context, hit]] });
  assert.equal(result.total, 1);
  assert.deepEqual(result.messages.map((item) => item.id), ["hit"]);
});

test("rejects malformed search responses", () => {
  assert.throws(() => parseSearchResponse({ messages: [] }), ApiError);
});

test("JSON archive excludes attachment URLs and private request data", () => {
  const archived = archiveMessage(message({ attachments: [image] }));
  const text = JSON.stringify(archived);
  assert.equal(text.includes("cdn.discordapp.com"), false);
  assert.equal(text.includes("Authorization"), false);
  assert.equal(text.includes("token"), false);
});

test("creates one JSON file per channel and prevents colliding paths", () => {
  const channels: Channel[] = [
    { id: "c1", type: 0, name: "general" },
    { id: "c2", type: 0, name: "general" },
  ];
  const files = createJsonFiles([
    message({ id: "m1", channel_id: "c1" }),
    message({ id: "m2", channel_id: "c2" }),
  ], { guild: { id: "g1", name: "Server" }, channels });
  assert.deepEqual(Object.keys(files).sort(), ["general-c2/messages.json", "general/messages.json"]);
});

test("cancels rate-limit waits immediately", async () => {
  const controller = new AbortController();
  const waiting = abortableDelay(10_000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("extension manifests request only the active-tab permission", () => {
  for (const target of ["chromium", "firefox"]) {
    const manifest = createManifest(target) as unknown as { permissions: string[]; version: string };
    assert.deepEqual(manifest.permissions, ["activeTab"]);
    assert.equal(manifest.version, packageInfo.version);
  }
});

test("Firefox manifest uses the MTcord package identifier and declares no data collection", () => {
  const manifest = createManifest("firefox") as unknown as {
    browser_specific_settings: {
      gecko: {
        id: string;
        data_collection_permissions: { required: string[] };
      };
    };
  };
  assert.equal(manifest.browser_specific_settings.gecko.id, "@micknorj.tools-mtcord");
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
});
