import type { PubSub } from "@agenteschat/adapters";
import { and, type Database, desc, type Executor, eq, gt, inArray, isNull, schema, sql } from "@agenteschat/db";
import { aiConnectIntent, type ConnectIntent } from "./ai-intent";
import { type AgentAi, type AiStatusDeps, agentAiState, type NoAiReason, orgHasAi } from "./ai-status";
import { audienceError, canTalkTo, type Speaker, speakerFor } from "./audience";
import { recordAudit } from "./audit";
import { BRAIN_NAMES } from "./brains/types";
import { mayStopRun, runRequester } from "./cancel";
import { requireChannelAccess } from "./channels";
import { requesterOf, startOrJoinRun } from "./dispatch";
import { queuePlanWaiting } from "./email";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors";
import { publishChannelEvent, publishMessageCreated, publishRouted } from "./events";
import type { Judge } from "./judge";
import { getMessage, insertMessage, type Message, messageView } from "./messages";
import { can, type Membership, requireActiveMembership } from "./organizations";
import { type RouterDeps, routeMessage } from "./router";
import { bodyCode } from "./run-tools";
import { type AgentRun, NO_AI, replyThreadOf } from "./runs";
import { assertCanWork, billingHold } from "./standing";
import { continueStretch, stretchCardOf } from "./stretch";
import { continueUsagePause, usagePauseCardOf } from "./usage-pause";
import { withWikiLinks } from "./wiki-links";

const { agentRunSteps, agentRuns, agents, messages, routingDecisions } = schema;

/**
 * The card's English body (the apps show `chat.body.no_ai`, `no_ai_signed_out` for a sign-in that ended, or
 * `no_ai_not_signed_in` for the computer's own sign-in that isn't there).
 */
export const NO_AI_TEXT = "I can't answer yet: I have no AI connected.";
const NO_AI_SIGNED_OUT_TEXT = "I can't answer yet: my AI is signed out.";
const noAiNotSignedInText = (own: NonNullable<AgentAi["own"]>) =>
  `I can't answer yet: ${BRAIN_NAMES[own]} isn't signed in on my computer.`;
/**
 * Why it can't think, when that's more than no AI: its computer has no such CLI or no computer at all, and for the
 * team's right hand on a plan (`rightHandNoAiReason`), why that plan can't think for this message.
 */
const REASON_TEXT: Partial<Record<NoAiCardReason, string>> = {
  cli_missing: "I can't answer yet: my AI's program isn't installed on my computer.",
  no_computer: "I can't answer yet: my AI needs a computer and I have none.",
  computer_away: "I can't answer now: the computer my plan is signed in on is away.",
  computer_failed: "I can't answer now: the computer my plan is signed in on had a problem.",
  cli_failed: "I can't answer now: my plan's AI stopped with an error.",
  plan_limit: "I can't answer now: the plan I think with reached its limit.",
  model_limit: "I can't answer now: the model I think with reached its own limit on my plan.",
  model_region: "I can't answer: the model I think with needs the Global region on in OpenCode (Settings › Privacy).",
  model_off: "I can't answer: OpenCode refused the model I think with. Turn it on in OpenCode or change my model.",
  plan_inactive:
    "I can't answer: OpenCode Go isn't active on my key's OpenCode account. Check the Go subscription in OpenCode, or connect a key from the account that has it.",
  commands_off: "I can't answer now: commands are turned off on my plan's computer.",
  plan_not_shared:
    "I can't answer you on the workspace's plan: it serves only its owner. Connect your own plan and I will.",
  plans_not_yours:
    "I can't answer you: the plans connected here serve only the people who connected them. Connect your own and I will.",
  plan_unattended:
    "I didn't answer: the request didn't come from a person, and the workspace's plan serves only its owner.",
  runner_outdated: "I can't answer now: the program on my plan's computer needs an update.",
  plan_tools: "I stopped before answering: my plan's AI on that computer offers tools of its own.",
  plan_hold: "I kept your message. I'll answer here once the workspace has an agentes.chat plan and an AI connected.",
};
/** `cli_failed` with what the plan's CLI said (`NoAiCard.why`). */
const cliFailedText = (why: string) => `I can't answer now: my plan's AI stopped with an error (${why}).`;

/**
 * `plan_hold`: no word on its AI: a billing hold stopped the run, and the card keeps the message for after the plan.
 * `plan_unattended`: the right hand's run nobody is behind, on a plan that answers only its owner: no one's own plan
 * would answer it, so the card never says to connect one.
 */
