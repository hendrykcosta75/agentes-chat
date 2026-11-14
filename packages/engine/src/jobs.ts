import type {
  BlobStore,
  EmailSender,
  GifProvider,
  MailAdapters,
  Presence,
  PushSender,
  SearchIndexResolver,
  SearchKind,
  WebPushSender,
} from "@agenteschat/adapters";
import { and, count, eq, inArray, isNull, ne, queryTrace, schema, sql } from "@agenteschat/db";
import { ACCOUNT_CONTACT_JOB, saveAccountContact } from "./account-contacts";
import { AGENT_MEDIA_JOB, enqueueAgentMedia, maybeSendAgentMedia } from "./agent-media";
import { aiConnectIntent, type ConnectIntent } from "./ai-intent";
import { orgHasAi } from "./ai-status";
import type { ArtifactDeps } from "./artifacts";
import { PLAN_OPENED_JOB } from "./audience";
import { routinePostRun, runAuthorityById } from "./authority";
import { AUTONOMY_REPORT_JOB, queueAutonomyEmail } from "./autonomy-report";
import { closePoll, POLL_CLOSE_JOB } from "./blocks";
import { PLAN_LENT_JOB } from "./brain-settings";
import { type BrakeReport, brakeWakes, callableAgents, LATER_JOB, notCallableWhy } from "./brakes";
import { HANDOFF_REMIND_JOB, remindBrowserHandoff } from "./browser/handoff";
import { typingLogFor } from "./burst";
import { CHANNEL_DELETE_JOB, purgeChannel } from "./channel-deletion";
import { crowdedAgents, publishQueueChanged } from "./computer-queue";
import type { ConnectorDeps } from "./connectors/connections";
import { startNoteRun } from "./consultations";
import { getChannelCached } from "./context";
import { consolidateOrg } from "./context/consolidate";
import { applyReactionFeedback } from "./context/feedback";
import { LEARN_JOB, learnRun } from "./context/learn";
import { REFLECT_DEFAULTS, reflectThread } from "./context/reflect";
import { judgeOf, summaryModelReady } from "./context/summaries";
import { reportDroppedMentions, tellWakeSkipped } from "./continuation";
import { DEVICE_WAIT_EXPIRED_JOB, expireDeviceWait } from "./device-waits";
import {
  deferMentionReport,
  deliverParked,
  dispatchDm,
  dispatchMentions,
  INBOX_JOB,
  MENTION_REPORT_JOB,
  type RunTrigger,
  reportMentionReplies,
  requesterOf,
} from "./dispatch";
import { isAgentOnlyDm } from "./dms";
import {
  type EmailArt,
  PLAN_WAITING_JOB,
  queuePlanLent,
  queuePlanOpenedEmail,
  queuePlanWaiting,
  sendPlanWaitingEmail,
  sendQueuedEmail,
} from "./email";
import { forgetCodeEmail } from "./email-codes";
import { type DecidedBy, publishListChanged, publishRouted } from "./events";
import { executeRun, type RunExecutorDeps } from "./executor";
import {
  FEEDBACK_FILE_PURGE_JOB,
  FEEDBACK_JOB,
  type Feedback,
  isFeedbackRelay,
  purgeFeedbackFile,
  relayQueuedFeedback,
  sendQueuedFeedback,
} from "./feedback";
import { FOLLOW_UP_JOB, wakeFollowUp } from "./follow-through";
import { cutText } from "./format";
import type { GitHubAppAccess } from "./git/github-call";
import { GITHUB_EVENT_JOB, type GitHubAppEvent, handleGitHubAppEvent } from "./git/github-events";
import { FILE_JOIN_REQUEST_JOB, fileJoinRequest } from "./invite-requests";
import { announceTaskConversation } from "./issues";
import type { JevKey, JevKeySource } from "./jev-key";
import { DEEP_MENTION_THRESHOLD, DEEP_WAKE_HOP, MENTION_WAKE_THRESHOLD, mentionNeedsNothing } from "./judge";
import { platformCapReached } from "./limits";
import { wakeForAccessDecision } from "./machine-access";
import type { MachineCaller } from "./machine-hub";
import {
  checkCutTaskStart,
  interruptOfflineMachineTasks,
  startMachineTask,
  type TaskCall,
  wakeConversationForTask,
} from "./machine-tasks";
import { isMediaAfterReply, isMediaOnly } from "./media";
import { getMessage, referencedOf } from "./messages";
import { checkMissionDone } from "./mission-delivery";
import { onMissionTaskEnded, syncMissionFiles } from "./mission-sync";
import { afterMachineTaskEnded, afterMissionRunEnded, startQueuedMissionTasks } from "./mission-worktree";
import { type MissionDeps, missionOfThread, missionRole, reactivateMission } from "./missions";
import { KEEP_GOING_JOB, keepMissionGoing, type MissionEngine } from "./missions-engine";
import { notifyMessage } from "./notification-producers";
import { ORG_FILES_PURGE_ATTEMPTS, ORG_FILES_PURGE_JOB, USER_FILES_PURGE_JOB } from "./organizations";
import { outOfOfficeIds } from "./out-of-office";
import { enqueue, type JobHandlers, type OutboxJob, PermanentJobError } from "./outbox";
import { checkParkedRun, EARLY_CHECK_JOB, scheduleParkedChecks } from "./parked-asks";
import { PARTNER_WAITLIST_CONTACT_JOB, savePartnerWaitlistContact } from "./partner-waitlist";
import { notifyPersonLimit, PERSON_LIMIT_JOB } from "./person-usage";
import { deliverPush } from "./push";
import { reachOf, settleReach } from "./reach";
import { routineCreatorOf } from "./requester";
import { considerCard, RIGHT_HAND_DECIDE_JOB } from "./right-hand-approvals";
import { lodiLaneHandlers } from "./right-hand-lanes";
import {
  createLlmRouterStrategy,
  DEFAULT_ROUTER_POLICY,
  type RouterDeps,
  type RouterStrategy,
  routeMessage,
  smallModelFor,
} from "./router";
import { createJevRouterStrategy, jevCostNanoUsd, routeChain } from "./router-jev";
import { createPlanRouterStrategy } from "./router-plan";
import { executeRoutineRun } from "./routines";
import { type AgentRun, NO_AI } from "./runs";
import type { SandboxDeps } from "./sandbox";
import { indexSource, reindexOrg } from "./search";
import { activateDeliveredSecret, discardClosedSecret } from "./secrets";
import { runSkillUpdates, SKILL_UPDATES_JOB } from "./skill-updates";
import type { SkillDeps } from "./skills";
import { TEAM_HELLO_JOB } from "./standing";
import { purgeOrgFiles, purgeUserFiles, runMigration, type StorageDeps } from "./storage";
import { postStretchCard, STRETCH_JOB, type StretchHold } from "./stretch";
import { sayTeamHello } from "./team-templates";
import { postTeamWeek, TEAM_DAY_JOB, TEAM_WEEK_JOB } from "./team-week";
import { isAgentesCloud } from "./telemetry";
import { assessThread } from "./thread-assess";
import { runVaultSync, VAULT_SYNC_JOB, type VaultDeps } from "./vault";
import { transcribeVoiceClip, VOICE_JOB, type VoiceDeps } from "./voice";
import { saveWaitlistContact } from "./waitlist";
import { checkInWork, followUpWork, WORK_CHECK_IN_JOB, WORK_FOLLOW_UP_JOB } from "./works";
import {
  ACCOUNT_DELETE_JOB,
  type DeletionDeps,
  ORG_DELETE_JOB,
  purgeAccount,
  purgeWorkspace,
} from "./workspace-deletion";

