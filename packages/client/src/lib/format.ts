import { dayMonthOrder, formatMoneyUsd } from "@agenteschat/i18n/format";
import { type AppLocale, appLocale } from "@agenteschat/i18n/locale";
import type { TFunction } from "i18next";

/**
 * Machine numbers, precise and spelled out (design README: "sonnet 5.5 ·
 * 1.240 tokens · US$ 0,004"). Locale-aware; pt-BR uses "," for decimals.
 */

/**
 * Dollars as the language writes them ("$0.42", "US$ 0,42", "0,42 $"), with more decimals for tiny amounts (a few
 * Jev decisions' 0.0003); a spend too small for 4 decimals reads "<$0.0001", like formatPercent's "<1%", never zero.
 */
export function formatUsd(locale: string, value: number) {
  if (value > 0 && value < 0.00005) return `<${formatMoneyUsd(locale, 0.0001)}`;
  return formatMoneyUsd(locale, value);
}

/** Budget use: "37,5%", "12%", "<1%" (members never see money, only this). */
export function formatPercent(locale: string, value: number) {
  const fmt = (v: number, digits: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v / 100);
  if (value > 0 && value < 1) return `<${fmt(1, 0)}`;
  return fmt(value, value < 10 ? 1 : 0);
}

/** "1.240" */
export const formatInt = (locale: string, value: number) => new Intl.NumberFormat(locale).format(Math.round(value));

/** "0,042" / "0.0001": a price of a fraction of a cent, in the locale's decimal sign. */
export const formatDecimal = (locale: string, value: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);

/** "3,1 mi" / "12 mil" / "940" */
export function formatTokensShort(t: TFunction, locale: string, value: number) {
  const fmt = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  if (value >= 1_000_000) return t("format.tokensMillions", { value: fmt(value / 1_000_000) });
  if (value >= 10_000) return t("format.tokensThousands", { value: fmt(value / 1_000) });
  return formatInt(locale, value);
}

/** Whether the locale writes 12-hour times ("1 PM") rather than 24-hour ("13:00"). */
export function uses12h(locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12 === true;
  } catch {
    return false;
  }
}

/**
 * The `hour` option for a clock time: "8:39 PM" in 12-hour locales (no leading zero), "08:39" / "20:39" in 24-hour
 * ones. Not plain "numeric" everywhere: some ICU builds then drop the 24-hour zero too ("8:39").
 */
export const clockHour = (locale: string): "numeric" | "2-digit" => (uses12h(locale) ? "numeric" : "2-digit");

/** "10:42", "8:39 PM" */
export const formatTime = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(locale, { hour: clockHour(locale), minute: "2-digit" }).format(new Date(iso));

/** "14:05" today, "24 out 14:05" another day (a pause's end, when a computer went offline). */
export const clockAt = (locale: string, iso: string, now = new Date()) =>
  daysBetween(iso, now) === 0 ? formatTime(locale, iso) : `${formatShortDate(locale, iso)} ${formatTime(locale, iso)}`;

/**
 * "12 out", "Oct 12", "10月12日", with the year when asked ("12 out 2025", "Oct 12, 2025"): each language's own order,
 * the short month without its period and without the "de" Portuguese and Spanish put around it.
 */
export const formatShortDate = (locale: string, iso: string, year = false) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) })
    .formatToParts(new Date(iso))
    .map((p) =>
      p.type === "month" ? p.value.replace(/\.$/, "") : p.type === "literal" ? p.value.replace(/^ de $/, " ") : p.value,
    )
    .join("");

/** "outubro" */
export const formatMonth = (locale: string, date: Date) =>
  new Intl.DateTimeFormat(locale, { month: "long" }).format(date);

/** "março de 2026" */
export const formatMonthYear = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(iso));

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar distance in days (0 = today, 1 = yesterday). */
export const daysBetween = (iso: string, now: Date) =>
  Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);

