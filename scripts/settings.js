export const MODULE_ID = "twitch-chat-integration";

export const SETTINGS = {
  CHANNEL: "channel",
  ENABLED: "enabled",
  IGNORED_USERS: "ignoredUsers",
  IGNORE_COMMANDS: "ignoreCommands",
  SHOW_EMOTES: "showEmotes",
  RATE_LIMIT: "rateLimit",
  MAX_LENGTH: "maxLength"
};

/** @returns {*} the current value of a module setting */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Register every module setting.
 * @param {() => void} onConnectionSettingChange Called when a setting that affects the connection changes.
 */
export function registerSettings(onConnectionSettingChange) {
  game.settings.register(MODULE_ID, SETTINGS.CHANNEL, {
    name: "TWITCHCHAT.SettingChannelName",
    hint: "TWITCHCHAT.SettingChannelHint",
    scope: "world",
    config: true,
    type: String,
    default: "",
    onChange: () => onConnectionSettingChange()
  });

  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: "TWITCHCHAT.SettingEnabledName",
    hint: "TWITCHCHAT.SettingEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => onConnectionSettingChange()
  });

  game.settings.register(MODULE_ID, SETTINGS.IGNORED_USERS, {
    name: "TWITCHCHAT.SettingIgnoredName",
    hint: "TWITCHCHAT.SettingIgnoredHint",
    scope: "world",
    config: true,
    type: String,
    default: "nightbot, streamelements, streamlabs, moobot, fossabot, sery_bot, wizebot"
  });

  game.settings.register(MODULE_ID, SETTINGS.IGNORE_COMMANDS, {
    name: "TWITCHCHAT.SettingIgnoreCommandsName",
    hint: "TWITCHCHAT.SettingIgnoreCommandsHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_EMOTES, {
    name: "TWITCHCHAT.SettingEmotesName",
    hint: "TWITCHCHAT.SettingEmotesHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.RATE_LIMIT, {
    name: "TWITCHCHAT.SettingRateLimitName",
    hint: "TWITCHCHAT.SettingRateLimitHint",
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    range: { min: 0, max: 120, step: 5 }
  });

  game.settings.register(MODULE_ID, SETTINGS.MAX_LENGTH, {
    name: "TWITCHCHAT.SettingMaxLengthName",
    hint: "TWITCHCHAT.SettingMaxLengthHint",
    scope: "world",
    config: true,
    type: Number,
    default: 300,
    range: { min: 50, max: 500, step: 10 }
  });
}

/** @returns {Set<string>} lowercase logins that should never reach the game chat */
export function getIgnoredUsers() {
  return new Set(
    String(getSetting(SETTINGS.IGNORED_USERS) ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}
