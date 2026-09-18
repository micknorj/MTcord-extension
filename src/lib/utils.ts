import type {
  Attachment,
  AttachmentKind,
  Channel,
  Message,
  SearchCriteria,
} from "../types.ts";

const MEDIA_PREFIXES = ["image/", "video/", "audio/"];
const MEDIA_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "webp",
  "m4a", "mkv", "mov", "mp3", "mp4", "ogg", "opus", "wav", "webm",
]);

export function attachmentKind(attachment: Attachment): AttachmentKind {
  const type = attachment.content_type?.toLowerCase() ?? "";
  if (MEDIA_PREFIXES.some((prefix) => type.startsWith(prefix))) return "media";
  const extension = extensionOf(attachment.filename).slice(1).toLowerCase();
  return MEDIA_EXTENSIONS.has(extension) ? "media" : "file";
}

export function applyLocalFilters(
  messages: Message[],
  criteria: SearchCriteria,
  currentUserId: string,
): Message[] {
  return messages.filter((message) => {
    if (criteria.myMessagesOnly && message.author.id !== currentUserId) return false;
    if (criteria.fromDate && message.timestamp < `${criteria.fromDate}T00:00:00.000Z`) return false;
    if (criteria.toDate && message.timestamp > `${criteria.toDate}T23:59:59.999Z`) return false;
    if (!criteria.media && !criteria.files) return true;
    const kinds = new Set(message.attachments.map(attachmentKind));
    return (criteria.media && kinds.has("media")) || (criteria.files && kinds.has("file"));
  });
}

export function uniqueMessages(messages: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const message of messages) map.set(message.id, message);
  return [...map.values()].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}

export function deletionCandidates(messages: Message[], currentUserId: string): Message[] {
  return messages.filter((message) => message.author.id === currentUserId);
}

export function channelLabel(channel: Channel): string {
  if (channel.name) return channel.name;
  const names = channel.recipients?.map((recipient) => recipient.username).filter(Boolean);
  return names?.length ? names.join(", ") : `Conversation ${channel.id}`;
}

export function sanitizeFilename(input: string, fallback = "untitled"): string {
  const cleaned = input
    .normalize("NFKC")
    .replace(/\.\./g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/-+/g, "-")
    .replace(/[. ]+$/g, "")
    .replace(/^[. -]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const candidate = cleaned || fallback;
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
  return reserved.test(candidate) ? `_${candidate}` : candidate;
}

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,12})$/i.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : "";
}

export function attachmentFilename(
  message: Message,
  attachment: Attachment,
  sequence: number,
): string {
  const date = new Date(message.timestamp);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  const author = sanitizeFilename(message.author.username, "user").replace(/\s+/g, "-");
  const sequenceText = String(sequence).padStart(3, "0");
  return `${author}-${day}-${month}-${year}-${sequenceText}${extensionOf(attachment.filename)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

export function toSnowflake(date: string, endOfDay = false): string {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const milliseconds = BigInt(new Date(`${date}${suffix}`).getTime());
  return ((milliseconds - 1420070400000n) << 22n).toString();
}

export function safeDiscordUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && [
      "cdn.discordapp.com",
      "media.discordapp.net",
      "discord.com",
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

export function publicAttachmentUrl(value: string): string | null {
  if (!safeDiscordUrl(value)) return null;
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
}
