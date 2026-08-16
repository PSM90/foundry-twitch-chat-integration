/**
 * Minimal IRCv3 line parser, sufficient for the Twitch IRC dialect.
 * No dependencies.
 *
 * A tagged Twitch PRIVMSG looks like:
 *   @badge-info=;badges=moderator/1;color=#1E90FF;display-name=Foo;emotes=25:0-4 ...
 *   :foo!foo@foo.tmi.twitch.tv PRIVMSG #channel :Kappa hello world
 */

/** Unescape an IRCv3 tag value (\s -> space, \: -> ;, \\ -> \, \r \n). */
function unescapeTagValue(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      out += value[i];
      continue;
    }
    const next = value[++i];
    switch (next) {
      case ":": out += ";"; break;
      case "s": out += " "; break;
      case "\\": out += "\\"; break;
      case "r": out += "\r"; break;
      case "n": out += "\n"; break;
      case undefined: break;
      default: out += next;
    }
  }
  return out;
}

/**
 * Parse a single IRC line.
 * @param {string} line
 * @returns {{tags: Record<string,string>, prefix: string|null, command: string, params: string[]}|null}
 */
export function parseIrcMessage(line) {
  if (!line) return null;
  let rest = line.replace(/[\r\n]+$/, "");
  if (!rest) return null;

  const tags = {};
  if (rest.startsWith("@")) {
    const space = rest.indexOf(" ");
    if (space === -1) return null;
    const raw = rest.slice(1, space);
    rest = rest.slice(space + 1);
    for (const pair of raw.split(";")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq === -1) tags[pair] = "";
      else tags[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
    }
  }

  let prefix = null;
  if (rest.startsWith(":")) {
    const space = rest.indexOf(" ");
    if (space === -1) return null;
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }

  // Trailing parameter (everything after " :") is a single param that may contain spaces.
  let trailing = null;
  const trailingIndex = rest.indexOf(" :");
  if (rest.startsWith(":")) {
    trailing = rest.slice(1);
    rest = "";
  } else if (trailingIndex !== -1) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const parts = rest.split(" ").filter((p) => p.length > 0);
  const command = parts.shift() ?? "";
  if (trailing !== null) parts.push(trailing);

  return { tags, prefix, command: command.toUpperCase(), params: parts };
}

/** Extract the nickname from an IRC prefix like "foo!foo@foo.tmi.twitch.tv". */
export function nickFromPrefix(prefix) {
  if (!prefix) return null;
  const bang = prefix.indexOf("!");
  return bang === -1 ? prefix : prefix.slice(0, bang);
}
