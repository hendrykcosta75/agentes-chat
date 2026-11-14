/*
 * The layout rules, run inside Chromium on a laid-out screen. Each finding names its element by its classes, never by
 * its words or size, so a baseline entry survives new copy and only a new offender is new.
 */
(() => {
  const EDGE_MIN = 8;
  /** A quiet line (the agents' pair, a date, "Novas") and a bubble: closer than this reads as touching. */
  const QUIET_MIN = 4;
  /** The kit's smallest gap (`--space-1`): two things side by side in a row closer than this touch. */
  const GAP_MIN = 4;
  /** Taller than this is a layout's column or a card, not an inline item. */
  const INLINE_MAX = 120;
  const PAD_DIFF = 2;
  const PLATE_DIFF = 1;
  const GAP_DIFF = 1.5;
  /** The narrowest window a side pane floats in instead of covering the screen (`.thread-panel` in threads.css). */
  const DESKTOP_MIN = 861;
  /** What `cascadeorder` compares between two CSS orders: the box, its room, its type and its paint. */
  const ORDER_PROPS = [
    "display",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "row-gap",
    "column-gap",
    "width",
    "height",
    "min-height",
    "font-size",
    "line-height",
    "font-weight",
    "border-top-width",
    "border-top-left-radius",
    "background-color",
    "color",
    "align-items",
    "justify-content",
    "flex-grow",
    "flex-direction",
    "grid-template-columns",
    "position",
    "box-shadow",
    "translate",
    "overflow-x",
  ];

  const sig = (el) => {
    const classes = (typeof el.className === "string" ? el.className : (el.className?.baseVal ?? ""))
      .split(/\s+/)
      .filter((c) => c && !/^(ac-captop|ac-iconline|ac-actrow|is-|has-)/.test(c))
      .slice(0, 3);
    return el.tagName.toLowerCase() + classes.map((c) => `.${c}`).join("");
  };
  /**
   * A finding named only by the kit's classes (`button.ac-btn.ac-btn--sm in section.ac-card`) would, in the baseline,
   * excuse that pair on every screen: it also carries the nearest box around it with a class of the app's own.
   */
  const UTILITY = /^(ac-|row$|stack|small$|muted$|grow$|is-|has-)/;
  const kitOnly = (signature) => !(signature?.match(/\.[\w-]+/g) ?? []).some((c) => !UTILITY.test(c.slice(1)));
  const placeOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const classes = typeof p.className === "string" ? p.className.split(/\s+/) : [];
      if (classes.some((c) => c && !UTILITY.test(c))) return sig(p);
    }
    return undefined;
  };
  const words = (el) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const style = (el) => getComputedStyle(el);
  const painted = (color) => color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color);
  const hasSurface = (s) =>
    painted(s.backgroundColor) ||
    s.boxShadow !== "none" ||
    ["Top", "Right", "Bottom", "Left"].some(
      (d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none",
    );
  let seenOf = new Map();
  const seen = (el) => {
    let on = seenOf.get(el);
    if (on === undefined) {
      const s = style(el);
      const r = el.getBoundingClientRect();
      on =
        s.display !== "none" &&
        s.visibility !== "hidden" &&
        +s.opacity !== 0 &&
        r.width > 1 &&
        r.height > 1 &&
        !el.closest(".sr-only,.ac-sr-only,.visually-hidden,.ac-visually-hidden,[hidden],[inert]");
      seenOf.set(el, on);
    }
    return on;
  };
  /** Children as laid out: a `display: contents` box hands its own to its parent. */
  const flow = (el) =>
    [...el.children]
      .flatMap((c) => (style(c).display === "contents" ? flow(c) : [c]))
      .filter((c) => {
        const s = style(c);
        return seen(c) && !["absolute", "fixed", "sticky"].includes(s.position);
      });
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const PAGE_BOX =
    "main,.shell__main,.shell__pages,.shell__work,.ac-dialog,.ac-dialog__body,.ac-details,.ac-details__body";
  /** Inside a box of its own that scrolls or clips within the viewport: it can't run past the screen, only past that box. */
  const contained = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (style(p).overflowX !== "visible" && !p.matches(PAGE_BOX) && p.getBoundingClientRect().right <= innerWidth + 1)
        return true;
    }
    return false;
  };
  /** The nearest box that clips the words of `el` sideways, unless its "…" reaches them (inline all the way down). */
  const cutBy = (el) => {
    let inline = style(el).display === "inline";
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = style(p);
      if (ps.overflowX === "hidden" || ps.overflowX === "clip")
        return inline && ps.textOverflow === "ellipsis" ? null : p;
      if (ps.overflowX !== "visible") return null;
      inline = inline && ps.display === "inline";
    }
    return null;
  };
  const inFloat = (el) => el.closest("[data-radix-popper-content-wrapper],[data-radix-portal]");
  const textRange = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range;
  };
  /**
   * What the eye reads as the content of a box: its words, its icons, and anything with a surface of its own (a key cap,
   * a count). An icon stands in the kit's square, so it counts as that, except a ✕ whose plate shows only on hover: that
   * one counts as what it draws.
   */
  const contentRect = (box) => {
    const rects = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        if (!node.textContent.trim()) return;
        // Words cut by an ellipsis end where their box does, not where the hidden rest would.
        const clip =
          style(node.parentElement).overflowX === "visible" ? null : node.parentElement.getBoundingClientRect();
        for (const r of textRange(node).getClientRects()) {
          if (r.width > 0)
            rects.push(clip ? { left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right) } : r);
        }
        return;
      }
      if (node.nodeType !== 1 || !seen(node)) return;
      const tag = node.tagName.toLowerCase();
      if (tag === "svg" && node.closest("[class*='remove']")) {
        const shapes = node.querySelectorAll("path,circle,rect,line,polyline,polygon,ellipse");
        rects.push(...[...shapes].map((s) => s.getBoundingClientRect()).filter((r) => r.width + r.height > 0));
        return;
      }
      if (
        tag === "svg" ||
        tag === "img" ||
        tag === "canvas" ||
        !node.childNodes.length ||
        (hasSurface(style(node)) && !node.matches("[class*='remove']"))
      ) {
        rects.push(node.getBoundingClientRect());
        return;
      }
      for (const c of node.childNodes) walk(c);
    };
    for (const c of box.childNodes) walk(c);
    if (!rects.length) return null;
    return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
  };

  /** A text node in `box` laid out on more than one line. */
  const wraps = (box) => {
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const tops = new Set([...textRange(n).getClientRects()].map((r) => Math.round(r.top)));
      if (tops.size > 1) return true;
    }
    return false;
  };

  /** The kit's gaps between an icon and the words it leads, by the control's size (`--icon-gap`, `-sm`, `-lg`). */
  const iconGaps = () =>
    ["--icon-gap", "--icon-gap-sm", "--icon-gap-lg"]
      .map((t) => parseFloat(style(document.documentElement).getPropertyValue(t)))
      .filter((v) => v > 0);
  /** Words the eye reads: a text node laid out wider than a pixel (a visually hidden label is one pixel wide). */
  const visibleText = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !seen(n.parentElement)) continue;
      if ([...textRange(n).getClientRects()].some((r) => r.width > 1 && r.height > 1)) return true;
    }
    return false;
  };
  /** Words a button has, shown or hidden at this width, but not a label only a screen reader reads (one pixel, clipped). */
  const hasWords = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const box = n.parentElement;
      const r = box.getBoundingClientRect();
      const clipped = r.width <= 1 && r.height <= 1 && style(box).position === "absolute";
      if (!clipped && !box.closest(".sr-only,.ac-sr-only,.visually-hidden")) return true;
    }
    return false;
  };
  /**
   * The glyph a flow child is, if it is only one: an `svg`, or a box around one and nothing else that shows. A control
   * (a button, a link) is its own thing, and an icon on a tile of its own (a surface: a connector's tile, a face) is
   * that tile.
   */
  const glyphOf = (el) => {
    if (el.tagName.toLowerCase() === "svg") return el;
    if (el.matches("button,a,[role=button]") || visibleText(el) || hasSurface(style(el))) return null;
    const svgs = [...el.querySelectorAll("svg")].filter(seen);
    if (svgs.length !== 1) return null;
    for (let p = svgs[0].parentElement; p && p !== el; p = p.parentElement) if (hasSurface(style(p))) return null;
    return svgs[0];
  };
  /** The kit's marks drawn without an svg: the working orbit (a canvas), the done, failed and stop squares, the wait. */
  const MARKS = "canvas.ac-pixspin,.ac-pixdone,.ac-pixfail,.ac-pixstop,.rq-wait";
  /** The mark a flow child is: one of `MARKS`, or a wordless box around one and nothing else that shows. */
  const markOf = (el) => {
    if (el.matches(MARKS)) return el;
    if (el.matches("button,a,[role=button]") || visibleText(el) || hasSurface(style(el))) return null;
    const marks = [...el.querySelectorAll(`svg,${MARKS}`)].filter(seen);
    return marks.length === 1 && marks[0].matches(MARKS) ? marks[0] : null;
  };
  /** Where what shows of a flow child starts and ends: its glyph, its plate, or its words. */
  const inkOf = (el) => {
    const glyph = glyphOf(el);
    if (glyph) return glyph.getBoundingClientRect();
    if (hasSurface(style(el))) return el.getBoundingClientRect();
    return contentRect(el);
  };
  /** An East Asian wide character (Chinese, Japanese kana, Korean, full-width forms): about two Latin ones wide. */
  const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
  /**
   * Pills, chips, tokens and buttons with words: the `pad` rule's family. A calendar item is no pill: a block across its
   * column, Google's, its words from its start and the room after them the column's.
   */
  const PILLS =
    ".ac-btn:not(.ac-btn--icon,.ac-btn--glyph,.ac-btn--loading),.ac-token,.ac-chip,.ac-countchip,[class*='pill'],[class*='chip']:not(.cal-chip),[class*='__tag'],[class*='-tag']";
  /**
   * A card: a row with a surface of its own that starts with an icon and ends with what can be done about it (a button,
   * a link) or another icon. Pills are the `pad` rule's.
   */
  const cards = () =>
    [...document.querySelectorAll("div,li,section,article,aside")].filter((el) => {
      // A list's row or an option has no corners of its own, a field is a field.
      if (!seen(el) || el.matches(`${PILLS},[role=option]`) || el.querySelector("input,textarea,[contenteditable]"))
        return false;
      const s = style(el);
      if (!s.display.includes("flex") || s.flexDirection.startsWith("column") || !hasSurface(s)) return false;
      if (!(parseFloat(s.borderTopLeftRadius) > 0 && parseFloat(s.borderBottomRightRadius) > 0)) return false;
      const kids = flow(el);
      if (kids.length < 3) return false;
      const last = kids[kids.length - 1];
      return Boolean(glyphOf(kids[0])) && (last.matches("button,a,[role=button]") || Boolean(glyphOf(last)));
    });

  const SIDES = ["Top", "Bottom", "Left", "Right"];
  const ROW_NAME = /(^|\s|[_-])(row|card|item)(\s|$|--)/;
  /**
   * The row or card an action sits in: the first box around it with a surface, or a list row: one named so, with padding
   * of its own. A layout wrapper around buttons (`.row`, a head's actions) has neither, and no edge to be close to.
   */
  const rowOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (
        p.matches(
          "main,[role=dialog],[role=alertdialog],.ac-dialog__foot,.ac-dialog__head,.ac-details,.ac-input-affix,.ac-seg,.ac-composer,.ac-token",
        )
      )
        return null;
      const s = style(p);
      if (painted(s.backgroundColor) || s.boxShadow !== "none") return { box: p, sides: SIDES };
      const lines = SIDES.filter((d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none");
      if (
        typeof p.className === "string" &&
        ROW_NAME.test(p.className) &&
        parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) > 0
      )
        return { box: p, sides: [...new Set(["Top", "Bottom", ...lines])] };
      if (lines.length) return { box: p, sides: lines };
    }
    return null;
  };

  /** Laid out as a row: a flex row, or a grid of two or more columns. */
  const isRow = (s) =>
    (s.display.includes("flex") && !s.flexDirection.startsWith("column")) ||
    (s.display.includes("grid") && s.gridTemplateColumns.split(" ").length > 1);
  /** What a row can lead with besides a glyph: a face, a tile, a picture. */
  const FACE = ".ac-avatar,.ac-rolemark,img,canvas,video,picture";
  /** A menu item that is a face and nothing else (`MenuFace`, on a menu's top): no row, so no row's room or height. */
  const FACE_ITEM = ".ac-face-edit";
  /** The box that lays `node` out: its parent, or past a `display: contents` one. */
  const layoutParent = (node) => {
    let p = node.parentElement;
    while (p && style(p).display === "contents") p = p.parentElement;
    return p;
  };
  /** The first words `el` shows: a text node laid out wider than a pixel. */
  const firstWords = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !seen(n.parentElement) || n.parentElement.closest("textarea,select,svg")) continue;
      if ([...textRange(n).getClientRects()].some((r) => r.width > 1 && r.height > 1)) return n;
    }
    return null;
  };
  /**
   * A probe of no width as tall as the capitals of the font it sits in (`1cap` follows `font-size-adjust`). A tag and
   * `all: unset` of its own, so no page rule reaches it (`.newag__tip span { display: none }` hid a span).
   */
  const capProbe = () => {
    const p = document.createElement("geo-probe");
    p.style.cssText = "all:unset;display:inline-block;width:0;height:1cap;vertical-align:baseline";
    return p;
  };
  /** Its bottom is the line's baseline: where the capitals sit, their middle and their top. */
  const capsOf = (probe) => {
    const r = probe.getBoundingClientRect();
    probe.remove();
    return { base: r.bottom, mid: r.bottom - r.height / 2, top: r.top };
  };
  /**
   * The baseline and the capitals' middle of the line a text node starts on, by a probe right after its first letter: a
   * box of no width never moves to another line. A text node laid out straight in a flex or grid box is wrapped for
   * the moment, so the probe joins its line instead of becoming an item of its own. With `end`, the line it ends on,
   * by a probe before its last letter.
   */
  const capsAt = (text, also, end = false) => {
    const at = text.data.search(end ? /\S\s*$/ : /\S/);
    if (at < 0) return null;
    const host = layoutParent(text);
    const wrap = host && /flex|grid/.test(style(host).display) ? document.createElement("geo-probe") : null;
    if (wrap) {
      wrap.style.cssText = "all:unset";
      text.before(wrap);
      wrap.append(text);
    }
    const rest = text.splitText(end ? at : at + 1);
    const probe = capProbe();
    rest.before(probe);
    // What is compared with the capitals, read while the probe is in: a probe in a line that fits exactly can push
    // the line's last item onto the next one, and a caller can tell by it.
    const beside = also?.();
    const caps = { ...capsOf(probe), beside };
    text.appendData(rest.data);
    rest.remove();
    if (wrap) {
      wrap.before(text);
      wrap.remove();
    }
    return caps;
  };
  /** The capitals' middle of the line an inline box sits on, by a probe right after it, in its parent's type. */
  const capsAfter = (el) => {
    const probe = capProbe();
    el.after(probe);
    return capsOf(probe);
  };
  const lineHeightOf = (el) => {
    const s = style(el);
    const lh = parseFloat(s.lineHeight);
    return Number.isFinite(lh) ? lh : parseFloat(s.fontSize) * 1.2;
  };
  /** The children of `el` as laid out, words in text nodes too: a `display: contents` box hands its own to its parent. */
  const flowNodes = (el) =>
    [...el.childNodes].flatMap((n) => {
      if (n.nodeType === 3) return n.textContent.trim() ? [n] : [];
      if (n.nodeType !== 1) return [];
      if (style(n).display === "contents") return flowNodes(n);
      return seen(n) && !["absolute", "fixed", "sticky"].includes(style(n).position) ? [n] : [];
    });
  const wordsOf = (node) => (node.nodeType === 3 ? node : firstWords(node));
  /** Two boxes on one line: they share more than half the shorter one's height. */
  const sameLine = (a, b) =>
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.bottom - a.top, b.bottom - b.top) / 2;
  const textRects = (node) => [...textRange(node).getClientRects()].filter((r) => r.width > 1 && r.height > 1);
  /** The distinct lines a set of boxes covers, however their type sizes differ on each line. */
  const lineCount = (rects) => {
    const lines = [];
    for (const r of [...rects].sort((a, b) => a.top - b.top)) {
      const line = lines.find((l) => sameLine(l, r));
      if (line) {
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
      } else lines.push({ top: r.top, bottom: r.bottom });
    }
    return lines.length;
  };
  /** A list's row or item by its class: `.issue-list__row`, `.nt-item`, `.roles-row--base`, not `.home-row__face`. */
  const ROW_ITEM = /(^|\s|[_-])(row|item)(\s|$|--)/;
  /** Selected, current, picked or checked: a row that shows a plate at rest. */
  const PICKED =
    "[aria-selected=true],[aria-current]:not([aria-current=false]),[data-state=checked],.is-selected,.is-on,.is-cur,.is-picked,.is-active";
  /** The nearest box that clips or scrolls what runs past it. */
  const clipperOf = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = style(p);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") return p;
    }
    return null;
  };
  /** A box shadow's layers drawn outside the box: offsets, blur and spread, each with a color that shows. */
  const outerShadows = (value) =>
    value === "none"
      ? []
      : value
          .split(/,(?![^(]*\))/)
          .filter((l) => !/\binset\b/.test(l))
          .map((l) => {
            const color = l.match(/rgba?\([^)]*\)|#[\da-f]+|[a-z]+(?=\s|$)/i)?.[0] ?? "";
            const [x = 0, y = 0, blur = 0, spread = 0] = (
              l.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []
            ).map(parseFloat);
            return { x, y, blur, spread, color };
          })
          .filter((l) => painted(l.color));
  /** A length a token holds, as laid out: a custom property keeps its `calc()` unevaluated. */
  const lengthOf = (token) => {
    const p = document.createElement("geo-probe");
    p.style.cssText = `all:unset;display:block;position:absolute;width:0;height:var(${token},0px)`;
    document.body.append(p);
    const h = p.getBoundingClientRect().height;
    p.remove();
    return h;
  };
  /**
   * Whether a page's toolbar holds its parts on one row: each at its own width, the search at its floor, and the gaps
   * between them. Mirrors `fitsOneRow` in packages/ui/src/components/Toolbar.tsx, which sets `data-stack` when they
   * don't: a captured screen can't run it, so `detect` and `styles` do it here at each width.
   */
  const fitsOneRow = (bar) => {
    const parts = [...bar.children].filter((p) => style(p).display !== "none");
    let need = (parseFloat(style(bar).columnGap) || 0) * Math.max(0, parts.length - 1);
    for (const p of parts)
      need += p.classList.contains("ac-toolbar__search")
        ? parseFloat(style(p).minWidth) || 0
        : p.getBoundingClientRect().width;
    return need <= bar.clientWidth + 0.5;
  };
  /** Stacked, whether the search at its floor and the actions share the top row. Mirrors `topRowFits` in Toolbar.tsx. */
  const topRowFits = (bar) => {
    const search = bar.querySelector(":scope > .ac-toolbar__search");
    const actions = bar.querySelector(":scope > .ac-toolbar__actions");
    if (!search || !actions) return true;
    const gap = parseFloat(style(bar).columnGap) || 0;
    const floor = parseFloat(style(search).minWidth) || 0;
    return floor + gap + actions.getBoundingClientRect().width <= bar.clientWidth - 0.5;
  };
  const stackToolbars = () => {
    for (const bar of document.querySelectorAll(".ac-toolbar:has(> .ac-toolbar__search)")) {
      bar.removeAttribute("data-stack");
      if (!fitsOneRow(bar)) bar.setAttribute("data-stack", topRowFits(bar) ? "" : "split");
    }
  };
  /** What a toolbar's rows hold, each once: its search field, filters and toggles, a segmented control, buttons, selects. */
  const TOOL =
    ".ac-searchfield,.ac-seg,.ac-filter,.ac-filtertoggle,.ac-select__trigger,.ac-btn,button,[role=button],input,select";
  const toolsOf = (bar) => {
    const all = [...bar.querySelectorAll(TOOL)].filter(
      (el) => seen(el) && !el.matches(".ac-searchfield__clear,.ac-filter__clear"),
    );
    return all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
  };
  const CONTROL = "button,input,select,textarea,[role=button],[role=combobox],[role=switch],[role=tab],.ac-seg";
  /** A page's own head, or what starts one: where `pagetop` stops looking for a page's first line. */
  const HEADS = ".ac-pagehead,.ac-back,.settings__head,.issue-page__bar";
  /** What a box shows first, in its flow: a head, a control, a line of words or a row of them. */
  const firstLine = (root) => {
    let box = root;
    for (let depth = 0; depth < 16; depth++) {
      const kids = [...box.children]
        .flatMap((c) => (style(c).display === "contents" ? [...c.children] : [c]))
        .filter((c) => seen(c) && !["absolute", "fixed"].includes(style(c).position));
      const first = kids.find(
        (k) => k.matches(CONTROL) || visibleText(k) || [...k.querySelectorAll(CONTROL)].some(seen),
      );
      if (!first) return box === root ? null : box;
      if (first.matches(`${HEADS},${CONTROL}`) || ownText(first) || isRow(style(first))) return first;
      box = first;
    }
    return box;
  };
  /** A label drawn as a pill beside a name: a chip, a tag, a badge. */
  const PILL_LABEL = ".ac-chip,.agp-tag,[class*='pill'],[class*='badge']";

  const rules = {
    edge(out) {
      // A ghost has no plate at rest: the eye reads its words, which stand inside the button's own padding.
      for (const el of document.querySelectorAll(".ac-btn:not(.ac-btn--ghost,.ac-btn--icon,.ac-btn--glyph)")) {
        if (!seen(el)) continue;
        const row = rowOf(el);
        if (!row || !seen(row.box) || words(row.box) === words(el)) continue;
        const a = el.getBoundingClientRect();
        // A capped card's body cuts what runs past its height under a fade and "See more" (`useCardCut`, which a captured
        // screen can't measure): an action there is cut, not on the card's edge.
        const cut = el.closest("[data-capped] > *");
        if (cut && row.box.contains(cut) && a.bottom > cut.getBoundingClientRect().bottom) continue;
        const b = row.box.getBoundingClientRect();
        const s = style(row.box);
        const inset = {
          Top: a.top - b.top - parseFloat(s.borderTopWidth),
          Bottom: b.bottom - a.bottom - parseFloat(s.borderBottomWidth),
          Left: a.left - b.left - parseFloat(s.borderLeftWidth),
          Right: b.right - a.right - parseFloat(s.borderRightWidth),
        };
        for (const side of row.sides) {
          if (inset[side] < EDGE_MIN - 0.25)
            out.push({
              rule: "edge",
              node: el,
              el: sig(el),
              box: sig(row.box),
              side,
              px: +inset[side].toFixed(1),
              text: words(el),
            });
        }
      }
    },
    pad(out) {
      for (const el of document.querySelectorAll(PILLS)) {
        if (!seen(el)) continue;
        const s = style(el);
        if (!hasSurface(s) || s.display === "inline") continue;
        const b = el.getBoundingClientRect();
        if (b.width > 320 || el.scrollWidth > el.clientWidth + 1) continue;
        // A face at the start of a pill sits tighter than the words at the other end (`nest` checks its corner).
        if (el.firstElementChild?.matches(".ac-avatar,.ac-rolemark,canvas,[class*='face']")) continue;
        // A frame split into segments (an event pill's actions, each after a hairline) pads each one, not the whole.
        if (el.querySelector(":scope > [class*='__actions']")) continue;
        // Words that wrap end where their widest line does, not where the box does: the right side is their rag.
        if (wraps(el)) continue;
        const c = contentRect(el);
        if (!c) continue;
        const left = c.left - b.left;
        const right = b.right - c.right;
        if (left < 0 || right < 0) continue;
        if (Math.abs(left - right) > PAD_DIFF)
          out.push({
            rule: "pad",
            node: el,
            el: sig(el),
            left: +left.toFixed(1),
            right: +right.toFixed(1),
            text: words(el),
          });
      }
    },
    /** A card (`cards`): its first icon's glyph as far from its start as what ends it is from its end. */
    inset(out) {
      for (const el of cards()) {
        const kids = flow(el);
        const first = inkOf(kids[0]);
        const last = inkOf(kids[kids.length - 1]);
        if (!first || !last) continue;
        const b = el.getBoundingClientRect();
        const s = style(el);
        const left = first.left - b.left - parseFloat(s.borderLeftWidth);
        const right = b.right - parseFloat(s.borderRightWidth) - last.right;
        if (left < 0 || right < 0) continue;
        if (Math.abs(left - right) > PAD_DIFF)
          out.push({
            rule: "inset",
            node: el,
            el: sig(el),
            left: +left.toFixed(1),
            right: +right.toFixed(1),
            text: words(el),
          });
      }
    },
    /** In a pill or a card, the words an icon leads stand one of the kit's icon gaps from its glyph. */
    icongap(out) {
      const gaps = iconGaps();
      const want = gaps.join(" or ");
      const boxes = new Set([...document.querySelectorAll(PILLS)].filter(seen));
      for (const card of cards()) boxes.add(card);
      for (const box of boxes) {
        // An inline pill flows with its line's words and spaces, as the `pad` rule leaves it.
        if (style(box).display === "inline") continue;
        // A pill's sentence sits in a part of its frame (`__main`): its row is the one the icon is in.
        const rows = [box, ...box.querySelectorAll(":scope > [class*='__main']")];
        for (const row of rows) {
          // Words can be the row's own text, not a box of their own: its child nodes, not only its laid-out boxes.
          const nodes = [...row.childNodes].filter((n) =>
            n.nodeType === 3 ? n.textContent.trim() : n.nodeType === 1 && flow(row).includes(n),
          );
          const at = nodes.findIndex((n) => n.nodeType === 1 && glyphOf(n));
          const next = at >= 0 ? nodes[at + 1] : undefined;
          // Words, not another glyph or a count on its own plate.
          if (!next || (next.nodeType === 1 && (glyphOf(next) || !visibleText(next) || hasSurface(style(next)))))
            continue;
          const ink = next.nodeType === 3 ? textRange(next).getClientRects()[0] : contentRect(next);
          if (!ink) continue;
          const gap = ink.left - glyphOf(nodes[at]).getBoundingClientRect().right;
          if (!gaps.some((g) => Math.abs(gap - g) <= 1))
            out.push({ rule: "icongap", node: row, el: sig(row), px: +gap.toFixed(1), want, text: words(row) });
        }
      }
    },
    /**
     * A button that is only an icon is a square: its box, or the plate it shows on hover and focus when that is drawn
     * apart from its box (a `::before` set in from its sides, as `.ac-btn--glyph` does).
     */
    square(out) {
      // A select's trigger and a segmented control's part are sized by the control they belong to.
      const parts = "[role=combobox],[aria-haspopup=listbox],.ac-select__trigger,.ac-seg__item,[role=tab],[role=radio]";
      for (const el of document.querySelectorAll("button,a.ac-btn,[role=button]")) {
        if (!seen(el) || el.matches(parts) || hasWords(el)) continue;
        // One glyph: two side by side (a face and a +) are a pill of their own.
        if ([...el.querySelectorAll("svg")].filter(seen).length !== 1) continue;
        const b = el.getBoundingClientRect();
        const before = getComputedStyle(el, "::before");
        const plate =
          before.content !== "none" && before.position === "absolute"
            ? {
                width: b.width - (parseFloat(before.left) || 0) - (parseFloat(before.right) || 0),
                height: b.height - (parseFloat(before.top) || 0) - (parseFloat(before.bottom) || 0),
              }
            : b;
        const r = { width: plate.width, height: plate.height };
        if (Math.abs(r.width - r.height) > 0.5)
          out.push({
            rule: "square",
            node: el,
            el: sig(el),
            box: placeOf(el),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
          });
      }
    },
    text(out) {
      for (const el of document.body.querySelectorAll("*")) {
        if (!seen(el) || el.closest("svg,canvas,pre,code,table,textarea,input")) continue;
        const s = style(el);
        if (ownText(el)) {
          const wide = el.scrollWidth - el.clientWidth;
          const tall = el.scrollHeight - el.clientHeight;
          const clips = (v) => v === "hidden" || v === "clip";
          if (clips(s.overflowX) && wide > 1 && s.textOverflow !== "ellipsis")
            out.push({ rule: "clipped", node: el, el: sig(el), px: wide, text: words(el) });
          // A fold ends its words under a fade (a mask) with "Ver mais" under them: on purpose, not at a hard edge.
          const fold = (s.maskImage || s.webkitMaskImage || "none") !== "none";
          if (clips(s.overflowY) && tall > 2 && s.webkitLineClamp === "none" && s.textOverflow !== "ellipsis" && !fold)
            out.push({ rule: "clipped", node: el, el: sig(el), px: tall, text: words(el) });
          // Cut by a box around it instead: that box's "…" reaches only words on its own lines, not a block inside it
          // (a picker's two lines, a flex column), so they stop mid-word at its edge.
          const by = clips(s.overflowX) ? null : cutBy(el);
          if (by) {
            const edge = by.getBoundingClientRect().left + by.clientLeft + by.clientWidth;
            let start = Infinity;
            let end = -Infinity;
            for (const n of el.childNodes) {
              if (n.nodeType !== 3 || !n.textContent.trim()) continue;
              for (const r of textRange(n).getClientRects()) {
                if (r.width <= 0) continue;
                start = Math.min(start, r.left);
                end = Math.max(end, r.right);
              }
            }
            if (start < edge && end - edge > 1)
              out.push({
                rule: "clipped",
                node: el,
                el: sig(el),
                box: placeOf(el),
                px: Math.round(end - edge),
                text: words(el),
              });
          }
        }
        if (el.children.length > 1 && s.display !== "inline") {
          // An inline box's rectangle spans every line it wraps on, and a float's words flow around it: neither overlaps.
          const kids = flow(el).filter((k) => {
            const ks = style(k);
            return (k.textContent ?? "").trim() && ks.display !== "inline" && ks.float === "none";
          });
          for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
              const a = kids[i].getBoundingClientRect();
              const b = kids[j].getBoundingClientRect();
              const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              const pulled = [kids[i], kids[j]].some(
                (k) => parseFloat(style(k).marginTop) < 0 || parseFloat(style(k).marginLeft) < 0,
              );
              if (ox > 2 && oy > 2 && !pulled)
                out.push({
                  rule: "overlap",
                  node: kids[i],
                  el: sig(kids[i]),
                  box: sig(kids[j]),
                  px: Math.round(Math.min(ox, oy)),
                  text: words(kids[i]),
                });
            }
          }
        }
      }
    },
    /**
     * Words squeezed to a sliver beside something that keeps its width (an action, a time): a block of text on 3 lines
     * or more with fewer than about 12 characters a line, or, straight inside a row, fewer than 1.6 words a line of
     * fewer than 20 characters (an address that wraps its full lines is one word, not a squeeze). A block is what its
     * words lay out in: a `<b>` or a link inside a sentence is the sentence's. A wide character (Chinese, Japanese,
     * Korean) takes the room of two.
     */
    wordwrap(out) {
      const blocks = new Map();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        let block = n.parentElement;
        while (block && block !== document.body && ["inline", "contents"].includes(style(block).display))
          block = block.parentElement;
        if (!block || block === document.body) continue;
        const b = blocks.get(block) ?? { tops: [], text: "" };
        for (const r of textRange(n).getClientRects()) if (r.width > 0) b.tops.push(r.top);
        b.text += n.textContent;
        blocks.set(block, b);
      }
      for (const [el, { tops, text }] of blocks) {
        if (!seen(el) || el.closest("svg,pre,code,table")) continue;
        const s = style(el);
        if (s.whiteSpace.startsWith("pre") || s.whiteSpace === "break-spaces") continue;
        // Lines by their tops: words of another size on the same line sit a few pixels off.
        const step = parseFloat(s.fontSize) * 0.6;
        let lines = 0;
        let last = -Infinity;
        for (const top of tops.sort((a, b) => a - b)) {
          if (top - last <= step) continue;
          lines += 1;
          last = top;
        }
        if (lines < 3) continue;
        const words = text.trim().replace(/\s+/g, " ");
        const parent = el.parentElement;
        const ps = style(parent);
        const row =
          ((ps.display.includes("flex") && !ps.flexDirection.startsWith("column")) ||
            (ps.display.includes("grid") && ps.gridTemplateColumns.split(" ").length > 1)) &&
          flow(parent).length >= 2;
        const room = [...words].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0);
        if (room / lines < 12 || (row && words.split(" ").length / lines < 1.6 && room / lines < 20))
          out.push({ rule: "wordwrap", node: el, el: sig(el), box: sig(parent), lines, text: words.slice(0, 60) });
      }
    },
    /**
     * Words broken inside themselves: more lines than words, so the box is narrower than its own words. `wordwrap` looks
     * only at text right inside a row; this catches it however deep the row that squeezes it is (a title beside a bar's
     * buttons, wrapped in a link or an edit-in-place). A box that hyphenates (`hyphens: auto`: a narrow calendar item's
     * title) breaks a long word at its syllables on purpose.
     */
    midword(out) {
      for (const el of document.body.querySelectorAll("*")) {
        if (!ownText(el) || !seen(el) || el.closest("svg,pre,code,table") || style(el).hyphens === "auto") continue;
        let count = 0;
        const tops = new Set();
        for (const n of el.childNodes) {
          if (n.nodeType !== 3) continue;
          count += n.textContent.trim().split(/\s+/).filter(Boolean).length;
          for (const r of textRange(n).getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
        }
        if (count >= 2 && tops.size >= 3 && tops.size > count)
          out.push({ rule: "midword", node: el, el: sig(el), box: placeOf(el), lines: tops.size, text: words(el) });
      }
    },
    /** A line its "…" leaves a letter or two of ("O…" for an agent's name): it says nothing, the row gave it no room. */
    stub(out) {
      for (const el of document.body.querySelectorAll("*")) {
        if (!ownText(el) || !seen(el) || el.closest("svg,pre,code,table,textarea,input")) continue;
        const s = style(el);
        // An inline box has no width of its own (`clientWidth` 0) and draws no "…": its block does.
        if (s.display === "inline" || s.textOverflow !== "ellipsis" || !["hidden", "clip"].includes(s.overflowX))
          continue;
        if (words(el).length <= 3 || el.clientWidth >= 2.5 * parseFloat(s.fontSize)) continue;
        // Its words' own width: with an ellipsis `scrollWidth` can stay a pixel past the box however much it cut ("Otto" in
        // 34px read "O…" with 35).
        let natural = el.scrollWidth;
        for (const n of el.childNodes)
          if (n.nodeType === 3) natural = Math.max(natural, textRange(n).getBoundingClientRect().width);
        if (natural - el.clientWidth > 0.5)
          out.push({ rule: "stub", node: el, el: sig(el), box: placeOf(el), px: el.clientWidth, text: words(el) });
      }
    },
    viewport(out) {
      const over = document.documentElement.scrollWidth - innerWidth;
      if (over > 1) {
        // Named by what reaches furthest, or one baseline entry for "html" would let every page overflow.
        let far = innerWidth + 1;
        let culprit = null;
        for (const el of document.body.querySelectorAll("*")) {
          if (!seen(el) || inFloat(el) || contained(el)) continue;
          const right = el.getBoundingClientRect().right;
          if (right >= far) {
            far = right;
            culprit = el;
          }
        }
        out.push({ rule: "viewport", node: culprit, el: "html", box: culprit ? sig(culprit) : undefined, px: over });
      }
      for (const el of document.body.querySelectorAll("*")) {
        if (
          !(ownText(el) || el.matches("button,a,input,select,textarea")) ||
          !seen(el) ||
          inFloat(el) ||
          el.closest("svg")
        )
          continue;
        const r = el.getBoundingClientRect();
        // Entirely outside is a closed drawer.
        if (r.right <= innerWidth + 1 || r.left >= innerWidth || r.right <= 0 || contained(el)) continue;
        out.push({ rule: "viewport", node: el, el: sig(el), px: Math.round(r.right - innerWidth), text: words(el) });
      }
    },
    plate(out) {
      const q = ".ac-btn--icon,[class*='__remove'],[class*='tile'],[class*='plate'],[class*='__close']";
      for (const el of document.querySelectorAll(q)) {
        if (!seen(el) || el.children.length !== 1 || ownText(el)) continue;
        const icon = el.firstElementChild;
        if (icon.tagName.toLowerCase() !== "svg" || !seen(icon)) continue;
        const a = el.getBoundingClientRect();
        const b = icon.getBoundingClientRect();
        const dx = (a.left + a.right - b.left - b.right) / 2;
        const dy = (a.top + a.bottom - b.top - b.bottom) / 2;
        if (Math.abs(dx) > PLATE_DIFF || Math.abs(dy) > PLATE_DIFF)
          out.push({ rule: "plate", node: el, el: sig(el), dx: +dx.toFixed(1), dy: +dy.toFixed(1) });
      }
    },
    stack(out) {
      const q = ".ac-dialog__body,.ac-form,.ac-tabpanel,form";
      for (const el of document.querySelectorAll(q)) {
        if (!seen(el)) continue;
        const s = style(el);
        if (!s.display.includes("flex") || !s.flexDirection.startsWith("column")) continue;
        const want = parseFloat(s.rowGap);
        if (!(want > 0)) continue;
        const kids = flow(el);
        for (let i = 1; i < kids.length; i++) {
          const gap = kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom;
          if (Math.abs(gap - want) > GAP_DIFF)
            out.push({
              rule: "stack",
              node: kids[i],
              el: `${sig(kids[i - 1])} + ${sig(kids[i])}`,
              box: sig(el),
              px: +gap.toFixed(1),
              want,
              text: words(kids[i]),
            });
        }
      }
    },
    /**
     * A side pane (`.thread-panel`: a thread, search, an agent's page, a task's conversation, Auditoria's details) on a
     * desktop window floats 10px in from the window's top, right and bottom, never touching its left, over a scrim
     * (the element right before it) that covers the whole window, the sidebar included. Phones take the whole screen.
     */
    floating(out) {
      if (innerWidth < DESKTOP_MIN) return;
      const GAP = 10;
      // An inline position is a test's own stand-in for a narrow window, not the app's layout.
      for (const pane of document.querySelectorAll(".thread-panel:not([style])")) {
        if (!seen(pane)) continue;
        const a = pane.getBoundingClientRect();
        const gaps = { Top: a.top - GAP, Right: innerWidth - a.right - GAP, Bottom: innerHeight - a.bottom - GAP };
        if (a.left < GAP) gaps.Left = a.left - GAP;
        const before = pane.previousElementSibling;
        const scrim = before?.matches(".thread-panel__scrim") ? before : null;
        const s = scrim?.getBoundingClientRect();
        const off = s
          ? Math.abs(s.left) + Math.abs(s.top) + Math.abs(innerWidth - s.right) + Math.abs(innerHeight - s.bottom)
          : Number.POSITIVE_INFINITY;
        if (off > 2)
          out.push({ rule: "floating", node: scrim ?? pane, el: sig(scrim ?? pane), box: sig(pane), side: "Scrim" });
        for (const [side, px] of Object.entries(gaps)) {
          if (Math.abs(px) > 0.5)
            out.push({
              rule: "floating",
              node: pane,
              el: sig(pane),
              box: sig(pane.parentElement),
              side,
              px: +px.toFixed(1),
            });
        }
      }
    },
    /** A message's head that shows its time with no name beside it: a face over a bare time reads as a broken line. */
    nameless(out) {
      for (const head of document.querySelectorAll(".ac-msg__head")) {
        if (!seen(head)) continue;
        const time = head.querySelector(".ac-msg__time");
        const name = head.querySelector(".ac-msg__author");
        if (!time || !seen(time)) continue;
        if (name && seen(name) && contentRect(name)) continue;
        out.push({ rule: "nameless", node: head, el: sig(head), box: placeOf(head), text: words(time) });
      }
    },
    /**
     * Two things side by side in a row, words next to a field, an icon, a pill or a button: at least the kit's smallest
     * gap between them. A box that shows a plate under the pointer (an in-place title, a link button) counts as its
     * whole box, the plate's, even at rest. A field's own affixes and a segmented control are drawn as one.
     */
    touch(out) {
      const control = (el) => {
        if (el.matches("button,input,textarea,select,svg,img,canvas,[role=button],[class*='pill'],[class*='chip']"))
          return true;
        const s = style(el);
        if (hasSurface(s)) return true;
        const parent = el.parentElement;
        return ["pointer", "text"].includes(s.cursor) && (!parent || style(parent).cursor !== s.cursor);
      };
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.closest("svg,.ac-input-affix,.ac-seg")) continue;
        const s = style(row);
        if (!s.display.includes("flex") || s.flexDirection.startsWith("column")) continue;
        const kids = flow(row);
        for (let i = 1; i < kids.length; i++) {
          const [a, b] = [kids[i - 1], kids[i]];
          // Words on one side, a control on the other: two controls side by side (a toolbar's ghost buttons, a pill's
          // actions, faces in a stack) are drawn as one group.
          const ca = control(a);
          if (ca === control(b) || !((ca ? b : a).textContent ?? "").trim()) continue;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          // Columns of a layout (a list beside a pane) are no inline items.
          if (Math.max(ra.height, rb.height) > INLINE_MAX) continue;
          // On different lines of a wrapping row: not side by side.
          if (Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) <= 0) continue;
          const gap = Math.max(rb.left - ra.right, ra.left - rb.right);
          if (gap < GAP_MIN - 0.25)
            out.push({
              rule: "touch",
              node: b,
              el: `${sig(a)} + ${sig(b)}`,
              box: sig(row),
              px: +gap.toFixed(1),
              text: words(b),
            });
        }
      }
    },
    /** A quiet line across the conversation sitting on a bubble above or under it, with no gap between them. */
    quiet(out) {
      const bubbles = [...document.querySelectorAll(".ac-msg__text")].filter(
        (b) => seen(b) && painted(style(b).backgroundColor),
      );
      for (const line of document.querySelectorAll(".consult-pair,.ac-divider,.channel__unread")) {
        if (!seen(line)) continue;
        const l = line.getBoundingClientRect();
        for (const b of bubbles) {
          const r = b.getBoundingClientRect();
          if (Math.min(l.right, r.right) - Math.max(l.left, r.left) <= 0) continue;
          const gap = Math.max(r.top - l.bottom, l.top - r.bottom);
          if (gap < QUIET_MIN)
            out.push({ rule: "quiet", node: line, el: sig(line), box: sig(b), px: +gap.toFixed(1), text: words(line) });
        }
      }
    },
    /**
     * A bubble's time (`.ac-msg__stamp`, with what the row is doing and its stop button) inside its bubble: one wider
     * than the words widens the bubble, it never hangs past the bubble's edge.
     */
    stampout(out) {
      for (const stamp of document.querySelectorAll(".ac-msg__text > .ac-msg__stamp")) {
        const bubble = stamp.parentElement;
        if (!seen(stamp) || !painted(style(bubble).backgroundColor)) continue;
        const s = stamp.getBoundingClientRect();
        const b = bubble.getBoundingClientRect();
        const px = Math.max(b.left - s.left, s.right - b.right);
        if (px > 0.5)
          out.push({
            rule: "stampout",
            node: stamp,
            el: sig(stamp),
            box: sig(bubble),
            px: +px.toFixed(1),
            text: words(stamp),
          });
      }
    },
    /**
     * A bubble's time in its corner never covers the bubble's words: the last line keeps the room of the time as it
     * is written (a 12-hour "11:43 PM" is half again as wide as "23:43") and of the mark after it.
     */
    stampover(out) {
      for (const stamp of document.querySelectorAll(".ac-msg__text > .ac-msg__stamp")) {
        if (!seen(stamp) || style(stamp).position !== "absolute") continue;
        const s = stamp.getBoundingClientRect();
        let px = 0;
        const walker = document.createTreeWalker(stamp.parentElement, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim() || stamp.contains(n) || !seen(n.parentElement)) continue;
          for (const t of textRects(n))
            if (Math.min(t.bottom, s.bottom) - Math.max(t.top, s.top) > 1)
              px = Math.max(px, Math.min(t.right, s.right) - Math.max(t.left, s.left));
        }
        if (px > 0.5)
          out.push({
            rule: "stampover",
            node: stamp,
            el: sig(stamp),
            box: sig(stamp.parentElement),
            px: +px.toFixed(1),
            text: words(stamp),
          });
      }
    },
    /**
     * A grouped message's receipt (`.ac-msg__aside`, in its gutter) never sits under the row's bar
     * (`.ac-msg__actions`, measured where it stands at rest, laid out though unseen) and never leaves the row on its
     * left, at any text size.
     */
    msgaside(out) {
      for (const aside of document.querySelectorAll(".ac-msg--grouped .ac-msg__aside")) {
        if (!seen(aside)) continue;
        const row = aside.closest(".ac-msg");
        const a = aside.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        const bar = row.querySelector(":scope > .ac-msg__body > .ac-msg__actions");
        const b = bar && style(bar).display !== "none" ? bar.getBoundingClientRect() : null;
        const ox = b ? Math.min(a.right, b.right) - Math.max(a.left, b.left) : 0;
        const oy = b ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0;
        const px = Math.max(ox > 0.5 && oy > 0.5 ? Math.min(ox, oy) : 0, r.left - a.left);
        if (px > 0.5) out.push({ rule: "msgaside", node: aside, el: sig(aside), box: sig(row), px: +px.toFixed(1) });
      }
    },
    /**
     * A box that scrolls for a few px: margins, a border or rounding past its edge show a scrollbar (and let the wheel
     * nudge it) over content that, to the eye, fits. The check keeps one only if it stays in a taller window
     * (`lasting` in check.ts). A box with no class of its own is named by the nearest one with a class around it, so
     * its baseline entry can't excuse every other nameless box.
     */
    sliver(out) {
      const SLIVER_MAX = 4;
      for (const el of document.body.querySelectorAll("*")) {
        const y = style(el).overflowY;
        if ((y !== "auto" && y !== "scroll") || el.matches("textarea,input,select") || !seen(el)) continue;
        const px = el.scrollHeight - el.clientHeight;
        if (!(px > 0 && px < SLIVER_MAX)) continue;
        let box;
        if (sig(el) === el.tagName.toLowerCase())
          for (let p = el.parentElement; !box && p && p !== document.body; p = p.parentElement)
            if (sig(p) !== p.tagName.toLowerCase()) box = sig(p);
        out.push({ rule: "sliver", node: el, el: sig(el), ...(box ? { box } : {}), px });
      }
    },
    /**
     * A square (a face, a tile, a picture or a box with a surface, 24 to 64px) leading a row, with words on three or more
     * lines beside it and nothing under it: it owns a column while the words are squeezed. Face, name and role go on one
     * line, the rest under them at the row's full width (MediaRow). A channel's or a thread's messages keep their face
     * column. A conversation with no faces (`data-faces="false"`, a DM whose sides say who spoke) shows none at all.
     */
    squarecol(out) {
      for (const face of document.querySelectorAll("[data-faces='false'] .ac-msg__avatar")) {
        if (seen(face)) out.push({ rule: "squarecol", node: face, el: sig(face), box: placeOf(face), lines: 0 });
      }
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.matches(".ac-msg") || row.closest("svg") || !isRow(style(row))) continue;
        const kids = flow(row);
        if (kids.length < 2) continue;
        const square = kids[0];
        const r = square.getBoundingClientRect();
        if (r.width < 23.5 || r.width > 64.5 || Math.abs(r.width - r.height) > 1) continue;
        if (
          !square.matches(FACE) &&
          !square.querySelector(":scope > img, :scope > canvas") &&
          !hasSurface(style(square))
        )
          continue;
        // What ends the row after the words (a count, "Novo") sits on the row's middle in a column of its own: between
        // two lines, it is none of theirs.
        const words = kids.slice(1).find((k) => visibleText(k));
        const end = words ? words.getBoundingClientRect().right : Number.POSITIVE_INFINITY;
        const beside = [];
        for (const kid of kids.slice(1)) {
          if (kid !== words && kid.getBoundingClientRect().left >= end - 1) continue;
          const walker = document.createTreeWalker(kid, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim() || !seen(n.parentElement)) continue;
            beside.push(...textRects(n).filter((t) => t.left >= r.right - 1));
          }
        }
        const lines = lineCount(beside);
        if (lines < 3) continue;
        const under = kids.slice(1).some((k) => {
          const b = k.getBoundingClientRect();
          return b.top >= r.bottom - 0.5 && b.left < r.right && b.right > r.left;
        });
        if (!under) out.push({ rule: "squarecol", node: square, el: sig(square), box: sig(row), lines });
      }
    },
    /**
     * A face or a mark in an option keeps the row's room around it while the option is highlighted: 6 above and below
     * (10 on touch) and 6 from its start, so it never touches the highlight's edge (OptionRow). A list row with a plate
     * at rest (a fill: selected, current) keeps 8 around its lead; one between hairlines, 8 above and below. A face that
     * is the item itself (`FACE_ITEM`) has no row around it.
     */
    rim(out) {
      const touch = matchMedia("(pointer: coarse)").matches;
      const leadOf = (row) => {
        const first = flow(row)[0];
        if (!first) return null;
        const inner = first.matches(".ac-menu__leading") ? flow(first)[0] : first;
        return inner && (inner.matches(FACE) || inner.tagName.toLowerCase() === "svg") && seen(inner) ? inner : null;
      };
      const room = (lead, row) => {
        const a = lead.getBoundingClientRect();
        const b = row.getBoundingClientRect();
        const s = style(row);
        return {
          top: a.top - b.top - parseFloat(s.borderTopWidth),
          bottom: b.bottom - parseFloat(s.borderBottomWidth) - a.bottom,
          start: a.left - b.left - parseFloat(s.borderLeftWidth),
          end: b.right - parseFloat(s.borderRightWidth) - a.right,
        };
      };
      const options = new Set(
        [...document.querySelectorAll("[role=option],[role^=menuitem],.ac-menu__item")].filter(seen),
      );
      for (const opt of options) {
        const lead = opt.matches(FACE_ITEM) ? null : leadOf(opt);
        if (!lead) continue;
        const had = opt.hasAttribute("data-highlighted");
        if (!had) opt.setAttribute("data-highlighted", "");
        const px = room(lead, opt);
        if (!had) opt.removeAttribute("data-highlighted");
        const block = touch ? 10 : 6;
        const short = [
          ["top", px.top, block],
          ["bottom", px.bottom, block],
          ["start", px.start, 6],
        ].find(([, v, want]) => v < want - 0.5);
        if (short)
          out.push({ rule: "rim", node: opt, el: sig(lead), box: sig(opt), side: short[0], px: +short[1].toFixed(1) });
      }
      for (const row of document.querySelectorAll("li,[role=row],[role=listitem],[class*='row'],[class*='item']")) {
        if (!seen(row) || options.has(row) || row.closest("[role=option],[role^=menuitem],.ac-menu__item,svg"))
          continue;
        if (!row.matches("li,[role=row],[role=listitem]") && !ROW_ITEM.test(row.className)) continue;
        const s = style(row);
        if (!isRow(s)) continue;
        // A plate (a fill, a shadow) shows every side; hairlines only the room above and below.
        const plate = painted(s.backgroundColor) || s.boxShadow !== "none";
        const lined = SIDES.some((d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none");
        if (!plate && !lined) continue;
        const lead = leadOf(row);
        if (!lead) continue;
        const px = room(lead, row);
        const short = (plate ? ["top", "bottom", "start"] : ["top", "bottom"])
          .map((side) => [side, px[side]])
          .find(([, v]) => v < 7.5);
        if (short)
          out.push({ rule: "rim", node: row, el: sig(lead), box: sig(row), side: short[0], px: +short[1].toFixed(1) });
      }
    },
    /**
     * Words right after an inline box that leads with a face or a glyph (an inline-flex name with its face) sit on the
     * baseline of that box's own words, within 0.5px. An inline-flex box's baseline is its first item's: a face's initial.
     */
    inlinebase(out) {
      for (const box of document.body.querySelectorAll("*")) {
        if (!seen(box) || !/^inline-(flex|grid)$/.test(style(box).display)) continue;
        const nodes = flowNodes(box);
        const lead = nodes[0];
        if (lead?.nodeType !== 1 || !(lead.matches(FACE) || glyphOf(lead))) continue;
        const own = nodes.slice(1).map(wordsOf).find(Boolean);
        if (!own) continue;
        let next = null;
        for (let at = box; at && !next; at = at.parentElement) {
          for (let n = at.nextSibling; n; n = n.nextSibling) {
            if (n.nodeType === 3 && n.textContent.trim()) next = n;
            else if (n.nodeType === 1 && seen(n) && style(n).display.startsWith("inline")) next = firstWords(n);
            if (next || (n.nodeType === 1 && seen(n))) break;
          }
          if (!at.parentElement || style(at.parentElement).display !== "inline") break;
        }
        if (!next) continue;
        const a = capsAt(own);
        const b = capsAt(next);
        if (!a || !b) continue;
        const px = b.base - a.base;
        // The words after it wrapped to the next line: no line to share.
        if (Math.abs(px) > lineHeightOf(box) / 2) continue;
        if (Math.abs(px) > 0.5)
          out.push({
            rule: "inlinebase",
            node: box,
            el: sig(box),
            box: placeOf(box),
            px: +px.toFixed(1),
            text: words(box),
          });
      }
    },
    /**
     * A glyph's middle on its line's capitals' middle, within 1px, where the eye centres a sign beside words: a row's
     * lead (a glyph, or a face no taller than 1.25 lines) on its first line, and a glyph inside or after words (an svg, or
     * a wordless box around one: a hint's ⓘ, a mark) on those words, in a line of text or in a row, and a face that is a
     * word of its line (`.ac-who`) on that line. The kit's marks that draw no svg (`MARKS`: the working orbit, the done,
     * failed and stop squares, the wait) are glyphs here too. A person's initials sit within 0.5px of their tile's middle.
     */
    iconmid(out) {
      const push = (node, part, px, row) =>
        out.push({
          rule: "iconmid",
          node,
          el: sig(node),
          box: row ? sig(row) : placeOf(node),
          part,
          px: +px.toFixed(1),
        });
      const leads = new Set();
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.closest("svg") || !isRow(style(row))) continue;
        const nodes = flowNodes(row);
        const lead = nodes[0];
        if (lead?.nodeType !== 1) continue;
        const mark = glyphOf(lead) ?? markOf(lead) ?? (lead.matches(FACE) ? lead : null);
        if (!mark) continue;
        const text = nodes.slice(1).map(wordsOf).find(Boolean);
        if (!text) continue;
        const box = mark.getBoundingClientRect();
        if (box.height > 1.25 * lineHeightOf(text.parentElement) + 0.5) continue;
        leads.add(mark);
        leads.add(lead);
        // On the first line's capitals instead (a face line, a name that rises, an option card's face): `captop`'s.
        const risen = text.parentElement.closest(".ac-captop");
        if (row.matches(".ac-faceline") || (risen && risen !== row && row.contains(risen))) continue;
        if (row.matches(".ac-option") && lead.matches(FACE)) continue;
        // A row that wrapped puts its words under the lead, not beside it: no line to share.
        const first = textRects(text)[0];
        if (!first || Math.min(first.bottom, box.bottom) <= Math.max(first.top, box.top)) continue;
        const caps = capsAt(text, () => mark.getBoundingClientRect());
        // The probe moved the lead (a line that fit exactly and wrapped): this layout can't be measured this way.
        if (!caps || Math.abs(caps.beside.top - box.top) > 0.5) continue;
        const px = (box.top + box.bottom) / 2 - caps.mid;
        if (Math.abs(px) > 1) push(lead, "lead", px, row);
      }
      const glyphs = `svg,${MARKS}`;
      for (const svg of document.body.querySelectorAll(glyphs)) {
        if (!seen(svg) || leads.has(svg) || svg.parentElement?.closest("svg,.ac-avatar,.ac-rolemark")) continue;
        let glyph = svg;
        for (let p = svg.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = style(p);
          if (ps.display === "contents") continue;
          if (visibleText(p) || hasSurface(ps) || [...p.querySelectorAll(glyphs)].filter(seen).length !== 1) break;
          if (p.matches("button,a,[role=button]") && !p.matches(".ac-hint")) break;
          if (style(glyph).display.startsWith("inline") && !ps.display.startsWith("inline")) break;
          glyph = p;
        }
        if (leads.has(glyph)) continue;
        const box = glyph.getBoundingClientRect();
        if (box.height < 8) continue;
        let caps = null;
        if (style(glyph).display.startsWith("inline")) {
          let line = glyph.parentElement;
          while (line && style(line).display === "inline") line = line.parentElement;
          if (!line || box.height > 1.25 * lineHeightOf(line) + 0.5) continue;
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          let shares = false;
          for (let n = walker.nextNode(); n && !shares; n = walker.nextNode()) {
            if (!n.textContent.trim() || glyph.contains(n) || !seen(n.parentElement)) continue;
            let inline = true;
            for (let p = n.parentElement; p && p !== line; p = p.parentElement)
              if (style(p).display !== "inline") inline = false;
            shares = inline && textRects(n).some((t) => sameLine(t, box));
          }
          if (shares) caps = capsAfter(glyph);
        } else {
          const row = layoutParent(glyph);
          if (!row || !isRow(style(row))) continue;
          const nodes = flowNodes(row);
          const at = nodes.indexOf(glyph);
          const words = at > 0 ? nodes[at - 1] : null;
          const before = words ? wordsOf(words) : null;
          if (!before || box.height > 1.25 * lineHeightOf(before.parentElement) + 0.5) continue;
          // After words on one line, on that line. In a row of two lines or more (a select's name and its line, a
          // setting's name over its value) a glyph ends the control, centred on it.
          const lines = [];
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode())
            if (n.textContent.trim() && !glyph.contains(n) && seen(n.parentElement)) lines.push(...textRects(n));
          if (lineCount(lines) === 1 && lines.some((t) => sameLine(t, box))) caps = capsAt(before);
        }
        if (!caps) continue;
        const px = (box.top + box.bottom) / 2 - caps.mid;
        if (Math.abs(px) > 1) push(glyph, "inline", px);
      }
      for (const face of document.querySelectorAll(".ac-who > .ac-avatar")) {
        if (!seen(face) || leads.has(face)) continue;
        const r = face.getBoundingClientRect();
        const px = (r.top + r.bottom) / 2 - capsAfter(face).mid;
        if (Math.abs(px) > 1) push(face, "word", px);
      }
      for (const face of document.querySelectorAll(".ac-avatar")) {
        if (!seen(face) || face.querySelector("img,canvas")) continue;
        const text = firstWords(face);
        const caps = text && capsAt(text);
        if (!caps) continue;
        const r = face.getBoundingClientRect();
        const px = caps.mid - (r.top + r.bottom) / 2;
        if (Math.abs(px) > 0.5) push(face, "initials", px);
      }
    },
    /**
     * In a stack of fields (a box holding two or more), each field's control is as wide as the field and as tall as the
     * stack's usual control, within 1 and 0.5px. A button that shows a value is drawn as a select, never a plain button.
     * A control that grows with what it holds (a chip field's tokens, picks on a second line) a line or more past its
     * min-height is measured by that min-height: its first line is the one that matches.
     */
    fieldwidth(out) {
      const LABEL = ".ac-field__label,.ac-field__label-row,.ac-hintline";
      const TOGGLE =
        "[role=checkbox],[role=radio],[role=switch],[role=radiogroup],input[type=checkbox],input[type=radio]";
      const heightOf = (c) => {
        const h = c.getBoundingClientRect().height;
        if (c.matches("textarea") || c.querySelector("textarea")) return h;
        const min = parseFloat(style(c).minHeight) || 0;
        return min > 0 && h - min >= 16 ? min : h;
      };
      const stacks = new Set();
      for (const field of document.querySelectorAll(".ac-field")) {
        const p = layoutParent(field);
        if (p && seen(field)) stacks.add(p);
      }
      for (const stack of stacks) {
        const pairs = flow(stack)
          .filter((f) => f.matches(".ac-field:not(.ac-field--inline)"))
          .map((field) => [field, flow(field).find((c) => !c.matches(LABEL))]);
        if (pairs.length < 2) continue;
        // What a person fills or picks: a help line in the control's place is no control.
        const CONTROL =
          "input,select,textarea,button,[role=combobox],[role=button],[contenteditable],.ac-select,.ac-seg,.ac-input-affix";
        const controls = pairs.filter(
          ([, c]) =>
            c && (c.matches(CONTROL) || c.querySelector(CONTROL)) && !c.matches(TOGGLE) && !c.querySelector(TOGGLE),
        );
        const count = new Map();
        for (const [, c] of controls) {
          const h = Math.round(heightOf(c) * 2) / 2;
          count.set(h, (count.get(h) ?? 0) + 1);
        }
        const usual = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
        for (const [field, control] of controls) {
          const fs = style(field);
          const inner =
            field.getBoundingClientRect().width -
            parseFloat(fs.paddingLeft) -
            parseFloat(fs.paddingRight) -
            parseFloat(fs.borderLeftWidth) -
            parseFloat(fs.borderRightWidth);
          const c = control.getBoundingClientRect();
          const h = heightOf(control);
          const base = { rule: "fieldwidth", node: control, el: sig(control), box: sig(field) };
          if (control.matches(".ac-btn")) out.push({ ...base, drawn: "button", text: words(control) });
          if (Math.abs(c.width - inner) > 1) out.push({ ...base, side: "width", px: +(c.width - inner).toFixed(1) });
          const tall = control.matches("textarea") || control.querySelector("textarea") || h > 2 * usual;
          if (!tall && Math.abs(h - usual) > 0.5) out.push({ ...base, side: "height", px: +(h - usual).toFixed(1) });
        }
      }
    },
    /**
     * Rounded inside rounded: a plate or a face near a corner of the box it sits on, with room between them, has that
     * box's corner less the room (`outer - gap`). In a fully round pill that makes what sits at its ends fully round. A
     * thing flush with the edge is `corner`'s. Percent corners resolve against the box, every corner clamps to half the
     * shorter side, as the browser draws them. Only on the surfaces built to it (the notice island, toasts, the banners
     * over the composer and the computer's stage): elsewhere a card's buttons keep the kit's own corner.
     */
    nest(out) {
      const NESTED = ".ni,.ac-toast,.noai-banner,.cmp-banner";
      const CORNERS = [
        ["TopLeft", "Top", "Left"],
        ["TopRight", "Top", "Right"],
        ["BottomLeft", "Bottom", "Left"],
        ["BottomRight", "Bottom", "Right"],
      ];
      const REACH = 24;
      const radius = (s, name, r) => {
        const v = s[`border${name}Radius`].split(" ")[0];
        const px = v.endsWith("%") ? (parseFloat(v) / 100) * r.width : parseFloat(v);
        return Math.min(px || 0, r.width / 2, r.height / 2);
      };
      for (const el of document.body.querySelectorAll("*")) {
        if (!seen(el) || el.closest("svg")) continue;
        const s = style(el);
        if (!hasSurface(s) && !el.matches(FACE)) continue;
        // What a rounded box between them clips (a face's canvas, a tile's picture) takes that box's corner, not its own.
        let box = el.parentElement;
        let clipped = false;
        for (; box && box !== document.body && !hasSurface(style(box)); box = box.parentElement) {
          const ps = style(box);
          if (ps.overflowX !== "visible" && parseFloat(ps.borderTopLeftRadius) > 0) clipped = true;
        }
        if (clipped || !box || box === document.body || !box.matches(NESTED)) continue;
        const bs = style(box);
        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        const gap = {
          Top: a.top - b.top - parseFloat(bs.borderTopWidth),
          Bottom: b.bottom - parseFloat(bs.borderBottomWidth) - a.bottom,
          Left: a.left - b.left - parseFloat(bs.borderLeftWidth),
          Right: b.right - parseFloat(bs.borderRightWidth) - a.right,
        };
        // An agent's cut corner (`--radius-agent`) is its mark, not a curve to follow.
        const cut = el.matches(".ac-avatar--agent:not(.ac-avatar--framed)") ? "BottomLeft" : null;
        for (const [name, v, h] of CORNERS) {
          if (name === cut || gap[v] > REACH || gap[h] > REACH) continue;
          const g = Math.min(gap[v], gap[h]);
          if (g < 1) continue;
          const want = radius(bs, name, b) - g;
          if (!(want > 2)) continue;
          const own = radius(s, name, a);
          if (Math.abs(own - want) > 1.5)
            out.push({
              rule: "nest",
              node: el,
              el: sig(el),
              box: sig(box),
              side: name,
              px: +own.toFixed(1),
              want: +want.toFixed(1),
            });
        }
      }
    },
    /**
     * A ring (an inset shadow, an outline, a border on both sides of a corner) whose corner meets the rounded inside
     * corner of the box clipping it is rounded as much, or the clip cuts it there. A row filled at rest (selected,
     * current) inside a rounded box, clear of its edges, has rounded corners of its own.
     */
    corner(out) {
      const CORNERS = [
        ["TopLeft", "Top", "Left"],
        ["TopRight", "Top", "Right"],
        ["BottomLeft", "Bottom", "Left"],
        ["BottomRight", "Bottom", "Right"],
      ];
      for (const el of document.body.querySelectorAll("*")) {
        if (!seen(el) || el.closest("svg")) continue;
        const s = style(el);
        const ringed = s.boxShadow.includes("inset") || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0);
        const lined = (side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none";
        const rung = CORNERS.filter(([, v, h]) => ringed || (lined(v) && lined(h)));
        const clip = rung.length ? clipperOf(el) : null;
        if (clip) {
          const cs = style(clip);
          const a = el.getBoundingClientRect();
          const b = clip.getBoundingClientRect();
          const edge = {
            Top: b.top + parseFloat(cs.borderTopWidth),
            Bottom: b.bottom - parseFloat(cs.borderBottomWidth),
            Left: b.left + parseFloat(cs.borderLeftWidth),
            Right: b.right - parseFloat(cs.borderRightWidth),
          };
          const at = { Top: a.top, Bottom: a.bottom, Left: a.left, Right: a.right };
          for (const [name, v, h] of rung) {
            const want = parseFloat(cs[`border${name}Radius`]) - parseFloat(cs[`border${v}Width`]);
            if (!(want > 0.5) || Math.abs(at[v] - edge[v]) > 1 || Math.abs(at[h] - edge[h]) > 1) continue;
            const own = parseFloat(s[`border${name}Radius`]);
            if (own < want - 0.5)
              out.push({ rule: "corner", node: el, el: sig(el), box: sig(clip), side: name, px: own, want });
          }
        }
        if (!el.matches(PICKED) || !painted(s.backgroundColor)) continue;
        if (CORNERS.some(([name]) => parseFloat(s[`border${name}Radius`]) > 0)) continue;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ps = style(p);
          if (!CORNERS.some(([name]) => parseFloat(ps[`border${name}Radius`]) > 0)) continue;
          if (!hasSurface(ps) && ps.overflowX === "visible") continue;
          const a = el.getBoundingClientRect();
          const b = p.getBoundingClientRect();
          if (a.left > b.left + 1 && a.right < b.right - 1 && a.top > b.top + 1 && a.bottom < b.bottom - 1)
            out.push({ rule: "corner", node: el, el: sig(el), box: sig(p), side: "square" });
          break;
        }
      }
    },
    /**
     * A ring drawn outside a box (an outline, or a box shadow with a spread, or a blur of 2px at most) cut by the box that
     * clips or scrolls it, on a side where the box itself is inside it: a border that shows only at the corners.
     */
    clip(out) {
      for (const el of document.body.querySelectorAll("*")) {
        if (!seen(el) || el.closest("svg")) continue;
        const s = style(el);
        const reach = { top: 0, bottom: 0, left: 0, right: 0 };
        for (const l of outerShadows(s.boxShadow)) {
          if (!(l.spread > 0 || l.blur <= 2)) continue;
          const grow = l.spread + l.blur;
          reach.top = Math.max(reach.top, grow - l.y);
          reach.bottom = Math.max(reach.bottom, grow + l.y);
          reach.left = Math.max(reach.left, grow - l.x);
          reach.right = Math.max(reach.right, grow + l.x);
        }
        if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) {
          const o = parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset);
          for (const side of Object.keys(reach)) reach[side] = Math.max(reach[side], o);
        }
        if (!Object.values(reach).some((v) => v > 0.5)) continue;
        const clip = clipperOf(el);
        if (!clip) continue;
        const cs = style(clip);
        const a = el.getBoundingClientRect();
        const b = clip.getBoundingClientRect();
        const pad = {
          top: b.top + parseFloat(cs.borderTopWidth),
          bottom: b.bottom - parseFloat(cs.borderBottomWidth),
          left: b.left + parseFloat(cs.borderLeftWidth),
          right: b.right - parseFloat(cs.borderRightWidth),
        };
        // A side of the clip on the window's own edge cuts nothing the window wouldn't. Nor does a scroller's side with
        // more to scroll to: what it cuts there shows whole once scrolled (the work's sheet ends above the window's edge).
        const more = {
          top: clip.scrollTop > 0.5,
          bottom: clip.scrollHeight - clip.clientHeight - clip.scrollTop > 0.5,
          left: clip.scrollLeft > 0.5,
          right: clip.scrollWidth - clip.clientWidth - clip.scrollLeft > 0.5,
        };
        const scrolls = (overflow) => overflow === "auto" || overflow === "scroll";
        const cut = [
          ["top", cs.overflowY, pad.top > 0.5 && a.top >= pad.top - 0.5 && a.top - reach.top < pad.top - 0.5],
          [
            "bottom",
            cs.overflowY,
            pad.bottom < innerHeight - 0.5 &&
              a.bottom <= pad.bottom + 0.5 &&
              a.bottom + reach.bottom > pad.bottom + 0.5,
          ],
          ["left", cs.overflowX, pad.left > 0.5 && a.left >= pad.left - 0.5 && a.left - reach.left < pad.left - 0.5],
          [
            "right",
            cs.overflowX,
            pad.right < innerWidth - 0.5 && a.right <= pad.right + 0.5 && a.right + reach.right > pad.right + 0.5,
          ],
        ].find(([side, overflow, hit]) => hit && overflow !== "visible" && !(scrolls(overflow) && more[side]));
        if (cut) out.push({ rule: "clip", node: el, el: sig(el), box: sig(clip), side: cut[0] });
      }
    },
    /**
     * A popover's own actions (its primary button, its actions' row, the field at its foot) cut by its box: scrolled out
     * of sight instead of pinned to its foot. The box, not the window: where a captured screen puts it isn't Radix's.
     */
    actions(out) {
      for (const pop of document.querySelectorAll(".ac-popover")) {
        if (!seen(pop)) continue;
        const p = pop.getBoundingClientRect();
        for (const el of pop.querySelectorAll(
          ".ac-btn--primary,[class*='actions'] > .ac-btn,[class*='__foot'] input",
        )) {
          if (!seen(el)) continue;
          const r = el.getBoundingClientRect();
          const px = Math.max(r.bottom - p.bottom, p.top - r.top);
          if (px > 0.5)
            out.push({ rule: "actions", node: el, el: sig(el), box: sig(pop), px: +px.toFixed(1), text: words(el) });
        }
      }
    },
    /**
     * A page's first line (its head, a way back, Settings' heading) starts `--page-top` under its page's top and
     * `--page-x` in from its side, within 0.5px: every page, Settings, the wiki and the calendar included. Side by side,
     * Settings' section starts where its nav does. The agent page's sky is that page's own top.
     */
    pagetop(out) {
      const want = { Top: lengthOf("--page-top"), Left: lengthOf("--page-x") };
      const roots = [
        ...document.querySelectorAll(".shell__main > .page:not(.agp),.settings,.wiki__center,.cal-page__header"),
      ].map((root) => [root, ["Top", "Left"]]);
      for (const body of document.querySelectorAll(".settings__body")) {
        const nav = body.parentElement?.querySelector(":scope > .settings__nav");
        if (nav && seen(nav) && body.getBoundingClientRect().top < nav.getBoundingClientRect().bottom)
          roots.push([body, ["Top"]]);
      }
      for (const [root, sides] of roots) {
        if (!seen(root)) continue;
        const line = firstLine(root);
        // An empty page's state sits in its middle, by design.
        if (!line || line.closest(".ac-empty")) continue;
        const a = line.getBoundingClientRect();
        const b = root.getBoundingClientRect();
        const s = style(root);
        const at = {
          Top: a.top - b.top - parseFloat(s.borderTopWidth),
          Left: a.left - b.left - parseFloat(s.borderLeftWidth),
        };
        for (const side of sides) {
          const px = at[side] - want[side];
          if (Math.abs(px) > 0.5)
            out.push({ rule: "pagetop", node: line, el: sig(line), box: sig(root), side, px: +px.toFixed(1) });
        }
      }
    },
    /**
     * A list's heading (a GroupHeading, or one line of words right above a list or a card of rows) starts on the list's
     * outer edge within 0.5px (the card's, or its rows' plates'), and ends 8 above it within 1. Right under a page's
     * toolbar or head, it starts 16 under it. A card's own title over the rows inside it is the card's.
     */
    groupedge(out) {
      const LIST = "ul,ol,[role=list],.list-card,.ac-list";
      const inFlow = (n) => seen(n) && !["absolute", "fixed"].includes(style(n).position);
      // A list, or a card of rows (its own children are rows, or it holds settings rows). A control is no list.
      const isList = (el) => {
        if (el.matches(LIST)) return true;
        if (el.matches(`${CONTROL},a,[role=radiogroup],[role=tablist]`) || !hasSurface(style(el))) return false;
        if (el.querySelector(":scope > .settings-rows")) return true;
        const kids = flow(el);
        return kids.length >= 2 && kids.every((k) => typeof k.className === "string" && ROW_ITEM.test(k.className));
      };
      const nextOf = (el) => {
        for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (inFlow(n)) return n;
        return null;
      };
      // The box before it, or before the group it opens (up to the page's column).
      const prevOf = (el) => {
        for (let at = el, up = 0; at && up < 4; at = at.parentElement, up++)
          for (let n = at.previousElementSibling; n; n = n.previousElementSibling) if (inFlow(n)) return n;
        return null;
      };
      for (const head of document.querySelectorAll(
        ".ac-grouphead,h2,h3,h4,[role=heading],[class*='head'],[class*='title']",
      )) {
        // Not a list's heading: a page's or a dialog's head, a disclosure (its own button), a menu's heading (on its
        // items' words by design), or words in a card or in rendered text.
        if (
          !seen(head) ||
          head.matches(".ac-pagehead,.ac-dialog__head,button,a") ||
          head.closest("svg,.md,[class*='card'],.ac-menu,.ac-popover,[role=menu],[role=listbox]")
        )
          continue;
        const list = nextOf(head);
        if (!list || !isList(list)) continue;
        const lines = [];
        const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode())
          if (n.textContent.trim() && seen(n.parentElement)) lines.push(...textRects(n));
        const ink = lines.length && lineCount(lines) === 1 ? contentRect(head) : null;
        if (!ink) continue;
        const l = list.getBoundingClientRect();
        const row = hasSurface(style(list)) ? null : flow(list)[0];
        const edge = row ? row.getBoundingClientRect().left : l.left;
        // A card's own title over the rows inside it, which run to the card's sides where no words start (a table's
        // groups, an import's): the card's, whatever its class.
        let host = head.parentElement;
        while (host && host !== document.body && !hasSurface(style(host))) host = host.parentElement;
        if (host && host !== document.body && host.contains(list)) {
          const inner = host.getBoundingClientRect().left + parseFloat(style(host).borderLeftWidth);
          if (Math.abs(edge - inner) <= 1) continue;
          // A card's own head, its first line (a service's mark and name over its steps): the card's 12, not a list's.
          if (flow(host)[0]?.contains(head)) continue;
        }
        const h = head.getBoundingClientRect();
        const base = { rule: "groupedge", node: head, el: sig(head), box: sig(list) };
        if (Math.abs(ink.left - edge) > 0.5) out.push({ ...base, side: "Left", px: +(ink.left - edge).toFixed(1) });
        if (Math.abs(l.top - h.bottom - 8) > 1)
          out.push({ ...base, side: "Bottom", px: +(l.top - h.bottom).toFixed(1) });
        const prev = prevOf(head);
        if (prev?.matches(".ac-toolbar,.ac-pagehead")) {
          const gap = h.top - prev.getBoundingClientRect().bottom;
          if (Math.abs(gap - 16) > 1) out.push({ ...base, side: "Top", px: +gap.toFixed(1) });
        }
      }
    },
    /**
     * Menu rows are their kind's height, within 0.5px: a line 32, a name over its description 50, a list with faces 36
     * (40, 58 and 44 on touch), a wrapped name or description by its extra lines. They stand 2 apart, the first
     * `--menu-pad` under the menu's top. Headings, separators, the reactions' row and a face that changes the photo on
     * top (`MenuFace`, no row) keep their own.
     */
    menuitem(out) {
      const touch = matchMedia("(pointer: coarse)").matches;
      const MENU = ".ac-menu,[role=menu],[role=listbox]";
      const ITEM = "[role^=menuitem],[role=option],.ac-menu__item";
      const OWN = `.ac-menu__reactions,.ac-menu__heading,.ac-menu__separator,[role=separator],${FACE_ITEM}`;
      const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      for (const menu of document.querySelectorAll(MENU)) {
        if (!seen(menu) || menu.parentElement?.closest(MENU)) continue;
        const items = [...menu.querySelectorAll(ITEM)].filter(
          (el) => seen(el) && !el.closest(OWN) && !el.parentElement.closest(ITEM),
        );
        if (!items.length) continue;
        // The palette (⌘K) finds people and agents among the rest: its rows are option rows whatever a query found,
        // one height as it's typed.
        const faces =
          menu.matches(".ac-palette__list") ||
          items.some((el) => el.querySelector(":scope > .ac-menu__leading > .ac-avatar, :scope > .ac-avatar"));
        // The workspace menu (MenuOverlay) fills the screen in 15px type: its rows are the touch ones everywhere.
        const roomy = touch || menu.matches(".ac-mo__group");
        const own = [...menu.querySelectorAll(OWN)].filter((x) => style(x).display !== "none");
        // A name or a description that wraps (a long one, a narrow window) adds its lines: words wrap, never cut.
        const grown = (box) => {
          if (!box || !seen(box)) return 0;
          const lh = parseFloat(style(box).lineHeight);
          return lh > 0 ? Math.max(0, Math.round(box.getBoundingClientRect().height / lh) - 1) * lh : 0;
        };
        for (const [i, el] of items.entries()) {
          const desc = [...el.querySelectorAll(".ac-menu__desc")].some(seen);
          const extra = desc
            ? grown(el.querySelector(".ac-menu__label > :first-child:not(.ac-menu__desc)")) +
              grown(el.querySelector(".ac-menu__desc"))
            : grown(el.querySelector(".ac-menu__label, .ac-filter__label"));
          const want = (faces ? (roomy ? 44 : 36) : desc ? (roomy ? 58 : 50) : roomy ? 40 : 32) + extra;
          const r = el.getBoundingClientRect();
          const base = { rule: "menuitem", node: el, el: sig(el), box: sig(menu) };
          if (Math.abs(r.height - want) > 0.5) out.push({ ...base, side: "height", px: +r.height.toFixed(1), want });
          const prev = items[i - 1];
          if (prev && !own.some((x) => follows(prev, x) && follows(x, el))) {
            const p = prev.getBoundingClientRect();
            // Side by side (a grid of them) is no column.
            if (r.top >= p.bottom - 1 && Math.abs(r.top - p.bottom - 2) > 0.5)
              out.push({ ...base, side: "gap", px: +(r.top - p.bottom).toFixed(1), want: 2 });
          }
        }
        // The first row on the menu's room, when nothing comes before it (a search field, a heading, a note).
        const first = items[0];
        const pad = parseFloat(style(menu).getPropertyValue("--menu-pad"));
        const before = [...menu.querySelectorAll("*")].some(
          (x) => seen(x) && !x.contains(first) && follows(x, first) && (visibleText(x) || x.matches(CONTROL)),
        );
        if (Number.isFinite(pad) && !before) {
          const top =
            first.getBoundingClientRect().top -
            menu.getBoundingClientRect().top -
            parseFloat(style(menu).borderTopWidth);
          if (Math.abs(top - pad) > 0.5)
            out.push({
              rule: "menuitem",
              node: first,
              el: sig(first),
              box: sig(menu),
              side: "Top",
              px: +top.toFixed(1),
              want: pad,
            });
        }
      }
    },
    /**
     * A list's row (a settings row, a kit list row, any `-row` or `__row` with a hairline or a plate that holds a
     * control) keeps as much room above what it holds as below, within 1px, and at least 8: its controls, faces, tiles
     * and pills by their boxes, its words by their lines (a line that rises to a face's top, `.ac-captop`, by its
     * capitals). A box taller than a row, or a card, is left to `inset`; a setting with no box (`.ac-setrow`) has no edge.
     */
    rowpad(out) {
      const NAMED = ".settings-row,.ac-list__row";
      const ROW = /(^|\s)[\w-]*[^\s-](-|__)row(\s|$|--)/;
      const HOLDS =
        "button,input,select,textarea,[role=button],[role=combobox],[role=switch],.ac-select__trigger,.ac-seg";
      for (const row of document.querySelectorAll(`${NAMED},[class*='-row'],[class*='__row']`)) {
        if (!seen(row) || row.closest("svg")) continue;
        const s = style(row);
        if (!row.matches(NAMED)) {
          const lined = SIDES.some((d) => parseFloat(s[`border${d}Width`]) > 0 && s[`border${d}Style`] !== "none");
          if (!ROW.test(row.className) || !(lined || hasSurface(s))) continue;
          if (![...row.querySelectorAll(HOLDS)].some(seen)) continue;
        }
        const b = row.getBoundingClientRect();
        const card =
          hasSurface(s) && parseFloat(s.borderTopLeftRadius) > 0 && parseFloat(s.borderBottomRightRadius) > 0;
        if (b.height > 160 || card) continue;
        let top = Infinity;
        let bottom = -Infinity;
        const add = (t, u) => {
          top = Math.min(top, t);
          bottom = Math.max(bottom, u);
        };
        const walk = (node) => {
          for (const n of node.childNodes) {
            if (n.nodeType === 3) {
              const rects = n.textContent.trim() && seen(layoutParent(n)) ? textRects(n) : [];
              if (!rects.length) continue;
              // Its lines' box: their words' box and half the leading, or the box they lay out in when it fits them
              // (a cell's padding is the row's room; a box stretched past its lines isn't).
              const lead = (r) => Math.max(0, (lineHeightOf(n.parentElement) - r.height) / 2);
              const first = rects[0];
              const last = rects[rects.length - 1];
              let lines = { top: first.top - lead(first), bottom: last.bottom + lead(last) };
              let host = n.parentElement;
              while (host !== row && ["inline", "contents"].includes(style(host).display)) host = host.parentElement;
              if (host !== row) {
                const hs = style(host);
                const r = host.getBoundingClientRect();
                const inner = {
                  top: r.top + parseFloat(hs.borderTopWidth) + parseFloat(hs.paddingTop),
                  bottom: r.bottom - parseFloat(hs.borderBottomWidth) - parseFloat(hs.paddingBottom),
                };
                if (Math.abs(inner.bottom - inner.top - (lines.bottom - lines.top)) <= 2) lines = inner;
              }
              const risen = n.parentElement.closest(".ac-captop");
              const caps = risen && row.contains(risen) ? capsAt(n) : null;
              add(caps ? caps.top : lines.top, lines.bottom);
              continue;
            }
            if (n.nodeType !== 1) continue;
            // A `display: contents` box has no box of its own: its children lay out in the row (a settings line's
            // name and status in its phone grid).
            if (style(n).display === "contents") {
              walk(n);
              continue;
            }
            if (!seen(n) || ["absolute", "fixed"].includes(style(n).position)) continue;
            // An ⓘ in a line of words counts by its glyph: its 24px target has no plate to see.
            if (n.matches(".ac-hint")) {
              walk(n);
              continue;
            }
            // A plate or a control as tall as the row (its whole row a button) holds the row's content: look inside.
            // So does the line of a row that opens under it (`.ac-foldrow__head`): the row's room is above what the
            // line holds and below what it unfolds.
            const full = n.getBoundingClientRect().height >= b.height - 1 || n.matches(".ac-foldrow__head");
            if ((n.matches(`${HOLDS},${FACE},svg`) || hasSurface(style(n))) && !full) {
              const r = n.getBoundingClientRect();
              add(r.top, r.bottom);
              continue;
            }
            walk(n);
          }
        };
        walk(row);
        if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
        const above = top - b.top - parseFloat(s.borderTopWidth);
        const below = b.bottom - parseFloat(s.borderBottomWidth) - bottom;
        if (Math.abs(above - below) > 1 || Math.min(above, below) < 7.5)
          out.push({
            rule: "rowpad",
            node: row,
            el: sig(row),
            box: placeOf(row),
            above: +above.toFixed(1),
            below: +below.toFixed(1),
          });
      }
    },
    /** A select shows what it holds: words, a face or a mark, never an empty box (a value its options don't have). */
    emptyselect(out) {
      for (const el of document.querySelectorAll(".ac-select__trigger,[role=combobox][aria-haspopup=listbox]")) {
        if (!seen(el) || el.matches("input,textarea")) continue;
        const value = el.querySelector(".ac-select__value") ?? el;
        const picture = [...value.querySelectorAll(`img,canvas,svg,${FACE}`)].some(
          (p) => seen(p) && !p.matches("[class*='chev']") && !p.closest("[class*='chev']"),
        );
        if (!visibleText(value) && !picture) out.push({ rule: "emptyselect", node: el, el: sig(el), box: placeOf(el) });
      }
    },
    /**
     * From 761px, a page's toolbar on one row puts its search first and every other control at its end, packed: each
     * the toolbar's gap from the next within 0.5px, the last on the toolbar's edge.
     */
    toolorder(out) {
      if (innerWidth < 761) return;
      for (const bar of document.querySelectorAll(".ac-toolbar:not([data-stack])")) {
        const search = bar.querySelector(":scope > .ac-toolbar__search");
        if (!seen(bar) || !search || !seen(search)) continue;
        const tools = toolsOf(bar).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        const base = { rule: "toolorder", box: sig(bar) };
        if (tools[0] && !search.contains(tools[0])) {
          out.push({ ...base, node: tools[0], el: sig(tools[0]), side: "first" });
          continue;
        }
        const rest = tools.filter((t) => !search.contains(t));
        const gap = parseFloat(style(bar).columnGap) || 0;
        for (let i = 1; i < rest.length; i++) {
          const px = rest[i].getBoundingClientRect().left - rest[i - 1].getBoundingClientRect().right;
          if (Math.abs(px - gap) > 0.5)
            out.push({ ...base, node: rest[i], el: sig(rest[i]), side: "gap", px: +px.toFixed(1) });
        }
        const last = rest[rest.length - 1];
        if (last) {
          const s = style(bar);
          const edge = bar.getBoundingClientRect().right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
          const px = edge - last.getBoundingClientRect().right;
          if (Math.abs(px) > 0.5) out.push({ ...base, node: last, el: sig(last), side: "end", px: +px.toFixed(1) });
        }
      }
    },
    /**
     * A toolbar's controls by rows: a page's toolbar keeps one row from 761px, two at most once it stacks (under 761 or
     * with `data-stack`), and no control sits alone on a row beside an empty stretch, unless it fills the row (a search,
     * a stacked toolbar's control). From 761px a toolbar without a search wraps its chips, as a list of tags does.
     */
    toolrow(out) {
      for (const bar of document.querySelectorAll(".ac-toolbar")) {
        if (!seen(bar)) continue;
        const rows = [];
        for (const t of toolsOf(bar)) {
          const r = t.getBoundingClientRect();
          const row = rows.find((x) => Math.abs(x.top - r.top) <= 2);
          if (row) row.items.push(t);
          else rows.push({ top: r.top, items: [t] });
        }
        if (rows.length < 2) continue;
        rows.sort((a, b) => a.top - b.top);
        const base = { rule: "toolrow", box: sig(bar), rows: rows.length };
        const stacked = bar.hasAttribute("data-stack") || innerWidth < 761;
        const page = Boolean(bar.querySelector(":scope > .ac-toolbar__search"));
        const second = rows[stacked ? 2 : 1]?.items[0];
        if (second && (stacked || page)) out.push({ ...base, node: second, el: sig(second), side: "rows" });
        for (const { items } of rows) {
          const only = items.length === 1 ? items[0] : null;
          if (!only) continue;
          if (only.getBoundingClientRect().width >= 0.9 * bar.clientWidth || (!page && !stacked)) continue;
          out.push({ ...base, node: only, el: sig(only), side: "alone" });
        }
      }
    },
    /**
     * A picture taller than 1.25 lines leading two lines or more (an `.ac-faceline`, a face, a tile, a logo): the first
     * line's capitals start at its top within 1px. A pill on that line (or ending the row on it, `.ac-captail`) doesn't
     * rise: it never starts above the picture's top, and the name centres on it instead.
     */
    captop(out) {
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.closest("svg") || !isRow(style(row))) continue;
        const nodes = flowNodes(row);
        const pic = nodes[0];
        // A check's or a radio's look, in a row that is itself the button, leads as that control does: no picture.
        if (pic?.nodeType !== 1 || pic.matches(`${CONTROL},a,.ac-check,.ac-radio`)) continue;
        const tile =
          !pic.matches(PILL_LABEL) &&
          hasSurface(style(pic)) &&
          !visibleText(pic) &&
          Math.abs(pic.getBoundingClientRect().width - pic.getBoundingClientRect().height) <= 1;
        if (!pic.matches(FACE) && !pic.querySelector(":scope > img, :scope > canvas") && !tile) continue;
        const text = nodes.slice(1).map(wordsOf).find(Boolean);
        if (!text) continue;
        const p = pic.getBoundingClientRect();
        if (!row.matches(".ac-faceline") && p.height <= 1.25 * lineHeightOf(text.parentElement) + 0.5) continue;
        const beside = [];
        for (const node of nodes.slice(1)) {
          if (node.nodeType === 3) {
            beside.push(...textRects(node));
            continue;
          }
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode())
            if (n.textContent.trim() && seen(n.parentElement)) beside.push(...textRects(n));
        }
        if (lineCount(beside.filter((t) => t.left >= p.right - 1)) < 2) continue;
        const line = textRects(text)[0];
        const tail = [...row.querySelectorAll(":scope > .ac-captail")];
        const pills = nodes
          .slice(1)
          .filter((n) => n.nodeType === 1)
          .flatMap((n) => [...(n.matches(PILL_LABEL) ? [n] : []), ...n.querySelectorAll(PILL_LABEL)])
          .filter(
            (x) => seen(x) && (tail.some((c) => c.contains(x)) || (line && sameLine(x.getBoundingClientRect(), line))),
          );
        const base = { rule: "captop", node: pic, el: sig(pic), box: sig(row) };
        if (pills.length) {
          for (const x of pills) {
            const px = x.getBoundingClientRect().top - p.top;
            if (px < -0.5) out.push({ ...base, node: x, el: sig(x), part: "pill", px: +px.toFixed(1) });
          }
          continue;
        }
        const caps = capsAt(text);
        if (caps && Math.abs(caps.top - p.top) > 1)
          out.push({ ...base, part: "caps", px: +(caps.top - p.top).toFixed(1) });
      }
    },
    /** A list's times (each row's `time`, `__time` or `.nt-tm` at its end) end on one right edge, within 0.5px. */
    timeedge(out) {
      const LIST = "ul,ol,.list-card,[role=list],[role=feed]";
      const isTime = (el) => el.matches("time,.nt-tm") || /(^|\s)[\w-]+__time(\s|$)/.test(el.className);
      for (const list of document.querySelectorAll(LIST)) {
        if (!seen(list)) continue;
        const ends = [];
        for (const row of flow(list)) {
          const r = row.getBoundingClientRect();
          const times = [...row.querySelectorAll("*")].filter(
            (t) => typeof t.className === "string" && isTime(t) && seen(t) && t.closest(LIST) === list,
          );
          const end = times
            .map((t) => [t, t.getBoundingClientRect().right])
            .filter(([, right]) => right > r.left + 0.6 * r.width)
            .sort((a, b) => b[1] - a[1])[0];
          if (end) ends.push(end);
        }
        if (ends.length < 2) continue;
        const edge = Math.max(...ends.map(([, right]) => right));
        for (const [t, right] of ends)
          if (edge - right > 0.5)
            out.push({ rule: "timeedge", node: t, el: sig(t), box: sig(list), px: +(edge - right).toFixed(1) });
      }
    },
    /**
     * What opens in a side pane (the side panel, an aside, a split's column) takes the pane's width: a box in it that
     * holds the view's cards, sections or lists sets no px max-width, whether or not it binds at this width. The pane
     * sizes its view: a split's column grows with the window, so a page's reading width that fits it at 1280 leaves the
     * view short of the pane's edge at 1512. A conversation's own widths (its messages, its composer) are the chat's.
     */
    panefill(out) {
      const PANE = "aside,.page-split > *";
      const HOLDS = ":scope > :is(section,article,form,ul,ol,table,.ac-card)";
      for (const pane of document.querySelectorAll(PANE)) {
        if (!seen(pane)) continue;
        for (const box of pane.querySelectorAll("*")) {
          if (box.matches(PANE) || box.closest(".shell__main--chat") || box.parentElement.closest(PANE) !== pane)
            continue;
          const s = style(box);
          if (!s.maxWidth.endsWith("px") || !/^(block|flex|grid|flow-root|list-item)$/.test(s.display)) continue;
          if (!seen(box) || !box.querySelector(HOLDS)) continue;
          out.push({ rule: "panefill", node: box, el: sig(box), box: sig(pane), maxWidth: s.maxWidth });
        }
      }
    },
    /**
     * Words squeezed beside their actions: in a row (a flex row, or a grid of 2+ columns), words of 12 or more
     * characters outside any control take 3 or more lines beside a group of actions on their line, the actions hold
     * 20% or more of the row, and the same words would take fewer lines with the actions' width added. A lone × is no
     * action: it stays beside its title. The fix is the kit's `.ac-actline`, which puts the actions under the words.
     */
    squeeze(out) {
      const ACT =
        "button,[role=button],a.ac-btn,a[class*='btn'],select,[role=switch],[role=combobox],[role=menuitem],[role=tab],input[type=checkbox],input[type=radio]";
      // A close, and the ⋯ the kit keeps beside it (`.ac-details__close`), stay beside the title by design.
      const isClose = (c) =>
        /^(fechar|close|dispensar|dismiss)\b/i.test(c.getAttribute("aria-label") ?? c.getAttribute("title") ?? "") ||
        /(^|[\s_-])close\b/.test(typeof c.className === "string" ? c.className : "") ||
        Boolean(c.closest(".ac-details__close,.ac-dialog__close"));
      /** Words `el` shows outside any control: its text nodes laid out wider than a pixel. */
      const loose = (el) => {
        const found = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const box = n.parentElement;
          if (!n.textContent.trim() || !box || box.closest(ACT) || box.closest("svg,pre,code,textarea") || !seen(box))
            continue;
          const rects = textRects(n);
          if (rects.length) found.push({ node: n, rects });
        }
        return found;
      };
      const controlsOf = (el) =>
        (el.matches(ACT) ? [el] : [...el.querySelectorAll(ACT)]).filter(
          (c) => seen(c) && !c.parentElement.closest(ACT) && !isClose(c),
        );
      const isActions = (el) =>
        !el.matches("[class*='chip'],[class*='pill'],[class*='badge'],.ac-chip,.ac-token") &&
        (el.matches(ACT) || Boolean(el.querySelector(ACT))) &&
        loose(el).length === 0;
      for (const row of document.body.querySelectorAll("*")) {
        if (row.closest("svg,pre,code,table,[data-radix-popper-content-wrapper]") || !seen(row)) continue;
        const s = style(row);
        if (!isRow(s)) continue;
        const kids = flow(row);
        if (kids.length < 2) continue;
        const acts = kids.filter((k) => isActions(k) && controlsOf(k).length);
        if (!acts.length) continue;
        for (const t of kids) {
          if (acts.includes(t) || t.matches(ACT)) continue;
          const texts = loose(t);
          // The text node that wraps most, and its one-line length.
          let lines = 0;
          let length = 0;
          let node = null;
          for (const x of texts) {
            const n = new Set(x.rects.map((r) => Math.round(r.top))).size;
            const l = x.rects.reduce((sum, r) => sum + r.width, 0);
            if (n > lines || (n === lines && l > length)) [lines, length, node] = [n, l, x.node];
          }
          if (!node || node.textContent.trim().length < 12 || lines < 3) continue;
          const tr = t.getBoundingClientRect();
          // A wide block that tall is a layout's column (a page beside its sidebar), not words beside their actions.
          if (tr.height > 800 && tr.width > 320) continue;
          // Actions after the words, on their lines: a face or a check before the words is the row's lead.
          const beside = acts.filter((a) => {
            const ar = a.getBoundingClientRect();
            return Math.min(ar.bottom, tr.bottom) - Math.max(ar.top, tr.top) > 4 && ar.left >= tr.right - 2;
          });
          const ctrls = beside.flatMap(controlsOf);
          if (!ctrls.length) continue;
          const rs = ctrls.map((c) => c.getBoundingClientRect());
          const actsW = Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left));
          const share = actsW / row.getBoundingClientRect().width;
          const room = tr.width + actsW + (parseFloat(s.columnGap) || 0);
          const wouldBe = Math.max(1, Math.ceil((length * 1.08) / room));
          if (share >= 0.2 && wouldBe < lines)
            out.push({
              rule: "squeeze",
              node: t,
              el: sig(t),
              box: sig(row),
              lines,
              share: +share.toFixed(2),
              text: words(t),
            });
        }
      }
    },
    /**
     * On a phone, a lone main button fills what holds it (rule 23): the only button in a card, a request's foot, a
     * notice, a dialog's foot, an empty state or a MediaRow's end that went under the row, and a primary, at 90% or
     * more of that box's width inside its padding. One beside a ghost (Cancelar, Ver) is a pair, not lone. Phone
     * widths only (`PHONE_ONLY` in check.ts).
     */
    loneprimary(out) {
      if (innerWidth >= 640) return;
      const HOLDS = ".ac-card,.rq__foot,.outage,.ac-dialog__foot,.ac-empty__actions,.ac-mediarow__end--wrap";
      for (const box of document.querySelectorAll(HOLDS)) {
        if (!seen(box)) continue;
        const buttons = [...box.querySelectorAll(".ac-btn")].filter(
          (b) => seen(b) && b.parentElement.closest(HOLDS) === box,
        );
        const [only] = buttons;
        if (buttons.length !== 1 || !only.matches(".ac-btn--primary")) continue;
        const s = style(box);
        const inside =
          box.getBoundingClientRect().width -
          parseFloat(s.paddingLeft) -
          parseFloat(s.paddingRight) -
          parseFloat(s.borderLeftWidth) -
          parseFloat(s.borderRightWidth);
        const width = only.getBoundingClientRect().width;
        if (width < 0.9 * inside - 0.5)
          out.push({
            rule: "loneprimary",
            node: only,
            el: sig(only),
            box: sig(box),
            share: +(width / inside).toFixed(2),
            text: words(only),
          });
      }
    },
    /**
     * Buttons side by side stand 8 apart (rule 8): two plated ones, or two icon buttons' plates (a glyph's plate is its
     * box less its air, `.ac-btn--glyph`). A ghost with words reads by its words (`.ac-acts`), and the parts of one
     * control (a split button, a segmented control, a token's ×, an event pill's actions, a message's bar) are drawn
     * as one, and so are the strips of format toggles: the composer's and the wiki editor's.
     */
    btngap(out) {
      const kind = (el) => {
        if (!el.matches(".ac-btn")) return null;
        if (!el.matches(".ac-btn--ghost")) return "plate";
        return el.matches(".ac-btn--icon,.ac-btn--glyph") ? "icon" : null;
      };
      const plateOf = (el) => {
        const r = el.getBoundingClientRect();
        if (!el.matches(".ac-btn--glyph")) return r;
        const air = parseFloat(getComputedStyle(el, "::before").left) || 0;
        return { left: r.left + air, right: r.right - air, top: r.top + air, bottom: r.bottom - air };
      };
      const ONE =
        ".ac-split,.ac-seg,.ac-token,.ac-eventpill,.ac-msg__actions,.ac-formatbar,.wiki-bar,[role=menu],[role=menubar],svg";
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.closest(ONE) || !isRow(style(row))) continue;
        const kids = flow(row);
        for (let i = 1; i < kids.length; i++) {
          const [a, b] = [kids[i - 1], kids[i]];
          const k = kind(a);
          if (!k || k !== kind(b)) continue;
          const [ra, rb] = [plateOf(a), plateOf(b)];
          if (!sameLine(ra, rb)) continue;
          const gap = rb.left - ra.right;
          if (Math.abs(gap - 8) > 0.5)
            out.push({
              rule: "btngap",
              node: b,
              el: `${sig(a)} + ${sig(b)}`,
              box: sig(row),
              px: +gap.toFixed(1),
              text: words(b),
            });
        }
      }
    },
    /**
     * A footer's buttons (a dialog's, a viewer's) never split one over the other while they fit side by side there:
     * words before them (the footer's note) took the first row's room. They are one group, beside the words or on a
     * row of their own under them (rule 17).
     */
    btnsplit(out) {
      for (const row of document.body.querySelectorAll(".ac-dialog__foot,.ac-dialog__foot-acts,.ac-details__foot")) {
        if (!seen(row)) continue;
        const s = style(row);
        if (!isRow(s) || !s.flexWrap.startsWith("wrap")) continue;
        const buttons = flow(row).filter((k) => k.matches(".ac-btn"));
        if (buttons.length < 2) continue;
        const rects = buttons.map((b) => b.getBoundingClientRect());
        if (rects.every((r) => sameLine(rects[0], r))) continue;
        const outer = (b, r) =>
          r.width + (parseFloat(style(b).marginLeft) || 0) + (parseFloat(style(b).marginRight) || 0);
        const need =
          buttons.reduce((sum, b, i) => sum + outer(b, rects[i]), 0) +
          (parseFloat(s.columnGap) || 0) * (buttons.length - 1);
        const room = row.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
        if (need <= room + 0.5)
          out.push({
            rule: "btnsplit",
            node: row,
            el: sig(row),
            px: +(room - need).toFixed(1),
            text: words(buttons[0]),
          });
      }
    },
    /**
     * Controls side by side share one height (rule 7): in a toolbar or a page head, and in any row of the kit's
     * controls (a plated button, a select, a field, a date, a filter, a search field, a segmented control), two on one
     * line are as tall as each other.
     */
    toolheight(out) {
      const KIT =
        ".ac-btn:not(.ac-btn--ghost),.ac-select__trigger,.ac-input,.ac-date__trigger,.ac-filtertoggle,.ac-filter,.ac-searchfield,.ac-seg";
      const pairs = new Map();
      const check = (list, box) => {
        for (let i = 1; i < list.length; i++) {
          const [a, b] = [list[i - 1], list[i]];
          const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
          if (!sameLine(ra, rb) || Math.abs(ra.height - rb.height) <= 0.5) continue;
          pairs.set(`${sig(a)} + ${sig(b)} ${sig(box)}`, {
            rule: "toolheight",
            node: b,
            el: `${sig(a)} + ${sig(b)}`,
            box: sig(box),
            px: +(rb.height - ra.height).toFixed(1),
          });
        }
      };
      // By line, then from the start: a line's controls come together, whatever their heights.
      const order = (els) =>
        els
          .map((el) => [el, el.getBoundingClientRect()])
          .sort(([, x], [, y]) => Math.round(x.top) - Math.round(y.top) || x.left - y.left)
          .map(([el]) => el);
      for (const bar of document.querySelectorAll(".ac-toolbar,.ac-pagehead__bar,.ac-pagehead__actions")) {
        if (!seen(bar)) continue;
        const all = [...bar.querySelectorAll(KIT)].filter((el) => seen(el));
        check(
          order(
            all.filter((el) => !all.some((o) => o !== el && o.contains(el))).filter((el) => !el.closest(".ac-menu")),
          ),
          bar,
        );
      }
      for (const row of document.body.querySelectorAll("*")) {
        if (!seen(row) || row.closest(".ac-toolbar,.ac-pagehead__bar,.ac-pagehead__actions,svg")) continue;
        const s = style(row);
        if (!s.display.includes("flex") || s.flexDirection.startsWith("column")) continue;
        const controls = flow(row).filter((k) => k.matches(KIT));
        if (controls.length > 1) check(controls, row);
      }
      out.push(...pairs.values());
    },
    /**
     * A fact keeps its value on one line (rule 17): a value that wraps is a finding, unless its fact is alone on its
     * line and as wide as the strip, which only a value longer than the strip is. A line of facts (`.ac-factline`,
     * a task card's) is held the same: it wraps between facts, never inside one.
     */
    factwrap(out) {
      for (const value of document.querySelectorAll(".ac-facts__value, .ac-factline__fact")) {
        if (!seen(value)) continue;
        const rects = [];
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent.trim()) rects.push(...textRects(n));
        if (lineCount(rects) < 2) continue;
        const item = value.closest(".ac-facts__item, .ac-factline__fact") ?? value;
        const strip = value.closest(".ac-facts, .ac-factline") ?? item;
        const r = item.getBoundingClientRect();
        const alone = [...strip.querySelectorAll(".ac-facts__item, .ac-factline__fact")].every(
          (o) => o === item || !seen(o) || !sameLine(o.getBoundingClientRect(), r),
        );
        if (alone && r.width >= strip.clientWidth - 1) continue;
        out.push({ rule: "factwrap", node: value, el: sig(value), box: sig(strip), text: words(value) });
      }
    },
    /**
     * Desfazer goes at the end of its sentence (rule 18): an undo (`[data-undo]`, or a control reading Desfazer, Refazer,
     * Undo or Redo in a receipt) flows inline in its sentence's block, never a flex or grid item beside the sentence.
     */
    undoinline(out) {
      // One undo of its sentence: a group's own Desfazer tudo stays in its head.
      const UNDO = /^(desfazer|refazer|undo|redo)\b(?!\s+(tudo|all)\b)/i;
      const found = new Set([
        ...document.querySelectorAll("[data-undo]"),
        ...[...document.querySelectorAll("[class*='ag-rc'] :is(button,a,[role=button])")].filter((el) =>
          UNDO.test(words(el)),
        ),
      ]);
      for (const el of found) {
        if (!seen(el)) continue;
        const parent = layoutParent(el);
        if (parent && /flex|grid/.test(style(parent).display))
          out.push({ rule: "undoinline", node: el, el: sig(el), box: sig(parent), text: words(el) });
      }
    },
    /**
     * The working line's own controls (the globe, Ver, the stop) end it at its end from the first frame: one beside
     * words that grow nothing would jump to the end once the time comes in before it.
     */
    barend(out) {
      for (const bar of document.querySelectorAll('.ac-typing[data-active="true"]')) {
        const last = bar.lastElementChild;
        if (!seen(bar) || !last?.matches(".stop-run-wrap, .ac-typing__browser, .ac-typing__see") || !seen(last))
          continue;
        const s = style(bar);
        const end = bar.getBoundingClientRect().right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
        const free = end - last.getBoundingClientRect().right - parseFloat(style(last).marginRight);
        if (free > 1) out.push({ rule: "barend", node: last, el: sig(last), box: sig(bar), px: +free.toFixed(1) });
      }
    },
    /**
     * A count that calls on someone (an unread or waiting count: the sidebar's, the bell's) shows against what is
     * behind it, its fill at least 3:1 (rule 19). A neutral count (`--quiet`) is a fact, not a call.
     */
    countfill(out) {
      const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const rgba = (color) => {
        paint.clearRect(0, 0, 1, 1);
        paint.fillStyle = "#000";
        paint.fillStyle = color;
        paint.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
        return { r, g, b, a: a / 255 };
      };
      const over = (top, under) => ({
        r: top.r * top.a + under.r * (1 - top.a),
        g: top.g * top.a + under.g * (1 - top.a),
        b: top.b * top.a + under.b * (1 - top.a),
        a: 1,
      });
      const luminance = ({ r, g, b }) =>
        [r, g, b]
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      /** What shows behind `el`: its ancestors' fills laid over each other, down to the page's white. */
      const behind = (el) => {
        const layers = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const c = rgba(style(p).backgroundColor);
          if (c.a > 0) layers.push(c);
          if (c.a >= 1) break;
        }
        return layers.reduceRight((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
      };
      for (const count of document.querySelectorAll(".sidebar__unread:not(.sidebar__unread--quiet)")) {
        if (!seen(count) || !visibleText(count)) continue;
        const back = behind(count);
        const fill = over(rgba(style(count).backgroundColor), back);
        const [hi, lo] = [luminance(fill), luminance(back)].sort((x, y) => y - x);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < 3)
          out.push({ rule: "countfill", node: count, el: sig(count), box: placeOf(count), ratio: +ratio.toFixed(2) });
      }
    },
    /**
     * A day's column of the calendar: no item covers another. A stack of routine runs and a meeting that meet sit side
     * by side, and a stack stops before the next item (`runStacks`, `layoutDay`). A meeting reaches down its slot (its
     * `min-height`): what a wrapped title draws past it, the page measures and lays out again (`TimeGrid`'s heights),
     * which a captured screen never ran, so only the slots are held here.
     */
    calstack(out) {
      const slot = (el) => {
        const r = el.getBoundingClientRect();
        const planned = parseFloat(el.style.minHeight);
        return { left: r.left, right: r.right, top: r.top, bottom: planned > 0 ? r.top + planned : r.bottom };
      };
      for (const col of document.body.querySelectorAll(".cal-week__col")) {
        const items = [...col.querySelectorAll(":scope > .cal-chip--block, :scope > .cal-week__runs")].filter(seen);
        for (const [i, a] of items.entries()) {
          const ra = slot(a);
          for (const b of items.slice(i + 1)) {
            const rb = slot(b);
            const across = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const down = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (across > 1 && down > 1)
              out.push({ rule: "calstack", node: b, el: sig(b), box: sig(a), px: +Math.min(across, down).toFixed(1) });
          }
        }
      }
    },
    /**
     * A strip that scrolls sideways on a page (the task board, a row of chips or tabs) runs out over the page's side
     * room (`--page-x`) to the work area's edge, its own padding putting its first item on the page's line: what
     * scrolls slides under the work area's edge. One that stops in that room, on the page's padding line or a ring's
     * width past it, cuts its items in mid-air. Only on a side where the box that frames it (the nearest that clips or
     * shows a surface: the work area, a split's column, a card) meets the work area's edge: in a card or a field it
     * stops at that box's edge, which shows.
     */
    bleed(out) {
      const room = lengthOf("--page-x");
      for (const strip of document.querySelectorAll(".shell__main *")) {
        const s = style(strip);
        if (!/^(auto|scroll)$/.test(s.overflowX) || strip.scrollWidth <= strip.clientWidth + 1) continue;
        if (strip.matches("textarea,input,select") || !seen(strip) || hasSurface(s)) continue;
        const main = strip.parentElement.closest(".shell__main");
        let frame = strip.parentElement;
        while (frame !== main && !hasSurface(style(frame)) && style(frame).overflowX === "visible")
          frame = frame.parentElement;
        const edges = (el) => {
          const left = el.getBoundingClientRect().left + el.clientLeft;
          return { left, right: left + el.clientWidth };
        };
        const area = edges(main);
        const box = edges(frame);
        const r = strip.getBoundingClientRect();
        const short = { left: r.left - box.left, right: box.right - r.right };
        const sides = ["left", "right"].filter(
          (side) => Math.abs(box[side] - area[side]) <= 0.5 && short[side] > 0.5 && short[side] <= room + 0.5,
        );
        if (!sides.length) continue;
        let page = strip;
        while (page.parentElement !== main) page = page.parentElement;
        const px = Math.max(...sides.map((side) => short[side]));
        out.push({
          rule: "bleed",
          node: strip,
          el: sig(strip),
          box: sig(page),
          side: sides.join(" "),
          px: +px.toFixed(1),
        });
      }
    },
  };

  /**
   * With everything rendered: a box skipped by `content-visibility: auto` (a conversation's rows) has its placeholder
   * size in one layout and its own in another, which no CSS order explains.
   */
  /**
   * A picture's own size (an image, a video, a canvas) waits on its file decoding, so the two tabs can catch it at
   * different moments: it is never a tie between two sheets, and `cascadeorder` leaves it out.
   */
  const LOADED = "img,image,video,canvas,iframe,object,embed";
  const orderValue = (el, s, p) =>
    (p === "width" || p === "height") && el.matches(LOADED) ? "" : s.getPropertyValue(p);
  const rendered = (measure) => {
    const pin = document.createElement("style");
    pin.textContent = "*{content-visibility:visible!important}";
    document.head.append(pin);
    try {
      return measure();
    } finally {
      pin.remove();
    }
  };

  window.geometry = {
    /** Puts a captured screen in the page and waits for the type its words use. */
    async load(html) {
      document.body.innerHTML = html;
      // The tests' DOM measures nothing, so a captured popover says it has no room (-24px) and its cap folds it to
      // nothing: it gets the window's, as Radix gives a card on a side with the room.
      for (const w of document.querySelectorAll("[data-radix-popper-content-wrapper]")) {
        if (parseFloat(w.style.getPropertyValue("--radix-popper-available-height")) <= 0)
          w.style.setProperty("--radix-popper-available-height", "calc(100vh - 24px)");
      }
      await document.fonts.ready;
    },
    detect() {
      stackToolbars();
      seenOf = new Map();
      const out = [];
      for (const rule of Object.values(rules)) rule(out);
      return out.map(({ node, ...f }) => (kitOnly(f.el) && kitOnly(f.box) && node ? { ...f, at: placeOf(node) } : f));
    },
    /**
     * `cascadeorder`: one hash per element over what a tie between two sheets can change, for `check.ts` to compare
     * the screen laid out in two CSS orders, then the values of the ones that differ.
     */
    styles() {
      stackToolbars();
      return rendered(() =>
        [...document.body.querySelectorAll("*")].map((el) => {
          const s = getComputedStyle(el);
          let h = 0x811c9dc5;
          for (const p of ORDER_PROPS) {
            const v = orderValue(el, s, p);
            for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
            h = Math.imul(h ^ 0x7c, 16777619);
          }
          return h >>> 0;
        }),
      );
    },
    styleOf(indices) {
      return rendered(() => {
        const all = [...document.body.querySelectorAll("*")];
        const index = new Map(all.map((el, i) => [el, i]));
        return indices.map((i) => {
          const el = all[i];
          const s = getComputedStyle(el);
          const signature = sig(el);
          return {
            el: signature,
            at: kitOnly(signature) ? placeOf(el) : undefined,
            parent: index.get(el.parentElement) ?? -1,
            props: ORDER_PROPS,
            values: ORDER_PROPS.map((p) => orderValue(el, s, p)),
          };
        });
      });
    },
    /**
     * What opens from another layer stacks above it: a profile card (a popover), a popover from it, a confirm dialog from
     * that, a list from the dialog, put in the page in that order as Radix portals them, each over the whole window.
     * The ones that aren't the topmost thing at their center when they open.
     */
    layers() {
      document.body.innerHTML = "";
      const box = (className) => {
        const el = document.createElement("div");
        el.className = className;
        return el;
      };
      // Radix's popper: the content in a fixed wrapper that takes the content's own z-index.
      const floating = (className) => {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-radix-popper-content-wrapper", "");
        wrapper.style.cssText = "position: fixed; inset: 0";
        const content = box(className);
        content.style.cssText = "width: 100%; height: 100%; max-width: none; max-height: none";
        wrapper.append(content);
        document.body.append(wrapper);
        wrapper.style.zIndex = getComputedStyle(content).zIndex;
        return content;
      };
      const dialog = () => {
        const panel = box("ac-dialog");
        panel.style.height = "240px";
        document.body.append(box("ac-dialog__scrim"), panel);
        return panel;
      };
      const onTop = (el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit !== null && el.contains(hit);
      };
      const under = [];
      for (const [name, open] of [
        ["a card", () => floating("ac-menu ac-popover profile-card")],
        ["a popover from the card", () => floating("ac-menu ac-popover")],
        ["a dialog from the popover", dialog],
        ["a list from the dialog", () => floating("ac-menu ac-menu--select")],
      ])
        if (!onTop(open())) under.push(name);
      document.body.innerHTML = "";
      return under;
    },
  };
})();
