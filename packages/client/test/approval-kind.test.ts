import { describe, expect, test } from "bun:test";
import { resources } from "@agenteschat/i18n";
import { LOCALE_CODES } from "@agenteschat/i18n/locale";
import { QueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { ApiError, type Approval, type ApprovalEmail, cacheApproval, keys } from "../src/index";
import { aheadPhase, approveAlwaysOffered, emailTitleWords } from "../src/lib/approval-kind";
import { approvalOriginShort } from "../src/lib/approval-origin";
import {
  actionName,
  aheadEndLine,
  alwaysRoutineName,
  approvalAskLine,
  approvalDoing,
  approvalGroupWaitsFor,
  approvalLetter,
  approvalLetterTo,
  approvalRuleServer,
  approvalRuleWords,
  approvalSummary,
  approvalTitle,
  approvalValues,
  approvalWaitsFor,
  approveAlwaysHint,
  approveAlwaysLabel,
  approveAlwaysWords,
  askKindWords,
  decisionOutcome,
  ownActionName,
  requesterDecidesLine,
} from "../src/lib/approval-words";
import { knownErrorText } from "../src/lib/errors";

const email = (over: Partial<ApprovalEmail> = {}): ApprovalEmail => ({
  verb: "draft",
  mailbox: "support@acme.com",
  provider: "iCloud",
  from: "support@acme.com",
  to: ["ana@acme.com"],
  cc: [],
  bcc: [],
  subject: "Re: Question",
  body: "Thanks!",
  original: { subject: "Question", from: "ana@acme.com" },
  ...over,
});

describe("a mail approval in words", () => {
  test("a reply draft, a draft, a draft to nobody yet", () => {
    expect(emailTitleWords(email())).toEqual({
      key: "approval.email.title.draftReply",
      values: { to: "ana@acme.com", more: 0 },
    });
    expect(emailTitleWords(email({ original: null })).key).toBe("approval.email.title.draft");
    expect(emailTitleWords(email({ to: [] })).key).toBe("approval.email.title.draftNoTo");
  });

  test("sends count everyone it goes to", () => {
    expect(
      emailTitleWords(email({ verb: "send", original: null, cc: ["bia@acme.com"], bcc: ["boss@acme.com"] })),
    ).toEqual({ key: "approval.email.title.sendMore", values: { to: "ana@acme.com", more: 2 } });
    expect(emailTitleWords(email({ verb: "reply" })).key).toBe("approval.email.title.reply");
  });

  test("one recipient never reads 'and 0 more', in any language", () => {
    for (const lng of LOCALE_CODES) {
      const instance = i18next.createInstance();
      void instance.init({ lng, fallbackLng: "en", resources, initAsync: false });
      for (const verb of ["send", "reply", "forward"] as const) {
        const one = emailTitleWords(email({ verb }));
        const two = emailTitleWords(email({ verb, cc: ["bia@acme.com"] }));
        const say = (w: typeof one) => String(instance.t(w.key, w.values as never));
        expect({ lng, verb, one: /\d/.test(say(one)) }).toEqual({ lng, verb, one: false });
        expect({ lng, verb, two: say(two).includes("1") }).toEqual({ lng, verb, two: true });
      }
    }
  });

  test("where it came from, short", () => {
    expect(approvalOriginShort({ origin: { kind: "routine", routineId: "r", routineName: "Vigiar e-mails" } })).toEqual(
      {
        key: "approval.originShort.routine",
        values: { name: "Vigiar e-mails" },
      },
    );
    expect(approvalOriginShort({ origin: { kind: "unattended" } })?.key).toBe("approval.originShort.unattended");
    expect(approvalOriginShort({ origin: null })).toBeNull();
  });
});

describe("Aprovar sempre in words", () => {
  /** No translations: each word falls back to the default the code gives, else its key. */
  const t = ((key: string, o?: { defaultValue?: string }) =>
    o && "defaultValue" in o ? o.defaultValue : key) as unknown as TFunction;

  test("an action's slug without its articles, its app after it; the tool itself when it wraps none", () => {
    expect(actionName(t, "GITHUB_CREATE_AN_ISSUE_COMMENT")).toBe("Create issue comment (GitHub)");
    // A slug leads with its verb, even when its last word could be one too.
    expect(actionName(t, "LINKEDIN_PUBLISH_POST")).toBe("Publish post (LinkedIn)");
    expect(approveAlwaysWords(t, { approveAlways: { tool: "X", actions: ["GITHUB_ADD_A_LABEL", "SLACK_X"] } })).toBe(
      "Add label (GitHub), X (Slack)",
    );
    expect(approveAlwaysWords(t, { approveAlways: { tool: "close_ticket", actions: [] } })).toBe("Close ticket");
    expect(approveAlwaysWords(t, { approveAlways: null })).toBe("");
    expect(ownActionName(t, "GITHUB_CREATE_AN_ISSUE_COMMENT")).toBe("Create issue comment (GitHub)");
    expect(ownActionName(t, "close_ticket")).toBe("Close ticket");
    expect(approvalRuleWords(t, { tool: "close_ticket", action: "", toolLabel: "Fechar chamado" })).toBe(
      "Fechar chamado",
    );
  });

  test("a command kept for the agent says the command; its rule is the agent's computer's", () => {
    const say = ((key: string, o?: Record<string, unknown>) =>
      `${key} ${JSON.stringify(o ?? {})}`) as unknown as TFunction;
    const approval = { approveAlways: { tool: "command", actions: ["gh issue create"] } };
    expect(approveAlwaysWords(say, approval)).toBe("gh issue create");
    expect(approveAlwaysHint(say, approval, "Ada")).toBe(
      'approval.always.noteCommand {"name":"Ada","context":"female","actions":"gh issue create","target":""}',
    );
    const rule = { tool: "command", action: "gh issue create", toolLabel: "command", connectionId: null, server: null };
    expect(approvalRuleWords(say, rule)).toBe("gh issue create");
    expect(approvalRuleServer(say, rule)).toBe("approval.always.computer {}");
  });

  test("a remembered push says its branch and repository, never a slug made of them", () => {
    const say = ((key: string, o?: Record<string, unknown>) => `${key} ${JSON.stringify(o)}`) as unknown as TFunction;
    const words = 'approval.always.pushTo {"repo":"acme/app","branch":"ana/fix"}';
    expect(
      approveAlwaysWords(say, { approveAlways: { tool: "request_branch_push", actions: ["acme/app:ana/fix"] } }),
    ).toBe(words);
    expect(approvalRuleWords(say, { tool: "request_branch_push", action: "acme/app:ana/fix", toolLabel: "x" })).toBe(
      words,
    );
  });

  test("where it isn't offered, the refusal in the person's words", () => {
    const refusal = new ApiError(409, "approval.always_unavailable", "This request can't be approved for good");
    expect(knownErrorText(t, refusal)).toBe("errors.approval.alwaysUnavailable");
  });
});

describe("an approval's values", () => {
  test("its summary tells two requests for one tool apart: labeled values, numbers in the locale's format", () => {
    const goal = (month: string) => ({
      params: { role: "seller", month, revenue_goal: 97000.5, year: 2026 },
      connector: "panel",
      email: null,
    });
    expect(approvalSummary(goal("2026-10"), "pt-BR")).toBe(
      "Role: seller · Month: 2026-10 · Revenue goal: 97.000,5 · Year: 2026",
    );
    expect(approvalSummary(goal("2026-11"), "en")).toBe(
      "Role: seller · Month: 2026-11 · Revenue goal: 97,000.5 · Year: 2026",
    );
    expect(approvalSummary({ params: { a: 1, b: 2, c: 3, d: 4, e: 5 }, connector: "x" }, "en")).toBe(
      "A: 1 · B: 2 · C: 3 · D: 4",
    );
  });

  test("on an engine whose Intl takes useGrouping as a boolean (Hermes), a year still reads as is", () => {
    const Real = Intl.NumberFormat;
    function hermes(locale?: string | string[], options?: Intl.NumberFormatOptions) {
      return new Real(locale, options && { ...options, useGrouping: Boolean(options.useGrouping ?? true) });
    }
    Intl.NumberFormat = hermes as unknown as typeof Intl.NumberFormat;
    try {
      expect(approvalSummary({ params: { year: 2026, revenue: 97000 }, connector: "x" }, "pt-BR")).toBe(
        "Year: 2026 · Revenue: 97.000",
      );
    } finally {
      Intl.NumberFormat = Real;
    }
  });

  test("a list of names is one value: whole in the details, cut on a card, never left out", () => {
    const branches = ["feat/login-google", "fix/old-header", "chore/bump-deps", "spike/x", "feat/y", "old-1", "old-2"];
    const a = { params: { repo: "acme/app", branches }, connector: "github", email: null };
    expect(approvalValues(a, { long: true })).toEqual([
      ["Repo", "acme/app"],
      ["Branches", branches.join(", ")],
    ]);
    const [, card] = approvalValues(a);
    expect(card?.[0]).toBe("Branches");
    expect(card?.[1]).toHaveLength(60);
    expect(card?.[1].startsWith("feat/login-google, fix/old-header, chore/bump-deps")).toBe(true);
    expect(card?.[1].endsWith("…")).toBe(true);
    expect(approvalValues({ params: { repo: "acme/app", branches: ["a", "b"] }, connector: "github" })).toEqual([
      ["Repo", "acme/app"],
      ["Branches", "a, b"],
    ]);
    // A list of objects still says nothing.
    expect(approvalValues({ params: { tools: [{ slug: "X" }] }, connector: "x" })).toEqual([]);
  });
});

describe("an approval's title", () => {
  const lang = (lng: string) => {
    const instance = i18next.createInstance();
    void instance.init({ lng, fallbackLng: "en", resources, initAsync: false, interpolation: { escapeValue: false } });
    return instance.t;
  };
  const pt = lang("pt-BR");
  const en = lang("en");
  const comment = { tool: "add_issue_comment", params: {}, email: null, connector: "github" };

  test("a server title that is only the tool's name reads as the tool in words, bare or after the connector", () => {
    // A tool the catalog knows, by its words (`tool-labels.ts`).
    expect(approvalTitle(pt, { ...comment, title: "GitHub: add_issue_comment" })).toBe("Comentar numa issue");
    expect(approvalTitle(pt, { ...comment, title: "add_issue_comment" })).toBe("Comentar numa issue");
    expect(approvalTitle(en, { ...comment, title: "GitHub: add_issue_comment" })).toBe("Comment on an issue");
    // One it doesn't, built from its verb and nouns.
    const other = { ...comment, tool: "add_issue_tags", title: "GitHub: add_issue_tags" };
    expect(approvalTitle(pt, other)).toBe("Adicionar etiquetas da issue");
  });

  test("a catalog action says what it touches in the person's words", () => {
    const merge = { tool: "github_merge_pull_request", connector: "github", email: null };
    const params = { pullNumber: 42, owner: "acme", repo: "app" };
    expect(approvalTitle(pt, { ...merge, title: "Merge PR #42 in acme/app", params })).toBe(
      "Fazer merge do PR #42 em acme/app",
    );
    expect(
      approvalTitle(pt, {
        tool: "github_actions_run_trigger",
        connector: "github",
        email: null,
        title: "Run deploy in acme/app",
        params: { method: "deploy", owner: "acme", repo: "app" },
      }),
    ).toBe("Rodar deploy em acme/app");
  });

  test("what the server named in English reads in the person's words", () => {
    const title = (tool: string, title: string, params = {}, connector: string | null = null) =>
      approvalTitle(pt, { tool, title, params, email: null, connector });
    expect(title("request_approval", "Roll back prod", { action: "rollback", target: "prod" })).toBe("Reverter prod");
    expect(title("vault_make_password", "Make a password")).toBe("Criar uma senha");
    expect(title("pg_analytics_query", "Query Analytics · prod")).toBe("Consultar Analytics · prod");
    expect(title("slack_send_message", "Slack: Send message", {}, "custom")).toBe("Enviar uma mensagem para fora");
    expect(title("slack_2_list_channels", "Slack (Acme): List channels", {}, "custom")).toBe("Listar canais");
    expect(
      title("crm_COMPOSIO_MULTI_EXECUTE_TOOL", "CRM: GITHUB_CREATE_AN_ISSUE, SLACK_LIST_CHANNELS", {}, "custom"),
    ).toBe("Criar issue (GitHub), Listar canais (Slack)");
  });

  test("a read that names an action reads as the read, never as doing it", () => {
    const title = (tool: string, label: string) =>
      approvalTitle(pt, { tool, title: label, params: {}, email: null, connector: "custom" });
    expect(title("gitlab_list_merge_requests", "GitLab: List merge requests")).not.toBe("Fazer um merge");
    expect(title("gitlab_list_merge_requests", "GitLab: List merge requests")).toStartWith("Listar");
    expect(title("hubspot_get_email_stats", "HubSpot: Get email stats")).toStartWith("Ver");
    expect(title("gitlab_merge_request_merge", "GitLab: Merge")).toBe("Fazer um merge");
  });

  test("a tool with no verb in its name keeps the one name it has, off the sentence", () => {
    const quirky = {
      tool: "acme_widgets",
      title: "Acme: Widgets",
      params: {},
      email: null,
      connector: "custom",
      scope: "x",
    };
    expect(approvalTitle(pt, quirky)).toBe("Acme: Widgets");
    expect(approvalDoing(pt, quirky as never, "pt-BR")).toBe("acme widgets");
  });
});

describe("an action prepared ahead", () => {
  test("asks, waits for its time once approved, then ran, or how it ended; nothing for one that runs once approved", () => {
    const runAt = "2026-11-03T13:00:00.000Z";
    const decidedAt = "2026-11-02T18:00:00.000Z";
    const at = (status: Approval["status"], over: Partial<Approval> = {}) =>
      aheadPhase({ runAt, status, executedAt: null, decidedAt: null, ...over });
    expect(at("pending")).toBe("asking");
    expect(at("approved", { decidedAt })).toBe("scheduled");
    expect(at("approved", { decidedAt, executedAt: "2026-11-03T13:00:04.000Z" })).toBe("ran");
    // Approved but its run didn't do it in time, nobody approved it by then, withdrawn: each says so.
    expect(at("expired", { decidedAt })).toBe("lapsed");
    expect(at("expired")).toBe("unapproved");
    expect(at("canceled", { decidedAt })).toBe("canceled");
    const say = ((key: string) => key) as unknown as TFunction;
    expect(aheadEndLine(say, { runAt, status: "expired", executedAt: null, decidedAt })).toBe("approval.ahead.lapsed");
    expect(aheadEndLine(say, { runAt, status: "approved", executedAt: null, decidedAt })).toBeNull();
    expect(at("refused", { decidedAt })).toBeNull();
    expect(aheadPhase({ runAt: null, status: "approved", executedAt: null, decidedAt })).toBeNull();
    expect(aheadPhase({ status: "pending", executedAt: null, decidedAt: null })).toBeNull();
  });

  test("news about one (it ran, it was withdrawn) makes its routine's page read again", () => {
    const qc = new QueryClient();
    qc.setQueryData(keys.routines("o1"), []);
    const ran = { id: "a1", status: "approved", executedAt: "2026-11-03T13:00:04.000Z" } as Approval;
    cacheApproval(qc, "o1", { ...ran, routineId: null });
    expect(qc.getQueryState(keys.routines("o1"))?.isInvalidated).toBe(false);
    cacheApproval(qc, "o1", { ...ran, routineId: "r1", runAt: "2026-11-03T13:00:00.000Z" });
    expect(qc.getQueryState(keys.routines("o1"))?.isInvalidated).toBe(true);
  });
});

describe("approvals an agent asked of named people (ADR 0126)", () => {
  const t = ((key: string) => key) as unknown as TFunction;
  const asked = { label: "Diretoria", requestedByUserId: "bia", requesterDecides: true };

  test("waits for the people asked, else the agent's owner", () => {
    expect(approvalWaitsFor({ approvers: asked }, "Ana")).toBe("Diretoria");
    expect(approvalWaitsFor({ approvers: null }, "Ana")).toBe("Ana");
  });

  test("a shared card names everyone its waiting requests wait for", () => {
    const pending = "pending" as const;
    expect(
      approvalGroupWaitsFor(
        [
          { approvers: asked, status: pending },
          { approvers: null, status: pending },
        ],
        "Ana",
      ),
    ).toBe("Diretoria, Ana");
    expect(
      approvalGroupWaitsFor(
        [
          { approvers: asked, status: pending },
          { approvers: asked, status: pending },
        ],
        "Ana",
      ),
    ).toBe("Diretoria");
    expect(
      approvalGroupWaitsFor(
        [
          { approvers: asked, status: "approved" },
          { approvers: null, status: pending },
        ],
        "Ana",
      ),
    ).toBe("Ana");
  });

  test("says the requester decides only while it waits or once they decided it", () => {
    const line = (over: Partial<Pick<Approval, "status" | "decidedByUserId" | "approvers">>) =>
      requesterDecidesLine(t, { status: "pending", decidedByUserId: null, approvers: asked, ...over });
    expect(line({})).toBe("approval.requesterDecides");
    expect(line({ status: "approved", decidedByUserId: "bia" })).toBe("approval.requesterDecides");
    expect(line({ status: "approved", decidedByUserId: "carla" })).toBeNull();
    expect(line({ approvers: { ...asked, requesterDecides: false } })).toBeNull();
  });
});

describe('"Sempre nesta rotina" on a routine\'s card', () => {
  const routine = async (code: "pt-BR" | "en") => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: code, resources, interpolation: { escapeValue: false } });
    return i18n.t.bind(i18n) as unknown as TFunction;
  };
  const kind = { tool: "composio_exec", actions: ["GMAIL_SEND_EMAIL"], routineId: "r1" };
  const card = {
    status: "pending",
    canDecide: true,
    approveAlways: kind,
    tool: "composio_exec",
    scope: "gmail:send",
    origin: { kind: "routine", routineId: "r1", routineName: "Resumo da semana" },
  } as Pick<Approval, "status" | "canDecide" | "approveAlways" | "tool" | "scope" | "origin">;

  test("its button, and what it covers and where it's undone, in the person's language", async () => {
    const pt = await routine("pt-BR");
    expect(approveAlwaysLabel(pt, card)).toBe("Sempre nesta rotina");
    expect(approveAlwaysHint(pt, card, "Ada")).toBe(
      "Resumo da semana faz Enviar e-mail (Gmail) sozinha de agora em diante, com qualquer valor. Fora desta rotina continua pedindo. Para desfazer: configurações da rotina.",
    );
    const en = await routine("en");
    expect(approveAlwaysLabel(en, card)).toBe("Always in this routine");
    expect(approveAlwaysHint(en, card, "Ada")).toContain("To undo: the routine's settings.");
  });

  test("a routine's name that isn't known reads as this routine; any other card has none", async () => {
    const pt = await routine("pt-BR");
    expect(alwaysRoutineName(pt, { ...card, origin: null })).toBe("Esta rotina");
    expect(alwaysRoutineName(pt, card)).toBe("Resumo da semana");
    expect(alwaysRoutineName(pt, { ...card, approveAlways: { tool: "t", actions: [] } })).toBeNull();
  });

  test("a send counts: it is a routine's job, and the server already left out what never is", () => {
    expect(approveAlwaysOffered(card)).toBe(true);
    expect(approveAlwaysOffered({ ...card, canDecide: false })).toBe(false);
    expect(approveAlwaysOffered({ ...card, status: "approved" })).toBe(false);
    // Plain "Aprovar sempre" shows wherever the server offers it, on a send too.
    expect(approveAlwaysOffered({ ...card, approveAlways: { tool: "t", actions: [] } })).toBe(true);
    expect(approveAlwaysOffered({ ...card, approveAlways: null })).toBe(false);
  });
});