export type NoAiCardReason = NoAiReason | "plan_hold" | "plan_unattended";

/** A conversation gets the card again only after this long (per agent; once while the organization has no AI). */
export const NO_AI_CARD_EVERY_MS = 6 * 3600_000;

/** `meta.noAi` of a card: whose it is, who asked, why, and the Connect step the message asked for. */
export interface NoAiCard extends ConnectIntent {
  agentId: string;
  forUserId: string | null;
  reason: NoAiCardReason;
  /** With `not_signed_in`: the computer's own sign-in of this CLI isn't there, not an account's (`AgentAi.own`). */
  own?: AgentAi["own"];
  /** With `model_limit`, `model_region` and `model_off`: the model's name the line says ("Kimi K2"). */
  model?: string;
  /** With `cli_failed`: what the plan's CLI said (`cliWords`), the cause the line names. */
  why?: string;
  /** With `plans_not_yours`: whose the workspace's plans are, and what they are ("Claude"). */
  owner?: string;
  plan?: string;
  /** The run that couldn't think (deleted when "Responder agora" starts it again). */
  runId: string;
}

export const noAiCardOf = (m: Pick<Message, "authorType" | "meta">): NoAiCard | null => {
  const card = m.meta.noAi as Partial<NoAiCard> | undefined;
  return m.authorType === "agent" && card && typeof card.agentId === "string" ? (card as NoAiCard) : null;
};

/** Agents with a card in this conversation within `NO_AI_CARD_EVERY_MS`. */
async function cardsPosted(db: Executor, run: Pick<AgentRun, "orgId" | "channelId">, threadId: string | null) {
  const rows = await db
    .select({ agentId: messages.authorAgentId })
    .from(messages)
    .where(
      and(
        eq(messages.orgId, run.orgId),
        eq(messages.channelId, run.channelId),
        threadId ? eq(messages.threadId, threadId) : isNull(messages.threadId),
        gt(messages.createdAt, new Date(Date.now() - NO_AI_CARD_EVERY_MS)),
        isNull(messages.deletedAt),
        sql`${messages.meta}->>'bodyCode' = ${NO_AI}`,
      ),
    );
  return rows.map((r) => r.agentId);
}

/**
 * The agent says it can't answer for want of an AI, where the run replies, with Connect (`meta.noAi`).
 * Once per agent and conversation every 6 hours, and once per conversation while the whole organization
 * has no AI. A person's message is read by Jev for the Connect step it asks for, outside the transaction
 * (a slow call must not hold its lock). Null when it wasn't repeated.
 */
export async function postNoAiCard(
  deps: AiStatusDeps & { db: Database; pubsub: PubSub; judge?: Judge | null },
  run: AgentRun,
  reason: NoAiCardReason,
  own?: AgentAi["own"],
  model?: string,
  why?: string,
  notYours?: Pick<AgentAi, "owner" | "plan">,
): Promise<Message | null> {
  const { db } = deps;
  const threadId = replyThreadOf(run);
  const posted = await cardsPosted(db, run, threadId);
  if (posted.includes(run.agentId)) return null;
  const orgHasNoAi = !(await orgHasAi(deps, run.orgId));
  const repeated = (agentIds: (string | null)[]) =>
    agentIds.includes(run.agentId) || (agentIds.length > 0 && orgHasNoAi);
  if (repeated(posted)) return null;
  const trigger = await getMessage(db, run.orgId, run.triggerMessageId);
  const forUserId = trigger ? await requesterOf(db, trigger) : null;
  // On a billing hold nothing reads the message: no model call before a plan.
  const intent: ConnectIntent =
    trigger?.authorType === "person" && reason !== "plan_hold"
      ? await aiConnectIntent(deps.judge, { orgId: run.orgId, agentId: run.agentId, runId: run.id, text: trigger.body })
      : { intent: "task" };
  const card = await db.transaction(async (tx) => {
    // The agents of one message fail together: they take turns here, so the organization gets one card.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`no-ai-card:${run.channelId}:${threadId ?? ""}`}))`);
    if (repeated(await cardsPosted(tx, run, threadId))) return null;
    const noAi: NoAiCard = {
      agentId: run.agentId,
      forUserId,
      reason,
      ...(own ? { own } : {}),
      ...(model ? { model } : {}),
      ...(why && reason === "cli_failed" ? { why } : {}),
      ...(reason === "plans_not_yours" && notYours?.owner ? { owner: notYours.owner, plan: notYours.plan } : {}),
      ...intent,
      runId: run.id,
    };
    return insertMessage(tx, {
      orgId: run.orgId,
      channelId: run.channelId,
      threadId,
      author: { type: "agent", agentId: run.agentId, runId: run.id, hop: run.hop },
      body: own
        ? noAiNotSignedInText(own)
        : noAi.why
          ? cliFailedText(noAi.why)
          : (REASON_TEXT[reason] ?? (reason === "not_signed_in" ? NO_AI_SIGNED_OUT_TEXT : NO_AI_TEXT)),
      meta: { ...bodyCode(NO_AI), noAi },
    });
  });
  if (!card) return null;
  if (reason === "plan_hold" && (await billingHold(db, run.orgId)) === "payment") await queuePlanWaiting(db, run.orgId);
  const [view] = await withWikiLinks(db, run.orgId, [messageView(card)]);
  if (view) await publishMessageCreated(deps.pubsub, view);
  return card;
}

