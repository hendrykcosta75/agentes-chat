import type { Agent, InvitationWithStatus, InviteLink, InviteLinkTtl } from "@agenteschat/client";
import { useChannels, useEditInviteLink, useUpdateInvitation } from "@agenteschat/client";
import { errorText } from "@agenteschat/client/lib/errors";
import { formatShortDate, timeLeft } from "@agenteschat/client/lib/format";
import { Button, Dialog, DialogBody, DialogFooter, Field, FormStack, Input, Locked, SwapLabel } from "@agenteschat/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/components/org-context";
import { useToast } from "@/lib/toast";
import { useCopied } from "./copied";
import { LinkLimits } from "./InviteDialog";
import { AgentsField, ChannelsField, changedChoices, FieldLine, RoleField, useInviteChoices } from "./InviteFields";
import "./invite.css";

/** An agent's page opens over the dialog's place: the dialog closes for it. */
function useGoToAgent(onClose: () => void) {
  const { org } = useOrg();
  const navigate = useNavigate();
  return (a: Agent) => {
    onClose();
    void navigate({
      to: "/org/$orgId/agents/$agentId",
      params: { orgId: org.id, agentId: a.id },
      search: { tab: "settings", sec: "audience" },
    });
  };
}

/**
 * Editar link (ADR 0184): its address to copy, then what it gives (Cargo · Canais · Agentes), how long it works (its
 * own date first, as it is) and how many people it takes (never fewer than already joined). The address stays the
 * same. "Desativar link" waits on the left.
 */
export function EditLinkDialog({
  link,
  open,
  onClose,
  onTurnOff,
}: {
  link: InviteLink;
  open: boolean;
  onClose: () => void;
  onTurnOff: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const channels = useChannels(org.id).data ?? [];
  const save = useEditInviteLink(org.id);
  const [copied, copy] = useCopied();
  const was = { roleIds: link.roleIds ?? [], channelIds: link.channelIds ?? [], agentIds: link.agentIds ?? [] };
  const choices = useInviteChoices(was, { exact: true });
  const [expiresIn, setExpiresIn] = useState<InviteLinkTtl | "keep">("keep");
  const [maxUses, setMaxUses] = useState<number | null>(link.maxUses ?? null);
  const [error, setError] = useState<string | null>(null);
  const goTo = useGoToAgent(onClose);
  const until = link.neverExpires
    ? t("invites.never")
    : t("invites.untilDate", { date: formatShortDate(i18n.language, link.expiresAt) });
  const submit = () => {
    setError(null);
    save.mutate(
      {
        id: link.id,
        ...changedChoices(choices, channels, was),
        maxUses,
        ...(expiresIn === "keep" ? {} : { expiresIn }),
      },
      {
        onSuccess: () => {
          toast.show(t("invites.linkSaved"));
          onClose();
        },
        onError: (e) => setError(errorText(t, e)),
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !save.isPending && onClose()}
      title={t("members.link.title")}
      closeLabel={t("common.close")}
      unsaved={save.isPending}
      width={600}
    >
      <Locked when={save.isPending}>
        <DialogBody className="invite-dialog">
          <FormStack>
            {link.url && (
              <Field label={t("invites.link")} id="edit-link-url">
                <div className="invite-linkrow">
                  <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
                  <Button onClick={() => link.url && copy(link.id, link.url)}>
                    <SwapLabel
                      icon="copy"
                      altIcon="check"
                      label={t("members.copyLink")}
                      alt={t("common.copied")}
                      showAlt={copied === link.id}
                    />
                  </Button>
                </div>
              </Field>
            )}
            <RoleField choices={choices} id="edit-link-role" />
            <ChannelsField choices={choices} id="edit-link-channels" />
            <AgentsField choices={choices} id="edit-link-agents" live={open} onGo={goTo} />
            <LinkLimits
              expiresIn={expiresIn}
              onExpiresIn={setExpiresIn}
              maxUses={maxUses}
              onMaxUses={setMaxUses}
              first={until}
              used={link.uses ?? 0}
            />
            {error && <FieldLine tone="danger">{error}</FieldLine>}
          </FormStack>
        </DialogBody>
        <DialogFooter bar>
          <Button variant="ghost" className="ac-btn--danger invite-foot__lead" onClick={onTurnOff}>
            {t("invites.turnOff")}
          </Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </Locked>
    </Dialog>
  );
}

/**
 * Editar convite (ADR 0184, in place of "Mudar o cargo"): what a pending invitation gives, changed without sending it,
 * the same link. An invitation that expired meanwhile asks to be renewed first.
 */
export function EditInvitationDialog({
  invitation,
  open,
  onClose,
  onRenew,
}: {
  invitation: InvitationWithStatus;
  open: boolean;
  onClose: () => void;
  onRenew: () => void;
}) {
  const { t } = useTranslation();
  const { org } = useOrg();
  const toast = useToast();
  const channels = useChannels(org.id).data ?? [];
  const save = useUpdateInvitation(org.id);
  const was = {
    roleIds: invitation.roleIds ?? [],
    channelIds: invitation.channelIds ?? [],
    agentIds: invitation.agentIds ?? [],
  };
  const choices = useInviteChoices(was, { exact: true });
  const [error, setError] = useState<string | null>(null);
  const goTo = useGoToAgent(onClose);
  const off = invitation.status === "expired" || !timeLeft(t, invitation.expiresAt);
  const submit = () => {
    setError(null);
    save.mutate(
      { id: invitation.id, ...changedChoices(choices, channels, was) },
      {
        onSuccess: () => {
          toast.show(t("invites.invitationSaved", { email: invitation.email }));
          onClose();
        },
        onError: (e) => setError(errorText(t, e)),
      },
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !save.isPending && onClose()}
      title={t("invites.invitationTitle", { email: invitation.email })}
      description={off ? undefined : t("members.invitations.roleText")}
      closeLabel={t("common.close")}
      unsaved={save.isPending}
      width={600}
    >
      <Locked when={save.isPending}>
        <DialogBody className="invite-dialog">
          {off ? (
            <p>{t("invites.invitationExpired")}</p>
          ) : (
            <FormStack>
              <RoleField choices={choices} id="edit-invitation-role" />
              <ChannelsField choices={choices} id="edit-invitation-channels" />
              <AgentsField choices={choices} id="edit-invitation-agents" live={open} onGo={goTo} />
              {error && <FieldLine tone="danger">{error}</FieldLine>}
            </FormStack>
          )}
        </DialogBody>
        <DialogFooter bar>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          {off ? (
            <Button
              variant="primary"
              icon="refresh"
              onClick={() => {
                onRenew();
                onClose();
              }}
            >
              {t("members.invitations.renew")}
            </Button>
          ) : (
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              {t("common.save")}
            </Button>
          )}
        </DialogFooter>
      </Locked>
    </Dialog>
  );
}
