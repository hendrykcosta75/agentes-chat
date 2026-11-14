import type { AskToJoinResult, InvitationPreview } from "@agenteschat/client";
import { ApiError, invitationQuery, invitationStateQuery, keys, useAuthConfig, useMe } from "@agenteschat/client";
import { authErrorText, errorCode, errorText, invitedErrorText, knownErrorText } from "@agenteschat/client/lib/errors";
import { formatShortDate, joinNames } from "@agenteschat/client/lib/format";
import { INVITATION_MAIL_PARAM, signInPath } from "@agenteschat/client/lib/guards";
import { type HumanAction, type HumanCheck, withHumanCheck } from "@agenteschat/client/lib/human-check";
import {
  ANSWER_POLL_MS,
  askView,
  CODE_LENGTH,
  JOIN_NAME_MAX,
  JOIN_NOTE_MAX,
  sendsEmail,
  typedCode,
} from "@agenteschat/client/lib/join-requests";
import {
  emailTypoFix,
  isEmail,
  looksLikePassword,
  nameIsPassword,
  passwordState,
  webmailOf,
} from "@agenteschat/client/lib/text";
import { isPersonal, modeKey } from "@agenteschat/client/lib/workspace-mode";
import {
  Button,
  cx,
  type Expression,
  Field,
  Icon,
  Input,
  Locked,
  overLimit,
  PixelSpinner,
  Textarea,
} from "@agenteschat/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type KeyboardEvent, type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useApi } from "@/api/context";
import { useAuth } from "@/auth/context";
import { AgentAvatar } from "@/components/AgentAvatar";
import { AuthShell } from "@/components/AuthLayout";
import { OrgMark } from "@/components/ProfilePhoto";
import { prepareBurst } from "@/components/Sky";
import { rememberSignIn, SocialButtons, useSocialProviders } from "@/components/SocialButtons";
import { useNow } from "@/hooks/useNow";
import { useTextLimit } from "@/hooks/useTextLimit";
import { TYPED_VALUES } from "@/i18n";
import { inDesktopApp } from "@/lib/desktop";
import { useHumanCheck } from "@/lib/human-check";
import { lookOf } from "@/lib/look";
import { STORAGE_KEYS, sessionStore } from "@/lib/storage";
import { NameHint, PasswordHelp, passwordHelp } from "@/pages/AuthPage";
import "./invite.css";

/**
 * An invitation's page (ADR 0090), in the sign-in's language: the workspace on top, its first agent asking one thing
 * at a time, the horizon below. An email invitation asks only what its address is missing (a name and a password for
 * a new account, the password of one that has it, the provider of one that signs in without) and accepts; one that no
 * longer opens says what happened to it. An invitation link only asks to join (`LinkInvitation`).
 */
export function InvitePage({ token, join = false, mail }: { token: string; join?: boolean; mail?: string }) {
  const api = useApi();
  const me = useMe();
  const preview = useQuery(invitationQuery(api, token));
  if (preview.isPending || me.isPending) return <Loading />;
  if (preview.isError) return <LoadFailed retrying={preview.isFetching} retry={() => void preview.refetch()} />;
  const invitation = preview.data;
  if (!invitation) return <GoneInvitation token={token} />;
  if (invitation.kind === "link") return <LinkInvitation token={token} preview={invitation} />;
  // A paused or deleting workspace's invitation takes nobody, as a closed link says.
  if (invitation.closed) return <ClosedInvitation preview={invitation} />;
  if (invitation.full) return <FullWorkspace preview={invitation} />;
  return <EmailInvitation token={token} preview={invitation} join={join} proof={mail} />;
}

/* ---------- The page's parts ---------- */

type Agentish = NonNullable<InvitationPreview["agents"]>[number];

/** What the page shows of the workspace, above the host. */
interface OrgFacts {
  name: string;
  logo?: string;
  /** Who invited, in full. */
  by?: string | null;
  agents?: Agentish[];
  more?: number;
  /** How many of `agents`, from the first, the invitation starts the person with (ADR 0184). */
  yours?: number;
  /** A personal workspace (ADR 0159): its name ("Personal") says nothing to who is invited, whose space it is does. */
  personal?: boolean;
}

const orgOf = (preview: InvitationPreview): OrgFacts => ({
  name: preview.orgName,
  logo: preview.logo,
  by: preview.invitedBy,
  agents: preview.agents ?? [],
  more: preview.moreAgents ?? 0,
  yours: preview.yours ?? 0,
  personal: isPersonal(preview),
});

/** "Ana" from "Ana Souza": the host names whoever invited as a person would. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How long "Aprovado" shows before the workspace opens: long enough to read it. */
const ENTER_MOMENT_MS = 1200;

/**
 * One question of the page: the workspace, a link's progress, the host and its bubble, then the step's own
 * controls. `step` names the question (a new one comes in with its own motion); `bubble` changes when only the words
 * do (a wrong password).
 */
function InviteScreen({
  org,
  host,
  title,
  lead,
  expression,
  busy,
  step,
  bubble = step,
  progress,
  onSubmit,
  header,
  children,
}: {
  org?: OrgFacts;
  /** The workspace's first agent receives the person; without one, the product's own face. */
  host?: Agentish | null;
  title: string;
  lead?: string;
  expression?: Expression;
  busy?: boolean;
  step: string;
  bubble?: string;
  progress?: { at: number; total: number };
  onSubmit?: (e: FormEvent) => void;
  header?: Ref<HTMLElement>;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <header className="auth__ask" ref={header} data-burst>
        <Host agent={host} expression={expression} busy={busy} />
        <div className="auth__bubble" key={bubble} aria-live="polite">
          <h1 className="auth__title">{title}</h1>
          {lead && <p className="auth__lead">{lead}</p>}
        </div>
      </header>
      {children && (
        <div className="auth__step" key={step}>
          <Locked when={Boolean(busy)}>{children}</Locked>
        </div>
      )}
    </>
  );
  return (
    <AuthShell>
      <div className="invite">
        {org && <OrgLine org={org} />}
        {progress && <StepBars {...progress} />}
        {onSubmit ? (
          <form className="auth__form" onSubmit={onSubmit} noValidate>
            {inner}
          </form>
        ) : (
          <div className="auth__form">{inner}</div>
        )}
      </div>
    </AuthShell>
  );
}

/** The host: the workspace's first agent, as it looks there; the product's own face when it has none. */
function Host({ agent, expression, busy }: { agent?: Agentish | null; expression?: Expression; busy?: boolean }) {
  const state = busy ? "writing" : undefined;
  if (!agent) return <AgentAvatar name="agentes.chat" size="lg" expression={expression} state={state} />;
  return <AgentAvatar name={agent.name} appearance={lookOf(agent)} size="lg" expression={expression} state={state} />;
}

