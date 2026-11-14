import {
  APP_ICONS,
  type AppIconId,
  appIconNameKey,
  DEFAULT_MADE_ICON,
  isMadeIconExpression,
  isMadeIconFace,
  MADE_ICON_ACCESSORIES,
  MADE_ICON_COLORS,
  MADE_ICON_FACES,
  MADE_ICON_SKIES,
  type MadeIcon,
  type MadeIconLook,
} from "@agenteschat/client/lib/app-icons";
import { drawAccessory, drawAgent, gradientOf } from "@agenteschat/ui/agent/engine";
import { Canvas, createPicture, Picture } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Platform, Pressable, StyleSheet, View } from "react-native";
import { asCtx, compile, RecordingContext } from "@/agent/recorder";
import { replay } from "@/agent/skia-ctx";
import { AgentAvatar, Button, GroupedFooter, GroupedHeader, GroupedList, Icon, Text, useTheme, useToast } from "@/ui";
import { useColors } from "../shared/hooks";
import { tapHaptic } from "../shared/parts";
import { APP_ICON_PICTURES, MADE_ICON_SKY_PICTURES, useAppIcon } from "./app-icon";
import { type PhoneIcon, samePhoneIcon } from "./app-icon-names";
import { Page } from "./parts";

/** An icon's corner on a home screen, as a share of its side. */
const CORNER = 0.225;

/**
 * Where a made icon's agent stands on the icon's 1024 grid, as the build draws it
 * (packages/ui/scripts/app-icons/scenes.mjs): the shipped icon's place, or smaller and lower when it wears something.
 */
const BARE = { x: 224, y: 192, side: 576, cells: 18 };
const WEARING = { x: 256, y: 416, side: 512, cells: 16 };

/** What a made icon's look is to the agent engine: its eyes, a held expression and what it wears. */
function agentOf(icon: MadeIcon) {
  const face = isMadeIconFace(icon.look) ? icon.look : "round";
  return {
    color: icon.color,
    eyes: isMadeIconExpression(face) ? ("round" as const) : face,
    expression: isMadeIconExpression(face) ? face : undefined,
    accessory: isMadeIconFace(icon.look) ? ("none" as const) : icon.look,
  };
}

/** A made icon as the home screen will show it: its sky's picture and the agent drawn over it by the agent engine. */
function MadeIconPicture({ icon, size }: { icon: MadeIcon; size: number }) {
  const { color, look } = icon;
  const picture = useMemo(() => {
    const agent = agentOf({ sky: "night", color, look });
    const wears = agent.accessory !== "none";
    const at = wears ? WEARING : BARE;
    const u = size / 1024;
    const rec = new RecordingContext();
    drawAgent(asCtx(rec), at.x * u, at.y * u, at.side * u, {
      color: agent.color,
      eyes: agent.eyes,
      cells: at.cells,
      pose: agent.expression ? { expression: agent.expression } : {},
      after: wears ? (ctx, side, frame) => drawAccessory(ctx, side, agent.accessory, frame) : undefined,
    });
    const frame = compile(rec.commands);
    return createPicture((canvas) => replay(canvas, frame), { width: size, height: size });
  }, [color, look, size]);
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * CORNER), overflow: "hidden" }}>
      <Image
        source={MADE_ICON_SKY_PICTURES[icon.sky]}
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
      <Canvas style={[StyleSheet.absoluteFill, { width: size, height: size }]}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

/** An icon's picture as the home screen shows it (a ready one in this appearance), rounded like one. */
export function AppIconPicture({ icon, size = 32 }: { icon: PhoneIcon; size?: number }) {
  const theme = useTheme();
  if (typeof icon !== "string") return <MadeIconPicture icon={icon} size={size} />;
  return (
    <Image
      source={APP_ICON_PICTURES[icon][theme.scheme === "dark" ? "dark" : "light"]}
      style={{ width: size, height: size, borderRadius: Math.round(size * CORNER) }}
      accessibilityIgnoresInvertColors
    />
  );
}

