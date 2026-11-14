import { afterEach, expect, test } from "bun:test";
import { channelTopic } from "@agenteschat/adapters";
import { schema } from "@agenteschat/db";
import { browser, createTestServer, joinByInvitation, seedOrg, signUp, type TestServer } from "./harness";

/** Long work over HTTP (ADR 0121): the anchor's view in the list, `agent.work` live, and Parar for who may. */

let t: TestServer;
afterEach(async () => {
  const current = t;
  t = undefined as unknown as TestServer;
  await current?.close();
});

type Msg = { id: string; threadId: string | null; meta: Record<string, unknown>; longWork?: Record<string, unknown> };

test("the anchor carries its work's view; agent.work goes out live; Parar is refused to others and ends it home", async () => {
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  t = await createTestServer({
    // Call 1 is the key's test when `seedOrg` saves it.
    reply: (_req, call) =>
      call === 1
        ? { chunks: ["ok"] }
        : call === 2
          ? {
              chunks: [],
              toolUses: [
                {
                  name: "work_in_background",
                  input: { title: "Migrar a cobrança", say: "Vou cuidar disso em segundo plano." },
                },
              ],
            }
          : { chunks: ["Ainda ", "migrando."], hold },
  });
  const owner = browser(t);
  await signUp(owner, "owner@example.com");
  const { orgId, channelId } = await seedOrg(owner);
  const org = `/api/app/organizations/${orgId}`;
  const events: { type: string; work?: { status: string; runId: string | null } }[] = [];
  t.adapters.pubsub.subscribe(channelTopic(channelId), (e) => events.push(e as (typeof events)[number]));

  expect(
    (await owner(`${org}/channels/${channelId}/messages`, { json: { body: "@dev migra a cobrança" } })).status,
  ).toBe(201);
  const drained = t.drain();
  for (let i = 0; i < 200 && !events.some((e) => e.type === "agent.work"); i++) await Bun.sleep(20);
  const live = events.find((e) => e.type === "agent.work");
  expect(live?.work?.status).toBe("live");
  const runId = live?.work?.runId as string;

  const timeline = async () =>
    ((await (await owner(`${org}/channels/${channelId}/messages`)).json()) as { messages: Msg[] }).messages;
  const list = await timeline();
  const anchor = list.find((m) => m.longWork);
  expect(anchor?.longWork).toMatchObject({
    title: "Migrar a cobrança",
    status: "live",
    runId,
    requestedByUserId: expect.any(String),
  });
  // The conversation's working row: the work runs in the background.
  const active = (await (await owner(`${org}/channels/${channelId}/active-runs`)).json()) as {
    runs: { runId: string; background: boolean }[];
  };
  expect(active.runs.find((r) => r.runId === runId)?.background).toBe(true);

  const bia = await joinByInvitation(t, owner, orgId, "bia@example.com");
  const refused = await bia(`${org}/runs/${runId}/cancel`, { json: {} });
  expect([403, 404]).toContain(refused.status);
  expect((await owner(`${org}/runs/${runId}/cancel`, { json: {} })).status).toBe(200);
  release();
  await drained;
  await t.drain();

  const [work] = await t.db.select().from(schema.agentWorks);
  expect(work?.status).toBe("canceled");
  const after = await timeline();
  const end = after.find((m) => (m.meta.workEnd as { id?: string } | undefined)?.id === work?.id);
  expect(end?.threadId).toBeNull();
  expect(end?.meta.workEnd).toMatchObject({ status: "canceled" });
  expect(after.find((m) => m.longWork)?.longWork).toMatchObject({ status: "canceled" });
});

test("Continuar agora on several: needs run ids; a run no longer paused is skipped", async () => {
  t = await createTestServer({ reply: () => ({ chunks: ["ok"] }) });
  const owner = browser(t);
  await signUp(owner, "owner@example.com");
  const { orgId } = await seedOrg(owner);
  const go = (runIds: string[]) =>
    owner(`/api/app/organizations/${orgId}/task-manager/continue`, { method: "POST", json: { runIds } });
  expect((await go([])).status).toBe(400);
  const res = await go([crypto.randomUUID()]);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ continued: 0 });
});

test("the task manager counts today's done tasks only when asked", async () => {
  t = await createTestServer();
  const owner = browser(t);
  await signUp(owner, "owner@example.com");
  const { orgId } = await seedOrg(owner);
  const view = async (query: string) =>
    (await (await owner(`/api/app/organizations/${orgId}/task-manager${query}`)).json()) as { doneToday?: number };
  expect("doneToday" in (await view(""))).toBe(false);
  expect((await view("?doneToday=true")).doneToday).toBe(0);
});