/** The workspace: its logo (else its initial), its name, who invited, and the faces and names of who works there. */
function OrgLine({ org }: { org: OrgFacts }) {
  const { t } = useTranslation();
  const agents = org.agents ?? [];
  const more = org.more ?? 0;
  // The agents the invitation starts the person with, by name ("Max vai trabalhar com você"); else who works there.
  const yours = agents.slice(0, org.yours ?? 0);
  const crew =
    yours.length > 0
      ? t("invite.crewYours", {
          count: yours.length,
          names: joinNames(
            yours.map((a) => a.name),
            t,
          ),
        })
      : agents.length > 0
        ? t("invite.crew", {
            count: agents.length + more,
            names: joinNames(
              [...agents.map((a) => a.name), ...(more ? [t("invite.ask.moreAgents", { count: more })] : [])],
              t,
            ),
          })
        : null;
  // A personal workspace goes by whose it is (ADR 0159), which already says who invited.
  const name = !org.personal
    ? org.name
    : org.by
      ? t("invite.personalName", { name: org.by })
      : t("invite.personalNameNoName");
  const from = org.by && !org.personal ? t("invite.from", { name: org.by }) : null;
  return (
    <div className="invite__org ac-faceline">
      <OrgMark logo={org.logo} size={32} />
      <div className="invite__org-text">
        <b className={cx("invite__org-name", (from || crew) && "ac-captop")}>{name}</b>
        {from && <span>{from}</span>}
        {crew && (
          <span className="invite__crew">
            <span className="invite__faces" aria-hidden="true">
              {agents.map((a) => (
                <AgentAvatar key={a.id} name={a.name} appearance={lookOf(a)} size="xs" />
              ))}
            </span>
            <span>{crew}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** A link's steps as bars: the ones before done, the one under way lit. */
function StepBars({ at, total }: { at: number; total: number }) {
  const { t } = useTranslation();
  return (
    <div className="invite__steps">
      <div className="ac-steps" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed number of bars
            key={i}
            className="ac-steps__bar"
            data-done={i < at - 1}
            data-current={i === at - 1 || undefined}
          />
        ))}
      </div>
      <span className="ac-visually-hidden">{t("invite.ask.stepOf", { n: at, total })}</span>
    </div>
  );
}

/** The address a step is about: locked to an invitation, confirmed by its code, or with Trocar to go back to it. */
function Who({
  email,
  locked,
  ok,
  onChange,
}: {
  email: string;
  locked?: boolean;
  ok?: boolean;
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <span className={cx("auth__who", ok && "auth__who--ok")} title={locked ? t("invite.emailHelp") : undefined}>
      <Icon name={ok ? "check" : locked ? "lock" : "mail"} size={14} />
      <span className="auth__who-email">{email}</span>
      {onChange && (
        <button type="button" className="auth__who-change" onClick={onChange}>
          {t("auth.flow.change")}
        </button>
      )}
    </span>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="auth__error ac-iconline" role="alert">
      <Icon name="alert" size={14} />
      {error}
    </p>
  );
}

/** The Terms and the Privacy policy, where the server has both. */
function Terms() {
  const { t } = useTranslation();
  const config = useAuthConfig().data;
  if (!config?.termsUrl || !config.privacyUrl) return null;
  return (
    <p className="auth__fine">
      {t("auth.termsBefore")}
      <a href={config.termsUrl}>{t("auth.terms")}</a>
      {t("auth.termsMiddle")}
      <a href={config.privacyUrl}>{t("auth.privacy")}</a>
      {t("auth.termsAfter")}
    </p>
  );
}

/** Something under way: the pixel orbit, in the host's own tones, beside what for and whose, in a well. */
function WaitCard({ host, title, sub }: { host?: Agentish | null; title: string; sub?: string }) {
  return (
    <div className="invite__wait ac-iconline">
      <PixelSpinner size={16} color={lookOf(host)?.color} />
      <span className="invite__wait-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </span>
    </div>
  );
}

/** The admin's note to someone turned down, in their words, as typed. */
function Reason({ text }: { text: string }) {
  return (
    <p className="invite__reason">
      <Trans i18nKey="invite.ask.reasonSaid" values={{ reason: text }} components={{ b: <b /> }} {...TYPED_VALUES} />
    </p>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <AuthShell>
      <div className="invite invite--loading">
        <PixelSpinner size={24} label={t("common.loading")} />
      </div>
    </AuthShell>
  );
}

function LoadFailed({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  const { t } = useTranslation();
  return (
    <InviteScreen title={t("common.loadFailed")} step="failed">
      <Button variant="primary" size="lg" block loading={retrying} onClick={retry}>
        {t("common.retry")}
      </Button>
    </InviteScreen>
  );
}

/**
 * A password's field as the sign-in has it: the eye to show it, the Caps Lock note, and for a new one the meter
 * under it. `face` is the host's: eyes shut while a hidden password is typed, a wink when it's shown.
 */
function usePasswordField(
  value: string,
  change: (value: string) => void,
  { fresh, wrong = false }: { fresh: boolean; wrong?: boolean },
) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [focus, setFocus] = useState(false);
  const [wink, setWink] = useState(false);
  const capsKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  const field = (
    <div className="auth__field">
      <div className="auth__pass">
        <Input
          className="auth__big"
          type={show ? "text" : "password"}
          aria-label={fresh ? t("invite.createPassword") : t("auth.password")}
          autoComplete={fresh ? "new-password" : "current-password"}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={capsKey}
          onKeyUp={capsKey}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          invalid={wrong || (fresh && passwordHelp(t, value).invalid)}
          autoFocus
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          icon={show ? "eyeOff" : "eye"}
          aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={show}
          className="auth__eye"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setShow((s) => !s);
            if (!show) {
              setWink(true);
              setTimeout(() => setWink(false), 900);
            }
          }}
        />
      </div>
      {fresh && <PasswordHelp password={value} />}
      {caps && focus && (
        <span className="auth__caps">
          <Icon name="arrowUp" size={14} />
          {t("auth.capsLock")}
        </span>
      )}
    </div>
  );
  const face: Expression | undefined = wink ? "wink" : focus && !show ? "closed" : undefined;
  return { field, face };
}

/** What a sign-out on this page keeps: the invitation, the sign-in settings and who is signed in (nobody, after). */
const KEPT: ReadonlySet<string> = new Set([keys.invitation("")[0], keys.authConfig[0], keys.me[0]]);

/**
 * Signs out and stays on the page: what the other account had cached goes, and the invitation is read again as
 * nobody's (a link's `you` was the account's).
 */
function useSignOutHere(token: string) {
  const auth = useAuth();
  const qc = useQueryClient();
  return async () => {
    await auth.signOut();
    qc.removeQueries({ predicate: (query) => !KEPT.has(String(query.queryKey[0])) });
    qc.setQueryData(keys.me, null);
    await qc.invalidateQueries({ queryKey: keys.invitation(token) });
  };
}

/* ---------- An email invitation ---------- */

type EmailStep = "accept" | "other" | "name" | "newPassword" | "password" | "social" | "forgot" | "sent";

/** The steps that send something a bot could flood, and what their bot check is for (ADR 0075). */
const EMAIL_CHECKS: Partial<Record<EmailStep, HumanAction>> = {
  newPassword: "sign-up",
  password: "sign-in",
  forgot: "password-reset",
};

/** The preview always says how the address signs in (ADR 0090); without it, a name and a password make an account. */
const NO_ACCOUNT: NonNullable<InvitationPreview["account"]> = { exists: false, password: false, providers: [] };

/**
 * An email invitation (ADR 0090). Signed in as its address: one press accepts. As another address: whose it is, and
 * signing out here leads to that address's own step. Signed out: a new address gives a name, then a password; one
 * with a password types it ("Esqueci a senha" is the sign-in's reset); one that signs in only with a provider gets
 * that provider. A provider comes back to `?join=1`, which accepts by itself for the invited address. Opened from its
 * own email (`proof`, that link's `?mail=`), accepting confirms the address; then the workspace opens.
 */
