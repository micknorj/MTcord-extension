import { strToU8, zipSync } from "fflate";
import type {
  ArchiveMessage,
  Attachment,
  AttachmentKind,
  Channel,
  Guild,
  Message,
  OperationFailure,
} from "../types.ts";
import {
  attachmentFilename,
  attachmentKind,
  channelLabel,
  publicAttachmentUrl,
  safeDiscordUrl,
  sanitizeFilename,
} from "./utils.ts";

const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024;

export interface ExportContext {
  guild: Guild | null;
  channels: Channel[];
}

export interface DownloadResult {
  completed: number;
  failures: OperationFailure[];
}

export function archiveMessage(message: Message): ArchiveMessage {
  return {
    id: message.id,
    author: {
      id: message.author.id,
      username: message.author.username,
      displayName: message.author.global_name ?? null,
    },
    timestamp: new Date(message.timestamp).toISOString(),
    editedTimestamp: message.edited_timestamp
      ? new Date(message.edited_timestamp).toISOString()
      : null,
    content: message.content,
    replyTo: message.message_reference?.message_id
      ? { messageId: message.message_reference.message_id }
      : null,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      filename: sanitizeFilename(attachment.filename, "attachment"),
      contentType: attachment.content_type ?? null,
      size: attachment.size,
    })),
  };
}

export function createJsonFiles(
  messages: Message[],
  context: ExportContext,
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const byChannel = groupByChannel(messages);
  const multipleChannels = byChannel.size > 1;
  const usedPaths = new Set<string>();

  for (const [channelId, channelMessages] of byChannel) {
    const channel = context.channels.find((item) => item.id === channelId);
    const channelName = sanitizeFilename(channel ? channelLabel(channel) : channelId, "channel");
    const payload = {
      schemaVersion: 1,
      server: context.guild
        ? { id: context.guild.id, name: context.guild.name }
        : null,
      channel: { id: channelId, name: channel ? channelLabel(channel) : channelId },
      messages: channelMessages
        .slice()
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        .map(archiveMessage),
    };
    let path = multipleChannels ? `${channelName}/messages.json` : "messages.json";
    if (usedPaths.has(path)) path = `${channelName}-${channelId}/messages.json`;
    usedPaths.add(path);
    files[path] = strToU8(`${JSON.stringify(payload, null, 2)}\n`);
  }
  return files;
}

export function exportJson(messages: Message[], context: ExportContext): void {
  const files = createJsonFiles(messages, context);
  const scopeName = sanitizeFilename(
    context.guild?.name ?? channelLabel(context.channels[0]),
    "mtcord-export",
  );
  const entries = Object.entries(files);
  if (entries.length === 1) {
    saveBlob(new Blob([entries[0][1] as BlobPart], { type: "application/json" }), `${scopeName}.json`);
  } else {
    saveBlob(new Blob([zipSync(files) as BlobPart], { type: "application/zip" }), `${scopeName}.zip`);
  }
}

export async function downloadAttachments(
  messages: Message[],
  context: ExportContext,
  kind: AttachmentKind,
  signal: AbortSignal,
  onProgress: (completed: number, total: number, failed: number) => void,
): Promise<DownloadResult> {
  const candidates: Array<{ message: Message; attachment: Attachment }> = [];
  for (const message of messages) {
    for (const attachment of message.attachments) {
      if (attachmentKind(attachment) === kind) candidates.push({ message, attachment });
    }
  }

  if (candidates.length === 0) return { completed: 0, failures: [] };

  const files: Record<string, Uint8Array> = {};
  const failures: OperationFailure[] = [];
  const sequences = new Map<string, number>();
  const paths = new Set<string>();
  let completed = 0;
  let totalBytes = 0;

  for (const candidate of candidates) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const { message, attachment } = candidate;
    const channel = context.channels.find((item) => item.id === message.channel_id);
    const key = message.channel_id;
    const sequence = (sequences.get(key) ?? 0) + 1;
    sequences.set(key, sequence);

    let filename = attachmentFilename(message, attachment, sequence);
    const folder = candidates.some((item) => item.message.channel_id !== key)
      ? `${sanitizeFilename(channel ? channelLabel(channel) : key, "channel")}/`
      : "";
    let path = `${folder}${filename}`;
    let duplicate = 2;
    while (paths.has(path)) {
      const extension = filename.match(/\.[^.]+$/)?.[0] ?? "";
      const stem = extension ? filename.slice(0, -extension.length) : filename;
      filename = `${stem}-${duplicate}${extension}`;
      path = `${folder}${filename}`;
      duplicate += 1;
    }
    paths.add(path);

    try {
      if (!safeDiscordUrl(attachment.url)) throw new Error("Unsupported attachment host");
      if (attachment.size > MAX_DOWNLOAD_BYTES || totalBytes + attachment.size > MAX_DOWNLOAD_BYTES) {
        throw new Error("Download exceeds the 512 MB memory limit");
      }
      const response = await fetch(attachment.url, { signal, credentials: "omit" });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > MAX_DOWNLOAD_BYTES || totalBytes + declaredSize > MAX_DOWNLOAD_BYTES) {
        throw new Error("Download exceeds the 512 MB memory limit");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_DOWNLOAD_BYTES) throw new Error("Download exceeds the 512 MB memory limit");
      files[path] = bytes;
      completed += 1;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      failures.push({
        item: publicAttachmentUrl(attachment.url) ? attachment.filename : "Unsupported attachment",
        reason: error instanceof Error ? error.message : "Download failed",
      });
    }
    onProgress(completed, candidates.length, failures.length);
  }

  const entries = Object.entries(files);
  if (entries.length === 1) {
    saveBlob(new Blob([entries[0][1] as BlobPart]), entries[0][0].split("/").at(-1) ?? "attachment");
  } else if (entries.length > 1) {
    const scopeName = sanitizeFilename(
      context.guild?.name ?? channelLabel(context.channels[0]),
      "mtcord-download",
    );
    saveBlob(new Blob([zipSync(files) as BlobPart], { type: "application/zip" }), `${scopeName}.zip`);
  }

  return { completed, failures };
}

function groupByChannel(messages: Message[]): Map<string, Message[]> {
  const groups = new Map<string, Message[]>();
  for (const message of messages) {
    groups.set(message.channel_id, [...(groups.get(message.channel_id) ?? []), message]);
  }
  return groups;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFilename(filename, "download");
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
