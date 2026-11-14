import { type ChildProcess, spawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { chmod, lchown, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { AGENT_WORKER_HOMES, GROK_ACCOUNT_HOMES } from "@agenteschat/adapters/command-policy";
import {
  ACCOUNT_KINDS,
  ACCOUNT_LOGIN_TTL_MS,
  type AccountKind,
  type AccountLoginFailure,
  type AccountLoginState,
  type AuthMethod,
  accountCodeAad,
  CURSOR_KEY_PROVIDER,
  type CursorModelInfo,
  isAccountId,
  isAccountKind,
  isAuthMethod,
  isClaudeLoginMethod,
  isLoginEmail,
  MAX_MACHINE_ACCOUNTS,
  type MachineReplies,
  OPENCODE_KEY_PROVIDER,
  OWN_USAGE_ID,
  type OwnPlanUsage,
  type PlanUsage,
  providerOrgIdOf,
  providerOrgNameOf,
  type RunnerAccountInfo,
  TOKEN_RECHECK_MS,
  type WireSecretBox,
} from "@agenteschat/adapters/machine-protocol";
import { cutAtWord, errorLineOf, redactCommon } from "@agenteschat/adapters/redact";
import { generateSecretKeyPair, openSecret, redactSecrets } from "@agenteschat/adapters/secret-box";
import {
  type CodingPlan,
  GEMINI_ENTERPRISE_PROVIDER,
  isPlanId,
  PLAN_ALIASES,
  type PlanId,
  planKeyFits,
  planModel,
  planOf,
} from "@agenteschat/providers/plans";
import { type Launcher, PROBE_AGENT_UID } from "./agent-users";
import {
  AGY_SIGN_IN_FILE,
  type AgySignIn,
  agyAuthOf,
  agyRuntimeDir,
  agySignInFrom,
  agySignInOf,
  holdAgySignIn,
  placeAgySignIn,
  writeAgySettings,
} from "./agy-home";
import { errnoCode, RunnerError } from "./errors";
import { killTree } from "./exec";
import {
  AGY_BIN,
  CURSOR_BIN,
  claudeKeptPlan,
  claudePlan,
  claudeTier,
  cliSpawn,
  GROK_BIN,
  isExecutable,
  OPENCODE_BIN,
  parseGrokModels,
  resolveCommand,
} from "./executors";
import { readSmallJson, writeJson } from "./json-file";
import {
  antigravityUsage,
  checkClaudeToken,
  codexUsage,
  fetchPlanKeyUsage,
  probeClaudeUsage,
  probeCodexUsage,
  usageCrossed,
  withRateLimit,
} from "./plan-usage";
import { type RunCommand, runSync } from "./service";
import type { TaskSecrets } from "./tasks";

/**
 * The computer brains' accounts on this machine (ADR 0041). An account is a
 * folder `<runner home>/accounts/<kind>/<id>` (mode 700) used as
 * `CLAUDE_CONFIG_DIR` (Claude Code) or `CODEX_HOME` (Codex): the CLI signs
 * in there and keeps its own sign-in; the runner never reads it.
 *
 * - `begin` starts the CLI's own sign-in with plain pipes (`claude auth login`,
 *   `codex login --device-auth`) in a new folder and reads what it printed:
 *   Claude Code's URL (plus an ephemeral key the browser seals the pasted code
 *   with), or Codex's device URL and one-time code.
 * - `code` opens the sealed Claude code and writes it to the waiting CLI.
 * - When the CLI exits, its status command (`claude auth status --json`,
 *   `codex login status`) in that folder decides: `done` with the email and
 *   plan (a Claude Max's tier from the CLI's `.claude.json` there tells Ultra
 *   apart, `claudePlan`), or `failed` (folder removed). After
 *   `ACCOUNT_LOGIN_TTL_MS` the sign-in is killed and its folder removed
 *   (`expired`).
 * - `list` asks each account's CLI (cached for `ACCOUNTS_TTL_MS`), but one a
 *   turn's endpoint refused reads as signed out until it signs in again
 *   (`refused`); `remove` signs out (best effort) and deletes the folder,
 *   `accountDir` is what a brain turn runs with.
 * - Usage (protocol 19, `plan-usage.ts`): what the turns say comes in through
 *   `noteRateLimit` / `noteCodexRateLimits`, and `probeUsage` looks it up on
 *   demand; the list carries it, and the computer's own sign-ins' is `ownUsage`.
 * - Key accounts (protocol 20): a coding plan on Claude Code. `begin` with a
 *   `provider` makes the folder and the key pair only, `code` opens the plan's
 *   key and keeps it in `provider.json` (600); no CLI ever signs in or out
 *   there. It is signed in until a turn's endpoint refuses the key.
 * - System mode (`lending`): a folder belongs to the OS user of the agent
 *   that thinks with it, only while it does (`lendTo`, `keepLent`), else to
 *   root. Root never runs a CLI against what an agent's user could write: such
 *   a folder's status is what its turns said and its plan what Claude Code
 *   keeps there (`claudeKeptPlan`), signing in again starts it over, and
 *   removing it signs nothing out.
 * - Protocol 29, one sign-in for all of its owner's agents: every folder
 *   where the agents are the runner's own user (the CLIs keep one sign-in for
 *   several processes of one user). In system mode, a sign-in made `shared`
 *   (`<id>.shared` beside its folder) is root's alone and never lent: a
 *   Claude one is `claude setup-token`'s token (`token.json`, 600), signed in
 *   in a terminal of its own (`spawnInTerminal`), a coding plan's is its key, a
 *   ChatGPT or Gemini one is its CLI's own sign-in there, and `grant` hands what
 *   a turn needs to the agent's worker (protocol 58: a copy of Gemini's, tried
 *   once as the sign-in ends, `agyCopyFails`).
 * - Claude's own login for all agents (`sharedLogin`; `<id>.method` says
 *   `cli_shared`, read as `cli_login` by everything outside this file): the
 *   folder here stays root's and empty; the CLI's store is the sign-in's OS
 *   user's (`AccountUsers`), and sign-in, status, usage and sign-out run as
 *   that user. Root never opens anything in that store.
 */

/** A fresh look at every account's status happens at most this often (each one runs the CLI). */
export const ACCOUNTS_TTL_MS = 10 * 60_000;
/** An account's usage is probed at most this often. */
export const USAGE_TTL_MS = 5 * 60_000;
/** A provider that answered 429 isn't asked again before this. */
export const USAGE_BACKOFF_MS = 15 * 60_000;
/** What the turns say about usage reaches the server at most this often (unless `usageCrossed`). */
export const USAGE_NOTIFY_MS = 60_000;
const USAGE_PROBES_AT_ONCE = 2;
const SIGN_INS_AT_ONCE = 4;
/** How long `begin` waits for the CLI to print its URL (and Codex its code). */
export const ACCOUNT_BEGIN_WAIT_MS = 15_000;
/** A finished sign-in still answers `status` this long (a late poll gets the result). */
export const ACCOUNT_FINISHED_KEEP_MS = 5 * 60_000;
/** Status and sign-out commands are killed after this. */
const STATUS_TIMEOUT_MS = 10_000;
/** The longest Claude code accepted (they are a few dozen characters). */
const MAX_CODE_CHARS = 2000;
const OUTPUT_KEEP = 16_000;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

const LABEL: Record<AccountKind, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  grok: "Grok Build",
  antigravity: "The Antigravity CLI",
};
/** Cursor's CLI keeps its config in `CURSOR_CONFIG_DIR` (cursor.com/docs/cli/reference/configuration). */
const ENV_VAR: Record<AccountKind, string> = {
  claude_code: "CLAUDE_CONFIG_DIR",
  codex: "CODEX_HOME",
  cursor: "CURSOR_CONFIG_DIR",
  // OpenCode keeps its config, sessions and sign-ins under the XDG folders (`accountEnv` sets them all).
  opencode: "XDG_DATA_HOME",
  // Its sign-in (`auth.json`), config, sessions and leader socket.
  grok: "GROK_HOME",
  // `agy` documents no config folder of its own (ADR 0143): the account's folder is its whole home.
  antigravity: "HOME",
};
const LOGIN_ARGS: Record<AccountKind, string[]> = {
  claude_code: ["auth", "login"],
  codex: ["login", "--device-auth"],
  cursor: ["login"],
  // Never run: an OpenCode account is its key alone (`begin` refuses a sign-in without one).
  opencode: ["auth", "login"],
  // The device code: the person signs in on xAI's page from any device, nothing listens on the computer.
  grok: ["login", "--device-auth"],
  // Google's sign-in by a pasted code, then it exits (antigravity.google/docs/ide/extensions/acp).
  antigravity: ["acp", "--login"],
};
const STATUS_ARGS: Record<AccountKind, string[]> = {
  claude_code: ["auth", "status", "--json"],
  codex: ["login", "status"],
  cursor: ["status"],
  opencode: ["auth", "list"],
  // Grok Build has no status command: `grok models` says "You are not authenticated." when signed out.
  grok: ["models"],
  // No status command either: `agy models` lists the account's models once it is signed in.
  antigravity: ["models"],
};
const LOGOUT_ARGS: Record<AccountKind, string[]> = {
  claude_code: ["auth", "logout"],
  codex: ["logout"],
  cursor: ["logout"],
  opencode: ["auth", "logout"],
  grok: ["logout"],
  // `/logout`, answered by the CLI itself in print mode; deleting the folder ends the sign-in anyway.
  antigravity: ["-p", "/logout"],
};
/** Each CLI's executable (Cursor's was `cursor-agent` before it was renamed). */
const COMMAND: Record<AccountKind, string> = {
  claude_code: "claude",
  codex: "codex",
  cursor: CURSOR_BIN,
  opencode: OPENCODE_BIN,
  grok: GROK_BIN,
  antigravity: AGY_BIN,
};

/** What a brain turn says when its account folder is gone (people read it). */
export const ACCOUNT_MISSING_MESSAGE: Record<AccountKind, string> = {
  claude_code:
    "The Claude account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
  codex:
    "The ChatGPT account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
  cursor:
    "The Cursor account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
  opencode:
    "The OpenCode account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
  grok: "The Grok account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
  antigravity:
    "The Gemini account chosen for this agent isn't on this computer anymore. Choose another account in the agent's settings, or add it again.",
};

/**
 * What would make a CLI think with anything but its folder's sign-in: a key, a token, another endpoint or cloud. Every
 * `GROK_` switch too (folder trust, memory, managed config, sandbox…): Grok Build gets only `GROK_QUIET_ENV`'s. And a
 * Gemini or Google AI key, another Gemini endpoint, the Antigravity CLI's enterprise gateway (`AGY_LLM_GATEWAY_*`) and
 * every other `AGY_` switch (it gets only `AGY_QUIET_ENV`'s).
 */
const STRAY_SIGN_IN =
  /^(ANTHROPIC_(API_KEY|AUTH_TOKEN|BASE_URL)|CLAUDE_CODE_(OAUTH_TOKEN|USE_\w+|\w+_FILE_DESCRIPTOR)|OPENAI_API_KEY|CODEX_API_KEY|CURSOR_API_KEY|OPENCODE_API_KEY|OPENCODE_AUTH_CONTENT|XAI_API_KEY|GROK_\w+|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GEMINI_BASE_URL|GOOGLE_GENAI_\w+|AGY_\w+)$/;
/**
 * Google Cloud's own sign-ins (Application Default Credentials, gcloud's config, Vertex's project): kept out of the
 * Antigravity CLI only, since an agent on another CLI may deploy to Google Cloud with them.
 */
const GOOGLE_CLOUD_SIGN_IN = /^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_\w+|CLOUDSDK_\w+)$/;

/** `base` without any key, token, endpoint or cloud a CLI would think with instead of its own sign-in. */
export function withoutSignIns(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if (!STRAY_SIGN_IN.test(k)) env[k] = v;
  return env;
}

/**
 * `base` without the agent's containers service (`systemLauncher`'s runtime dir and Podman's socket), for a CLI whose
 * shell runs in a sandbox of its own: that service, outside it, would be a way out (ADR 0169).
 */
export function withoutContainers(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CONTAINER_HOST: _podman, DOCKER_HOST: _docker, XDG_RUNTIME_DIR: _runtime, ...env } = base;
  return env;
}

/** The env a CLI runs with for an account folder: `base` without any other sign-in, the folder as its home. */
export function accountEnv(kind: AccountKind, dir: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = withoutSignIns(base);
  env[ENV_VAR[kind]] = dir;
  if (kind === "cursor") {
    // Linux keeps the sign-in under `$XDG_CONFIG_HOME/cursor`, macOS in the Keychain unless told to use a file: both
    // in the account's folder, so two accounts never share one sign-in. The sign-in prints its link, opens nothing.
    env.XDG_CONFIG_HOME = dir;
    env.AGENT_CLI_CREDENTIAL_STORE = "file";
    env.NO_OPEN_BROWSER = "1";
  }
  if (kind === "opencode") {
    // Its config, its sessions, its caches: all in the account's folder, so two accounts never share a sign-in.
    env.XDG_CONFIG_HOME = dir;
    env.XDG_CACHE_HOME = dir;
    env.XDG_STATE_HOME = dir;
  }
  if (kind === "grok") Object.assign(env, GROK_QUIET_ENV);
  if (kind === "antigravity") {
    // Everything Go and the CLI keep under the home stays in the account's folder; no D-Bus session, so the CLI
    // skips the keyring and keeps its sign-in in its own file there (changelog 1.2.x: "bypasses the keyring when no
    // D-Bus session bus is present").
    env.XDG_CONFIG_HOME = path.join(dir, ".config");
    env.XDG_CACHE_HOME = path.join(dir, ".cache");
    env.XDG_DATA_HOME = path.join(dir, ".local", "share");
    env.XDG_STATE_HOME = path.join(dir, ".local", "state");
    for (const k of Object.keys(env)) if (GOOGLE_CLOUD_SIGN_IN.test(k)) delete env[k];
    env.XDG_RUNTIME_DIR = agyRuntimeDir(dir);
    delete env.DBUS_SESSION_BUS_ADDRESS;
    // X11 is the other way a D-Bus client autolaunches (or finds) a session bus shared by the display.
    delete env.DISPLAY;
    delete env.SSH_AUTH_SOCK;
    Object.assign(env, AGY_QUIET_ENV);
  }
  return env;
}

/**
 * What every Grok Build process gets (ADR 0142): none of the Claude Code and Cursor config it would otherwise read
 * (their MCP servers, rules, skills, agents and hooks), no telemetry, no updates of its own (the computer's image
 * pins it). Names as Grok Build 1.0.34's configuration docs list them.
 */
export const GROK_QUIET_ENV: Readonly<Record<string, string>> = {
  GROK_CLAUDE_MCPS_ENABLED: "false",
  GROK_CLAUDE_RULES_ENABLED: "false",
  GROK_CLAUDE_SKILLS_ENABLED: "false",
  GROK_CLAUDE_AGENTS_ENABLED: "false",
  GROK_CLAUDE_HOOKS_ENABLED: "false",
  GROK_CURSOR_MCPS_ENABLED: "false",
  GROK_CURSOR_RULES_ENABLED: "false",
  GROK_CURSOR_SKILLS_ENABLED: "false",
  GROK_CURSOR_AGENTS_ENABLED: "false",
  GROK_CURSOR_HOOKS_ENABLED: "false",
  GROK_MANAGED_MCPS_ENABLED: "false",
  GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED: "false",
  GROK_TELEMETRY_ENABLED: "false",
  GROK_TELEMETRY_TRACE_UPLOAD: "false",
  GROK_TELEMETRY_MIXPANEL_ENABLED: "false",
  GROK_FEEDBACK_ENABLED: "false",
  GROK_DISABLE_AUTOUPDATER: "1",
  // Memory is shared by every turn on the account (several agents', Lodi's): forced off whatever a config says.
  GROK_MEMORY: "0",
};

/** What every Antigravity CLI process gets (ADR 0143): no updates of its own (the image pins it), no logo. */
export const AGY_QUIET_ENV: Readonly<Record<string, string>> = {
  AGY_CLI_DISABLE_AUTO_UPDATE: "true",
  AGY_CLI_HIDE_LOGO: "1",
  AGY_CLI_OSC7501: "off",
};

