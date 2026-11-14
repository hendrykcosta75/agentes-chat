import { afterEach, describe, expect, test } from "bun:test";
import { createECDH } from "node:crypto";
import {
  createFakePushSender,
  createFakeWebPushSender,
  createMemoryPresence,
  createPhonePushSender,
  generateVapidKeys,
  type KeyWrapper,
  PushError,
  type PushSender,
  type RealtimeEvent,
  userTopic,
} from "@agenteschat/adapters";
import { eq, schema } from "@agenteschat/db";
import { LOCALE_CODES } from "@agenteschat/i18n/locale";
import { unplainLeaves } from "../../i18n/test/plain-marks";
import {
  addChannelMember,
  approvalIsHighRisk,
  createJobHandlers,
  createLocalKeyWrapper,
  deliverPush,
  drainOutbox,
  listMembers,
  listPushDevices,
  markChannelRead,
  markNotificationRead,
  noticeCategoryOf,
  noticePrefsOf,
  noticePrefsView,
  notify,
  notifyApproval,
  openDm,
  PUSH_ACTIVE_DELAY_MS,
  postPersonMessage,
  pushLocale,
  pushQuote,
  pushStrings,
  registerPushDevice,
  remindNotifications,
  renderPush,
  sealSecret,
  setNoticePref,
  snoozeNotification,
  unregisterPushDevice,
  VAPID_FALLBACK_SUBJECT,
  VAPID_KEEP_NEW_MS,
  VAPID_RECHECK_MS,
  vapidKeys,
  vapidSubject,
  wakeSnoozedNotifications,
} from "../src";
import { postWelcome } from "../src/right-hand-welcome";
import { addMember, type Fixture, setup } from "./fixtures";

let f: Fixture;
afterEach(async () => {
  const current = f;
  f = undefined as unknown as Fixture;
  await current?.close();
});

const deps = () => ({ db: f.db, pubsub: f.pubsub });
/** An iPhone's APNs device token (ADR 0178). */
const TOKEN_BIA = "b1a0".repeat(16);
const TOKEN_BIA_EN = "b1a1".repeat(16);
/** An Android phone's FCM registration token (ADR 0152). */
const FCM_BIA = `bia-android:APA91b${"a".repeat(140)}`;

/** Bia in #general with a phone (pt-BR), and the fake sender wired into the job handlers. */
async function withPhone(options: { unregistered?: string[]; pushServer?: string } = {}) {
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  await listMembers(f.db, f.org.id); // assigns handles
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
  const push = createFakePushSender({ unregistered: options.unregistered });
  const handlers = createJobHandlers({ ...f.jobDeps, push, pushServer: options.pushServer });
  const drain = () => drainOutbox(f.db, handlers);
  return { bia, push, drain };
}

/** A session of this person, a week long unless said (a browser's pushes last as long as it does). */
async function signIn(userId: string, expiresAt = new Date(Date.now() + 7 * 86_400_000)) {
  const id = crypto.randomUUID();
  await f.db.insert(schema.sessions).values({ id, token: `token-${id}`, userId, expiresAt });
  return id;
}

/** A browser's Web Push subscription, turned on in that session. */
function webSubscription(endpoint: string, sessionId: string, locale = "pt-BR") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    platform: "web" as const,
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 3).toString("base64url") },
    locale,
    sessionId,
  };
}
const BROWSER = "https://fcm.googleapis.com/fcm/send/bia-laptop";
const BROWSER_OLD = "https://updates.push.services.mozilla.com/wpush/v2/bia-old";

const pushJobs = async () =>
  (await f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, "push.send"))).map((j) => j.payload);