export interface AnswerNowDeps extends AiStatusDeps {
  db: Database;
  pubsub?: PubSub;
  /** The router of `message.posted`; null when routing is off. */
  router?: RouterDeps | null;
}

type Answering = { agentId: string; runId: string }[];

/**
 * The runs a "Responder agora" is about: for a card, its agent's newest run in that conversation; for a
 * person's message, the runs it started. A kept message's card: every run that message started.
 */
async function answeringRuns(db: Database, message: Message, card: NoAiCard | null) {
  const runs = () =>
    db
      .select({ run: agentRuns, agent: agents, requester: runRequester })
      .from(agentRuns)
      .innerJoin(agents, eq(agents.id, agentRuns.agentId))
      .leftJoin(messages, and(eq(messages.id, agentRuns.triggerMessageId), eq(messages.orgId, agentRuns.orgId)));
  const started = (triggerId: string) =>
    runs().where(and(eq(agentRuns.orgId, message.orgId), eq(agentRuns.triggerMessageId, triggerId)));
  if (!card) return started(message.id);
  const newest = await runs()
    .where(
      and(
        eq(agentRuns.orgId, message.orgId),
        eq(agentRuns.agentId, card.agentId),
        eq(agentRuns.channelId, message.channelId),
        eq(agentRuns.background, false),
        // Where the card is: its thread, or the main timeline (a run asked there has its trigger as its root).
        message.threadId
          ? eq(agentRuns.threadRootId, message.threadId)
          : sql`${agentRuns.threadRootId} = ${agentRuns.triggerMessageId}`,
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);
  // A kept message's agents share one card (`postNoAiCard`): every one of them was asked, and answers after the plan.
  return card.reason === "plan_hold" && newest[0] ? started(newest[0].run.triggerMessageId) : newest;
}

type AnsweringRun = Awaited<ReturnType<typeof answeringRuns>>[number];

const forbidden = () =>
  new ForbiddenError("Only who asked, the agent's owner or an admin can do this", "run.answer_forbidden");
const stillMissing = () => new ConflictError("There is still no AI connected", "ai.still_missing");
const notRestartable = () =>
  new ConflictError("This reply had already started, so it can't start over: ask again", "run.not_restartable");

/**
 * A `no_ai` run that resumed (after an approval or a question) or met a signed-out tool in a later turn may
 * have done things; starting it over would do them again, and deleting it would take its approvals,
 * questions and steps with it.
 */
const WORK_STEPS = ["tool_call", "message", "approval"] as const;

async function didWork(db: Executor, runId: string) {
  const [step] = await db
    .select({ id: agentRunSteps.id })
    .from(agentRunSteps)
    .where(and(eq(agentRunSteps.runId, runId), inArray(agentRunSteps.kind, [...WORK_STEPS])))
    .limit(1);
  return step !== undefined;
}

/**
 * Starts a failed run again on the person's own message, in one transaction: the old run is deleted (it
 * did nothing; its steps go with it, its usage records stay), so `(trigger_message_id, agent_id)` stays
 * unique and the requester, authority, hop and budget checks are the normal ones. When another call got
 * there first, the run it started (null if none); `worked` when the run had done something, and stays.
 */
async function restartFailedRun(deps: AnswerNowDeps, userId: string, failed: AgentRun) {
  const trigger = await getMessage(deps.db, failed.orgId, failed.triggerMessageId);
  if (!trigger || trigger.deletedAt) return null;
  // A failed run gets no more steps, so this still holds in the transaction below.
  if (await didWork(deps.db, failed.id)) return "worked" as const;
  const started = await deps.db.transaction(async (tx) => {
    const [gone] = await tx
      .delete(agentRuns)
      .where(and(eq(agentRuns.id, failed.id), eq(agentRuns.status, "failed")))
      .returning({ id: agentRuns.id });
    if (!gone) return null;
    // A person's click: an agent's message it answers starts a stretch of its own (ADR 0089).
    const next = await startOrJoinRun(
      tx,
      trigger,
      failed.agentId,
      failed.trigger,
      trigger.hop >= 1 ? { granted: Bun.randomUUIDv7() } : {},
    );
    if (!next) return null;
    const runId = "created" in next ? next.created.id : next.joined;
    await recordAudit(tx, {
      orgId: failed.orgId,
      actor: { type: "person", id: userId },
      action: failed.error === NO_AI ? "run.answered_after_connect" : "run.retried",
      target: { type: "agent_run", id: runId },
      details: { oldRunId: failed.id, agentId: failed.agentId, messageId: trigger.id },
    });
    return { runId, created: "created" in next ? next.created : null };
  });
  if (!started) return current(deps.db, failed);
  // The message's receipt follows the new run at once, on every device: until a worker claims it, nothing else names
  // the message, and the line under it would still say the old run failed.
  const who = { agentId: failed.agentId, runId: started.runId };
  if (started.created) {
    const { channelId } = started.created;
    await publishChannelEvent(deps.pubsub, {
      type: "agent.thinking",
      channelId,
      threadId: replyThreadOf(started.created),
      ...who,
    });
    await publishChannelEvent(deps.pubsub, { type: "message.claimed", channelId, messageId: trigger.id, ...who });
  } else {
    // Into the agent's task already at work: said as a message sent into it is.
    const [task] = await deps.db
      .select({
        channelId: agentRuns.channelId,
        threadRootId: agentRuns.threadRootId,
        triggerMessageId: agentRuns.triggerMessageId,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, failed.orgId), eq(agentRuns.id, started.runId)));
    if (task)
      await publishChannelEvent(deps.pubsub, {
        type: "agent.run.steered",
        channelId: task.channelId,
        threadId: replyThreadOf(task),
        messageId: trigger.id,
        ...who,
      });
  }
  return { agentId: failed.agentId, runId: started.runId };
}

