# 0121. Long work that takes itself home

- Status: Accepted (built)
- Date: 2026-11-02
- Supersedes: ADR 0045 (background work, proposed and never built). Takes only ideas from the unmerged draft on `feat/agents-find-a-way` (ADR 0099 § Background work).
- Extends: ADR 0008 (runs), 0032 (brains), 0084 (agent status), 0089 (stretches), 0095 (hand-offs), 0097 (`decideTurnEnd`), 0112 (steering), 0114 (Cursor), 0118 (usage pause)
- Code: `packages/engine/src/works.ts` (move, updates, check-in job, queue, end, reconcile, views), `work-tools.ts` (the four tools), `executor.ts` (adoption, safety net, queue park, job yield, report home, wait/end hooks), `messages.ts` / `dispatch.ts` / `run-scope.ts` (`workKeepsThread`), `brains/select.ts` (`sessionFor`, `mayFallBack`), `agent-status.ts` (`work` line), `working.ts`, `recovery.ts` (`activeRunsIn`), `issues.ts` (`linkIssueToWork`, `setWorkIssueState`, `shareIssueWithEveryone`, `blocked`, `backgroundWork`), `notification-producers.ts`, `cancel.ts`, `continue-run.ts`, `context.ts` (prompt line, "# Your background work here"), `context/learn.ts`, `usage-pause.ts`, `notices.ts`, `events.ts` (`agent.work`); server `routes/app/issues.ts` (`POST …/issues/{id}/share`), `schemas.ts` (`WorkView`), `workers.ts` (sweep), `engine.ts`; client `lib/long-work.ts`; ui `components/WorkLine.tsx`; web `components/BackgroundWork.tsx`; phone `features/chat/WorkLine.tsx`; migration `0174_background_work.sql`; env `AGENT_WORK_MAX_PER_ORG`

## Context

- **One run holds the conversation.** An agent has one active run per conversation (`startOrJoinRun`, the `active` CTE of `insertMessageWithRuns`). A 40-minute task kept the working bar spinning for 40 minutes, and the agent couldn't answer side questions there.
- **`agent_runs.background` is a routine's run**: no person behind it, it never posts, it never falls back to the API. It can't be reused for a person's work.
- **Brains run long work differently.** The API model runs the loop; Claude Code keeps one process per (agent, session) and a single turn can last the whole job; Codex uses app-server threads; Cursor runs one `agent -p` per turn.
- **Live steering** reaches Claude Code at its next tool boundary and Codex app-server at its next model request; Cursor and the API model read messages at their next step.

## Decision

### 0. The same run steps out of the conversation

Going to the background starts no child run: the run already working keeps going and stops holding the conversation's slot. Permissions, audience, scopes, budget and the person behind it stay the same, the computer brain's session and process carry on mid-turn, and cards, hand-offs, proof and the controller keep working unchanged.

