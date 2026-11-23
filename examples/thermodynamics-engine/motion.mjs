// Everything that moves, drawn straight into screen space.
//
// The parts are generated from the crank angle and the projection the figure
// was fitted with, so the same numbers drive the still and the running page:
// the builder calls this once, the page calls it every frame. Each outline is
// projected point by point rather than pushed through an SVG transform, which
// keeps the geometry exact at any angle and lets a part be dropped into the
// drawing at the one place it must appear.
//
// The engine is an alpha machine of the "open trunk" kind: each barrel stands
// on a crosshead guide, and the barrel is cut away on the near side so the
// crown, the gas above it and the rod can be seen working.

import { AREA_HOT, travelOf, volumesOf } from "./model.mjs";

export const OPEN = 78;
export const AZIMUTH = 40;

export const RIG = {
  floorZ: 113,
  hotX: -58,
  coldX: 58,
  cylY: -10,
  shaftZ: 206,
  topZ: 262,
  crankR: 19,
  rodL: 72,
  crownAtTdc: 226,
  boreR: 20,
  pistonDepth: 34,
  wheel: { x0: -176, x1: -156, r: 58, rim: 44, hub: 16, shaftZ: 206 },
};

const TAU = Math.PI * 2;
const RADIANS = Math.PI / 180;
const round = (value) => Math.round(value * 10) / 10;
const pathOf = (points, closed = false) =>
  points.map(([x, y], index) => `${index ? "L" : "M"}${round(x)} ${round(y)}`).join("") + (closed ? "Z" : "");

/* ------------------------------------------------------------------ the projection */

// The figures are fitted by the kit's camera; this is the same arithmetic,
// carried in the page so it can project without the kit.
export function projectorOf(P) {
  const a = (P.azimuth * Math.PI) / 180;
  const e = (P.elevation * Math.PI) / 180;
  return {
    origin: P.origin,
    k: P.scale * Math.sqrt(1.6),
    sinA: Math.sin(a),
    cosA: Math.cos(a),
    sinE: Math.sin(e),
    cosE: Math.cos(e),
  };
}

export const screenOf = (proj) => ([x, y, z]) => [
  proj.origin[0] + (x * proj.sinA - y * proj.cosA) * proj.k,
  proj.origin[1] + ((x * proj.cosA + y * proj.sinA) * proj.sinE - z * proj.cosE) * proj.k,
];

// A circle of radius r about an axis parallel to x, at x = x0, in the plane of
// (y, z): used for every disc, crown and pin, so they all taper in step.
// The gas in the bore, seen as a solid column: the top disk's far arc, the
// bottom disk's near arc, and the two points where the bore's round silhouette
// runs down between them. The disks lie in the horizontal plane; the tangents
// sit a quarter turn either side of the view's own azimuth, so the column is
// exactly as wide as the bore looks.
function columnPoints(project, x0, y0, z0, z1, r, steps = 26, azimuth = AZIMUTH) {
  const at = (a, z) => project([x0 + r * Math.cos(a), y0 + r * Math.sin(a), z]);
  const far = (azimuth + 90) * RADIANS;
  const near = (azimuth - 90) * RADIANS;
  const arc = (from, to, z) =>
    Array.from({ length: steps + 1 }, (_, index) => at(from + ((to - from) * index) / steps, z));
  return [...arc(far, far + Math.PI, z0), ...arc(near, near + Math.PI, z1)];
}

const circleAt = (project, x0, y0, z0, r, steps = 40, phase = 0) =>
  Array.from({ length: steps }, (_, index) => {
    const a = phase + (index / steps) * TAU;
    return project([x0, y0 + r * Math.cos(a), z0 + r * Math.sin(a)]);
  });

/* ------------------------------------------------------------------ the crank */

// The model measures its slider along z from the shaft, the pin running a
// circle of crankR about the shaft's centre. That circle is reported here in
// the shaft plane's own (y, z): one crank radius down the +y axis at θ = 0.
export const pinOf = (theta) => [RIG.crankR * Math.sin(theta), RIG.shaftZ + RIG.crankR * Math.cos(theta)];

export const crownOf = (theta) => RIG.crownAtTdc - 2 * RIG.crankR * travelOf(theta);

/* ------------------------------------------------------------------ the wheel */

