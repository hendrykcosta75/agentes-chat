// A fake `claude` / `codex` for account tests: signs in to the folder in
// $CLAUDE_CONFIG_DIR / $CODEX_HOME, printing what Claude Code 2.1.304 and
// Codex 0.163.0 print (escapes and the OSC 8 hyperlink included). The file
// `signed-in` in that folder is the sign-in.
// $FAKE_ACCOUNT_MODE: "silent" prints nothing and waits; "fail" refuses.
// $FAKE_ACCOUNT_CODE: the Claude code it accepts (default "good-code").
// $FAKE_ACCOUNT_LOG: one JSON line per run (args, the folder, `terminal` when it runs in one, `authGroup` when
// $FAKE_AUTH_GROUP is set: the test's stand-in for the auth egress prefix; `asUser` when $FAKE_ACCOUNT_USER is set: its
// stand-in for running as the sign-in's own user).
// $FAKE_ACCOUNT_STATUS: "garbage" makes `auth status` answer no JSON; "org" adds the Claude organization.
// $FAKE_ACCOUNT_STATUS_DELAY: `auth status` answers after that many ms (and logs `done` then).
// `auth login --email <address>` signs in like `auth login` (the address is only the account
// to offer). With $ANTHROPIC_API_KEY set, `auth status` says it is signed in with that key, as
// Claude Code does whatever the folder holds. `setup-token` draws Claude Code 2.1.314's screen
// in its terminal (words apart by cursor moves, the link in an OSC 8 hyperlink), takes the code
// as a terminal pastes it, and on success shows a token drawn in two pieces, as a screen that
// redraws only what changed does; "notoken" signs in but shows none.
import { appendFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2).join(" ");
// Each reads only its own variable, as the real CLIs do (`auth …` is Claude Code, the rest Codex): a
// CLAUDE_CONFIG_DIR inherited from the shell (set when tests run inside Claude Code) must not move Codex's folder.
const claude = args.startsWith("auth ") || args === "setup-token";
const home = (claude ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME) ?? "";
const marker = path.join(home, "signed-in");
const mode = process.env.FAKE_ACCOUNT_MODE ?? "";
const log = process.env.FAKE_ACCOUNT_LOG;
if (log)
  appendFileSync(
    log,
    `${JSON.stringify({ args, home, ...(process.stdin.isTTY ? { terminal: true } : {}), ...(process.env.FAKE_AUTH_GROUP ? { authGroup: true } : {}), ...(process.env.FAKE_ACCOUNT_USER ? { asUser: true } : {}) })}\n`,
  );

const ESC = "\x1b";
const CLAUDE_URL =
  "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=org%3Acreate_api_key+user%3Ainference&code_challenge=x&code_challenge_method=S256&state=st4te";

const end = (code, text = "", stream = process.stdout) => stream.write(text, () => process.exit(code));
const waitForever = () => setInterval(() => {}, 1000);
/** Words at their columns, as the real screen draws them (`ESC[<n>G` between words). */
const drawn = (text, from = 2) => {
  let col = from;
  return text
    .split(" ")
    .map((word) => {
      const at = `${ESC}[${col}G${word}`;
      col += word.length + 1;
      return at;
    })
    .join("");
};
const FAKE_TOKEN = "sk-ant-oat01-fake-token-for-tests-only";