describe("push text", () => {
  test("picks the language from the device locale", () => {
    expect(pushLocale("pt-BR")).toBe("pt-BR");
    expect(pushLocale("pt_PT")).toBe("pt-BR");
    expect(pushLocale("en-US")).toBe("en");
    expect(pushLocale(null)).toBe("en");
    expect(pushLocale("ja-JP")).toBe("ja");
    // The person's language first, then the device's.
    expect(pushLocale("fr", "pt-BR")).toBe("fr");
    expect(pushLocale(null, "pt-BR")).toBe("pt-BR");
  });

  test("no semicolon, no em dash in any push, as the phone shows it", () => {
    const shown = Object.fromEntries(
      LOCALE_CODES.map((locale) => [
        locale,
        Object.fromEntries(
          Object.entries(pushStrings(locale)).map(([key, w]) => [
            key,
            typeof w === "function" ? (w as (...a: string[]) => string)("Ana", "Acme") : w,
          ]),
        ),
      ]),
    );
    expect(unplainLeaves(shown)).toEqual([]);
  });

  test("kinds render short friendly text; high-risk approvals only say to open the app", () => {
    expect(renderPush("pt-BR", { kind: "mention", waiting: false, actorName: "Ana", text: "olha isso" })).toEqual({
      title: "Ana mencionou você",
      body: "olha isso",
    });
    const question = renderPush("en", { kind: "agent_question", waiting: true, actorName: "Dev", text: "Which?" });
    expect(question).toEqual({ title: "Dev has a question for you", body: "Which?" });
    const risky = renderPush("pt-BR", {
      kind: "approval",
      waiting: true,
      actorName: "Dev",
      title: "Deploy api to production",
      highRisk: true,
    });
    expect(risky.title).toBe("Dev precisa da sua aprovação");
    // The title is the tool's, in English: in another language the warning stands alone, never "Toque para ver".
    expect(risky.body).toBe("Pedido de alto risco. Abra o app para revisar com calma.");
    for (const locale of ["es", "de", "ja", "zh-Hans"] as const)
      expect(renderPush(locale, { kind: "approval", waiting: true, actorName: "Dev", highRisk: true }).body).toBe(
        pushStrings(locale).approvalHighRiskBody,
      );
    expect(
      renderPush("pt-BR", { kind: "approval", waiting: true, actorName: "Dev", highRisk: true, routine: "Deploys" })
        .body,
    ).toBe("Rotina «Deploys»: Pedido de alto risco. Abra o app para revisar com calma.");
    // Asked by a routine while nobody watched: the push names it.
    const fromRoutine = renderPush("en", {
      kind: "approval",
      waiting: true,
      actorName: "Dev",
      title: "Deploy api to production",
      highRisk: true,
      routine: "Deploys",
    });
    expect(fromRoutine.body).toBe("Routine «Deploys»: Deploy api to production. Open the app to review it.");
    expect(renderPush("en", { kind: "dm", waiting: false, actorType: "user", text: "hi" }).title).toBe("Someone");
    expect(renderPush("pt-BR", { kind: "routine_waiting_plan", waiting: false, title: "Deploys" })).toEqual({
      title: "Uma rotina está esperando o plano renovar",
      body: "Deploys · Ela roda quando ele renovar.",
    });
    const long = renderPush("en", { kind: "mention", waiting: false, actorName: "Ana", text: "x".repeat(500) });
    expect(long.body.length).toBeLessThanOrEqual(180);
  });

  test("widgets and dashboards: the alert in the agent's words, why a widget didn't update, a board to publish", () => {
    const alert = renderPush("pt-BR", {
      kind: "widget_alert",
      waiting: true,
      actorName: "Theo",
      actorType: "agent",
      label: "Vendas hoje",
      title: "Vendas hoje",
      text: "As vendas caíram 25% abaixo de ontem.",
    });
    expect(alert).toEqual({ title: "Theo: Vendas hoje", body: "As vendas caíram 25% abaixo de ontem." });
    expect(
      renderPush("en", { kind: "widget_failed", waiting: false, title: "Open tickets", reason: "budget_exceeded" }),
    ).toEqual({ title: "“Open tickets” didn't update", body: "The agent reached its budget for the month." });
    // The agent said why itself: its words.
    expect(
      renderPush("pt-BR", {
        kind: "widget_failed",
        waiting: false,
        title: "Vendas",
        reason: "agent_reported",
        text: "O Stripe não está conectado.",
      }).body,
    ).toBe("O Stripe não está conectado.");
    expect(renderPush("en", { kind: "widget_failed", waiting: false, title: "X", reason: "something_new" }).body).toBe(
      "Tap to see why.",
    );
    expect(
      renderPush("pt-BR", { kind: "dashboard_proposal", waiting: true, actorName: "Theo", title: "Black Friday" }),
    ).toEqual({ title: "Theo quer publicar um painel", body: "“Black Friday” · Toque para decidir." });
  });

  test("a push quotes only what someone wrote: never a body the server wrote, nor a cut reply's English note", () => {
    expect(pushQuote({ text: "Te mandei o contrato" })).toBe("Te mandei o contrato");
    expect(pushQuote({ text: "Event proposal: Reunião", meta: { bodyCode: "calendar_proposal" } })).toBeNull();
    const note = "_Claude Code stopped before finishing (lost). Already done, not repeated: run_code._";
    expect(pushQuote({ text: note, meta: { brainInterrupted: { text: "", tools: ["run_code"] } } })).toBeNull();
    expect(
      pushQuote({ text: `Fiz metade\n\n${note}`, meta: { brainInterrupted: { text: "Fiz metade", tools: [] } } }),
    ).toBe("Fiz metade");
    expect(pushQuote({ text: "_Interrupted by a server restart._", meta: { interrupted: { text: "" } } })).toBeNull();
  });

  test("high risk follows the approval card's rule", () => {
    expect(approvalIsHighRisk({ tool: "github.merge_pull_request", scope: "github:merge" })).toBe(false);
    expect(approvalIsHighRisk({ tool: "deploy", scope: "railway:deploy" })).toBe(true);
    expect(approvalIsHighRisk({ tool: "send_email", scope: "gmail:send" })).toBe(true);
    expect(approvalIsHighRisk({ tool: "post_message", scope: "chat:send" })).toBe(false);
  });
});

