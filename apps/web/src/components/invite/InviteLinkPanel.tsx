import { useInviteLinks, useMakeInviteLink } from "@agenteschat/client";
import { formatShortDate } from "@agenteschat/client/lib/format";
import { Button, Icon, Input, SwapLabel } from "@agenteschat/ui";
import { useTranslation } from "react-i18next";
import { LoadingLine } from "@/components/Loading";
import { useOrg } from "@/components/org-context";
import { useCopied } from "./copied";
import "./invite.css";

/**
 * The workspace's invitation link (ADR 0068, 0090) on the onboarding's people step (ADR 0162): whoever opens it only
 * asks to join, and someone who may invite approves each person. The address to copy and until when it works, or
 * "Criar link" when there's none; renewing or turning it off belongs to People › Convites.
 */
export function InviteLinkPanel() {
  const { t, i18n } = useTranslation();
  const { org } = useOrg();
  const links = useInviteLinks(org.id);
  const make = useMakeInviteLink(org.id);
  const [copied, copy] = useCopied();
  const current = (links.data ?? []).find((l) => l.url !== null && l.plain !== false);
  return (
    <div className="invite-link">
      {links.isPending ? (
        <LoadingLine width={320} />
      ) : current?.url ? (
        <>
          <div className="invite-link__row">
            <Input
              readOnly
              value={current.url}
              aria-label={t("members.link.title")}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button variant="primary" onClick={() => copy(current.id, current.url ?? "")}>
              <SwapLabel
                icon="copy"
                altIcon="check"
                label={t("members.copyLink")}
                alt={t("common.copied")}
                showAlt={copied === current.id}
              />
            </Button>
          </div>
          <p className="invite-link__foot">
            <Icon name="clock" size={14} />
            <span>{t("members.link.until", { date: formatShortDate(i18n.language, current.expiresAt) })}</span>
          </p>
        </>
      ) : (
        <div className="invite-link__none">
          <span className="small muted">{t("members.link.none")}</span>
          <Button icon="link" loading={make.isPending} onClick={() => make.mutate()}>
            {t("members.link.make")}
          </Button>
        </div>
      )}
    </div>
  );
}
