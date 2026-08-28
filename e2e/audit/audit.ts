/**
 * What a screenshot cannot tell you, measured in the page instead.
 *
 * The audit's other half. A picture proves a screen exists and shows what it
 * feels like; it cannot tell you that a label is at 2.9:1, that a button is
 * 31px tall, or that a panel is 6px wider than the phone. Those are facts
 * about the live DOM, and this is the script that goes and reads them — run
 * inside the browser, once per screen, alongside the shot of that screen.
 *
 * Deliberately NOT a pixel diff. Baselines differ between this machine and
 * CI's renderer, and a picture that changed tells you nothing about whether
 * it changed for the better. Every finding below is a number with a
 * published bar next to it.
 */

/** One thing wrong on one screen. */
export type Finding = {
  /** `contrast` | `tap-target` | `overflow` | `clipped` */
  readonly kind: string;
  /** Where, as the closest thing to a selector the element can offer. */
  readonly where: string;
  /** What the element says, trimmed — so a finding can be found by eye. */
  readonly text: string;
  readonly detail: string;
  /** Measured value and the bar it missed, for sorting by how bad. */
  readonly value: number;
  readonly bar: number;
};

/**
 * The whole audit, as one function to `page.evaluate`.
 *
 * Written as a single self-contained expression on purpose: it is serialised
 * into the page, so it may not close over anything in the test file and may
 * not import. Everything it needs is defined inside it.
 */