function EmailInvitation({
  token,
  preview,
  join,
  proof,
}: {
  token: string;
  preview: InvitationPreview;
  join: boolean;
  proof?: string;
}) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const auth = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useMe().data?.user ?? null;
  const config = useAuthConfig().data;
  const signOutHere = useSignOutHere(token);
  const invited = preview.email;
  const org = preview.orgName;
  const by = preview.invitedBy ? firstName(preview.invitedBy) : null;
  const account = preview.account ?? NO_ACCOUNT;
  const signedOut = (): EmailStep => (account.exists ? (account.password ? "password" : "social") : "name");
  const [step, setStep] = useState<EmailStep>(() =>
    user ? (sameAddress(user.email, invited) ? "accept" : "other") : signedOut(),
  );
  // The other account's address, as it was: signing out empties `me` while the step still shows it.
  const [otherEmail] = useState(() => user?.email ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const header = useRef<HTMLElement>(null);
  const human = useHumanCheck(EMAIL_CHECKS[step] ?? null);
  const pw = usePasswordField(
    password,
    (value) => {
      setPassword(value);
      setWrong(false);
    },
    { fresh: step === "newPassword", wrong },
  );
  // In the Mac app's window a provider signs in through the browser (ADR 0036), which this page doesn't hand back.
  const desktop = inDesktopApp();
  const linked = useSocialProviders(account.providers);
  const configured = useSocialProviders();
  const providers = desktop ? [] : linked;
  const anyProvider = desktop ? [] : configured;
  const canReset = config?.passwordReset === true;
  // The proof is base64url (the route takes no other shape): it goes in the address as it is.
  const back = `/invite/${token}?join=1${proof ? `&${INVITATION_MAIL_PARAM}=${proof}` : ""}`;

  const go = (next: EmailStep) => {
    setError(null);
    setWrong(false);
    setStep(next);
  };

  /** One press at a time (Enter while the bot check waits included); `work` says whether the workspace opened. */
  const run = async (work: () => Promise<boolean>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(null);
    let entered = false;
    try {
      entered = await work();
    } finally {
      if (!entered) {
        running.current = false;
        setPending(false);
      }
    }
  };

  /** Accepts as the account signed in now, then opens the workspace from the host. */
  const accept = async (signedInNow = false): Promise<boolean> => {
    try {
      const { orgId } = await api.orgs.acceptInvitation(token, proof);
      const burst = prepareBurst(header.current ?? document.body);
      await qc.invalidateQueries({ queryKey: keys.me });
      burst();
      await navigate({ to: "/org/$orgId", params: { orgId } });
      return true;
    } catch (e) {
      // A known code in the invited person's words (a full workspace says whom to tell), never the server's English.
      setError(invitedErrorText(t, e, i18n.language) ?? errorText(t, e, i18n.language));
      // Signed in now, the account stays: trying again only accepts.
      if (signedInNow) {
        setStep("accept");
        void qc.invalidateQueries({ queryKey: keys.me });
      }
      // One that stopped working meanwhile: the page says what happened to it.
      void qc.invalidateQueries({ queryKey: keys.invitation(token) });
      return false;
    }
  };

  // With the invitation's token and its email's proof, the address is proved: the new account gets no "confirm your
  // email" (ADR 0090 §6). Opened from a copied link, there's no proof and the message goes as for anyone.
  const signUp = () =>
    run(async () => {
      const result = await withHumanCheck(human.check, (humanCheck) =>
        auth.signUp({ name: name.trim(), email: invited, password, invitation: { token, mail: proof } }, humanCheck),
      );
      if (!result.ok) {
        setError(authErrorText(t, result));
        return false;
      }
      rememberSignIn("email");
      return accept(true);
    });

  const signIn = () =>
    run(async () => {
      const result = await withHumanCheck(human.check, (humanCheck) =>
        auth.signIn({ email: invited, password }, humanCheck),
      );
      if (!result.ok) {
        setWrong(result.status === 401);
        // Checked by code: a refused origin is a 403 too, and its own words tell an admin what to fix.
        setError(result.status === 401 ? null : authErrorText(t, result));
        return false;
      }
      rememberSignIn("email");
      return accept(true);
    });

  const sendReset = () =>
    run(async () => {
      const result = await withHumanCheck(human.check, (check) =>
        auth.requestPasswordReset({ email: invited, redirectTo: `${window.location.origin}/reset-password` }, check),
      );
      if (result.ok) go("sent");
      else setError(authErrorText(t, result));
      return false;
    });

  /** Another account, or "not you": signed out here, the invited address's own step follows on this page. */
  const switchAccount = () =>
    run(async () => {
      await signOutHere();
      setPassword("");
      go(signedOut());
      return false;
    });

  // Back from a provider's sign-in started here (`?join=1`), as the invited address: accepted at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on the way back
  useEffect(() => {
    if (join && step === "accept") void run(() => accept());
  }, []);

  const ready =
    step === "name"
      ? name.trim() !== ""
      : step === "newPassword"
        ? passwordState(password) === "ok"
        : step === "password"
          ? password.length > 0
          : step === "forgot";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending) return;
    if (step === "name") go("newPassword");
    else if (step === "newPassword" && nameIsPassword(name, password)) {
      setPassword("");
      go("name");
      setError(t("auth.flow.nameIsPassword"));
    } else if (step === "newPassword") void signUp();
    else if (step === "password") void signIn();
    else if (step === "forgot") void sendReset();
  };

  const first = name.trim().split(/\s+/)[0] ?? "";
  // A team's invitation that gives cargos says them (ADR 0184): "…para a Acme, como Suporte."
  const cargos =
    !isPersonal(preview) && preview.roles?.length
      ? joinNames(
          preview.roles.map((r) => r.name),
          t,
        )
      : null;
  const calledYou = cargos
    ? by
      ? t("invite.calledYouAs", { name: by, org, roles: cargos })
      : t("invite.calledYouAsNoName", { org, roles: cargos })
    : by
      ? t(modeKey(preview, "invite.calledYou"), { name: by, org })
      : t(modeKey(preview, "invite.calledYouNoName"), { org });
  const hello = cargos
    ? by
      ? t("invite.helloAs", { name: by, org, roles: cargos })
      : t("invite.helloAsNoName", { org, roles: cargos })
    : by
      ? t(modeKey(preview, "invite.hello"), { name: by, org })
      : t(modeKey(preview, "invite.helloNoName"), { org });
  const providerNames = providers.map((p) => t(`auth.provider.${p}`)).join(" · ");
  const signInStep = account.password ? "password" : "social";
  const mail = webmailOf(invited);
  const bubble: Record<EmailStep, [string, string?]> = {
    accept: [calledYou, t("invite.signedInLead", { email: invited })],
    other: [
      t("invite.otherTitle", { email: invited }),
      t(modeKey(preview, "invite.otherLead"), { other: otherEmail, org }),
    ],
    name: [hello, t(modeKey(preview, "invite.nameLead"))],
    newPassword: [
      first ? t("auth.flow.newPasswordNamed", { name: first }) : t("auth.flow.newPassword"),
      t(modeKey(preview, "invite.newPasswordLead"), { org }),
    ],
    password: wrong
      ? [t("auth.flow.wrong")]
      : [
          t("auth.flow.password"),
          by
            ? t(modeKey(preview, "invite.passwordLead"), { name: by, org })
            : t(modeKey(preview, "invite.passwordLeadNoName"), { org }),
        ],
    social: [
      calledYou,
      providers.length > 0 ? t("invite.socialLead", { providers: providerNames }) : t("auth.flow.socialLead"),
    ],
    forgot: [t("auth.flow.forgot"), t("auth.flow.forgotLead")],
    sent: [t("auth.flow.sent", { email: invited }), t("auth.flow.sentLead")],
  };
  const [title, lead] = bubble[step];
  const passwordStep = step === "password" || step === "newPassword";
  const expression = wrong ? "cross" : passwordStep ? pw.face : step === "sent" ? "happy" : undefined;
  const locked = <Who email={invited} locked />;
  const enterLabel = t(modeKey(preview, "invite.enter"), { org });

  let body: ReactNode = null;
  switch (step) {
    case "accept":
      body = (
        <>
          <ErrorLine error={error} />
          <Button variant="primary" size="lg" block loading={pending} onClick={() => void run(() => accept())}>
            {enterLabel}
          </Button>
          <button type="button" className="auth__quiet" onClick={() => void switchAccount()}>
            {t("invite.ask.notYou")}
          </button>
        </>
      );
      break;
    case "other":
      body = (
        <>
          <Who email={otherEmail} />
          <ErrorLine error={error} />
          <Button variant="primary" size="lg" block loading={pending} onClick={() => void switchAccount()}>
            {t("invite.switch", { email: invited })}
          </Button>
        </>
      );
      break;
    case "name":
      body = (
        <>
          {locked}
          <div className="auth__field">
            <Input
              className="auth__big"
              aria-label={t("auth.yourName")}
              autoComplete="name"
              spellCheck={false}
              placeholder={t("auth.flow.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {!error && <NameHint name={name} />}
          </div>
          <ErrorLine error={error} />
          <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} disabled={!ready}>
            {t("auth.flow.continue")}
          </Button>
          {anyProvider.length > 0 && (
            <>
              <div className="auth__or">{t("common.or")}</div>
              <SocialButtons callbackURL={back} providers={anyProvider} />
            </>
          )}
          <Terms />
        </>
      );
      break;
    case "newPassword":
      body = (
        <>
          {locked}
          {pw.field}
          {human.slot}
          <ErrorLine error={error} />
          <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} loading={pending} disabled={!ready}>
            {enterLabel}
          </Button>
          <button type="button" className="auth__quiet" onClick={() => go("name")}>
            {t("auth.flow.back")}
          </button>
          <Terms />
        </>
      );
      break;
    case "password":
      body = (
        <>
          {locked}
          {pw.field}
          {human.slot}
          <ErrorLine error={error} />
          <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} loading={pending} disabled={!ready}>
            {enterLabel}
          </Button>
          {canReset && (
            <button type="button" className="auth__quiet" onClick={() => go("forgot")}>
              {t("auth.forgotPassword")}
            </button>
          )}
          {providers.length > 0 && (
            <>
              <div className="auth__or">{t("common.or")}</div>
              <SocialButtons callbackURL={back} providers={providers} />
            </>
          )}
        </>
      );
      break;
    case "social":
      body = (
        <>
          {locked}
          <SocialButtons callbackURL={back} providers={providers} />
          {canReset && (
            <button type="button" className="auth__quiet" onClick={() => go("forgot")}>
              {t("auth.flow.createPassword")}
            </button>
          )}
        </>
      );
      break;
    case "forgot":
      body = (
        <>
          {locked}
          {human.slot}
          <ErrorLine error={error} />
          <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} loading={pending}>
            {t("auth.flow.sendLink")}
          </Button>
          <button type="button" className="auth__quiet" onClick={() => go(signInStep)}>
            {t("auth.flow.back")}
          </button>
        </>
      );
      break;
    case "sent":
      body = (
        <>
          {mail && (
            <Button asChild variant="primary" size="lg" block>
              <a href={mail.url} target="_blank" rel="noopener noreferrer">
                {t("auth.flow.openMail", { app: mail.name })}
              </a>
            </Button>
          )}
          <Button size="lg" block onClick={() => go(signInStep)}>
            {t("auth.flow.backToSignIn")}
          </Button>
        </>
      );
      break;
  }

  return (
    <InviteScreen
      org={orgOf(preview)}
      host={preview.agents?.[0]}
      title={title}
      lead={lead}
      expression={expression}
      busy={pending}
      step={step}
      bubble={`${step}-${wrong}`}
      onSubmit={submit}
      header={header}
    >
      {body}
    </InviteScreen>
  );
}