/** What answers `(trigger, agent)` now that another call restarted the failed run: a second click returns it. */
async function current(db: Executor, failed: AgentRun) {
  const [run] = await db
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, failed.orgId),
        eq(agentRuns.triggerMessageId, failed.triggerMessageId),
        eq(agentRuns.agentId, failed.agentId),
      ),
    )
    .limit(1);
  return run && run.status !== "failed" ? { agentId: failed.agentId, runId: run.id } : null;
}

/**
 * Routes a message again whose decision was `no_ai`: the decision is deleted and `routeMessage` called
 * directly (enqueueing `message.posted` again would do nothing: its dedupe key is still in the outbox).
 * Null when there is no such decision (any more).
 */
async function rerouteNoAiMessage(deps: AnswerNowDeps, userId: string, membership: Membership, message: Message) {
  if (!deps.router) return null;
  const noAiDecision = and(
    eq(routingDecisions.orgId, message.orgId),
    eq(routingDecisions.messageId, message.id),
    eq(routingDecisions.error, NO_AI),
  );
  const [decision] = await deps.db.select({ id: routingDecisions.id }).from(routingDecisions).where(noAiDecision);
  if (!decision) return null;
  if (message.authorUserId !== userId && !can(membership, "manage_agents")) throw forbidden();
  if (!(await orgHasAi(deps, message.orgId))) throw stillMissing();
  const deleted = await deps.db.delete(routingDecisions).where(noAiDecision).returning({ id: routingDecisions.id });
  if (deleted.length === 0) return null;
  // Asked for this very message: decided alone, at once.
  const res = await routeMessage({ ...deps.router, quietMs: 0 }, { orgId: message.orgId, messageId: message.id });
  await publishRouted(deps.pubsub, message, {
    strategy: res.seenBy ? "router" : "none",
    seenBy: res.seenBy ?? [],
    runs: res.runs,
    ...(res.reason ? { reason: res.reason } : {}),
    ...(res.decidedBy ? { decidedBy: res.decidedBy } : {}),
  });
  return res.runs.map((r) => ({ agentId: r.agentId, runId: r.id }));
}

