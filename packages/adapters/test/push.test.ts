import { describe, expect, test } from "bun:test";
import { createFakePushSender, createPhonePushSender, PushError, type PushMessage, type PushSender } from "../src";

/** An iPhone's APNs device token. */
const apnsToken = (n: number) => String(n).padStart(64, "a");

const msg = (n: number): PushMessage => ({
  to: apnsToken(n),
  platform: "ios",
  title: "Oi",
  body: "Tudo certo?",
  data: { orgId: "o", kind: "mention", notificationId: `n${n}` },
});

describe("fake push sender", () => {
  test("records messages and reports unregistered tokens", async () => {
    const fake = createFakePushSender({ unregistered: [apnsToken(2)] });
    const results = await fake.send([msg(1), msg(2)]);
    expect(fake.sent.map((m) => m.to)).toEqual([apnsToken(1)]);
    expect(results).toEqual([
      { token: apnsToken(1), ok: true, unregistered: false },
      { token: apnsToken(2), ok: false, unregistered: true, error: "DeviceNotRegistered" },
    ]);
  });
});

describe("phone push sender", () => {
  const android = (n: number): PushMessage => ({ ...msg(n), to: `fcm-token-${n}`, platform: "android" });

  test("each message goes to its platform's sender, results in order", async () => {
    const fcm = createFakePushSender({ unregistered: ["fcm-token-3"] });
    const apns = createFakePushSender();
    const phones = createPhonePushSender({ android: fcm, ios: apns });
    const results = await phones.send([android(1), msg(2), android(3), msg(4)]);
    expect(results.map((r) => [r.token, r.ok, r.unregistered])).toEqual([
      ["fcm-token-1", true, false],
      [apnsToken(2), true, false],
      ["fcm-token-3", false, true],
      [apnsToken(4), true, false],
    ]);
    expect(fcm.sent.map((m) => m.to)).toEqual(["fcm-token-1"]);
    expect(apns.sent.map((m) => m.to)).toEqual([apnsToken(2), apnsToken(4)]);
  });

  test("a platform without a sender: skipped, the device kept; the other still sends", async () => {
    const apns = createFakePushSender();
    const phones = createPhonePushSender({ android: null, ios: apns });
    const results = await phones.send([android(1), msg(2)]);
    expect(results[0]).toMatchObject({ token: "fcm-token-1", ok: false, unregistered: false, skipped: true });
    expect(results[1]).toMatchObject({ ok: true });
    const onlyAndroid = await createPhonePushSender({ android: createFakePushSender() }).send([msg(1)]);
    expect(onlyAndroid[0]).toMatchObject({ token: apnsToken(1), ok: false, unregistered: false, skipped: true });
  });

  test("one platform failing as a whole never stops the other; only nothing sent throws", async () => {
    const down: PushSender = {
      id: "down",
      send: async () => {
        throw new PushError("push relay refused the request (403)", false, 403);
      },
    };
    const apns = createFakePushSender();
    const phones = createPhonePushSender({ android: down, ios: apns });
    const results = await phones.send([android(1), msg(2)]);
    expect(results[0]).toMatchObject({ token: "fcm-token-1", ok: false, unregistered: false, retryable: false });
    expect(results[1]).toMatchObject({ token: apnsToken(2), ok: true });
    expect(apns.sent.map((m) => m.to)).toEqual([apnsToken(2)]);
    await expect(phones.send([android(1)])).rejects.toMatchObject({ retryable: false, status: 403 });
  });

  test("the fake's failing tokens come back retryable", async () => {
    const fake = createFakePushSender({ failing: ["fcm-token-1"] });
    expect(await fake.send([android(1)])).toEqual([
      { token: "fcm-token-1", ok: false, unregistered: false, retryable: true, error: "unavailable" },
    ]);
    expect(fake.sent).toEqual([]);
  });
});