/** Closed (a link turned off or run out, a paused or deleting workspace): only that, and whom to ask (ADR 0068). */
function ClosedInvitation({ preview }: { preview: InvitationPreview }) {
  const { t } = useTranslation();
  return (
    <InviteScreen
      org={orgOf(preview)}
      expression="closed"
      title={t("invite.ask.closedTitle")}
      lead={t("invite.ask.closedText")}
      step="closed"
    />
  );
}

/** A link that took all its people (ADR 0184): only that, and whom to ask for a new one. */
function FullLink({ preview }: { preview: InvitationPreview }) {
  const { t } = useTranslation();
  const by = preview.invitedBy ? firstName(preview.invitedBy) : null;
  return (
    <InviteScreen
      org={orgOf(preview)}
      expression="closed"
      title={t("invite.ask.fullTitle")}
      lead={by ? t("invite.ask.fullLead", { name: by }) : t("invite.ask.fullLeadNoName")}
      step="link-full"
    />
  );
}

/** No seat left: said before anyone makes an account, and the same link works once one opens (ADR 0090). */
function FullWorkspace({ preview }: { preview: InvitationPreview }) {
  const { t } = useTranslation();
  return (
    <InviteScreen
      org={orgOf(preview)}
      host={preview.agents?.[0]}
      title={t(modeKey(preview, "invite.fullTitle"), { org: preview.orgName })}
      lead={t("invite.fullLead")}
      step="full"
    >
      <p className="auth__fine">{t("invite.fullFine")}</p>
    </InviteScreen>
  );
}

/**
 * An email invitation the preview no longer opens (ADR 0090): accepted (the workspace to open, signing in on the way
 * when needed), expired (ask whoever invited for a new one, where email goes out), or nothing known (cancelled, or
 * never one), which says only that.
 */