/** An icon's name: a ready one's, or "Your icon". */
export function useAppIconName(icon: PhoneIcon) {
  const { t } = useTranslation();
  return typeof icon === "string" ? t(appIconNameKey(icon)) : t("appIcon.yours");
}

/** A made icon's face or accessory, in words. */
function useLookName() {
  const { t } = useTranslation();
  return (look: MadeIconLook) =>
    !isMadeIconFace(look)
      ? t(`look.accessories.${look}`)
      : isMadeIconExpression(look)
        ? t(`appIcon.faces.${look}`)
        : t(`look.eyesNames.${look}`);
}

/**
 * App icon (ADR 0179), pushed from You: the icon as the home screen will show it, then what it is made of (its sky,
 * its color and a face or an accessory) and the ready ones. Nothing changes until "Use this icon": iOS confirms every
 * change with an alert of its own, which trying the choices one by one would show each time.
 */
export function AppIconPage() {
  const { t } = useTranslation();
  const appIcon = useAppIcon();
  return (
    <Page title={t("appIcon.title")}>
      {/* The icon in use is asked of the system: the choices start from it. */}
      {appIcon.icon ? <AppIconMaker current={appIcon.icon} set={appIcon.set} /> : null}
    </Page>
  );
}

function AppIconMaker({ current, set }: { current: PhoneIcon; set: (icon: PhoneIcon) => Promise<void> }) {
  const { t } = useTranslation();
  const c = useColors();
  const toast = useToast();
  const lookName = useLookName();
  // What the choices make, and the ready icon shown instead of it while one is picked.
  const [made, setMade] = useState<MadeIcon>(typeof current === "string" ? DEFAULT_MADE_ICON : current);
  const [ready, setReady] = useState<AppIconId | null>(typeof current === "string" ? current : null);
  const [changing, setChanging] = useState(false);
  const shown: PhoneIcon = ready ?? made;
  const name = useAppIconName(shown);
  const inUse = samePhoneIcon(shown, current);
  const face = isMadeIconFace(made.look) ? made.look : "round";
  const accessory = isMadeIconFace(made.look) ? "none" : made.look;

  const make = (patch: Partial<MadeIcon>) => {
    tapHaptic();
    setMade({ ...made, ...patch });
    setReady(null);
  };
  const use = () => {
    setChanging(true);
    set(shown)
      .catch(() => toast({ title: t("appIcon.failed"), icon: "x" }))
      .finally(() => setChanging(false));
  };
  const plate = (on: boolean) => [styles.plate, { backgroundColor: c.sunken, borderColor: on ? c.ink : "transparent" }];

  return (
    <>
      <View style={styles.hero}>
        <AppIconPicture icon={shown} size={96} />
        <Text variant="title" style={styles.name}>
          {name}
        </Text>
        <Text variant="footnote" tone="muted">
          {ready ? t("appIcon.readyOne") : `${t(appIconNameKey(made.sky))} · ${lookName(made.look)}`}
        </Text>
      </View>
      <Button
        variant="primary"
        wide
        label={inUse ? t("appIcon.inUse") : t("appIcon.use")}
        disabled={inUse}
        loading={changing}
        onPress={use}
      />

      <GroupedHeader>{t("appIcon.sky")}</GroupedHeader>
      <GroupedList>
        <View style={styles.skies} accessibilityRole="radiogroup" accessibilityLabel={t("appIcon.sky")}>
          {MADE_ICON_SKIES.map((sky) => {
            const on = !ready && made.sky === sky;
            return (
              <Choice
                key={sky}
                on={on}
                label={t(appIconNameKey(sky))}
                onPress={() => make({ sky })}
                style={styles.half}
              >
                <View style={[plate(on), styles.sky]}>
                  <MadeIconPicture icon={{ ...made, sky }} size={30} />
                  <Text variant="callout">{t(appIconNameKey(sky))}</Text>
                </View>
              </Choice>
            );
          })}
        </View>
      </GroupedList>

      <GroupedHeader>{t("look.color")}</GroupedHeader>
      <GroupedList>
        <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel={t("look.color")}>
          {MADE_ICON_COLORS.map((color) => {
            const on = !ready && made.color === color;
            return (
              <Choice key={color} on={on} label={t(`look.colors.${color}`)} onPress={() => make({ color })} slop={7}>
                <LinearGradient colors={gradientOf(color)} style={styles.color}>
                  {on ? <Icon name="check" size={16} color="#fff" /> : null}
                </LinearGradient>
              </Choice>
            );
          })}
        </View>
      </GroupedList>

      <GroupedHeader>{t("appIcon.expression")}</GroupedHeader>
      <GroupedList>
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t("appIcon.expression")}>
          {MADE_ICON_FACES.map((each) => {
            const on = !ready && face === each;
            const agent = agentOf({ ...made, look: each });
            return (
              <Choice
                key={each}
                on={on}
                label={lookName(each)}
                onPress={() => make({ look: each })}
                style={styles.fifth}
              >
                <View style={[plate(on), styles.face]}>
                  <AgentAvatar agent={agent} expression={agent.expression} size={36} framed={false} live={false} />
                </View>
              </Choice>
            );
          })}
        </View>
      </GroupedList>

      <GroupedHeader>{t("look.accessory")}</GroupedHeader>
      <GroupedList>
        <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={t("look.accessory")}>
          {(["none", ...MADE_ICON_ACCESSORIES] as const).map((each) => {
            const on = !ready && accessory === each;
            return (
              <Choice
                key={each}
                on={on}
                label={t(`look.accessories.${each}`)}
                onPress={() => make({ look: each === "none" ? face : each })}
                style={styles.fourth}
              >
                <View style={[plate(on), styles.wearing]}>
                  <AgentAvatar
                    agent={{ color: made.color, eyes: "round", accessory: each }}
                    size={44}
                    framed={false}
                    live={false}
                  />
                </View>
              </Choice>
            );
          })}
        </View>
      </GroupedList>
      <GroupedFooter>{t("appIcon.oneOrOther")}</GroupedFooter>

      <GroupedHeader>{t("appIcon.ready")}</GroupedHeader>
      <GroupedList>
        <View style={styles.readies} accessibilityRole="radiogroup" accessibilityLabel={t("appIcon.ready")}>
          {APP_ICONS.map((id) => {
            const on = ready === id;
            return (
              <Choice
                key={id}
                on={on}
                label={t(appIconNameKey(id))}
                onPress={() => {
                  tapHaptic();
                  setReady(id);
                }}
              >
                <View style={[styles.ready, { borderColor: on ? c.ink : "transparent" }]}>
                  <AppIconPicture icon={id} size={46} />
                </View>
              </Choice>
            );
          })}
        </View>
      </GroupedList>
      {/* iOS confirms with an alert of its own; Android's home screens take their time. */}
      {Platform.OS === "android" ? <GroupedFooter>{t("appIcon.hintAndroid")}</GroupedFooter> : null}
    </>
  );
}

/** One choice among its group's: pressed, it gives a little. */
function Choice({
  on,
  label,
  onPress,
  slop,
  style,
  children,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  slop?: number;
  style?: object;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      {...(slop ? { hitSlop: slop } : {})}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 14, paddingBottom: 16, gap: 2 },
  name: { marginTop: 12 },
  plate: { borderWidth: 2, alignItems: "center", justifyContent: "center" },
  skies: { flexDirection: "row", gap: 8, padding: 12 },
  half: { flex: 1 },
  sky: { flexDirection: "row", justifyContent: "flex-start", gap: 10, padding: 8, borderRadius: 14 },
  colors: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  color: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 10, paddingHorizontal: 8, paddingVertical: 12 },
  fifth: { width: "20%", alignItems: "center" },
  fourth: { width: "25%", alignItems: "center" },
  face: { width: 52, height: 52, borderRadius: 16 },
  wearing: { width: 64, height: 64, borderRadius: 20 },
  readies: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 12 },
  ready: { borderWidth: 2, borderRadius: 15, padding: 2 },
  pressed: { transform: [{ scale: 0.96 }] },
});