/** A line's first letter in upper case, by the language's rules (Turkish "i" → "İ"). */
export const capitalize = (s: string, locale?: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

/**
 * One fact of a line of facts kept whole ("há 40 min", "245 kB", "#eng ops"): its spaces don't break, so a narrow line
 * breaks between facts, never inside one.
 */
export const keepWhole = (fact: string) => fact.replace(/ /g, "\u00a0");

/** A row's id as the server writes it (a UUID): a value that means nothing to a person. */
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Words written with `<code>` tags, as plain text where the tags can't be drawn. */
export const stripCodeTags = (words: string) => words.replace(/<\/?code>/g, "");

/**
 * A sentence's first letter in lower case, to follow a "·" ("Trabalhando · preencheu um campo"). German keeps it: its
 * nouns are capitalized, so only a translator knows a lowercase form there. A name ("GitHub", "PDF") stays as it is.
 */
/** A sentence's rest standing on its own line: "não conseguiu atualizar…" → "Não conseguiu atualizar…". */
export const upperFirst = (s: string, locale?: string) => (s ? s.charAt(0).toLocaleUpperCase(locale) + s.slice(1) : s);

export const lowerFirst = (s: string, locale?: string) =>
  !s || locale?.startsWith("de") || /^\p{Lu}\p{L}*\p{Lu}/u.test(s)
    ? s
    : s.charAt(0).toLocaleLowerCase(locale) + s.slice(1);

/** "Segunda-feira" */
export const formatWeekday = (locale: string, iso: string) =>
  capitalize(new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(iso)));

/** Day divider label: "Hoje", "Ontem", a weekday within the week ("Segunda-feira"), "12 out", "12 out 2025". */
export function dayLabel(t: TFunction, locale: string, iso: string, now = new Date()) {
  const days = daysBetween(iso, now);
  if (days === 0) return t("common.today");
  if (days === 1) return t("common.yesterday");
  if (days > 1 && days < 7) return formatWeekday(locale, iso);
  return formatShortDate(locale, iso, new Date(iso).getFullYear() !== now.getFullYear());
}

/** Intl.RelativeTimeFormat's own words, for engines without it (the phone's Hermes has only Collator, DateTimeFormat and NumberFormat). */
const RELATIVE_DAYS: Record<AppLocale, readonly [string, string, string]> = {
  en: ["yesterday", "today", "tomorrow"],
  "pt-BR": ["ontem", "hoje", "amanhã"],
  es: ["ayer", "hoy", "mañana"],
  fr: ["hier", "aujourd’hui", "demain"],
  de: ["gestern", "heute", "morgen"],
  it: ["ieri", "oggi", "domani"],
  nl: ["gisteren", "vandaag", "morgen"],
  ja: ["昨日", "今日", "明日"],
  ko: ["어제", "오늘", "내일"],
  "zh-Hans": ["昨天", "今天", "明天"],
  id: ["kemarin", "hari ini", "besok"],
  tr: ["dün", "bugün", "yarın"],
  pl: ["wczoraj", "dzisiaj", "jutro"],
  ru: ["вчера", "сегодня", "завтра"],
};

/** "ontem", "today", "明日": the language's word for the day `offset` (-1, 0, 1) away, lowercase where it writes it so. */
export function relativeDay(locale: string, offset: -1 | 0 | 1): string {
  if (typeof Intl.RelativeTimeFormat === "function")
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(offset, "day");
  return RELATIVE_DAYS[appLocale([locale], true) ?? "en"][offset + 1] as string;
}

/** The ordinal plural form of `n` ("one" for 1st, "few" for 3rd), with English's and French's rules where Intl.PluralRules is missing (Hermes). */
export function ordinalForm(locale: string, n: number): Intl.LDMLPluralRule {
  if (typeof Intl.PluralRules === "function") return new Intl.PluralRules(locale, { type: "ordinal" }).select(n);
  const code = appLocale([locale], true);
  if (code === "fr") return n === 1 ? "one" : "other";
  if (code !== "en" || (n % 100 >= 11 && n % 100 <= 13)) return "other";
  return (["other", "one", "two", "few"] as const)[n % 10] ?? "other";
}

/** "terça-feira, 14 de outubro de 2026 às 21:10" (tooltip on a message's time). */
export const formatFullDate = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(new Date(iso));