switch (args.replace(/^auth login --email \S+$/, "auth login")) {
  case "setup-token": {
    if (mode === "silent") {
      waitForever();
      break;
    }
    const url = CLAUDE_URL.replace("org%3Acreate_api_key+user%3Ainference", "user%3Ainference");
    process.stdout.write(
      [
        `${ESC}7${ESC}[r${ESC}8${ESC}[?25l${ESC}[38;5;174m${drawn("Welcome to Claude Code", 1)}${ESC}[39m`,
        "",
        `${ESC}[1m${drawn("This will guide you through long-lived (1-year) auth token setup for your Claude account.")}${ESC}[22m`,
        "",
        `${ESC}[38;5;246mBrowser didn't open? Use the url below to sign in (c to copy)${ESC}[39m`,
        "",
        `${ESC}]8;id=1n4uec;${url}\x07${ESC}[38;5;246m${url}${ESC}[39m${ESC}]8;;\x07`,
        "",
        `${drawn("Paste code here if prompted >")}`,
      ].join("\r\n"),
    );
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      // The terminal's paste markers, and the echo the terminal adds, aside.
      const code = line.replaceAll(`${ESC}[200~`, "").replaceAll(`${ESC}[201~`, "").trim();
      if (mode === "fail" || code !== (process.env.FAKE_ACCOUNT_CODE ?? "good-code")) {
        end(1, `\r\n${drawn("OAuth error: Invalid code")} ${code}\r\n`);
        return;
      }
      if (mode === "notoken") {
        end(0, `\r\n${drawn("Long-lived authentication token created successfully!")}\r\n`);
        return;
      }
      const cut = 20;
      const screen = [
        "",
        `${ESC}[32m${drawn("✓ Long-lived authentication token created successfully!")}${ESC}[39m`,
        "",
        drawn("Your OAuth token (valid for 1 year):"),
        "",
        `${ESC}[33m${ESC}[2G${FAKE_TOKEN.slice(0, cut)}${ESC}[${2 + cut}G${FAKE_TOKEN.slice(cut)}${ESC}[39m`,
        "",
        `${ESC}[2m${drawn("Store this token securely. You won't be able to see it again.")}${ESC}[22m`,
        "",
        `${ESC}[2m${drawn("Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>")}${ESC}[22m`,
        "",
      ].join("\r\n");
      // In two writes, cut inside the token's line: what was read so far shows half a token. The screen goes away
      // as the CLI ends, in the same write as the token's rest: what a reader that falls behind gets in one piece.
      const half = screen.indexOf(FAKE_TOKEN.slice(cut));
      process.stdout.write(screen.slice(0, half));
      setTimeout(() => end(0, `${screen.slice(half)}${ESC}[2J${ESC}[H`), 100);
    });
    break;
  }
  case "auth login": {
    if (mode === "silent") {
      waitForever();
      break;
    }
    process.stdout.write("Opening browser to sign in…\n");
    process.stdout.write(
      `If the browser didn't open, visit: ${ESC}]8;;${CLAUDE_URL}${ESC}\\${CLAUDE_URL}${ESC}]8;;${ESC}\\\n`,
    );
    process.stdout.write("Paste code here if prompted > ");
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      const code = line.trim();
      if (mode !== "fail" && code === (process.env.FAKE_ACCOUNT_CODE ?? "good-code")) {
        writeFileSync(marker, "");
        end(0, "\nLogin successful.\n");
        return;
      }
      // Repeats the code it refused (the runner must not pass it on).
      end(1, `\nOAuth error: invalid code ${code}\n`);
    });
    break;
  }
  case "login --device-auth": {
    if (mode === "silent") {
      waitForever();
      break;
    }
    process.stdout.write(
      [
        "",
        `Welcome to Codex [v${ESC}[90m0.163.0${ESC}[0m]`,
        `${ESC}[90mOpenAI's command-line coding agent${ESC}[0m`,
        "",
        "Follow these steps to sign in with ChatGPT using device code authorization:",
        "",
        "1. Open this link in your browser and sign in to your account",
        `   ${ESC}[94mhttps://auth.openai.com/codex/device${ESC}[0m`,
        "",
        `2. Enter this one-time code ${ESC}[90m(expires in 15 minutes)${ESC}[0m`,
        `   ${ESC}[94m7HYC-J6JGM${ESC}[0m`,
        "",
        `${ESC}[90mDevice codes are a common phishing target. Never share this code.${ESC}[0m`,
        "",
      ].join("\n"),
    );
    // The person enters the code elsewhere; Codex finishes by itself.
    setTimeout(
      () => {
        if (mode === "fail") return end(1, "Error logging in: device code expired\n", process.stderr);
        writeFileSync(marker, "");
        writeFileSync(
          path.join(home, "auth.json"),
          JSON.stringify({
            auth_mode: "chatgpt",
            OPENAI_API_KEY: null,
            tokens: {
              id_token: "fake-id",
              access_token: "fake-access",
              refresh_token: "fake-refresh-1",
              account_id: "acct-fake",
            },
            last_refresh: process.env.FAKE_CODEX_REFRESHED ?? new Date().toISOString(),
          }),
        );
        end(0, "Successfully logged in\n", process.stderr);
      },
      Number(process.env.FAKE_CODEX_DELAY ?? 300),
    );
    break;
  }
  case "auth status --json": {
    const status = process.env.FAKE_ACCOUNT_STATUS ?? "";
    const org = status === "org" ? { orgId: "0193aaaa-0000-7000-8000-00000000000a", orgName: "Ada\u0007 Labs" } : {};
    const answer = () => {
      if (status === "garbage") end(0, "Something went wrong\n");
      else if (process.env.ANTHROPIC_API_KEY) end(0, `${JSON.stringify({ loggedIn: true, authMethod: "api_key" })}\n`);
      else if (existsSync(marker)) {
        end(
          0,
          `${JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "dev@acme.test", subscriptionType: "max", ...org })}\n`,
        );
      } else end(1, `${JSON.stringify({ loggedIn: false, authMethod: "none" })}\n`);
    };
    const delay = Number(process.env.FAKE_ACCOUNT_STATUS_DELAY ?? 0);
    if (!delay) answer();
    else {
      setTimeout(() => {
        if (log) appendFileSync(log, `${JSON.stringify({ args, home, done: true })}\n`);
        answer();
      }, delay);
    }
    break;
  }
  case "login status":
    if (existsSync(marker)) end(0, "Logged in using ChatGPT\n", process.stderr);
    else end(1, "Not logged in\n", process.stderr);
    break;
  case "auth logout":
  case "logout":
    rmSync(marker, { force: true });
    end(0, "Successfully logged out\n");
    break;
  default:
    end(2, `unknown command: ${args}\n`, process.stderr);
}
