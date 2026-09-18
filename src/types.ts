export type Appearance = "system" | "light" | "dark";
export type ScopeMode = "server" | "dm";
export type AttachmentKind = "media" | "file";

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface Guild {
  id: string;
  name: string;
}

export interface Channel {
  id: string;
  type: number;
  guild_id?: string;
  name?: string | null;
  position?: number;
  recipients?: DiscordUser[];
}

export interface Attachment {
  id: string;
  filename: string;
  content_type?: string | null;
  size: number;
  url: string;
  proxy_url?: string;
  width?: number | null;
  height?: number | null;
}

export interface Message {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  attachments: Attachment[];
  message_reference?: { message_id?: string } | null;
  hit?: boolean;
}

export interface SearchCriteria {
  query: string;
  fromDate: string;
  toDate: string;
  myMessagesOnly: boolean;
  media: boolean;
  files: boolean;
}

export interface SearchScope {
  mode: ScopeMode;
  guildId?: string;
  channelIds: string[];
}

export interface SearchCursor {
  offset: number;
  before?: string;
}

export interface SearchPage {
  messages: Message[];
  total: number;
  cursor: SearchCursor | null;
}

export interface OperationFailure {
  item: string;
  reason: string;
}

export interface ArchiveMessage {
  id: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
  };
  timestamp: string;
  editedTimestamp: string | null;
  content: string;
  replyTo: { messageId: string } | null;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string | null;
    size: number;
  }>;
}