/** A Cursor account made with an API key keeps it here (600). */
const CURSOR_KEY_FILE = "cursor-key.json";
/** Cursor's API keys (`key_…`, a few dozen characters): loose, only to catch a paste that isn't one. */
const CURSOR_KEY = /^[\x21-\x7e]{16,512}$/;

/** A Cursor key account's key (`cursor-key.json`); null when the folder signs in instead. */
export async function cursorKeyOf(dir: string): Promise<string | null> {
  return keyIn(dir, CURSOR_KEY_FILE);
}

/** An OpenCode account keeps its key here (600): an OpenCode key is its only sign-in (ADR 0132). */
const OPENCODE_KEY_FILE = "opencode-key.json";

/** An OpenCode account's key (`opencode-key.json`); null when it has none (yet). */
export async function opencodeKeyOf(dir: string): Promise<string | null> {
  return keyIn(dir, OPENCODE_KEY_FILE);
}

function keyIn(dir: string, file: string): string | null {
  const o = readSmallJson(path.join(dir, file), 1000) as Record<string, unknown> | null;
  return typeof o?.key === "string" && CURSOR_KEY.test(o.key) ? o.key : null;
}

/** The key file and words of a CLI made with an API key alone (Cursor's, chosen; OpenCode's, its only sign-in). */
const CLI_KEYS = {
  [CURSOR_KEY_PROVIDER]: { file: CURSOR_KEY_FILE, label: "a Cursor API key" },
  [OPENCODE_KEY_PROVIDER]: { file: OPENCODE_KEY_FILE, label: "an OpenCode API key" },
} as const;
type CliKeyProvider = keyof typeof CLI_KEYS;

/**
 * How Claude Code gets a token root hands over: on descriptor 3, which it reads at its start, then closes, dropping
 * this variable (Claude Code 2.1.296 to 2.1.314), so neither its environment nor any command it starts holds it.
 */
export const TOKEN_FD_ENV = { CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: "3" } as const;

/** The stdio of a CLI that gets a token (`TOKEN_FD_ENV`): a fourth pipe for it. */
export const TOKEN_STDIO = ["pipe", "pipe", "pipe", "pipe"] as const;

/** Writes the token to the CLI started with `TOKEN_STDIO`, and closes that pipe. */
export function handToken(child: ChildProcess, token: string) {
  const pipe = child.stdio[3] as NodeJS.WritableStream | null | undefined;
  pipe?.on("error", () => {});
  pipe?.end(`${token}\n`);
}

/**
 * Routes (`brain-route.ts`) running in this process, by sign-in (`signInKey`). A turn or a task about to start a
 * CLI on a sign-in stops the route there first (`yieldRoute`): two processes on one sign-in race on its refresh token.
 */
export const routesRunning = new Map<string, { stop: AbortController; done: Promise<unknown> }>();

/** A sign-in: its account folder, or the computer's own (`home` absent). */
export const signInKey = (kind: AccountKind, home?: string | null) => `${kind}:${home ?? "own"}`;

/** Stops the route running on that sign-in, if any, and resolves once its CLI has exited. */
export async function yieldRoute(kind: AccountKind, home?: string | null): Promise<void> {
  const route = routesRunning.get(signInKey(kind, home));
  route?.stop.abort();
  await route?.done.catch(() => {});
}

/** A key account's plan and key, in its folder (mode 600). */
const PROVIDER_FILE = "provider.json";
/** The longest key kept (plans' keys are tens of characters, MiniMax's JWT-like ones a few hundred). */
const MAX_KEY_CHARS = 2048;
/** System mode, a Claude account made for all agents: the token `claude setup-token` printed (mode 600). */
const TOKEN_FILE = "token.json";
/** Claude's long-lived OAuth tokens: they only make model requests, and have no refresh token. */
const OAUTH_TOKEN = /sk-ant-oat01-[A-Za-z0-9_-]{8,400}/;
const WHOLE_OAUTH_TOKEN = new RegExp(`^${OAUTH_TOKEN.source}$`);
const OAUTH_TOKENS = new RegExp(OAUTH_TOKEN.source, "g");
/** The terminal `claude setup-token` draws its screen in: wide enough that its link and token never wrap. */
const TOKEN_TERMINAL = { cols: 500, rows: 200 } as const;
/** The Antigravity CLI's sign-in terminal: wide, so its Google link, printed on one line, never wraps. */
const LOGIN_TERMINAL = { cols: 2000, rows: 50 } as const;
/** A CLI turning bracketed paste on (`h`) or off (`l`) in its terminal. */
const PASTE_MODE = new RegExp(`${String.fromCharCode(27)}\\[\\?2004([hl])`, "g");
/** Between pasting a code into that screen and pressing Enter: the field takes the paste first. */
const PASTE_ENTER_MS = 300;
/** After the CLI exits, how long its last output may still take to arrive. */
const LAST_OUTPUT_MS = 500;

/**
 * What a turn of an agent thinking with an account root keeps (system mode, protocol 29) gets over its worker
 * link: the token or the key its CLI needs, or `none` while the account has neither (signed out). Root's alone
 * to give: never what the server sent.
 */
export type AccountGrant =
  | { kind: "token"; token: string }
  | { kind: "key"; provider: PlanId; key: string }
  /** A ChatGPT sign-in for all agents: root's newest `auth.json`, refreshed copies coming back (`watchCodexAuth`). */
  | { kind: "codex_auth"; auth: string }
  /** A Gemini sign-in for all agents: what root's Antigravity CLI keeps, copied in for each turn (`holdAgySignIn`). */
  | ({ kind: "agy_auth" } & AgySignIn)
  /** A Claude sign-in several agents share: its CLI is root's, so a task only prepares here (`tasks.ts`). */
  | { kind: "hosted" }
  | { kind: "none" };

/** A grant as the worker reads it off root's request frame; null when there is none or it isn't one. */
export function grantOf(v: unknown): AccountGrant | null {
  const g = v as Record<string, unknown> | null | undefined;
  if (g?.kind === "none") return { kind: "none" };
  if (g?.kind === "hosted") return { kind: "hosted" };
  if (g?.kind === "token" && typeof g.token === "string" && WHOLE_OAUTH_TOKEN.test(g.token)) {
    return { kind: "token", token: g.token };
  }
  if (g?.kind === "key" && isPlanId(g.provider) && typeof g.key === "string" && g.key) {
    return { kind: "key", provider: g.provider, key: g.key };
  }
  const agy = g?.kind === "agy_auth" ? agySignInFrom(g) : null;
  if (agy) return { kind: "agy_auth", ...agy };
  const auth = g?.kind === "codex_auth" ? codexAuthOf(g.auth) : null;
  return auth ? { kind: "codex_auth", auth: auth.text } : null;
}

/** Codex keeps its ChatGPT sign-in here, in `CODEX_HOME`. */
const CODEX_AUTH_FILE = "auth.json";
const MAX_CODEX_AUTH_CHARS = 64_000;
/** Codex refreshes a ChatGPT sign-in this old (its `TOKEN_REFRESH_INTERVAL`, 8 days; the access token lasts 10). */
export const CODEX_REFRESH_AFTER_MS = 8 * 24 * 3600_000;
/** How long a turn on a sign-in due for its refresh holds the others back, waiting for the refreshed copy. */
export const CODEX_REFRESH_WAIT_MS = 60_000;
/** How far ahead of root's clock a worker's `last_refresh` may be. */
const CODEX_CLOCK_SKEW_MS = 5 * 60_000;

export interface CodexAuth {
  /** The whole file, as JSON. */
  text: string;
  /** Its `last_refresh` (0 when it has none). */
  refreshedAt: number;
  /** The ChatGPT account it signs in to (`tokens.account_id`). */
  accountId: string;
  refreshToken: string;
}

/** A Codex `auth.json` (its text) that signs in to ChatGPT: tokens with a refresh token. Null for anything else. */
export function codexAuthOf(text: unknown): CodexAuth | null {
  if (typeof text !== "string" || text.length > MAX_CODEX_AUTH_CHARS) return null;
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  const tokens = (o as { tokens?: Record<string, unknown> } | null)?.tokens;
  if (typeof tokens?.access_token !== "string" || typeof tokens.refresh_token !== "string" || !tokens.refresh_token) {
    return null;
  }
  const at = Date.parse(String((o as { last_refresh?: unknown }).last_refresh ?? ""));
  return {
    text: JSON.stringify(o),
    refreshedAt: Number.isFinite(at) ? at : 0,
    accountId: typeof tokens.account_id === "string" ? tokens.account_id : "",
    refreshToken: tokens.refresh_token,
  };
}

/** A folder's Codex sign-in; null when it has none. Never through a link or a pipe. */
export function readCodexAuth(dir: string): CodexAuth | null {
  const o = readSmallJson(path.join(dir, CODEX_AUTH_FILE), MAX_CODEX_AUTH_CHARS);
  return o ? codexAuthOf(JSON.stringify(o)) : null;
}

/**
 * In an agent's worker: root's copy of a sign-in for all agents goes into the agent's own Codex home, unless what is
 * there is newer (a refresh this agent's Codex made, on its way back to root).
 */
export function placeCodexAuth(home: string, auth: string) {
  const granted = codexAuthOf(auth);
  if (!granted) return;
  const here = readCodexAuth(home);
  if (here && here.accountId === granted.accountId && here.refreshedAt >= granted.refreshedAt) return;
  writeJson(path.join(home, CODEX_AUTH_FILE), JSON.parse(granted.text));
}

/**
 * In an agent's worker, while a request runs on a sign-in root keeps: the agent's copy, each time its Codex
 * refreshed it, goes back (`send`) so root hands the refreshed one to the next turn of any agent. A refresh rotates
 * the refresh token, so the others need it soon. `stop` looks once more and stops looking.
 */
export function watchCodexAuth(home: string, granted: string, send: (auth: string) => void, everyMs = 2000) {
  let last = codexAuthOf(granted)?.refreshedAt ?? 0;
  const look = () => {
    const now = readCodexAuth(home);
    if (!now || now.refreshedAt <= last) return;
    last = now.refreshedAt;
    send(now.text);
  };
  const timer = setInterval(look, everyMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      look();
    },
  };
}

/** Beside the account folders: the models Grok Build lists to a signed-in account (`AccountManager.grokModels`). */
const GROK_MODELS_FILE = "grok-models.json";

/** System mode: the account folders, outside root's home (its parents 711) so an agent's user reaches the one lent to it. */
export const SYSTEM_ACCOUNTS_ROOT = path.join(AGENT_WORKER_HOMES, "accounts");

/**
 * System mode, Linux: what Grok Build's `workspace` sandbox does first, as a stand-in agent's user: bubblewrap binds
 * each folder above `GROK_HOME`, and gives up when one of them is closed to that user. Null when it starts; else what
 * it said. No bubblewrap is a failure too: Grok Build refuses to start without it.
 */
export function grokSandboxFails(dir: string, run: RunCommand = runSync): string | null {
  const above: string[] = [];
  for (let d = path.dirname(dir); d !== path.dirname(d); d = path.dirname(d)) above.unshift(d);
  const as = [`--reuid=${PROBE_AGENT_UID}`, `--regid=${PROBE_AGENT_UID}`, "--clear-groups", "--"];
  const binds = above.flatMap((d) => ["--bind", d, d]);
  const r = run("/usr/bin/setpriv", [...as, "bwrap", "--bind", "/", "/", ...binds, "--", "/bin/true"]);
  return r.code === 0 ? null : (saidIn(r.output) ?? `bubblewrap exited with code ${r.code}`);
}

/** A key account's plan and key (`provider.json`); null when the folder isn't one. Never through a link or a pipe. */
export async function planKeyOf(dir: string): Promise<{ provider: PlanId; key: string } | null> {
  const o = readSmallJson(path.join(dir, PROVIDER_FILE), MAX_KEY_CHARS + 200) as Record<string, unknown> | null;
  return isPlanId(o?.provider) && typeof o.key === "string" && o.key ? { provider: o.provider, key: o.key } : null;
}

/** A Claude account's token (`token.json`, system mode); null when the folder keeps none. */
export async function tokenOf(dir: string): Promise<string | null> {
  const o = readSmallJson(path.join(dir, TOKEN_FILE), 1000) as Record<string, unknown> | null;
  return typeof o?.token === "string" && WHOLE_OAUTH_TOKEN.test(o.token) ? o.token : null;
}

/** Tokens out of what people read (a CLI's error, a screen). */
const withoutTokens = (text: string) => text.replace(OAUTH_TOKENS, "…");

/** The most of a CLI's own words a sign-in that failed keeps. */
const SAID_CHARS = 300;

/** What a CLI's output says went wrong (`errorLineOf`), credentials masked, cut at a word; undefined when nothing. */
function saidIn(text: string): string | undefined {
  const line = redactCommon(errorLineOf(text));
  return line ? cutAtWord(line, SAID_CHARS) : undefined;
}

/** System mode, in an agent's worker: where its own folders for the accounts of that kind root keeps are. */
export const agentAccountsDir = (home: string, kind: AccountKind) => path.join(home, "accounts", kind);

/**
 * System mode, in an agent's worker: that agent's own folder for an account root keeps (`AccountGrant`), its
 * CLI's home for it there (sessions, settings), never a sign-in. Made on first use (700).
 */
export function agentAccountHome(home: string, kind: AccountKind, id: string): string | null {
  if (!isAccountKind(kind) || !isAccountId(id)) return null;
  const dir = path.join(agentAccountsDir(home, kind), id);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  } catch {
    return null;
  }
}

/** System mode, in an agent's worker: the account folders lent to this agent's user; any other is missing. */
export function lentAccounts(root = SYSTEM_ACCOUNTS_ROOT, grokRoot = GROK_ACCOUNT_HOMES) {
  return {
    accountDir(kind: AccountKind, id: string): string | null {
      if (!isAccountKind(kind) || !isAccountId(id)) return null;
      const dir = kind === "grok" ? path.join(grokRoot, id) : path.join(root, kind, id);
      try {
        accessSync(dir, constants.R_OK | constants.W_OK | constants.X_OK);
        return statSync(dir).isDirectory() ? dir : null;
      } catch {
        return null;
      }
    },
  };
}

// ── An agent's CLI on its account (ADR 0041 §5): turns and tasks alike ──────

/** The accounts' folders: root's, or those lent to this agent's worker, and its own folder for one root keeps. */
export interface AccountFolders {
  accountDir(kind: AccountKind, id: string): string | null;
  /** System mode, in a worker (protocol 29): this agent's own folder for an account root keeps (`AccountGrant`). */
  agentHome?(kind: AccountKind, id: string): string | null;
  /** System mode, in a worker: a refreshed ChatGPT sign-in root keeps goes back to root (`watchCodexAuth`). */
  codexAuth?(id: string, auth: string): void;
}

/** What a CLI signs in with on an account: the folder that is its home, and what root handed over for it. */
export interface AccountSignIn {
  home: string;
  /** A coding plan's key (protocol 20): in the CLI's env, under the plan's own name. */
  planKey?: { provider: PlanId; key: string };
  /** A token root keeps (protocol 29): on descriptor 3 only (`TOKEN_FD_ENV`), never in an env. */
  token?: string;
  /**
   * Once the turn or task ends: a ChatGPT sign-in root keeps stops sending its refreshed copies back; a Gemini one's
   * copy goes with the agent's last turn on it.
   */
  release?: () => void;
}

/** What a turn or task says when root has nothing to sign its account in with (signed out on the computer). */
export const ACCOUNT_SIGNED_OUT = "This account is signed out on this computer. Sign in again in AI accounts.";

/**
 * The account's folder or nothing, never the computer's own sign-in instead (ADR 0041 §5). One root keeps
 * (protocol 29) works in this agent's own folder for it, with what root handed over (`grant`). `signed_out`: root
 * has nothing for it; `missing`: no such folder here.
 */
