import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

/**
 * A border that lights up along whichever edge the pointer is near.
 *
 * Vendored from react-bits rather than depended on: react-bits hands out
 * components to paste and is not a package, so there is no version to install.
 * The original is
 * `src/ts-tailwind/Components/BorderGlow/BorderGlow.tsx` at
 * https://github.com/DavidHDev/react-bits, and it comes with its own licence —
 * MIT plus the Commons Clause License Condition v1.0, Copyright (c) 2026 David
 * Haz. That clause allows the components to be used as part of an application
 * (commercially included) but forbids selling, sublicensing or redistributing
 * the components themselves; the copy is therefore **not** covered by this
 * repository's own MIT licence. See `NOTICE` at the repository root.
 *
 * It is not the original file. Written on top of the copy are the changes this
 * repository's tokens and layout rules force, each marked below and each
 * argued in `docs/adr/0021-视频卡片改用-react-bits-的-BorderGlow.md`:
 *
 * 1. Every value the original's own demo picks per colour mode is a token here.
 *    The demo asks React for the colour mode (`BorderGlowDemo.jsx`, the four
 *    `useColorModeValue` calls); this repository switches themes in
 *    `[data-theme]` without React knowing (ADR 0018), so the same values live
 *    in `style.css` beside the two blend modes. The original's own
 *    `isLightColor` branch went the same way — it read the background as a hex
 *    literal, and a token is not one.
 * 2. Colours are read through `color-mix`, which takes any colour expression.
 *    That is what lets `glowColor`, the glow's strength and the fill's opacity
 *    be tokens, where the original needed three numbers it could parse out of
 *    an `hsl()`.
 * 3. The root writes its corner radius and nothing else: its background, its
 *    border colour and its elevation arrive as the caller's classes, so
 *    `box-shadow` keeps one writer (ADR 0008) instead of gaining an inline one
 *    here. The original wrote all four inline, and decided three of them from
 *    the background's lightness.
 * 4. The children are not wrapped in an `overflow` box. The original clipped
 *    them with `overflow-auto`; nothing here needs that box, because the card
 *    inside clips itself where it actually needs to. What that box also did,
 *    though, is `min-w-0` — an item whose own `overflow` is not `visible` has
 *    an automatic minimum size of zero, and the wrapper is a grid item of the
 *    root — so the wrapper keeps that explicitly below. Without it a card is
 *    widened by whatever cannot wrap inside it and paints over its neighbour.
 * 5. `animated` is not carried over: it swept the border once on mount, and a
 *    page of 24 cards would each replay it (ADR 0008).
 * 6. The glow is thrown 10px rather than 40. It is the one value here that is
 *    neither the demo's nor a token: it is how much room the clip around the
 *    cards gives it. See the prop default below.
 * 7. The shadow table's blurs are spaced to that reach, where the demo's ran
 *    out to 50px. At 10px a 50px blur is only its own tail, and light with no
 *    edge in it reads as a smudge rather than a lit edge — worst of all at a
 *    rounded corner, where the throw also fills the notch the radius cuts out
 *    of the card's box. See the table below.
 * 8. The lit border is drawn from a span *above* the children rather than
 *    below them. Upstream's mesh ring sits under the children and shows in the
 *    one pixel they do not cover, which holds for the demo's plain card and
 *    fails for an opaque one: a card whose surface is a picture covers its own
 *    edge, and the ring has nowhere left to show. Two consequences worth
 *    knowing: the mesh and the fill (the layers at `-z-[1]`) are covered by the
 *    card here and contribute nothing, and the lit edge is upstream's own
 *    inset shadows rather than its ring. See the span near the end.
 * 9. `borderRadius` takes a CSS length as well as a number, so the caller can
 *    name a token instead of a figure. The default is still the demo's 28, and
 *    the application's card now passes the number 10 — a figure it picked by
 *    eye, see `VideoCard` — but the prop stays open, because the value it is
 *    likeliest to be asked for next is one of the theme's radii, and
 *    `@theme inline` resolves those into the utilities and leaves no variable
 *    behind to point at: the card's own radius was written as
 *    `calc(var(--radius) - 2px)` when it was one.
 * 10. The mesh is one hue rather than the demo's three. Upstream spreads
 *    violet, pink and sky over the seven points and keeps all three in both
 *    colour modes; the application uses none of those hues anywhere else, so a
 *    hovered card set them beside its own red and the light read as coloured
 *    rather than as light. The mesh, the fill, the border and the throw all
 *    take `--glow-color` now, which the theme points at its `--primary`. The
 *    seven positions and their seven opacities are untouched. See `THEME_MESH`.
 */

