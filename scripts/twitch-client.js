import { parseIrcMessage, nickFromPrefix } from "./irc.js";

const TWITCH_WS_URL = "wss://irc-ws.chat.twitch.tv:443";

/**
 * Read-only, anonymous Twitch chat client over IRC-on-WebSocket.
 *
 * Twitch allows anonymous connections with a nickname of the form `justinfan<digits>`
 * and no password at all. Such a connection can join channels and read messages, but
 * cannot send any. That is exactly what we need, and it means the user never has to
 * create an OAuth token or run a backend service.
 */
export class TwitchClient {
  /**
   * @param {object} options
   * @param {(msg: {user: string, login: string, color: string|null, text: string, emotes: string|null, tags: object}) => void} options.onMessage
   * @param {(state: "connecting"|"connected"|"disconnected"|"reconnecting", detail?: object) => void} [options.onState]
   */
  constructor({ onMessage, onState } = {}) {
    this.onMessage = onMessage ?? (() => {});
    this.onState = onState ?? (() => {});

    /** @type {WebSocket|null} */
    this.socket = null;
    /** @type {string|null} */
    this.channel = null;

    this.connected = false;
    /** True while the user wants a connection; false after an explicit disconnect. */
    this.wanted = false;

    this.attempts = 0;
    this.reconnectTimer = null;
  }

  get isConnected() {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Open a connection and join `channel`.
   * @param {string} channel Channel login name, with or without a leading '#'.
   */
  connect(channel) {
    const normalized = String(channel ?? "").trim().toLowerCase().replace(/^#/, "");
    if (!normalized) throw new Error("A Twitch channel name is required.");

    this.wanted = true;
    this.channel = normalized;
    this.#clearReconnectTimer();
    this.#openSocket();
  }

  /** Close the connection and stop reconnecting. */
  disconnect() {
    this.wanted = false;
    this.attempts = 0;
    this.#clearReconnectTimer();
    this.#teardownSocket();
    if (this.connected) {
      this.connected = false;
      this.onState("disconnected");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

  #openSocket() {
    this.#teardownSocket();
    this.onState("connecting", { channel: this.channel });

    let socket;
    try {
      socket = new WebSocket(TWITCH_WS_URL);
    } catch (err) {
      this.#scheduleReconnect(err);
      return;
    }
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      // Ask for message tags (display name, colour, emote positions) and membership metadata.
      this.#send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      // Anonymous, read-only login. No password, no token, no account.
      this.#send(`NICK justinfan${Math.floor(Math.random() * 80000) + 1000}`);
      this.#send(`JOIN #${this.channel}`);
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      const data = typeof event.data === "string" ? event.data : "";
      for (const line of data.split("\r\n")) {
        if (line) this.#handleLine(line);
      }
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      // The close handler runs right after and owns the reconnect logic.
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      const wasConnected = this.connected;
      this.connected = false;
      this.socket = null;
      if (this.wanted) this.#scheduleReconnect();
      else if (wasConnected) this.onState("disconnected");
    });
  }

  #handleLine(line) {
    const msg = parseIrcMessage(line);
    if (!msg) return;

    switch (msg.command) {
      case "PING":
        this.#send(`PONG :${msg.params[0] ?? "tmi.twitch.tv"}`);
        return;

      // 366 = end of NAMES list, sent once the JOIN has actually succeeded.
      case "366":
      case "JOIN": {
        if (this.connected) return;
        this.connected = true;
        this.attempts = 0;
        this.onState("connected", { channel: this.channel });
        return;
      }

      case "RECONNECT":
        // Twitch is asking us to reconnect to a different edge server.
        this.#teardownSocket();
        this.#scheduleReconnect();
        return;

      case "PRIVMSG": {
        const text = msg.params[1] ?? "";
        if (!text) return;
        const login = nickFromPrefix(msg.prefix) ?? msg.tags["login"] ?? "unknown";
        this.onMessage({
          user: msg.tags["display-name"]?.trim() || login,
          login,
          color: msg.tags["color"] || null,
          text,
          emotes: msg.tags["emotes"] || null,
          tags: msg.tags
        });
        return;
      }

      default:
        return;
    }
  }

  #send(raw) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(`${raw}\r\n`);
  }

  #teardownSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch (_err) {
      /* ignore */
    }
  }

  #scheduleReconnect() {
    if (!this.wanted || this.reconnectTimer) return;
    this.attempts += 1;
    // 2s, 4s, 8s, 16s, 30s, 30s, ...
    const delay = Math.min(2000 * 2 ** (this.attempts - 1), 30000);
    this.onState("reconnecting", { channel: this.channel, delay });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wanted) this.#openSocket();
    }, delay);
  }

  #clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