export async function accountSignIn(
  folders: AccountFolders | undefined,
  kind: AccountKind,
  id: string,
  grant?: AccountGrant,
): Promise<AccountSignIn | "signed_out" | "missing"> {
  if (grant?.kind === "none") return "signed_out";
  const home = grant ? folders?.agentHome?.(kind, id) : folders?.accountDir(kind, id);
  if (!home) return "missing";
  let release: (() => void) | undefined;
  if (grant?.kind === "codex_auth") {
    placeCodexAuth(home, grant.auth);
    const send = folders?.codexAuth?.bind(folders);
    if (send) release = watchCodexAuth(home, grant.auth, (auth) => send(id, auth)).stop;
  }
  // ponytail: no copy comes back to root, since Google's refresh answers carry no new refresh token; take refreshed
  // copies back as Codex's are if they ever do.
  if (grant?.kind === "agy_auth") release = holdAgySignIn(home, grant);
  const planKey =
    grant?.kind === "key" ? { provider: grant.provider, key: grant.key } : grant ? null : await planKeyOf(home);
  return {
    home,
    ...(planKey ? { planKey } : {}),
    ...(grant?.kind === "token" ? { token: grant.token } : {}),
    ...(release ? { release } : {}),
  };
}

/** The redaction of a CLI on an account also hides the key or token it got (an agent's shell could print a key). */
export function withSignIn(secrets: TaskSecrets | null | undefined, signIn: AccountSignIn): TaskSecrets | null {
  const secret = signIn.planKey
    ? { name: planOf(signIn.planKey.provider)?.claudeCode.tokenEnv ?? "PLAN_KEY", value: signIn.planKey.key }
    : signIn.token
      ? { name: "CLAUDE_CODE_OAUTH_TOKEN", value: signIn.token }
      : null;
  if (!secret) return secrets ?? null;
  const before = secrets?.redact ?? ((text: string) => text);
  return {
    env: secrets?.env ?? {},
    redact: (text) => redactSecrets(before(text), [secret]),
    hold: Math.max(secrets?.hold ?? 0, secret.value.length - 1),
  };
}

const API_ANTHROPIC = "https://api.anthropic.com";

/** What sends requests elsewhere besides the base URL: proxies and the certificates trusted on the way. */
export const NETWORK_ENV = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_TLS_REJECT_UNAUTHORIZED",
] as const;

/** Claude Code's switches to another company's cloud. */
const CLOUD_ENV = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"] as const;

/**
 * The `env` of a Claude Code turn's or task's own `--settings`, which outranks the project's settings (the agent
 * can write those, and a cloned repo can bring them): the endpoint (the plan's, else Anthropic's), no other
 * cloud, and the runner's own proxies and certificates (or none), so the sign-in or key goes nowhere else;
 * for a plan, what each model alias runs. The key itself stays in the process env (the CLI doesn't sign in
 * with one given only here). `own` (the computer's own sign-in): the endpoint and cloud the runner itself
 * runs with, whatever its owner set there, still out of a project's reach.
 */
export function accountSettingsEnv(
  plan: CodingPlan | undefined,
  model: string | undefined,
  runner = process.env,
  own = false,
) {
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: plan?.claudeCode.baseUrl ?? (own ? runner.ANTHROPIC_BASE_URL : undefined) ?? API_ANTHROPIC,
  };
  for (const k of CLOUD_ENV) env[k] = own ? (runner[k] ?? "") : "";
  for (const k of NETWORK_ENV) env[k] = runner[k] ?? "";
  if (!plan) {
    // The computer's own API key on Anthropic's API: its conversation stays cached for an hour between messages, as a
    // subscription's does by default (Claude Code 2.1.242 and later read it), unless its owner chose a TTL.
    const ownKey =
      own &&
      Boolean(runner.ANTHROPIC_API_KEY) &&
      env.ANTHROPIC_BASE_URL === API_ANTHROPIC &&
      CLOUD_ENV.every((k) => !runner[k]) &&
      !runner.CLAUDE_CODE_PROMPT_CACHE_TTL &&
      !runner.FORCE_PROMPT_CACHING_5M;
    if (ownKey) env.CLAUDE_CODE_PROMPT_CACHE_TTL = "1h";
    return env;
  }
  // On a plan whose models each have their own limit and switch (OpenCode Go), a turn's model runs every call of it,
  // Claude Code's own small ones (titles, command checks) included: its owner may have only that model on, and
  // another would be refused or spend that model's own limit. Elsewhere `haiku` keeps the plan's cheaper model.
  const pinned = model && plan.limitsPerModel ? planModel(plan, model).id : undefined;
  for (const alias of PLAN_ALIASES)
    env[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`] = pinned ?? planModel(plan, alias).id;
  // A subagent called with Claude Code's `fable` alias would otherwise ask the plan for a Claude model it doesn't serve.
  env.ANTHROPIC_DEFAULT_FABLE_MODEL = pinned ?? planModel(plan, "opus").id;
  // Older Claude Code reads its small model from here.
  env.ANTHROPIC_SMALL_FAST_MODEL = pinned ?? planModel(plan, "haiku").id;
  env.CLAUDE_CODE_SUBAGENT_MODEL = planModel(plan, model).id;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  return { ...env, ...plan.claudeCode.env };
}

type Chown = (file: string, uid: number, gid: number) => Promise<void>;

/**
 * A folder tree to `uid`, or back to root (0), never following a link; a file
 * that has other names (`nlink` > 1) or isn't a file, folder or link goes
 * instead. Back to root is top-down: each folder is root's (700) before it is
 * read, so its last owner can't swap what is read next. To an agent it is
 * bottom-up from a tree only root can change, its top last.
 */
async function chownTree(dir: string, uid: number, chown: Chown) {
  const toRoot = uid === 0;
  const walk = async (d: string) => {
    if (toRoot) {
      await chown(d, 0, 0);
      await chmod(d, 0o700);
    }
    for (const name of await readdir(d)) {
      const p = path.join(d, name);
      const st = await lstat(p);
      if (st.isDirectory()) await walk(p);
      else if (st.isSymbolicLink() || (st.isFile() && st.nlink === 1)) await chown(p, uid, toRoot ? 0 : -1);
      else await rm(p, { force: true });
    }
    if (!toRoot) await chown(d, uid, -1);
  };
  await walk(dir);
  if (!toRoot) await chmod(dir, 0o700);
}

// ── Reading what the CLIs print ──────────────────────────────────────────────

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
/** OSC (hyperlinks, titles), ended by BEL or ST (`ESC \\`). */
const OSC = new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, "g");
/** CSI (colors, cursor moves). */
const CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, "g");
/** Any other two-character escape. */
const FE = new RegExp(`${ESC}[@-_]`, "g");

/** Terminal escapes out (an OSC 8 hyperlink keeps only its text), carriage returns too. */
export function stripAnsi(text: string): string {
  return text.replace(OSC, "").replace(CSI, "").replace(FE, "").replace(/\r/g, "");
}

/**
 * One escape at a time, only when whole: CSI (`m[1]` its parameters, `m[2]` its final byte), OSC, DCS and the
 * like, a character set, or any other two-character escape (`m[3]`).
 */
const SCREEN_ESCAPE = new RegExp(
  `${ESC}\\[([0-?]*)[ -/]*([@-~])|${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|${ESC}[P^_X][\\s\\S]*?${ESC}\\\\|${ESC}[()*+][ -~]|${ESC}([^\\[\\]P^_X()*+])`,
  "y",
);

/**
 * What a terminal shows, fed the bytes a program draws it with as they come: `claude setup-token` draws its
 * screen only in a terminal, puts words apart with cursor moves and redraws only the cells that change, so its
 * text is read off the screen, never off the bytes. Characters at the cursor, returns, line feeds, cursor moves
 * and erases; colors, links and every other escape left out; one cell per character. An escape cut between two
 * pieces waits for the rest.
 */
export class Screen {
  private lines: string[][] = [];
  private r = 0;
  private c = 0;
  private saved: [number, number] = [0, 0];
  private rest = "";

  /** `beforeErase` runs before each escape that erases cells, with what the screen showed until then. */
  constructor(
    private readonly rows: number = TOKEN_TERMINAL.rows,
    private readonly beforeErase?: () => void,
  ) {}

  write(chunk: string) {
    const s = this.rest + chunk;
    this.rest = "";
    for (let i = 0; i < s.length; ) {
      if (s[i] !== ESC) {
        const ch = String.fromCodePoint(s.codePointAt(i) ?? 0);
        i += ch.length;
        this.char(ch);
        continue;
      }
      SCREEN_ESCAPE.lastIndex = i;
      const m = SCREEN_ESCAPE.exec(s);
      if (m) {
        i += m[0].length;
        this.escape(m);
      } else if (s.length - i > 4096) {
        // Never ended: not an escape after all.
        i++;
      } else {
        this.rest = s.slice(i);
        return;
      }
    }
  }

  text(): string {
    return this.lines.map((l) => l.join("").trimEnd()).join("\n");
  }

  private line(): string[] {
    while (this.lines.length <= this.r) this.lines.push([]);
    return this.lines[this.r] as string[];
  }

  /** Down a line; past the bottom the screen scrolls up. */
  private feed() {
    if (this.r < this.rows - 1) this.r++;
    else this.lines.splice(0, 1);
  }

  private char(ch: string) {
    if (ch === "\r") this.c = 0;
    else if (ch === "\n") this.feed();
    else if (ch === "\b") this.c = Math.max(0, this.c - 1);
    else if (ch === "\t") this.c = (Math.floor(this.c / 8) + 1) * 8;
    else if (ch >= " " && ch !== "\x7f") {
      const l = this.line();
      while (l.length < this.c) l.push(" ");
      l[this.c++] = ch;
    }
  }

  private escape(m: RegExpExecArray) {
    if (m[3] === "7") this.saved = [this.r, this.c];
    else if (m[3] === "8") [this.r, this.c] = this.saved;
    else if (m[3] === "D") this.feed();
    else if (m[3] === "E") {
      this.feed();
      this.c = 0;
    } else if (m[3] === "M") this.r = Math.max(0, this.r - 1);
    const params = m[1] ?? "";
    // Private modes and queries (`?25l`, `>0q`) move nothing.
    if (!m[2] || /[<=>?]/.test(params)) return;
    const [a = 0, b = 0] = params.split(";").map((p) => Number.parseInt(p, 10) || 0);
    const n = Math.max(1, a);
    const l = () => this.line();
    if ("JKXP".includes(m[2])) this.beforeErase?.();
    switch (m[2]) {
      case "A":
        this.r = Math.max(0, this.r - n);
        break;
      case "B":
      case "e":
        this.r = Math.min(this.rows - 1, this.r + n);
        break;
      case "C":
      case "a":
        this.c += n;
        break;
      case "D":
        this.c = Math.max(0, this.c - n);
        break;
      case "E":
        this.r = Math.min(this.rows - 1, this.r + n);
        this.c = 0;
        break;
      case "F":
        this.r = Math.max(0, this.r - n);
        this.c = 0;
        break;
      case "G":
      case "`":
        this.c = n - 1;
        break;
      case "d":
        this.r = Math.min(this.rows - 1, n - 1);
        break;
      case "H":
      case "f":
        this.r = Math.min(this.rows - 1, Math.max(1, a) - 1);
        this.c = Math.max(1, b) - 1;
        break;
      case "K":
        if (a === 0) l().length = Math.min(l().length, this.c);
        else if (a === 1) l().fill(" ", 0, this.c + 1);
        else l().length = 0;
        break;
      case "J":
        if (a === 0) {
          l().length = Math.min(l().length, this.c);
          this.lines.length = Math.min(this.lines.length, this.r + 1);
        } else if (a === 1) {
          for (let k = 0; k < this.r && k < this.lines.length; k++) this.lines[k] = [];
          l().fill(" ", 0, this.c + 1);
        } else this.lines = [];
        break;
      case "X":
        l().fill(" ", this.c, this.c + n);
        break;
      case "P":
        l().splice(this.c, n);
        break;
      case "@":
        if (this.c <= l().length) l().splice(this.c, 0, ...Array<string>(n).fill(" "));
        break;
    }
  }
}

/**
 * The token on `claude setup-token`'s screen: the first after "OAuth token". While it still draws (`final`
 * false), only once the line below it ("Store this token securely") is there, so the token's own line is whole.
 */
export function parseSetupToken(screen: string, final = false): string | null {
  const at = screen.indexOf("OAuth token");
  if (at < 0) return null;
  const rest = screen.slice(at);
  const m = OAUTH_TOKEN.exec(rest);
  if (!m) return null;
  return final || /store this token/i.test(rest.slice(m.index + m[0].length)) ? m[0] : null;
}

/** An https URL up to whitespace, a quote or an escape that wasn't stripped (a hyperlink still arriving). */
const URL_RE = new RegExp(`https://[^\\s"'<>\`${ESC}${BEL}]+`, "g");

/**
 * The https URLs in `text` whose host matches, in order. Without `final`, a
 * URL that runs to the end of the text may still be arriving: it waits.
 */
function urlsIn(text: string, host: (h: string) => boolean, final: boolean) {
  const out: { url: string; end: number }[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const end = (m.index ?? 0) + m[0].length;
    if (!final && end >= text.length) continue;
    const raw = m[0].replace(/[.,;:)\]}>]+$/, "");
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" && host(u.hostname.toLowerCase())) out.push({ url: raw, end });
    } catch {
      // not a URL
    }
  }
  return out;
}

const toUrl = (url: string | null) => (url ? { url } : null);
/** In an account folder while its sign-in runs (removed when it signs in). */
const SIGNING_IN = ".signing-in";
/** `<id>.method` of Claude's own login for all agents (`sharedLogin`). Protocol 50 says `cli_login`. */
const CLI_SHARED = "cli_shared";

const hostIs = (h: string, domain: string) => h === domain || h.endsWith(`.${domain}`);

/**
 * Claude Code's sign-in URL (`If the browser didn't open, visit: <url>`): the
 * first complete https URL on claude.com, claude.ai or anthropic.com, escapes removed.
 */
export function parseClaudeLoginUrl(output: string, final = false): string | null {
  const text = stripAnsi(output);
  return (
    urlsIn(text, (h) => hostIs(h, "claude.com") || hostIs(h, "claude.ai") || hostIs(h, "anthropic.com"), final)[0]
      ?.url ?? null
  );
}

const CODE = /(?:^|[^A-Z0-9-])([A-Z0-9]{4}-[A-Z0-9]{4,6})(?=\s)/;
const CODE_AT_END = /(?:^|[^A-Z0-9-])([A-Z0-9]{4}-[A-Z0-9]{4,6})(?![A-Z0-9-])/;

/** Codex's device sign-in: the first auth.openai.com URL, then the one-time code (`7HYC-J6JGM`). */
export function parseCodexLogin(output: string, final = false): { url: string; userCode: string } | null {
  const text = stripAnsi(output);
  const first = urlsIn(text, (h) => h === "auth.openai.com", final)[0];
  if (!first) return null;
  const rest = text.slice(first.end);
  // Complete only once something follows it (or the output ended).
  const m = (final ? CODE_AT_END : CODE).exec(rest);
  return m?.[1] ? { url: first.url, userCode: m[1] } : null;
}

/**
 * `claude auth status --json` → signed in, email, plan (short words only, named by `claudePlan` with the
 * folder's `tier`) and Claude organization. Signed in means through claude.ai: a folder that reports an API key isn't
 * the account's own sign-in. An answer without a `loggedIn` says nothing for sure (`statusUnknown`).
 */
export function parseClaudeStatus(
  status: number | null,
  stdout: string,
  tier: () => unknown = () => undefined,
): Omit<RunnerAccountInfo, "id" | "kind"> {
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim() || "null");
  } catch {
    return { loggedIn: false, statusUnknown: true };
  }
  if (!json || typeof json !== "object" || typeof (json as { loggedIn?: unknown }).loggedIn !== "boolean") {
    return { loggedIn: false, statusUnknown: true };
  }
  const o = json as Record<string, unknown>;
  const email = typeof o.email === "string" && o.email.length <= 254 && EMAIL.test(o.email) ? o.email : undefined;
  const plan = claudePlan(o.subscriptionType, tier);
  const providerOrgId = providerOrgIdOf(o.orgId);
  const orgName = providerOrgNameOf(o.orgName);
  return {
    loggedIn: o.loggedIn === true && status === 0 && o.authMethod === "claude.ai",
    ...(email ? { email } : {}),
    ...(plan ? { plan } : {}),
    ...(providerOrgId ? { providerOrgId } : {}),
    ...(orgName ? { orgName } : {}),
  };
}