/** "agora", "há 2 min", "há 3 h", "ontem", "12 out". */
export function relativeTime(t: TFunction, locale: string, iso: string, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return t("common.now");
  if (diff < 3_600_000) return t("format.minutesAgo", { count: Math.floor(diff / 60_000) });
  const days = daysBetween(iso, now);
  if (days === 0) return t("format.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  if (days === 1) return relativeDay(locale, -1);
  return formatShortDate(locale, iso);
}

/** When an agent stopped working on a task: "Stopped 2 h ago", "Stopped yesterday", "Stopped on Nov 11". */
export function stoppedLine(t: TFunction, locale: string, iso: string, now = new Date()) {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 60_000) return t("issues.now.stoppedNow");
  if (diff < 3_600_000)
    return t("issues.now.stoppedAgo", { ago: t("format.minutesAgo", { count: Math.floor(diff / 60_000) }) });
  const days = daysBetween(iso, now);
  if (days === 0)
    return t("issues.now.stoppedAgo", { ago: t("format.hoursAgo", { count: Math.floor(diff / 3_600_000) }) });
  if (days === 1) return t("issues.now.stoppedYesterday");
  return t("issues.now.stoppedOn", {
    date: formatShortDate(locale, iso, new Date(iso).getFullYear() !== now.getFullYear()),
  });
}

/** How long since: "há 12 min", "há 3 h", "há 2 dias"; "agora" under a minute (a computer offline, a task stopped). */
export function timeAgo(t: TFunction, iso: string, now = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 60_000) return t("common.now");
  if (diff < 3_600_000) return t("format.minutesAgo", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t("format.hoursAgo", { count: Math.floor(diff / 3_600_000) });
  return t("format.daysAgo", { count: Math.floor(diff / 86_400_000) });
}

/** "hoje 10:44", "ontem 18:02", "12 out" (run history, decisions). */
export function whenAt(t: TFunction, locale: string, iso: string, now = new Date()) {
  const days = daysBetween(iso, now);
  if (now.getTime() - new Date(iso).getTime() < 60_000) return t("common.now");
  if (days === 0) return t("format.todayAt", { time: formatTime(locale, iso) });
  if (days === 1) return t("format.yesterdayAt", { time: formatTime(locale, iso) });
  return formatShortDate(locale, iso);
}

/** "Enviada hoje às 15:06", "Enviada ontem às 9:12", "Enviada em 12 out às 18:40" (a receipt's last line). */
export function sentAtLine(t: TFunction, locale: string, iso: string, now = new Date()) {
  const days = daysBetween(iso, now);
  const time = formatTime(locale, iso);
  if (days === 0) return t("receipts.sentToday", { time });
  if (days === 1) return t("receipts.sentYesterday", { time });
  return t("receipts.sentOn", {
    date: formatShortDate(locale, iso, new Date(iso).getFullYear() !== now.getFullYear()),
    time,
  });
}

/** A time ahead, weekday and time on this device's clock: "seg 20 out, 09:00". */
export const nextLabel = (locale: string, iso: string) =>
  new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: clockHour(locale),
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(/\./g, "")
    .replace(/ de /g, " ");

/** When something is coming: "hoje 18:00", "amanhã 09:00", "sex 10:00" within the week, then "12 out". */
export function upcomingAt(t: TFunction, locale: string, iso: string, now = new Date()) {
  const days = -daysBetween(iso, now);
  const time = formatTime(locale, iso);
  if (days <= 0) return t("format.todayAt", { time });
  if (days === 1) return t("format.tomorrowAt", { time });
  if (days < 7)
    return `${new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(iso)).replace(/\.$/, "")} ${time}`;
  return formatShortDate(locale, iso);
}