/** A thread that grew by another `everyMessages` gets reflected on (capture), within the per-thread cap. */
async function maybeEnqueueReflection(deps: JobDeps, orgId: string, threadId: string) {
  const every = deps.context?.reflect?.everyMessages ?? REFLECT_DEFAULTS.everyMessages;
  const [row] = await deps.db
    .select({ n: count() })
    .from(schema.messages)
    .where(and(eq(schema.messages.orgId, orgId), eq(schema.messages.threadId, threadId)));
  const n = Number(row?.n ?? 0);
  if (n === 0 || n % every !== 0) return;
  // No model to reflect with: a job would only fail (ADR 0167).
  if (deps.context && !(await summaryModelReady(deps.context, orgId))) return;
  await enqueue(deps.db, {
    orgId,
    kind: "context.reflect",
    payload: { threadRootId: threadId },
    dedupeKey: `context.reflect:${threadId}:n${n}`,
  });
}

export interface JobDeps extends RunExecutorDeps {
  maxHops: number;
  /** Search index (jobs `search.index`, `search.reindex`). */
  search?: SearchIndexResolver;
  /** Transactional email (job `email.send`). */
  email?: EmailSender;
  /** Where feedback's pictures and videos are kept (jobs `feedback.send`, `feedback.file.purge`). */
  feedbackBlobs?: BlobStore;
  /** How a feedback reaches the agentes.chat team's inbox (ADR 0160 §13); the network's own by default. */
  feedbackFetch?: typeof fetch;
  /** Where emails get their pictures (`emailArtFor`); absent: from each link's own server. */
  emailArt?: EmailArt;
  /** Push to the phone app (job `push.send`); absent = push off. */
  push?: PushSender | null;
  /** Web Push to browsers (job `push.send`, ADR 0071); absent = off. */
  webPush?: WebPushSender | null;
  /** This server sends email: a deleted account is told (job `account.delete`). */
  accountEmails?: DeletionDeps["emails"];
  /** Revokes an account's Apple sign-in at its deletion (job `account.delete`); absent/null = Apple sign-in off. */
  appleRevoke?: Parameters<typeof purgeAccount>[0]["appleRevoke"];
  /** Who has the app open: pushes not waiting on them hold a little (ADR 0071 §7); absent = never held. */
  presence?: Presence | null;
  /** This server's address, sent with phone pushes (`PushDeps.server`, ADR 0154). */
  pushServer?: string | null;
  /** GIF search (ADR 0091): an agent's GIF after its reply (job `agents.media`); absent = its own stickers only. */
  gifs?: GifProvider | null;
  /** Org storage (job `storage.migrate`). */
  storage?: StorageDeps;
  /** Skills that update by themselves from their links (job `skills.update`). */
  skills?: SkillDeps;
  /** Voice messages (job `voice.transcribe`, ADR 0100). */
  voice?: VoiceDeps;
  /** The Vault's sources (job `vault.sync`, ADR 0144); absent: connections aren't read again. */
  vault?: VaultDeps;
  /** Connectors: job `org.delete` revokes a workspace's GitHub OAuth grants at GitHub before its rows go. */
  connectors?: ConnectorDeps;
  /** The server's GitHub App: job `org.delete` uninstalls it from the workspace's GitHub accounts (ADR 0156). */
  githubApp?: GitHubAppAccess;
  /** People's mailboxes: job `org.delete` has Composio forget a workspace's mailboxes before its rows go. */
  mail?: MailAdapters | null;
  /** What a deleted workspace leaves in the server's log (job `org.delete`). */
  log?: {
    info(message: string, data?: Record<string, unknown>): void;
    warn(message: string, data?: Record<string, unknown>): void;
  };
  /** Drive (routines' reports, polls). */
  artifacts?: ArtifactDeps;
  /** Agents' computers: the hub and public URL missions use. */
  sandbox?: SandboxDeps | null;
  /** The engine missions start, resume and cancel runs with (default: today's run queue). */
  missionEngine?: MissionEngine | null;
  router?: {
    /** Off = only @mentions start runs. */
    enabled: boolean;
    /** The small model on a Claude key (ROUTER_MODEL); an org may override it in its settings. */
    model: string;
    /** The small model on another provider's key (e.g. `{ openai: "gpt-6-luna" }`); else its catalog pick. */
    cheapModels?: Record<string, string>;
    minScore?: number;
    /** Probability that an agent's @mention asks the agent it names to act, for it to wake (`MENTION_WAKE_THRESHOLD`). */
    mentionThreshold?: number;
    /** Replaces the core small-model step (e.g. an optional external classifier). */
    strategy?: RouterStrategy;
    /** TypeSafe Jev as the chain's first step (the installation's key, never per org). */
    jev?: { key: JevKeySource; timeoutMs?: number; fetch?: typeof fetch; baseURL?: string };
    /**
     * The author's own plan as a step (ADR 0074 §3): the computers it picks on, and this server's address. Off
     * on the Cloud (`isAgentesCloud`), where Jev is ours. Absent: no plan step.
     */
    plans?: { hub: Pick<MachineCaller, "call" | "status">; publicUrl: string };
    /** How long a person's message waits for their next one (`ROUTER_QUIET_MS` on a server); absent: no wait. */
    quietMs?: number;
    /** The wait ends early when the person isn't typing (token-trim B11). */
    quietByTyping?: boolean;
  };
}

/** Organization of an org-scoped job (only system jobs such as some emails have none). */
const orgOf = (job: OutboxJob) => {
  if (!job.orgId) throw new PermanentJobError(`job ${job.kind} needs an organization`);
  return job.orgId;
};

/**
 * The router of messages nobody mentioned (`message.posted`, and "Responder agora" routing one again): the
 * chain of ADR 0074 (Jev when configured, the organization's small model, the author's own plan where it is
 * on, then rules in `routeMessage`), with the organization's AI checked first. Null when routing is off.
 */
export function messageRouter(deps: JobDeps): RouterDeps | null {
  const router = deps.router;
  if (!router?.enabled) return null;
  const perProvider = { anthropic: router.model, ...router.cheapModels };
  const smallModel = (orgId: string) => smallModelFor(deps, orgId, perProvider);
  const jev = router.jev;
  const plans = router.plans && !isAgentesCloud(router.plans.publicUrl) ? router.plans.hub : null;
  const steps = [
    ...(jev
      ? [
          createJevRouterStrategy({
            key: jev.key,
            timeoutMs: jev.timeoutMs,
            fetch: jev.fetch,
            baseURL: jev.baseURL,
            recordUsage: async (u) => {
              await deps.gateway.recordExternalUsage({
                orgId: u.orgId,
                kind: "router",
                provider: "typesafe",
                model: u.model,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
                costNanoUsd: jevCostNanoUsd(u.inputTokens),
              });
            },
          }),
        ]
      : []),
    router.strategy ?? createLlmRouterStrategy({ gateway: deps.gateway, resolveModel: smallModel }),
    ...(plans ? [createPlanRouterStrategy({ db: deps.db, hub: plans, pubsub: deps.pubsub })] : []),
  ];
  return {
    db: deps.db,
    strategy: routeChain(steps, { onTiming: deps.onTiming }),
    policy: {
      ...DEFAULT_ROUTER_POLICY,
      minScore: router.minScore ?? DEFAULT_ROUTER_POLICY.minScore,
      maxHops: deps.maxHops,
    },
    hasAi: (orgId) => orgHasAi({ db: deps.db, gateway: deps.gateway, machines: deps.machines }, orgId),
    outOfOffice: (orgId, ids) =>
      outOfOfficeIds(deps.db, orgId, ids, { hasModel: (agent) => deps.gateway.hasModelCredential(agent) }),
    routing: { jev: () => jevPicks(jev?.key), smallModel, plans },
    quietMs: router.quietMs,
    quietByTyping: router.quietByTyping,
    pubsub: deps.pubsub,
    // Jev bills the platform: past the workspace's platform AI for the month, only @mentions start agents.
    ...(jev ? { platformCapReached: (orgId: string) => platformCapReached(deps.db, orgId) } : {}),
  };
}

