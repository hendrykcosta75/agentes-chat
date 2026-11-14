/** Types for scenes.mjs (plain JavaScript, run by Node without a build). */
import type { Layer } from "./raster.mjs";

export interface SceneLayer extends Layer {
  bg?: boolean;
  part?: "agent" | "eyes" | "moon" | "accessory";
}
export interface Scene {
  light: () => SceneLayer[];
  dark: () => SceneLayer[];
  favicon: (N: 16 | 32) => Layer[];
}
export type AppIconId = "night" | "moon" | "sky" | "peekNight" | "peekSky";
export const APP_ICON_IDS: AppIconId[];
export const SCENES: Record<AppIconId, Scene>;
export interface MadeIconSpec {
  sky: string;
  color: string;
  look: string;
}
export const MADE_SKIES: string[];
export const MADE_COLORS: string[];
export const MADE_FACES: string[];
export const MADE_ACCESSORIES: string[];
export const MADE_LOOKS: string[];
export function madeId(icon: MadeIconSpec): string;
export function madeIcons(): MadeIconSpec[];
export function madeScene(icon: MadeIconSpec): SceneLayer[];
export function inRound(x: number, y: number, x0: number, y0: number, w: number, h: number, r: number): boolean;
export function backLayers(layers: SceneLayer[]): SceneLayer[];
export function frontLayers(layers: SceneLayer[]): SceneLayer[];
export function monoLayers(layers: SceneLayer[]): Layer[];
export function tiled(layers: SceneLayer[], r?: number): SceneLayer[];
export function macLayers(layers: SceneLayer[]): Layer[];
