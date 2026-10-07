import { useEffect, useMemo, useRef, useState } from "react";
import { abortableDelay, ApiError, DiscordApi } from "./lib/api";
import { downloadAttachments, exportJson, type ExportContext } from "./lib/export";
import {
  applyLocalFilters,
  attachmentKind,
  channelLabel,
  deletionCandidates,
  formatBytes,
  safeDiscordUrl,
  uniqueMessages,
} from "./lib/utils";
import type {
  Appearance,
  AttachmentKind,
  Channel,
  DiscordUser,
  Guild,
  Message,
  OperationFailure,
  ScopeMode,
  SearchCriteria,
  SearchCursor,
  SearchScope,
} from "./types";

const EMPTY_CRITERIA: SearchCriteria = {
  query: "",
  fromDate: "",
  toDate: "",
  myMessagesOnly: false,
  media: false,
  files: false,
};

interface SessionResponse {
  ok: boolean;
  token?: string;
}

export default function App() {
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [api, setApi] = useState<DiscordApi | null>(null);
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [dms, setDms] = useState<Channel[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [mode, setMode] = useState<ScopeMode>("server");
  const [guildId, setGuildId] = useState("");
  const [dmId, setDmId] = useState("");
  const [channelIds, setChannelIds] = useState<Set<string>>(new Set());
  const [criteria, setCriteria] = useState<SearchCriteria>(EMPTY_CRITERIA);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<SearchCursor | null>(null);
  const [discordTotal, setDiscordTotal] = useState(0);
  const [complete, setComplete] = useState(false);
  const [searched, setSearched] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<OperationFailure[]>([]);
  const [deleteCandidates, setDeleteCandidates] = useState<Message[] | null>(null);
  const operation = useRef<AbortController | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedGuild = guilds.find((guild) => guild.id === guildId) ?? null;
  const selectedDm = dms.find((dm) => dm.id === dmId) ?? null;
  const selectedChannels = mode === "server"
    ? channels.filter((channel) => channelIds.has(channel.id))
    : selectedDm ? [selectedDm] : [];
  const scope = useMemo<SearchScope>(() => ({
    mode,
    guildId: mode === "server" ? guildId : undefined,
    channelIds: mode === "server" ? [...channelIds] : dmId ? [dmId] : [],
  }), [channelIds, dmId, guildId, mode]);
  const exportContext: ExportContext = {
    guild: mode === "server" ? selectedGuild : null,
    channels: selectedChannels,
  };
  const allSelected = complete && messages.length > 0 && selectedIds.size === messages.length;
  const canSearch = Boolean(api && user && scope.channelIds.length && !busy);
  const resultSummary = searched
    ? `${complete ? `${messages.length} results` : `${messages.length} loaded`}${selectedIds.size ? ` · ${selectedIds.size} selected` : ""}`
    : "";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = appearance === "system"
        ? media.matches ? "dark" : "light"
        : appearance;
    };
    const handleSystemChange = () => {
      if (appearance === "system") applyTheme();
    };
    applyTheme();
    media.addEventListener?.("change", handleSystemChange);
    return () => media.removeEventListener?.("change", handleSystemChange);
  }, [appearance]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedIds.size > 0 && !allSelected;
    }
  }, [allSelected, selectedIds]);

  useEffect(() => () => {
    operation.current?.abort();
    setApi(null);
  }, []);

  function resetResults() {
    operation.current?.abort();
    setMessages([]);
    setSelectedIds(new Set());
    setCursor(null);
    setDiscordTotal(0);
    setComplete(false);
    setSearched(false);
    setFailures([]);
    setStatus("");
  }

  async function connect() {
    setBusy(true);
    setFailures([]);
    setStatus("Connecting…");
    try {
      const response = await chrome.runtime.sendMessage({ type: "MTCORD_GET_SESSION" }) as SessionResponse;
      if (!response.ok || !response.token) throw new Error("Discord session expired.");
      const nextApi = new DiscordApi(response.token);
      const controller = new AbortController();
      operation.current = controller;
      const [nextUser, nextGuilds, nextDms] = await Promise.all([
        nextApi.currentUser(controller.signal),
        nextApi.guilds(controller.signal),
        nextApi.directMessages(controller.signal),
      ]);
      setApi(nextApi);
      setUser(nextUser);
      setGuilds(nextGuilds.slice().sort((a, b) => a.name.localeCompare(b.name)));
      setDms(nextDms.filter((dm) => dm.type === 1 || dm.type === 3));
      setStatus("");
    } catch (error) {
      setApi(null);
      setUser(null);
      setStatus(errorMessage(error));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  async function changeGuild(nextGuildId: string) {
    setGuildId(nextGuildId);
    setChannelIds(new Set());
    setChannels([]);
    resetResults();
    if (!api || !nextGuildId) return;
    setBusy(true);
    const controller = new AbortController();
    operation.current = controller;
    try {
      const found = await api.channels(nextGuildId, controller.signal);
      setChannels(found
        .filter((channel) => channel.type === 0 || channel.type === 5 || channel.type === 15)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  function changeMode(nextMode: ScopeMode) {
    setMode(nextMode);
    setGuildId("");
    setDmId("");
    setChannels([]);
    setChannelIds(new Set());
    resetResults();
  }

  function updateCriteria<K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) {
    setCriteria((current) => ({ ...current, [key]: value }));
    resetResults();
  }

  function toggleChannel(channelId: string) {
    setChannelIds((current) => {
      const next = new Set(current);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
    resetResults();
  }

  async function search() {
    if (!api || !user || !scope.channelIds.length) return;
    setBusy(true);
    setFailures([]);
    setSelectedIds(new Set());
    setStatus("Searching…");
    const controller = new AbortController();
    operation.current = controller;
    try {
      const page = await api.search(scope, criteria, user.id, { offset: 0 }, controller.signal);
      const filtered = applyLocalFilters(page.messages, criteria, user.id);
      setMessages(filtered);
      setCursor(page.cursor);
      setDiscordTotal(page.total);
      setComplete(page.cursor === null);
      setSearched(true);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!api || !user || !cursor) return;
    setBusy(true);
    const controller = new AbortController();
    operation.current = controller;
    try {
      const page = await api.search(scope, criteria, user.id, cursor, controller.signal);
      const filtered = applyLocalFilters(page.messages, criteria, user.id);
      const nextMessages = uniqueMessages([...messages, ...filtered]);
      setMessages(nextMessages);
      setCursor(page.cursor);
      setComplete(page.cursor === null);
      setStatus("");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  async function resolveAll(controller: AbortController): Promise<Message[]> {
    if (!api || !user) throw new Error("Discord session is unavailable.");
    if (complete) return messages;
    let nextCursor = cursor;
    let resolved = messages;
    let checked = messages.length;
    while (nextCursor) {
      const page = await api.search(scope, criteria, user.id, nextCursor, controller.signal);
      checked += page.messages.length;
      resolved = uniqueMessages([
        ...resolved,
        ...applyLocalFilters(page.messages, criteria, user.id),
      ]);
      nextCursor = page.cursor;
      setStatus(`Resolving all matches · ${checked} of ${discordTotal} checked`);
    }
    setMessages(resolved);
    setCursor(null);
    setComplete(true);
    setStatus("");
    return resolved;
  }

  async function withCompleteSet(
    action: (resolved: Message[], controller: AbortController) => Promise<void>,
    respectSelection = true,
  ) {
    if (!api || !user || !searched || busy) return;
    setBusy(true);
    setFailures([]);
    const controller = new AbortController();
    operation.current = controller;
    try {
      const resolved = await resolveAll(controller);
      const chosen = respectSelection && selectedIds.size
        ? resolved.filter((message) => selectedIds.has(message.id))
        : resolved;
      await action(chosen, controller);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  async function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    await withCompleteSet(async (resolved) => {
      setSelectedIds(new Set(resolved.map((message) => message.id)));
      setStatus("");
    }, false);
  }

  async function runJsonExport() {
    await withCompleteSet(async (resolved) => {
      if (!resolved.length) throw new Error("No messages are available to export.");
      exportJson(resolved, exportContext);
      setStatus(`${resolved.length} messages exported`);
    });
  }

  async function runAttachmentDownload(kind: AttachmentKind) {
    await withCompleteSet(async (resolved, controller) => {
      const label = kind === "media" ? "media files" : "files";
      const result = await downloadAttachments(
        resolved,
        exportContext,
        kind,
        controller.signal,
        (done, total, failed) => setStatus(`${done} of ${total} ${label} downloaded${failed ? ` · ${failed} failed` : ""}`),
      );
      setFailures(result.failures);
      if (!result.completed && !result.failures.length) setStatus(`No matching ${label} found.`);
    });
  }

  async function prepareDelete() {
    await withCompleteSet(async (resolved) => {
      if (!user) return;
      const candidates = deletionCandidates(resolved, user.id);
      if (!candidates.length) throw new Error("No selected or matching messages belong to you.");
      setDeleteCandidates(candidates);
      setStatus("");
    });
  }

  async function confirmDelete() {
    if (!api || !user || !deleteCandidates?.length) return;
    const candidates = deleteCandidates;
    setDeleteCandidates(null);
    setBusy(true);
    setFailures([]);
    const controller = new AbortController();
    operation.current = controller;
    const deleteFailures: OperationFailure[] = [];
    let deleted = 0;
    try {
      for (const message of candidates) {
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        if (message.author.id !== user.id) {
          deleteFailures.push({ item: message.id, reason: "Ownership validation failed" });
          continue;
        }
        try {
          await api.deleteMessage(message.channel_id, message.id, controller.signal);
          deleted += 1;
          setMessages((current) => current.filter((item) => item.id !== message.id));
          setSelectedIds((current) => {
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
          setStatus(`${deleted} of ${candidates.length} deleted${deleteFailures.length ? ` · ${deleteFailures.length} failed` : ""}`);
          if (deleted < candidates.length) await abortableDelay(750, controller.signal);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          deleteFailures.push({ item: message.id, reason: errorMessage(error) });
          setStatus(`${deleted} of ${candidates.length} deleted · ${deleteFailures.length} failed`);
        }
      }
      setFailures(deleteFailures);
    } catch (error) {
      setFailures(deleteFailures);
      setStatus(errorMessage(error, `${deleted} deleted before cancellation`));
    } finally {
      operation.current = null;
      setBusy(false);
    }
  }

  function cycleAppearance() {
    const next: Appearance = appearance === "system" ? "light" : appearance === "light" ? "dark" : "system";
    setAppearance(next);
  }

  function clearCriteria() {
    setCriteria(EMPTY_CRITERIA);
    resetResults();
  }

  return (
    <>
      <div className="page">
        <main className="app">
        <header className="header">
          <div className="header-copy">
            <h1>MTcord</h1>
          </div>
          <button className="appearance" type="button" onClick={cycleAppearance} aria-label={`Appearance: ${appearance}. Change appearance`}>
            Appearance · {capitalize(appearance)}
          </button>
        </header>

        <section className="shell" aria-label="MTcord message manager">
          <aside className="panel controls" aria-label="Search controls">
            <div className="toolbar">
              <div className="toolbar-info">
                <span className="toolbar-title">Controls</span>
                <span className="toolbar-hint">{user ? user.global_name ?? user.username : "Not connected"}</span>
              </div>
              <button type="button" className="btn subtle connect-button" onClick={() => void connect()} disabled={busy}>
                {user ? "Reconnect" : "Connect"}
              </button>
            </div>

            <div className="controls-body">
              <section className="section">
                <p className="section-heading">Scope</p>
                <div className="scope-switch" aria-label="Scope">
                  <button type="button" aria-pressed={mode === "server"} onClick={() => changeMode("server")}><strong>Server</strong><span>One server</span></button>
                  <button type="button" aria-pressed={mode === "dm"} onClick={() => changeMode("dm")}><strong>Direct Message</strong><span>One conversation</span></button>
                </div>

                {mode === "server" ? (
                  <>
                    <div className="field">
                      <label htmlFor="server">Server</label>
                      <select className="select" id="server" value={guildId} onChange={(event) => void changeGuild(event.target.value)} disabled={!user || busy}>
                        <option value="">Choose server</option>
                        {guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}
                      </select>
                    </div>

                    {guildId && (
                      <div className="channels" aria-labelledby="channels-title">
                        <div className="section-head compact-head">
                          <p className="field-title" id="channels-title">Channels</p>
                          <div className="compact-actions">
                            <button type="button" onClick={() => { setChannelIds(new Set(channels.map((channel) => channel.id))); resetResults(); }}>Select all</button>
                            <button type="button" onClick={() => { setChannelIds(new Set()); resetResults(); }}>Clear</button>
                          </div>
                        </div>
                        <div className="channel-list">
                          {channels.length ? channels.map((channel) => (
                            <label key={channel.id} className="check-row">
                              <input type="checkbox" checked={channelIds.has(channel.id)} onChange={() => toggleChannel(channel.id)} />
                              <span>#{channelLabel(channel)}</span>
                            </label>
                          )) : <p className="muted">No supported text channels found.</p>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="field">
                    <label htmlFor="dm">Direct Message</label>
                    <select className="select" id="dm" value={dmId} onChange={(event) => { setDmId(event.target.value); resetResults(); }} disabled={!user || busy}>
                      <option value="">Choose conversation</option>
                      {dms.map((dm) => <option key={dm.id} value={dm.id}>{channelLabel(dm)}</option>)}
                    </select>
                  </div>
                )}
              </section>

              <section className="section">
                <p className="section-heading">Search</p>
                <div className="field">
                  <label htmlFor="query">Message content</label>
                  <input className="input" id="query" type="search" value={criteria.query} onChange={(event) => updateCriteria("query", event.target.value)} placeholder="Search messages…" />
                </div>
              </section>

              <section className="section">
                <p className="section-heading">Filters</p>
                <div className="field-grid">
                  <div className="field"><label htmlFor="from-date">From date</label><input className="input" id="from-date" type="date" value={criteria.fromDate} max={criteria.toDate || undefined} onChange={(event) => updateCriteria("fromDate", event.target.value)} /></div>
                  <div className="field"><label htmlFor="to-date">To date</label><input className="input" id="to-date" type="date" value={criteria.toDate} min={criteria.fromDate || undefined} onChange={(event) => updateCriteria("toDate", event.target.value)} /></div>
                </div>
                <div className="option-list">
                  <div className="filter-row"><span>My messages only</span><label className="switch"><input type="checkbox" checked={criteria.myMessagesOnly} onChange={(event) => updateCriteria("myMessagesOnly", event.target.checked)} aria-label="My messages only" /><span className="track" /></label></div>
                  <div className="filter-row"><span>Media</span><label className="switch"><input type="checkbox" checked={criteria.media} onChange={(event) => updateCriteria("media", event.target.checked)} aria-label="Media" /><span className="track" /></label></div>
                  <div className="filter-row"><span>Files</span><label className="switch"><input type="checkbox" checked={criteria.files} onChange={(event) => updateCriteria("files", event.target.checked)} aria-label="Files" /><span className="track" /></label></div>
                </div>
              </section>
            </div>

            <div className="actions">
              <button className="btn subtle" type="button" onClick={clearCriteria} disabled={busy}>Clear</button>
              <button className="btn primary" type="button" onClick={() => void search()} disabled={!canSearch}>Search</button>
            </div>
          </aside>

          <section className="panel results" aria-labelledby="results-title">
            <div className="output-toolbar">
              <div className="output-info">
                <span className="output-label" id="results-title">Messages</span>
                {resultSummary && <span className="output-hint">{resultSummary}</span>}
              </div>
              <div className="toolbar-actions">
                <label className="select-all-control">
                  <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={() => void toggleSelectAll()} disabled={!searched || !messages.length || busy} />
                  <span>{allSelected ? "All selected" : "Select all"}</span>
                </label>
                <details className="export-menu">
                  <summary className="btn subtle" aria-label="Export options">Export</summary>
                  <div className="menu-items">
                    <button type="button" onClick={() => void runJsonExport()} disabled={!searched || busy}>Export JSON</button>
                    <button type="button" onClick={() => void runAttachmentDownload("media")} disabled={!searched || busy}>Download Media</button>
                    <button type="button" onClick={() => void runAttachmentDownload("file")} disabled={!searched || busy}>Download Files</button>
                  </div>
                </details>
                <button className="btn subtle danger" type="button" onClick={() => void prepareDelete()} disabled={!searched || busy}>Delete</button>
              </div>
            </div>

            <div className="results-body">
              {failures.length > 0 && (
                <details className="failures">
                  <summary>View {failures.length} failure{failures.length === 1 ? "" : "s"}</summary>
                  <ul>{failures.map((failure, index) => <li key={`${failure.item}-${index}`}><span>{failure.item}</span><span>{failure.reason}</span></li>)}</ul>
                </details>
              )}

              <div className={`message-list${messages.length === 0 ? " is-empty" : ""}`}>
                {!searched && <p className="empty-state">Messages will appear here.</p>}
                {searched && messages.length === 0 && !busy && <p className="empty-state">No messages match your search and filters.</p>}
                {messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    channel={selectedChannels.find((channel) => channel.id === message.channel_id)}
                    showChannel={mode === "server" && selectedChannels.length > 1}
                    selected={selectedIds.has(message.id)}
                    onSelect={(checked) => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (checked) next.add(message.id); else next.delete(message.id);
                      return next;
                    })}
                  />
                ))}
              </div>

              {cursor && !busy && <button type="button" className="btn load-more" onClick={() => void loadMore()}>Load more</button>}
            </div>

            {(status || busy) && (
              <div className="output-actions" aria-live="polite">
                <span className="action-msg">{status}</span>
                {busy && <button type="button" className="btn subtle" onClick={() => operation.current?.abort()}>Cancel</button>}
              </div>
            )}
          </section>
        </section>

          <p className="local-note">This extension accesses Discord data only as required for the actions you request. Message data and credentials are not collected or sent to services operated by MTcord.</p>
        </main>
      </div>

      <footer className="site-credit">© 2026 micknorj · Mick&apos;s Tools · <a href="https://github.com/micknorj" target="_blank" rel="noopener noreferrer">GitHub</a></footer>

      {deleteCandidates && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">Delete {deleteCandidates.length} messages?</h2>
            <p>These messages will be permanently deleted from Discord. This action cannot be undone.</p>
            <div className="dialog-actions">
              <button type="button" className="btn subtle" onClick={() => setDeleteCandidates(null)}>Cancel</button>
              <button type="button" className="btn delete-confirm" onClick={() => void confirmDelete()}>Delete {deleteCandidates.length} messages</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageRow({ message, channel, showChannel, selected, onSelect }: {
  message: Message;
  channel?: Channel;
  showChannel: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  return (
    <article className={`message-row${selected ? " selected" : ""}`}>
      <input className="message-checkbox" type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={`Select message from ${message.author.username}`} />
      <div className="message-body">
        <div className="message-meta">
          <strong>{message.author.global_name ?? message.author.username}</strong>
          <time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString()}</time>
        </div>
        {showChannel && channel && <p className="channel-name">#{channelLabel(channel)}</p>}
        {message.content && <p className="message-content">{message.content}</p>}
        {message.attachments.length > 0 && (
          <div className="attachments">
            {message.attachments.map((attachment) => {
              const href = safeDiscordUrl(attachment.url) ? attachment.url : undefined;
              const media = attachmentKind(attachment) === "media";
              const image = attachment.content_type?.startsWith("image/");
              return (
                <a key={attachment.id} className="attachment" href={href} target="_blank" rel="noreferrer" aria-disabled={!href}>
                  {media && image && href && <img src={href} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                  <span><strong>{attachment.filename}</strong><small>{media ? "Media" : attachment.content_type || "File"} · {formatBytes(attachment.size)}</small></span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function errorMessage(error: unknown, cancellationDetail = "Operation cancelled"): string {
  if (error instanceof DOMException && error.name === "AbortError") return cancellationDetail;
  if (error instanceof ApiError && error.status === 401) return "Discord session expired.";
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