describe("push delivery", () => {
  test("a mention pushes once to the person's phone with the deep link data", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const sent = await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia pode revisar?" });
    await drain();
    expect(push.sent).toHaveLength(1);
    const [n] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(push.sent[0]).toMatchObject({ to: TOKEN_BIA, title: "ana mencionou você", body: "@bia pode revisar?" });
    // The message itself, so the tap opens at it.
    expect(push.sent[0]?.data).toEqual({
      orgId: f.org.id,
      kind: "mention",
      notificationId: n?.id,
      channelId: f.general.id,
      messageId: sent.id,
      // Whose it is: a device signed in with several accounts opens it as theirs (ADR 0183).
      user: bia.id,
    });
    // A retried job sends nothing new (one job per notification).
    await drain();
    expect(push.sent).toHaveLength(1);
  });

  test("a token moves to whoever registers it; nobody named in `sharedWith` gains one (ADR 0183)", async () => {
    f = await setup();
    const { bia } = await withPhone();
    const eve = await addMember(f.db, f.org.id, "member", "eve");
    const dan = await addMember(f.db, f.org.id, "member", "dan");
    // The same phone signed in as Eve beside Bia. While a token is one person's in the database, it is the last
    // one to register who hears it; naming someone who never registered it gives them nothing either way.
    await registerPushDevice(f.db, eve.id, {
      token: TOKEN_BIA,
      platform: "ios",
      locale: "en",
      sharedWith: [bia.id, dan.id],
    });
    expect((await listPushDevices(f.db, eve.id)).map((d) => d.token)).toEqual([TOKEN_BIA]);
    expect(await listPushDevices(f.db, dan.id)).toEqual([]);
    // Registered again: still one row, refreshed.
    await registerPushDevice(f.db, eve.id, {
      token: TOKEN_BIA,
      platform: "ios",
      locale: "pt-BR",
      sharedWith: [bia.id],
    });
    expect((await listPushDevices(f.db, eve.id)).map((d) => d.locale)).toEqual(["pt-BR"]);
    // The phone changed hands: Bia alone now, and Eve stops hearing it.
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    expect(await listPushDevices(f.db, eve.id)).toEqual([]);
    expect(await listPushDevices(f.db, bia.id)).toHaveLength(1);
  });

  test("what the right hand writes by itself pushes its own words under its name, never as a reply", async () => {
    f = await setup({ rightHand: true });
    const { bia, push, drain } = await withPhone();
    const eve = await addMember(f.db, f.org.id, "member", "eve");
    await f.db.update(schema.users).set({ locale: "en" }).where(eq(schema.users.id, eve.id));
    await registerPushDevice(f.db, eve.id, { token: TOKEN_BIA_EN, platform: "ios", locale: "en" });
    await postWelcome(f.jobDeps, f.org.id, { userId: bia.id });
    await postWelcome(f.jobDeps, f.org.id, { userId: eve.id });
    await drain();
    const sent = (to: string) => push.sent.filter((p) => p.to === to).map((p) => [p.title, p.body, p.data?.kind]);
    expect(sent(TOKEN_BIA)).toEqual([
      [
        "Lodi",
        "Você acabou de entrar na Acme. Do que você cuida por aqui? Me conta e eu monto seu primeiro agente com você.",
        "dm",
      ],
    ]);
    expect(sent(TOKEN_BIA_EN)).toEqual([
      [
        "Lodi",
        "You just joined Acme. What do you look after here? Tell me and I set up your first agent with you.",
        "dm",
      ],
    ]);
    // Reading the conversation takes it out of the inbox, as it does an agent's reply there.
    const [row] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(row?.doneAt).toBeNull();
    await markChannelRead(f.db, bia.id, f.org.id, String(row?.source.channelId));
    const [read] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(read?.doneAt).not.toBeNull();
  });

  test("each push names the server it came from, so a phone on several servers opens the right one", async () => {
    f = await setup();
    const { push, drain } = await withPhone({ pushServer: "https://agentes.exemplo.com.br" });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia olha isso" });
    await drain();
    expect(push.sent[0]?.data).toMatchObject({ orgId: f.org.id, server: "https://agentes.exemplo.com.br" });
  });

  test("a DM from a person pushes; each device gets its own language", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA_EN, platform: "android", locale: "en" });
    const dm = await openDm(f.db, f.owner.id, f.org.id, { userId: bia.id });
    await postPersonMessage(deps(), f.owner.id, f.org.id, dm.id, { body: "Te mandei o contrato" });
    await drain();
    expect(push.sent.map((m) => [m.to, m.title, m.body]).sort()).toEqual([
      [TOKEN_BIA, "ana", "Te mandei o contrato"],
      [TOKEN_BIA_EN, "ana", "Te mandei o contrato"],
    ]);
    expect(push.sent[0]?.data).toMatchObject({ kind: "dm", channelId: dm.id, dmId: dm.id });
  });

  test("Lembrar depois reaches the person's phone when its time comes, even read before or merged", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const reply = (text: string) =>
      notify(deps(), {
        orgId: f.org.id,
        userIds: [bia.id],
        kind: "agent_reply",
        groupKey: "agent_reply:release",
        actor: { type: "agent", id: f.agent.id },
        source: { channelId: f.general.id },
        latest: { text },
      });
    await reply("Deploy feito");
    await reply("Os testes passaram");
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia pode revisar?" });
    await drain();
    expect(push.sent.map((m) => m.data?.kind).sort()).toEqual(["agent_reply", "mention"]);
    const rows = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    const merged = rows.find((r) => r.kind === "agent_reply");
    const read = rows.find((r) => r.kind === "mention");
    expect(merged?.count).toBe(2);
    // The first tap on a narrow screen reads it; then "Lembrar depois".
    await markNotificationRead(deps(), bia.id, f.org.id, read?.id ?? "", true);
    const until = new Date(Date.now() + 3600_000);
    for (const n of [merged, read]) await snoozeNotification(deps(), bia.id, f.org.id, n?.id ?? "", until);
    const events: RealtimeEvent[] = [];
    f.pubsub.subscribe(userTopic(f.org.id, bia.id), (e) => events.push(e));

    expect(await wakeSnoozedNotifications({ ...deps(), now: () => new Date(until.getTime() + 1000) })).toBe(2);
    await drain();
    expect(
      push.sent
        .slice(2)
        .map((m) => m.data?.kind)
        .sort(),
    ).toEqual(["agent_reply", "mention"]);
    const woke = events.filter((e) => e.type === "notification.upserted");
    expect(woke.map((e) => ("alert" in e ? e.alert : null))).toEqual([true, true]);
    const back = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(back.map((r) => [r.kind, r.readAt, r.snoozedUntil])).toEqual(
      expect.arrayContaining([
        ["agent_reply", null, null],
        ["mention", null, null],
      ]),
    );
    // Once per reminder.
    await drain();
    expect(push.sent).toHaveLength(4);
  });

  test("thread replies and other non-pushing kinds don't push", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const root = await postPersonMessage(deps(), bia.id, f.org.id, f.general.id, { body: "Release checklist" });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "done", threadId: root.id });
    await drain();
    const [n] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(n?.kind).toBe("thread_reply");
    expect(push.sent).toHaveLength(0);
    expect(await pushJobs()).toEqual([]);
  });

  test("the person's choices decide: threads turned on push, mentions turned off don't (ADR 0071 §8)", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const before = await noticePrefsView(f.db, f.org.id, bia.id);
    expect(before.phones).toBe(1);
    expect(before.categories.filter((c) => c.on).map((c) => c.id)).toEqual([
      "waiting",
      "replies",
      "mentions",
      "routines",
      "computers",
    ]);
    await setNoticePref(f.db, f.org.id, bia.id, "threads", true);
    const after = await setNoticePref(f.db, f.org.id, bia.id, "mentions", false);
    expect(after.categories.find((c) => c.id === "mentions")?.on).toBe(false);

    const root = await postPersonMessage(deps(), bia.id, f.org.id, f.general.id, { body: "Release checklist" });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "done", threadId: root.id });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia pode revisar?" });
    await drain();
    expect(push.sent.map((m) => m.data?.kind)).toEqual(["thread_reply"]);
    // The inbox keeps both either way.
    const rows = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(rows.map((r) => r.kind).sort()).toEqual(["mention", "thread_reply"]);
  });

  test("categories: anything waiting is `waiting`; unknown kinds and stored junk notify nothing", () => {
    expect(noticeCategoryOf("approval", true)).toBe("waiting");
    expect(noticeCategoryOf("thread_reply", true)).toBe("waiting");
    expect(noticeCategoryOf("agent_reply", false)).toBe("replies");
    expect(noticeCategoryOf("no_such_kind", false)).toBeNull();
    expect(noticePrefsOf({ threads: true, mentions: "no", junk: true })).toEqual({ threads: true });
    expect(noticePrefsOf(null)).toEqual({});
  });

  test("waiting items push with high priority; read before delivery means no push", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const [question] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "agent_question",
      groupKey: "agent_question:q1",
      waiting: true,
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "Qual branch?" },
    });
    const [read] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:m1",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "seen already" },
    });
    await markNotificationRead(deps(), bia.id, f.org.id, read?.id ?? "", true);
    await drain();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      title: "Dev tem uma pergunta para você",
      body: "Qual branch?",
      priority: "high",
      data: { kind: "agent_question", notificationId: question?.id },
    });
  });

  test("the day's one reminder reaches the phone saying how many things still wait", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "agent_question",
      groupKey: "agent_question:q1",
      waiting: true,
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "Qual branch?" },
    });
    await drain();
    expect(
      await remindNotifications(deps(), f.org.id, "agent_question:q1", { reminder: true, still: 3 }, "day-1", [bia.id]),
    ).toBe(1);
    await drain();
    expect(push.sent).toHaveLength(2);
    expect(push.sent[1]?.title).toBe(renderPush("pt-BR", { kind: "agent_question", waiting: true, still: 3 }).title);
    expect(push.sent[1]?.title).toContain("3");
  });

  test("an approval a routine asked: its why and origin in the inbox, the routine's name in the push", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    const origin = { kind: "routine", routineId: crypto.randomUUID(), routineName: "Revisar PRs" };
    const [approval] = await f.db
      .insert(schema.approvals)
      .values({
        orgId: f.org.id,
        agentId: f.agent.id,
        channelId: f.general.id,
        threadRootId: crypto.randomUUID(),
        toolUseId: "toolu_1",
        tool: "github.merge_pull_request",
        scope: "github:merge",
        params: { pr: 42 },
        actionHash: "hash",
        title: "Merge PR #42",
        detail: '{"pr":42}',
        why: "Os testes passaram e a correção do login é pequena.",
        origin,
        expiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    if (!approval) throw new Error("no approval");
    await notifyApproval(deps(), approval, [bia.id]);
    const [n] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    // The why instead of the raw detail; where it came from, for the card and the push.
    expect(n?.latest).toEqual({
      title: "Merge PR #42",
      text: "Os testes passaram e a correção do login é pequena.",
      origin,
      expiresAt: approval.expiresAt.toISOString(),
    });
    await drain();
    expect(push.sent[0]).toMatchObject({
      to: TOKEN_BIA,
      title: "Dev precisa da sua aprovação",
      body: "Rotina «Revisar PRs»: Toque para ver o pedido.",
    });
  });

  test("an unregistered token is deleted", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone({ unregistered: [TOKEN_BIA] });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia oi" });
    await drain();
    expect(push.sent).toHaveLength(0);
    expect(await listPushDevices(f.db, bia.id)).toEqual([]);
  });

  test("an iPhone is pushed as the app and the environment it registered with", async () => {
    f = await setup();
    const { bia, push, drain } = await withPhone();
    // The phone's own token again, now saying which build it is; an Android phone says neither.
    await registerPushDevice(f.db, bia.id, {
      token: TOKEN_BIA,
      platform: "ios",
      locale: "pt-BR",
      appId: "chat.agentes.app.preview",
      sandbox: true,
    });
    await registerPushDevice(f.db, bia.id, {
      token: FCM_BIA,
      platform: "android",
      locale: "en",
      appId: "chat.agentes.app",
      sandbox: true,
    });
    const devices = await listPushDevices(f.db, bia.id);
    expect(devices.map((d) => [d.platform, d.appId, d.apnsSandbox])).toEqual([
      ["ios", "chat.agentes.app.preview", true],
      ["android", null, false],
    ]);
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia oi" });
    await drain();
    expect(push.sent.map((m) => [m.platform, m.apns])).toEqual([
      ["ios", { topic: "chat.agentes.app.preview", sandbox: true }],
      ["android", undefined],
    ]);

    // Registered again without them (a store build that read no profile): the sender's first app, production.
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    push.sent.length = 0;
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia de novo" });
    await drain();
    expect(push.sent.find((m) => m.platform === "ios")?.apns).toEqual({});
  });

  test("no phone, no job", async () => {
    f = await setup();
    const caio = await addMember(f.db, f.org.id, "member", "caio");
    await notify(deps(), {
      orgId: f.org.id,
      userIds: [caio.id],
      kind: "mention",
      groupKey: "mention:x",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
    });
    expect(await pushJobs()).toEqual([]);
  });
});