/**
 * Grok Build's device sign-in (`grok login --device-auth`): the first https URL on x.ai or grok.com, then its one-time
 * code. A URL that carries the code itself (`?user_code=`) needs none after it.
 */
export function parseGrokLogin(output: string, final = false): { url: string; userCode?: string } | null {
  const text = stripAnsi(output);
  const first = urlsIn(text, (h) => hostIs(h, "x.ai") || hostIs(h, "grok.com"), final)[0];
  if (!first) return null;
  const m = (final ? CODE_AT_END : CODE).exec(text.slice(first.end));
  if (m?.[1]) return { url: first.url, userCode: m[1] };
  return final || /[?&](?:user_)?code=/i.test(first.url) ? { url: first.url } : null;
}

/** `grok models`: signed in unless it says it isn't, with a sign-in file in the folder. */
export function parseGrokStatus(
  status: number | null,
  output: string,
  hasAuth: boolean,
): Omit<RunnerAccountInfo, "id" | "kind"> {
  return { loggedIn: hasAuth && status === 0 && !/not (?:authenticated|logged in|signed in)/i.test(stripAnsi(output)) };
}

/**
 * The Antigravity CLI's sign-in (`agy acp --login`): the first https URL on Google's accounts pages. The code Google
 * shows after the sign-in is pasted back (`code`), as with Claude Code.
 */
export function parseAgyLoginUrl(output: string, final = false): string | null {
  return urlsIn(stripAnsi(output), (h) => hostIs(h, "accounts.google.com"), final)[0]?.url ?? null;
}

/** What the Antigravity CLI says when it has no sign-in to think with. */
const AGY_SIGN_IN_WORDS = /auth(?:entication)? required|not (?:authenticated|logged in|signed in)|sign in/i;

/**
 * `agy models`: signed in when it lists models and says nothing about signing in. An Enterprise sign-in says so in its
 * settings (`provider: "enterprise"`). Signed out, 1.5.0 exits 1 with "Please sign in to view available models"; an
 * account Google won't serve, "Eligibility check failed: …".
 */
export function parseAgyStatus(
  status: number | null,
  output: string,
  auth: string | null,
): Omit<RunnerAccountInfo, "id" | "kind"> {
  const text = stripAnsi(output);
  // 1.5.0 lists one model a line, its slug and its name split by a tab (`gemini-4-argon-high\tGemini 4 Argon (High)`).
  const loggedIn = status === 0 && /^[ \t]*gemini-[\w.-]+[ \t]+\S/im.test(text) && !AGY_SIGN_IN_WORDS.test(text);
  // A seat: "Atende outras pessoas" says a seat's words for it.
  return {
    loggedIn,
    ...(auth === "oauth-business" ? { provider: GEMINI_ENTERPRISE_PROVIDER, plan: "enterprise" } : {}),
  };
}

/** Cursor's sign-in link (`agent login` with `NO_OPEN_BROWSER`): the first complete https URL on cursor.com. */
export function parseCursorLoginUrl(output: string, final = false): string | null {
  return urlsIn(stripAnsi(output), (h) => hostIs(h, "cursor.com") || hostIs(h, "cursor.sh"), final)[0]?.url ?? null;
}

/**
 * `agent status`: signed in when it exits 0 and names the account (`Logged in as someone@example.com`), the email
 * kept when it is one. Anything that says it isn't (`Not logged in`) is signed out.
 */
export function parseCursorStatus(status: number | null, output: string): Omit<RunnerAccountInfo, "id" | "kind"> {
  const text = stripAnsi(output);
  const loggedIn =
    status === 0 && /logged in|authenticated/i.test(text) && !/not (?:logged in|authenticated)/i.test(text);
  const email = loggedIn ? /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/i.exec(text)?.[0] : undefined;
  return { loggedIn, ...(email && email.length <= 254 ? { email } : {}) };
}

/** `codex login status` (`Logged in using ChatGPT`, on either stream): signed in when it exits 0 and says so. */
export function parseCodexStatus(status: number | null, output: string): Omit<RunnerAccountInfo, "id" | "kind"> {
  const text = stripAnsi(output);
  return { loggedIn: status === 0 && /logged in/i.test(text) && !/not logged in/i.test(text) };
}

/**
 * Why a sign-in's CLI stopped with an error, by what it printed. A pasted code the provider refused reads like
 * Antigravity CLI 1.5.0's `couldn't log in: token exchange failed: oauth2: "invalid_grant" "Bad Request"`.
 */
export function loginFailureOf(output: string): AccountLoginFailure {
  if (/no controlling terminal|cannot open \/dev\/tty|not a (?:tty|terminal)\b/i.test(output)) return "no_tty";
  if (
    /dial tcp|no such host|connection (?:refused|reset)|network is unreachable|i\/o timeout|tls handshake|timeout awaiting|context deadline exceeded|getaddrinfo|could not resolve|\bE(?:CONNREFUSED|CONNRESET|NOTFOUND|TIMEDOUT|AI_AGAIN)\b/i.test(
      output,
    )
  ) {
    return "network";
  }
  if (/invalid_grant|invalid (?:authorization )?code|code (?:is |has )?(?:invalid|expired)/i.test(output)) {
    return "bad_code";
  }
  return "cli_exit";
}

