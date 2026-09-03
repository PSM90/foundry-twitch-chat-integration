/**
 * Turning an untrusted Twitch message into HTML that is safe to drop into a ChatMessage.
 *
 * Everything a viewer types is hostile input: it goes straight into `ChatMessage#content`,
 * which Foundry renders as HTML for every connected player. So the text is escaped first
 * and markup is only ever added by us, never by them.
 */

const EMOTE_CDN = "https://static-cdn.jtvnw.net/emoticons/v2";

/** Escape the five characters that matter inside an HTML text node or attribute. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only allow a colour the way Twitch sends it: #RGB or #RRGGBB. */
export function sanitizeColor(color) {
  if (typeof color !== "string") return null;
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color.trim()) ? color.trim() : null;
}

/**
 * Twitch sends `/me` messages as a CTCP ACTION: the body is wrapped in U+0001
 * delimiters. The trailing delimiter is occasionally missing, so it is optional.
 * @returns {{text: string, isAction: boolean}}
 */
export function unwrapAction(text) {
  const match = /^\u0001ACTION (.*?)\u0001?$/s.exec(text);
  return match ? { text: match[1], isAction: true } : { text, isAction: false };
}

/**
 * Parse the IRCv3 `emotes` tag into sorted ranges.
 * Format: "25:0-4,12-16/1902:6-10" where the numbers are indices into the
 * message's *code point* array, not its UTF-16 char array.
 * @returns {Array<{id: string, start: number, end: number}>}
 */
export function parseEmotes(emotesTag) {
  if (!emotesTag) return [];
  const ranges = [];
  for (const chunk of emotesTag.split("/")) {
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const id = chunk.slice(0, colon);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
    for (const span of chunk.slice(colon + 1).split(",")) {
      const [rawStart, rawEnd] = span.split("-");
      const start = Number.parseInt(rawStart, 10);
      const end = Number.parseInt(rawEnd, 10);
      if (Number.isInteger(start) && Number.isInteger(end) && end >= start) {
        ranges.push({ id, start, end });
      }
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Build the safe HTML body of a Twitch message.
 * @param {string} rawText
 * @param {string|null} emotesTag
 * @param {{showEmotes?: boolean, maxLength?: number}} [options]
 * @returns {{html: string, isAction: boolean}}
 */
export function formatMessage(rawText, emotesTag, { showEmotes = true, maxLength = 300 } = {}) {
  const { text, isAction } = unwrapAction(String(rawText ?? ""));
  const chars = Array.from(text);
  const emotes = showEmotes ? parseEmotes(emotesTag) : [];

  const limit = Number.isFinite(maxLength) && maxLength > 0 ? maxLength : Infinity;
  let out = "";
  let plainCount = 0;
  let cursor = 0;
  let truncated = false;

  /** Append literal text, respecting the length budget. */
  const pushText = (from, to) => {
    if (truncated || to <= from) return;
    let slice = chars.slice(from, to);
    if (plainCount + slice.length > limit) {
      slice = slice.slice(0, Math.max(0, limit - plainCount));
      truncated = true;
    }
    plainCount += slice.length;
    out += escapeHtml(slice.join(""));
  };

  for (const emote of emotes) {
    if (truncated) break;
    if (emote.start < cursor || emote.start >= chars.length) continue;
    pushText(cursor, emote.start);
    if (truncated) break;

    const name = chars.slice(emote.start, emote.end + 1).join("");
    const src = `${EMOTE_CDN}/${encodeURIComponent(emote.id)}/default/dark/1.0`;
    out += `<img class="twitch-emote" src="${src}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" />`;
    plainCount += 1;
    cursor = emote.end + 1;
  }
  pushText(cursor, chars.length);

  if (truncated) out += "&hellip;";
  return { html: out, isAction };
}
