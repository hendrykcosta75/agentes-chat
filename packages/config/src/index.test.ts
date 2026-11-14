import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { ConfigError, envVars, loadConfig, mcpCallerIdentity, redactConfig, testConfig } from "./index";
import { parseFirebaseServiceAccount, parsePemKey } from "./pem";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  AGENTES_SECRET: "x".repeat(48),
};

/** A VAPID pair as the env takes it: the uncompressed public point and the private `d`, base64url. */
function vapidPair() {
  const jwk = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x ?? "", "base64url"),
    Buffer.from(jwk.y ?? "", "base64url"),
  ]);
  return { WEB_PUSH_VAPID_PUBLIC_KEY: point.toString("base64url"), WEB_PUSH_VAPID_PRIVATE_KEY: jwk.d ?? "" };
}

describe("loadConfig", () => {
  test("applies defaults", () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.RUN_MIGRATIONS_ON_BOOT).toBe(true);
    expect(config.ALLOW_SIGNUP).toBe(false);
    expect(config.AGENT_DEFAULT_MODEL).toBe("claude-sonnet-5-5");
    expect(config.ROUTER_MODEL).toBe("claude-haiku-5-5");
    expect(config.AGENT_MAX_HOPS).toBe(100);
    expect(config.S3_PATH_STYLE).toBe(false);
    expect(config.MILLIONSEND_API_URL).toBe("https://api.millionsend.com");
    // Unset: the email senders use ping@ on the host of PUBLIC_URL.
    expect(config.EMAIL_FROM).toBeUndefined();
  });

  test("FILES_DIR must be absolute; SMTP_URL must be smtp:// or smtps://", () => {
    expect(loadConfig({ ...valid, FILES_DIR: "/data/files" }).FILES_DIR).toBe("/data/files");
    expect(() => loadConfig({ ...valid, FILES_DIR: "data/files" })).toThrow(/FILES_DIR/);
    expect(loadConfig({ ...valid, SMTP_URL: "smtps://u:p@smtp.example.com:465" }).SMTP_URL).toBe(
      "smtps://u:p@smtp.example.com:465",
    );
    expect(() => loadConfig({ ...valid, SMTP_URL: "https://smtp.example.com" })).toThrow(/SMTP_URL/);
    // An unencoded / in the password (AWS SES passwords are base64) fails here, not inside nodemailer at boot.
    const unencoded = "smtps://AKIA:abc/def+ghi@email-smtp.us-east-1.amazonaws.com:465";
    expect(() => loadConfig({ ...valid, SMTP_URL: unencoded })).toThrow(/SMTP_URL: .*percent-encoded/);
    expect(loadConfig({ ...valid, SMTP_URL: "smtp://u:abc%2Fdef@smtp.example.com:587" }).SMTP_URL).toBe(
      "smtp://u:abc%2Fdef@smtp.example.com:587",
    );
  });

  test("agentes.chat's own servers have their legal links without extra settings", () => {
    const app = loadConfig({ ...valid, PUBLIC_URL: "https://app.agentes.chat" });
    expect(app.TERMS_URL).toBe("https://app.agentes.chat/terms");
    expect(app.PRIVACY_URL).toBe("https://app.agentes.chat/privacy");
    expect(loadConfig({ ...valid, PUBLIC_URL: "https://agentes.chat" }).TERMS_URL).toBe("https://agentes.chat/terms");
    const selfHosted = loadConfig({ ...valid, PUBLIC_URL: "https://chat.example.com" });
    expect([selfHosted.TERMS_URL, selfHosted.PRIVACY_URL]).toEqual([undefined, undefined]);
  });

  test("agentes.chat's own servers send from ping@agentes.chat, whichever of its addresses they are at", () => {
    for (const site of ["https://app.agentes.chat", "https://agentes.chat"]) {
      expect(loadConfig({ ...valid, PUBLIC_URL: site }).EMAIL_FROM).toBe("agentes.chat <ping@agentes.chat>");
    }
    const set = loadConfig({ ...valid, PUBLIC_URL: "https://app.agentes.chat", EMAIL_FROM: "ops@agentes.chat" });
    expect(set.EMAIL_FROM).toBe("ops@agentes.chat");
    // Elsewhere it stays unset: the sender is ping@ on the host of PUBLIC_URL.
    expect(loadConfig({ ...valid, PUBLIC_URL: "https://chat.example.com" }).EMAIL_FROM).toBeUndefined();
  });

  test("treats empty strings as unset", () => {
    expect(loadConfig({ ...valid, PORT: "" }).PORT).toBe(3000);
  });

  test("parses booleans and numbers", () => {
    const config = loadConfig({ ...valid, PORT: "8080", ALLOW_SIGNUP: "true", AGENT_MAX_HOPS: "5" });
    expect(config.PORT).toBe(8080);
    expect(config.ALLOW_SIGNUP).toBe(true);
    expect(config.AGENT_MAX_HOPS).toBe(5);
  });

  test("reports every problem at once", () => {
    try {
      loadConfig({ PORT: "nope" });
      throw new Error("expected ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).issues.join("\n");
      expect(issues).toContain("DATABASE_URL is required");
      expect(issues).toContain("AGENTES_SECRET is required");
      expect(issues).toContain("PORT:");
    }
  });

  test("rejects a short secret and a non-postgres URL", () => {
    expect(() => loadConfig({ ...valid, AGENTES_SECRET: "short" })).toThrow(/AGENTES_SECRET/);
    expect(() => loadConfig({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
  });

  test("job slots: the quick ones leave agents' runs some; a ceiling, when set, is above where they start", () => {
    const config = loadConfig(valid);
    expect([
      config.OUTBOX_MAX_IN_FLIGHT,
      config.OUTBOX_QUICK_SLOTS,
      config.OUTBOX_MAX_IN_FLIGHT_CEILING,
      config.DATABASE_POOL_MAX,
    ]).toEqual([48, 12, undefined, 20]);
    expect(() => loadConfig({ ...valid, OUTBOX_MAX_IN_FLIGHT: "12" })).toThrow(/OUTBOX_QUICK_SLOTS must be below/);
    expect(loadConfig({ ...valid, OUTBOX_MAX_IN_FLIGHT: "4", OUTBOX_QUICK_SLOTS: "0" }).OUTBOX_QUICK_SLOTS).toBe(0);
    expect(loadConfig({ ...valid, OUTBOX_MAX_IN_FLIGHT: "120" }).OUTBOX_MAX_IN_FLIGHT).toBe(120);
    expect(() => loadConfig({ ...valid, OUTBOX_MAX_IN_FLIGHT_CEILING: "40" })).toThrow(/CEILING can't be below/);
    expect(loadConfig({ ...valid, OUTBOX_MAX_IN_FLIGHT_CEILING: "48" }).OUTBOX_MAX_IN_FLIGHT_CEILING).toBe(48);
  });

  test("a worker process runs jobs only, on a PostgreSQL database", () => {
    expect(loadConfig(valid).SERVER_ROLE).toBe("all");
    expect(loadConfig({ ...valid, SERVER_ROLE: "worker" }).SERVER_ROLE).toBe("worker");
    expect(() => loadConfig({ ...valid, SERVER_ROLE: "web" })).toThrow(/SERVER_ROLE/);
    expect(() => loadConfig({ ...valid, SERVER_ROLE: "worker", DATABASE_URL: "pglite:///data/db" })).toThrow(
      /SERVER_ROLE=worker needs a PostgreSQL/,
    );
  });

  test("rejects malformed model ids", () => {
    expect(() => loadConfig({ ...valid, AGENT_DEFAULT_MODEL: "Claude Sonnet" })).toThrow(/AGENT_DEFAULT_MODEL/);
  });

  test("external provisioning needs the operator API, which serves its requests, and no computer of the server's own", () => {
    expect(loadConfig(valid).MACHINE_PROVISIONING).toBe("off");
    expect(() => loadConfig({ ...valid, MACHINE_PROVISIONING: "external" })).toThrow(/OPERATOR_API_TOKEN/);
    const token = "t".repeat(32);
    const external = { ...valid, MACHINE_PROVISIONING: "external", OPERATOR_API_TOKEN: token };
    expect(loadConfig(external).MACHINE_PROVISIONING).toBe("external");
    expect(() => loadConfig({ ...external, HOST_COMPUTER_TOKEN: "h".repeat(32) })).toThrow(/HOST_COMPUTER_TOKEN/);
    expect(loadConfig({ ...valid, HOST_COMPUTER_TOKEN: "h".repeat(32) }).HOST_COMPUTER_TOKEN).toBe("h".repeat(32));
  });

  test("the operator API's read-only token: optional, long, secret, only with the full token and never equal to it", () => {
    const full = "o".repeat(32);
    const read = "r".repeat(32);
    expect(loadConfig({ ...valid, OPERATOR_API_TOKEN: full }).OPERATOR_API_READ_TOKEN).toBeUndefined();
    const both = loadConfig({ ...valid, OPERATOR_API_TOKEN: full, OPERATOR_API_READ_TOKEN: read });
    expect(both.OPERATOR_API_READ_TOKEN).toBe(read);
    expect(redactConfig(both).OPERATOR_API_READ_TOKEN).toBe("********");
    expect(() => loadConfig({ ...valid, OPERATOR_API_TOKEN: full, OPERATOR_API_READ_TOKEN: full })).toThrow(
      /OPERATOR_API_READ_TOKEN must differ from OPERATOR_API_TOKEN/,
    );
    expect(() => loadConfig({ ...valid, OPERATOR_API_READ_TOKEN: read })).toThrow(
      /OPERATOR_API_READ_TOKEN needs OPERATOR_API_TOKEN/,
    );
    expect(() => loadConfig({ ...valid, OPERATOR_API_TOKEN: full, OPERATOR_API_READ_TOKEN: "short" })).toThrow(
      /OPERATOR_API_READ_TOKEN: must be at least 32 characters/,
    );
  });

  test("MCP_CALLER_IDENTITY: host=secret pairs, a bare lower-case host and a long secret, each host once, never shown", () => {
    const secret = "s".repeat(32);
    const padded = `${"p".repeat(30)}==`;
    expect(loadConfig(valid).MCP_CALLER_IDENTITY).toBeUndefined();
    expect(mcpCallerIdentity(loadConfig({ ...valid, MCP_CALLER_IDENTITY: "" })).size).toBe(0);
    const two = loadConfig({ ...valid, MCP_CALLER_IDENTITY: `tools.example.com=${secret},mcp.example.org=${padded}` });
    expect([...mcpCallerIdentity(two)]).toEqual([
      ["tools.example.com", secret],
      ["mcp.example.org", padded],
    ]);
    expect(redactConfig(two).MCP_CALLER_IDENTITY).toBe("********");
    for (const malformed of [
      `tools.example.com=${"s".repeat(31)}`,
      `Tools.example.com=${secret}`,
      `https://tools.example.com=${secret}`,
      `tools.example.com:8443=${secret}`,
      `tools.example.com/mcp=${secret}`,
      `tools.example.com.=${secret}`,
      `tools.example.com=${secret}, mcp.example.org=${secret}`,
      `tools.example.com=${secret},`,
      "tools.example.com",
      secret,
    ]) {
      expect(() => loadConfig({ ...valid, MCP_CALLER_IDENTITY: malformed })).toThrow(
        /MCP_CALLER_IDENTITY: must be host=secret pairs/,
      );
    }
    const twice = () =>
      loadConfig({ ...valid, MCP_CALLER_IDENTITY: `tools.example.com=${secret},tools.example.com=${padded}` });
    expect(twice).toThrow(/MCP_CALLER_IDENTITY: names a host more than once/);
    // A refusal names the setting, never what it holds.
    try {
      twice();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  test("billing: the address and the link's secret together, the hold on new workspaces only with them and the operator API", () => {
    const off = loadConfig(valid);
    expect([off.BILLING_URL, off.BILLING_LINK_SECRET, off.BILLING_HOLD_NEW_WORKSPACES]).toEqual([
      undefined,
      undefined,
      false,
    ]);
    const secret = "b".repeat(32);
    const billing = { ...valid, BILLING_URL: "https://billing.example.com", BILLING_LINK_SECRET: secret };
    expect(loadConfig(billing).BILLING_URL).toBe("https://billing.example.com");
    expect(() => loadConfig({ ...valid, BILLING_URL: "https://billing.example.com" })).toThrow(/set both or neither/);
    expect(() => loadConfig({ ...valid, BILLING_LINK_SECRET: secret })).toThrow(/set both or neither/);
    expect(() => loadConfig({ ...billing, BILLING_URL: "http://billing.example.com" })).toThrow(/BILLING_URL/);
    expect(() => loadConfig({ ...billing, BILLING_LINK_SECRET: "short" })).toThrow(/BILLING_LINK_SECRET/);

    const hold = { ...billing, BILLING_HOLD_NEW_WORKSPACES: "true" };
    expect(() => loadConfig(hold)).toThrow(/OPERATOR_API_TOKEN/);
    expect(() =>
      loadConfig({ ...valid, BILLING_HOLD_NEW_WORKSPACES: "true", OPERATOR_API_TOKEN: "o".repeat(32) }),
    ).toThrow(/BILLING_HOLD_NEW_WORKSPACES/);
    expect(loadConfig({ ...hold, OPERATOR_API_TOKEN: "o".repeat(32) }).BILLING_HOLD_NEW_WORKSPACES).toBe(true);
    expect(redactConfig(loadConfig(billing)).BILLING_LINK_SECRET).toBe("********");
  });

  test("session screening is off by default and needs the operator API, its only reader", () => {
    expect(loadConfig(valid).SESSION_SCREENING).toBe(false);
    expect(() => loadConfig({ ...valid, SESSION_SCREENING: "true" })).toThrow(
      /SESSION_SCREENING needs OPERATOR_API_TOKEN/,
    );
    const on = { ...valid, SESSION_SCREENING: "true", OPERATOR_API_TOKEN: "t".repeat(32) };
    expect(loadConfig(on).SESSION_SCREENING).toBe(true);
  });

  test("the usage report is on unless TELEMETRY says off (on/off, or any yes/no word)", () => {
    expect(loadConfig(valid).TELEMETRY).toBe("on");
    expect(loadConfig(valid).TELEMETRY_URL).toBe("https://telemetry.agentes.chat/v1/report");
    expect(loadConfig({ ...valid, TELEMETRY: "off" }).TELEMETRY).toBe("off");
    expect(loadConfig({ ...valid, TELEMETRY: "false" }).TELEMETRY).toBe("off");
    expect(loadConfig({ ...valid, TELEMETRY: "on" }).TELEMETRY).toBe("on");
    expect(() => loadConfig({ ...valid, TELEMETRY: "sometimes" })).toThrow(/TELEMETRY/);
    expect(loadConfig(valid).INSTALL_MODE).toBeUndefined();
    expect(() => loadConfig({ ...valid, INSTALL_MODE: "kubernetes" })).toThrow(/INSTALL_MODE/);
  });

  test("the bot check's two keys go together, and unset there is none", () => {
    expect([loadConfig(valid).TURNSTILE_SITE_KEY, loadConfig(valid).TURNSTILE_SECRET_KEY]).toEqual([
      undefined,
      undefined,
    ]);
    const pair = {
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    };
    expect(loadConfig({ ...valid, ...pair }).TURNSTILE_SITE_KEY).toBe(pair.TURNSTILE_SITE_KEY);
    expect(() => loadConfig({ ...valid, TURNSTILE_SITE_KEY: pair.TURNSTILE_SITE_KEY })).toThrow(/go together/);
    expect(() => loadConfig({ ...valid, TURNSTILE_SECRET_KEY: pair.TURNSTILE_SECRET_KEY })).toThrow(/go together/);
    expect(redactConfig(loadConfig({ ...valid, ...pair })).TURNSTILE_SECRET_KEY).toBe("********");
  });

  test("browser push: on by default, a VAPID pair or nothing, two halves of one pair", () => {
    expect(loadConfig(valid).WEB_PUSH).toBe("on");
    expect(loadConfig({ ...valid, WEB_PUSH: "off" }).WEB_PUSH).toBe("off");
    const pair = vapidPair();
    expect(loadConfig({ ...valid, ...pair }).WEB_PUSH_VAPID_PUBLIC_KEY).toBe(pair.WEB_PUSH_VAPID_PUBLIC_KEY);
    expect(() => loadConfig({ ...valid, WEB_PUSH_VAPID_PUBLIC_KEY: pair.WEB_PUSH_VAPID_PUBLIC_KEY })).toThrow(
      /go together/,
    );
    // The public half of another pair: every push would be refused.
    const mixed = { ...valid, ...pair, WEB_PUSH_VAPID_PUBLIC_KEY: vapidPair().WEB_PUSH_VAPID_PUBLIC_KEY };
    expect(() => loadConfig(mixed)).toThrow(/public half/);
  });

  test("TRUSTED_PROXIES: a list, trimmed", () => {
    expect(loadConfig(valid).TRUSTED_PROXIES).toBeUndefined();
    const list = " 10.0.0.0/8, 173.245.48.1,2400:cb00::/32 ,";
    expect(loadConfig({ ...valid, TRUSTED_PROXIES: list }).TRUSTED_PROXIES).toEqual([
      "10.0.0.0/8",
      "173.245.48.1",
      "2400:cb00::/32",
    ]);
  });

  test("OPS_REPORT_EMAIL: off unless set, one address or a list, each an address", () => {
    expect(loadConfig(valid).OPS_REPORT_EMAIL).toBeUndefined();
    expect(loadConfig({ ...valid, OPS_REPORT_EMAIL: " ops@example.com, ana@example.com ," }).OPS_REPORT_EMAIL).toEqual([
      "ops@example.com",
      "ana@example.com",
    ]);
    expect(() => loadConfig({ ...valid, OPS_REPORT_EMAIL: "ops@example.com, not an address" })).toThrow(
      /OPS_REPORT_EMAIL/,
    );
  });

  test("ignores variables that are not in the schema", () => {
    const config = loadConfig({ ...valid, SOMETHING_ELSE: "1" }) as Record<string, unknown>;
    expect(config.SOMETHING_ELSE).toBeUndefined();
  });
});

describe("redactConfig", () => {
  test("masks every secret", () => {
    const redacted = redactConfig(
      loadConfig({ ...valid, GITHUB_CLIENT_SECRET: "gh", SMTP_URL: "smtps://u:p@smtp.example.com" }),
    );
    expect(redacted.DATABASE_URL).toBe("********");
    expect(redacted.AGENTES_SECRET).toBe("********");
    expect(redacted.GITHUB_CLIENT_SECRET).toBe("********");
    expect(redacted.SMTP_URL).toBe("********");
    expect(redacted.PORT).toBe(3000);
  });

  test("every secret-looking variable is flagged secret", () => {
    for (const [name, def] of Object.entries(envVars)) {
      if (/SECRET|DATABASE_URL/.test(name))
        expect({ name, secret: (def as { secret?: boolean }).secret }).toEqual({ name, secret: true });
    }
  });
});

test("testConfig needs no environment", () => {
  expect(testConfig().NODE_ENV).toBe("test");
});

test(".env.example is up to date with the schema", async () => {
  const proc = Bun.spawnSync(["bun", `${import.meta.dir}/../scripts/generate-docs.ts`, "--check"]);
  expect(proc.stderr.toString()).toBe("");
  expect(proc.exitCode).toBe(0);
});

describe("GITHUB_APP_PRIVATE_KEY", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\ndef==\n-----END RSA PRIVATE KEY-----";

  test("accepts the PEM, the PEM with \\n, and base64 of the PEM file", () => {
    expect(parsePemKey(`${pem}\n`)).toBe(pem);
    expect(parsePemKey(pem.replace(/\n/g, "\\n"))).toBe(pem);
    expect(parsePemKey(Buffer.from(`${pem}\n`).toString("base64"))).toBe(pem);
    expect(
      loadConfig({ ...valid, GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64") }).GITHUB_APP_PRIVATE_KEY,
    ).toBe(pem);
  });

  test("anything else fails the config with a clear message", () => {
    expect(() => parsePemKey("not-a-key")).toThrow("base64 of the PEM file");
    expect(() => loadConfig({ ...valid, GITHUB_APP_PRIVATE_KEY: "not-a-key" })).toThrow("GITHUB_APP_PRIVATE_KEY");
  });
});

describe("phone push settings", () => {
  test("auto by default, through agentes.chat's relay unless told otherwise; the relay only over https", () => {
    const config = loadConfig(valid);
    expect(config.PUSH_SENDER).toBe("auto");
    expect(config.PUSH_RELAY_URL).toBe("https://app.agentes.chat/api/push-relay/v1");
    expect(config.PUSH_RELAY_SERVE).toBe("off");
    expect(loadConfig({ ...valid, PUSH_SENDER: "off", PUSH_RELAY_SERVE: "on" })).toMatchObject({
      PUSH_SENDER: "off",
      PUSH_RELAY_SERVE: "on",
    });
    expect(() => loadConfig({ ...valid, PUSH_SENDER: "expo" })).toThrow("PUSH_SENDER");
    expect(() => loadConfig({ ...valid, PUSH_RELAY_URL: "http://relay.example/v1" })).toThrow("PUSH_RELAY_URL");
  });
});

describe("APNs key", () => {
  // Made up, and put together here so the secret scan reads no key in it.
  const pemOf = (label: string, body: string) => `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
  const p8 = pemOf("PRIVATE KEY", "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49");

  test("the .p8 as PEM or base64, its ids, and the apps it pushes to", () => {
    const set = { APNS_KEY: p8, APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "XYZ987WVUT" };
    const config = loadConfig({ ...valid, ...set });
    expect(config.APNS_KEY).toBe(p8.trim());
    expect(config.APNS_KEY_ID).toBe("ABC123DEFG");
    expect(config.APNS_TEAM_ID).toBe("XYZ987WVUT");
    expect(config.APNS_APP_IDS).toEqual([
      "chat.agentes.app",
      "chat.agentes.app.preview",
      "chat.agentes.app.development",
    ]);
    expect(redactConfig(config).APNS_KEY).toBe("********");
    expect(loadConfig({ ...valid, APNS_KEY: Buffer.from(p8).toString("base64") }).APNS_KEY).toBe(p8.trim());
    expect(loadConfig({ ...valid, APNS_APP_IDS: " com.example.app , com.example.app.beta " }).APNS_APP_IDS).toEqual([
      "com.example.app",
      "com.example.app.beta",
    ]);
    expect(loadConfig(valid).APNS_KEY).toBeUndefined();
  });

  test("anything else fails the config with a clear message", () => {
    expect(() => loadConfig({ ...valid, APNS_KEY: "not-a-key" })).toThrow("APNS_KEY");
    const ec = pemOf("EC PRIVATE KEY", "MHcCAQEEIA==");
    expect(() => loadConfig({ ...valid, APNS_KEY: ec })).toThrow(".p8");
    expect(() => loadConfig({ ...valid, APNS_KEY_ID: "short" })).toThrow("APNS_KEY_ID");
    expect(() => loadConfig({ ...valid, APNS_TEAM_ID: "lowercase1" })).toThrow("APNS_TEAM_ID");
    expect(() => loadConfig({ ...valid, APNS_APP_IDS: "chat.agentes.app,not a bundle id" })).toThrow("APNS_APP_IDS");
    expect(() => loadConfig({ ...valid, APNS_APP_IDS: " , " })).toThrow("APNS_APP_IDS");
  });
});

describe("FIREBASE_SERVICE_ACCOUNT", () => {
  const key = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n";
  const file = JSON.stringify({
    type: "service_account",
    project_id: "acme-push",
    private_key_id: "abc123",
    private_key: key,
    client_email: "firebase-adminsdk@acme-push.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
  });

  test("takes the JSON file's contents or base64 of the file; masked when logged", () => {
    const parsed = {
      projectId: "acme-push",
      clientEmail: "firebase-adminsdk@acme-push.iam.gserviceaccount.com",
      privateKey: key,
      tokenUri: "https://oauth2.googleapis.com/token",
    };
    expect(parseFirebaseServiceAccount(file)).toEqual(parsed);
    expect(parseFirebaseServiceAccount(Buffer.from(file).toString("base64"))).toEqual(parsed);
    const config = loadConfig({ ...valid, FIREBASE_SERVICE_ACCOUNT: file });
    expect(config.FIREBASE_SERVICE_ACCOUNT).toEqual(parsed);
    expect(redactConfig(config).FIREBASE_SERVICE_ACCOUNT).toBe("********");
    expect(loadConfig(valid).FIREBASE_SERVICE_ACCOUNT).toBeUndefined();
  });

  test("anything else fails the config without echoing the key", () => {
    expect(() => parseFirebaseServiceAccount("not-json")).toThrow("service account's JSON key");
    const userKey = JSON.stringify({ type: "authorized_user", private_key: key });
    expect(() => parseFirebaseServiceAccount(userKey)).toThrow('"type": "service_account"');
    const noEmail = JSON.stringify({ type: "service_account", project_id: "p", private_key: key });
    expect(() => parseFirebaseServiceAccount(noEmail)).toThrow("client_email");
    let message = "";
    try {
      loadConfig({ ...valid, FIREBASE_SERVICE_ACCOUNT: noEmail });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("FIREBASE_SERVICE_ACCOUNT");
    expect(message).not.toContain("MIIEvQ");
  });
});