`moveToBackground` (`works.ts`), in one transaction: locks the run and claims it (`work_id is null`), posts the **anchor** where the run answers now (the agent's `say`, or on an automatic move the `work_auto_moved` body code with the workspace language's words as the fallback; `meta.longWork = { id, auto? }`), inserts the `agent_works` row and, for an ask in a main timeline, makes the anchor the run's thread (`own_thread`). Asked inside a thread, the thread stays (threads don't nest). It then publishes the anchor, `agent.work`, an `agent.idle` marked `background` (the apps drop the run's live bubble) and a message on `run-work:{runId}` so the executor holding the run adopts it even when the tool ran through the bridge on another replica. The executor's `replyThreadId`, `where`, `ctx.threadRootId` and its events' `background` mark are mutable and follow the move.

`meta.work` already names a reply's tool block, so the anchor's meta is `longWork`; updates carry `workUpdate`, ends `workEnd`.

### 1. When work becomes background work

- **The agent decides**: `work_in_background({ title, say, next_update_minutes?, plan?, card?, card_issue?, description? })`, through the tool gateway and so the MCP bridge on every brain. Listed only for a run a person is behind (`runAuthority` → `person`), in a channel or DM people read, never in a mission's thread, an agents' DM, a routine's run or a run that already is a work (`workEligible`). The prompt line (`WORK_IN_BACKGROUND_LINE`) goes in "How you work" when the tool is there.
- **The safety net is deterministic**: a timer per execution attempt (`autoMove` in the executor) counts active time (`transcript.activeMs` across parks, waits excluded) and model calls, and moves an eligible run at `WORK_AUTO_AFTER_MS` (4 min) or `WORK_AUTO_AFTER_CALLS` (20), concurrently with a long computer turn. Its title is the thread's when a person wrote it, else a short name the org's cheap model gives the conversation in its language (`nameConversation`: a thread, or a top-level ask with the few main-timeline messages before it; recorded with the run's agent), never the ask's own words; with no name it is empty (the line says "em segundo plano") and its card waits for a name. The note reaches the brain like a check-in (an agent-only `work_check_in` notice, live on a steerable turn).

### 2. Every brain, one surface

The same tools everywhere (`work_in_background`, `post_update`, `steer_work`, `stop_work`) and the final message as the report. `post_update` is listed with `work_in_background` (a CLI lists its tools once per process) and refuses until the run is a work.

- `sessionFor`: a conversation run never takes a session that a work run or an active run shares, through any row that carries it (an earlier finished run included).
- A work's turn end drops the check-ins it never read (agent-only `work_check_in` notices, `dropWorkNotices`): the turn's text is the report. A work still in line at a turn's end parks there (`workStartsNote` when its turn comes), never ends `done`.
- `mayFallBack`: a work waits for its computer instead of switching brains.
- No runner change and no protocol bump.
- An API-model work yields its job after `WORK_JOB_YIELD_MS` (1 h) at the loop top: it saves its transcript and queues its own `agent_run.execute` 10 s later. A single computer turn longer than the outbox's 6 h lease stays the known ceiling.

### 3. Progress updates

- Updates go to the anchor's thread (or the ask's thread); the report goes **home** (`home_thread_id`) as a normal reply with `meta.workEnd = { id, status }`.
- `post_update({ text, next_update_minutes?, plan?, important? })`: plain text ≤ 500, credentials masked; 5 min between updates unless `important` (then 1 min); the promise clamped to 5–20, default 10.
- **Check-in** (`agent_work.check_in`, deduped by work, seq and due time): a nudge the agent alone reads, then after `graceMs` (3 min) the server's own update (`work_auto_update`, worded from the run's automatic status line), and a new promise in 10 min; compare-and-set on `update_seq`; the fallback carries the promise it was queued for (`due`), so a wait that restarted the timer drops it. A work 15 min old without a card gets one from its own `card` check-in, queued at the move, whatever its updates did.
- **Waiting** (approval, question, usage pause, its computer, the line): `next_update_at` is null and no timer runs (`pauseWorkTimer` from `finished`); the card that stopped it is the update; on resume the promise starts over with 10 min (`resumeWorkTimer`).
- The report notifies the person behind it as news of its own (`work_end:{id}` group, so it pushes); updates never notify; the asker follows the anchor's thread.

### 4. Tasks board

A card when the agent sets `card` (or names one with `card_issue`), when the run already works on an issue, or when a live work reaches 15 min. An existing issue is linked, its `criteria` untouched. A new card: the work's title, the agent's description or the excerpt of the ask, assigned to the agent, `source = { type: "agent", workId, channelId, messageId }`, `channel_id` = the conversation's (seen by who reads it; **Mostrar para todos** clears it: only a work's card, by who asked for the work, the card's creator or an admin, with a `shared_everyone` activity line; the apps offer it only for a DM's or a private channel's card). `card_issue` links only a card the asker can read, in the work's conversation or workspace-wide; otherwise a new card is made.

| Work | Issue status | Blocked badge |
|---|---|---|
| Queued | `todo` | – |
| Working | `in_progress` | – |
| Waiting on a person, paused, its computer | its stage | `issues.blocked = { reason, since }` |
| Failed | its stage | `{ reason: failed, text: errorCode }` |
| Done | `done` (or kept `in_review`) | cleared |
| Stopped | `todo`, activity "work_stopped" | – |

Every update is an `issue_activity` event `work_update`. The plan (`[{ id, text, state }]`) shows as "Plano do agente", apart from the people's criteria. `IssueView` carries `blocked` and `backgroundWork` (the work's view).

### 5. Agent status

`AgentStatusKind` gets `work`; `AgentStatusLine` gets `since`, `count`, `second` and `wait`. Precedence: the agent's own words > its works > a conversation run's line > wait lines. A title shows only where everyone may read it (a public channel); elsewhere the line says "Trabalhando em segundo plano". The time leads the line ("Trabalhando há 20 min: X"), so a line cut to fit loses the end of the title, never the time. A live work makes the agent busy. `listWorkingRuns` carries `work` (title, plan progress, since); `workingNow` makes it `kind: "work"`.