describe("Android push (FCM)", () => {
  test("each phone's push says its platform; nothing taken and FCM busy: the job is tried again", async () => {
    f = await setup();
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    await registerPushDevice(f.db, bia.id, { token: FCM_BIA, platform: "android", locale: "pt-BR" });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:android",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    const id = n?.id ?? "";
    const push = createFakePushSender({ failing: [FCM_BIA] });
    await expect(deliverPush({ db: f.db, push }, id)).rejects.toMatchObject({ retryable: true });
    expect((await listPushDevices(f.db, bia.id)).map((d) => d.token)).toEqual([FCM_BIA]);

    // Her iPhone took it: the Android failure is left alone, so the iPhone is never pushed twice.
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    expect(await deliverPush({ db: f.db, push }, id)).toEqual({ sent: 1, removed: 0, failed: 1 });

    push.failing.clear();
    expect(await deliverPush({ db: f.db, push }, id)).toEqual({ sent: 2, removed: 0, failed: 0 });
    const sent = push.sent.map((m) => `${m.platform} ${m.to}`);
    expect(sent.slice(1).sort()).toEqual([`android ${FCM_BIA}`, `ios ${TOKEN_BIA}`]);
    expect(push.sent[1]).toMatchObject({ data: { orgId: f.org.id, kind: "mention", notificationId: id } });
  });

  test("a server that sends no Android push: the phone stays registered, and it is no failure", async () => {
    f = await setup();
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    await registerPushDevice(f.db, bia.id, { token: FCM_BIA, platform: "android", locale: "pt-BR" });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:no-fcm",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    const push = createPhonePushSender({ android: null, ios: createFakePushSender() });
    expect(await deliverPush({ db: f.db, push }, n?.id ?? "")).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(await listPushDevices(f.db, bia.id)).toHaveLength(1);

    // So a browser's failure that may work later is still tried again.
    const webPush = createFakeWebPushSender({ failing: [BROWSER] });
    await registerPushDevice(f.db, bia.id, webSubscription(BROWSER, await signIn(bia.id)));
    await expect(deliverPush({ db: f.db, push, webPush }, n?.id ?? "")).rejects.toMatchObject({ retryable: true });
  });

  test("a server with no Apple key: the iPhone stays registered, no retry, and it is pushed once the key is there", async () => {
    f = await setup();
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    await registerPushDevice(f.db, bia.id, { token: FCM_BIA, platform: "android", locale: "pt-BR" });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:no-apns",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    const fcm = createFakePushSender();
    const keyless = createPhonePushSender({ android: fcm, ios: null });
    expect(await deliverPush({ db: f.db, push: keyless }, n?.id ?? "")).toEqual({ sent: 1, removed: 0, failed: 0 });
    expect(fcm.sent.map((m) => m.to)).toEqual([FCM_BIA]);
    expect(await listPushDevices(f.db, bia.id)).toHaveLength(2);

    // Only the iPhone: nothing sent is still no failure, so the outbox doesn't try again.
    const onlyIos = createPhonePushSender({ android: null, ios: null });
    expect(await deliverPush({ db: f.db, push: onlyIos }, n?.id ?? "")).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(await listPushDevices(f.db, bia.id)).toHaveLength(2);

    // The key arrives: the same registration is pushed, with no new build and no new sign-in.
    const apns = createFakePushSender();
    const keyed = createPhonePushSender({ android: createFakePushSender(), ios: apns });
    expect((await deliverPush({ db: f.db, push: keyed }, n?.id ?? "")).sent).toBe(2);
    expect(apns.sent.map((m) => m.to)).toEqual([TOKEN_BIA]);
  });
});