/**
 * "Responder agora" (`POST …/messages/{id}/answer-now`, ADR 0061), once an AI is connected. The id is a
 * no-AI card (its agent's newest run in that conversation) or the person's message (the runs it started,
 * else its `no_ai` routing decision). A failed `no_ai` run that did nothing starts again on the person's
 * own message (one that did something: 409 `run.not_restartable`); a `no_ai` decision is routed again. On the
 * person's own message any failed run that did nothing starts again the same way ("Tentar de novo": no second
 * copy of the message); a failed one it can't restart (long work, background) isn't returned. The
 * same people as "Continuar" (`mayStopRun`). 409 `ai.still_missing` while there's still none;
 * 403 `audience.*` when the agent no longer answers who asked; pressed again, it returns what answers the
 * message. On a stretch's pause card it is that card's Continuar (`continueStretch`, ADR 0089).
 */
export async function answerNow(
  deps: AnswerNowDeps,
  userId: string,
  orgId: string,
  messageId: string,
): Promise<{ runs: Answering }> {
  const message = await getMessage(deps.db, orgId, messageId);
  if (!message || message.deletedAt) throw new NotFoundError("Message not found");
  const usage = message.authorType === "agent" ? usagePauseCardOf(message.meta) : null;
  // A long-work pause card may sit in an agents' DM (the paused run answers another agent), which no person is a
  // member of: people open it from where they asked. Who may press it is the run's rule alone (`mayStopRun`), as
  // for its "Don't run it" (`cancelRun`) and the task manager's line (`continuePausedRuns`).
  const membership = usage
    ? await requireActiveMembership(deps.db, userId, orgId)
    : (await requireChannelAccess(deps.db, userId, orgId, message.channelId)).membership;
  // Refused here, first: a key saved earlier reads as ready, and the restarted run would only be refused again.
  await assertCanWork(deps.db, orgId);
  const paused = message.authorType === "agent" ? stretchCardOf(message.meta) : null;
  if (paused) return continueStretch(deps, userId, membership, message, paused);
  if (usage) return continueUsagePause(deps, userId, membership, message, usage);
  const card = noAiCardOf(message);
  const found = await answeringRuns(deps.db, message, card);
  // "Tentar de novo" on a person's own message restarts any failed run of theirs; elsewhere only `no_ai` ones.
  const retried = !card && message.authorType === "person";
  const failed = found.filter(
    (r) => r.run.status === "failed" && !r.run.background && (r.run.error === NO_AI || (retried && !r.run.workId)),
  );
  if (failed.length > 0) {
    const allowed: AnsweringRun[] = [];
    for (const r of failed)
      if (await mayStopRun(deps.db, userId, membership, { ...r, ownerUserId: r.agent.ownerUserId })) allowed.push(r);
    if (allowed.length === 0) throw forbidden();
    const ready: AnsweringRun[] = [];
    for (const r of allowed) if ((await agentAiState(deps, r.agent, r.run)).state !== "no_ai") ready.push(r);
    if (ready.length === 0) throw stillMissing();
    // Who the agent answers may have narrowed since (an agent moved onto a plan answers only its owner until they
    // turn on Atende outras pessoas, ADR 0059 §5):
    // a run starts again only for someone it still answers.
    // …and whose roles still let them talk to agents (`talk_to_agents`, ADR 0085).
    const talks = new Map<string | null, Speaker>();
    for (const r of ready)
      if (!talks.has(r.requester)) talks.set(r.requester, await speakerFor(deps.db, orgId, r.requester));
    const heard = ready.filter((r) =>
      canTalkTo(r.agent, r.requester, talks.get(r.requester) ?? { talks: false, roleIds: [] }),
    );
    const [first] = ready;
    if (heard.length === 0 && first) throw await audienceError(deps.db, first.agent);
    const runs: Answering = [];
    let worked = false;
    for (const r of heard) {
      const started = await restartFailedRun(deps, userId, r.run);
      if (started === "worked") worked = true;
      else if (started) runs.push(started);
    }
    if (runs.length === 0 && worked) throw notRestartable();
    return { runs };
  }
  if (!card && message.authorType === "person") {
    const rerouted = await rerouteNoAiMessage(deps, userId, membership, message);
    if (rerouted) return { runs: rerouted };
  }
  // A failed run left here (long work, a background run) doesn't answer: an empty list sends the words again.
  return {
    runs: found.filter((r) => r.run.status !== "failed").map((r) => ({ agentId: r.run.agentId, runId: r.run.id })),
  };
}
