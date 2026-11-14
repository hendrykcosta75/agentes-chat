import { DEFAULT_APP_ICON } from "@agenteschat/client/lib/app-icons";
import { exampleSenders } from "@agenteschat/client/lib/push-offer";
import { Image } from "expo-image";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { pushPermission } from "@/lib/push";
import { usePush } from "@/providers/push";
import { Button, SheetScreen, Text, useToast } from "@/ui";
import { AppIconPicture } from "../me/AppIconPage";
import { APP_ICON_PICTURES, useAppIcon } from "../me/app-icon";
import { useDirectory } from "../shared/hooks";
import { useSurface } from "../shared/parts";

/** The examples, top to bottom: what someone gets most, fading a little as they stack. */
const EXAMPLES = [
  { key: "approval", time: 0, opacity: 1 },
  { key: "finished", time: 2, opacity: 0.92 },
  { key: "mention", time: 9, opacity: 0.8 },
] as const;

/**
 * Our notifications sheet, before the system's prompt (Conversas opens it: `@agenteschat/client/lib/push-offer`): three
 * notifications as they will arrive, from the workspace's own agents (a request to approve, work done, being
 * called), what they are for, "Ativar avisos" (the system's prompt) and "Agora não".
 */
export function PushAskSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { ask } = usePush();
  const dir = useDirectory();
  const [asking, setAsking] = useState(false);
  const senders = exampleSenders(
    dir.agents.map((a) => a.name),
    t("mobile.push.ask.someone"),
  );

  const turnOn = async () => {
    if (asking) return;
    setAsking(true);
    const ok = await ask().catch(() => false);
    // Allowed but not registered (the server didn't take this phone): say so; a "no" to the system says nothing.
    const allowed = ok || (await pushPermission()) === "granted";
    onClose();
    if (ok) toast({ title: t("mobile.push.ask.done"), icon: "bell" });
    // Its way out right there: asking again registers this phone again.
    else if (allowed)
      toast({
        title: t("mobile.push.ask.failed"),
        icon: "x",
        action: { label: t("mobile.common.retry"), onPress: () => void ask().catch(() => false) },
      });
  };

  return (
    <SheetScreen fit>
      <View style={styles.stack} accessible accessibilityLabel={t("mobile.push.ask.examples")}>
        {EXAMPLES.map((x, i) => (
          <Example
            key={x.key}
            title={t(`mobile.push.ask.${x.key}.title`, { name: senders[i] })}
            body={t(`mobile.push.ask.${x.key}.body`)}
            time={x.time === 0 ? t("mobile.push.ask.now") : t("mobile.push.ask.minutes", { n: x.time })}
            opacity={x.opacity}
          />
        ))}
      </View>
      <Text variant="title2" accessibilityRole="header" style={styles.center}>
        {t("mobile.push.ask.title")}
      </Text>
      <Text variant="small" tone="muted" style={styles.center}>
        {t("mobile.push.ask.text")}
      </Text>
      <View style={styles.acts}>
        <Button variant="primary" wide label={t("mobile.push.ask.on")} loading={asking} onPress={turnOn} />
        <Button variant="ghost" wide label={t("mobile.push.ask.later")} disabled={asking} onPress={onClose} />
      </View>
    </SheetScreen>
  );
}

/** One notification as the phone shows it: the app's icon (the one picked, ADR 0179), who and what, when. */
function Example({ title, body, time, opacity }: { title: string; body: string; time: string; opacity: number }) {
  const surface = useSurface();
  const icon = useAppIcon().icon ?? DEFAULT_APP_ICON;
  return (
    <View style={[styles.example, surface, { opacity }]}>
      {typeof icon === "string" ? (
        <Image source={APP_ICON_PICTURES[icon].light} style={styles.icon} />
      ) : (
        <AppIconPicture icon={icon} size={34} />
      )}
      <View style={styles.exampleText}>
        <View style={styles.exampleTop}>
          <Text variant="label" tone="ink" numberOfLines={1} style={styles.grow}>
            {title}
          </Text>
          <Text variant="caption" tone="faint">
            {time}
          </Text>
        </View>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8, paddingBottom: 6 },
  example: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 18, padding: 11, paddingRight: 13 },
  // The app's icon at a notification's size, its corners like the home screen's.
  icon: { width: 34, height: 34, borderRadius: 8 },
  exampleText: { flex: 1, minWidth: 0, gap: 1 },
  exampleTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center", paddingHorizontal: 8 },
  acts: { gap: 6, marginTop: 6 },
});