describe("push devices", () => {
  test("a token moves to whoever registers it; only the owner can remove it", async () => {
    f = await setup();
    const { bia } = await withPhone();
    await registerPushDevice(f.db, f.owner.id, { token: TOKEN_BIA, platform: "ios", locale: "en" });
    expect(await listPushDevices(f.db, bia.id)).toEqual([]);
    expect(await unregisterPushDevice(f.db, bia.id, TOKEN_BIA)).toBe(false);
    expect((await listPushDevices(f.db, f.owner.id)).map((d) => [d.token, d.locale])).toEqual([[TOKEN_BIA, "en"]]);
    expect(await unregisterPushDevice(f.db, f.owner.id, TOKEN_BIA)).toBe(true);
    expect(await listPushDevices(f.db, f.owner.id)).toEqual([]);
  });

  test("keeps the newest 10 per person", async () => {
    f = await setup();
    const base = Date.now();
    for (let i = 0; i < 12; i++) {
      await registerPushDevice(
        f.db,
        f.owner.id,
        { token: `ExponentPushToken[device-${String(i).padStart(4, "0")}]`, platform: "android", locale: "en" },
        new Date(base + i * 1000),
      );
    }
    const tokens = (await listPushDevices(f.db, f.owner.id)).map((d) => d.token);
    expect(tokens).toHaveLength(10);
    expect(tokens).not.toContain("ExponentPushToken[device-0000]");
    expect(tokens).not.toContain("ExponentPushToken[device-0001]");
  });
});

