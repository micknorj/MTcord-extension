import type {
  Channel,
  DiscordUser,
  Guild,
  Message,
  SearchCriteria,
  SearchCursor,
  SearchPage,
  SearchScope,
} from "../types.ts";
import { toSnowflake, uniqueMessages } from "./utils.ts";

const API = "https://discord.com/api/v10";
const PAGE_SIZE = 25;
const MAX_OFFSET = 9975;

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export class DiscordApi {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    signal?: AbortSignal,
    retryRateLimit = true,
  ): Promise<T> {
    for (;;) {
      const response = await fetch(`${API}${path}`, {
        ...options,
        signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: this.token,
          ...options.headers,
        },
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }

      if (response.status === 429 && retryRateLimit) {
        const body = (await response.json().catch(() => null)) as {
          retry_after?: number;
        } | null;
        const delay = Math.max(250, Math.ceil((body?.retry_after ?? 1) * 1000));
        await abortableDelay(delay, signal);
        continue;
      }

      if (response.status === 401) throw new ApiError("Discord session expired.", 401);
      if (response.status === 403) throw new ApiError("Discord denied this action.", 403);
      throw new ApiError(`Discord request failed (${response.status}).`, response.status);
    }
  }

  currentUser(signal?: AbortSignal): Promise<DiscordUser> {
    return this.request("/users/@me", {}, signal);
  }

  guilds(signal?: AbortSignal): Promise<Guild[]> {
    return this.request("/users/@me/guilds", {}, signal);
  }

  directMessages(signal?: AbortSignal): Promise<Channel[]> {
    return this.request("/users/@me/channels", {}, signal);
  }

  channels(guildId: string, signal?: AbortSignal): Promise<Channel[]> {
    return this.request(`/guilds/${guildId}/channels`, {}, signal);
  }

  async search(
    scope: SearchScope,
    criteria: SearchCriteria,
    currentUserId: string,
    cursor: SearchCursor = { offset: 0 },
    signal?: AbortSignal,
  ): Promise<SearchPage> {
    const params = new URLSearchParams({ include_nsfw: "true" });
    if (criteria.query.trim()) params.set("content", criteria.query.trim());
    if (criteria.myMessagesOnly) params.append("author_id", currentUserId);
    if (criteria.media || criteria.files) params.append("has", "file");
    if (criteria.fromDate) params.set("min_id", toSnowflake(criteria.fromDate));
    if (criteria.toDate) params.set("max_id", toSnowflake(criteria.toDate, true));
    if (cursor.before) params.set("max_id", cursor.before);
    if (cursor.offset) params.set("offset", String(cursor.offset));

    let path: string;
    if (scope.mode === "server" && scope.guildId) {
      for (const channelId of scope.channelIds) params.append("channel_id", channelId);
      path = `/guilds/${scope.guildId}/messages/search?${params.toString()}`;
    } else {
      const channelId = scope.channelIds[0];
      path = `/channels/${channelId}/messages/search?${params.toString()}`;
    }

    const payload = await this.request<unknown>(path, {}, signal);
    const parsed = parseSearchResponse(payload);
    const nextOffset = cursor.offset + PAGE_SIZE;
    let next: SearchCursor | null = nextOffset < parsed.total
      ? { offset: nextOffset, before: cursor.before }
      : null;

    if (next && nextOffset > MAX_OFFSET) {
      const oldest = parsed.messages.at(-1);
      next = oldest ? { offset: 0, before: oldest.id } : null;
    }

    return { ...parsed, cursor: next };
  }

  deleteMessage(channelId: string, messageId: string, signal?: AbortSignal): Promise<void> {
    return this.request(
      `/channels/${channelId}/messages/${messageId}`,
      { method: "DELETE" },
      signal,
      true,
    );
  }
}

export function parseSearchResponse(payload: unknown): Omit<SearchPage, "cursor"> {
  if (!payload || typeof payload !== "object") throw new ApiError("Discord returned malformed search data.");
  const record = payload as { total_results?: unknown; messages?: unknown };
  if (typeof record.total_results !== "number" || !Array.isArray(record.messages)) {
    throw new ApiError("Discord returned malformed search data.");
  }

  const hits: Message[] = [];
  for (const entry of record.messages) {
    const group = Array.isArray(entry) ? entry : [entry];
    const candidate = group.find((item) => isMessage(item) && item.hit) ?? group.find(isMessage);
    if (candidate && isMessage(candidate)) hits.push(candidate);
  }
  return { messages: uniqueMessages(hits), total: record.total_results };
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<Message>;
  return typeof message.id === "string"
    && typeof message.channel_id === "string"
    && typeof message.content === "string"
    && typeof message.timestamp === "string"
    && Boolean(message.author && typeof message.author.id === "string")
    && Array.isArray(message.attachments);
}

export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }, { once: true });
  });
}