### 6. Conversation UX (web and phone)

- Work runs never drive the conversation's working bar: their events carry `background`, and `activeRunsIn` marks them so.
- The anchor's **WorkLine** (`packages/ui`, phone `features/chat/WorkLine.tsx`, one view model `workLine` in `packages/client/src/lib/long-work.ts`): "Em segundo plano · 12 min · próximo update em ~8 min", the queue, "Aguardando sua aprovação", "Pausado no limite do plano · volta às 14:00", "Terminou em 38 min", "Não terminou", "Parado por Bia aos 12 min"; the last update as a second line; Abrir thread (only where no thread line already opens it), Tarefa #42, Ver resultado, Parar. Plain text that wraps.
- The agent stays free: an own-thread work no longer matches the join rules, and an in-thread work is excluded explicitly (`workKeepsThread` in the `active` and `floor_runs` CTEs and `startOrJoinRun`). A reply in the anchor's thread joins the work run (live on steerable brains).
- A new run in the conversation reads "# Your background work here" and has `steer_work` (forwards the person's messages unchanged into the work's inbox, live when it can) and `stop_work` (through `cancelRun`, so `mayStopRun` decides).
- **Parar** calls `POST …/runs/{runId}/cancel`; who may is computed by the apps as for any run (who asked, the agent's owner, an admin); the line is broadcast to everyone, so it can't carry a per-reader flag, and a refusal shows as a toast. `stopRun` closes the work home at once ("Parado por …").

### 7. Limits and safety

- Caps (counted under a per-workspace advisory lock): 3 live works per agent (`WORK_LIMITS.perAgent`), `AGENT_WORK_MAX_PER_ORG` (default 10) per workspace. Past a cap the move still happens and the work is `queued`: its run parks at the loop top (`waiting_input`, `waitingForBrain.code = "work_queue"`); ending any work releases the oldest that fits (`releaseQueuedWorks`) and queues its run; a run released while it parked wakes itself.
- Usage (ADR 0118): a work is long work by kind; in `usageWaitPlace` works go after conversation runs and before routines.
- Budget, the tool-call backstop and stretches apply unchanged. `continueRun` carries `work_id` and reopens the work in its own thread.
- A run that ends `done` without finishing (out of steps, stuck, its brain cut off) posts its closing line home with `meta.workEnd = { status: failed, errorCode }` (`run.too_many_tool_calls`, `run.stuck`, `run.brain_interrupted`); `endWork` takes that status. Its wrap-up note asks for the report (`WRAP_UP_WORK_NOTE`). The call count moves a run only after 90 s of active time (`WORK_AUTO_MIN_MS`).
- Failure: the end goes home with `meta.workEnd = { status: failed, errorCode, errorParams, lastUpdate }` (a stop: `byUserId`, and `bodyParams.byName`), worded by the apps (`workEndBody`), the card gets the blocked badge, `run_failed` notifies as before.
- Restarts: a work run is an ordinary run for `recoverStaleRuns`; check-ins are outbox jobs; the recovery worker also runs `reconcileWorks`, which closes once (`finished_at is null`) a work whose run is terminal and releases what fits.
- No duplicates: updates are tool calls in the one executor holding the lease; the fallback and the agent's update race on `update_seq`; the end on `finished_at`; the move on the locked run with `work_id is null` and the unique anchor.
- Learning (ADR 0120) ignores work runs when it checks whether the agent still works in that conversation.

### 8. Data

Migration `0174_background_work.sql`: `agent_works` (with `org_id`, `anchor_message_id` unique, partial indexes on live and queued), `agent_runs.work_id` (FK, set null on delete; partial index), `issues.blocked`. The work's current run is its newest run with that `work_id`.

### 9. Tests

`packages/engine/test/works.test.ts` (move and freed conversation, flat DM, in-thread ask, steering and `stop_work`, the safety net by time and by calls, check-in nudge/fallback/race/redelivery, update gaps and clamps, waits, cards and their stages, the 15-minute card, caps and the queue, the workspace cap, the sweep twice, status lines, Continuar), `engine-brains.test.ts` (a steerable brain gets the check-in live and keeps its session while a conversation run gets another; a brain that reads at its turn's end gets it next turn and the server's line covers the silence), `apps/server/test/long-work.test.ts` (the anchor's view, `agent.work`, `background` in active runs, Parar refused to others and closing it home), `apps/mobile/test/features/long-work.test.ts` (every line state in both languages, status lines, badges, server bodies, `workingNow`).

### 10. The owner's decisions (2026-11-02, approved as recommended; ADR 0124)

- **A card from a DM or a private channel stays private** to who reads that conversation; Mostrar para todos stays the way to show it to everyone (`works.test.ts` holds it).
- **Continuar after a provider error**: a work whose run failed with `run.provider_error` or `run.provider_unavailable` shows Continuar under its end (`workContinuable` in the apps; `continueRun` takes the work's `result_message_id` and marks `meta.workEnd.continuedRunId`). It carries the same work, as Continuar at the step limit does.
- **A finished anchor keeps no promise**: the line says "Terminou em N min" (or the failed or stopped wording), the anchor's text is dimmed, the server's automatic anchor shows its words without the next update (`work_auto_movedOver`), and an agent's anchor drops a last sentence that promises a time (`workAnchorBody`). `say` no longer carries a time: the line under it does.

## Left out

- Works for unattended runs and for missions (missions keep their own plan and progress).
- A Bloqueado column: a badge for now; one enum value later if wanted.
- "Continuar agora" on the paused line: the usage pause card in the work's thread has it.

## Addendum 2026-11-05: moving a run out of its thread

Asked inside a thread, a work kept the thread, and nothing could change that: `replyThreadOf` was fixed at the start and `post_message` refused the run's own channel. `post_message({ channel, text, move_here: true })` now posts at the top level of that channel (the thread's own, or another) and calls `moveRun` (`works.ts`): `agent_runs.channel_id` is the channel, `thread_root_id` the trigger (so `replyThreadOf` is null), and a work gets `channel_id`, `home_thread_id` null and `own_thread` false, so its updates and report land there too. Every later wake reads that row. A line stays where it was (`meta.movedOn`, `bodyCode` `moved_on`, the link as a message pill); it routes to nobody. The executor follows through `adoptWork`, which reads `channel_id` too, on the same `run-work` topic. `movableRun` holds what `workEligible` holds, minus the work checks: a person's run in a conversation people read, outside a mission's thread. A person writing in the old thread afterwards starts a new run there. A work's anchor stays where it was posted.

## Addendum 2026-11-06: a person who writes to a working agent gets an answer

A reply in the work's thread joined the work run. The run was deep in its own job, so the person got the quick reply's fallback ("Still on it (7 min). I'll read your message after this step.") instead of an answer, though moving the work out of the conversation was meant to keep the agent free to talk.

- **A reply turn answers.** A running work never takes a person's message (`workTakesPersonMessage` in `run-scope.ts`, in the `active` CTE of `insertMessageWithRuns` and in `startOrJoinRun` for a person's message). The message starts an ordinary run. In a channel, a reply in the thread a live work posts to (its anchor's, or the thread it was asked in) is addressed to that agent with no mention (`work_thread` CTE, `meta.forWork`, so the router stays out), unless it names a person: then it talks to them and the router decides. In a DM the agent is addressed anyway.
- **It knows the work.** "# Your background work here" (`workBrief`) now carries each work's last three updates and latest steps (the talker's `stepLine`, its narration included) next to its title, minutes and plan, and tells the turn to answer a question about the work from them, and to pass a change on with `steer_work` and say in one line that the work takes it at its next step. `steer_work` moves the message into the work's inbox (live on a steerable turn), only while its run is still active (checked in the same update), so a work that ended meanwhile refuses it and the reply turn keeps it. The work keeps running.
- **Still taken by the work:** a work waiting on something a person's message moves (browser help, another agent's answer) with no wait for its computer, line or plan; answers to its questions (`answered`); agents' messages (`workKeepsThread`, unchanged).
- **The computer's room.** The reply turn is a person's turn (rank 0, `personWaiting`): it skips the agents' spacing and may take the person's reserved slot. A work run no longer carries `personWaiting` on a later claim, so it never holds that slot against the person beside it, and in the computer's line it ranks as asked work (`roomAsked`, never `roomPeople`, even one its first turn set before it moved), so the reply turn goes ahead of it. A work's first turn that took the slot before it moved keeps it until that turn ends (the runner holds the slot by request; releasing it mid-turn would need a protocol step).
- **A foreground turn keeps the queue,** and its fallback line says what happens: the agent is in the middle of a task, can't answer yet, the message is queued, and it reads it at its next step or, on a computer brain that didn't take it live, when that round of work ends (`talker_status` `reads: "turn"`, `work.statusReplyTurn`).
- **The last update once.** In a thread view the work's updates are the messages under its anchor, so the anchor's line drops "Último update" there (`workLine` `inUpdatesThread`, web `MessageWorkLine inThread`, phone `MessageWorkLine` inside its thread).