// ── Running the CLIs ─────────────────────────────────────────────────────────

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a CLI to the end (killed after `timeoutMs`); never throws. */
function runCli(command: string[], args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<CliResult> {
  return new Promise((resolve) => {
    const run = cliSpawn(command, args, env.PATH);
    let child: ChildProcess;
    try {
      child = spawn(run.file, run.args, {
        env: run.env ? { ...env, ...run.env } : env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        windowsVerbatimArguments: run.windowsVerbatimArguments,
      });
    } catch (err) {
      resolve({ status: null, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      stdout = (stdout + c).slice(-OUTPUT_KEEP);
    });
    child.stderr?.on("data", (c: string) => {
      stderr = (stderr + c).slice(-OUTPUT_KEEP);
    });
    let settled = false;
    const finish = (status: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    };
    const timer = setTimeout(() => {
      // The whole tree: on Windows the child is cmd.exe, and the CLI it started would stay.
      killTree(child, "SIGKILL");
      finish(null);
    }, timeoutMs);
    timer.unref?.();
    const events = child as unknown as EventEmitter;
    events.on("error", (err: Error) => {
      stderr += err.message;
      finish(null);
    });
    events.on("close", (code: number | null) => finish(code));
  });
}

// ── The manager ──────────────────────────────────────────────────────────────

export interface AccountManagerOptions {
  /** `<runner home>/accounts`. */
  root: string;
  /** Tests: the clock. */
  now?: () => number;
  /** The organization this machine is paired with (a sealed code's AAD names it); unknown before pairing. */
  orgId?: () => string | undefined;
  /** How to start each CLI (tests: a fake script). Default `["claude"]` / `["codex"]`. */
  commands?: Partial<Record<AccountKind, string[]>>;
  beginWaitMs?: number;
  ttlMs?: number;
  finishedKeepMs?: number;
  listTtlMs?: number;
  /** Tests: `USAGE_TTL_MS`, `USAGE_NOTIFY_MS`, how long a probe may take, and the HTTP client of the key probes. */
  usageTtlMs?: number;
  /** Tests: `TOKEN_RECHECK_MS`. */
  tokenCheckTtlMs?: number;
  usageNotifyMs?: number;
  usageTimeoutMs?: number;
  /** Tests: how long a status look may take (`STATUS_TIMEOUT_MS`). */
  statusTimeoutMs?: number;
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** An account was added or removed, a fresh look changed the list (`hello`, the app's status), or usage moved. */
  onChange?: () => void;
  /** System mode: folders are lent to agents' users (`lendTo`); `chown` never follows a link (tests: a fake). */
  lending?: { chown: Chown };
  /**
   * System mode: Grok Build's folders, outside `root` (`GROK_ACCOUNT_HOMES`); what root writes beside them stays under
   * `root`. Left out, they are under `root` as every other kind's.
   */
  grokRoot?: string;
  /** System mode: whether Grok Build's sandbox starts for an agent's user above a folder (`grokSandboxFails`). */
  grokSandbox?: (dir: string) => string | null;
  /** Tests: the platform (the Antigravity CLI signs in only on Linux here). */
  platform?: NodeJS.Platform;
  /**
   * System mode: what goes before each Claude CLI root runs on an account folder (`authEgressPrefix`), asked once;
   * null: they run as before.
   */
  authEgress?: () => string[] | null;
  /** System mode: Claude's own login for all agents. Absent, nothing here ever uses it. */
  sharedLogin?: SharedLogin;
}

/** Claude's own login for all agents of a system-mode computer: what `AccountManager` needs of `AccountUsers`. */
export interface SharedLogin {
  /** The feature's switch is on and the self-check passed. */
  ready(): boolean;
  /** How root runs the CLI as the sign-in's user, made the first time. Throws when it can't be. */
  launcher(id: string): Launcher;
  /** The sign-in's processes, store and user go. */
  remove(id: string): void;
}

/** The real `lending.chown`. */
export const lchownTree: Chown = (file, uid, gid) => lchown(file, uid, gid);

/** A sign-in's CLI in a terminal of its own (`spawnInTerminal`). */
interface TokenProcess {
  pid?: number;
  kill(signal: NodeJS.Signals): unknown;
  write(text: string): void;
}

interface Login {
  id: string;
  kind: AccountKind;
  dir: string;
  /** None for a key account: nothing signs in but the key. */
  child?: ChildProcess;
  /**
   * A CLI that signs in only in a terminal (`spawnInTerminal`): system mode's Claude sign-in for all agents
   * (`claude setup-token`, with its screen and the token once shown) or the Antigravity CLI's.
   */
  term?: TokenProcess;
  screen?: Screen;
  token?: string;
  /** The CLI turned bracketed paste on in its terminal: a paste reaches it wrapped in its marks, as a terminal sends one. */
  brackets?: boolean;
  /** System mode: made for all agents (`<id>.shared` once it signs in). */
  shared: boolean;
  /** Claude's own login for all agents: its CLI runs as the sign-in's user (`sharedCli`). */
  cliShared?: boolean;
  /** A key account's plan, `cursor` for a Cursor API key, or `zen` for an OpenCode key. */
  provider?: PlanId | CliKeyProvider;
  state: AccountLoginState;
  output: string;
  /** Claude Code: the ephemeral key the pasted code is sealed to (in memory only). */
  privateKey?: string;
  /** The code last written, only to keep it out of an error message; dropped when the sign-in ends. */
  code?: string;
  /** The process failed to start (`ENOENT`: not installed). */
  spawnError?: string;
  exited: boolean;
  account?: RunnerAccountInfo;
  error?: string;
  /** Why it ended without signing in, and what the CLI said about it (`failWith`). */
  failure?: AccountLoginFailure;
  said?: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Signing in again to an existing account: its folder is never removed by this sign-in. */
  again: boolean;
  /** `begin` returned its link: from then on its end removes the folder (before, `begin` itself does). */
  started?: boolean;
  /** `begin` waits on this for the printed URL. */
  watch?: () => void;
}

export class AccountManager {
  private readonly logins = new Map<string, Login>();
  private cache: { at: number; value: RunnerAccountInfo[] } | null = null;
  private listing: Promise<RunnerAccountInfo[]> | null = null;
  private announce = false;
  private closed = false;
  private readonly log: (line: string) => void;
  /** Usage by account id, or `OWN_USAGE_ID` for the computer's own sign-ins. */
  private readonly usage = new Map<string, PlanUsage>();
  /** When each was last probed, and until when its provider asked us to wait. */
  private readonly probed = new Map<string, number>();
  /** Setup-token accounts whose next probe is a check on the cheapest model (`list.recheck`). */
  private readonly tokenChecks = new Set<string>();
  private readonly tokenChecked = new Map<string, number>();
  private readonly backoff = new Map<string, number>();
  private readonly probeQueue: string[] = [];
  private readonly probing = new Set<string>();
  private usageSent = 0;
  private usageTimer: ReturnType<typeof setTimeout> | null = null;
  /** ChatGPT sign-ins for all agents a turn is refreshing now (`codexGrant`). */
  private readonly refreshing = new Map<string, { at: number; done: Promise<void>; resolve: () => void }>();

  constructor(private readonly opts: AccountManagerOptions) {
    this.log = opts.log ?? (() => {});
    if (opts.lending && opts.grokRoot) this.moveGrokFolders(opts.grokRoot);
  }

  /**
   * System mode: Grok Build's folders still under `root` go to `grokRoot`, owner and mode kept (what root wrote beside
   * them stays). One that can't move there stays, and reads as missing until it signs in again.
   */
  private moveGrokFolders(to: string) {
    const from = path.join(this.opts.root, "grok");
    let names: string[];
    try {
      names = readdirSync(from).filter((n) => isAccountId(n) && lstatSync(path.join(from, n)).isDirectory());
    } catch {
      return;
    }
    if (names.length === 0) return;
    try {
      mkdirSync(to, { recursive: true, mode: 0o755 });
      chmodSync(to, 0o755);
    } catch (err) {
      this.log(`grok accounts: couldn't make ${to} (${errnoCode(err) ?? "error"})`);
      return;
    }
    // ponytail: a rename only; across file systems the folder stays and its account signs in again.
    for (const id of names) {
      try {
        renameSync(path.join(from, id), path.join(to, id));
        this.log(`account ${id.slice(0, 8)} (grok) moved to ${to}`);
      } catch (err) {
        this.log(`account ${id.slice(0, 8)} (grok): couldn't move it to ${to} (${errnoCode(err) ?? "error"})`);
      }
    }
  }

  /** `own`: the computer's own sign-in, which never goes through the auth egress group. */
  private command(kind: AccountKind, own = false): string[] {
    const command = this.opts.commands?.[kind] ?? [COMMAND[kind]];
    const prefix = kind === "claude_code" && !own ? this.authPrefix() : null;
    if (!prefix) return command;
    // Resolved here: `setpriv` would look the CLI up on the PATH again, shared `bin/` included.
    const [file, ...pre] = command;
    const cli = resolveCommand(file ?? "", process.env.PATH);
    // A missing CLI under setpriv exits 127 instead of failing to start, which says "not installed".
    return isExecutable(cli) ? [...prefix, cli, ...pre] : [cli, ...pre];
  }

  private authEgressSaid: string[] | null | undefined;
  private authPrefix(): string[] | null {
    if (this.authEgressSaid === undefined) {
      this.authEgressSaid = this.opts.authEgress?.() ?? null;
      if (this.opts.authEgress && !this.authEgressSaid) {
        this.log("no agentes-auth group or setpriv here: Claude sign-ins leave by the computer's own route");
      }
    }
    return this.authEgressSaid;
  }

  /** Protocol 50 (`hello.authEgressGroup`): root's Claude CLIs on account folders run in the auth egress group. */
  authEgressGroup(): boolean {
    return this.authPrefix() !== null;
  }

  /** Where a kind's account folders are. */
  private kindRoot(kind: AccountKind) {
    return kind === "grok" && this.opts.grokRoot ? this.opts.grokRoot : path.join(this.opts.root, kind);
  }

  private dirOf(kind: AccountKind, id: string) {
    return path.join(this.kindRoot(kind), id);
  }

  /**
   * The folders above a kind's account folders, with their modes. System mode: an agent's user passes through to the
   * folder lent to it and lists nothing, except above Grok Build's, which its sandbox binds one by one.
   */
  private parents(kind: AccountKind): [string, number][] {
    const closed = this.opts.lending ? 0o711 : 0o700;
    const list: [string, number][] = [
      [this.opts.root, closed],
      [path.join(this.opts.root, kind), closed],
    ];
    if (kind === "grok" && this.opts.grokRoot) list.push([this.opts.grokRoot, 0o755]);
    return list;
  }

  private env(kind: AccountKind, dir: string): NodeJS.ProcessEnv {
    return accountEnv(kind, dir);
  }

  /**
   * A file root keeps beside a folder (`<id>.invalid`, `<id>.lent`, `<id>.shared`, `<id>.method`), out of reach of
   * whoever the folder is lent to.
   */
  private marker(kind: AccountKind, id: string, name: "invalid" | "lent" | "shared" | "method") {
    return path.join(this.opts.root, kind, `${id}.${name}`);
  }

  /** System mode: made for all agents, so root keeps it and never lends it. */
  private isShared(kind: AccountKind, id: string) {
    return this.opts.lending !== undefined && existsSync(this.marker(kind, id, "shared"));
  }

  /** System mode: the uid the folder is lent to now; 0 once it is root's again; null when it never was lent. */
  private lentTo(kind: AccountKind, id: string): number | null {
    try {
      const uid = Number(readFileSync(this.marker(kind, id, "lent"), "utf8").trim());
      return Number.isInteger(uid) && uid > 0 ? uid : 0;
    } catch {
      return null;
    }
  }

  /** What root wrote beside the folder when its sign-in began (protocol 50); null for an older folder. */
  private rawMethod(kind: AccountKind, id: string): string | null {
    try {
      return readFileSync(this.marker(kind, id, "method"), "utf8").trim();
    } catch {
      return null;
    }
  }

  /** The method its sign-in began with. */
  private keptMethod(kind: AccountKind, id: string): AuthMethod | null {
    const method = this.rawMethod(kind, id);
    if (method === CLI_SHARED) return "cli_login";
    return isAuthMethod(method) ? method : null;
  }

  /** Claude's own login for all agents: the CLI's store is its own user's. */
  isCliShared(kind: AccountKind, id: string) {
    return this.opts.lending !== undefined && isAccountId(id) && this.rawMethod(kind, id) === CLI_SHARED;
  }

  /**
   * Whether a turn may run on such a sign-in now. `off`: the switch went off or the self-check failed, and no CLI runs
   * on its store. `signed_out`: the provider refused it, until it signs in again.
   */
  cliSharedState(id: string): "ready" | "off" | "signed_out" {
    if (!this.opts.sharedLogin?.ready()) return "off";
    return existsSync(this.marker("claude_code", id, "invalid")) ? "signed_out" : "ready";
  }

  /** The argv of the Claude CLI behind `prefix`. A missing CLI must fail to start, not exit 127 behind the launcher. */
  sharedCommand(prefix: readonly string[]): string[] {
    const [file, ...pre] = this.opts.commands?.claude_code ?? [COMMAND.claude_code];
    const cli = resolveCommand(file ?? "", process.env.PATH);
    return isExecutable(cli) ? [...prefix, cli, ...pre] : [cli, ...pre];
  }

  /** The Claude CLI as the sign-in's own user, with the runner's proxies as root's own CLIs have them. */
  private sharedCli(id: string): { command: string[]; env: NodeJS.ProcessEnv; cwd: string } {
    const l = this.opts.sharedLogin?.launcher(id);
    if (!l) throw new RunnerError("unsupported", "This computer can't run this Claude sign-in");
    const env: NodeJS.ProcessEnv = { ...l.env };
    for (const k of NETWORK_ENV) if (process.env[k]) env[k] = process.env[k];
    return { command: this.sharedCommand(l.prefix), env, cwd: l.home };
  }

  /**
   * How an account signs in: what root wrote when its sign-in began, else what its look found for sure (a key, a
   * token root keeps, a CLI's sign-in that finished). Nothing when neither says it.
   */
  private authMethodOf(kind: AccountKind, id: string, info: RunnerAccountInfo): { authMethod?: AuthMethod } {
    const kept = this.keptMethod(kind, id);
    if (kept) return { authMethod: kept };
    if (info.keyHint) return { authMethod: "api_key" };
    const has = (file: string) => existsSync(path.join(this.dirOf(kind, id), file));
    if (kind === "claude_code" && this.isShared(kind, id)) return has(TOKEN_FILE) ? { authMethod: "setup_token" } : {};
    return kind === "opencode" || has(SIGNING_IN) ? {} : { authMethod: "cli_login" };
  }

  /**
   * Protocol 50 (`hello`): what a new Claude sign-in for all agents uses here. In system mode the CLI's own sign-in
   * needs its own user and mount view, offered only once the computer's self-check says they hold.
   */
  claudeLoginMethods(): AuthMethod[] {
    if (!this.opts.lending) return ["cli_login"];
    return this.opts.sharedLogin?.ready() ? ["setup_token", "cli_login"] : ["setup_token"];
  }

  /** Whether an account's folder is here (signing in again included). */
  has(id: string) {
    return isAccountId(id) && ACCOUNT_KINDS.some((k) => existsSync(this.dirOf(k, id)));
  }

  /** An account's folder for a brain turn; null when it isn't here (or is still signing in). */
  accountDir(kind: AccountKind, id: string): string | null {
    if (!isAccountKind(kind) || !isAccountId(id)) return null;
    if (this.logins.get(id)?.state === "waiting") return null;
    const dir = this.dirOf(kind, id);
    try {
      return statSync(dir).isDirectory() ? dir : null;
    } catch {
      return null;
    }
  }

  // ── Sign-in ────────────────────────────────────────────────────────────────

  /**
   * Starts the CLI's sign-in in a new folder named `loginId`, or (`again`) in
   * the existing account `loginId` that was signed out: same account, same
   * agents, and its folder stays if this sign-in fails. `email` (Claude Code):
   * the account to sign in to, as the CLI's login hint. `shared` (protocol 29,
   * system mode): a sign-in for every agent of its owner here, which root
   * keeps: Claude's through `claude setup-token` (no login hint there), a
   * plan's key as it is, ChatGPT's through `codex login` as root (`grant` hands its `auth.json` to each turn),
   * Gemini's through `agy acp --login` as root (each turn gets a copy of its sign-in file).
   * `method` (protocol 50, a Claude subscription sign-in): the one to use, or a refusal; never another one. The method
   * a sign-in uses is kept beside its folder (`<id>.method`), and signing in again another way is refused.
   */
  async begin(
    kind: AccountKind,
    loginId: string,
    again = false,
    email?: string,
    provider?: string,
    shared = false,
    method?: string,
  ): Promise<MachineReplies["account"]> {
    if (this.closed) throw new RunnerError("internal", "The runner is stopping");
    if (!isAccountKind(kind)) throw new RunnerError("bad_request", "Unknown account kind");
    if (!isAccountId(loginId)) throw new RunnerError("bad_request", "Invalid sign-in id");
    if (email !== undefined && (kind !== "claude_code" || provider !== undefined || !isLoginEmail(email))) {
      throw new RunnerError("bad_request", "That email can't name the account to sign in to");
    }
    if (method !== undefined) {
      if (!isClaudeLoginMethod(method) || kind !== "claude_code" || provider !== undefined) {
        throw new RunnerError("bad_request", "That sign-in method isn't one for this account");
      }
      if (method === "setup_token" && (!this.opts.lending || !shared)) {
        throw new RunnerError("bad_request", "A Claude token signs in here only for all agents of a shared computer");
      }
    }
    const canCliShare = this.opts.sharedLogin?.ready() === true;
    // An older server names no method: what the folder keeps stands.
    const keepsCliShare = method === undefined && again && this.isCliShared(kind, loginId);
    // Signing in again a one-agent folder for all agents starts over below, the setup-token way.
    if (
      !canCliShare &&
      this.opts.lending &&
      shared &&
      (keepsCliShare ||
        (method === "cli_login" &&
          (!again || (this.keptMethod(kind, loginId) === "cli_login" && this.isShared(kind, loginId)))))
    ) {
      throw new RunnerError(
        "unsupported",
        "This computer can't make a Claude sign-in for all agents with Claude's own login yet.",
      );
    }
    const cliKey: CliKeyProvider | null =
      kind === "cursor" && provider === CURSOR_KEY_PROVIDER
        ? CURSOR_KEY_PROVIDER
        : kind === "opencode" && provider === OPENCODE_KEY_PROVIDER
          ? OPENCODE_KEY_PROVIDER
          : null;
    const enterprise = kind === "antigravity" && provider === GEMINI_ENTERPRISE_PROVIDER;
    if (provider !== undefined && !cliKey && !enterprise && (kind !== "claude_code" || !isPlanId(provider))) {
      throw new RunnerError("bad_request", "This computer doesn't know that plan");
    }
    if (kind === "opencode" && !cliKey) {
      throw new RunnerError("bad_request", "OpenCode signs in with its API key");
    }
    // ADR 0143: elsewhere the CLI keeps every sign-in in the one keychain of the computer's user, so two accounts
    // would be one.
    if (kind === "antigravity" && (this.opts.platform ?? process.platform) !== "linux") {
      throw new RunnerError("bad_request", "Gemini accounts sign in on Linux computers only, for now.");
    }
    if (this.logins.get(loginId)?.state === "waiting") {
      throw new RunnerError("bad_request", "This sign-in already exists");
    }
    // Each one is a CLI waiting up to its TTL, and anyone in a workspace can start one on its shared computer.
    const running = [...this.logins.values()].filter((l) => l.state === "waiting" && (l.child || l.term)).length;
    if ((!provider || enterprise) && running >= SIGN_INS_AT_ONCE) {
      throw new RunnerError(
        "bad_request",
        "Too many sign-ins are in progress on this computer. Try again in a few minutes.",
      );
    }
    // Elsewhere every folder thinks for all of its owner's agents anyway.
    const forAll =
      this.opts.lending !== undefined &&
      shared &&
      (kind === "claude_code" || kind === "codex" || kind === "antigravity");
    const cliShared = forAll && canCliShare && (method === "cli_login" || keepsCliShare);
    const dir = this.dirOf(kind, loginId);
    if (again) {
      if (!existsSync(dir) || existsSync(path.join(dir, SIGNING_IN))) {
        throw new RunnerError("not_found", "That account is no longer on this computer");
      }
      const kept = this.keptMethod(kind, loginId);
      if (method && kept && kept !== method) throw new RunnerError("bad_request", "This account signs in another way");
      if (cliShared && existsSync(path.join(dir, TOKEN_FILE))) {
        throw new RunnerError("bad_request", "This account signs in another way");
      }
      // What an agent's user could write is never run or written by root, and a sign-in for all agents never
      // keeps one agent's login (nor the other way round): it starts over, as root's.
      if (this.lentTo(kind, loginId) !== null || forAll !== this.isShared(kind, loginId)) {
        await this.startOver(kind, loginId);
      }
    } else {
      if (this.logins.has(loginId) || ACCOUNT_KINDS.some((k) => existsSync(this.dirOf(k, loginId)))) {
        throw new RunnerError("bad_request", "This sign-in already exists");
      }
      if ((await this.list().catch(() => [])).length >= MAX_MACHINE_ACCOUNTS) {
        throw new RunnerError("bad_request", "This computer already has too many accounts. Remove one first.");
      }
    }
    // Claude Code and the Antigravity CLI: the key the browser seals the pasted code (or a plan's key) to; the private
    // half stays in memory.
    const pair = kind === "claude_code" || kind === "antigravity" || cliKey ? await generateSecretKeyPair() : undefined;
    if (!again) {
      for (const [d, mode] of this.parents(kind)) {
        await mkdir(d, { recursive: true, mode });
        await chmod(d, mode).catch(() => undefined);
      }
      // Not recursive: two sign-ins with one id can't both create it.
      await mkdir(dir, { mode: 0o700 }).catch((err: unknown) => {
        if (errnoCode(err) === "EEXIST") throw new RunnerError("bad_request", "This sign-in already exists");
        throw err;
      });
      await chmod(dir, 0o700).catch(() => undefined);
      // Until it signs in: a runner that dies mid sign-in leaves this behind, and the list skips (then clears) it.
      await writeFile(path.join(dir, SIGNING_IN), "", { mode: 0o600 });
    }
    // The method this sign-in uses; signing in again keeps it, unless an older server's sign-in changes it.
    const signsIn: AuthMethod | typeof CLI_SHARED = cliShared
      ? CLI_SHARED
      : cliKey || (provider && !enterprise)
        ? "api_key"
        : forAll && kind === "claude_code"
          ? "setup_token"
          : "cli_login";
    await writeFile(this.marker(kind, loginId, "method"), signsIn, { mode: 0o600 });
    if (cliKey && pair) return this.beginKey(kind, loginId, dir, cliKey, pair, again, false);
    if (provider && pair && !enterprise)
      return this.beginKey(kind, loginId, dir, provider as PlanId, pair, again, forAll);
    // Which Google sign-in the CLI asks for: a personal account's, or Gemini Enterprise's.
    if (kind === "antigravity") writeAgySettings(dir, enterprise ? "oauth-business" : "oauth-personal");

    const login: Login = {
      id: loginId,
      kind,
      dir,
      shared: forAll,
      ...(cliShared ? { cliShared } : {}),
      state: "waiting",
      output: "",
      ...(pair ? { privateKey: pair.privateKey } : {}),
      exited: false,
      startedAt: Date.now(),
      timer: null,
      again,
    };
    try {
      if (forAll && kind === "claude_code" && !cliShared) this.spawnInTerminal(login, ["setup-token"]);
      else if (kind === "antigravity") this.spawnInTerminal(login, LOGIN_ARGS.antigravity);
      else this.spawnLogin(login, email);
    } catch (err) {
      if (!again) await this.discard(kind, loginId);
      const why = err instanceof Error ? err.message : String(err);
      throw new RunnerError(
        "internal",
        errnoCode(err) === "ENOENT"
          ? `${LABEL[kind]} is not installed on this computer.`
          : `${LABEL[kind]} couldn't start: ${why}`,
      );
    }
    this.logins.set(loginId, login);
    login.timer = setTimeout(() => this.expire(login), this.opts.ttlMs ?? ACCOUNT_LOGIN_TTL_MS);
    login.timer.unref?.();

    const found = await new Promise<{ url: string; userCode?: string } | null>((resolve) => {
      const parse = (final: boolean) =>
        kind === "codex"
          ? parseCodexLogin(login.output, final)
          : kind === "grok"
            ? parseGrokLogin(login.output, final)
            : kind === "antigravity"
              ? toUrl(parseAgyLoginUrl(login.output, final))
              : kind === "cursor"
                ? toUrl(parseCursorLoginUrl(login.output, final))
                : toUrl(parseClaudeLoginUrl(this.shown(login), final));
      let done = false;
      const finish = (v: { url: string; userCode?: string } | null) => {
        if (done) return;
        done = true;
        clearTimeout(wait);
        login.watch = undefined;
        resolve(v);
      };
      const wait = setTimeout(() => finish(parse(true)), this.opts.beginWaitMs ?? ACCOUNT_BEGIN_WAIT_MS);
      wait.unref?.();
      login.watch = () => {
        if (login.exited || login.state !== "waiting") return finish(parse(true));
        const v = parse(false);
        if (v) finish(v);
      };
      login.watch();
    });
    if (!found || login.state !== "waiting") {
      const missing = login.spawnError === "ENOENT";
      const message = missing
        ? `${LABEL[kind]} is not installed on this computer.`
        : `${LABEL[kind]} didn't show a sign-in link. Update it, or add the account from the agentes app on this computer.`;
      this.log(`account sign-in ${loginId.slice(0, 8)} (${kind}) didn't start`);
      // Nobody polls a sign-in that never started.
      this.settle(login, "failed", message);
      this.logins.delete(loginId);
      await this.drop(login);
      throw new RunnerError("internal", message);
    }
    login.started = true;
    this.log(`account sign-in ${loginId.slice(0, 8)} (${kind}) started`);
    return {
      url: found.url,
      ...(found.userCode ? { userCode: found.userCode } : {}),
      ...(pair ? { publicKey: pair.publicKey } : {}),
    };
  }

  /** What a sign-in's CLI shows: its screen (`claude setup-token`), else what it printed. */
  private shown(login: Login) {
    return login.screen?.text() ?? login.output;
  }

  /** The CLI's own sign-in with plain pipes (`claude auth login`, `codex login --device-auth`). */
  private spawnLogin(login: Login, email?: string) {
    const { command, env, cwd } = login.cliShared
      ? this.sharedCli(login.id)
      : { command: this.command(login.kind), env: this.env(login.kind, login.dir), cwd: login.dir };
    const run = cliSpawn(command, [...LOGIN_ARGS[login.kind], ...(email ? ["--email", email] : [])], env.PATH);
    const child = spawn(run.file, run.args, {
      cwd,
      env: run.env ? { ...env, ...run.env } : env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      // Its own process group: a kill reaches what it started (posix).
      detached: process.platform !== "win32",
      windowsVerbatimArguments: run.windowsVerbatimArguments,
    });
    login.child = child;
    const onData = (chunk: string) => {
      login.output = (login.output + chunk).slice(-OUTPUT_KEEP);
      login.watch?.();
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.stdin?.on("error", () => {});
    const events = child as unknown as EventEmitter;
    events.on("error", (err: Error) => {
      login.spawnError = (err as NodeJS.ErrnoException).code ?? err.message;
      this.exited(login, null);
    });
    events.on("close", (code: number | null) => this.exited(login, code));
  }

  /**
   * A sign-in whose CLI needs a terminal of its own, in one. System mode's Claude sign-in for all agents
   * (`claude setup-token`) draws its screen only in a terminal: its link, and once signed in its token, are read off
   * that screen, the token taken as soon as it is whole, since the screen may be gone when the CLI ends: also before
   * each erase, as one piece read late can hold the token's last characters and the screen cleared after it. The
   * Antigravity CLI's `acp --login` reads the pasted code only from its terminal (with none it says "no controlling
   * terminal; cannot complete interactive login", 1.5.3): what it prints is read as it comes.
   */
  private spawnInTerminal(login: Login, args: readonly string[]) {
    const [file, ...pre] = this.command(login.kind);
    const env: NodeJS.ProcessEnv = { ...this.env(login.kind, login.dir), TERM: "xterm-256color" };
    // Held by the sign-in only, so the token on it goes once the sign-in settles.
    if (login.kind === "claude_code") {
      const screen = new Screen(undefined, () => {
        login.token ??= parseSetupToken(screen.text()) ?? undefined;
      });
      login.screen = screen;
    }
    const decoder = new TextDecoder();
    let eof: () => void = () => undefined;
    const lastOutput = new Promise<void>((resolve) => {
      eof = resolve;
    });
    const proc = Bun.spawn([resolveCommand(file ?? "", env.PATH), ...pre, ...args], {
      cwd: login.dir,
      env,
      terminal: {
        ...(login.screen ? TOKEN_TERMINAL : LOGIN_TERMINAL),
        data: (_t, bytes) => {
          if (login.state !== "waiting") return;
          const text = decoder.decode(bytes, { stream: true });
          const mode = text.match(PASTE_MODE)?.at(-1);
          if (mode) login.brackets = mode.endsWith("h");
          const screen = login.screen;
          if (screen) {
            screen.write(text);
            login.token ??= parseSetupToken(screen.text()) ?? undefined;
          } else login.output = (login.output + text).slice(-OUTPUT_KEEP);
          login.watch?.();
        },
        exit: () => eof(),
      },
    });
    login.term = {
      pid: proc.pid,
      kill: (signal) => proc.kill(signal),
      write: (text) => {
        try {
          proc.terminal?.write(text);
        } catch {
          // it ended
        }
      },
    };
    void proc.exited.then(
      async (code) => {
        await Promise.race([lastOutput, sleep(LAST_OUTPUT_MS)]);
        try {
          proc.terminal?.close();
        } catch {
          // closed already
        }
        this.exited(login, proc.signalCode === null ? code : null);
      },
      () => this.exited(login, null),
    );
  }

  /** A key account's sign-in: nothing runs; it waits for the plan's key, sealed to `pair`. */
  private beginKey(
    kind: AccountKind,
    loginId: string,
    dir: string,
    provider: PlanId | CliKeyProvider,
    pair: { publicKey: string; privateKey: string },
    again: boolean,
    shared: boolean,
  ): MachineReplies["account"] {
    const login: Login = {
      id: loginId,
      kind,
      dir,
      shared,
      provider,
      state: "waiting",
      output: "",
      privateKey: pair.privateKey,
      exited: true,
      startedAt: Date.now(),
      timer: null,
      again,
    };
    this.logins.set(loginId, login);
    login.timer = setTimeout(() => this.expire(login), this.opts.ttlMs ?? ACCOUNT_LOGIN_TTL_MS);
    login.timer.unref?.();
    this.log(`account key ${loginId.slice(0, 8)} (${provider}) waiting`);
    return { publicKey: pair.publicKey };
  }

  /**
   * System mode, signing in again where an agent's user had the folder, or for all agents where it was one
   * agent's (or the other way round): root takes it back and empties it. A sign-in with its own user loses that user
   * and its store with it.
   */
  private async startOver(kind: AccountKind, id: string) {
    const dir = this.dirOf(kind, id);
    await this.serial(id, async () => {
      if (this.isCliShared(kind, id)) this.opts.sharedLogin?.remove(id);
      if (this.lentTo(kind, id)) await this.reclaimNow(kind, id);
      for (const name of await readdir(dir)) await rm(path.join(dir, name), { recursive: true, force: true });
      await rm(this.marker(kind, id, "lent"), { force: true });
      await rm(this.marker(kind, id, "shared"), { force: true });
    });
  }

  /** The code the person pasted (Claude Code) or a plan's key, sealed to this sign-in's key: written to the CLI, or kept. */
  async code(loginId: string, aad: string, box: WireSecretBox): Promise<void> {
    const login = this.waiting(loginId);
    const cliKey = login.provider === CURSOR_KEY_PROVIDER || login.provider === OPENCODE_KEY_PROVIDER;
    if ((login.kind !== "claude_code" && login.kind !== "antigravity" && !cliKey) || !login.privateKey) {
      throw new RunnerError("bad_request", "This sign-in doesn't take a code");
    }
    const org = this.opts.orgId?.();
    const a = String(aad ?? "");
    // Without a known organization (an older pairing), the AAD must still name this sign-in.
    const fits = org
      ? a === accountCodeAad(loginId, org)
      : a.startsWith(`${loginId}|`) && a.endsWith("|account") && a.split("|").length === 3;
    if (!fits) throw new RunnerError("bad_request", "The code doesn't match its sign-in");
    let code: string;
    try {
      code = (await openSecret(login.privateKey, box, a)).trim();
    } catch {
      throw new RunnerError("bad_request", "The code couldn't be opened (wrong key or altered on the way)");
    }
    if (login.provider === CURSOR_KEY_PROVIDER || login.provider === OPENCODE_KEY_PROVIDER) {
      return this.keepCliKey(login, login.provider, code);
    }
    if (login.provider) return this.keepKey(login, login.provider, code);
    if (!code || code.length > MAX_CODE_CHARS || /[\r\n]/.test(code)) {
      throw new RunnerError("bad_request", "That doesn't look like a sign-in code");
    }
    login.code = code;
    if (login.term) {
      // As a terminal sends a paste, then Enter. Claude Code's screen takes it wrapped in bracketed-paste marks (typed
      // one key at a time, a code starting with "c" would copy the link instead, the screen's shortcut while its
      // field holds only that letter). Another CLI gets the marks only once it turned them on, as from a terminal:
      // a prompt that never asked for them would read them as part of the code.
      const wrap = login.kind === "claude_code" || login.brackets === true;
      login.term.write(wrap ? `${ESC}[200~${code}${ESC}[201~` : code);
      const enter = setTimeout(() => {
        if (login.state === "waiting") login.term?.write("\r");
      }, PASTE_ENTER_MS);
      enter.unref?.();
      return;
    }
    try {
      login.child?.stdin?.write(`${code}\n`);
    } catch {
      throw new RunnerError("internal", `${LABEL[login.kind]} stopped waiting for the code`);
    }
  }

  /** Whether an account thinks for all of its owner's agents: every one where they are the runner's own user. */
  private sharedFlag(kind: AccountKind, id: string): { shared?: true } {
    return !this.opts.lending || this.isShared(kind, id) ? { shared: true } : {};
  }

  /** A Cursor or OpenCode API key, kept in the folder (600, written whole): the account thinks with it. Never logged. */
  private async keepCliKey(login: Login, provider: CliKeyProvider, key: string) {
    const { file, label } = CLI_KEYS[provider];
    if (!CURSOR_KEY.test(key))
      throw new RunnerError("bad_request", `That doesn't look like ${label}. Copy the whole key.`);
    writeJson(path.join(login.dir, file), { key });
    await rm(path.join(login.dir, SIGNING_IN), { force: true });
    await rm(this.marker(login.kind, login.id, "invalid"), { force: true });
    const info: RunnerAccountInfo = {
      id: login.id,
      kind: login.kind,
      loggedIn: true,
      provider,
      keyHint: key.slice(-4),
      authMethod: "api_key",
      ...this.sharedFlag(login.kind, login.id),
    };
    this.settle(login, "done");
    login.account = info;
    this.added(info);
    this.log(`account ${login.id.slice(0, 8)} (${provider} key) kept`);
  }

  /** A plan's key, checked and kept in the folder (600, written whole): the account is signed in. Never logged. */
  private async keepKey(login: Login, provider: PlanId, key: string) {
    const plan = planOf(provider);
    if (!plan || !key || key.length > MAX_KEY_CHARS || !planKeyFits(plan, key)) {
      throw new RunnerError(
        "bad_request",
        `That doesn't look like a ${plan?.label ?? "plan"} key. Copy the whole key.`,
      );
    }
    writeJson(path.join(login.dir, PROVIDER_FILE), { provider, key });
    if (login.shared) await writeFile(this.marker(login.kind, login.id, "shared"), "", { mode: 0o600 });
    await rm(path.join(login.dir, SIGNING_IN), { force: true });
    await rm(this.marker(login.kind, login.id, "invalid"), { force: true });
    const info: RunnerAccountInfo = {
      id: login.id,
      kind: login.kind,
      loggedIn: true,
      provider,
      keyHint: key.slice(-4),
      authMethod: "api_key",
      ...this.sharedFlag(login.kind, login.id),
    };
    this.settle(login, "done");
    login.account = info;
    this.added(info);
    this.log(`account ${login.id.slice(0, 8)} (${provider} key) kept`);
  }

  /** Where a sign-in is: `waiting`, `done` (with the account), `failed` or `expired` (why: `code`, the CLI's words). */
  status(loginId: string): MachineReplies["account"] {
    const login = this.logins.get(loginId);
    if (!login) throw new RunnerError("not_found", "This sign-in is gone (it expired or was canceled)");
    if (login.state === "waiting" && Date.now() - login.startedAt > (this.opts.ttlMs ?? ACCOUNT_LOGIN_TTL_MS)) {
      this.expire(login);
    }
    return {
      state: login.state,
      ...(login.account ? { account: login.account } : {}),
      ...(login.error ? { error: login.error } : {}),
      ...(login.failure ? { code: login.failure } : {}),
      ...(login.said ? { message: login.said } : {}),
    };
  }

  /** Stops a sign-in and removes its folder; false when there was nothing to stop. */
  async cancel(loginId: string): Promise<boolean> {
    const login = this.logins.get(loginId);
    if (!login) return false;
    if (login.state !== "waiting") return false;
    this.failWith(login, "failed", "canceled", "Canceled");
    await this.drop(login);
    return true;
  }

  private waiting(loginId: string): Login {
    const login = this.logins.get(loginId);
    if (!login) throw new RunnerError("not_found", "This sign-in is gone (it expired or was canceled)");
    if (login.state !== "waiting") throw new RunnerError("bad_request", "This sign-in already ended");
    return login;
  }

  private expire(login: Login) {
    if (login.state !== "waiting") return;
    this.failWith(login, "expired", "timeout", "The sign-in took too long. Start again.");
    void this.drop(login);
  }

  /**
   * The CLI exited: its status command in that folder says whether it signed in; `claude setup-token`, the token
   * it showed.
   */
  private exited(login: Login, code: number | null) {
    if (login.exited) return;
    login.exited = true;
    login.watch?.();
    if (login.state !== "waiting") return;
    void (async () => {
      if (login.screen) {
        const token = parseSetupToken(this.shown(login), true) ?? login.token;
        if (code === 0 && token && (await this.keepToken(login, token))) return;
        if (code === 0 && login.state === "waiting") {
          this.failWith(
            login,
            "failed",
            "no_token",
            `${LABEL[login.kind]} finished, but didn't show its token. Update it, or try again.`,
          );
        }
      } else if (code === 0) {
        // Signed in anew: a turn refused before (`refused`) says nothing about this sign-in.
        await rm(this.marker(login.kind, login.id, "invalid"), { force: true }).catch(() => undefined);
        const status: { said?: string } = {};
        const info = await this.lookUp(login.kind, login.id, status);
        if (login.state !== "waiting") return;
        const sandbox =
          info.loggedIn && !info.statusUnknown && login.kind === "grok"
            ? (this.opts.grokSandbox?.(login.dir) ?? null)
            : null;
        if (sandbox) {
          this.failWith(
            login,
            "failed",
            "sandbox",
            `${LABEL.grok} signed in, but its sandbox can't start on this computer for an agent (${sandbox}).`,
            sandbox,
          );
        } else if (info.loggedIn && !info.statusUnknown) {
          const unshared =
            login.shared && login.kind === "antigravity" ? await this.agyCopyFails(login.id, login.dir) : null;
          // Signed in again, the folder now holds that sign-in, which no agent can think with: signed out for all.
          if (unshared && !unshared.unsure && login.again) await this.refused(login.kind, login.id);
          if (login.state !== "waiting") return;
          if (!unshared) {
            await rm(path.join(login.dir, SIGNING_IN), { force: true }).catch(() => undefined);
            // A ChatGPT or Gemini sign-in for all agents: root's alone from now on (`grant`).
            if (login.shared) {
              await writeFile(this.marker(login.kind, login.id, "shared"), "", { mode: 0o600 });
              info.shared = true;
            }
            this.settle(login, "done");
            login.account = info;
            this.added(info);
            this.log(`account ${login.id.slice(0, 8)} (${login.kind}) signed in`);
            return;
          }
          if (unshared.unsure) {
            this.failWith(
              login,
              "failed",
              "status_unknown",
              `${LABEL[login.kind]} signed in, but ${unshared.why}, so this computer couldn't tell whether it can think for every agent here. Try again.`,
              unshared.said,
            );
          } else {
            this.failWith(
              login,
              "failed",
              "not_kept",
              `${LABEL[login.kind]} signed in, but ${unshared.why}, so it can't think for every agent here. Use a Gemini API key instead.`,
              unshared.said,
            );
            // The server hears it now: the list it has may still say signed in.
            if (login.again) {
              this.invalidate();
              void this.refresh(true).catch(() => undefined);
            }
          }
        } else if (info.statusUnknown) {
          this.failWith(
            login,
            "failed",
            "status_unknown",
            `${LABEL[login.kind]} finished, but didn't say whether the account is signed in. Try again.`,
          );
        } else {
          this.failWith(
            login,
            "failed",
            "not_signed_in_after_login",
            `${LABEL[login.kind]} finished, but the account isn't signed in. Try again.`,
            status.said,
          );
        }
      }
      if (login.state === "waiting") {
        const printed = this.printed(login);
        const said = saidIn(printed);
        if (login.spawnError === "ENOENT") {
          this.failWith(login, "failed", "not_installed", `${LABEL[login.kind]} is not installed on this computer.`);
        } else {
          this.failWith(
            login,
            "failed",
            loginFailureOf(printed),
            `${LABEL[login.kind]} couldn't sign in${login.code ? " with that code" : ""}${said ? `: ${said}` : ""}`,
            said,
          );
        }
      }
      if (!login.again && login.started) await this.discard(login.kind, login.id).catch(() => undefined);
    })();
  }

  /**
   * A Gemini sign-in for all agents, tried the way each turn gets it: a copy in an empty home (`.check` in root's
   * folder) that the CLI lists models with. Null when it does; otherwise why not, and the CLI's words. `unsure`: the
   * try said nothing for sure (no answer in time, a copy that couldn't be written, an error that isn't the CLI asking
   * for a sign-in), so another try may pass.
   */
  private async agyCopyFails(id: string, dir: string): Promise<{ why: string; said?: string; unsure?: true } | null> {
    const signIn = await this.agySignIn(id);
    if (!signIn) return { why: `kept that sign-in where this computer can't copy it (no ${AGY_SIGN_IN_FILE})` };
    const check = path.join(dir, ".check");
    try {
      await rm(check, { recursive: true, force: true });
      placeAgySignIn(check, signIn);
      const r = await runCli(
        this.command("antigravity"),
        STATUS_ARGS.antigravity,
        this.env("antigravity", check),
        this.opts.statusTimeoutMs ?? STATUS_TIMEOUT_MS,
      );
      if (r.status === null) return { why: "a copy of that sign-in didn't answer in time", unsure: true };
      const text = stripAnsi(`${r.stdout}\n${r.stderr}`);
      if (parseAgyStatus(r.status, text, signIn.type).loggedIn) return null;
      const said = saidIn(withoutTokens(text));
      const words = said ? { said } : {};
      if (!AGY_SIGN_IN_WORDS.test(text)) {
        return { why: "a copy of that sign-in didn't say whether it signs in", unsure: true, ...words };
      }
      return { why: "a copy of that sign-in doesn't sign in", ...words };
    } catch (err) {
      return { why: `a copy of that sign-in couldn't be made (${errnoCode(err) ?? "error"})`, unsure: true };
    } finally {
      await rm(check, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * `claude setup-token` signed in: its token is kept (600, written whole) in root's folder, which thinks for every
   * agent of its owner here from now on. False when it couldn't be kept.
   */
  private async keepToken(login: Login, token: string): Promise<boolean> {
    try {
      writeJson(path.join(login.dir, TOKEN_FILE), { token });
      await writeFile(this.marker(login.kind, login.id, "shared"), "", { mode: 0o600 });
    } catch (err) {
      if (login.state === "waiting") {
        this.failWith(
          login,
          "failed",
          "not_kept",
          `${LABEL[login.kind]} signed in, but this computer couldn't keep it (${errnoCode(err) ?? "error"}).`,
        );
      }
      return false;
    }
    await rm(path.join(login.dir, SIGNING_IN), { force: true }).catch(() => undefined);
    // Signed in anew: a turn refused before (`refused`) says nothing about this token.
    await rm(this.marker(login.kind, login.id, "invalid"), { force: true }).catch(() => undefined);
    if (login.state !== "waiting") return true;
    const info: RunnerAccountInfo = {
      id: login.id,
      kind: login.kind,
      loggedIn: true,
      shared: true,
      authMethod: "setup_token",
    };
    this.settle(login, "done");
    login.account = info;
    this.added(info);
    this.log(`account ${login.id.slice(0, 8)} (${login.kind}, for all agents) signed in`);
    return true;
  }

  /**
   * What a sign-in's CLI printed, without tokens or the pasted code: a CLI may repeat what it refused, and a screen
   * shows it in its field.
   */
  private printed(login: Login): string {
    const code = login.code;
    return withoutTokens(stripAnsi(this.shown(login)))
      .split("\n")
      .filter((l) => !code || !(l.includes(code) || l.includes(encodeURIComponent(code))))
      .join("\n");
  }

  /** A sign-in that ended without signing in: why (`failure`, the CLI's own words), for people (`error`), logged. */
  private failWith(
    login: Login,
    state: "failed" | "expired",
    failure: AccountLoginFailure,
    error: string,
    said?: string,
  ) {
    this.settle(login, state, error);
    login.failure = failure;
    if (said) login.said = said;
    this.log(`account sign-in ${login.id.slice(0, 8)} (${login.kind}) ${state}: ${failure}${said ? `: ${said}` : ""}`);
  }

  private settle(login: Login, state: AccountLoginState, error?: string) {
    login.state = state;
    if (error) login.error = error;
    login.privateKey = undefined;
    login.code = undefined;
    login.token = undefined;
    login.screen = undefined;
    if (login.timer) clearTimeout(login.timer);
    login.timer = setTimeout(() => {
      if (this.logins.get(login.id) === login) this.logins.delete(login.id);
    }, this.opts.finishedKeepMs ?? ACCOUNT_FINISHED_KEEP_MS);
    login.timer.unref?.();
  }

  /** Kills a sign-in's CLI and removes its folder (the entry stays for `status` until it is cleaned up). */
  private async drop(login: Login) {
    const child = login.child ?? login.term;
    if (child && !login.exited) {
      killTree(child, "SIGTERM");
      const t = setTimeout(() => {
        if (!login.exited) killTree(child, "SIGKILL");
      }, 3000);
      t.unref?.();
    }
    if (!login.again) await this.discard(login.kind, login.id).catch(() => undefined);
  }

  /** A new sign-in that didn't finish: its folder goes, with what root wrote beside it. */
  private async discard(kind: AccountKind, id: string) {
    if (this.isCliShared(kind, id)) this.opts.sharedLogin?.remove(id);
    await rm(this.dirOf(kind, id), { recursive: true, force: true });
    await rm(this.marker(kind, id, "method"), { force: true });
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  /** Each account's last conclusive `loggedIn`, for a look that says nothing for sure (`statusUnknown`). */
  private readonly knownLoggedIn = new Map<string, boolean>();

  /**
   * One account's status and how it signs in (never throws). A look that says nothing for sure keeps the last
   * conclusive answer, else signed in when a sign-in finished in its folder: only the CLI saying so, or a refusal,
   * signs it out. `status.said`: what its CLI said, when one ran.
   */
  private async lookUp(kind: AccountKind, id: string, status?: { said?: string }): Promise<RunnerAccountInfo> {
    const looked = await this.look(kind, id, status);
    const info = { ...looked, ...this.authMethodOf(kind, id, looked) };
    if (!info.statusUnknown) {
      this.knownLoggedIn.set(id, info.loggedIn);
      return info;
    }
    const known = this.knownLoggedIn.get(id) ?? !existsSync(path.join(this.dirOf(kind, id), SIGNING_IN));
    return { ...info, loggedIn: known };
  }

  /**
   * One account's status as it looks now. Refused in a turn since it last signed in
   * (`refused`), it is signed out whatever its CLI says. Otherwise a key account is signed in; a token root keeps,
   * while it has one; a folder an agent's user had, as its turns last said, with the plan Claude Code keeps there
   * (that user could write it, so it is only ever one of the plans' words); any other, as its CLI says.
   */
  private async look(kind: AccountKind, id: string, out?: { said?: string }): Promise<RunnerAccountInfo> {
    const dir = this.dirOf(kind, id);
    const refused = existsSync(this.marker(kind, id, "invalid"));
    const shared = this.sharedFlag(kind, id);
    const plan = kind === "claude_code" ? await planKeyOf(dir) : null;
    if (plan) return { id, kind, loggedIn: !refused, provider: plan.provider, keyHint: plan.key.slice(-4), ...shared };
    const cursorKey = kind === "cursor" ? await cursorKeyOf(dir) : null;
    if (cursorKey) {
      return { id, kind, loggedIn: !refused, provider: CURSOR_KEY_PROVIDER, keyHint: cursorKey.slice(-4), ...shared };
    }
    if (kind === "opencode") {
      // Its key is its only sign-in: no key, signed out (its CLI is never asked).
      const key = await opencodeKeyOf(dir);
      return key
        ? { id, kind, loggedIn: !refused, provider: OPENCODE_KEY_PROVIDER, keyHint: key.slice(-4), ...shared }
        : { id, kind, loggedIn: false, ...shared };
    }
    const cliShared = this.isCliShared(kind, id);
    // ChatGPT's and Gemini's for all agents hold only what root and its CLI wrote there (`keepCodexAuth`): their CLI
    // says, below.
    if (this.isShared(kind, id) && kind === "claude_code" && !cliShared) {
      return { id, kind, loggedIn: !refused && (await tokenOf(dir)) !== null, ...shared };
    }
    if (refused || this.lentTo(kind, id) !== null) {
      const kept = refused || kind !== "claude_code" ? undefined : claudeKeptPlan(dir);
      return { id, kind, loggedIn: !refused, ...(kept ? { plan: kept } : {}), ...shared };
    }
    // With the switch off or the self-check failing, no CLI runs on its store: it stays as last known.
    if (cliShared && !this.opts.sharedLogin?.ready())
      return { id, kind, loggedIn: false, statusUnknown: true, ...shared };
    const r = await this.serial(
      id,
      async () => {
        const { command, env } = cliShared
          ? this.sharedCli(id)
          : { command: this.command(kind), env: this.env(kind, dir) };
        return runCli(command, STATUS_ARGS[kind], env, this.opts.statusTimeoutMs ?? STATUS_TIMEOUT_MS);
      },
      this.cliOps,
    ).catch((err: unknown): CliResult => ({ status: null, stdout: "", stderr: String(err) }));
    if (out) out.said = saidIn(withoutTokens(stripAnsi(`${r.stdout}\n${r.stderr}`)));
    // Codex says it on stderr.
    const status =
      kind === "claude_code"
        ? parseClaudeStatus(r.status, r.stdout, () => claudeTier(dir))
        : kind === "cursor"
          ? parseCursorStatus(r.status, `${r.stdout}\n${r.stderr}`)
          : kind === "grok"
            ? parseGrokStatus(r.status, `${r.stdout}\n${r.stderr}`, existsSync(path.join(dir, "auth.json")))
            : kind === "antigravity"
              ? parseAgyStatus(r.status, `${r.stdout}\n${r.stderr}`, agyAuthOf(dir))
              : parseCodexStatus(r.status, `${r.stdout}\n${r.stderr}`);
    if (kind === "grok" && status.loggedIn) this.keepGrokModels(parseGrokModels(r.stdout));
    // Timed out, or didn't start.
    const unknown = r.status === null ? { statusUnknown: true as const } : {};
    return { id, kind, ...status, ...unknown, ...shared };
  }

  private grokList: CursorModelInfo[] | undefined;
  private get grokModelsFile() {
    return path.join(this.opts.root, GROK_MODELS_FILE);
  }

  /**
   * The models Grok Build last listed for an account signed in here (its status look runs `grok models` in that
   * account's folder), kept across restarts: a folder lent to an agent is never looked at again. Undefined before one.
   */
  grokModels(): CursorModelInfo[] | undefined {
    if (this.grokList === undefined) {
      const kept = readSmallJson(this.grokModelsFile, 64 * 1024);
      const list = Array.isArray(kept) ? kept.filter((m): m is CursorModelInfo => typeof m?.id === "string") : [];
      this.grokList = list.length > 0 ? list : undefined;
    }
    return this.grokList;
  }

  private keepGrokModels(list: CursorModelInfo[]) {
    if (list.length === 0 || JSON.stringify(list) === JSON.stringify(this.grokModels())) return;
    this.grokList = list;
    try {
      writeJson(this.grokModelsFile, list);
    } catch {
      // kept in memory until the next look
    }
    this.changed();
  }

  private async lookAll(): Promise<RunnerAccountInfo[]> {
    const found: { kind: AccountKind; id: string }[] = [];
    for (const kind of ACCOUNT_KINDS) {
      // No folder yet: no accounts. Any other failure fails the look (the server must never read it as "none left").
      const entries = await readdir(this.kindRoot(kind), { withFileTypes: true }).catch((err: unknown) => {
        if (errnoCode(err) === "ENOENT") return [];
        throw err;
      });
      for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        if (!e.isDirectory() || !isAccountId(e.name)) continue;
        // A new account still signing in isn't one yet; one signing in again still is (listed as it is now).
        const login = this.logins.get(e.name);
        if (login?.state === "waiting" && !login.again) continue;
        // A sign-in that never finished (the runner stopped meanwhile): not an account; gone once it would have
        // expired. A folder lent to an agent was signed in (and is never removed from under it here).
        const marker = path.join(this.dirOf(kind, e.name), SIGNING_IN);
        const started = this.lentTo(kind, e.name) === null ? await lstat(marker).catch(() => null) : null;
        if (started) {
          if (Date.now() - started.mtimeMs > ACCOUNT_LOGIN_TTL_MS) {
            await this.discard(kind, e.name).catch(() => undefined);
          }
          continue;
        }
        found.push({ kind, id: e.name });
      }
    }
    return Promise.all(found.slice(0, MAX_MACHINE_ACCOUNTS).map((a) => this.lookUp(a.kind, a.id)));
  }

  /** Every account on this machine with its status and usage (cached for `ACCOUNTS_TTL_MS`). */
  async list(): Promise<RunnerAccountInfo[]> {
    if (this.cache && Date.now() - this.cache.at <= (this.opts.listTtlMs ?? ACCOUNTS_TTL_MS)) {
      return this.withUsage(this.cache.value);
    }
    return this.withUsage(await this.refresh());
  }

  /** A fresh look (one at a time). `announce`: tell the observer even when nothing changed (the server may think otherwise). */
  refresh(announce = false): Promise<RunnerAccountInfo[]> {
    if (announce) this.announce = true;
    if (this.listing) return this.listing;
    const run = this.lookAll()
      .then((value) => {
        if (this.listing === run) {
          const changed = JSON.stringify(value) !== JSON.stringify(this.cache?.value ?? []);
          this.cache = { at: Date.now(), value };
          if (changed || this.announce) this.changed();
          this.announce = false;
        }
        return value;
      })
      .finally(() => {
        if (this.listing === run) this.listing = null;
      });
    this.listing = run;
    return run;
  }

  /** For `hello`: the last known list (a stale one is looked again in the background); undefined before the first look. */
  snapshot(): RunnerAccountInfo[] | undefined {
    if (!this.cache || Date.now() - this.cache.at > (this.opts.listTtlMs ?? ACCOUNTS_TTL_MS)) {
      this.refresh().catch(() => undefined);
    }
    return this.cache ? this.withUsage(this.cache.value) : undefined;
  }

  /**
   * The next `list` asks the CLIs again (an account turned out signed out in a turn). A look still running may have read
   * before the change, so its answer is never kept (nor announced) for the list's whole TTL.
   */
  invalidate() {
    if (this.cache) this.cache = { ...this.cache, at: 0 };
    this.listing = null;
  }

  private added(info: RunnerAccountInfo) {
    if (this.cache) this.cache = { ...this.cache, value: [...this.cache.value.filter((a) => a.id !== info.id), info] };
    this.listing = null;
    this.changed();
  }

  /** Signs the account out (best effort) and deletes its folder. */
  async remove(kind: AccountKind, id: string): Promise<boolean> {
    if (!isAccountKind(kind)) throw new RunnerError("bad_request", "Unknown account kind");
    if (!isAccountId(id)) throw new RunnerError("bad_request", "Invalid account id");
    const login = this.logins.get(id);
    if (login?.state === "waiting") return this.cancel(id);
    const dir = this.dirOf(kind, id);
    const markers = () =>
      Promise.all([
        rm(this.marker(kind, id, "invalid"), { force: true }),
        rm(this.marker(kind, id, "lent"), { force: true }),
        rm(this.marker(kind, id, "shared"), { force: true }),
        rm(this.marker(kind, id, "method"), { force: true }),
      ]);
    if (!existsSync(dir)) {
      await markers();
      return false;
    }
    const lent = this.lentTo(kind, id) !== null;
    // A key has no sign-in to end, nor has a token on this computer (only Claude's settings revoke it); a folder an
    // agent's user had is never run as root (deleting it is the sign-out).
    if (this.isCliShared(kind, id)) await this.removeCliShared(id);
    else if (lent) await this.serial(id, () => this.reclaimNow(kind, id));
    else if (
      !this.isShared(kind, id) &&
      !(kind === "claude_code" && (await planKeyOf(dir))) &&
      !(kind === "cursor" && (await cursorKeyOf(dir))) &&
      kind !== "opencode"
    ) {
      const r = await runCli(this.command(kind), LOGOUT_ARGS[kind], this.env(kind, dir), STATUS_TIMEOUT_MS);
      if (r.status !== 0) this.log(`account ${id.slice(0, 8)} (${kind}): sign-out didn't finish; removing it anyway`);
    }
    await rm(dir, { recursive: true, force: true });
    await markers();
    if (this.cache) this.cache = { ...this.cache, value: this.cache.value.filter((a) => a.id !== id) };
    this.usage.delete(id);
    this.knownLoggedIn.delete(id);
    this.listing = null;
    this.log(`account ${id.slice(0, 8)} (${kind}) removed`);
    this.changed();
    return true;
  }

  /** Signs out as the sign-in's user when its CLI may run here; its store and user go either way. */
  private async removeCliShared(id: string) {
    if (this.opts.sharedLogin?.ready()) {
      const r = await Promise.resolve()
        .then(() => {
          const { command, env } = this.sharedCli(id);
          return runCli(command, LOGOUT_ARGS.claude_code, env, STATUS_TIMEOUT_MS);
        })
        .catch(() => null);
      if (r?.status !== 0)
        this.log(`account ${id.slice(0, 8)} (claude_code): sign-out didn't finish; removing it anyway`);
    }
    this.opts.sharedLogin?.remove(id);
  }

  private changed() {
    try {
      this.opts.onChange?.();
    } catch {
      // an observer never breaks the manager
    }
  }

  /**
   * A turn in this account was refused by its endpoint (`not_logged_in`): it reads as signed out until a new key or
   * sign-in. The endpoint decides, not the CLI's status: a CLI may judge by the credentials it keeps, which can still
   * look signed in after the provider ended that sign-in (another login of the same account, ADR 0059 §2), and root
   * never asks one about a folder an agent's user had (system mode).
   */
  async refused(kind: AccountKind, id: string) {
    if (!isAccountKind(kind) || !isAccountId(id) || !existsSync(this.dirOf(kind, id))) return;
    await writeFile(this.marker(kind, id, "invalid"), "", { mode: 0o600 }).catch(() => undefined);
  }

  // ── System mode: folders lent to agents' users ────────────────────────────

  private readonly folderOps = new Map<string, Promise<unknown>>();
  /**
   * An account's status look and usage probe, one at a time: two CLI processes on one sign-in race on refreshing
   * its credentials.
   */
  private readonly cliOps = new Map<string, Promise<unknown>>();

  /** One change of a folder's owner at a time (`ops`: another chain of one-at-a-time work). */
  private serial<T>(id: string, fn: () => Promise<T>, ops = this.folderOps): Promise<T> {
    const run = (ops.get(id) ?? Promise.resolve()).catch(() => undefined).then(fn);
    ops.set(id, run);
    void run
      .finally(() => {
        if (ops.get(id) === run) ops.delete(id);
      })
      .catch(() => undefined);
    return run;
  }

  /**
   * System mode (protocol 29): what a turn of any agent thinking with this account gets from root, over its
   * worker link: its token, its key or a copy of its CLI's sign-in, or `none` while it has none or a turn's endpoint
   * refused it. Null for an account made for one agent, whose folder is lent instead (`lendTo`).
   */
  async grant(kind: AccountKind, id: string): Promise<AccountGrant | null> {
    if (!isAccountKind(kind) || !isAccountId(id) || !this.isShared(kind, id)) return null;
    // Signing in again keeps what it has until the new one is kept: only a refusal, or nothing kept, is signed out.
    if (existsSync(this.marker(kind, id, "invalid"))) return { kind: "none" };
    if (this.isCliShared(kind, id)) return { kind: "hosted" };
    const dir = this.dirOf(kind, id);
    if (kind === "codex") return this.codexGrant(id, dir);
    if (kind === "antigravity") {
      const signIn = await this.agySignIn(id);
      return signIn ? { kind: "agy_auth", ...signIn } : { kind: "none" };
    }
    const plan = await planKeyOf(dir);
    if (plan) return { kind: "key", provider: plan.provider, key: plan.key };
    const token = await tokenOf(dir);
    return token ? { kind: "token", token } : { kind: "none" };
  }

  /**
   * Root's Gemini sign-in for all agents, read once root's own CLI is done in its folder (`cliOps`): the status look and
   * `/usage` refresh the file in place, and a read meanwhile could find half of it.
   */
  private agySignIn(id: string): Promise<AgySignIn | null> {
    return this.serial(id, async () => agySignInOf(this.dirOf("antigravity", id)), this.cliOps);
  }

  /**
   * Root's newest copy of a ChatGPT sign-in for all agents. Copies used at once are fine until one is due for its
   * refresh, which rotates the refresh token and leaves the other copies' refresh refused: the first turn then takes
   * it alone, and the others wait (at most `CODEX_REFRESH_WAIT_MS`) for its refreshed copy (`keepCodexAuth`).
   */
  private async codexGrant(id: string, dir: string): Promise<AccountGrant> {
    const now = this.opts.now ?? Date.now;
    let auth = readCodexAuth(dir);
    if (auth && now() - auth.refreshedAt >= CODEX_REFRESH_AFTER_MS) {
      const held = this.refreshing.get(id);
      if (held && now() - held.at < CODEX_REFRESH_WAIT_MS) {
        await Promise.race([held.done, sleep(Math.max(0, CODEX_REFRESH_WAIT_MS - (now() - held.at)))]);
        auth = readCodexAuth(dir);
      } else {
        let resolve = () => {};
        const done = new Promise<void>((r) => {
          resolve = r;
        });
        this.refreshing.set(id, { at: now(), done, resolve });
      }
    }
    return auth ? { kind: "codex_auth", auth: auth.text } : { kind: "none" };
  }

  /**
   * A refreshed copy of a ChatGPT sign-in for all agents, from the worker of an agent whose turn thinks with it:
   * kept when it signs in to the same ChatGPT account and looks like a refresh (a newer `last_refresh`, not in the
   * future, with a rotated refresh token). The agent's shell writes that file too, so a copy dated years ahead would
   * otherwise stick and refuse every genuine refresh after it. True when kept.
   */
  keepCodexAuth(id: string, text: unknown): boolean {
    if (!isAccountId(id) || !this.isShared("codex", id)) return false;
    const next = codexAuthOf(text);
    const dir = this.dirOf("codex", id);
    const now = readCodexAuth(dir);
    if (!next || !now || next.accountId !== now.accountId || next.refreshedAt <= now.refreshedAt) return false;
    if (next.refreshedAt > (this.opts.now ?? Date.now)() + CODEX_CLOCK_SKEW_MS) return false;
    if (next.refreshToken === now.refreshToken) return false;
    writeJson(path.join(dir, CODEX_AUTH_FILE), JSON.parse(next.text));
    const held = this.refreshing.get(id);
    this.refreshing.delete(id);
    held?.resolve();
    this.log(`account ${id.slice(0, 8)} (codex, for all agents) refreshed`);
    return true;
  }

  /**
   * A brain turn of the agent whose OS user is `uid` thinks with this account: its folder becomes that user's
   * (700), taken back from any other agent first. False when it isn't here, still signing in, or made for all
   * agents (root keeps that one, `grant`).
   */
  async lendTo(kind: AccountKind, id: string, uid: number): Promise<boolean> {
    const chown = this.opts.lending?.chown;
    if (!chown || !Number.isInteger(uid) || uid <= 0) return false;
    const dir = this.accountDir(kind, id);
    if (!dir || this.isShared(kind, id) || (await lstat(path.join(dir, SIGNING_IN)).catch(() => null))) return false;
    return this.serial(id, async () => {
      const now = this.lentTo(kind, id);
      if (now === uid) return true;
      if (now) await this.reclaimNow(kind, id);
      for (const [d, mode] of this.parents(kind)) await chmod(d, mode);
      // Marked before the first chown: a folder an agent's user may have written to never runs as root again.
      await writeFile(this.marker(kind, id, "lent"), String(uid), { mode: 0o600 });
      await chownTree(dir, uid, chown);
      this.log(`account ${id.slice(0, 8)} (${kind}) lent to uid ${uid}`);
      return true;
    });
  }

  private async reclaimNow(kind: AccountKind, id: string) {
    const chown = this.opts.lending?.chown;
    if (!chown) return;
    await chownTree(this.dirOf(kind, id), 0, chown);
    await writeFile(this.marker(kind, id, "lent"), "0", { mode: 0o600 });
    this.log(`account ${id.slice(0, 8)} (${kind}) back to root`);
  }

  /**
   * The `agents` frame (system mode): `uids` maps each account an agent thinks with to that agent's uid. A
   * folder lent to any other user goes back to root now, so an agent never keeps another's sign-in.
   */
  async keepLent(uids: ReadonlyMap<string, number>) {
    if (!this.opts.lending) return;
    for (const kind of ACCOUNT_KINDS) {
      const entries = await readdir(path.join(this.opts.root, kind)).catch(() => [] as string[]);
      for (const name of entries) {
        const id = name.endsWith(".lent") ? name.slice(0, -5) : "";
        if (!isAccountId(id)) continue;
        const uid = this.lentTo(kind, id);
        if (!uid || uids.get(id) === uid) continue;
        await this.serial(id, async () => {
          if (this.lentTo(kind, id) === uid) await this.reclaimNow(kind, id);
        }).catch((err: unknown) =>
          this.log(
            `account ${id.slice(0, 8)}: couldn't take it back (${err instanceof Error ? err.message : String(err)})`,
          ),
        );
      }
    }
  }

  // ── Usage (protocol 19) ────────────────────────────────────────────────────

  private withUsage(list: RunnerAccountInfo[]): RunnerAccountInfo[] {
    return list.map((a) => {
      const usage = this.usage.get(a.id);
      return usage ? { ...a, usage } : a;
    });
  }

  /** The usage of the computer's own sign-ins, as far as known. */
  ownUsage(): OwnPlanUsage {
    const out: OwnPlanUsage = {};
    for (const kind of ACCOUNT_KINDS) {
      const usage = this.usage.get(OWN_USAGE_ID[kind]);
      if (usage) out[kind] = usage;
    }
    return out;
  }

  /** A Claude Code turn's `rate_limit_event` (`rate_limit_info`), for an account id or `OWN_USAGE_ID.claude_code`. */
  noteRateLimit(key: string, info: unknown) {
    const prev = this.usage.get(key);
    const next = withRateLimit(prev, info);
    if (next) this.noted(key, prev, next);
  }

  /** Codex's `account/rateLimits/updated` during a turn (`rateLimits`), for an account id or `OWN_USAGE_ID.codex`. */
  noteCodexRateLimits(key: string, rateLimits: unknown) {
    const next = codexUsage(rateLimits, "turn");
    if (next) this.noted(key, this.usage.get(key), next);
  }

  /** What a turn said: the server hears it at most every `USAGE_NOTIFY_MS`, at once when people should know. */
  private noted(key: string, prev: PlanUsage | undefined, next: PlanUsage) {
    this.usage.set(key, next);
    const wait = (this.opts.usageNotifyMs ?? USAGE_NOTIFY_MS) - (Date.now() - this.usageSent);
    if (usageCrossed(prev, next) || wait <= 0) return this.usageChanged();
    this.usageTimer ??= setTimeout(() => this.usageChanged(), wait);
    this.usageTimer.unref?.();
  }

  private usageChanged() {
    if (this.usageTimer) clearTimeout(this.usageTimer);
    this.usageTimer = null;
    this.usageSent = Date.now();
    this.changed();
  }

  /**
   * `list.fresh`: these accounts' (ids or `OWN_USAGE_ID`s) usage is looked up now, in the background, at most
   * `USAGE_PROBES_AT_ONCE` at a time; one known for less than `USAGE_TTL_MS`, or whose provider asked us to
   * wait, isn't. Each result reaches the server at once (a person is looking).
   */
  probeUsage(ids: readonly string[], recheck: readonly string[] = []) {
    const now = Date.now();
    const own = Object.values(OWN_USAGE_ID);
    for (const id of ids.slice(0, MAX_MACHINE_ACCOUNTS + own.length)) {
      if (!isAccountId(id) && !own.includes(id)) continue;
      if (this.probeQueue.includes(id) || this.probing.has(id) || (this.backoff.get(id) ?? 0) > now) continue;
      const token = recheck.includes(id);
      // A token's check goes by its own clock: a plain look at it (which reads nothing) doesn't put it off.
      const asked = (token ? this.tokenChecked : this.probed).get(id) ?? 0;
      const known = Math.max(Date.parse(this.usage.get(id)?.at ?? "") || 0, asked);
      const ttl = token ? (this.opts.tokenCheckTtlMs ?? TOKEN_RECHECK_MS) : (this.opts.usageTtlMs ?? USAGE_TTL_MS);
      if (now - known < ttl) continue;
      if (token) {
        this.tokenChecks.add(id);
        this.tokenChecked.set(id, now);
      }
      this.probeQueue.push(id);
    }
    this.nextProbes();
  }

  private nextProbes() {
    while (!this.closed && this.probing.size < USAGE_PROBES_AT_ONCE && this.probeQueue.length > 0) {
      const id = this.probeQueue.shift() as string;
      this.probing.add(id);
      this.probed.set(id, Date.now());
      void this.serial(id, () => this.probeOne(id), this.cliOps)
        .catch(() => null)
        .then((found) => {
          if (found === "backoff") this.backoff.set(id, Date.now() + USAGE_BACKOFF_MS);
          else if (found && !this.closed) {
            this.usage.set(id, found);
            this.usageChanged();
          }
        })
        .finally(() => {
          this.probing.delete(id);
          this.nextProbes();
        });
    }
  }

  private async probeOne(id: string): Promise<PlanUsage | "backoff" | null> {
    const timeoutMs = this.opts.usageTimeoutMs;
    const own = ACCOUNT_KINDS.find((k) => OWN_USAGE_ID[k] === id);
    // The computer's own sign-in runs from the runner's home, never a project of the person's.
    const target = own
      ? { kind: own, cwd: path.dirname(this.opts.root), env: process.env }
      : ACCOUNT_KINDS.flatMap((k) => {
          const dir = this.accountDir(k, id);
          return dir ? [{ kind: k, cwd: dir, env: this.env(k, dir) }] : [];
        })[0];
    if (!target) return null;
    const limits = timeoutMs ? { timeoutMs } : {};
    if (!own && this.isCliShared(target.kind, id)) {
      return this.opts.sharedLogin?.ready() ? probeClaudeUsage({ ...this.sharedCli(id), ...limits }) : null;
    }
    const plan = own || target.kind !== "claude_code" ? null : await planKeyOf(target.cwd);
    if (plan) {
      return fetchPlanKeyUsage(plan.provider, plan.key, {
        ...limits,
        ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
      });
    }
    // A token makes model requests only: its usage comes from its turns, or, stuck at its limit, from one check on the
    // cheapest model the server asked for (`list.recheck`). Gemini's for all agents is its CLI's own.
    const shared = this.isShared(target.kind, id) && target.kind !== "antigravity";
    const check = this.tokenChecks.delete(id);
    if (!own && check && shared && target.kind === "claude_code" && this.lentTo(target.kind, id) === null) {
      const token = await tokenOf(target.cwd);
      if (!token) return null;
      return checkClaudeToken(
        {
          command: this.command("claude_code"),
          cwd: target.cwd,
          env: { ...target.env, ...TOKEN_FD_ENV },
          fd3: token,
          ...limits,
        },
        this.usage.get(id),
      );
    }
    if (!own && (this.lentTo(target.kind, id) !== null || shared)) return null;
    const probe = { command: this.command(target.kind, Boolean(own)), cwd: target.cwd, env: target.env, ...limits };
    // Cursor's CLI reports no plan usage: its turns' `usage` is all there is.
    // Nor does OpenCode's: its key's usage is on OpenCode's console. Grok Build shows its plan's only in its TUI.
    if (target.kind === "cursor" || target.kind === "opencode" || target.kind === "grok") return null;
    // The Antigravity CLI answers `/usage` itself in print mode: the plan's quotas and when they refresh.
    if (target.kind === "antigravity") {
      if (own) return null;
      const r = await runCli(probe.command, ["-p", "/usage"], probe.env, timeoutMs ?? STATUS_TIMEOUT_MS);
      return r.status === 0 ? antigravityUsage(r.stdout, "probe") : null;
    }
    return target.kind === "codex" ? probeCodexUsage(probe) : probeClaudeUsage(probe);
  }

  /** The runner is exiting: sign-ins in progress stop and their folders go. */
  async close() {
    this.closed = true;
    if (this.usageTimer) clearTimeout(this.usageTimer);
    this.probeQueue.length = 0;
    const waiting = [...this.logins.values()].filter((l) => l.state === "waiting");
    for (const l of waiting) this.settle(l, "failed", "The runner stopped");
    await Promise.all(waiting.map((l) => this.drop(l)));
    for (const l of this.logins.values()) if (l.timer) clearTimeout(l.timer);
    this.logins.clear();
  }
}
