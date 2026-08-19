import { MODULE_ID } from "./settings.js";

/**
 * Sidebar tab listing ONLY the messages bridged from Twitch.
 *
 * The entries are the same ChatMessage documents that live in the main chat
 * log: this tab is a filtered, read-only view over them, so every message
 * appears in both places. Each document is rendered with
 * ChatMessage#renderHTML, which fires renderChatMessageHTML — our decorations
 * (purple border, hidden GM header) therefore apply here too.
 */
export class TwitchStreamTab extends foundry.applications.sidebar.AbstractSidebarTab {
  /** @override */
  static tabName = "twitch";

  /** Only this many of the most recent messages are drawn on a full render. */
  static MAX_RENDERED = 100;

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["flexcol"],
    window: {
      title: "TWITCHCHAT.TabTitle"
    },
    position: {
      width: 340,
      height: 600
    }
  };

  /** @returns {boolean} whether a ChatMessage came from the Twitch bridge */
  static isTwitchMessage(message) {
    return !!message?.getFlag(MODULE_ID, "twitch");
  }

  /** The list element holding the rendered messages. */
  get log() {
    return this.element?.querySelector("ol.twitch-stream-log") ?? null;
  }

  /** @override */
  async _renderHTML(_context, _options) {
    const ol = document.createElement("ol");
    ol.className = "chat-log twitch-stream-log";

    const messages = game.messages.contents
      .filter((m) => TwitchStreamTab.isTwitchMessage(m))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-TwitchStreamTab.MAX_RENDERED);

    for (const message of messages) {
      try {
        ol.append(await this.#renderEntry(message));
      } catch (err) {
        console.error(`${MODULE_ID} | failed to render message ${message.id}`, err);
      }
    }

    if (!ol.childElementCount) ol.append(this.#emptyNote());
    return ol;
  }

  /** @override */
  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#scrollToBottom();
  }

  /** @override */
  _onActivate() {
    // The tab renders at startup while hidden, where scroll positions do not
    // stick — so re-anchor to the newest message every time it is opened.
    this.#scrollToBottom();
  }

  /* ------------------------------------------------------------------ */
  /*  Live updates (driven by the hooks in module.js)                    */
  /* ------------------------------------------------------------------ */

  /** Append a newly created Twitch message to the log. */
  async addMessage(message) {
    const log = this.rendered ? this.log : null;
    if (!log) return;
    log.querySelector(".twitch-stream-empty")?.remove();
    while (log.childElementCount >= TwitchStreamTab.MAX_RENDERED) log.firstElementChild.remove();
    const stick = this.#isAtBottom(log);
    log.append(await this.#renderEntry(message));
    if (stick) this.#scrollToBottom();
  }

  /** Remove a deleted message from the log. */
  removeMessage(messageId) {
    const log = this.rendered ? this.log : null;
    if (!log) return;
    log.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.remove();
    if (!log.childElementCount) log.append(this.#emptyNote());
  }

  /* ------------------------------------------------------------------ */

  async #renderEntry(message) {
    // canDelete: false — the trash-bin button is wired to ChatLog's actions
    // and would be dead here; messages are managed from the main chat log.
    return message.renderHTML({ canDelete: false });
  }

  #emptyNote() {
    const li = document.createElement("li");
    li.className = "twitch-stream-empty";
    li.textContent = game.i18n.localize("TWITCHCHAT.StreamEmpty");
    return li;
  }

  /** Whether the log is scrolled close enough to the bottom to auto-follow. */
  #isAtBottom(log) {
    return log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  }

  #scrollToBottom() {
    const log = this.log;
    if (log) log.scrollTop = log.scrollHeight;
  }
}