## Addendum 2026-11-06: the step line says what the agent is doing, and a question card holds a question

A turn of 40 s showed only "pensando…": the working-text hold (`createDeltaPublisher`, `WORKING_TEXT_MAX`) keeps what the agent writes between calls out of the chat, and a computer brain's own calls (Claude Code's Read, Grep, Edit; Codex's shell) sent no `agent.tool`, so the step line had nothing to say.

- **Its words, never a message.** What the agent wrote since its last call is held per run (`holdStepWords` in `events.ts`), and its next call's `agent.tool` start carries the first sentence, plain, on one line of at most 120 characters (`said`, `takeStepWords`). A model brain's narration is its first call's. A computer brain's own call sends `agent.step` (`tool`, `said`) as it starts when the runner says so (`tool_started`: Claude Code and Grok Build, ours through the bridge left out), else once it ended (Codex and the others, an older runner); words that read like a key or a token are masked, and the silence word is never them. Neither is stored or posted, a background run sends neither, and the right hand's are scrubbed of sign-ins.
- **The step line** (`waitStep`, `barStep`: the bar above the composer while the row waits for words, web and phone) shows the words quoted (`chat.wait.said`), else the running call's verb, else a computer brain's own call's (`Read` → "mexendo nos arquivos do PC"), else "Pensando…". Each new call replaces it. The words show only past 5 s of the turn (`STEP_WORDS_AFTER_MS`): a quick answer shows nothing new. The answer arriving ends the waiting row as before, and its tools stay folded under it ("Usou N ferramentas").
- **No card cuts silently.** An approval's title and detail that don't fit end in "…" (`cutMarked`); a message an agent asks to post shows whole up to that cap.
- **A card holds one short question.** `ask_user` refuses a question over 300 characters (`QUESTION_MAX_CHARS`, `questionTooLong`) and says to write the explanation first (posted above the card) and ask one short question with choices. A `why` over 1000 characters is refused (`WHY_REFUSAL`), no longer cut. A reply on its way to a question card (ADR 0097 `ask_card`) that is longer than a question is posted whole instead (rule `ask_long`); the card no longer cuts it at 1000 characters.
- **Why it asked at all.** The follow-through judge read an answer to "what is missing?" as "listed what's missing instead of asking", nudged the agent to ask, and its next turn re-checked, corrected itself and became the card. The `ask` criterion now says a list that answers such a request is done. "# How you work" says what the agent's permissions allow and can still be undone (a form saved before submitting) it just does; sending for review stays among what needs a person.

