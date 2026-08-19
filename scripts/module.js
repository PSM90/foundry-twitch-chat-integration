import { MODULE_ID, SETTINGS, registerSettings, getSetting, getIgnoredUsers } from "./settings.js";
import { TwitchClient } from "./twitch-client.js";
import { formatMessage, escapeHtml, sanitizeColor } from "./format.js";
import { TwitchStreamTab } from "./streaming-tab.js";

/**
 * Twitch Chat Integration
 *
 * Only ONE client connects to Twitch: the active GM. That client turns each incoming
 * Twitch message into a normal ChatMessage document, which Foundry then replicates to
 * every player. If every browser connected independently we would get one duplicate
 * per connected user.
 */

/** @type {TwitchClient|null} */
let client = null;

/** Simple sliding-window rate limiter so a raid cannot bury the game chat. */
const recentTimestamps = [];

function isBridgeHost() {
  // `isActiveGM` is true for exactly one GM: the one with the lowest connection id.
  return game.user?.isActiveGM ?? false;
}

function notify(key, data, type = "info") {
  ui.notifications?.[type](game.i18n.format(key, data ?? {}));
}

function withinRateLimit() {
  const limit = Number(getSetting(SETTINGS.RATE_LIMIT)) || 0;
  if (limit <= 0) return true;
  const now = Date.now();
  while (recentTimestamps.length && now - recentTimestamps[0] > 60000) recentTimestamps.shift();
  if (recentTimestamps.length >= limit) return false;
  recentTimestamps.push(now);
  return true;
}

async function postToGameChat({ user, login, color, text, emotes }) {
  if (getIgnoredUsers().has(login.toLowerCase())) return;
  if (getSetting(SETTINGS.IGNORE_COMMANDS) && text.trim().startsWith("!")) return;
  if (!withinRateLimit()) return;

  const { html, isAction } = formatMessage(text, emotes, {
    showEmotes: getSetting(SETTINGS.SHOW_EMOTES),
    maxLength: Number(getSetting(SETTINGS.MAX_LENGTH)) || 300
  });
  if (!html) return;

  const safeColor = sanitizeColor(color);
  const colorStyle = safeColor ? ` style="color: ${safeColor}"` : "";
  const body = isAction ? `<em>${html}</em>` : html;

  // The viewer's name goes in the message BODY, not in the speaker alias: the
  // header is drawn by the active system/theme (dnd5e redraws it entirely) and
  // typically shows the author — us, the GM — no matter what alias we set.
  const author = `<span class="twitch-chat-author"${colorStyle}>${escapeHtml(user)}</span>`;
  const separator = isAction ? " " : `<span class="twitch-chat-sep">:</span> `;

  await ChatMessage.implementation.create({
    style: CONST.CHAT_MESSAGE_STYLES.OOC,
    speaker: { alias: user },
    content:
      `<div class="twitch-chat-body">` +
      `<span class="twitch-chat-badge">Twitch</span>` +
      `${author}${separator}<span class="twitch-chat-text">${body}</span>` +
      `</div>`,
    flags: {
      [MODULE_ID]: {
        twitch: true,
        login,
        color: safeColor,
        displayName: user
      }
    }
  });
}

function onClientState(state, detail = {}) {
  switch (state) {
    case "connected":
      notify("TWITCHCHAT.Connected", { channel: detail.channel });
      break;
    case "disconnected":
      notify("TWITCHCHAT.Disconnected");
      break;
    case "reconnecting":
      console.warn(
        `${MODULE_ID} | connection lost, retrying in ${Math.round((detail.delay ?? 0) / 1000)}s`
      );
      break;
    default:
      break;
  }
}