describe("a request as someone it isn't waiting on reads it", () => {
  const instance = i18next.createInstance();
  void instance.init({ lng: "pt-BR", fallbackLng: "en", resources, initAsync: false });
  const t = instance.t;

  test("its kind and lead have no 'you'; a kind with no 'you' in it keeps its words", () => {
    expect(askKindWords(t, "approval", true)).toBe("Pede sua aprovação");
    expect(askKindWords(t, "approval", false)).toBe("Pede aprovação");
    expect(askKindWords(t, "browser", false)).toBe("Precisa de alguém no navegador");
    expect(askKindWords(t, "secret", false)).toBe("Pede um segredo");
    expect(approvalAskLine(t, true)).toBe("Preciso do seu ok para seguir:");
    expect(approvalAskLine(t, false)).toBe("Preciso de um ok para seguir:");
    expect(approvalAskLine(t, false, 3)).toBe("Preciso de um ok para seguir com estes 3:");
  });
});

describe("a request the agent asked for again, and a connector's message", () => {
  const instance = i18next.createInstance();
  void instance.init({ lng: "pt-BR", fallbackLng: "en", resources, initAsync: false });
  const pt = instance.t;
  const id = "3f2a9c1e-5b7d-4e8f-a1c2-d3e4f5a6b7c8";
  const reply = {
    tool: "reply_to_received_email",
    connector: "mailservice",
    email: null,
    params: {
      email_id: id,
      inbox_id: id,
      subject: "Re: Feedback",
      text: `Oi, Rita.\n\n${"Obrigado pelo retorno. ".repeat(6)}`,
    },
  };

  test("replaced: one line that says so, never 'Cancelado'", () => {
    const replaced = { status: "canceled" as const, decidedByUserId: null, decidedForUserId: null };
    expect(decisionOutcome(pt, { ...replaced, supersededById: "ap-2" }, null, () => undefined)).toBe(
      "Substituída pela versão abaixo",
    );
    expect(decisionOutcome(pt, replaced, null, () => undefined)).toBe("Cancelado");
  });

  test("a send or a reply reads as its message: subject, to whom, its text; its ids only in the details", () => {
    const letter = approvalLetter(reply);
    expect(letter).toMatchObject({ subject: "Re: Feedback", to: "", reply: true });
    expect(letter?.body.startsWith("Oi, Rita.\n\nObrigado")).toBe(true);
    expect(approvalLetterTo(pt, letter as NonNullable<typeof letter>)).toBe("Para quem enviou a mensagem");
    // The card's line: no ids, no subject, no text (the message shows them).
    expect(approvalValues(reply)).toEqual([]);
    expect(approvalValues(reply, { long: true }).map(([label]) => label)).toEqual([
      "Email id",
      "Inbox id",
      "Subject",
      "Text",
    ]);
    const send = {
      ...reply,
      tool: "send_email",
      params: { to: ["ana@example.com"], subject: "Oi", html: "<p>Oi <b>Ana</b></p>" },
    };
    expect(approvalLetter(send)).toMatchObject({ to: "ana@example.com", body: "Oi Ana", reply: false });
    // Its recipients are on the message, not again on the line.
    expect(approvalValues(send)).toEqual([]);
    // Through a tool that runs another by name.
    const wrapped = {
      ...reply,
      tool: "execute",
      params: { name: "GMAIL_SEND_EMAIL", arguments: { to: "bo@example.com", body: "Oi" } },
    };
    expect(approvalLetter(wrapped)).toMatchObject({ to: "bo@example.com", body: "Oi" });
  });

  test("anything else is no message: a comment, a call with no text, a built-in mailbox's", () => {
    expect(approvalLetter({ ...reply, tool: "add_issue_comment", params: { body: "Pode revisar?" } })).toBeNull();
    expect(approvalLetter({ ...reply, params: { email_id: id } })).toBeNull();
    expect(approvalLetter({ ...reply, connector: null })).toBeNull();
    // A lone id on any card's line says nothing either.
    expect(approvalValues({ params: { issue_id: id, title: "Bug" }, connector: "linear", email: null })).toEqual([
      ["Title", "Bug"],
    ]);
  });
});