## Addendum 2026-11-12: what a person passes on to a work is followed through

A reply turn passed a person's next step on to a work ("then post the summary in #team") with `steer_work` and said the agent would do it once the work was done. The work read the message, ended with its report without doing it, and nothing started the agent again: a message the work read counted as handled, and the reply turn had promised for a turn that never comes back.

- **Only its asker steers a work.** A work acts on its asker's access, so `steerWork` puts only the messages of the person who asked for it (`requested_by_user_id`) into its inbox and live delivery, marked with the work (`meta.steeredWorkIds`) and its run (`meta.steeredRunIds`). Anyone else's never reaches the work: it is marked with the work, kept on the work's anchor (`meta.heldAsks`, under the work's row lock, as its end takes it), and the reply turn says in one line that it runs once the work ends or is stopped, as them, with their own access: a correction from them becomes their own step after the work. The work reads its asker's with `PASSED_ON_NOTE` (`renderSteered`, between steps and live through the `workId` hook): do it before finishing, and say in the report what it did with it, or why not.
- **No other way in.** A work waiting on a person's help takes only its asker's messages (`workTakesPersonMessage` at the insert, and `mayJoin`, which every join goes through, the rest of an inbox handed on included). A work's question that names no one is its asker's (`postPauseCards`), so another person's reply neither answers it nor resumes the work. A work back from a decision reads only what was said for its asker meanwhile (`whileHeld`: their messages, and the agent's own lines only from runs working for them). A work never catches up on its conversation after a usage wait (`isCatchUp`).
- **Each end follows up what is due, once.** One predicate, `continuableEnd` (`runs.ts`), says whether Continuar can go on from an end, for `continueRun` and `endWork` alike: a person's stop, a step-limit or stuck reply (`meta.stepLimit`), or a work its AI provider cut off. At any `done` or `failed` end, `endWork` (in its transaction) takes the anchor's kept asks into an `agent_work.follow_up` job keyed per ending run. At an end Continuar can't go on from (done; its brain cut off, our error, an empty reply, no AI, a restart that cut a tool), it adds its asker's: what its runs read (`steeredMessageIds` steps) and what is still unread in the ending run's inbox, which leaves the inbox so its release doesn't hand it on too (a reply turn's own message can't start a second run and was lost). At one it can go on from, those stay with the work: its transcript holds what it read, `transcript.unreadAsks` the rest, which `continueRun` hands to the next run while each author can still post there. A restart's cut (`failInterrupted`) ends the work before it releases the inbox, and a pause on a decision (`releaseHeldInbox`) hands on only what wasn't passed on to the work. A person's stop follows up what never reached the work and its asker's unread asks, each told the work was stopped, so it does what still makes sense or passes; what it read stays in its transcript for a Continuar.
- **One follow-up per person.** The job (`followUpWork`) locks the work and, for each person who wrote the asks, while they may still post there and ask the agent, writes an agent-only `work_follow_up` notice where the work reports (its channel, `home_thread_id`), or, when the work went on where they aren't (`moveRun`), where they asked, told not to pass on what it did or found there. Each notice quotes only that person's messages, each cut at 4,000 characters, with a short body nobody reads. Each notice starts or joins a run on that person's own authority (its server-set `refs.personId`, `authority.ts`, like a GitHub event's), so nobody's ask runs on another's reach and the right hand never decides a card of one person's for another. A retry finds the notices already written for that end (`refs.endRunId`).
- **Quiet when the report covers it.** The notice is an informing one (`reply-policy.ts`): "Do now what they asked that the work didn't do and didn't say why not, then tell them what came of it. If the report says it did, says why not, or says it waits on them, pass: nothing is posted."
- **The reply turn.** "# Your background work here" passes on a next step for after the work too, says in one line what `steer_work` answered (the work takes it on, or it runs after the work, as them), and never says the turn will do it later itself. `steeredByOthers` also looks where the runs were asked, so a run sent on elsewhere (`moveRun`) keeps another person's words as theirs.
- Tests: `works.test.ts` (end to end with the asker: passed on, read with the note, one follow-up that passes; another person's ask that needs her reach, which never reaches the work and whose follow-up, as her, can't use the owner's; a follow-up that acts; two people: one follow-up each on their own authority, the right hand deciding only the owner's card, the job again writing nothing; the unread taken at a done end; a brain cut off and a restart's cut, both followed up, unread included; a pause on an approval keeping the work's messages; the step cap keeping the unread for Continuar; a failed work going on with Continuar, then one follow-up of both asks; at an end Continuar can go on from, another's ask followed up now and the asker's dropped for someone who can no longer post; a long message cut; none for a work nobody passed anything on to, at its end or a stop; the note only in its own work, between steps and live; another person's words still counted after a move; no other way in: a wait on help, the inbox sweeper, a catch-up, a resume, an inbox handed on, a question that names no one; a stop while waiting on an approval, followed up and told so; a moved work, followed up where she asked).

## Addendum 2026-11-14: what comes for a work after its report goes home too

A work that asked other agents something and ended its turn reported home with the answers still out. Each answer then woke the agent where the ended run pointed: the anchor's thread. The result the person was waiting for (the files, the summary) landed under the anchor, after the report, where nobody looks once the work says it ended; in the conversation the agent later spoke of things the person had never seen.

A notice for a run whose work ended and had its own thread (`deliverNoticeToRun`, `workHome` in `run-resume.ts`) is now written where the work reported: its channel and `home_thread_id`. The run it wakes is triggered there, so it answers in the conversation. While the work is on, a notice still lands in its thread; a work asked inside a thread keeps that thread, as before.
