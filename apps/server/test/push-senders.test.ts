import { describe, expect, test } from "bun:test";
import { createFakePushSender } from "@agenteschat/adapters";
import { loadConfig } from "@agenteschat/config";
import {
  apnsKeyGaps,
  apnsKeyOf,
  directPushSenders,
  phonePushMode,
  relayIsThisServer,
  relayServeSender,
} from "../src/push-senders";

const base = { DATABASE_URL: "postgres://localhost/test", AGENTES_SECRET: "s".repeat(48) };
const config = (env: Record<string, string> = {}) => loadConfig({ ...base, ...env });

describe("phone push without the Apple key (ADR 0178)", () => {
  test("no APNS variable: the server starts, has no iPhone sender, and warns about nothing", () => {
    const c = config();
    expect(apnsKeyOf(c)).toBeNull();
    expect(apnsKeyGaps(c)).toEqual([]);
    expect(directPushSenders(c)).toEqual({ android: null, ios: null });
    expect(relayServeSender(directPushSenders(c))).toBeNull();
  });

  test("some of the three: named as missing, and still no sender", () => {
    const c = config({ APNS_KEY_ID: "ABC123DEFG" });
    expect(apnsKeyGaps(c)).toEqual(["APNS_KEY", "APNS_TEAM_ID"]);
    expect(directPushSenders(c).ios).toBeNull();
  });

  test("auto: its own credentials first, else the relay", () => {
    const c = config({ PUBLIC_URL: "https://chat.example.com" });
    expect(phonePushMode(c, createFakePushSender())).toBe("direct");
    expect(phonePushMode(c, null)).toBe("relay");
  });

  test("auto on the server that is the relay: a platform without credentials is off, never a call to itself", () => {
    const c = config({ PUBLIC_URL: "https://app.agentes.chat" });
    expect(relayIsThisServer(c)).toBe(true);
    expect(phonePushMode(c, null)).toBe("off");
    expect(phonePushMode(c, createFakePushSender())).toBe("direct");
    // Someone's own relay at their own address is the same case; the default relay from elsewhere is not.
    const own = config({
      PUBLIC_URL: "https://chat.example.com",
      PUSH_RELAY_URL: "https://chat.example.com/api/push-relay/v1",
    });
    expect(phonePushMode(own, null)).toBe("off");
    expect(relayIsThisServer(config({ PUBLIC_URL: "https://chat.example.com" }))).toBe(false);
  });

  test("a set PUSH_SENDER is what was asked, whatever the credentials", () => {
    for (const mode of ["direct", "relay", "off"] as const) {
      expect(phonePushMode(config({ PUSH_SENDER: mode }), null)).toBe(mode);
    }
  });
});
