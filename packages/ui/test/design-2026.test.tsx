import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "../testing/dom";

setupDom();

import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { useState } from "react";
import {
  Avatar,
  Button,
  CommandPalette,
  Composer,
  CountChip,
  FilterToggle,
  filterPalette,
  Kbd,
  type PaletteItem,
  PresenceBadge,
  Reaction,
  SearchField,
  Segmented,
  Toolbar,
  WorkSummary,
} from "../src";
import { contrastRatio } from "../src/sky/math";

afterEach(() => cleanup());
const body = () => within(document.body);

describe("buttons and kbd", () => {
  test("kbd hints after the label; the accessible name stays the label", () => {
    render(
      <Button variant="primary" kbd={["⌘", "↵"]}>
        Enviar para o Theo
      </Button>,
    );
    const b = body().getByRole("button", { name: /Enviar para o Theo/ });
    expect(b.querySelectorAll("kbd.ac-kbd")).toHaveLength(2);
    expect(b.querySelector(".ac-btn__kbd")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("no keyboard hints on a touch screen or at phone width, wherever the kit draws one", async () => {
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const narrow = css.split("\n@media (max-width: 760px), (pointer: coarse) {")[1]?.split("\n}")[0] ?? "";
    const hidden = narrow.split("{").at(-2)?.split("}").at(-1) ?? "";
    for (const hint of [
      ".ac-btn__kbd",
      ".ac-btn > .ac-kbd",
      ".ac-composer__send-text .ac-kbd",
      ".ac-searchfield__hint",
      ".ac-palette .ac-kbd",
      ".ac-mo__kbd",
    ])
      expect(hidden).toContain(hint);
    expect(narrow).toMatch(/\.ac-mo__kbd \{\s*display: none;/);
  });

  test("a Button that toggles stays pushed in while on (aria-pressed), hovered or not; a ghost one keeps its plate", async () => {
    render(<Button aria-pressed>Teclado</Button>);
    expect(body().getByRole("button", { name: "Teclado" }).getAttribute("aria-pressed")).toBe("true");
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const rule = (selector: string) =>
      new RegExp(`(^|\\n)${selector.replace(/[.[\]()"=]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[2] ?? "";
    const pressed = rule('.ac-btn[aria-pressed="true"]');
    expect(pressed).toContain("background: var(--sunken)");
    expect(pressed).toContain("color: var(--ink)");
    expect(pressed).toContain("inset 0 0 0 1px var(--line)");
    expect(rule('.ac-btn--ghost[aria-pressed="true"]')).toContain("background: var(--plate)");
    // At the hover's weight, after it, so a pressed button stays pushed in under the pointer; before the focus ring.
    const at = (selector: string) => css.lastIndexOf(`\n${selector} {`);
    expect(at(".ac-btn:hover")).toBeLessThan(at('.ac-btn[aria-pressed="true"]'));
    expect(at('.ac-btn[aria-pressed="true"]')).toBeLessThan(at("html:not([data-pointer]) .ac-btn:focus-visible"));
  });

  test("Kbd is a <kbd>", () => {
    const { container } = render(<Kbd>esc</Kbd>);
    expect(container.querySelector("kbd.ac-kbd")?.textContent).toBe("esc");
  });

  test("disabled stays disabled; an enabled button takes focus (the ring is CSS :focus-visible)", () => {
    render(
      <>
        <Button disabled>Salvar</Button>
        <Button>Cancelar</Button>
      </>,
    );
    expect(body().getByRole("button", { name: "Salvar" }).hasAttribute("disabled")).toBe(true);
    const b = body().getByRole("button", { name: "Cancelar" });
    b.focus();
    expect(document.activeElement === b).toBe(true);
  });

  test("off, a button is a faint plate over what it sits on, so its shape shows on the dark page too", async () => {
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const off = css.split('\n.ac-btn:disabled,\n.ac-btn[aria-disabled="true"] {').at(-1)?.split("}")[0] ?? "";
    expect(off).toContain("background: var(--plate)");
    expect(off).not.toContain("var(--sunken)");
  });

  test("a chosen option is pressed the same in both themes and never moves, so a row of options keeps its words on one line", async () => {
    const tokens = await Bun.file(new URL("../src/styles/tokens.css", import.meta.url).pathname).text();
    const blocks = [...tokens.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)].map(
      ([, selector, rule]) => ({
        selector: (selector ?? "").trim().replace(/\s+/g, " "),
        vars: new Map(
          [...(rule ?? "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
            name ?? "",
            (value ?? "").trim(),
          ]),
        ),
      }),
    );
    type Vars = Map<string, string>;
    const chosen = (vars: Vars) => [...vars.keys()].filter((name) => name.startsWith("chosen-"));
    // One recipe, in the block both themes share, and each theme gives it its face and its shadow.
    const defining = blocks.filter((b) => chosen(b.vars).length > 0);
    expect(defining.map((b) => [b.selector, chosen(b.vars)])).toEqual([
      [':root, [data-theme="light"]', ["chosen-bg", "chosen-press"]],
      ['[data-theme="dark"]', ["chosen-bg", "chosen-press"]],
      [":root, [data-theme]", ["chosen-shadow", "chosen-lift"]],
    ]);
    const [light, dark, shared] = defining.map((b) => b.vars) as [Vars, Vars, Vars];
    expect(light.get("chosen-bg")).toBe("var(--sunken)");
    expect(light.get("chosen-press")).toBe(
      "inset 0 2px 5px rgba(0, 0, 0, 0.16), inset 0 1px 1.5px rgba(0, 0, 0, 0.12)",
    );
    // A black press shows only on a face it can darken: dark's sits lighter than a card, as light as the faint words
    // on a chosen option allow, as light's face does. Its shadow is light's, deeper.
    const level = (hex = "") => Number.parseInt(hex.slice(1, 3), 16);
    expect(level(dark.get("chosen-bg"))).toBeGreaterThan(level(dark.get("raised")));
    for (const [theme, face] of [
      [light, light.get("sunken")],
      [dark, dark.get("chosen-bg")],
    ] as const)
      expect(contrastRatio(theme.get("faint") ?? "", face ?? "")).toBeGreaterThanOrEqual(4.5);
    const shape = (press = "") => press.replace(/rgba\([^)]*\)/g, "");
    expect(shape(dark.get("chosen-press"))).toBe(shape(light.get("chosen-press")));
    const alphas = (press = "") => [...press.matchAll(/rgba\(0, 0, 0, ([\d.]+)\)/g)].map(([, a]) => Number(a));
    const lightAlphas = alphas(light.get("chosen-press"));
    expect(alphas(dark.get("chosen-press")).map((a, i) => a >= 3 * (lightAlphas[i] ?? 1))).toEqual([true, true]);
    expect(shared.get("chosen-shadow")).toBe("var(--chosen-press), inset 0 0 0 1px var(--line)");
    expect(shared.get("chosen-lift")).toBe("none");
  });
});

describe("segmented control", () => {
  function Harness() {
    const [v, setV] = useState<"idle" | "thinking" | "writing">("idle");
    return (
      <Segmented
        label="Estado do agente"
        value={v}
        onValueChange={setV}
        options={[
          { value: "idle", label: "Disponível" },
          { value: "thinking", label: "Pensando" },
          { value: "writing", label: "Escrevendo" },
        ]}
      />
    );
  }
  test("radio semantics; click and arrows move the choice", async () => {
    render(<Harness />);
    const group = body().getByRole("radiogroup", { name: "Estado do agente" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    await act(async () => fireEvent.click(radios[1] as HTMLElement));
    expect(within(group).getByRole("radio", { name: "Pensando" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => fireEvent.keyDown(group, { key: "ArrowRight" }));
    expect(within(group).getByRole("radio", { name: "Escrevendo" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => fireEvent.keyDown(group, { key: "ArrowRight" }));
    expect(within(group).getByRole("radio", { name: "Disponível" }).getAttribute("aria-checked")).toBe("true");
    expect(group.querySelector(".ac-seg__pill")).not.toBeNull();
  });

  test("a value no option has (agents at different levels): nothing chosen, no pill, Tab reaches the first", () => {
    render(
      <Segmented
        label="Nível de todos os agentes"
        value=""
        onValueChange={() => {}}
        options={[
          { value: "read", label: "Ler" },
          { value: "write", label: "Ler e escrever" },
        ]}
      />,
    );
    const group = body().getByRole("radiogroup", { name: "Nível de todos os agentes" });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((r) => [r.getAttribute("aria-checked"), r.tabIndex]),
    ).toEqual([
      ["false", 0],
      ["false", -1],
    ]);
    expect(group.querySelector(".ac-seg__pill")).toBeNull();
  });
});

describe("the count chip", () => {
  test("Segmented counts use the shared CountChip (sm in a small control); the CSS centers it on its box", async () => {
    render(
      <>
        <Segmented
          label="Abas"
          value="a"
          onValueChange={() => {}}
          options={[
            { value: "a", label: "Todas" },
            { value: "m", label: "Missões", count: 1 },
          ]}
        />
        <Segmented
          size="sm"
          label="Pequeno"
          value="a"
          onValueChange={() => {}}
          options={[{ value: "a", label: "Um", count: 12 }]}
        />
        <CountChip strong>6</CountChip>
      </>,
    );
    const tab = body().getByRole("radio", { name: /^Missões/ });
    expect(tab.querySelector(".ac-countchip")?.textContent).toBe("1");
    const small = body().getByRole("radio", { name: /^Um/ });
    expect(small.querySelector(".ac-countchip")?.className).toBe("ac-countchip ac-countchip--sm");
    expect(body().getByText("6").className).toBe("ac-countchip ac-countchip--strong");
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const rule = /\.ac-countchip \{(\s*--count-h[^}]*)\}/.exec(css)?.[1] ?? "";
    for (const decl of ["align-self: center", "height: var(--count-h)", "min-width: var(--count-h)"]) {
      expect(rule).toContain(decl);
    }
    // Every count pill centres its figures' own box (cap height to baseline) on the pill, not the font's line box.
    const centred = /\.ac-count,\s*\.ac-countchip \{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const decl of [
      "display: inline-block",
      "align-content: center",
      "text-align: center",
      "line-height: 1",
      "text-box: trim-both cap alphabetic",
    ]) {
      expect(centred).toContain(decl);
    }
    expect(rule).not.toMatch(/display|line-height/);
    // Digits come from the shared count rule: the text face, tabular (Doto is only for special moments).
    const counts = /\.ac-num,[^{]*\.ac-countchip,[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(counts).toContain("font-family: var(--font-sans)");
    expect(counts).not.toContain("--font-dot");
    expect(counts).toContain("font-variant-numeric: tabular-nums");
  });
});

describe("list toolbars", () => {
  function Harness() {
    const [q, setQ] = useState("");
    const [mine, setMine] = useState(false);
    return (
      <Toolbar
        label="Filtros"
        search={
          <SearchField
            aria-label="Buscar issues"
            placeholder="Buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ("")}
            clearLabel="Limpar busca"
            shortcut={<Kbd>/</Kbd>}
          />
        }
        actions={<Button size="sm">Novo</Button>}
      >
        <FilterToggle pressed={mine} onPressedChange={setMine} icon="person" count={2}>
          Minhas
        </FilterToggle>
      </Toolbar>
    );
  }

  test("search (a pill searchbox with × and a key hint), filters as a named group, actions at the end", async () => {
    const { container } = render(<Harness />);
    const box = body().getByRole("searchbox", { name: "Buscar issues" }) as HTMLInputElement;
    expect(box.closest(".ac-searchfield")).toBeTruthy();
    expect(container.querySelector(".ac-toolbar__search .ac-searchfield")).toBeTruthy();
    expect(container.querySelector(".ac-searchfield__hint")?.textContent).toBe("/");
    expect(body().queryByRole("button", { name: "Limpar busca" })).toBeNull();
    await act(async () => fireEvent.change(box, { target: { value: "login" } }));
    expect(container.querySelector(".ac-searchfield__hint")).toBeNull();
    await act(async () => fireEvent.click(body().getByRole("button", { name: "Limpar busca" })));
    expect(box.value).toBe("");
    const group = body().getByRole("group", { name: "Filtros" });
    const mine = within(group).getByRole("button", { name: "Minhas" });
    expect(mine.getAttribute("aria-pressed")).toBe("false");
    expect(mine.querySelector(".ac-countchip")?.textContent).toBe("2");
    await act(async () => fireEvent.click(mine));
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".ac-toolbar__actions")?.textContent).toBe("Novo");
  });

  test("one shape: ruler controls on the field surface; pressed and set chips are filled neutral; phones scroll the filters", async () => {
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const rule = (selector: string) =>
      new RegExp(`(^|\\n)${selector.replace(/[.[\]()"=]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[2] ?? "";
    expect(rule(".ac-searchfield")).toContain("border-radius: var(--tool-r, var(--control-r-md))");
    expect(rule(".ac-filtertoggle")).toContain("border-radius: var(--tool-r, var(--control-r-sm))");
    expect(rule(".ac-filter")).toContain("border-radius: var(--tool-r, var(--control-r-sm))");
    expect(rule(".ac-searchfield")).toContain("background: var(--field-bg)");
    expect(rule(".ac-filtertoggle")).toContain("background: var(--field-bg)");
    expect(rule('.ac-filtertoggle[aria-pressed="true"]')).toContain("background: var(--ink)");
    expect(rule(".ac-filter--active")).toContain("background: var(--ink)");
    // A phone's toolbar: the search fills its row beside the actions, the filters under them scroll sideways.
    expect(css).toMatch(/\.ac-toolbar > \.ac-toolbar__search \{\s*flex: 1 1 0;/);
    expect(css).toMatch(
      /\.ac-toolbar__filters \{\s*max-width: calc\(100% \+ 2 \* var\(--bleed\)\);[^}]*overflow-x: auto;/,
    );
  });

  test("one height: the search, the toggles and the chips all read --tool-h, so a row lines up", async () => {
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const rule = (selector: string) =>
      new RegExp(`(^|\\n)${selector.replace(/[.[\]()"=]/g, "\\$&")} \\{([^}]*)\\}`).exec(css)?.[2] ?? "";
    // A search on its own is a default field (40); filters default to the compact step (32).
    expect(rule(".ac-searchfield")).toContain("height: var(--tool-h, var(--control-h-md))");
    for (const sel of [".ac-filtertoggle", ".ac-filter"]) {
      expect(rule(sel)).toContain("height: var(--tool-h, var(--control-h-sm))");
    }
    // A list's row is compact: everything in a Toolbar reads the row's step.
    expect(rule(".ac-toolbar")).toContain("--tool-h: var(--control-h-sm)");
    expect(rule(".ac-toolbar--sm")).toContain("--tool-h: var(--control-h-sm)");
    expect(rule(".ac-searchfield--sm")).toContain("--tool-h: var(--control-h-sm)");
    expect(rule(".ac-toolbar .ac-seg")).toContain("--seg-h: var(--tool-h)");
    expect(rule(".ac-toolbar .ac-btn")).toContain("height: var(--tool-h)");
    // Touch grows the whole row together, never one control alone.
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{\s*\.ac-toolbar,\s*\.ac-searchfield,\s*\.ac-filtertoggle,\s*\.ac-filter \{\s*--tool-h: var\(--control-h-md\);/,
    );
  });
});

describe("the living agent symbol", () => {
  test("states: idle (blinks), thinking and writing (halo); people keep initials", () => {
    const { container } = render(
      <>
        <Avatar kind="agent" name="Theo" />
        <Avatar kind="agent" name="Theo" state="thinking" />
        <Avatar kind="agent" name="Theo" state="writing" />
        <Avatar name="Walter" presence="online" />
      </>,
    );
    const [idle, thinking, writing, person] = Array.from(container.querySelectorAll(".ac-avatar"));
    expect(idle?.getAttribute("data-state")).toBe("idle");
    expect(idle?.className).not.toContain("ac-avatar--running");
    expect(thinking?.className).toContain("ac-avatar--thinking");
    expect(thinking?.className).toContain("ac-avatar--running");
    expect(writing?.className).toContain("ac-avatar--writing");
    expect(writing?.querySelector("canvas.ac-avatar__canvas")).not.toBeNull();
    expect(person?.textContent).toBe("W");
    expect(person?.querySelector(".ac-avatar__badge .ac-presence")?.getAttribute("data-presence")).toBe("online");
    expect(person?.hasAttribute("data-state")).toBe(false);
  });
});

describe("the presence badge (ADR 0084)", () => {
  const badge = (el: Element | null | undefined) => el?.querySelector("svg.ac-presence");
  const tones = (svg: Element | null | undefined) =>
    Array.from(svg?.querySelectorAll("path") ?? []).map((p) => p.getAttribute("class"));

  test("1 px pixels on small faces (11 px with the ring), 1.5 px from the profile cards' up; none when null", () => {
    const { container } = render(
      <>
        <Avatar name="Walter" size="sm" presence="busy" presenceLabel="Ocupado" />
        <Avatar name="Walter" size="lg" presence="away" />
        <Avatar kind="agent" name="Theo" presence="online" />
        <Avatar name="Walter" presence={null} />
      </>,
    );
    const [sm, lg, agent, none] = Array.from(container.querySelectorAll(".ac-avatar"));
    expect([badge(sm)?.getAttribute("width"), badge(lg)?.getAttribute("width")]).toEqual(["11", "16.5"]);
    expect(sm?.querySelector(".ac-avatar__badge")?.getAttribute("title")).toBe("Ocupado");
    expect(badge(agent)?.getAttribute("data-presence")).toBe("online");
    expect(none?.querySelector(".ac-avatar__badge")).toBeNull();
  });

  test("busy and away carry a white mark; offline and hidden are outlines, no mark", () => {
    const { container } = render(
      <>
        <PresenceBadge presence="busy" />
        <PresenceBadge presence="away" />
        <PresenceBadge presence="online" />
        <PresenceBadge presence="offline" />
        <PresenceBadge presence="hidden" ring={false} />
      </>,
    );
    const [busy, away, online, offline, hidden] = Array.from(container.querySelectorAll("svg.ac-presence"));
    expect(tones(busy)).toContain("ac-presence__mark");
    expect(tones(away)).toContain("ac-presence__mark");
    expect(tones(online)).not.toContain("ac-presence__mark");
    expect(tones(online)).toContain("ac-presence__light");
    expect(tones(offline)).not.toContain("ac-presence__mark");
    expect(tones(offline)).toContain("ac-presence__ring");
    // Without its ring, 9 pixels of 1 px; the dotted outline leaves its holes empty (no ring to fill them).
    expect(hidden?.getAttribute("viewBox")).toBe("0 0 9 9");
    expect(tones(hidden)).toEqual(["ac-presence__base", "ac-presence__light"]);
  });
});

describe("command palette", () => {
  const picked: string[] = [];
  const items: PaletteItem[] = [
    { key: "c", group: "Ir para", label: "#general", sub: "canal", onSelect: () => picked.push("general") },
    { key: "a", group: "Ir para", label: "Theo", sub: "agente · PM", onSelect: () => picked.push("theo") },
    { key: "s1", group: "Ir para", label: "Conectores", sub: "configurações", onSelect: () => picked.push("conn") },
    { key: "s2", group: "Ir para", label: "Skills", sub: "configurações", onSelect: () => picked.push("skills") },
  ];
  test("filter: every word, accents and case ignored", () => {
    expect(filterPalette(items, "config").map((i) => i.key)).toEqual(["s1", "s2"]);
    expect(filterPalette(items, "CONFIGURACOES skills").map((i) => i.key)).toEqual(["s2"]);
    expect(filterPalette(items, "").length).toBe(4);
    // A search-only item (an agent's tab) stays out of the open palette and shows once typed.
    const tab: PaletteItem = {
      key: "t1",
      group: "Agents",
      label: "Ada · Instructions",
      searchOnly: true,
      onSelect() {},
    };
    expect(filterPalette([...items, tab], "").map((i) => i.key)).not.toContain("t1");
    expect(filterPalette([...items, tab], "ada instr").map((i) => i.key)).toEqual(["t1"]);
  });
  test("type, arrows, Enter goes; the query-built item comes last; nothing → empty text", async () => {
    picked.length = 0;
    let open = true;
    const { rerender } = render(
      <CommandPalette
        open={open}
        onOpenChange={(o) => {
          open = o;
        }}
        items={items}
        extra={(q) =>
          q.trim()
            ? [
                {
                  key: "ask",
                  group: "Pedir a um agente",
                  label: `Theo, ${q}`,
                  sub: "nova conversa",
                  onSelect: () => picked.push(`ask:${q}`),
                },
              ]
            : []
        }
        label="Ir para, ou pedir a um agente"
        placeholder="Ir para, ou pedir a um agente…"
        listLabel="Resultados"
        emptyText={(q) => `Nada com “${q}”.`}
      />,
    );
    const input = body().getByRole("combobox", { name: "Ir para, ou pedir a um agente" });
    await act(async () => fireEvent.change(input, { target: { value: "config" } }));
    const list = body().getByRole("listbox", { name: "Resultados" });
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      expect.stringContaining("Conectores"),
      expect.stringContaining("Skills"),
      expect.stringContaining("Theo, config"),
    ]);
    await act(async () => fireEvent.keyDown(input, { key: "ArrowDown" }));
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    expect(picked).toEqual(["skills"]);
    expect(open).toBe(false);
    rerender(
      <CommandPalette
        open
        onOpenChange={() => {}}
        items={items}
        label="Ir para, ou pedir a um agente"
        placeholder="…"
        listLabel="Resultados"
        emptyText={(q) => `Nada com “${q}”.`}
      />,
    );
    await act(async () =>
      fireEvent.change(body().getByRole("combobox", { name: "Ir para, ou pedir a um agente" }), {
        target: { value: "zzz" },
      }),
    );
    expect(document.body.textContent).toContain("Nada com “zzz”.");
  });
});

describe("composer", () => {
  function Harness({ onSend, onCommand }: { onSend: (t: string) => void; onCommand: (k: string) => void }) {
    const [v, setV] = useState("");
    return (
      <Composer
        value={v}
        onChange={setV}
        onSend={(t) => {
          onSend(t);
          setV("");
        }}
        label="Mensagem para Theo"
        sendLabel="Enviar"
        sendText="Enviar"
        pills={<span className="ac-composer__pill">Theo</span>}
        commands={{
          listLabel: "Comandos",
          list: [
            {
              key: "report",
              label: "/relatório",
              description: "Theo monta um documento",
              onPick: () => onCommand("report"),
            },
            { key: "pc", label: "/pc", description: "rodar no PC do Theo", onPick: () => onCommand("pc") },
          ],
        }}
      />
    );
  }
  test("'/' opens the command menu; filter; Enter picks; Esc closes", async () => {
    const commands: string[] = [];
    render(<Harness onSend={() => {}} onCommand={(k) => commands.push(k)} />);
    const box = body().getByRole("combobox", { name: "Mensagem para Theo" });
    await act(async () => fireEvent.change(box, { target: { value: "/", selectionStart: 1 } }));
    const menu = body().getByRole("listbox", { name: "Comandos" });
    expect(within(menu).getAllByRole("option")).toHaveLength(2);
    await act(async () => fireEvent.change(box, { target: { value: "/p", selectionStart: 2 } }));
    expect(within(body().getByRole("listbox", { name: "Comandos" })).getAllByRole("option")).toHaveLength(1);
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(commands).toEqual(["pc"]);
    expect((box as HTMLTextAreaElement).value).toBe("/pc ");
    expect(body().queryByRole("listbox", { name: "Comandos" })).toBeNull();
  });

  test("send: the compact primary square, off without text; same accessible name", async () => {
    render(<Harness onSend={() => {}} onCommand={() => {}} />);
    const send = body().getByRole("button", { name: "Enviar" });
    expect(send.className).toContain("ac-btn--primary");
    expect(send.className).toContain("ac-btn--sm");
    expect(send.hasAttribute("data-ready")).toBe(false);
    expect(send.hasAttribute("disabled")).toBe(true);
    expect(send.getAttribute("title")).toBe("Enviar ↵");
    await act(async () =>
      fireEvent.change(body().getByRole("combobox", { name: "Mensagem para Theo" }), { target: { value: "oi" } }),
    );
    const ready = body().getByRole("button", { name: "Enviar" });
    expect(ready.hasAttribute("data-ready")).toBe(true);
    expect(ready.hasAttribute("disabled")).toBe(false);
  });
});

describe("work summary and reactions", () => {
  test("collapsed by default; expanding shows the steps with checks; failures say so", async () => {
    const toggles: boolean[] = [];
    render(
      <WorkSummary
        summary={
          <>
            <strong>4 passos</strong> · himetrica, Drive · 12 s
          </>
        }
        onToggle={(o) => toggles.push(o)}
        steps={[
          { key: "1", label: "Consultou himetrica", time: "3 s" },
          { key: "2", label: "Criou o documento no Drive", time: "3 s", failed: true },
        ]}
      />,
    );
    const head = body().getByRole("button", { name: /4 passos/ });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(body().queryByRole("listitem")).toBeNull();
    await act(async () => fireEvent.click(head));
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const steps = body().getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual(["Consultou himetrica3 s", "Criou o documento no Drive3 s"]);
    expect(steps[1]?.querySelector(".ac-tick--failed")).not.toBeNull();
    expect(toggles).toEqual([true]);
  });

  test("a reaction is a toggle button with its count", () => {
    render(<Reaction pressed count={2} label="Útil, 2" />);
    const r = body().getByRole("button", { name: "Útil, 2" });
    expect(r.getAttribute("aria-pressed")).toBe("true");
    expect(r.textContent).toBe("2");
  });
});

describe("reduced motion (2026-10 block)", () => {
  test("halo, mark and tab animations only run without reduced motion (the agent's own motion is the engine's)", async () => {
    const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
    const block = css.slice(css.indexOf("Design system 2026-10 (docs/design"));
    const outside = block.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/\banimation:\s*ac-/);
    expect(block).toContain("ac-halo");
    expect(block).toContain("backdrop-filter");
    // Glass has a solid fallback first.
    expect(block.indexOf("var(--glass-solid)")).toBeLessThan(block.indexOf("backdrop-filter: blur"));
  });
});
