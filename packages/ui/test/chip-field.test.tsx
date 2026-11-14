import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "../testing/dom";

setupDom();

import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { useState } from "react";
import { ChipField, type ChipFieldOption, type ChipFieldToken, Field, Locked, Token } from "../src";

afterEach(cleanup);

const body = () => within(document.body);
const labels = () => [...document.querySelectorAll(".ac-chipfield .ac-token__label")].map((l) => l.textContent);

/** Addresses typed or pasted: each word a token, `fixed` ones staying. */
function Addresses({ start = [] as ChipFieldToken[] }) {
  const [tokens, setTokens] = useState<ChipFieldToken[]>(start);
  return (
    <Field label="Para">
      <ChipField
        tokens={tokens}
        placeholder="nome@empresa.com.br"
        morePlaceholder="Mais e-mails…"
        onRemove={(key) => setTokens((list) => list.filter((t) => t.key !== key))}
        onCommit={(text) =>
          setTokens((list) => [
            ...list,
            ...text
              .split(/[\s,;]+/)
              .filter(Boolean)
              .map((w) => ({ key: w, label: w, removeLabel: `Remover ${w}` })),
          ])
        }
      />
    </Field>
  );
}

/** Channels picked from a list under the field. */
function Channels({ options }: { options: ChipFieldOption[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [went, setWent] = useState<string | null>(null);
  return (
    <>
      <Field label="Canais">
        <ChipField
          tokens={[
            { key: "general", label: "general", fixed: true, tip: "Todo mundo entra no #general." },
            ...picked.map((id) => ({ key: id, label: id, removeLabel: `Remover ${id}` })),
          ]}
          placeholder="Adicionar canal…"
          onRemove={(key) => setPicked((list) => list.filter((k) => k !== key))}
          options={options.map((o) => ({ ...o, picked: picked.includes(o.value) }))}
          onPick={(o) =>
            o.goes
              ? setWent(o.value)
              : setPicked((list) => (list.includes(o.value) ? list.filter((k) => k !== o.value) : [...list, o.value]))
          }
          listLabel="Canais"
          empty={(q) => `Nenhum canal com “${q}”.`}
        />
      </Field>
      {went && <p data-testid="went">{went}</p>}
    </>
  );
}

describe("ChipField: typed words", () => {
  test("Enter, a comma or leaving the field makes tokens; a pasted list goes at once; Backspace takes the last back", async () => {
    render(<Addresses />);
    const input = body().getByLabelText("Para") as HTMLInputElement;
    expect(input.placeholder).toBe("nome@empresa.com.br");
    await act(async () => fireEvent.change(input, { target: { value: "ana@example.com" } }));
    await act(async () => fireEvent.keyDown(input, { key: "," }));
    expect(labels()).toEqual(["ana@example.com"]);
    expect(input.value).toBe("");
    // Once there are tokens, the field asks for more.
    expect(input.placeholder).toBe("Mais e-mails…");
    await act(async () => fireEvent.change(input, { target: { value: "bia@example.com" } }));
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    await act(async () =>
      fireEvent.paste(input, { clipboardData: { getData: () => "caio@example.com\ndani@example.com" } }),
    );
    expect(labels()).toEqual(["ana@example.com", "bia@example.com", "caio@example.com", "dani@example.com"]);
    await act(async () => fireEvent.change(input, { target: { value: "edu@example.com" } }));
    await act(async () => fireEvent.blur(input));
    expect(labels()).toContain("edu@example.com");
    await act(async () => fireEvent.keyDown(input, { key: "Backspace" }));
    expect(labels()).not.toContain("edu@example.com");
    await act(async () => fireEvent.click(body().getByRole("button", { name: "Remover ana@example.com" })));
    expect(labels()).toEqual(["bia@example.com", "caio@example.com", "dani@example.com"]);
  });

  test("Backspace never takes a fixed token: it has no ✕, and says why to a screen reader", async () => {
    render(
      <Addresses start={[{ key: "general", label: "general", fixed: true, tip: "Todo mundo entra no #general." }]} />,
    );
    const input = body().getByLabelText("Para");
    await act(async () => fireEvent.keyDown(input, { key: "Backspace" }));
    expect(labels()).toEqual(["general"]);
    const token = document.querySelector(".ac-token") as HTMLElement;
    expect(token.hasAttribute("data-fixed")).toBe(true);
    expect(token.querySelector(".ac-token__remove")).toBeNull();
    expect(token.querySelector(".ac-visually-hidden")?.textContent).toBe("Todo mundo entra no #general.");
  });
});

describe("ChipField: a list under it", () => {
  const options: ChipFieldOption[] = [
    { value: "suporte", label: "#suporte", description: "5 pessoas", group: "Do cargo Suporte" },
    { value: "clientes", label: "#clientes", description: "9 pessoas", group: "Canais" },
    { value: "diretoria", label: "#diretoria", description: "Privado", group: "Canais", disabled: true },
    { value: "max", label: "Max", description: "Lê o e-mail de Bruno", group: "Canais", goes: true },
  ];

  test("typing searches it; arrows and Enter pick, the list stays open with the pick checked; a press picks too", async () => {
    render(<Channels options={options} />);
    const input = body().getByRole("combobox", { name: "Canais" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    await act(async () => fireEvent.keyDown(input, { key: "ArrowDown" }));
    const list = body().getByRole("listbox", { name: "Canais" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(list)
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Do cargo Suporte", "Canais"]);
    await act(async () => fireEvent.change(input, { target: { value: "cli" } }));
    expect(
      within(list)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["#clientes9 pessoas"]);
    await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
    expect(labels()).toEqual(["general", "clientes"]);
    expect((input as HTMLInputElement).value).toBe("");
    expect(
      within(list)
        .getByRole("option", { name: /#clientes/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await act(async () => fireEvent.click(within(list).getByRole("option", { name: /#suporte/ })));
    expect(labels()).toEqual(["general", "clientes", "suporte"]);
    // Picked again: taken out.
    await act(async () => fireEvent.click(within(list).getByRole("option", { name: /#suporte/ })));
    expect(labels()).toEqual(["general", "clientes"]);
  });

  test("a disabled row is never picked; a row that goes elsewhere calls for it and closes the list; no match says so", async () => {
    render(<Channels options={options} />);
    const input = body().getByRole("combobox", { name: "Canais" });
    await act(async () => fireEvent.keyDown(input, { key: "ArrowDown" }));
    const list = body().getByRole("listbox", { name: "Canais" });
    await act(async () => fireEvent.click(within(list).getByRole("option", { name: /#diretoria/ })));
    expect(labels()).toEqual(["general"]);
    await act(async () => fireEvent.click(within(list).getByRole("option", { name: /Max/ })));
    expect(body().getByTestId("went").textContent).toBe("max");
    expect(body().queryByRole("listbox")).toBeNull();
    await act(async () => fireEvent.change(input, { target: { value: "zzz" } }));
    expect(body().getByRole("listbox").textContent).toBe("Nenhum canal com “zzz”.");
  });
});

test("inside a Locked that runs it's off too: its box says so, and a press on it opens no list to pick from", async () => {
  const picks: string[] = [];
  render(
    <Locked when>
      <Field label="Canais">
        <ChipField
          tokens={[]}
          placeholder="Adicionar canal…"
          onRemove={() => {}}
          options={[{ value: "eng", label: "#eng" }]}
          onPick={(o) => {
            picks.push(o.value);
          }}
          listLabel="Canais"
        />
      </Field>
    </Locked>,
  );
  const box = document.querySelector(".ac-chipfield") as HTMLElement;
  expect(box.getAttribute("aria-disabled")).toBe("true");
  expect((body().getByLabelText("Canais") as HTMLInputElement).disabled).toBe(true);
  await act(async () => fireEvent.mouseDown(box));
  expect(body().queryByRole("listbox")).toBeNull();
  expect(picks).toEqual([]);
});

test("on a phone or a touch screen its words are 16px, as every field's there: iOS zooms into a smaller one", async () => {
  const css = await Bun.file(new URL("../src/styles/components.css", import.meta.url).pathname).text();
  const touch = css.split("\n@media (max-width: 760px), (pointer: coarse) {")[1]?.split("\n}")[0] ?? "";
  const sixteen = touch.split("}").find((rule) => rule.includes("font-size: 16px;")) ?? "";
  expect(sixteen.split("{")[0]).toContain(".ac-chipfield__input");
});

describe("Token", () => {
  test("its states: invalid and soft with their word, fixed with no ✕, fresh fading in", () => {
    render(
      <>
        <Token state="invalid" note="confira" onRemove={() => {}} removeLabel="Remover x@y">
          x@y
        </Token>
        <Token state="soft" note="já convidado" onRemove={() => {}} removeLabel="Remover bia@example.com">
          bia@example.com
        </Token>
        <Token fixed tip="Todo mundo tem o Lodi." onRemove={() => {}} removeLabel="Remover Lodi">
          Lodi
        </Token>
        <Token fresh>suporte</Token>
      </>,
    );
    const [bad, soft, fixed, fresh] = [...document.querySelectorAll(".ac-token")] as HTMLElement[];
    expect(bad?.getAttribute("data-state")).toBe("invalid");
    expect(bad?.querySelector(".ac-token__note")?.textContent).toBe("confira");
    expect(soft?.getAttribute("data-state")).toBe("soft");
    expect(soft?.querySelector(".ac-token__note")?.textContent).toBe("já convidado");
    expect(fixed?.querySelector(".ac-token__remove")).toBeNull();
    expect(body().queryByRole("button", { name: "Remover Lodi" })).toBeNull();
    expect(fresh?.hasAttribute("data-fresh")).toBe(true);
  });
});
