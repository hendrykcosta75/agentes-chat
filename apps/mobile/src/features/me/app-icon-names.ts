import {
  APP_ICONS,
  type AppIconId,
  DEFAULT_APP_ICON,
  type MadeIcon,
  madeIconId,
  madeIconOf,
  madeIcons,
} from "@agenteschat/client/lib/app-icons";

/** An icon the phone can show: one of the ready ones, or one the person made. */
export type PhoneIcon = AppIconId | MadeIcon;

const idOf = (icon: PhoneIcon) => (typeof icon === "string" ? icon : madeIconId(icon));
export const samePhoneIcon = (a: PhoneIcon, b: PhoneIcon) => idOf(a) === idOf(b);

const IOS_PREFIX = "AppIcon-";

/**
 * Each app icon's name on the phone's side (ADR 0179), as plugins/with-app-icons.js names it: iOS's asset catalog set
 * (the shipped one is the app's own, `null` to UIKit) and Android's launcher alias. Apart from app-icon.ts so a test
 * reads it without React Native.
 */
export function nativeIconName(icon: PhoneIcon, os: string): string | null {
  const id = idOf(icon);
  if (os === "ios") return id === DEFAULT_APP_ICON ? null : `${IOS_PREFIX}${id}`;
  return `AppIcon${id
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("")}`;
}

/** Every icon, the ready ones first: Android's module is given all their names. */
export const phoneIcons = (): PhoneIcon[] => [...APP_ICONS, ...madeIcons()];

let byAlias: Map<string, MadeIcon> | null = null;

/** The icon a native name stands for (an unknown name is the shipped one). */
export function iconOfNativeName(name: string | null, os: string): PhoneIcon {
  const ready = APP_ICONS.find((id) => nativeIconName(id, os) === name);
  if (ready || !name) return ready ?? DEFAULT_APP_ICON;
  if (os === "ios")
    return (name.startsWith(IOS_PREFIX) ? madeIconOf(name.slice(IOS_PREFIX.length)) : null) ?? DEFAULT_APP_ICON;
  byAlias ??= new Map(madeIcons().map((icon) => [nativeIconName(icon, os) ?? "", icon]));
  return byAlias.get(name) ?? DEFAULT_APP_ICON;
}