interface BorderGlowProps {
  children?: ReactNode;
  className?: string;
  edgeSensitivity?: number;
  glowColor?: string;
  backgroundColor?: string;
  /** A number is read as pixels; a string is written as given, which is how a
   *  caller names a token rather than a figure (see the header, change 9). */
  borderRadius?: number | string;
  glowRadius?: number;
  coneSpread?: number;
  colors?: string[];
}

const GRADIENT_POSITIONS = [
  '80% 55%',
  '69% 34%',
  '8% 6%',
  '41% 38%',
  '86% 85%',
  '82% 18%',
  '51% 4%',
];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

/**
 * The mesh colours, which are the last of the demo's choices to go.
 *
 * The demo spreads violet, pink and sky over the seven points and keeps them
 * the same in both colour modes, so upstream they are literals. Here they are
 * the glow's own hue — one colour, not three — because those three hues are
 * three the application does not otherwise use, and a hovered card put all of
 * them beside its own `--primary` red. The light read as coloured rather than
 * as light (see the header, change 10).
 *
 * One colour is enough for the mesh to work: the seven gradients are at seven
 * positions with seven different opacities, so the ring still varies along its
 * length. All this gives up is the variation *between* hues, which is the part
 * that was wrong.
 */
const THEME_MESH = ['var(--glow-color)'];