/** Time left: "24 h", "5 dias", "45 min", to the nearest unit shown, so a fresh day reads "24 h" (at least 1 min). */
export function timeLeft(t: TFunction, iso: string, now = new Date()) {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return null;
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return t("format.inMinutes", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t("format.inHours", { count: hours });
  return t("format.inDays", { count: Math.round(hours / 24) });
}

/** "Ana" for "Ana Souza". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** What an address names before its "@" ("joao.lima"), for a line too short for the whole address. */
export const emailName = (email: string) => email.split("@")[0] || email;

/** "Ada, Atlas, and Theo", "Ada, Atlas e Theo", "Ada、Atlas、Theo": the language's own list (Intl.ListFormat), in `t`'s language. */
export const joinNames = (names: readonly string[], t: TFunction): string => t("format.list", { names });

/** A name held whole in running text ("#chamados-urgentes"): its hyphens never break the line (U+2011). */
export const heldWhole = (name: string) => name.replaceAll("-", "\u2011");

/** How many names a list of a team says before "and N more" (`namesText`): a ready-made team's four, whole. */
export const NAMES_SHOWN = 4;

/** "Ana", "Ana e Bruno", "Ana, Bruno e mais 2": the first `max` names of `total`. */
export function namesText(t: TFunction, names: string[], max = 2, total = names.length) {
  const shown = names.slice(0, max);
  if (total <= shown.length) return joinNames(shown, t);
  return joinNames([...shown, t("notifications.namesMore", { count: total - shown.length })], t);
}

/** How many agents a roster (`rosterText`) names, one per line, before "and N more". */
export const ROSTER_SHOWN = 8;

/** "Ana · Designer" per line, the first `max` of them, then "e mais 3": a team to read in a tip. */
export function rosterText(
  t: TFunction,
  agents: readonly { name: string; role?: string | null }[],
  max = ROSTER_SHOWN,
) {
  // A name often carries its role already ("Lumen · Tradutora"): it isn't said twice.
  const lines = agents
    .slice(0, max)
    .map((a) => (a.role && !a.name.includes(a.role) ? `${a.name} · ${a.role}` : a.name));
  if (agents.length > max) lines.push(t("format.andMore", { count: agents.length - max }));
  return lines.join("\n");
}

/** Short model label for message meta: "Claude Sonnet 5.5" → "sonnet 5.5". */
export const shortModel = (label: string) => label.replace(/^Claude\s+/i, "").toLowerCase();

/** `YYYY-MM-DD` (a day, no time zone) → noon local time, so it never shifts a day. */
export const dateOnly = (ymd: string) => new Date(`${ymd}T12:00:00`);

/** `YYYY-MM-DD` → the end of that day in local time (ISO), for an end picked as a day. */
export const endOfDay = (ymd: string) => {
  const d = dateOnly(ymd);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
};

export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Due date: "hoje", "amanhã", "24 out". */
export function dueLabel(_t: TFunction, locale: string, ymd: string, now = new Date()) {
  const iso = dateOnly(ymd).toISOString();
  const days = daysBetween(iso, now);
  return days === 0 || days === -1 ? relativeDay(locale, days === 0 ? 0 : 1) : formatShortDate(locale, iso);
}

/** How close a due date is: past (`late`), today or tomorrow (`soon`), else null (an open task's date in its tone). */
export function dueTone(ymd: string, now = new Date()): "late" | "soon" | null {
  const days = daysBetween(dateOnly(ymd).toISOString(), now);
  return days > 0 ? "late" : days >= -1 ? "soon" : null;
}

/**
 * "24/10" or "24/10/2026" (10/24 where the language puts the month first) → `YYYY-MM-DD`, this year when omitted;
 * null when invalid. Dots and dashes work as the slash does ("24.10.2026").
 */
export function parseDayInput(value: string, now: Date, locale: string): string | null {
  const m = value.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?\.?$/);
  if (!m) return null;
  const [day, month] = dayMonthOrder(locale) === "dm" ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
  const d = new Date(Number(m[3] ?? now.getFullYear()), month - 1, day);
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  return toYmd(d);
}

/**
 * A step's target cut to what names it on one short line, never with an ellipsis that hides what it is: a URL is its
 * host ("console.example.com", with or without its scheme), a path its last part ("refresh.ts"), anything else its first `max` characters, cut at
 * a word when one is near.
 */
export function shortTarget(text: string, max = 40) {
  const s = text.trim();
  let out = s;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    try {
      out = new URL(s).host || s;
    } catch {
      out = s;
    }
  } else if (/^\S*\/\S*$/.test(s)) {
    const parts = s.split("/").filter(Boolean);
    const first = parts[0] ?? "";
    const last = parts.at(-1) ?? s;
    // "acme/repo", "10/31", "and/or" name nothing shorter: only a path or a host without its scheme is cut.
    if (/^(\/|\.{1,2}\/|~)/.test(s)) out = last;
    else if (first.includes(".")) out = first;
    else if (/\.[a-z0-9]{1,6}$/i.test(last)) out = last;
  }
  if (out.length <= max) return out;
  const cut = out.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > max / 2 ? cut.slice(0, space) : cut;
}

/** "1,2 s", "760 ms", "22 min", "1,5 h": a line's time, finer than the block's (and the work states' one clock). */
export function formatLineTime(locale: string, ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 60_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(ms / 1000)} s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)} min`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: ms < 10 * 3600_000 ? 1 : 0 }).format(ms / 3600_000)} h`;
}
