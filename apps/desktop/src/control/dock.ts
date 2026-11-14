/** Preferences › General › "Show in the menu bar" (a Mac): unset, the icon follows what this computer does. */
export const MENU_BAR_PREF = "menuBar";

/** The menu bar icon on a Mac: the person's choice, else only while this computer works for agents. */
export const menuBarShown = (pref: boolean | null, works: boolean) => pref ?? works;