function buildMeshGradients(colors: string[]): string[] {
  const gradients: string[] = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    gradients.push(
      `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`,
    );
  }
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`);
  return gradients;
}

/**
 * The glow, as one table of stacked shadows: the `inset` rows paint inside the
 * border box and are what lights the border up, the rest paint outside it and
 * are the halo. Each row is `x y blur spread alpha`.
 *
 * Two things are the demo's shape and not the demo's numbers. The numbers:
 * its blurs ran out to 50px because its glow is thrown 40. This one is thrown
 * ten (`glowRadius`), and at that reach a 50px blur is nothing but its own
 * tail — the light arrived as a haze with no edge in it, which is what made a
 * corner look smudged rather than lit. The blurs are spaced to the reach
 * instead: `docs/adr/0021`.
 *
 * The table is also drawn from two elements rather than one, because the two
 * halves have to sit on opposite sides of the card — see the header.
 *
 * The original wrote each row as `hsl(h s% l% / a%)`, built from three numbers
 * it had parsed out of `glowColor` — which means the colour had to be a
 * literal, and the strength had to be a number this function multiplied in.
 * `color-mix` takes any colour expression, `var()` included, and clamps a
 * percentage past 100% by itself, so both can be the theme's and the theme
 * switch costs nothing here.
 */
const SHADOW_LAYERS: [number, number, number, number, number, boolean][] = [
  [0, 0, 0, 1, 100, true],
  [0, 0, 2, 0, 70, true],
  [0, 0, 4, 0, 45, true],
  [0, 0, 8, 0, 25, true],
  [0, 0, 0, 1, 100, false],
  [0, 0, 2, 0, 70, false],
  [0, 0, 4, 0, 48, false],
  [0, 0, 8, 0, 26, false],
  [0, 0, 10, 0, 12, false],
];

function buildBoxShadow(glowColor: string, inset: boolean): string {
  return SHADOW_LAYERS.filter((layer) => layer[5] === inset)
    .map(
      ([x, y, blur, spread, alpha]) =>
        `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px color-mix(in oklab, ${glowColor} calc(${alpha}% * var(--glow-intensity)), transparent)`,
    )
    .join(', ');
}

/** The original's two fades: quick to arrive, slow to go. */
const FADE_IN = 'opacity 0.25s ease-out';
const FADE_OUT = 'opacity 0.75s ease-in-out';

/**
 * The defaults are the demo's. The exceptions are the two surfaces — the card
 * wears the app's own `--card` and the theme's own glow, so the component is
 * not the place either colour is chosen — and the glow's reach.
 *
 * `glowRadius` is the whole of how far the light is thrown, and it is a layout
 * fact rather than a taste: the scroll viewport that clips the cards keeps
 * `videoCardBox.hoverRoom` on its start edges, and anything the glow reaches
 * past that is cut flat — a lit edge ending in a straight line reads as a
 * blocked light, not a bright one. The demo can throw 40px because nothing
 * clips it. Measured at 40 here, the cut lands where the glow is still at its
 * brightest (`docs/adr/0021`).
 */
export function BorderGlow({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = 'var(--glow-color)',
  backgroundColor = 'var(--card)',
  borderRadius = 28,
  glowRadius = 10,
  coneSpread = 25,
  colors = THEME_MESH,
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [cursorAngle, setCursorAngle] = useState(45);
  const [edgeProximity, setEdgeProximity] = useState(0);

  const getCenterOfElement = useCallback((el: HTMLElement) => {
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  // How close to an edge the pointer is, as 0 at the middle and 1 on the edge.
  const getEdgeProximity = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      let kx = Infinity;
      let ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement],
  );

  // Which way the lit cone points: the pointer's bearing from the centre.
  const getCursorAngle = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return 0;
      const radians = Math.atan2(dy, dx);
      let degrees = radians * (180 / Math.PI) + 90;
      if (degrees < 0) degrees += 360;
      return degrees;
    },
    [getCenterOfElement],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setEdgeProximity(getEdgeProximity(card, x, y));
      setCursorAngle(getCursorAngle(card, x, y));
    },
    [getEdgeProximity, getCursorAngle],
  );

  // The edge answers a little later than the glow does: the cone has to be
  // mostly on the pointer's edge before the border colours in.
  const colorSensitivity = edgeSensitivity + 20;
  const borderOpacity = isHovered
    ? Math.max(
        0,
        (edgeProximity * 100 - colorSensitivity) / (100 - colorSensitivity),
      )
    : 0;
  const glowOpacity = isHovered
    ? Math.max(
        0,
        (edgeProximity * 100 - edgeSensitivity) / (100 - edgeSensitivity),
      )
    : 0;

  const meshGradients = buildMeshGradients(colors);
  const borderBg = meshGradients.map((g) => `${g} border-box`);
  const fillBg = meshGradients.map((g) => `${g} padding-box`);
  const angleDeg = `${cursorAngle.toFixed(3)}deg`;
  const coneMask = `conic-gradient(from ${angleDeg} at center, black ${coneSpread}%, transparent ${coneSpread + 15}%, transparent ${100 - coneSpread - 15}%, black ${100 - coneSpread}%)`;

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      // The root paints little on its own: the radius, which is the one value
      // the original also wrote here, so the decoration around it can inherit
      // the curve. Its background, its border colour and its elevation are the
      // caller's classes, which is how a theme change reaches them and how
      // `box-shadow` keeps a single writer (ADR 0008).
      className={`relative grid isolate border ${className}`}
      style={{
        borderRadius:
          typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      }}
    >
      {/* The mesh, worn as a border: the padding box is filled with the card's
          own background so only the border ring shows the gradient, and a cone
          pointing at the pointer decides which part of that ring is lit. */}
      <div
        className="pointer-events-none absolute inset-0 -z-[1] rounded-[inherit]"
        style={{
          border: '1px solid transparent',
          background: [
            `linear-gradient(${backgroundColor} 0 100%) padding-box`,
            'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
            ...borderBg,
          ].join(', '),
          opacity: borderOpacity,
          maskImage: coneMask,
          WebkitMaskImage: coneMask,
          transition: isHovered ? FADE_IN : FADE_OUT,
        }}
      />

      {/* The same mesh again, bled inwards from the edges rather than drawn on
          them, so the lit edge has some depth behind it. */}
      <div
        className="glow-fill-blend pointer-events-none absolute inset-0 -z-[1] rounded-[inherit]"
        style={
          {
            border: '1px solid transparent',
            background: fillBg.join(', '),
            maskImage: [
              'linear-gradient(to bottom, black, black)',
              'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
              'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
              `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
            ].join(', '),
            WebkitMaskImage: [
              'linear-gradient(to bottom, black, black)',
              'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
              'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
              'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
              `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
            ].join(', '),
            maskComposite: 'subtract, add, add, add, add, add',
            WebkitMaskComposite:
              'source-out, source-over, source-over, source-over, source-over, source-over',
            // The pointer's share of the fill's opacity. The theme's share is
            // `--glow-fill-opacity`, and `.glow-fill-blend` multiplies the two.
            '--fill-strength': borderOpacity,
            transition: isHovered ? FADE_IN : FADE_OUT,
          } as CSSProperties
        }
      />

      {/* The light thrown past the edge — the halo. The mask is a narrow cone
          at the pointer's bearing, so the throw only appears where the border
          lit up; the shadow itself is the inner span's, and the outer span's
          job is to be the box that mask clips. */}
      <span
        className="glow-blend pointer-events-none absolute z-[1] rounded-[inherit]"
        style={
          {
            inset: `${-glowRadius}px`,
            maskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
            WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
            opacity: glowOpacity,
            transition: isHovered ? FADE_IN : FADE_OUT,
          } as CSSProperties
        }
      >
        <span
          className="absolute rounded-[inherit]"
          style={{
            inset: `${glowRadius}px`,
            boxShadow: buildBoxShadow(glowColor, false),
          }}
        />
      </span>

      {/* The lit border itself, which is the half of the glow that says *this
          edge*, and it has to be drawn above the children to be seen at all.
          Upstream puts its mesh ring below them, which works when the caller's
          card is the plain surface the demo draws — the ring shows in the one
          pixel the surface does not cover. A card that is a picture is opaque
          to its own edge, so here the ring would be covered by the very thing
          it is drawn around. This span is upstream's own inset shadows, on the
          near side of the card, where the card cannot hide them.

          `inset: -1px` puts its box on the root's border box, so what lights
          up is the card's own border rather than a second line just inside it,
          and the cone is the mesh's wide one rather than the throw's narrow
          one: the border is meant to light along the whole arc the pointer is
          nearest, not in a wedge. */}
      <span
        className="glow-blend pointer-events-none absolute z-[2] rounded-[inherit]"
        style={
          {
            inset: '-1px',
            maskImage: coneMask,
            WebkitMaskImage: coneMask,
            opacity: borderOpacity,
            transition: isHovered ? FADE_IN : FADE_OUT,
            boxShadow: buildBoxShadow(glowColor, true),
          } as CSSProperties
        }
      />

      {/* Not `overflow-auto` as upstream had it, and not an `overflow` box of
          any kind: the card inside clips itself, so a clipping box here would
          only be a second place the edges are decided. `min-w-0` is the half of
          that box worth keeping — the root is a grid container, this is its
          item, and an item's automatic minimum size is its content's unless it
          says otherwise, so a name that cannot wrap would widen the card past
          its column and out over its neighbour (see the header). The radius is
          passed through rather than repeated, so the card inside can curve its
          own corners to match the root's without a second copy of the number. */}
      <div className="relative z-[1] flex min-w-0 flex-col rounded-[inherit]">
        {children}
      </div>
    </div>
  );
}