describe("web push devices", () => {
  test("a browser registers with its endpoint and keys; it counts toward the 10 per person", async () => {
    f = await setup();
    const session = await signIn(f.owner.id);
    const sub = webSubscription(BROWSER, session);
    expect(await registerPushDevice(f.db, f.owner.id, sub)).toBe(true);
    const [row] = await listPushDevices(f.db, f.owner.id);
    expect(row).toMatchObject({
      token: BROWSER,
      platform: "web",
      webKeys: sub.keys,
      sessionId: session,
      locale: "pt-BR",
    });
    // A phone token that later shows up again as itself keeps no browser keys.
    await registerPushDevice(f.db, f.owner.id, { token: TOKEN_BIA, platform: "android", locale: "en" });
    const phone = (await listPushDevices(f.db, f.owner.id)).find((d) => d.token === TOKEN_BIA);
    expect(phone?.webKeys).toBeNull();
    expect(phone?.sessionId).toBeNull();

    const base = Date.now() + 1000;
    for (let i = 0; i < 10; i++) {
      await registerPushDevice(
        f.db,
        f.owner.id,
        webSubscription(`https://fcm.googleapis.com/fcm/send/device-${i}`, session),
        new Date(base + i * 1000),
      );
    }
    const tokens = (await listPushDevices(f.db, f.owner.id)).map((d) => d.token);
    expect(tokens).toHaveLength(10);
    expect(tokens).not.toContain(BROWSER);
    expect(tokens).not.toContain(TOKEN_BIA);
  });

  test("a browser belongs to a live session of its person; signing out takes it away", async () => {
    f = await setup();
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    // A session that ran out, or someone else's: nothing is registered.
    const ended = await signIn(f.owner.id, new Date(Date.now() - 1000));
    expect(await registerPushDevice(f.db, f.owner.id, webSubscription(BROWSER, ended))).toBe(false);
    expect(await registerPushDevice(f.db, f.owner.id, webSubscription(BROWSER, await signIn(bia.id)))).toBe(false);
    expect(await listPushDevices(f.db, f.owner.id)).toEqual([]);

    // Signed in: on. Signing out (here, everywhere, or the session cleaned up) deletes it with the session.
    const session = await signIn(f.owner.id);
    expect(await registerPushDevice(f.db, f.owner.id, webSubscription(BROWSER, session))).toBe(true);
    await registerPushDevice(f.db, f.owner.id, { token: TOKEN_BIA, platform: "ios", locale: "en" });
    await f.db.delete(schema.sessions).where(eq(schema.sessions.id, session));
    expect((await listPushDevices(f.db, f.owner.id)).map((d) => d.token)).toEqual([TOKEN_BIA]);
  });
});