/** Bring the live connection in line with the current settings. */
function syncConnection({ silent = false } = {}) {
  if (!isBridgeHost()) return;
  client ??= new TwitchClient({ onMessage: postToGameChat, onState: onClientState });

  const enabled = getSetting(SETTINGS.ENABLED);
  const channel = String(getSetting(SETTINGS.CHANNEL) ?? "").trim();

  if (!enabled) {
    client.disconnect();
    return;
  }
  if (!channel) {
    client.disconnect();
    if (!silent) notify("TWITCHCHAT.NoChannel", {}, "warn");
    return;
  }
  const normalized = channel.toLowerCase().replace(/^#/, "");
  if (client.isConnected && client.channel === normalized) return;
  client.connect(normalized);
}

/**
 * Foundry awaits every setting's `onChange` while submitting the settings form.
 * If ours threw, the submission would abort and the remaining settings would
 * silently fail to save — so nothing from this module is allowed to escape.
 */
function safeSyncConnection(options) {
  try {
    syncConnection(options);
  } catch (err) {
    console.error(`${MODULE_ID} | errore durante la sincronizzazione della connessione`, err);
  }
}

/**
 * Register the "stream chat" sidebar tab right after the standard chat tab.
 * The tab button comes from Sidebar.TABS; the application class from CONFIG.ui
 * (Foundry instantiates `ui.twitch` from it during initializeUI).
 */
function registerSidebarTab() {
  const Sidebar = foundry.applications.sidebar.Sidebar;
  const entries = Object.entries(Sidebar.TABS);
  const chatIndex = entries.findIndex(([id]) => id === "chat");
  entries.splice(chatIndex + 1, 0, [
    TwitchStreamTab.tabName,
    { tooltip: "TWITCHCHAT.TabTooltip", icon: "fa-brands fa-twitch" }
  ]);
  Sidebar.TABS = Object.fromEntries(entries);
  CONFIG.ui[TwitchStreamTab.tabName] = TwitchStreamTab;
}

/** @returns {TwitchStreamTab[]} the sidebar tab and, if open, its popout */
function streamTabApps() {
  const tab = ui[TwitchStreamTab.tabName];
  return [tab, tab?.popout].filter((app) => app);
}

Hooks.once("init", () => {
  registerSettings(() => safeSyncConnection());
  registerSidebarTab();
});

// Mirror Twitch messages into the dedicated tab as they arrive; these hooks
// fire on every client, so players see the tab update live just like the GM.
Hooks.on("createChatMessage", (message) => {
  if (!TwitchStreamTab.isTwitchMessage(message)) return;
  for (const app of streamTabApps()) app.addMessage(message);
});

Hooks.on("deleteChatMessage", (message) => {
  if (!TwitchStreamTab.isTwitchMessage(message)) return;
  for (const app of streamTabApps()) app.removeMessage(message.id);
});

Hooks.once("ready", () => {
  safeSyncConnection({ silent: true });

  // A GM disconnecting can promote this client to active GM; re-evaluate when users change.
  Hooks.on("userConnected", () => safeSyncConnection({ silent: true }));

  game.modules.get(MODULE_ID).api = {
    connect: (channel) => client?.connect(channel),
    disconnect: () => client?.disconnect(),
    get client() {
      return client;
    }
  };
});

/**
 * Selectors the various systems/themes use for the author's name and portrait
 * in the message header. We hide whichever we find: the header would show the
 * GM who created the document, and the real sender is already in the body.
 */
const HEADER_AUTHOR_SELECTORS = [
  ".message-sender",
  ".message-header .name-stacked",
  ".message-header .author",
  ".message-header .avatar",
  ".message-header img.avatar",
  ".message-header .portrait"
];

/** Tag Twitch messages in the sidebar so the stylesheet can pick them out. */
function decorateChatMessage(message, element) {
  if (!message.getFlag(MODULE_ID, "twitch")) return;
  const node = element instanceof HTMLElement ? element : element?.[0];
  if (!node) return;
  node.classList.add("twitch-chat-message");

  for (const selector of HEADER_AUTHOR_SELECTORS) {
    for (const el of node.querySelectorAll(selector)) el.classList.add("twitch-chat-hidden-author");
  }
}

Hooks.on("renderChatMessageHTML", decorateChatMessage);

/** `/twitch` chat command for quick control without opening the settings menu. */
Hooks.on("chatMessage", (_chatLog, message) => {
  const match = /^\/twitch\b\s*(.*)$/i.exec(message.trim());
  if (!match) return true;

  const arg = match[1].trim();
  if (!game.user.isGM) {
    notify("TWITCHCHAT.GMOnly", {}, "warn");
    return false;
  }

  const channel = getSetting(SETTINGS.CHANNEL);
  switch (arg.toLowerCase()) {
    case "":
    case "status":
      if (client?.isConnected) notify("TWITCHCHAT.StatusConnected", { channel: client.channel });
      else notify("TWITCHCHAT.StatusDisconnected");
      break;
    case "connect":
      game.settings.set(MODULE_ID, SETTINGS.ENABLED, true);
      break;
    case "disconnect":
      game.settings.set(MODULE_ID, SETTINGS.ENABLED, false);
      break;
    case "help":
      notify("TWITCHCHAT.Usage");
      break;
    default: {
      const requested = arg.toLowerCase().replace(/^#/, "");
      if (!/^[a-z0-9_]{3,25}$/.test(requested)) {
        notify("TWITCHCHAT.Usage", {}, "warn");
        break;
      }
      if (requested !== channel) game.settings.set(MODULE_ID, SETTINGS.CHANNEL, requested);
      game.settings.set(MODULE_ID, SETTINGS.ENABLED, true);
      break;
    }
  }
  return false;
});

// Keep the escape helper reachable for anyone extending the module.
export { escapeHtml };
