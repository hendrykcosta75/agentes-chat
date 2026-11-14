import { type AppIconId, DEFAULT_APP_ICON, type MadeIconSky } from "@agenteschat/client/lib/app-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { iconOfNativeName, nativeIconName, type PhoneIcon, phoneIcons } from "./app-icon-names";

/**
 * The app icon a person picks on their phone (ADR 0179), through modules/app-icon: iOS's alternate icons, Android's
 * launcher aliases (plugins/with-app-icons.js makes both). A build from before them has neither: `supported` is
 * false and Você hides the row.
 */
interface AppIconNative {
  supported(names: string[]): Promise<boolean>;
  get(names: string[]): Promise<string | null>;
  set(names: string[], name: string | null): Promise<void>;
}

const native = requireOptionalNativeModule<AppIconNative>("AppIcon");

/** Every icon's native name (Android's aliases, the shipped one first; iOS reads none of them). */
const NAMES = Platform.OS === "android" ? phoneIcons().map((icon) => nativeIconName(icon, "android") ?? "") : [];

/**
 * Each icon's picture in the picker, as the home screen shows it in light and in dark: bundled assets (`require`
 * gives their ids, which React Native's and expo-image's views both take).
 */
export const APP_ICON_PICTURES: Record<AppIconId, { light: number; dark: number }> = {
  night: {
    light: require("../../../assets/app-icons/night/preview.png"),
    dark: require("../../../assets/app-icons/night/preview-dark.png"),
  },
  moon: {
    light: require("../../../assets/app-icons/moon/preview.png"),
    dark: require("../../../assets/app-icons/moon/preview-dark.png"),
  },
  sky: {
    light: require("../../../assets/app-icons/sky/preview.png"),
    dark: require("../../../assets/app-icons/sky/preview-dark.png"),
  },
  peekNight: {
    light: require("../../../assets/app-icons/peekNight/preview.png"),
    dark: require("../../../assets/app-icons/peekNight/preview-dark.png"),
  },
  peekSky: {
    light: require("../../../assets/app-icons/peekSky/preview.png"),
    dark: require("../../../assets/app-icons/peekSky/preview-dark.png"),
  },
};

/** The made icons' skies without an agent: the picker draws the agent over them. */
export const MADE_ICON_SKY_PICTURES: Record<MadeIconSky, number> = {
  night: require("../../../assets/app-icons/made/night.png"),
  sky: require("../../../assets/app-icons/made/sky.png"),
};

const KEY = ["app-icon"] as const;

/** Whether this build can change its icon, and the one it shows now (null while asking). */
export function useAppIcon() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<{ supported: boolean; icon: PhoneIcon }> => {
      if (!native) return { supported: false, icon: DEFAULT_APP_ICON };
      const supported = await native.supported(NAMES).catch(() => false);
      if (!supported) return { supported: false, icon: DEFAULT_APP_ICON };
      const name = await native.get(NAMES).catch(() => null);
      return { supported: true, icon: iconOfNativeName(name, Platform.OS) };
    },
  });
  const set = async (icon: PhoneIcon) => {
    if (!native) return;
    await native.set(NAMES, nativeIconName(icon, Platform.OS));
    qc.setQueryData(KEY, { supported: true, icon });
  };
  return { supported: query.data?.supported ?? false, icon: query.data?.icon ?? null, set };
}