describe("web push delivery", () => {
  async function withBrowser(
    options: { gone?: string[]; failing?: string[]; refused?: string[]; unauthorized?: string[] } = {},
  ) {
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    await listMembers(f.db, f.org.id);
    await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
    const session = await signIn(bia.id);
    await registerPushDevice(f.db, bia.id, webSubscription(BROWSER, session));
    const webPush = createFakeWebPushSender(options);
    return { bia, webPush, session };
  }

  test("a mention goes to the browser encrypted to it: full text, the page to open, the tag", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser();
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia pode revisar?" });
    await drainOutbox(f.db, createJobHandlers({ ...f.jobDeps, webPush }));
    const [n] = await f.db.select().from(schema.notifications).where(eq(schema.notifications.userId, bia.id));
    expect(webPush.sent).toHaveLength(1);
    expect(webPush.sent[0]).toMatchObject({
      endpoint: BROWSER,
      urgency: "normal",
      topic: n?.id.replace(/-/g, ""),
      payload: {
        title: "ana mencionou você",
        body: "@bia pode revisar?",
        tag: n?.id,
        url: `/org/${f.org.id}/notifications`,
        data: { orgId: f.org.id, kind: "mention", notificationId: n?.id, channelId: f.general.id },
      },
    });
  });

  test("a subscription its push service says is gone is deleted; the phone still gets it", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser({ gone: [BROWSER_OLD] });
    await registerPushDevice(f.db, bia.id, webSubscription(BROWSER_OLD, await signIn(bia.id)));
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    const push = createFakePushSender();
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia oi" });
    await drainOutbox(f.db, createJobHandlers({ ...f.jobDeps, push, webPush }));
    expect(webPush.sent.map((m) => m.endpoint)).toEqual([BROWSER]);
    expect(push.sent).toHaveLength(1);
    expect((await listPushDevices(f.db, bia.id)).map((d) => d.token).sort()).toEqual([TOKEN_BIA, BROWSER].sort());
  });

  test("a refused signature (401/403) keeps the subscription: our own key or contact may be what's wrong", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser({ unauthorized: [BROWSER] });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:refused",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    // Not retried either: the same signature would be refused again.
    expect(await deliverPush({ db: f.db, webPush }, n?.id ?? "")).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect((await listPushDevices(f.db, bia.id)).map((d) => d.token)).toEqual([BROWSER]);
  });

  test("a browser whose session ran out gets nothing and is forgotten; the phone still gets it", async () => {
    f = await setup();
    const { bia, webPush, session } = await withBrowser();
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    await f.db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, session));
    const push = createFakePushSender();
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia ainda aí?" });
    await drainOutbox(f.db, createJobHandlers({ ...f.jobDeps, push, webPush }));
    expect(webPush.sent).toEqual([]);
    expect(push.sent).toHaveLength(1);
    expect((await listPushDevices(f.db, bia.id)).map((d) => d.token)).toEqual([TOKEN_BIA]);
  });

  test("nothing taken and every failure retryable: the job is tried again; something taken: no retry", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser({ failing: [BROWSER] });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:retry",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    const id = n?.id ?? "";
    await expect(deliverPush({ db: f.db, webPush }, id)).rejects.toMatchObject({ retryable: true });

    // A phone took it: the browser's failure is left alone, so the phone is never pushed twice.
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    const push = createFakePushSender();
    expect(await deliverPush({ db: f.db, push, webPush }, id)).toEqual({ sent: 1, removed: 0, failed: 1 });

    // A refused message (400) isn't retried either.
    webPush.failing.clear();
    webPush.refused.add(BROWSER);
    expect(await deliverPush({ db: f.db, webPush }, id)).toEqual({ sent: 0, removed: 0, failed: 1 });
  });

  test("a phone request that can't be retried fails the job, unless a browser took it", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser();
    await registerPushDevice(f.db, bia.id, { token: TOKEN_BIA, platform: "ios", locale: "pt-BR" });
    const [n] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "dm",
      groupKey: "dm:x",
      actor: { type: "user", id: f.owner.id },
      source: { channelId: f.general.id },
      latest: { text: "oi" },
    });
    const broken: PushSender = {
      id: "broken",
      send: async () => {
        throw new PushError("refused", false, 400);
      },
    };
    await expect(deliverPush({ db: f.db, push: broken }, n?.id ?? "")).rejects.toMatchObject({ retryable: false });
    expect(await deliverPush({ db: f.db, push: broken, webPush }, n?.id ?? "")).toEqual({
      sent: 1,
      removed: 0,
      failed: 1,
    });
  });

  test("someone with the app open: a mention waits 45 s and goes only if still unread", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser();
    const presence = createMemoryPresence();
    await presence.connect(f.org.id, bia.id, "tab-1");
    const handlers = createJobHandlers({ ...f.jobDeps, webPush, presence });
    await postPersonMessage(deps(), f.owner.id, f.org.id, f.general.id, { body: "@bia primeira" });
    await drainOutbox(f.db, handlers);
    expect(webPush.sent).toHaveLength(0);
    const held = (await pushJobs()).filter((p) => p.held === true);
    expect(held).toHaveLength(1);
    const heldKey = `push.send:${held[0]?.notificationId}:held`;
    const [job] = await f.db.select().from(schema.outbox).where(eq(schema.outbox.dedupeKey, heldKey));
    expect(job?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + PUSH_ACTIVE_DELAY_MS - 5_000);

    // Still unread 45 s later: it goes, even though the app is still open.
    await drainOutbox(f.db, handlers, { now: new Date(Date.now() + PUSH_ACTIVE_DELAY_MS + 1000) });
    expect(webPush.sent).toHaveLength(1);
  });

  test("read in the app meanwhile: no push; waiting things go at once", async () => {
    f = await setup();
    const { bia, webPush } = await withBrowser();
    const presence = createMemoryPresence();
    await presence.connect(f.org.id, bia.id, "tab-1");
    const handlers = createJobHandlers({ ...f.jobDeps, webPush, presence });
    const [mention] = await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "mention",
      groupKey: "mention:seen",
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "olha" },
    });
    await notify(deps(), {
      orgId: f.org.id,
      userIds: [bia.id],
      kind: "agent_question",
      groupKey: "agent_question:now",
      waiting: true,
      actor: { type: "agent", id: f.agent.id },
      source: { channelId: f.general.id },
      latest: { text: "Qual branch?" },
    });
    await drainOutbox(f.db, handlers);
    expect(webPush.sent.map((m) => (m.payload as { body: string }).body)).toEqual(["Qual branch?"]);
    expect(webPush.sent[0]?.urgency).toBe("high");
    await markNotificationRead(deps(), bia.id, f.org.id, mention?.id ?? "", true);
    await drainOutbox(f.db, handlers, { now: new Date(Date.now() + PUSH_ACTIVE_DELAY_MS + 1000) });
    expect(webPush.sent).toHaveLength(1);
  });
});

