import { AGENT_ACCESSORIES, AGENT_COLORS, AGENT_EYES } from "@agenteschat/tokens/look";

/**
 * The app icons a person can pick on their device (ADR 0179), in the pickers' order: the first is the icon the apps
 * ship with. Their files come from `packages/ui/scripts/app-icons.mjs` (the same ids, a test keeps them equal); the
 * phone's native side and the desktop app list the same ids too.
 */
export const APP_ICONS = ["night", "moon", "sky", "peekNight", "peekSky"] as const;

export type AppIconId = (typeof APP_ICONS)[number];

/** The icon the apps ship with. */
export const DEFAULT_APP_ICON: AppIconId = APP_ICONS[0];

export const isAppIcon = (value: unknown): value is AppIconId =>
  typeof value === "string" && (APP_ICONS as readonly string[]).includes(value);

/** The icon's name in the pickers (`appIcon.names.*`). */
export const appIconNameKey = (id: AppIconId) => `appIcon.names.${id}` as const;

/**
 * The icons a person makes on their phone (ADR 0179): a sky, one of the agents' colors and either a face or an
 * accessory. A phone takes only icons its build carries, so every combination is drawn when the app is built (336);
 * a face and an accessory together would be 1,920. The generator and the phone's plugin list the same parts.
 */
export const MADE_ICON_SKIES = ["night", "sky"] as const;
export type MadeIconSky = (typeof MADE_ICON_SKIES)[number];
export const MADE_ICON_COLORS = AGENT_COLORS;
export type MadeIconColor = (typeof MADE_ICON_COLORS)[number];
/** The agents' eye styles, then the expressions that hold as a still picture. */
export const MADE_ICON_EXPRESSIONS = ["wink", "heart", "star", "surprised", "angry"] as const;
export type MadeIconExpression = (typeof MADE_ICON_EXPRESSIONS)[number];
export const MADE_ICON_FACES = [...AGENT_EYES, ...MADE_ICON_EXPRESSIONS] as const;
export type MadeIconFace = (typeof MADE_ICON_FACES)[number];
export const MADE_ICON_ACCESSORIES = AGENT_ACCESSORIES.filter(
  (a): a is Exclude<(typeof AGENT_ACCESSORIES)[number], "none"> => a !== "none",
);
export type MadeIconAccessory = (typeof MADE_ICON_ACCESSORIES)[number];
/** A face (the plain one, "round", when it wears an accessory) or an accessory. */
export const MADE_ICON_LOOKS = [...MADE_ICON_FACES, ...MADE_ICON_ACCESSORIES] as const;
export type MadeIconLook = (typeof MADE_ICON_LOOKS)[number];

export interface MadeIcon {
  sky: MadeIconSky;
  color: MadeIconColor;
  look: MadeIconLook;
}

/** The made icon a new pick starts from: the shipped icon's sky, color and face. */
export const DEFAULT_MADE_ICON: MadeIcon = { sky: "night", color: "sky", look: "round" };

const within = <T extends string>(list: readonly T[], value: string | undefined): T | undefined =>
  (list as readonly string[]).includes(value ?? "") ? (value as T) : undefined;

export const isMadeIconFace = (look: MadeIconLook): look is MadeIconFace =>
  (MADE_ICON_FACES as readonly string[]).includes(look);
export const isMadeIconExpression = (look: MadeIconLook): look is MadeIconExpression =>
  (MADE_ICON_EXPRESSIONS as readonly string[]).includes(look);

/** Its id, as the build names its files: `made-night-rose-heart`. */
export const madeIconId = (icon: MadeIcon) => `made-${icon.sky}-${icon.color}-${icon.look}`;

/** The made icon an id stands for (null for anything else). */
export function madeIconOf(id: string): MadeIcon | null {
  const [made, rawSky, rawColor, rawLook, ...rest] = id.split("-");
  const sky = within(MADE_ICON_SKIES, rawSky);
  const color = within(MADE_ICON_COLORS, rawColor);
  const look = within(MADE_ICON_LOOKS, rawLook);
  return made === "made" && rest.length === 0 && sky && color && look ? { sky, color, look } : null;
}

/** Every made icon, in the lists' order. */
export const madeIcons = (): MadeIcon[] =>
  MADE_ICON_SKIES.flatMap((sky) =>
    MADE_ICON_COLORS.flatMap((color) => MADE_ICON_LOOKS.map((look) => ({ sky, color, look }))),
  );