/** Whether Jev picks now: a key its owner sees working (a limit, an outage or a slow answer don't count). */
async function jevPicks(key: JevKeySource | undefined): Promise<boolean> {
  if (!key) return false;
  if (typeof key === "string") return true;
  return "view" in key ? (await (key as JevKey).view()).state === "ok" : (await key.key()) !== null;
}

/** Every outbox job kind the core knows. Modules can add more through the server's worker options. */
export function createJobHandlers(deps: JobDeps): JobHandlers {
  // Listening from now on, so typing sent while a run reads its context (before its quiet window) counts.
  if (deps.quietByTyping || deps.router?.quietByTyping) typingLogFor(deps.pubsub);
  const routing = messageRouter(deps);

  // An agent's @mention is credit or a reference: it wakes the other agent only when it plainly asks it something.
  const mentionThreshold = deps.router?.mentionThreshold ?? MENTION_WAKE_THRESHOLD;
  /**
   * Which agents an agent's @mentions wake (ADR 0089, addendum 2026-11-10): the judge asks, per mentioned agent,
   * whether the message leaves it nothing to do, in any language, reading the message being answered too; it wakes
   * only when the judge reads a plain request to it (`MENTION_WAKE_THRESHOLD`). A name, a source, a thanks or a
   * correction asks nothing. Without a judge, or when it fails, only a message that opens with "@handle" wakes that
   * agent. Each decision goes in `routing_decisions`, its score the chance the message asks the agent (1 − the
   * judge's "nothing").
   */
  async function delegatedAgents(
    message: NonNullable<Awaited<ReturnType<typeof getMessage>>>,
    outside: string[],
    /** `wakeAll`: a routine was told to name only agents that must act, so each one it names wakes. */
    options: { wakeAll?: boolean } = {},
  ) {
    const ids = message.mentionedAgentIds.filter((id) => !outside.includes(id));
    const targets = ids.length
      ? await deps.db
          .select({
            id: schema.agents.id,
            handle: schema.agents.handle,
            name: schema.agents.name,
            role: schema.agents.role,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.orgId, message.orgId), inArray(schema.agents.id, ids)))
      : [];
    const others = targets.filter((t) => t.id !== message.authorAgentId);
    const scores = new Map<string, number>();
    let strategy = "mention-judge";
    let error: string | null = null;
    const judge = deps.context ? judgeOf(deps.context) : null;
    if (options.wakeAll) {
      for (const t of others) scores.set(t.id, 1);
      strategy = "mention-routine";
    } else if (judge && others.length > 0) {
      const [[author], answering] = await Promise.all([
        message.authorAgentId
          ? deps.db
              .select({ handle: schema.agents.handle })
              .from(schema.agents)
              .where(eq(schema.agents.id, message.authorAgentId))
          : Promise.resolve([]),
        answeredBy(message),
      ]);
      try {
        const out = await mentionNeedsNothing(judge, {
          orgId: message.orgId,
          agentId: message.authorAgentId,
          body: message.body,
          author: author ? `@${author.handle}` : "agent",
          answering,
          targets: others.map((t) => ({ agentId: t.id, handle: t.handle, name: t.name, role: t.role || null })),
        });
        for (const [id, nothing] of out) scores.set(id, 1 - nothing);
        strategy = `mention-${judge.name}`;
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 300) : String(e);
      }
    }
    // No judge, or it failed: only a message that opens by addressing an agent ("@ada já postei…") wakes it. Waking
    // every agent named would let two agents thank each other in a loop while the judge is down.
    if (!options.wakeAll && (!judge || error !== null))
      for (const t of others) if (opensWith(message.body, t.handle)) scores.set(t.id, 1);
    // A deep chain needs a clear reason to wake an agent whose computer already has work waiting for room.
    const crowded =
      message.hop + 1 >= DEEP_WAKE_HOP
        ? await crowdedAgents(
            deps.db,
            message.orgId,
            others.map((t) => t.id),
          )
        : new Set<string>();
    const bar = (id: string) =>
      crowded.has(id) ? Math.max(mentionThreshold, DEEP_MENTION_THRESHOLD) : mentionThreshold;
    const allowed = others.filter((t) => (scores.get(t.id) ?? 0) >= bar(t.id)).map((t) => t.id);
    await deps.db
      .insert(schema.routingDecisions)
      .values({
        orgId: message.orgId,
        channelId: message.channelId,
        messageId: message.id,
        strategy,
        candidates: others.map((t) => ({ agentId: t.id, score: scores.get(t.id) ?? 0 })),
        selectedAgentIds: allowed,
        reason: others
          .map((t) => `@${t.handle}: ${(scores.get(t.id) ?? 0).toFixed(2)}`)
          .join(", ")
          .slice(0, 500),
        error,
      })
      .onConflictDoNothing();
    return { allowed, referenced: others.filter((t) => !allowed.includes(t.id)).map((t) => t.id) };
  }

  const brakeJudge = () => (deps.context ? judgeOf(deps.context) : null);

  /**
   * Of the agents an agent's message would wake or hand a note to, the ones its settings let it call (ADR 0131 §8);
   * the run that wrote it hears once who was left out.
   */
  async function onlyCallable(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>, ids: string[]) {
    if (!message.authorAgentId || ids.length === 0) return ids;
    const ok = await callableAgents(deps.db, message.orgId, message.authorAgentId, ids);
    const left = ids.filter((id) => !ok.has(id));
    if (left.length > 0 && message.agentRunId) {
      const [handles, [run]] = await Promise.all([
        deps.db
          .select({ handle: schema.agents.handle })
          .from(schema.agents)
          .where(and(eq(schema.agents.orgId, message.orgId), inArray(schema.agents.id, left))),
        deps.db
          .select()
          .from(schema.agentRuns)
          .where(and(eq(schema.agentRuns.orgId, message.orgId), eq(schema.agentRuns.id, message.agentRunId))),
      ]);
      if (run)
        await tellWakeSkipped(
          { db: deps.db, pubsub: deps.pubsub },
          run,
          message.id,
          handles.map((h) => ({ handle: h.handle, why: notCallableWhy(h.handle) })),
          "callable",
        ).catch(() => {});
    }
    return ids.filter((id) => ok.has(id));
  }

  /** The agents a run handed something to (`ask_agent`, `tell_agent`). */
  async function consultedBy(orgId: string, runId: string) {
    const c = schema.agentConsultations;
    const rows = await deps.db
      .select({ id: c.targetAgentId })
      .from(c)
      .where(and(eq(c.orgId, orgId), eq(c.askerRunId, runId)));
    return rows.map((r) => r.id);
  }

  /**
   * The org's agents an agent's message @named outside this conversation (`meta.unreachedAgents`, written with it):
   * that mention reaches nobody, not even the right hand, which a person's @ reaches in any channel. The agent has
   * `tell_agent` and `ask_agent` for that on purpose: a name it only passes by wakes no one.
   */
  async function outsideAgents(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>) {
    const handles = Array.isArray(message.meta.unreachedAgents)
      ? message.meta.unreachedAgents.filter((h): h is string => typeof h === "string")
      : [];
    if (handles.length === 0) return [];
    const rows = await deps.db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.orgId, message.orgId),
          inArray(schema.agents.handle, handles),
          isNull(schema.agents.archivedAt),
        ),
      );
    return rows.map((r) => r.id).filter((id) => id !== message.authorAgentId);
  }

  /**
   * Agents the run behind an agent's message tried to reach with tell_agent or ask_agent and couldn't, its routine's
   * creator being out of their audience (the refusal's `data.reach`), not yet shown under an earlier message of it.
   * A routine's report is told by another run than the routine's own: that one's refusals show under it too,
   * and a routine's own message (posted with no run) shows its routine run's.
   */
  async function refusedReach(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>) {
    const ownRunId = message.agentRunId ?? (await routinePostRun(deps.db, message));
    if (!ownRunId) return [];
    const authority = await runAuthorityById(deps.db, message.orgId, ownRunId);
    const brief = authority.kind !== "person" ? (authority.brief ?? null) : null;
    const [routineRun] = brief
      ? await deps.db
          .select({ agentRunId: schema.routineRuns.agentRunId })
          .from(schema.routineRuns)
          .where(and(eq(schema.routineRuns.orgId, message.orgId), eq(schema.routineRuns.id, brief.routineRunId)))
      : [];
    const runIds = [...new Set([ownRunId, routineRun?.agentRunId].filter((id): id is string => !!id))];
    const steps = schema.agentRunSteps;
    const [tried, shown] = await Promise.all([
      deps.db
        .select({ agentId: sql<string>`${steps.data} -> 'data' -> 'reach' ->> 'agentId'` })
        .from(steps)
        .where(
          and(
            eq(steps.orgId, message.orgId),
            inArray(steps.runId, runIds),
            eq(steps.kind, "tool_result"),
            sql`${steps.data} -> 'data' ? 'reach'`,
          ),
        ),
      deps.db
        .select({ meta: schema.messages.meta })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.orgId, message.orgId),
            eq(schema.messages.channelId, message.channelId),
            inArray(schema.messages.agentRunId, runIds),
            ne(schema.messages.id, message.id),
            sql`${schema.messages.meta} ? 'reach'`,
          ),
        ),
    ]);
    const done = new Set(shown.flatMap((m) => reachOf(m.meta).map((e) => e.agentId)));
    return [...new Set(tried.map((t) => t.agentId))].filter((id) => !!id && !done.has(id));
  }

  /** The message an agent's message answers: the trigger of the run that wrote it (its start), for the judge. */
  async function answeredBy(message: NonNullable<Awaited<ReturnType<typeof getMessage>>>) {
    if (!message.agentRunId) return null;
    const [row] = await deps.db
      .select({ body: schema.messages.body, authorType: schema.messages.authorType, handle: schema.agents.handle })
      .from(schema.agentRuns)
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.orgId, schema.agentRuns.orgId),
          eq(schema.messages.id, schema.agentRuns.triggerMessageId),
        ),
      )
      .leftJoin(schema.agents, eq(schema.agents.id, schema.messages.authorAgentId))
      .where(and(eq(schema.agentRuns.orgId, message.orgId), eq(schema.agentRuns.id, message.agentRunId)));
    if (!row) return null;
    return {
      from: row.authorType === "person" ? "a person" : row.handle ? `@${row.handle}` : "an agent",
      text: cutText(row.body, 1000),
    };
  }

  const missions: MissionDeps = {
    db: deps.db,
    pubsub: deps.pubsub,
    hub: deps.sandbox?.machines?.hub ?? null,
    artifacts: deps.artifacts,
    search: deps.context,
    publicUrl: deps.sandbox?.publicUrl,
    missionEngine: deps.missionEngine ?? null,
  };

  const handlers: JobHandlers = {
    // A wake the brakes deferred (its agent at its cap of unrequested work, or its computer full) looks again.
    [LATER_JOB]: async (job) => {
      const orgId = orgOf(job);
      const message = await getMessage(deps.db, orgId, String(job.payload.messageId));
      const agentId = String(job.payload.agentId);
      if (!message) return;
      const reportIn = job.payload.reportIn as BrakeReport | undefined;
      const { wake } = await brakeWakes({ db: deps.db, pubsub: deps.pubsub, judge: null }, message, [agentId], {
        look: Number(job.payload.look) || 0,
        ...(reportIn ? { reportIn } : {}),
      });
      // A tell_agent note (agents' DM, no mention) starts its run itself.
      if (wake.length > 0 && message.meta.agentNote) await startNoteRun(deps.db, message, agentId);
      else if (wake.length > 0)
        await dispatchMentions(
          deps.db,
          { orgId, messageId: message.id },
          { maxHops: deps.maxHops, onlyAgentIds: wake },
        );
    },
    "message.posted": async (job) => {
      const input = { orgId: orgOf(job), messageId: String(job.payload.messageId) };
      const message = await getMessage(deps.db, input.orgId, input.messageId);
      if (!message) return;
      if (deps.context && message.threadId) await maybeEnqueueReflection(deps, message.orgId, message.threadId);
      // An issue's work card, its start (the run is already started) and the "took issue #N" line route to nobody.
      // A task conversation's root (ADR 0145) stands for the task: nobody is routed either.
      if (message.meta.issueWork || message.meta.issueWorkStart || message.meta.issueTaken) return;
      if (message.meta.taskConversation) return;
      // A fast reply while the task works (talker.ts): its task reads it; it starts nobody, not even by mention.
      if (message.meta.talker) return;
      // A GIF or a sticker alone (ADR 0091), an agent's silent one after its reply too: it starts nobody, routes
      // to nobody and gets no sticker after it. Its insert queues no `message.posted`; one delivered anyway does
      // nothing.
      if (isMediaAfterReply(message.meta) || isMediaOnly(message)) return;
      // A routine's trigger: its background run is already started; nobody else is routed (routines.ts).
      if (message.meta.background) return;
      const routed = (
        strategy: "mention" | "dm" | "router" | "none",
        seenBy: string[],
        runs: AgentRun[],
        reason?: string,
        intent?: ConnectIntent,
        decidedBy?: DecidedBy,
      ) =>
        publishRouted(deps.pubsub, message, {
          strategy,
          seenBy,
          runs,
          ...(reason ? { reason } : {}),
          ...(decidedBy ? { decidedBy } : {}),
          ...intent,
        });
      const where = await getChannelCached(deps.db, message.orgId, message.channelId);
      // Addressed a mission's agent without the right to act there (ADR 0029): a suggestion, no run.
      if (message.meta.missionSuggestion) return routed("none", message.mentionedAgentIds, [], "mission_suggestion");
      // Someone who acts in a mission waiting to be concluded wrote in its thread: new work, active again.
      if (message.authorType === "person" && message.threadId && message.authorUserId) {
        const waiting = await missionOfThread(deps.db, message.orgId, message.threadId);
        if (waiting?.status === "awaiting_close") {
          const role = await missionRole(deps.db, waiting, message.authorUserId);
          if (role === "owner" || role === "decide") await reactivateMission(missions, waiting, "message");
        }
      }
      if (message.authorType !== "person") {
        // Between agents only (`ask_agent`, ADR 0034): the consultation runs are started by the tool.
        if (where && isAgentOnlyDm(where)) return;
        // A notice is for its own agent (`deliverNotice` starts or joins its run), a no-AI card says why
        // its agent didn't answer, and an action card waits for a person's click: nobody else chimes in.
        // The brakes' digest and loop stop (ADR 0131) are for a person too.
        // A run's line that it moved on (`moveRun`) is no news for anyone either.
        if (
          message.meta.notice ||
          message.meta.noAi ||
          message.meta.actionCard ||
          message.meta.autonomyNote ||
          message.meta.movedOn
        )
          return;
        // A routine's own message (hand_off, no run behind it, ADR 0053 addendum 2026-11-01): its mentions wake
        // the agents it names for its creator, like any agent's (the router stays out). With no creator left it
        // has nobody's reach and wakes nobody. Never silently: the agents it named and its run's tell_agent
        // refusals show under it.
        const routineRun = await routinePostRun(deps.db, message);
        const routineAuthority = routineRun ? await runAuthorityById(deps.db, message.orgId, routineRun) : null;
        const actingRoutine = routineAuthority ? routineCreatorOf(routineAuthority) : null;
        if (message.meta.routine && !message.meta.reminder && !message.agentRunId && !actingRoutine) {
          const named = message.mentionedAgentIds.filter((id) => id !== message.authorAgentId);
          await settleReach(deps, message, { blocked: [...(await refusedReach(message)), ...named] });
          return;
        }
        // Agents' mentions go through the hop limit here; a person's mentions and DMs already
        // started their runs in the same statement as the message (postPersonMessage).
        const [outside, refused] = await Promise.all([outsideAgents(message), refusedReach(message)]);
        if (message.mentionedAgentIds.length > 0) {
          // No cap on hand-offs between agents: the stretch's limits hold a run agents start (`startOrJoinRun`).
          const handed = await delegatedAgents(message, outside, { wakeAll: Boolean(actingRoutine) });
          // An agent the run already asked or handed this to (ask_agent, tell_agent) has it: the mention doesn't wake it
          // again, or it would answer the person here too, besides the agent that asked.
          const askerRun = routineRun ?? message.agentRunId;
          const told = askerRun ? await consultedBy(message.orgId, askerRun) : [];
          let allowed = handed.allowed.filter((id) => !told.includes(id));
          // In an open mission's thread, another agent acts for the person behind it: only the
          // mission's owner and deciders make the mission's agent work (ADR 0029).
          if (message.threadId && allowed.length > 0) {
            const mission = await missionOfThread(deps.db, message.orgId, message.threadId);
            if (
              mission &&
              allowed.includes(mission.agentId) &&
              ["proposed", "active", "paused", "awaiting_close"].includes(mission.status)
            ) {
              const person = await requesterOf(deps.db, message);
              const role = person ? await missionRole(deps.db, mission, person) : "none";
              if (role !== "owner" && role !== "decide") allowed = allowed.filter((id) => id !== mission.agentId);
            }
          }
          const reportLater = await deferMentionReport(deps.db, message, allowed);
          if (reportLater) allowed = allowed.filter((id) => id !== reportLater);
          // Only the agents its settings let it call (ADR 0131 §8), then the brakes on work nobody asked for.
          allowed = await onlyCallable(message, allowed);
          if (allowed.length > 0)
            allowed = (await brakeWakes({ db: deps.db, pubsub: deps.pubsub, judge: brakeJudge() }, message, allowed))
              .wake;
          const res = allowed.length
            ? await dispatchMentions(deps.db, input, { maxHops: deps.maxHops, onlyAgentIds: allowed })
            : { runs: [] };
          const dropped = "dropped" in res ? (res.dropped ?? []) : [];
          // A member its mention didn't reach hears it as a note, or the people here read why not.
          const reach = await settleReach(deps, message, {
            blocked: [...dropped.filter((d) => d.reason === "audience").map((d) => d.agentId), ...refused],
          });
          // A member consulted by note instead (it takes consultations) was reached: no "wasn't woken" notice.
          const consulted = new Set(reach.filter((e) => e.consultationId).map((e) => e.agentId));
          const noAi = new Set(reach.filter((e) => e.noAi).map((e) => e.agentId));
          await reportDroppedMentions(
            { db: deps.db, pubsub: deps.pubsub },
            message,
            dropped
              .filter((d) => !consulted.has(d.agentId))
              .map((d) => (noAi.has(d.agentId) ? { ...d, noAi: true } : d)),
          );
          await publishRouted(deps.pubsub, message, {
            strategy: "mention",
            seenBy: message.mentionedAgentIds,
            runs: res.runs,
            referenced: handed.referenced,
            ...(allowed.length || reportLater ? {} : { reason: "reference_only" }),
          });
          return;
        }
        try {
          // No mention: another agent may chime in when it clearly should (ADR 0034). Only in
          // channels, never in a mission's thread (the mission's own turns run it). Once that is settled, a
          // light reply may get the agent's sticker or a GIF after it (ADR 0091): judged in a job of its own.
          if (actingRoutine) return;
          if (!routing || where?.kind !== "channel") return await enqueueAgentMedia(deps.db, message, where);
          if (message.threadId && (await missionOfThread(deps.db, message.orgId, message.threadId))) return;
          const res = await routeMessage(routing, input);
          // Receipts only when someone answers: an agent's message isn't waiting for anyone.
          if (res.runs.length > 0)
            await routed("router", res.seenBy ?? [], res.runs, res.reason, undefined, res.decidedBy);
          await enqueueAgentMedia(deps.db, message, where);
          return;
        } finally {
          await settleReach(deps, message, { blocked: refused });
        }
      }
      if (message.mentionedAgentIds.length > 0) {
        // No-op unless inserted elsewhere; never the agents the person only referenced, nor the ones whose
        // run in progress already took this message (steering): once that run ends, a second one would
        // answer the same message again.
        const referenced = referencedOf(message.meta);
        const steeredIds = Array.isArray(message.meta.steeredRunIds)
          ? message.meta.steeredRunIds.filter((v): v is string => typeof v === "string")
          : [];
        const steered =
          steeredIds.length > 0
            ? (
                await deps.db
                  .select({ agentId: schema.agentRuns.agentId })
                  .from(schema.agentRuns)
                  .where(and(eq(schema.agentRuns.orgId, message.orgId), inArray(schema.agentRuns.id, steeredIds)))
              ).map((r) => r.agentId)
            : [];
        const skip = new Set([...referenced, ...steered]);
        await dispatchMentions(deps.db, input, {
          maxHops: deps.maxHops,
          ...(skip.size > 0 ? { onlyAgentIds: message.mentionedAgentIds.filter((id) => !skip.has(id)) } : {}),
        });
        return;
      }
      // An answer to an agent's question resumes that run; nobody else is routed.
      if (typeof message.meta.answersQuestionId === "string") return;
      // Delivered to an agent's task already in progress (steering): no second run.
      if (Array.isArray(message.meta.steeredRunIds)) return;
      // A reply in an agent's background work thread: its reply turn started with the message.
      if (message.meta.forWork) return;
      // For the task's agent in its task's conversation: its run started with the message, as in a DM.
      if (message.meta.forTask) return;
      const channel = where;
      if (channel?.kind === "dm") {
        await dispatchDm(deps.db, message, { maxHops: deps.maxHops }); // idempotent safety net
        return;
      }
      if (!routing) return routed("none", [], []);
      // In a mission's thread only its owner and deciders make the agent work (the router included).
      if (message.threadId && message.authorUserId) {
        const mission = await missionOfThread(deps.db, message.orgId, message.threadId);
        if (mission && ["proposed", "active", "paused", "awaiting_close"].includes(mission.status)) {
          const role = await missionRole(deps.db, mission, message.authorUserId);
          if (role !== "owner" && role !== "decide") return routed("none", [], [], "mission_read_only");
        }
      }
      const res = await routeMessage(routing, input);
      // Continued: the person's next message carries the decision, and its receipt.
      if (res.skipped === "already_routed" || res.skipped === "continued") return;
      // Nobody can think: what the person asks for may be to connect an AI (Jev reads it), for the Connect step.
      if (res.reason === NO_AI) {
        if (res.held) await queuePlanWaiting(deps.db, message.orgId);
        const intent = res.held
          ? undefined
          : await aiConnectIntent(deps.context?.judge, { orgId: message.orgId, text: message.body });
        return routed("none", [], [], NO_AI, intent);
      }
      await routed(res.seenBy ? "router" : "none", res.seenBy ?? [], res.runs, res.reason, undefined, res.decidedBy);
    },
    "agent_run.execute": async (job, ctx) => {
      // Counted per run (statements per stage go into the run profile).
      const wait = typeof job.payload.wait === "string" ? job.payload.wait : undefined;
      // It went to the front of its computer's line (`frontOfLine`): told here, once its move is committed.
      if (typeof job.payload.line === "string")
        await publishQueueChanged(deps.pubsub, orgOf(job), job.payload.line).catch(() => {});
      const lineSince = typeof job.payload.lineSince === "number" ? job.payload.lineSince : undefined;
      await queryTrace.run({ count: 0 }, () =>
        executeRun(deps, String(job.payload.runId), {
          ...ctx,
          jobId: job.id,
          ...(wait ? { wait } : {}),
          ...(lineSince ? { lineSince } : {}),
        }),
      );
      // A mission's main-session turn that ended: write items queued behind it may start (ADR 0044).
      await afterMissionRunEnded(missions, String(job.payload.runId)).catch(() => 0);
    },
    // An agent's wake waiting for its agent to leave the computer's line (ADR 0032 "Calm wakes").
    [INBOX_JOB]: async (job) => {
      const p = job.payload as {
        messageId: string;
        agentId: string;
        trigger: RunTrigger;
        look: number;
        since?: number;
      };
      await deliverParked(deps.db, orgOf(job), p);
    },
    // Replies to an agent's message that woke several agents, reported to it once (ADR 0032 "Calm wakes").
    [MENTION_REPORT_JOB]: async (job) => {
      const p = job.payload as { replyId: string; triggerId: string; agentId: string; look: number };
      await reportMentionReplies(deps.db, orgOf(job), p, { maxHops: deps.maxHops });
    },
    // A stretch's limit held a wake-up: its pause card, with Continuar (ADR 0089).
    [STRETCH_JOB]: async (job) => {
      await postStretchCard({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), job.payload as unknown as StretchHold);
    },
    // A vote's time came: it closes and the agent hears the result (ADR 0113).
    [POLL_CLOSE_JOB]: async (job) => {
      if (!deps.artifacts) throw new Error("Files are unavailable");
      await closePoll(deps.artifacts, orgOf(job), String(job.payload.artifactId));
    },
    // Something landed where a waiting run would read it: its asks, or its own requests, are checked now.
    [EARLY_CHECK_JOB]: async (job) => {
      await checkParkedRun(
        { db: deps.db, pubsub: deps.pubsub, judge: deps.context?.judge },
        String(job.payload.runId),
        job.id,
      );
    },
    // A follow-up's time came: the agent is woken in its conversation (follow-through.ts).
    [FOLLOW_UP_JOB]: async (job) => {
      await wakeFollowUp(deps, orgOf(job), String(job.payload.messageId));
    },
    // A long work's promised update is due (ADR 0121 §3): a nudge, then the server's own line.
    [WORK_CHECK_IN_JOB]: async (job) => {
      await checkInWork(deps, orgOf(job), {
        workId: String(job.payload.workId),
        seq: Number(job.payload.seq),
        phase: job.payload.phase === "fallback" ? "fallback" : job.payload.phase === "card" ? "card" : "nudge",
        ...(typeof job.payload.due === "number" ? { due: job.payload.due } : {}),
      });
    },
    // A long work ended after people passed messages on to it: its agent follows each one's up, once (ADR 0121).
    [WORK_FOLLOW_UP_JOB]: async (job) => {
      const ids = Array.isArray(job.payload.messageIds) ? job.payload.messageIds : [];
      await followUpWork(deps, orgOf(job), {
        workId: String(job.payload.workId),
        runId: String(job.payload.runId),
        messageIds: ids.filter((id): id is string => typeof id === "string"),
        stopped: job.payload.stopped === true,
      });
    },
    "secret.activate": async (job) => {
      if (!deps.sandbox) throw new Error("Computer secret delivery is unavailable");
      await activateDeliveredSecret(
        { ...deps.sandbox, pubsub: deps.pubsub },
        orgOf(job),
        String(job.payload.requestId),
      );
    },
    "secret.discard": async (job) => {
      if (!deps.sandbox) throw new Error("Computer secret cleanup is unavailable");
      await discardClosedSecret(deps.sandbox, orgOf(job), String(job.payload.requestId));
    },
    "search.index": async (job) => {
      if (!deps.search) return;
      await indexSource(
        { db: deps.db, search: deps.search, gateway: deps.gateway },
        { orgId: orgOf(job), kind: job.payload.kind as SearchKind, sourceId: String(job.payload.sourceId) },
      );
    },
    "search.reindex": async (job) => {
      if (!deps.search) return;
      // The boot backfill's reindex names the kinds that get vectors (`queueEmbeddingBackfill`); a person's has none.
      const kinds = Array.isArray(job.payload.kinds) ? (job.payload.kinds as SearchKind[]) : undefined;
      await reindexOrg({ db: deps.db, search: deps.search, gateway: deps.gateway }, orgOf(job), { kinds });
    },
    "context.reflect": async (job) => {
      if (!deps.context) return;
      const res = await reflectThread(deps.context, {
        orgId: orgOf(job),
        threadRootId: String(job.payload.threadRootId),
      });
      if (res.results.length > 0) await publishListChanged(deps.pubsub, orgOf(job), "memory");
    },
    [LEARN_JOB]: async (job) => {
      if (!deps.context) return;
      const res = await learnRun(deps.context, { orgId: orgOf(job), runId: String(job.payload.runId) });
      // Its run went on after the turn that queued it: the outbox's backoff brings it back once the run ends.
      if (res.skipped === "running") throw Object.assign(new Error("its run is still going"), { retryable: true });
      if (res.saved.length > 0) await publishListChanged(deps.pubsub, orgOf(job), "memory");
    },
    // A reply a while ago: the thread's title and "resolved?" suggestion, unless a newer reply came.
    "threads.assess": async (job) => {
      if (!deps.context) return;
      await assessThread(deps.context, {
        orgId: orgOf(job),
        threadRootId: String(job.payload.threadRootId),
        messageId: typeof job.payload.messageId === "string" ? job.payload.messageId : undefined,
      });
    },
    "context.feedback": async (job) => {
      await applyReactionFeedback(deps.db, {
        orgId: orgOf(job),
        messageId: String(job.payload.messageId),
        reaction: String(job.payload.reaction),
      });
    },
    "routine.run": async (job) => {
      await executeRoutineRun(
        {
          db: deps.db,
          pubsub: deps.pubsub,
          context: deps.context,
          ai: { gateway: deps.gateway, machines: deps.machines ?? null },
        },
        String(job.payload.routineRunId),
      );
    },
    [VOICE_JOB]: async (job, ctx) => {
      if (!deps.voice) throw new PermanentJobError("no voice engine configured");
      await transcribeVoiceClip(deps.voice, String(job.payload.clipId), { finalAttempt: ctx.finalAttempt });
    },
    "storage.migrate": async (job) => {
      if (!deps.storage) throw new PermanentJobError("no storage configured");
      await runMigration(deps.storage, String(job.payload.migrationId));
    },
    // A page at a time: a full page enqueues the next run, once even if this one runs twice.
    [ORG_FILES_PURGE_JOB]: async (job) => {
      if (!deps.storage) throw new PermanentJobError("no storage configured");
      const orgId = String(job.payload.orgId);
      if (!(await purgeOrgFiles(deps.storage, orgId))) return;
      await enqueue(deps.db, {
        orgId: null,
        kind: ORG_FILES_PURGE_JOB,
        payload: { orgId },
        dedupeKey: `${ORG_FILES_PURGE_JOB}:${job.id}`,
        maxAttempts: ORG_FILES_PURGE_ATTEMPTS,
      });
    },
    [USER_FILES_PURGE_JOB]: async (job) => {
      if (!deps.storage) throw new PermanentJobError("no storage configured");
      await purgeUserFiles(deps.storage, String(job.payload.userId));
    },
    // A deleted channel's contents (`purgeChannel`): a no-op for one that isn't deleted.
    [CHANNEL_DELETE_JOB]: async (job) => {
      await purgeChannel(
        { db: deps.db, pubsub: deps.pubsub, ...(deps.voice ? { blobs: deps.voice.blobs } : {}) },
        orgOf(job),
        String(job.payload.channelId),
      );
    },
    // A workspace whose deletion's date came (`purgeWorkspace`): a no-op once restored, kept or gone.
    [ORG_DELETE_JOB]: async (job, ctx) => {
      await purgeWorkspace(
        {
          db: deps.db,
          pubsub: deps.pubsub,
          connectors: deps.connectors,
          githubApp: deps.githubApp,
          mail: deps.mail,
          log: deps.log,
        },
        String(job.payload.orgId),
        { finalAttempt: ctx.finalAttempt },
      );
    },
    // An account whose deletion's date came (`purgeAccount`): a no-op once restored or gone.
    [ACCOUNT_DELETE_JOB]: async (job) => {
      await purgeAccount(
        {
          db: deps.db,
          pubsub: deps.pubsub,
          hub: deps.sandbox?.machines?.hub,
          emails: deps.accountEmails,
          appleRevoke: deps.appleRevoke,
        },
        String(job.payload.userId),
      );
    },
    "email.send": async (job, ctx) => {
      try {
        if (!deps.email) throw new PermanentJobError("no email sender configured");
        await sendQueuedEmail(deps.email, job.payload, deps.emailArt);
      } catch (error) {
        if (ctx.finalAttempt || error instanceof PermanentJobError) await forgetCodeEmail(deps.db, job);
        throw error;
      }
      await forgetCodeEmail(deps.db, job);
    },
    // The team says hi in #general once it can work (ADR 0162).
    [TEAM_HELLO_JOB]: async (job) => {
      await sayTeamHello(deps, orgOf(job), job.payload);
    },
    [FEEDBACK_JOB]: async (job) => {
      if (isFeedbackRelay((job.payload.feedback as Feedback | undefined)?.to)) {
        await relayQueuedFeedback(deps.feedbackFetch ?? fetch, job.payload, deps.feedbackBlobs);
        return;
      }
      if (!deps.email) throw new PermanentJobError("no email sender configured");
      await sendQueuedFeedback(deps.email, job.payload, deps.feedbackBlobs);
    },
    [FEEDBACK_FILE_PURGE_JOB]: async (job) => {
      if (!deps.feedbackBlobs) throw new PermanentJobError("no file store configured");
      await purgeFeedbackFile({ db: deps.db, blobs: deps.feedbackBlobs }, String(job.payload.id));
    },
    [PLAN_WAITING_JOB]: async (job) => {
      if (deps.emailArt) await sendPlanWaitingEmail(deps.db, deps.emailArt.home, orgOf(job), job.payload.step);
    },
    // Someone else let more people talk to an agent on a person's plan: that person's email (`planOpened`).
    [PLAN_OPENED_JOB]: async (job) => {
      // No address for the email's link: a server without emailArt sends no email anyway.
      if (!deps.emailArt) return;
      await queuePlanOpenedEmail(deps.db, deps.emailArt.home, orgOf(job), job.id, job.payload);
    },
    // Someone gave an agent another person's plan: that person's inbox note and email (`setAgentBrain`).
    [PLAN_LENT_JOB]: async (job) => {
      await queuePlanLent(
        { db: deps.db, pubsub: deps.pubsub },
        deps.emailArt?.home ?? null,
        orgOf(job),
        job.id,
        job.payload,
      );
    },
    "waitlist.contact": async (job) => {
      if (!deps.email) throw new PermanentJobError("no email sender configured");
      await saveWaitlistContact(deps.db, deps.email, String(job.payload.entryId));
    },
    [PARTNER_WAITLIST_CONTACT_JOB]: async (job) => {
      if (!deps.email) throw new PermanentJobError("no email sender configured");
      await savePartnerWaitlistContact(deps.db, deps.email, String(job.payload.entryId));
    },
    [ACCOUNT_CONTACT_JOB]: async (job) => {
      if (!deps.email) throw new PermanentJobError("no email sender configured");
      await saveAccountContact(deps.db, deps.email, {
        userId: String(job.payload.userId),
        email: String(job.payload.email),
      });
    },
    // A background task on a connected computer ended: its conversation wakes (ADR 0029).
    "machine.task_done": async (job) => {
      const woke = await wakeConversationForTask({ db: deps.db, pubsub: deps.pubsub }, String(job.payload.taskId), {
        maxHops: deps.maxHops,
      });
      // A mission's task: its notes come back, its main session hears, queued messages go out.
      if (woke && "missionTask" in woke) await onMissionTaskEnded(missions, String(job.payload.taskId));
      // A slot on that computer is free: queued mission items may start (ADR 0044). The one walk of the
      // machine's queue per task end (also kicked for a resumed item queued with this job, its own id).
      await afterMachineTaskEnded(missions, String(job.payload.taskId)).catch(() => 0);
    },
    // The `.agentes/` files of a mission changed (debounced): written to its machine.
    "mission.sync_files": async (job) => {
      await syncMissionFiles(missions, String(job.payload.missionId));
    },
    // A mission's plan finished or its work stopped: is everything done (then it waits to be concluded)?
    "mission.check_done": async (job) => {
      await checkMissionDone(missions, String(job.payload.missionId), Number(job.payload.attempt ?? 0) || 0);
    },
    // A mission run ended a while ago: with plan items open and nothing waiting on a person, the work goes on.
    [KEEP_GOING_JOB]: async (job) => {
      await keepMissionGoing(missions, String(job.payload.missionId));
    },
    // The person at a connected computer answered an agent's folder request (ADR 0036 §8): the agent wakes.
    "machine.access_decided": async (job) => {
      await wakeForAccessDecision({ db: deps.db, pubsub: deps.pubsub }, String(job.payload.requestId), {
        maxHops: deps.maxHops,
      });
    },
    // A run waited a day for a device (`wait_for_device`): still waiting, it stops and says so.
    [DEVICE_WAIT_EXPIRED_JOB]: async (job) => {
      await expireDeviceWait(
        { db: deps.db, pubsub: deps.pubsub },
        String(job.payload.runId),
        String(job.payload.waitId),
      );
    },
    // A machine went offline a grace ago: if still offline, its running tasks are interrupted (one notice per thread).
    "machine.tasks_offline": async (job) => {
      await interruptOfflineMachineTasks({ db: deps.db, pubsub: deps.pubsub }, String(job.payload.machineId), {
        statusOnly: job.payload.statusOnly === true,
      });
    },
    // A task start cut by a drop, once it can't still be underway: the agent's journal on its computer settles it.
    "machine.task_start_check": async (job) => {
      const hub = missions.hub;
      if (!hub) return;
      const call: TaskCall = (machineId, request) => hub.call(machineId, request);
      const tasks = { db: deps.db, pubsub: deps.pubsub, call };
      await checkCutTaskStart(
        {
          ...tasks,
          start: (input) => startMachineTask(tasks, input),
          startQueued: (machineId) => startQueuedMissionTasks(missions, machineId),
        },
        String(job.payload.taskId),
      );
    },
    // A request to join through an invitation link, filed apart from the ask's reply (ADR 0068).
    [FILE_JOIN_REQUEST_JOB]: async (job) => {
      await fileJoinRequest({ db: deps.db, pubsub: deps.pubsub }, job.payload);
    },
    // An agent's reply may get its sticker or a GIF after it (ADR 0091): free checks, then one calibrated judgment.
    // A slow, failing or keyless judgment sends nothing and fails nothing.
    [AGENT_MEDIA_JOB]: async (job) => {
      await maybeSendAgentMedia(
        { db: deps.db, pubsub: deps.pubsub, judge: deps.context?.judge ?? null, gifs: deps.gifs ?? null },
        { orgId: orgOf(job), messageId: String(job.payload.messageId) },
      );
    },
    // The right hand's cards: the week's, and the day's under its own kind (`TEAM_DAY_JOB`).
    [TEAM_WEEK_JOB]: async (job) => {
      await postTeamWeek({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), job.payload);
    },
    [TEAM_DAY_JOB]: async (job) => {
      await postTeamWeek({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), job.payload);
    },
    // What else the right hand does by itself: each lane's own jobs (`right-hand-lane.ts`).
    ...lodiLaneHandlers(deps),
    // A person's monthly AI limit neared or reached (ADR 0141): the person hears 80%, who decides hears 100%.
    [PERSON_LIMIT_JOB]: async (job) => {
      await notifyPersonLimit({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), {
        personId: String(job.payload.personId),
        level: job.payload.level === "reached" ? "reached" : "warning",
        period: String(job.payload.period),
      });
    },
    // In-app notifications of a message: mentions, thread replies, DMs.
    "notifications.message": async (job) => {
      await notifyMessage({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), String(job.payload.messageId));
      // A reply in a task's conversation (ADR 0145): the board's card counts it.
      await announceTaskConversation({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), String(job.payload.messageId));
    },
    // A request for help in an agent's browser nobody answered within the hour: the people asked hear it again, once.
    [HANDOFF_REMIND_JOB]: async (job) => {
      await remindBrowserHandoff({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), String(job.payload.handoffId));
    },
    // A notification for a person's phones and browsers (ADR 0035, 0071): skipped if read, done or snoozed meanwhile.
    "push.send": async (job) => {
      await deliverPush(
        { db: deps.db, push: deps.push, webPush: deps.webPush, presence: deps.presence, server: deps.pushServer },
        String(job.payload.notificationId),
        { held: job.payload.held === true },
      );
    },
    // A workspace's skills that update by themselves from their links, once a day.
    [SKILL_UPDATES_JOB]: async (job) => {
      if (!deps.skills) return;
      await runSkillUpdates(deps.skills, orgOf(job));
    },
    // A Vault connection read again (ADR 0144); a source's refusal stays on the connection, never retried here.
    [VAULT_SYNC_JOB]: async (job) => {
      if (!deps.vault) return;
      await runVaultSync(deps.vault, orgOf(job), String(job.payload.connectionId));
    },
    "context.consolidate": async (job) => {
      if (!deps.context) return;
      const res = await consolidateOrg(deps.context, orgOf(job));
      if (Object.values(res).some((n) => n > 0)) await publishListChanged(deps.pubsub, orgOf(job), "memory");
    },
    // The right hand looks at a card for the person behind it (ADR 0139 §2).
    [RIGHT_HAND_DECIDE_JOB]: async (job) => {
      await considerCard(
        { db: deps.db, pubsub: deps.pubsub, gateway: deps.gateway },
        orgOf(job),
        String(job.payload.messageId),
      );
    },
    // Yesterday's stall-and-noise report, to the people who run the server (`OPS_REPORT_EMAIL`).
    [AUTONOMY_REPORT_JOB]: async (job) => {
      await queueAutonomyEmail(deps.db, job.payload, { router: deps.router?.enabled ?? false });
    },
    // What happened on GitHub to an item an agent worked on, or naming the app (ADR 0156).
    [GITHUB_EVENT_JOB]: async (job) => {
      await handleGitHubAppEvent({ db: deps.db, pubsub: deps.pubsub }, orgOf(job), job.payload.event as GitHubAppEvent);
    },
  };
  // A waiting run whose ask may have just been handled here checks early (`parked-asks.ts`). After the routing, not
  // before it: ahead of the routing, that statement delays the walk to the message's root (`messageRoot`), which the
  // run the message starts shares, and that run's reads then do the walk themselves.
  const posted = handlers["message.posted"];
  handlers["message.posted"] = async (job, ctx) => {
    try {
      await posted?.(job, ctx);
    } finally {
      const message = await getMessage(deps.db, orgOf(job), String(job.payload.messageId)).catch(() => null);
      if (message) await scheduleParkedChecks(deps.db, message).catch(() => {});
    }
  };
  return handlers;
}

/** The message opens by addressing `handle` ("@ada …", after any other leading mentions). */
export function opensWith(body: string, handle: string): boolean {
  const lead = /^\s*((?:@[\w.-]+[\s,]*)+)/.exec(body)?.[1] ?? "";
  return (lead.match(/@([\w.-]+)/g) ?? []).some((m) => m.slice(1).toLowerCase() === handle.toLowerCase());
}