// Six spokes, seen in the wheel's plane at its far face: a plate per spoke, so
// a spoke on the far side of the hub reads behind the one on the near side.
export function spokes(project, theta) {
  const { wheel } = RIG;
  const out = [];
  for (let index = 0; index < 6; index++) {
    const a = theta + (index / 6) * TAU;
    const across = [Math.cos(a), Math.sin(a)];
    const along = [-Math.sin(a), Math.cos(a)];
    const quad = [
      [wheel.hub - 1, -5.6],
      [wheel.rim + 1, -3.2],
      [wheel.rim + 1, 3.2],
      [wheel.hub - 1, 5.6],
    ].map(([r, s]) =>
      project([wheel.x1, across[0] * r + along[0] * s, wheel.shaftZ + across[1] * r + along[1] * s]),
    );
    const d = pathOf(quad, true);
    out.push({ quad: d, far: Math.sin(a) < 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ the throw */

export function throwSvg(project, x0, theta) {
  const cheek = circleAt(project, x0, 0, RIG.shaftZ, 12, 28);
  const back = theta + Math.PI;
  const weight = [];
  for (let index = 0; index <= 14; index++) {
    const a = back - 0.85 + (index / 14) * 1.7;
    weight.push(project([x0, 23 * Math.cos(a), RIG.shaftZ + 23 * Math.sin(a)]));
  }
  for (let index = 14; index >= 0; index--) {
    const a = back - 0.68 + (index / 14) * 1.36;
    weight.push(project([x0, 11 * Math.cos(a), RIG.shaftZ + 11 * Math.sin(a)]));
  }
  const [pinY, pinZ] = pinOf(theta);
  const pin = circleAt(project, x0 - 15, pinY, pinZ, 7.2, 22);
  return (
    `<path class="iso-fill" d="${pathOf(weight, true)}"/>` +
    `<path class="iso-shade" data-shade="2" d="${pathOf(weight, true)}"/>` +
    `<path class="iso-fill" d="${pathOf(cheek, true)}"/>` +
    `<path class="iso-top" d="${pathOf(pin, true)}"/>` +
    `<path class="iso-line" data-tone="hi" d="${pathOf(cheek, true)}"/>` +
    `<path class="iso-line" data-tone="lo" d="${pathOf(weight, true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${pathOf(pin, true)}"/>`
  );
}

/* ------------------------------------------------------------------ the rod */

// A shank with an eye at each end, drawn between the crank pin and the
// crosshead pin in the plane of (y, z).
function rodSvg(project, x0, from, to) {
  const a = project([x0, from[0], from[1]]);
  const b = project([x0, to[0], to[1]]);
  const base = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const big = 9.6;
  const small = 5.6;
  const arc = (c, r, from2, to2) =>
    Array.from({ length: 13 }, (_, index) => {
      const t = from2 + ((to2 - from2) * index) / 12;
      return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
    });
  const outline = [...arc(a, big, base + 1.3, base + TAU - 1.3), ...arc(b, small, base - 1.3, base + 1.3)];
  return { outline, a, b, big, small };
}

/* ------------------------------------------------------------------ inside a barrel */

// The gas above the crown, the crown and the skirt of the trunk piston, and the
// rod down to the crank pin. The builder drops this in after the barrel's own
// metal: the section has taken the near wall away, so what is in the bore is
// simply drawn in the opening it left, and the head behind it closes the top.
export function barrelInnerSvg(P, name, theta) {
  const project = screenOf(projectorOf(P));
  const x0 = name === "hot" ? RIG.hotX : RIG.coldX;
  const angle = name === "hot" ? theta : theta - Math.PI / 2;
  const { cylY, pistonDepth, boreR, topZ } = RIG;
  const crown = crownOf(angle);
  // The barrel is cut on its near quadrant, and the section exposes the piston
  // as a slice, not a round. In 3D the crown is a disk; what the cut leaves of
  // it is the disk's face across the cut plane, its far arc seen end-on, and the
  // near wall of the skirt falling from its near edge to the floor.
  //   a horizontal circle round the bore at height z, from angle `from` by `span`
  const round = (r, z, from, span, steps) =>
    Array.from({ length: steps + 1 }, (_, index) => {
      const a = from + (span * index) / steps;
      return project([x0 + r * Math.cos(a), cylY + r * Math.sin(a), z]);
    });
  const bore = boreR - 1.2;
  // how much of the trunk the section shows: the crown's depth, cut short at
  // the bore's floor if the piston has come all the way down
  const skirt = Math.max(crown - pistonDepth * 0.62, RIG.floorZ + 4);
  const phi0 = (AZIMUTH * Math.PI) / 180;
  // the crown's face: the whole disk, flat in the horizontal plane, which is
  // the one surface of the piston the eye looks straight at
  const top = round(bore, crown, 0, TAU, 44);
  // the skirt: the near half of the trunk, shut at the top by the crown's rim and
  // at the foot by the floor. The half ends at the two points where the bore's
  // round turns away from the eye, so it is exactly as wide as the bore looks.
  const body = [
    ...round(bore, crown, phi0 - Math.PI / 2, Math.PI, 32),
    ...round(bore, skirt, phi0 - Math.PI / 2, Math.PI, 32).reverse(),
  ];
  // The gas column, and inside it a core whose width follows the volume: the
  // gas is thin when the crown has just squeezed it, broad when it is let out.
  const share = Math.sqrt(volumesOf(angle)[name === "hot" ? "hot" : "cold"] / (AREA_HOT * 2 * RIG.crankR));
  const coreR = (boreR - 1.6) * (0.34 + 0.44 * Math.min(1.15, share));
  const gas = columnPoints(project, x0, cylY, crown + 0.6, topZ - 2, boreR - 1.6);
  const core = columnPoints(project, x0, cylY, crown + 2, topZ - 3.5, coreR, 22);
  const pin = pinOf(angle);
  const rod = rodSvg(project, x0, pin, [cylY, crown - 8]);
  return (
    // the rod first, then the crown and skirt: the trunk piston is a shell, so
    // its skirt hides the rod's little end behind it
    `<g data-part="rod-${name}">` +
    `<path class="iso-shade" data-shade="3" d="${pathOf(rod.outline, true)}"/>` +
    `<path class="iso-top" d="${pathOf(circleAt(project, x0, cylY, crown - 8, rod.small - 2, 18), true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${pathOf(rod.outline, true)}"/>` +
    `</g>` +
    `<g data-part="piston-${name}">` +
    `<path class="iso-shade" data-shade="2" d="${pathOf(body, true)}"/>` +
    `<path class="iso-shade" data-shade="3" d="${pathOf(top, true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${pathOf(body, true)}"/>` +
    `<path class="iso-line" data-tone="lo" d="${pathOf(top, true)}"/>` +
    `</g>` +
    // and the gas last: it is above the crown, and the head behind it cuts it off
    `<g data-part="gas-${name}">` +
    `<path class="te-gas" data-hot="${name === "hot" ? 1 : 0}" fill="${name === "hot" ? "#d98a6a" : "#7d9dc8"}" d="${pathOf(gas, true)}"/>` +
    `<path class="te-gas-core" fill="${name === "hot" ? "#efb69a" : "#a9c2e0"}" d="${pathOf(core, true)}"/>` +
    `</g>`
  );
}

/* ------------------------------------------------------------------ the rest of the gear */

// The wheel's spokes and both throws, as separate pieces so the builder can
// interleave them with the frame in the same back-to-front order.
export function gearParts(P, theta) {
  const project = screenOf(projectorOf(P));
  const out = [];
  const quads = spokes(project, theta);
  out.push({
    name: "flywheel",
    anchor: [RIG.wheel.x0, 0, RIG.wheel.shaftZ],
    // The spokes are plates. Each casts a soft band across the wheel's face,
    // then its own edge: a shadow under a spoke on the near side, and the
    // neighbouring spoke's on the far side, so the wheel turns visibly even
    // where the web is as pale as the rim.
    svg:
      `<g data-part="flywheel" data-slot="flywheel">` +
      quads.map((speak) => `<path class="iso-shade" data-shade="${speak.far ? 1 : 0}" data-shadow="1" d="${speak.quad}" transform="translate(0 2.4)"/>`).join("") +
      quads.map((speak) => `<path class="iso-shade" data-shade="${speak.far ? 1 : 2}" d="${speak.quad}"/>`).join("") +
      quads.map((speak) => `<path class="iso-line" data-tone="${speak.far ? "faint" : "mid"}" d="${speak.quad}"/>`).join("") +
      `</g>`,
  });
  for (const [name, x0, angle] of [
    ["hot", RIG.hotX, theta],
    ["cold", RIG.coldX, theta - Math.PI / 2],
  ]) {
    out.push({
      name: `throw-${name}`,
      anchor: [x0, 0, RIG.shaftZ],
      svg: `<g data-part="throw-${name}" data-slot="throw-${name}">${throwSvg(project, x0, angle)}</g>`,
    });
  }
  return out;
}