describe("VAPID keys", () => {
  const config = { PUBLIC_URL: "https://chat.example.com" };

  test("made once, sealed, and the same pair on every call", async () => {
    f = await setup();
    const first = await vapidKeys(f.db, [f.keyWrapper], config);
    expect(first.subject).toBe("https://chat.example.com");
    expect(Buffer.from(first.publicKey, "base64url").length).toBe(65);
    const [row] = await f.db.select().from(schema.instancePush);
    expect(row?.vapidPublicKey).toBe(first.publicKey);
    expect(row?.vapidPrivateKey).not.toContain(first.privateKey);
    expect(await vapidKeys(f.db, [f.keyWrapper], config)).toEqual(first);
  });

  test("a stored key this server can never open (another secret) is replaced, unless it was just made", async () => {
    f = await setup();
    const old = generateVapidKeys();
    const other = createLocalKeyWrapper("another-secret-".padEnd(48, "y"));
    await f.db.insert(schema.instancePush).values({
      id: 1,
      vapidPublicKey: old.publicKey,
      vapidPrivateKey: JSON.stringify(await sealSecret(other, old.privateKey, "instance_push:vapid")),
    });
    // Made a moment ago by a server with another AGENTES_SECRET: an error, so two servers never take turns.
    await expect(vapidKeys(f.db, [f.keyWrapper], config)).rejects.toThrow("AGENTES_SECRET");
    expect((await f.db.select().from(schema.instancePush))[0]?.vapidPublicKey).toBe(old.publicKey);

    const later = new Date(Date.now() + VAPID_KEEP_NEW_MS + 1000);
    const now = await vapidKeys(f.db, [f.keyWrapper], config, later);
    expect(now.publicKey).not.toBe(old.publicKey);
    const [stored] = await f.db.select().from(schema.instancePush);
    expect(stored?.vapidPublicKey).toBe(now.publicKey);
  });

  test("a key service that doesn't answer is an error to retry, never a new pair", async () => {
    f = await setup();
    const local = f.keyWrapper;
    let answering = false;
    const kms: KeyWrapper = {
      id: "kms:test",
      wrap: (key, aad) => local.wrap(key, aad),
      unwrap: async (wrapped, aad) => {
        if (!answering) throw new Error("key service timed out");
        return local.unwrap(wrapped, aad);
      },
    };
    const old = generateVapidKeys();
    await f.db.insert(schema.instancePush).values({
      id: 1,
      vapidPublicKey: old.publicKey,
      vapidPrivateKey: JSON.stringify(await sealSecret(kms, old.privateKey, "instance_push:vapid")),
      updatedAt: new Date(Date.now() - 86_400_000),
    });
    await expect(vapidKeys(f.db, [kms], config)).rejects.toThrow("timed out");
    expect((await f.db.select().from(schema.instancePush))[0]?.vapidPublicKey).toBe(old.publicKey);
    answering = true;
    expect(await vapidKeys(f.db, [kms], config)).toEqual({ ...old, subject: config.PUBLIC_URL });
  });

  test("another server replaced the pair: this one signs with the new one within a minute", async () => {
    f = await setup();
    const first = await vapidKeys(f.db, [f.keyWrapper], config);
    const next = generateVapidKeys();
    await f.db.update(schema.instancePush).set({
      vapidPublicKey: next.publicKey,
      vapidPrivateKey: JSON.stringify(await sealSecret(f.keyWrapper, next.privateKey, "instance_push:vapid")),
    });
    expect((await vapidKeys(f.db, [f.keyWrapper], config)).publicKey).toBe(first.publicKey);
    const later = new Date(Date.now() + VAPID_RECHECK_MS + 1000);
    expect(await vapidKeys(f.db, [f.keyWrapper], config, later)).toEqual({ ...next, subject: config.PUBLIC_URL });
  });

  test("pinned keys win and aren't stored; the subject falls back to the sender's address", async () => {
    f = await setup();
    const pinned = await vapidKeys(f.db, [f.keyWrapper], {
      PUBLIC_URL: "http://localhost:3000",
      EMAIL_FROM: "agentes.chat <ops@example.com>",
      WEB_PUSH_VAPID_PUBLIC_KEY: "pub",
      WEB_PUSH_VAPID_PRIVATE_KEY: "priv",
    });
    expect(pinned).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:ops@example.com" });
    expect(await f.db.select().from(schema.instancePush)).toEqual([]);
    expect(vapidSubject({ PUBLIC_URL: "http://localhost:3000", EMAIL_FROM: "ops@example.com" })).toBe(
      "mailto:ops@example.com",
    );
  });

  test("the subject is always a contact push services take: https or mailto, never a local name", () => {
    const subject = (PUBLIC_URL: string, EMAIL_FROM?: string) => vapidSubject({ PUBLIC_URL, EMAIL_FROM });
    expect(subject("https://chat.acme.com/")).toBe("https://chat.acme.com");
    expect(subject("https://agentes.tail1234.ts.net")).toBe("https://agentes.tail1234.ts.net");
    // Tried on one computer or a LAN, with no sender of its own: the project's site.
    for (const url of ["http://localhost:3000", "https://localhost", "https://agentes.local", "https://192.168.1.10"])
      expect(subject(url)).toBe(VAPID_FALLBACK_SUBJECT);
    expect(subject("http://chat.acme.com")).toBe(VAPID_FALLBACK_SUBJECT);
    expect(subject("http://localhost:3000", "agentes.chat <ping@localhost>")).toBe(VAPID_FALLBACK_SUBJECT);
    expect(subject("http://localhost:3000", "Ops <ops@acme.com>")).toBe("mailto:ops@acme.com");
    expect(subject("http://localhost:3000", "not an address")).toBe(VAPID_FALLBACK_SUBJECT);
  });
});