export const AUDIT_IN_PAGE = (): Finding[] => {
  const findings: Finding[] = [];

  /** WCAG relative luminance, over an already-composited sRGB triple. */
  const luminance = ([r, g, b]: readonly [number, number, number]): number => {
    const lin = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }) as [number, number, number];
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };

  const ratio = (a: readonly [number, number, number], b: readonly [number, number, number]) => {
    const x = luminance(a);
    const y = luminance(b);
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return (hi + 0.05) / (lo + 0.05);
  };

  /** `rgb(…)` / `rgba(…)` → a triple plus its alpha. */
  const parse = (css: string): { rgb: [number, number, number]; a: number } | null => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(css);
    if (m === null) return null;
    return {
      rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  };

  const over = (
    fg: [number, number, number],
    bg: [number, number, number],
    a: number,
  ): [number, number, number] => [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];

  /**
   * Whether anything between this element and its opaque ground is a
   * background IMAGE — art, or the canvas showing through.
   *
   * The one thing this file cannot measure. A ratio needs two colours, and a
   * picture is not a colour: the end screen's hero sits on `--run-end-art`
   * scrimmed at 55–78% of the theme background, which is a deliberate design
   * with a documented polarity fix, and the first version of this audit
   * passed it silently because it had composited the CSS colours and never
   * noticed the PNG. Passing by luck and passing by measurement look
   * identical in a report, which is the worst property a report can have —
   * so those elements are named as UNMEASURED instead.
   */
  const imaged = (el: Element): boolean => {
    let node: Element | null = el;
    while (node !== null) {
      const style = getComputedStyle(node);
      // `url(...)` only. A CSS GRADIENT is not this problem: every button in
      // the game has one, they are built from theme tokens with known ends,
      // and flagging them turned the first run of this check into 2,772 rows
      // of "look at the picture". A PNG is the case with no colours in it at
      // all.
      if (/url\(/.test(style.backgroundImage)) return true;
      const bg = parse(style.backgroundColor);
      if (bg !== null && bg.a >= 0.999) return false;
      node = node.parentElement;
    }
    return false;
  };

  /**
   * The colour actually BEHIND an element.
   *
   * Walks up compositing every semi-transparent layer it meets, because a
   * panel at 0.92 over a board is not the panel's own colour and reading the
   * declared value would report a contrast nobody sees. Stops at the first
   * fully opaque ancestor.
   */
  const behind = (el: Element): [number, number, number] => {
    const layers: { rgb: [number, number, number]; a: number }[] = [];
    let node: Element | null = el;
    while (node !== null) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg !== null && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    // The page's own ground when nothing opaque was found on the way up —
    // read rather than assumed. A hardcoded torchlit black here would have
    // reported daylight's chrome against the wrong ground entirely, which is
    // the class of bug this whole audit exists to catch.
    const root =
      parse(getComputedStyle(document.body).backgroundColor) ??
      parse(getComputedStyle(document.documentElement).backgroundColor);
    let out: [number, number, number] =
      root !== null && root.a > 0 ? root.rgb : ([10, 8, 6] as [number, number, number]);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer === undefined) continue;
      out = over(layer.rgb, out, layer.a);
    }
    return out;
  };

  /** A name a human can act on: id if it has one, else tag plus classes. */
  const nameOf = (el: Element): string => {
    if (el.id !== '') return `#${el.id}`;
    const cls = el.className;
    const classes =
      typeof cls === 'string' && cls !== '' ? `.${cls.trim().split(/\s+/).join('.')}` : '';
    const parent = el.parentElement;
    const owner = parent !== null && parent.id !== '' ? `#${parent.id} > ` : '';
    return `${owner}${el.tagName.toLowerCase()}${classes}`;
  };

  const shown = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) < 0.1) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
  };

  /** Text this element owns itself, rather than text its children own. */
  const ownText = (el: Element): string => {
    let out = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? '';
    }
    return out.trim();
  };

  const all = Array.from(document.querySelectorAll('body *'));

  // 1. CONTRAST. WCAG's own bars — 4.5:1 for text, 3:1 for large text, which
  //    is 24px, or 18.66px when bold. Exactly the numbers `contrast.test.ts`
  //    spends on the board's palette; this spends them on the chrome, which
  //    that file has never been able to see.
  for (const el of all) {
    const text = ownText(el);
    if (text === '' || !shown(el)) continue;
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    if (fg === null) continue;
    const ground = behind(el);
    // A colour with its own alpha is composited on its ground first: the
    // faint stamp at the foot of the screen is `opacity` on the ELEMENT and
    // alpha in the colour both, and reading the raw value flatters it.
    const ink = over(fg.rgb, ground, fg.a * Number(style.opacity === '' ? 1 : style.opacity));
    const px = parseFloat(style.fontSize);
    const bold = Number(style.fontWeight) >= 700 || style.fontWeight === 'bold';
    const bar = px >= 24 || (bold && px >= 18.66) ? 3 : 4.5;
    const got = ratio(ink, ground);

    if (imaged(el)) {
      // Named, not judged. The number below would be a ratio against a
      // colour this text is not actually sitting on.
      findings.push({
        kind: 'unmeasured',
        where: nameOf(el),
        text: text.slice(0, 60),
        detail: 'sits on a background image or gradient — read the screenshot for this one',
        value: 0,
        bar: 0,
      });
      continue;
    }

    if (got < bar) {
      // A DISABLED control is its own class of finding. WCAG 1.4.3 exempts
      // them outright, and a control that is dimmed BECAUSE it cannot be
      // used is doing its job — but the shop's unaffordable rows still have
      // to say what they cost, or "save up for this" is a message the player
      // cannot read. Reported, and reported separately, so the two decisions
      // do not get made together.
      const off =
        (el as HTMLButtonElement).disabled === true ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.closest('[disabled], [aria-disabled="true"]') !== null;
      findings.push({
        kind: off ? 'contrast-disabled' : 'contrast',
        where: nameOf(el),
        text: text.slice(0, 60),
        detail: `${style.color} on rgb(${ground.map(Math.round).join(', ')}) at ${px}px`,
        value: Math.round(got * 100) / 100,
        bar,
      });
    }
  }

  // 2. TAP TARGETS. 44px is Apple's floor and this game is a phone game held
  //    in one hand; a control under it is one you miss. Anything the page has
  //    marked inert is not what this is about.
  //
  //    The INVISIBLE half has to be counted or this whole check is noise.
  //    style.css grows a control's touch target with a transparent `::before`
  //    at `max(100%, 44px)` — deliberately, so the camera stack and the
  //    colour chips can stay visually small without becoming hard to hit
  //    ("hierarchy, not smaller things"). The first run of this audit did not
  //    know that and reported 351 misses, every one of them on a control that
  //    is already 44px to a thumb. `getBoundingClientRect` cannot see a
  //    pseudo-element, so the pseudo's own computed box is read and unioned
  //    in.
  const targetBox = (el: Element): { w: number; h: number } => {
    const box = el.getBoundingClientRect();
    let w = box.width;
    let h = box.height;
    // BOTH pseudos. Reading only `::before` is how this audit reported the
    // HUD stats as 36px misses and nearly bought a redundant stylesheet rule
    // to "fix" them: they have carried a grown target since 2026-08-21 as
    // `.stat::after { inset: -6px }` — sized against the row's own gap so
    // neighbouring targets meet exactly and never cross, which is a more
    // careful answer than this block's blanket 44px, not a worse one.
    for (const which of ['::before', '::after'] as const) {
      const pseudo = getComputedStyle(el, which);
      // A pseudo that is not there computes to `none`, and its width/height
      // parse as NaN — both lose every comparison below, which is the answer
      // we want.
      if (pseudo.content === 'none') continue;
      const pw = parseFloat(pseudo.width);
      const ph = parseFloat(pseudo.height);
      if (Number.isFinite(pw)) w = Math.max(w, pw);
      if (Number.isFinite(ph)) h = Math.max(h, ph);
    }
    return { w, h };
  };

  for (const el of document.querySelectorAll('button, [role="button"], summary')) {
    if (!shown(el) || el.closest('[inert]') !== null) continue;
    const box = targetBox(el);
    // ROUNDED before comparing. A layout that comes out at 43.98px is 44px to
    // every thumb alive, and the un-rounded comparison reported COST as a
    // miss at "44 (bar 44)" — a row that reads as a typo and teaches a reader
    // to distrust the rest of the table. False precision is worse than no
    // precision in a report someone has to act on.
    const small = Math.round(Math.min(box.w, box.h));
    if (small < 44) {
      findings.push({
        kind: 'tap-target',
        where: nameOf(el),
        text: (el.textContent ?? '').trim().slice(0, 60),
        detail: `${Math.round(box.w)}×${Math.round(box.h)}px, pseudo-target included`,
        value: Math.round(small),
        bar: 44,
      });
    }
  }

  // 3. OVERFLOW. The page must never scroll sideways on a phone — the one
  //    layout failure that makes a game feel broken rather than ugly.
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    findings.push({
      kind: 'overflow',
      where: ':root',
      text: '',
      detail: `the page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport`,
      value: doc.scrollWidth,
      bar: doc.clientWidth,
    });
  }

  // 4. CLIPPED TEXT. An element whose own content is wider or taller than the
  //    box drawn for it, with nothing set to let it scroll or wrap — a label
  //    cut in half says something different from what it was written to say.
  for (const el of all) {
    if (ownText(el) === '' || !shown(el)) continue;
    const style = getComputedStyle(el);
    if (style.overflow !== 'hidden' && style.overflowX !== 'hidden') continue;
    const cut = Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight);
    if (cut > 2) {
      findings.push({
        kind: 'clipped',
        where: nameOf(el),
        text: ownText(el).slice(0, 60),
        detail: `${cut}px of content is cut off`,
        value: cut,
        bar: 2,
      });
    }
  }

  return findings;
};