function GoneInvitation({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const me = useMe();
  const emails = sendsEmail(useAuthConfig().data);
  const state = useQuery(invitationStateQuery(api, token));
  const [asked, setAsked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (state.isPending) return <Loading />;
  if (state.isError) return <LoadFailed retrying={state.isFetching} retry={() => void state.refetch()} />;
  const dead = state.data;
  if (!dead) return <InviteScreen title={t("invite.goneTitle")} lead={t("invite.goneLead")} step="gone" />;
  const date = formatShortDate(i18n.language, dead.at);

  if (dead.state === "accepted") {
    const { orgId, orgName } = dead;
    // A member knows the workspace's mode: a personal one is never named by its name ("Personal"), ADR 0159.
    const mine = me.data?.organizations.find((o) => o.id === orgId);
    const member = mine !== undefined;
    const open = () =>
      member
        ? navigate({ to: "/org/$orgId", params: { orgId } })
        : navigate({ to: "/login", search: { redirect: `/org/${orgId}` } });
    return (
      <InviteScreen
        org={{ name: orgName, personal: isPersonal(mine) }}
        expression="happy"
        title={t(modeKey(mine, "invite.usedTitle"), { org: orgName })}
        lead={t("invite.usedLead", { date })}
        step="used"
      >
        <Button variant="primary" size="lg" block onClick={() => void open()}>
          {t(modeKey(mine, "invite.open"), { org: orgName })}
        </Button>
      </InviteScreen>
    );
  }

  const by = dead.invitedBy ? firstName(dead.invitedBy) : null;
  const askNew = async () => {
    setPending(true);
    setError(null);
    try {
      await api.invites.requestNew(token);
      setAsked(true);
    } catch (e) {
      // A link replaced by a newer invitation, cancelled or already accepted has no one to ask.
      setError(knownErrorText(t, e, i18n.language) ?? t("invite.askNewFailed"));
    } finally {
      setPending(false);
    }
  };
  // Asking is an email to whoever invited: a server that sends none would never deliver it.
  const lead = !emails
    ? by
      ? t("invite.expiredNoEmail", { name: by })
      : t("auth.flow.expiredLeadAsk")
    : asked
      ? by
        ? t("invite.expiredAsked", { name: by })
        : t("invite.expiredAskedNoName")
      : by
        ? t("invite.expiredAsk", { name: by })
        : t("invite.expiredAskNoName");
  return (
    <InviteScreen
      org={{ name: dead.orgName, by: dead.invitedBy }}
      expression={asked ? "happy" : undefined}
      title={t("invite.expiredOn", { date })}
      lead={lead}
      step={asked ? "asked" : "expired"}
    >
      {emails && (
        <>
          <ErrorLine error={error} />
          <Button variant="primary" size="lg" block disabled={asked} loading={pending} onClick={() => void askNew()}>
            {asked ? t("invite.askedNew") : t("invite.askNew")}
          </Button>
          {asked && <p className="auth__fine">{t("invite.expiredComes")}</p>}
        </>
      )}
    </InviteScreen>
  );
}

/* ---------- An invitation link ---------- */

/** A request this tab made through a link (ADR 0090): the key that signs in once approved, and whose it is. */
interface Asked {
  key: string;
  name: string;
  email: string;
}

const askedAt = (token: string) => `${STORAGE_KEYS.joinAsked}.${token}`;

/** The request this tab made, through a reload: in `sessionStorage`, gone with the tab. */
function readAsked(token: string): Asked | null {
  try {
    const saved = JSON.parse(sessionStore.get(askedAt(token)) ?? "null") as Partial<Asked> | null;
    if (typeof saved?.key !== "string") return null;
    return { key: saved.key, name: String(saved.name ?? ""), email: String(saved.email ?? "") };
  } catch {
    return null;
  }
}
const keepAsked = (token: string, asked: Asked) => sessionStore.set(askedAt(token), JSON.stringify(asked));
const forgetAsked = (token: string) => sessionStore.remove(askedAt(token));

/**
 * An invitation link (ADR 0068, 0090): whoever opens it asks, and an admin approves each person. Signed in, the
 * account asks (`AskAsAccount`). Signed out on a server that sends email, one thing per screen (the email, its code,
 * a name, a password, a note), then the page waits for the answer and signs in once an admin approves (`Waiting`);
 * a reload keeps waiting. Where no email goes out, the typed form of ADR 0068 (`AskForm`).
 */
function LinkInvitation({ token, preview }: { token: string; preview: InvitationPreview }) {
  const user = useMe().data?.user ?? null;
  const emails = sendsEmail(useAuthConfig().data);
  const [asked, setAsked] = useState<Asked | null>(() => readAsked(token));
  // Waiting goes on while it signs in, so the page never flashes the account's own form on the way in.
  if (asked) return <Waiting token={token} preview={preview} asked={asked} />;
  // A link that took all the people it may (ADR 0184): said before anyone asks, with whom to ask for another.
  if (preview.full) return <FullLink preview={preview} />;
  if (user) return <AskAsAccount token={token} preview={preview} />;
  if (preview.closed) return <ClosedInvitation preview={preview} />;
  if (!emails) return <AskForm token={token} preview={preview} />;
  return (
    <AskSteps
      token={token}
      preview={preview}
      onAsked={(next) => {
        keepAsked(token, next);
        setAsked(next);
      }}
    />
  );
}

/** Where codes went (ADR 0072): to which address, when another may go, and an address past its cap. */
function useCodeSender(token: string, check: HumanCheck | null) {
  const { t } = useTranslation();
  const api = useApi();
  const [sent, setSent] = useState<{ to: string; resendAt: number } | null>(null);
  const [capped, setCapped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return {
    sent,
    capped,
    pending,
    /** A code went to `to` and another can't go yet. */
    waiting: (to: string) => sent?.to === to && Date.now() < sent.resendAt,
    /** Codes sent before mean nothing now (a proof that ran out): the next Continue sends one. */
    forget: () => setSent(null),
    /** Sends one to `to` (`body` names it, or not, for the account's own): the refusal in words, or null once out. */
    send: async (to: string, body: { email?: string }): Promise<string | null> => {
      setPending(true);
      try {
        const result = await withHumanCheck(check, (humanCheck) => api.invites.sendCode(token, body, humanCheck));
        setSent({ to, resendAt: Date.now() + result.resendIn * 1000 });
        return null;
      } catch (e) {
        // A code went out a moment ago (a reload, another tab): that one is still good.
        const retryIn = e instanceof ApiError && e.code === "join.code_wait" ? Number(e.params?.retryIn) : 0;
        if (retryIn > 0) {
          setSent({ to, resendAt: Date.now() + retryIn * 1000 });
          return null;
        }
        // Past the address's hourly or daily cap, each press is a sure 429 that still spends the link's shared budget.
        if (errorCode(e) === "join.code_limit") setCapped(to);
        return errorText(t, e);
      } finally {
        setPending(false);
      }
    },
  };
}

type CodeSender = ReturnType<typeof useCodeSender>;

/**
 * The emailed code, on a screen of its own (ADR 0072, 0090): six digits, checked as the sixth comes in (spaces and
 * dashes don't count); a wrong one empties the field for another try. Resend once the countdown ends.
 */
function CodeField({
  token,
  address,
  body,
  codes,
  slot,
  onProven,
  onWrong,
}: {
  token: string;
  /** Where it went, as `codes` keeps it. */
  address: string;
  /** The address as the server takes it: the one typed, or none for the account's own. */
  body: { email?: string };
  codes: CodeSender;
  /** The bot check's place, for a resend. */
  slot: ReactNode;
  onProven: (code: string) => void;
  onWrong: (wrong: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resendAt = codes.sent?.to === address ? codes.sent.resendAt : 0;
  // A repaint every second while the countdown runs; the time itself is read below.
  useNow((now) => (now < resendAt ? 1000 : false));
  const left = Math.max(0, resendAt - Date.now());
  const mail = webmailOf(address);

  const check = async (typed: string) => {
    setChecking(true);
    try {
      await api.invites.checkCode(token, { ...body, code: typed });
      onProven(typed);
    } catch (e) {
      setCode("");
      setError(errorText(t, e));
      onWrong(true);
      input.current?.focus();
    } finally {
      setChecking(false);
    }
  };
  const typedIn = (value: string) => {
    const digits = typedCode(value);
    setCode(digits);
    setError(null);
    onWrong(false);
    if (digits.length === CODE_LENGTH && !checking) void check(digits);
  };
  const resend = async () => {
    const failed = await codes.send(address, body);
    setError(failed);
    if (!failed) {
      setCode("");
      // After the screen unlocks: a disabled field takes no focus.
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  return (
    <>
      <Locked when={checking}>
        <div className="auth__field">
          <Input
            ref={input}
            className="auth__big ac-input--code"
            aria-label={t("invite.ask.code")}
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            value={code}
            aria-busy={checking || undefined}
            invalid={error !== null}
            onChange={(e) => typedIn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (code.length === CODE_LENGTH && !checking) void check(code);
            }}
            autoFocus
          />
        </div>
      </Locked>
      <ErrorLine error={error} />
      {mail && (
        <Button asChild size="lg" block>
          <a href={mail.url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={16} />
            {t("auth.flow.openMail", { app: mail.name })}
          </a>
        </Button>
      )}
      {slot}
      <div className="invite__resend">
        {left > 0 ? (
          <span className="auth__help">{t("invite.ask.resendIn", { count: Math.ceil(left / 1000) })}</span>
        ) : (
          <button
            type="button"
            className="auth__quiet"
            disabled={codes.capped === address || codes.pending}
            onClick={() => void resend()}
          >
            {t("invite.ask.resendCode")}
          </button>
        )}
      </div>
    </>
  );
}

type AskStep = "email" | "code" | "name" | "password" | "note";
const ASK_STEPS: readonly AskStep[] = ["email", "code", "name", "password", "note"];

/**
 * Asking through a link, signed out, where email goes out (ADR 0090): the email, the code from it on its own screen,
 * a name, a password and an optional note, one per screen. No account exists until an admin approves; the ask
 * answers the key this tab keeps to sign in then.
 */
function AskSteps({
  token,
  preview,
  onAsked,
}: {
  token: string;
  preview: InvitationPreview;
  onAsked: (asked: Asked) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [step, setStep] = useState<AskStep>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const noteLimit = useTextLimit(JOIN_NOTE_MAX);
  // A code proves one address: another address starts over.
  const [proof, setProof] = useState<{ email: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [pending, setPending] = useState(false);
  // Asked, and the server answered no key to wait with: only where the answer goes.
  const [sent, setSent] = useState<AskToJoinResult | null>(null);
  const human = useHumanCheck(step === "email" || step === "code" ? "ask-code" : null);
  const codes = useCodeSender(token, human.check);
  const pw = usePasswordField(password, setPassword, { fresh: true });
  const key = email.trim().toLowerCase();
  const org = preview.orgName;
  const capped = codes.capped === key;

  const go = (next: AskStep) => {
    setError(null);
    setWrong(false);
    setStep(next);
  };

  /** The email's Continue: a code to it, unless it's proven already or one went out a moment ago. */
  const toCode = async () => {
    if (proof?.email === key) return go("name");
    if (codes.waiting(key)) return go("code");
    setError(null);
    const failed = await codes.send(key, { email: email.trim() });
    if (failed) setError(failed);
    else go("code");
  };

  const ask = async () => {
    if (!proof) return go("email");
    setPending(true);
    setError(null);
    try {
      const result = await api.invites.ask(token, {
        name: name.trim(),
        email: email.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
        code: proof.code,
        password,
      });
      if (result.key) onAsked({ key: result.key, name: name.trim(), email: result.email || key });
      else {
        setPending(false);
        setSent(result);
      }
    } catch (e) {
      setPending(false);
      // The proof ran out (30 minutes) or was used: a new code, from the email.
      if (errorCode(e)?.startsWith("join.code_")) {
        setProof(null);
        codes.forget();
        setWrong(false);
        setStep("email");
      }
      setError(errorText(t, e));
    }
  };

  const ready =
    step === "email"
      ? isEmail(email) && !capped
      : step === "name"
        ? name.trim() !== ""
        : step === "password"
          ? passwordState(password) === "ok"
          : step === "note";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || pending || codes.pending) return;
    if (step === "email") void toCode();
    else if (step === "name") go("password");
    else if (step === "password" && nameIsPassword(name, password)) {
      setPassword("");
      go("name");
      setError(t("auth.flow.nameIsPassword"));
    } else if (step === "password") go("note");
    else if (step === "note") void ask();
  };

  if (sent) return <AskSent preview={preview} sent={sent} />;

  const first = name.trim().split(/\s+/)[0] ?? "";
  const fix = step === "email" ? emailTypoFix(email) : null;
  const typed = email.trim();
  const bubble: Record<AskStep, [string, string]> = {
    email: [t(modeKey(preview, "invite.ask.hello"), { org }), t("invite.ask.emailLead")],
    code: [t("invite.ask.codeTitle", { email: typed }), t("invite.ask.codeLead")],
    name: [t("invite.ask.nameTitle"), t("auth.flow.nameLead")],
    password: [
      first ? t("auth.flow.newPasswordNamed", { name: first }) : t("auth.flow.newPassword"),
      t("invite.ask.passwordLead"),
    ],
    note: [t("invite.ask.noteTitle"), t("invite.ask.noteLead")],
  };
  const [title, lead] = bubble[step];
  const expression = wrong ? "cross" : step === "name" ? "happy" : step === "password" ? pw.face : undefined;
  const next = (
    <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} disabled={!ready}>
      {t("auth.flow.continue")}
    </Button>
  );
  const backTo = (to: AskStep) => (
    <button type="button" className="auth__quiet" onClick={() => go(to)}>
      {t("auth.flow.back")}
    </button>
  );

  let body: ReactNode = null;
  switch (step) {
    case "email":
      body = (
        <>
          <div className="auth__field">
            <Input
              className="auth__big"
              type="email"
              inputMode="email"
              aria-label={t("invite.ask.email")}
              autoComplete="email"
              spellCheck={false}
              placeholder={t("auth.flow.emailPlaceholder")}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              invalid={error !== null}
              autoFocus
            />
            {fix && (
              <button type="button" className="auth__fix" onClick={() => setEmail(fix)}>
                {t("auth.flow.didYouMean", { email: fix })}
              </button>
            )}
          </div>
          {human.slot}
          <ErrorLine error={error ?? (capped ? t("errors.code.limit") : null)} />
          <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} loading={codes.pending} disabled={!ready}>
            {t("auth.flow.continue")}
          </Button>
          <div className="auth__or">{t("common.or")}</div>
          <Button asChild size="lg" block>
            <a href={signInPath(`/invite/${token}`, isEmail(email) ? typed : undefined)}>
              {t("invite.ask.haveAccountSignIn")}
            </a>
          </Button>
          <Terms />
        </>
      );
      break;
    case "code":
      body = (
        <>
          <Who email={typed} onChange={() => go("email")} />
          <CodeField
            token={token}
            address={key}
            body={{ email: typed }}
            codes={codes}
            slot={human.slot}
            onWrong={setWrong}
            onProven={(code) => {
              setProof({ email: key, code });
              go("name");
            }}
          />
        </>
      );
      break;
    case "name":
      body = (
        <>
          <Who email={typed} ok />
          <div className="auth__field">
            <Input
              className="auth__big"
              aria-label={t("invite.ask.name")}
              autoComplete="name"
              spellCheck={false}
              maxLength={JOIN_NAME_MAX}
              placeholder={t("auth.flow.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {!error && <NameHint name={name} />}
          </div>
          <ErrorLine error={error} />
          {next}
          {backTo("email")}
        </>
      );
      break;
    case "password":
      body = (
        <>
          <Who email={typed} ok />
          {pw.field}
          {next}
          {backTo("name")}
          <Terms />
        </>
      );
      break;
    case "note":
      body = (
        <>
          <Textarea
            className="auth__big"
            aria-label={t("invite.ask.noteField")}
            rows={3}
            limit={noteLimit}
            placeholder={t("invite.ask.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <ErrorLine error={error} />
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {t("invite.ask.send")}
          </Button>
          {backTo("password")}
        </>
      );
      break;
  }

  return (
    <InviteScreen
      org={orgOf(preview)}
      host={preview.agents?.[0]}
      title={title}
      lead={lead}
      expression={expression}
      busy={pending || codes.pending}
      step={step}
      progress={{ at: ASK_STEPS.indexOf(step) + 1, total: ASK_STEPS.length }}
      onSubmit={submit}
    >
      {body}
    </InviteScreen>
  );
}

/** Asked, with no page to wait on: where the answer goes. */
function AskSent({ preview, sent }: { preview: InvitationPreview; sent: AskToJoinResult }) {
  const { t } = useTranslation();
  return (
    <InviteScreen
      org={orgOf(preview)}
      host={preview.agents?.[0]}
      expression="happy"
      title={t("invite.ask.sentTitle")}
      lead={sent.emailed ? t("invite.ask.sentEmail", { email: sent.email }) : t("invite.ask.sentNoEmail")}
      step="sent"
    />
  );
}

/** The page's own request, answered: in (signing in), in with a sign-in by hand, turned down, or ended. */
type Answer =
  | { state: "in"; orgId: string }
  | { state: "signIn"; orgId: string }
  | { state: "denied"; reason: string | null }
  | { state: "ended" };

/**
 * A check that failed for a moment and may answer the next time: no connection, the server restarting, too many
 * checks from here. Any other refusal is the server's last word on the key.
 */
const transient = (error: unknown) =>
  !(error instanceof ApiError) || error.status >= 500 || error.status === 408 || error.status === 429;

/**
 * Asked: the page waits for an admin, checking every 15 s with the key the ask answered (ADR 0090). Approved, it
 * signs in with the one-time sign-in the answer carries and opens the workspace; turned down, the admin's note;
 * ended (run out, its link turned off, approved for an account that was already there, or a key the server no
 * longer knows), signing in as always. A check that fails for a moment (no connection, a deploy) never ends it: the
 * key stays and the next check tries again.
 */
function Waiting({ token, preview, asked }: { token: string; preview: InvitationPreview; asked: Asked }) {
  const { t } = useTranslation();
  const api = useApi();
  const auth = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const header = useRef<HTMLElement>(null);
  const started = useRef(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const claim = useQuery({
    queryKey: [...keys.invitation(token), "claim", asked.key],
    // null ends the wait: a key that matches nothing (404) or a check the server refused. A failure for a moment
    // leaves the page waiting for the next check, however long it lasts: ending would lose the key.
    queryFn: async () => {
      try {
        return await api.invites.claim(token, asked.key);
      } catch (error) {
        if (transient(error)) throw error;
        return null;
      }
    },
    enabled: answer === null,
    refetchInterval: ANSWER_POLL_MS,
    retry: false,
  });
  const got = claim.data;

  /** Approved: "Aprovado" for a moment while the one-time sign-in goes through, then the workspace. */
  const enter = async (orgId: string, signIn: string) => {
    if (started.current) return;
    started.current = true;
    const [result] = await Promise.all([auth.signInOneTime(signIn), pause(ENTER_MOMENT_MS)]);
    if (!result.ok) return setAnswer({ state: "signIn", orgId });
    const burst = prepareBurst(header.current ?? document.body);
    await qc.invalidateQueries({ queryKey: keys.me });
    burst();
    await navigate({ to: "/org/$orgId", params: { orgId } });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: each answer once; signing in starts on the first
  useEffect(() => {
    if (answer !== null || got === undefined || got?.status === "pending") return;
    // Whatever it says (null: nothing more to learn with this key), it's the last word: the checks stop, and a
    // reload no longer waits.
    forgetAsked(token);
    if (got?.status === "in") {
      setAnswer({ state: "in", orgId: got.orgId });
      void enter(got.orgId, got.signIn);
    } else if (got?.status === "denied") setAnswer({ state: "denied", reason: got.reason });
    else setAnswer({ state: "ended" });
  }, [got]);

  const org = preview.orgName;
  const facts = orgOf(preview);
  const host = preview.agents?.[0];
  const signInAgain = (redirect: string) => navigate({ to: "/login", search: { redirect, email: asked.email } });

  if (answer?.state === "in")
    return (
      <InviteScreen
        org={facts}
        host={host}
        expression="happy"
        title={t(modeKey(preview, "invite.ask.approvedIn"), { org })}
        step="in"
        header={header}
      >
        <WaitCard host={host} title={t(modeKey(preview, "invite.entering"), { org })} sub={t("invite.enteringReady")} />
      </InviteScreen>
    );
  if (answer?.state === "signIn") {
    const { orgId } = answer;
    return (
      <InviteScreen
        org={facts}
        host={host}
        title={t("invite.ask.signInTitle")}
        lead={t("invite.ask.signInLead")}
        step="signIn"
        header={header}
      >
        <Button variant="primary" size="lg" block onClick={() => void signInAgain(`/org/${orgId}`)}>
          {t("auth.signIn")}
        </Button>
      </InviteScreen>
    );
  }
  if (answer?.state === "denied")
    return (
      <InviteScreen
        org={facts}
        host={host}
        expression="closed"
        title={t("invite.ask.deniedTitle")}
        lead={t(modeKey(preview, "invite.ask.deniedText"), { org })}
        step="denied"
        header={header}
      >
        {answer.reason && <Reason text={answer.reason} />}
      </InviteScreen>
    );
  if (answer?.state === "ended")
    return (
      <InviteScreen
        org={facts}
        host={host}
        title={t("invite.ask.endedTitle")}
        lead={t("invite.ask.endedLead")}
        step="ended"
        header={header}
      >
        <Button variant="primary" size="lg" block onClick={() => void signInAgain(`/invite/${token}`)}>
          {t("auth.signIn")}
        </Button>
      </InviteScreen>
    );
  return (
    <InviteScreen
      org={facts}
      host={host}
      expression="happy"
      title={t(modeKey(preview, "invite.ask.waitTitle"), { org })}
      lead={t("invite.ask.waitLead")}
      step="wait"
      header={header}
    >
      <WaitCard
        host={host}
        title={t(modeKey(preview, "invite.ask.waitCard"), { org })}
        sub={asked.name ? t("invite.ask.waitBy", { name: asked.name, email: asked.email }) : asked.email}
      />
      <span className="invite__lock ac-iconline">
        <Icon name="lock" size={14} />
        {t("invite.ask.waitLock")}
      </span>
    </InviteScreen>
  );
}

/**
 * Asking through a link signed in (ADR 0068): one press as the account, and the page follows the answer while it's
 * open, checking every 15 s. An address the account hasn't confirmed proves itself first with a code, where email
 * goes out (ADR 0072).
 */
function AskAsAccount({ token, preview }: { token: string; preview: InvitationPreview }) {
  const { t } = useTranslation();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useMe().data?.user ?? null;
  const config = useAuthConfig();
  const signOutHere = useSignOutHere(token);
  const [sent, setSent] = useState<AskToJoinResult | null>(null);
  const view = askView(preview, sent !== null);
  useQuery({
    ...invitationQuery(api, token),
    refetchInterval: view.state === "sent" || view.state === "approvedEmail" ? ANSWER_POLL_MS : false,
  });
  const [step, setStep] = useState<"form" | "code">("form");
  const [note, setNote] = useState("");
  const noteLimit = useTextLimit(JOIN_NOTE_MAX);
  const noteTooLong = overLimit(note, noteLimit);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [pending, setPending] = useState(false);
  // The code that proved the account's address (for 30 minutes).
  const [proof, setProof] = useState<string | null>(null);
  const emailsGoOut = sent?.emailed ?? sendsEmail(config.data);
  const proofNeeded = emailsGoOut && !user?.emailVerified && proof === null;
  const human = useHumanCheck(proofNeeded && view.state === "form" ? "ask-code" : null);
  const codes = useCodeSender(token, human.check);
  const email = user?.email ?? "";
  const key = email.toLowerCase();
  const org = preview.orgName;
  const facts = orgOf(preview);
  const host = preview.agents?.[0];
  const address = sent?.email ?? preview.you?.email ?? email;
  const capped = proofNeeded && codes.capped === key;

  const ask = async (code: string | null) => {
    setPending(true);
    setError(null);
    try {
      const result = await api.invites.ask(token, {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(code ? { code } : {}),
      });
      setSent(result);
      await qc.invalidateQueries({ queryKey: keys.invitation(token) });
    } catch (e) {
      // The proof ran out (30 minutes) or was used: Continue sends a new code.
      if (errorCode(e)?.startsWith("join.code_")) {
        setProof(null);
        codes.forget();
      }
      setStep("form");
      setError(errorText(t, e));
    } finally {
      setPending(false);
    }
  };

  /** Continue where the address needs its code first: one to the account's own, unless one went out a moment ago. */
  const toCode = async () => {
    if (codes.waiting(key)) return setStep("code");
    setError(null);
    const failed = await codes.send(key, {});
    if (failed) setError(failed);
    else setStep("code");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step !== "form" || pending || codes.pending || capped || noteTooLong) return;
    if (proofNeeded) void toCode();
    else void ask(proof);
  };

  const open = async (orgId: string) => {
    await qc.invalidateQueries({ queryKey: keys.me });
    await navigate({ to: "/org/$orgId", params: { orgId } });
  };

  switch (view.state) {
    case "closed":
      return <ClosedInvitation preview={preview} />;
    case "in": {
      const orgId = view.orgId;
      return (
        <InviteScreen
          org={facts}
          host={host}
          expression="happy"
          title={
            view.already
              ? t(modeKey(preview, "invite.ask.memberTitle"), { org })
              : t(modeKey(preview, "invite.ask.inTitle"), { org })
          }
          step="in"
        >
          {orgId && (
            <Button variant="primary" size="lg" block onClick={() => void open(orgId)}>
              {t(modeKey(preview, "invite.ask.open"), { org })}
            </Button>
          )}
        </InviteScreen>
      );
    }
    case "approvedEmail":
      return (
        <InviteScreen
          org={facts}
          host={host}
          expression="happy"
          title={t("invite.ask.approvedTitle")}
          lead={emailsGoOut ? t("invite.ask.approvedEmail", { email: address }) : t("invite.ask.approvedNoEmail")}
          step="approved"
        />
      );
    case "denied":
      return (
        <InviteScreen
          org={facts}
          host={host}
          expression="closed"
          title={t("invite.ask.deniedTitle")}
          lead={t(modeKey(preview, "invite.ask.deniedText"), { org })}
          step="denied"
        >
          {view.reason && <Reason text={view.reason} />}
        </InviteScreen>
      );
    case "sent":
      return (
        <InviteScreen
          org={facts}
          host={host}
          expression="happy"
          title={t("invite.ask.sentTitle")}
          lead={
            user?.emailVerified
              ? t("invite.ask.sentAccount")
              : emailsGoOut
                ? t("invite.ask.sentEmail", { email: address })
                : t("invite.ask.sentNoEmail")
          }
          step="sent"
        >
          <WaitCard
            host={host}
            title={t(modeKey(preview, "invite.ask.waitCard"), { org })}
            sub={t("invite.ask.waitBy", { name: user?.name ?? "", email: address })}
          />
        </InviteScreen>
      );
  }

  if (step === "code")
    return (
      <InviteScreen
        org={facts}
        host={host}
        expression={wrong ? "cross" : undefined}
        busy={pending || codes.pending}
        title={t("invite.ask.codeTitle", { email })}
        lead={t("invite.ask.codeLead")}
        step="code"
        onSubmit={submit}
      >
        <Who email={email} />
        <CodeField
          token={token}
          address={key}
          body={{}}
          codes={codes}
          slot={human.slot}
          onWrong={setWrong}
          onProven={(code) => {
            setProof(code);
            setWrong(false);
            void ask(code);
          }}
        />
        <button
          type="button"
          className="auth__quiet"
          onClick={() => {
            setWrong(false);
            setStep("form");
          }}
        >
          {t("auth.flow.back")}
        </button>
      </InviteScreen>
    );

  return (
    <InviteScreen
      org={facts}
      host={host}
      busy={pending || codes.pending}
      title={t(modeKey(preview, "invite.ask.title"), { org })}
      lead={proofNeeded ? t("invite.ask.asProof", { email }) : t("invite.ask.as", { email })}
      step="form"
      onSubmit={submit}
    >
      <Textarea
        className="auth__big"
        aria-label={t("invite.ask.note")}
        rows={3}
        limit={noteLimit}
        placeholder={t("invite.ask.noteHelp")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {proofNeeded && human.slot}
      <ErrorLine error={error ?? (capped ? t("errors.code.limit") : null)} />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending || codes.pending}
        disabled={capped || noteTooLong}
      >
        {proofNeeded ? t("auth.flow.continue") : t("invite.ask.send")}
      </Button>
      <button type="button" className="auth__quiet" onClick={() => void signOutHere()}>
        {t("invite.ask.notYou")}
      </button>
    </InviteScreen>
  );
}

/**
 * Asking through a link where no email goes out (ADR 0068): a name, an email and a note in one form, and no account
 * is made. An admin hands the person a link once they approve.
 */
function AskForm({ token, preview }: { token: string; preview: InvitationPreview }) {
  const { t } = useTranslation();
  const api = useApi();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const noteLimit = useTextLimit(JOIN_NOTE_MAX);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<AskToJoinResult | null>(null);
  const fix = emailTypoFix(email);
  const ready = name.trim() !== "" && isEmail(email) && !overLimit(note, noteLimit);

  const ask = async () => {
    setPending(true);
    setError(null);
    try {
      setSent(
        await api.invites.ask(token, {
          name: name.trim(),
          email: email.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      );
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setPending(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !pending) void ask();
  };

  if (sent) return <AskSent preview={preview} sent={sent} />;
  return (
    <InviteScreen
      org={orgOf(preview)}
      host={preview.agents?.[0]}
      busy={pending}
      title={t(modeKey(preview, "invite.ask.title"), { org: preview.orgName })}
      lead={t("invite.ask.leadNoName")}
      step="form"
      onSubmit={submit}
    >
      <Field
        label={t("invite.ask.name")}
        id="ask-name"
        example={looksLikePassword(name) ? t("auth.flow.nameLooksLikePassword") : undefined}
      >
        <Input
          className="auth__big"
          autoComplete="name"
          maxLength={JOIN_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label={t("invite.ask.email")} id="ask-email">
        <Input
          className="auth__big"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      {fix && (
        <button type="button" className="auth__fix" onClick={() => setEmail(fix)}>
          {t("auth.flow.didYouMean", { email: fix })}
        </button>
      )}
      <Field label={t("invite.ask.note")} id="ask-note">
        <Textarea
          className="auth__big"
          rows={3}
          limit={noteLimit}
          placeholder={t("invite.ask.noteHelp")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <ErrorLine error={error} />
      <Button type="submit" variant="primary" size="lg" block kbd={["↵"]} loading={pending} disabled={!ready}>
        {t("invite.ask.send")}
      </Button>
      <div className="auth__or">{t("common.or")}</div>
      <Button asChild size="lg" block>
        <a href={signInPath(`/invite/${token}`, isEmail(email) ? email.trim() : undefined)}>
          {t("invite.ask.haveAccountSignIn")}
        </a>
      </Button>
    </InviteScreen>
  );
}
