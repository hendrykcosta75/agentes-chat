import { expect, test } from "bun:test";
import { atRule, builtCss, declarations, topLevel } from "./built-css";

test("a join request, an invitation or a suggestion is a MediaRow: who it is on the face's line, never cut", async () => {
  const css = await builtCss("src/styles.css", "src/pages/members.css", "src/components/roles/roles.css");
  const shipped = topLevel(css);
  const last = (sheet: string, selector: string, property: string) =>
    declarations(sheet, selector)
      .filter(([p]) => p === property)
      .at(-1)?.[1];

  // The list holds the rows' width: under 480px of it the actions drop under the words (the kit's `__end--wrap`).
  expect(last(shipped, ".ac-list:has(>.members-row)", "container-type")).toBe("inline-size");
  // An email wraps whole: an ellipsis would hide whom it invites.
  expect(last(shipped, ".members-row__name", "overflow-wrap")).toBe("anywhere");
  expect(last(shipped, ".members-row__name", "text-overflow")).toBeUndefined();
  expect(last(shipped, ".members-row__name", "white-space")).toBeUndefined();
  // The kit's grid places the face, the words and the actions: no basis or margin of the row's own.
  expect(last(shipped, ".members-row__acts", "margin-left")).toBeUndefined();
  expect(last(shipped, ".members-row__acts", "flex")).toBeUndefined();
  expect(last(shipped, ".members-row__acts", "flex-wrap")).toBe("wrap");
  expect(last(shipped, ".members-row__acts.ac-acts", "gap")).toBe("var(--space-2) calc(2 * var(--ghost-plate))");
  // The picker is as wide as its words beside the buttons (a form's picker fills its field).
  expect(last(shipped, ".members-row__acts .roles-picker.ac-btn", "width")).toBe("auto");
  expect(last(shipped, ".roles-picker.ac-btn", "width")).toBe("100%");

  // The state is an icon line (the icon on its first line's capitals), with no layout of its own to fight it, beside
  // what the row is; an unconfirmed address beside it too, and what the person wrote last, at the row's width, with
  // the row's own room under it.
  expect(last(shipped, ".ac-iconline", "display")).toBe("flex");
  expect(last(shipped, ".members-row__state", "display")).toBeUndefined();
  expect(last(shipped, ".members-row__line", "flex-wrap")).toBe("wrap");
  expect(last(shipped, ".members-row__flag", "display")).toBe("contents");
  expect(last(shipped, ".members-row__note", "order")).toBe("2");
  expect(last(shipped, ".members-row__note", "margin")).toBe("0");

  // No breakpoint of the rows' own: the list's width decides, as for every MediaRow.
  for (const media of ["@media (max-width: 640px)", "@media (max-width: 760px)"])
    for (const part of [".members-row__state", ".members-row__acts", ".members-row__flag"])
      expect(declarations(atRule(css, media), part)).toEqual([]);
});
