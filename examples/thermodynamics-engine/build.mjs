// Fig 4 — Thermodynamics engine.
//
// A two-cylinder hot-air (Stirling) engine on a test bench, sectioned open at
// the front so the gas itself can be seen. Two vertical barrels stand side by
// side above the crank; the left is banded with a gas heater, the right is
// jacketed in water, and a short duct between the heads runs through a finned
// regenerator. Each piston is a trunk piston: its gudgeon pin rides the
// offset slider-crank straight down to its throw on the shaft. The throws sit
// 90° apart, so the two pistons run the quarter-turn-out-of-step cycle of an
// alpha machine. The flywheel on the left end of the shaft carries a Prony
// brake whose lever pulls on a spring balance.
//
// Every number on the page comes from ./model.mjs: the piston heights are the
// real offset slider-crank, the gas torque is p(θ)·dV/dθ, and the wheel's speed
// is the integral of that torque against friction, the brake and the pump.

import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";
import { barrelInnerSvg, gearParts, RIG as RIG0 } from "./motion.mjs";
const RIG = RIG0;

const HERE = dirname(fileURLToPath(import.meta.url));
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const theme = process.argv.includes("--light") ? "light" : "dark";
const CSS = readFileSync(join(HERE, "engine.css"), "utf8");

/* ------------------------------------------------------------------ numbers */
// The drawing is the model at 1:1, in millimetres.

const W = 980;
const H = 800;
const AZIMUTH = 40;
const ELEVATION = 33;

const BORE_R = (M.MACHINE.boreHot * 1000) / 2; // 20
const WALL = 9;
const R_OUT = BORE_R + WALL;
const CRANK_R = M.MACHINE.crank * 1000; // 19
const ROD_L = M.MACHINE.rod * 1000; // 72
const OFFSET = M.MACHINE.offset * 1000; // 10

// The barrels are open trunk cylinders: each stands on a crosshead guide
// bolted to the bed, and the crown comes down between its cheeks at bottom
// dead centre, so the piston's skirt stays in sight the whole way.
const HOT_X = -58;
const COLD_X = 58;
const SH_Y = 0; // the shaft's line
const CYL_Y = -OFFSET; // the barrels stand one crank-offset behind it
const Z_SHAFT = 206;
const PIN_DROP = 30; // gudgeon pin below the crown
const OPEN = 78; // half-angle of the sectioned opening

const FOOT_Z = 104; // the barrels' feet, on the guides
const TOP_Z = 262; // the barrels' top, and the heads' underside
const CRANK_PIN = (theta) => [CRANK_R * Math.sin(theta), Z_SHAFT + CRANK_R * Math.cos(theta)];
const PIN_Z = (theta) => Z_SHAFT + 1000 * M.sliderOf(theta).along;
const CROWN_Z = (theta) => PIN_Z(theta) - PIN_DROP;

const WHEEL = { x0: -176, x1: -156, r: 58, rim: 44, hub: 16 };
const POSTS = [{ x0: -78, x1: -58, y: -52 }, { x0: 58, x1: 78, y: -52 }];
const SHAFT_END = 144;
const BASE = { x: -196, y: -104, w: 366, d: 176, r: 15 };
const BASE_H = 20;

/* ------------------------------------------------------------------ camera */

const FITS = [
  ...k.boxCorners(BASE, -BASE_H - 10, 0),
  [HOT_X, CYL_Y, TOP_Z + 46],
  [COLD_X, CYL_Y, TOP_Z + 46],
  [WHEEL.x0, SH_Y, Z_SHAFT + WHEEL.r + 6],
  [WHEEL.x0, SH_Y, Z_SHAFT - WHEEL.r - 6],
  [SHAFT_END + 8, SH_Y, Z_SHAFT + 24],
  [176, -104, 320],
  [196, 96, 30],
  [-196, 96, 30],
];
const P = k.fitProjection(FITS, W, H, { pad: 20, azimuth: AZIMUTH, elevation: ELEVATION });
const K = G.scaleOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style = {}) => k.solidSvg(paths, style);
const dl = (...parts) => parts.filter(Boolean).map((part) => part.trim()).join(" ");
const L = (d, style = {}) => k.lineSvg(d, style);
const D = (points, style = {}) => k.dotsSvg(points, style);
const UP = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const ALONG = (o) => G.frameAlong(o, [1, 0, 0]);
const face = (points, cls, shade) =>
  `<path class="${cls}"${shade === null ? "" : ` data-shade="${shade}"`} d="${k.pathOf(points.map(at), true)}"/>`;

// The screen vector of a 3D direction, and of a whole plane's two axes: the
// projection is linear, so a part that only turns or slides can be placed with
// one matrix and moved in the page without rebuilding its path.
const pixel = (v) => {
  const [x0, y0] = at([0, 0, 0]);
  const [x1, y1] = at(v);
  return [x1 - x0, y1 - y0];
};
const n3 = (value) => (Math.abs(value) < 1e-6 ? 0 : Math.round(value * 1000) / 1000);
const matrixAt = (origin, u, v) => {
  const [e, f] = at(origin);
  const [ax, ay] = pixel(u);
  const [bx, by] = pixel(v);
  return `matrix(${n3(ax)} ${n3(ay)} ${n3(bx)} ${n3(by)} ${n3(e)} ${n3(f)})`;
};
// the same, but only the two axes: place it with a translate of your own
const basisAt = (u, v) => {
  const [ax, ay] = pixel(u);
  const [bx, by] = pixel(v);
  return `matrix(${n3(ax)} ${n3(ay)} ${n3(bx)} ${n3(by)} 0 0)`;
};

const order = [];

/* ------------------------------------------------------------------ the bench */

function bench() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - 10, 0, P)}"/>`);
  for (const [x, y] of k.corners(BASE, 30)) {
    out.push(S(k.cylinder(x, y, 12, -BASE_H - 9, 2.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 8.8, -BASE_H - 6.4, 6.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 10, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 6), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 14);
  out.push(L(dl(...screws.map(([x, y]) => k.ring(x, y, 3.2, 0, P, 16))), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // the creator's plate, on the free corner of the bed
  const plate = { x: 96, y: -96, w: 62, d: 24, r: 2.2 };
  out.push(S(k.slabOf(plate, 0, 1, P, 4, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 2.4), 1, P), { tone: "faint" }));
  out.push(
    L(
      [0, 1, 2]
        .map((row) => k.lineOnTop([plate.x + 5, plate.y + 6 + row * 7], [plate.x + 5 + [40, 50, 26][row], plate.y + 6 + row * 7], 1, P))
        .join(" "),
      { tone: "lo", free: true },
    ),
  );
  out.push(D([at([plate.x + plate.w - 5, plate.y + 5, 1]), at([plate.x + plate.w - 5, plate.y + plate.d - 5, 1])], { size: 0.4 }));
  return out.join("");
}

/* ------------------------------------------------------------------ bearing standards */

// A standard: a footed pedestal standing behind the shaft, its head bored for
// the bearing and capped. Both standards are the same part, mirrored.
function standardOf(x0, x1, cy) {
  const out = [];
  const foot = { x: x0 - 6, y: cy - 26, w: x1 - x0 + 12, d: 52, r: 6 };
  out.push(S(k.slabOf(foot, 0, 10, P, 6, 0.8), { tone: "mid" }));
  out.push(D(k.corners(foot, 7).map(([x, y]) => at([x, y, 10])), { size: 0.4 }));
  const body = { x: x0, y: cy - 20, w: x1 - x0, d: 40, r: 5 };
  out.push(S(k.slabOf(body, 10, Z_SHAFT - 34, P, 6, 0.9), { tone: "mid" }));
  out.push(L(k.sideSeam(body, 42, P, 6), { tone: "faint" }));
  out.push(L(dl(...[18, 26].map((z) => k.sideArc((x0 + x1) / 2, cy, 8, z, P, 10))), { tone: "faint" }));
  // the head: a boss round the shaft, and its cap
  out.push(S(G.disc(0, 16, 21, ALONG([x0 - 2, cy, Z_SHAFT]), P, { steps: 40 }), { tone: "hi", crease: "lo" }));
  out.push(L(G.circleOf(ALONG([x0 + 14, cy, Z_SHAFT]), 0, 21, P, 40), { tone: "lo" }));
  out.push(S(G.disc(0, 16, 17, ALONG([x0 + 14, cy, Z_SHAFT]), P, { steps: 36 }), { tone: "mid" }));
  out.push(L(G.arcOf(ALONG([x0 + 30, cy, Z_SHAFT]), 0, 17, P), { tone: "faint" }));
  for (const side of [-1, 1]) {
    out.push(S(k.cylinder((x0 + x1) / 2 + side * 9, cy - 12, 3.4, Z_SHAFT + 12, 6, P, 16), { tone: "hi", crease: "lo" }));
    out.push(L(k.knurl((x0 + x1) / 2 + side * 9, cy - 12, 3.4, Z_SHAFT + 15, Z_SHAFT + 18, 16, P, 0.3), { tone: "faint" }));
  }
  return out.join("");
}

/* ------------------------------------------------------------------ a crosshead guide */

// The guide: a footed bed with two upright cheeks. The crosshead's block runs
// between them, and the rod's little end takes its pin at the front. The
// barrel's foot flange bolts to the top.
function guideOf(cx) {
  const out = [];
  const foot = { x: cx - 19, y: CYL_Y - 16, w: 38, d: 32, r: 5 };
  out.push(S(k.slabOf(foot, 0, 7, P, 7, 0.7), { tone: "mid" }));
  out.push(D(k.corners(foot, 7).map(([x, y]) => at([x, y, 9])), { size: 0.4 }));
  for (const side of [-1, 1]) {
    const cheek = { x: cx - 6, y: CYL_Y + side * 10 - 4, w: 12, d: 8, r: 1.4 };
    out.push(S(k.slabOf(cheek, 7, FOOT_Z - 7, P, 3, 0.4), { tone: "hi", crease: "lo" }));
    out.push(L(k.sideSeam(cheek, FOOT_Z - 12, P, 3), { tone: "faint" }));
  }
  out.push(S(k.slabOf({ x: cx - 19, y: CYL_Y - 16, w: 38, d: 32, r: 5 }, FOOT_Z, 6, P, 6, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan({ x: cx - 17, y: CYL_Y - 14, w: 34, d: 28, r: 4 }, 3.4), FOOT_Z + 6, P), { tone: "faint" }));
  return out.join("");
}

/* ------------------------------------------------------------------ a column, a barrel */

const rIn = BORE_R;
const barrelOf = (cx) => ({
  cx,
  up: (z) => UP([cx, CYL_Y, z]),
  p: (r, a, z) => [cx + r * Math.cos(a), CYL_Y + r * Math.sin(a), z],
  arc: (r, from, to, z, n = 30) =>
    Array.from({ length: n + 1 }, (_, index) => {
      const a = from + ((to - from) * index) / n;
      return [cx + r * Math.cos(a), CYL_Y + r * Math.sin(a), z];
    }),
});

function cylinderOf({ cx, heater = false, jacket = false, inner = "", label = "" }) {
  const out = [];
  const B = barrelOf(cx);
  const phi0 = AZIMUTH * DEG;
  const w = OPEN * DEG;
  const nearFrom = phi0 - w;
  const nearTo = phi0 + w;
  const backFrom = phi0 + w;
  const backTo = phi0 + TAU - w;

  out.push(S(G.disc(0, 9, R_OUT + 13, B.up(FOOT_Z), P, { steps: 56 }), { tone: "mid" }));
  out.push(L(G.circleOf(B.up(FOOT_Z), 0, R_OUT + 13, P, 56), { tone: "lo" }));
  out.push(D(Array.from({ length: 8 }, (_, index) => at(B.p(R_OUT + 8, (index / 8) * TAU + 0.4, FOOT_Z + 9))), { size: 0.44 }));

  // The metal of the barrel: the whole round of it, less the wedge the section
  // takes out on the near side. Extruded as an annular sector, so the cut is
  // real — the bore's back wall, the two radial faces and the crown of the
  // section are all metal, and the piston shows between them.
  const band = (rIn2, rOut2, from, to, steps = 44) => {
    const ring = [];
    for (let index = 0; index <= steps; index++) {
      const a = from + ((to - from) * index) / steps;
      ring.push([rOut2 * Math.cos(a), rOut2 * Math.sin(a)]);
    }
    for (let index = steps; index >= 0; index--) {
      const a = from + ((to - from) * index) / steps;
      ring.push([rIn2 * Math.cos(a), rIn2 * Math.sin(a)]);
    }
    return ring;
  };
  const B2 = G.frameOf([cx, CYL_Y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.prismOf(B2, band(rIn, R_OUT, backFrom, backTo), FOOT_Z + 9, TOP_Z + 2, P), { tone: "mid", crease: "lo" }));
  // the lip at the foot, and the seat at the top: turned collars, cut the same way
  out.push(S(G.prismOf(B2, band(rIn, R_OUT + 2.5, backFrom, backTo), FOOT_Z, FOOT_Z + 9, P), { tone: "hi", crease: "lo" }));
  out.push(S(G.prismOf(B2, band(rIn, R_OUT + 1, backFrom, backTo), TOP_Z + 2, TOP_Z + 7, P), { tone: "hi", crease: "lo" }));
  out.push(L(dl(...[FOOT_Z, FOOT_Z + 9, TOP_Z + 2, TOP_Z + 7].map((z) => G.circleOf(B.up(z), 0, R_OUT, P, 56))), { tone: "faint" }));
  // the bore's floor, and the lip of the section's mouth
  out.push(face(B.arc(rIn, nearFrom, nearTo, FOOT_Z + 9), "iso-shade", "0"));
  out.push(L(k.pathOf(B.arc(rIn, nearFrom, nearTo, FOOT_Z + 9).map(at)), { tone: "lo" }));
  for (const a of [nearFrom, nearTo]) {
    out.push(L(dl(k.segment([cx + rIn * Math.cos(a), CYL_Y + rIn * Math.sin(a), FOOT_Z + 9], [cx + rIn * Math.cos(a), CYL_Y + rIn * Math.sin(a), TOP_Z], P)), { tone: "faint" }));
  }
  // The fittings clamped round the barrel, then what moves in its bore, then
  // the head: the band and the jacket are metal the section cuts through, so
  // the gas shows over them, and the head still hides the top of the gas.
  if (heater) out.push(heaterOf(cx));
  if (jacket) out.push(jacketOf(cx));
  if (inner) out.push(inner);

  // the head: a bolted flange, a domed cap, and a gland over the rod
  out.push(S(G.disc(0, 13, R_OUT + 10, B.up(TOP_Z), P, { steps: 56, bevel: 0.8 }), { tone: "hi", crease: "lo" }));
  out.push(D(Array.from({ length: 8 }, (_, index) => at(B.p(R_OUT + 5, (index / 8) * TAU + 0.4, TOP_Z + 13))), { size: 0.4 }));
  out.push(S(G.disc(0, 7, R_OUT + 1, B.up(TOP_Z + 13), P, { steps: 48 }), { tone: "mid" }));
  out.push(S(G.disc(0, 5, R_OUT - 6, B.up(TOP_Z + 20), P, { steps: 44, bevel: 0.5 }), { tone: "hi", crease: "lo" }));
  out.push(L(G.circleOf(B.up(TOP_Z + 13), 0, R_OUT + 10, P, 56), { tone: "lo" }));
  for (const side of [-1, 1]) {
    out.push(S(k.cylinder(cx + side * 9, CYL_Y + 4, 2.2, TOP_Z + 13, 6, P, 14), { tone: "mid" }));
    out.push(S(k.cylinder(cx + side * 9, CYL_Y + 4, 3.4, TOP_Z + 19, 2.2, P, 12), { tone: "mid" }));
  }
  out.push(S(G.disc(0, 4, 10, B.up(TOP_Z + 25), P, { steps: 30 }), { tone: "mid" }));
  out.push(S(G.disc(0, 9, 5, B.up(TOP_Z + 29), P, { steps: 22 }), { tone: "mid" }));
  if (label) {
    out.push(k.faceTextSvg(k.topMatrix([cx, CYL_Y + R_OUT + 6], TOP_Z + 14, P, "x"), label, { size: 4.6, tone: "mid", anchor: "middle" }));
  }
  out.push(L(G.arcOf(B.up(TOP_Z + 38), 0, 5, P), { tone: "faint" }));

  return out.join("");
}

// The band heater: a shell clamped round the barrel, fed from a box on the bed.
function heaterOf(cx) {
  const out = [];
  const F = UP([cx, CYL_Y, 0]);
  const rH = R_OUT + 3.4;
  // The band is a clamp round the barrel, and it is cut away on the same side
  // as the barrel: a whole ring would close the section it is fitted to.
  const backFrom = AZIMUTH * DEG + OPEN * DEG;
  const backTo = AZIMUTH * DEG + TAU - OPEN * DEG;
  const B2 = G.frameOf([cx, CYL_Y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const band = (rIn2, rOut2, steps = 44) => {
    const ring = [];
    for (let index = 0; index <= steps; index++) {
      const a = backFrom + ((backTo - backFrom) * index) / steps;
      ring.push([rOut2 * Math.cos(a), rOut2 * Math.sin(a)]);
    }
    for (let index = steps; index >= 0; index--) {
      const a = backFrom + ((backTo - backFrom) * index) / steps;
      ring.push([rIn2 * Math.cos(a), rIn2 * Math.sin(a)]);
    }
    return ring;
  };
  // a thin clamp, high on the barrel where the gas is, not a sleeve
  const z0 = FOOT_Z + 62;
  const z1 = FOOT_Z + 138;
  out.push(S(G.prismOf(B2, band(R_OUT + 0.4, rH), z0, z1, P), { tone: "mid", crease: "lo" }));
  out.push(L(dl(...[z0, z1].map((z) => G.circleOf(F, z, rH, P, 56))), { tone: "lo" }));
  for (const z of [z0 + 19, z0 + 38, z0 + 57]) out.push(L(G.arcOf(F, z, rH, P), { tone: "faint" }));
  // the element's terminal box on the bed, and the conduit up to the band
  const box = { x: cx - 17, y: CYL_Y + R_OUT + 10, w: 34, d: 15, r: 2 };
  out.push(S(k.slabOf(box, 0, 15, P, 5, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(box, 2), 15, P), { tone: "faint" }));
  out.push(D([at([box.x + 4, box.y + 4, 15]), at([box.x + box.w - 4, box.y + box.d - 4, 15])], { size: 0.34 }));
  const conduitZ = [15, FOOT_Z + 16];
  const CU = UP([cx - 5, CYL_Y + R_OUT + 17, 0]);
  out.push(S(G.disc(0, conduitZ[0], 6.4, CU, P, { steps: 20 }), { tone: "hi" }));
  out.push(S(k.cylinder(cx - 5, CYL_Y + R_OUT + 17, 3, conduitZ[0], conduitZ[1], P, 18), { tone: "lo" }));
  out.push(L(G.arcOf(CU, conduitZ[1], 3.6, P), { tone: "lo" }));
  return out.join("");
}

// The water jacket: a sleeve round the barrel, cut away on the same side as
// the barrel so the bore stays open to the eye, with a spout top and bottom.
function jacketOf(cx) {
  const out = [];
  const phi0 = AZIMUTH * DEG;
  const w = OPEN * DEG;
  const backFrom = phi0 + w;
  const backTo = phi0 + TAU - w;
  const rJ = R_OUT + 4.4;
  const B2 = G.frameOf([cx, CYL_Y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const band = (rIn2, rOut2, steps = 44) => {
    const ring = [];
    for (let index = 0; index <= steps; index++) {
      const a = backFrom + ((backTo - backFrom) * index) / steps;
      ring.push([rOut2 * Math.cos(a), rOut2 * Math.sin(a)]);
    }
    for (let index = steps; index >= 0; index--) {
      const a = backFrom + ((backTo - backFrom) * index) / steps;
      ring.push([rIn2 * Math.cos(a), rIn2 * Math.sin(a)]);
    }
    return ring;
  };
  out.push(S(G.prismOf(B2, band(R_OUT + 0.4, rJ), FOOT_Z + 12, FOOT_Z + 66, P), { tone: "mid", crease: "lo" }));
  for (const [angle, z] of [[AZIMUTH + 146, FOOT_Z + 62], [AZIMUTH + 146, FOOT_Z + 20]]) {
    const a = angle * DEG;
    const Fa = G.frameAlong([cx + rJ * Math.cos(a), CYL_Y + rJ * Math.sin(a), z], [Math.cos(a), Math.sin(a), 0]);
    out.push(S(G.disc(0, 9, 4.2, Fa, P, { steps: 20 }), { tone: "mid" }));
    out.push(L(G.circleOf(Fa, 9, 4.2, P, 20), { tone: "lo" }));
  }
  return out.join("");
}

/* ------------------------------------------------------------------ the duct and its regenerator */

function duct() {
  const out = [];
  const zTop = TOP_Z + 22;
  const route = G.fillet([
    [HOT_X + 10, CYL_Y + 2, TOP_Z + 2],
    [HOT_X + 17, CYL_Y + 4, TOP_Z + 12],
    [HOT_X + 30, CYL_Y + 6, zTop],
    [COLD_X - 30, CYL_Y - 2, zTop],
    [COLD_X - 17, CYL_Y + 2, TOP_Z + 12],
    [COLD_X - 10, CYL_Y + 4, TOP_Z + 2],
  ], 14, 9);
  const centre = G.pathLength(route) / 2;
  for (const piece of tubePieces(route, 5.2, P, { maxLength: 14, gaps: [[centre - 18, centre + 18]] })) out.push(tubeSvg(piece, { tone: "hi" }));
  for (const [point, dir] of [[route[0], [0, 0, -1]], [route[route.length - 1], [0, 0, -1]]]) {
    out.push(S(G.disc(0, 5, 9, G.frameAlong(point, dir), P, { steps: 24 }), { tone: "mid" }));
    out.push(L(G.circleOf(G.frameAlong(point, dir), 5, 9, P, 24), { tone: "lo" }));
  }
  const mid = G.pointAlong(route, centre);
  const F = G.frameAlong(mid, [1, 0, 0]);
  out.push(S(G.disc(-18, 18, 11, F, P, { steps: 44 }), { tone: "hi", crease: "lo" }));
  for (let index = 0; index < 9; index++) {
    const s = -14.5 + index * 3.6;
    out.push(S(G.disc(s, s + 1.2, 15, F, P, { steps: 44 }), { tone: "mid" }));
    out.push(L(G.arcOf(F, s + 1.2, 15, P), { tone: "faint" }));
  }
  for (const s of [-18, 18]) {
    out.push(S(G.disc(s, s + (s < 0 ? -8 : 8), 9, F, P, { steps: 30 }), { tone: "mid" }));
    out.push(L(G.circleOf(F, s + (s < 0 ? -8 : 8), 9, P, 30), { tone: "lo" }));
  }
  return out.join("");
}

/* ------------------------------------------------------------------ wheel, shaft, brake */

// The wheel's six spokes, drawn flat in the wheel's own plane: (u, w) is a
// point measured across and up from the hub. The page only ever rotates this
// one group, so the spokes stay exact at every angle.
function spokes() {
  const out = [];
  const inner = WHEEL.hub - 1;
  const outer = WHEEL.rim + 1;
  for (let index = 0; index < 6; index++) {
    const a = (index / 6) * TAU;
    const shape = [];
    for (let step = 0; step <= 6; step++) {
      const w = inner + ((outer - inner) * step) / 6;
      shape.push([6.5 * (1 - 0.4 * (step / 6)), w]);
    }
    for (let step = 6; step >= 0; step--) {
      const w = inner + ((outer - inner) * step) / 6;
      shape.push([-6.5 * (1 - 0.4 * (step / 6)), w]);
    }
    out.push(L(k.pathOf(shape.map(([u, w]) => [u * Math.cos(a) - w * Math.sin(a), u * Math.sin(a) + w * Math.cos(a)]), true), { tone: "mid" }));
  }
  return out.join("");
}

function flywheelStatic() {
  const out = [];
  const F = ALONG([0, SH_Y, Z_SHAFT]);
  out.push(S(G.ringBand(WHEEL.x0, WHEEL.x1, WHEEL.rim, WHEEL.r, F, P, { steps: 72 }), { tone: "hi", crease: "lo" }));
  out.push(L(dl(...[WHEEL.x0, WHEEL.x1].map((x) => G.circleOf(ALONG([x, SH_Y, Z_SHAFT]), 0, WHEEL.r, P, 72))), { tone: "lo" }));
  out.push(L(dl(...[WHEEL.x0, WHEEL.x1].map((x) => G.circleOf(ALONG([x, SH_Y, Z_SHAFT]), 0, WHEEL.rim, P, 72))), { tone: "faint" }));
  out.push(S(G.disc(0, 13, WHEEL.hub, ALONG([WHEEL.x0, SH_Y, Z_SHAFT]), P, { steps: 40 }), { tone: "mid" }));
  out.push(L(G.circleOf(ALONG([WHEEL.x1, SH_Y, Z_SHAFT]), 0, WHEEL.hub, P, 40), { tone: "lo" }));
  return out.join("");
}

const shaft = (x0, x1) => S(G.disc(0, x1 - x0, 8, ALONG([x0, SH_Y, Z_SHAFT]), P, { steps: 26 }), { tone: "hi", crease: "lo" });

// The Prony brake: a strap over the top of the rim, its ends onto a lever that
// reaches forward and pulls down on a spring balance. The strap is a thin
// sleeve, so the wheel's spokes still read above it.
function brake() {
  const out = [];
  const r = WHEEL.r - 2;
  const plane = G.frameOf([0, SH_Y, Z_SHAFT], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const from = -0.6;
  const to = 0.98;
  const band = (r0, r1) => {
    const ring = [];
    for (let index = 0; index <= 24; index++) {
      const a = from + ((to - from) * index) / 24;
      ring.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
    }
    for (let index = 24; index >= 0; index--) {
      const a = from + ((to - from) * index) / 24;
      ring.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
    }
    return ring;
  };
  out.push(S(G.prismOf(plane, band(r, r + 5), WHEEL.x0 - 6, WHEEL.x1 + 6, P), { tone: "mid" }));
  for (const a of [to, from]) {
    const Fa = ALONG([WHEEL.x1 + 6, SH_Y + (r + 2.5) * Math.cos(a), Z_SHAFT + (r + 2.5) * Math.sin(a)]);
    out.push(S(G.disc(0, 9, 4, Fa, P, { steps: 18 }), { tone: "hi", crease: "lo" }));
  }
  // the lever: forward from the lower end of the strap, then down to the balance
  const y0 = SH_Y + (r + 2.5) * Math.cos(to);
  const z0 = Z_SHAFT + (r + 2.5) * Math.sin(to);
  out.push(S(k.slabOf({ x: WHEEL.x0 - 4, y: y0 - 4, w: 8, d: 62, r: 2 }, z0 - 3, 6, P, 3, 0.5), { tone: "hi", crease: "lo" }));
  out.push(S(k.slabOf({ x: WHEEL.x0 - 3, y: y0 + 52, w: 6, d: 7, r: 1.4 }, z0 - 40, 38, P, 2), { tone: "mid" }));
  out.push(S(k.cylinder(WHEEL.x0, y0 + 58, 5.4, 8, 20, P, 22), { tone: "hi", crease: "lo" }));
  out.push(L(dl(...[13, 20, 27].map((z) => k.sideArc(WHEEL.x0, y0 + 58, 5.4, z, P, 18))), { tone: "lo" }));
  out.push(S(k.slabOf({ x: WHEEL.x0 - 9, y: y0 + 50, w: 19, d: 19, r: 3 }, 0, 20, P, 4, 0.5), { tone: "mid" }));
  return out.join("");
}

/* ------------------------------------------------------------------ the moving gear */

// A connecting rod, drawn in the plane it swings in: a shank with an eye at
// each end. The drawing is the same at every angle — the page only turns it.
function rodSvg() {
  const out = [];
  const eyeBig = 9;
  const eyeSmall = 6;
  const shape = [];
  const arcPts = (cy, cz, r, from2, to2) => {
    for (let index = 0; index <= 12; index++) {
      const a = from2 + ((to2 - from2) * index) / 12;
      shape.push([cy + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  arcPts(0, 0, eyeBig, -Math.PI / 2 + 0.28, Math.PI / 2 - 0.28);
  arcPts(0, ROD_L, eyeSmall, Math.PI / 2 + 0.3, Math.PI * 1.5 - 0.3);
  const plane = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  out.push(S(G.prismOf(plane, shape, -4, 4, P), { tone: "hi", crease: "lo" }));
  for (const [z, r] of [[0, eyeBig], [ROD_L, eyeSmall]]) {
    out.push(S(G.disc(0, 9, r, ALONG([0, 0, z]), P, { steps: 22 }), { tone: "mid" }));
    out.push(L(G.circleOf(ALONG([9, 0, z]), 0, r, P, 22), { tone: "lo" }));
  }
  return out.join("");
}

// One throw: two cheeks on the shaft, the crank pin between them, and a
// counterweight on the far side of the shaft.
function throwSvg(cx) {
  const out = [];
  const plane = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const cheek = [];
  for (let index = 0; index <= 22; index++) {
    const a = (index / 22) * TAU;
    cheek.push([11 * Math.cos(a), 11 * Math.sin(a)]);
  }
  const weight = [];
  for (let index = 0; index <= 16; index++) {
    const a = -Math.PI / 2 - 0.78 + (index / 16) * 1.56;
    weight.push([22 * Math.cos(a), 22 * Math.sin(a)]);
  }
  for (let index = 16; index >= 0; index--) {
    const a = -Math.PI / 2 - 0.6 + (index / 16) * 1.2;
    weight.push([10 * Math.cos(a), 10 * Math.sin(a)]);
  }
  for (const x of [-11, 11]) {
    out.push(S(G.prismOf(plane, cheek, x - 4.2, x + 4.2, P), { tone: "mid" }));
    out.push(S(G.prismOf(plane, weight, x - 4.2, x + 4.2, P), { tone: "lo" }));
  }
  // the crank pin, standing on the cheek's own +y: it is the rod's big end
  out.push(S(G.disc(0, 26, 7.2, ALONG([-13, CRANK_R, 0]), P, { steps: 22 }), { tone: "hi", crease: "lo" }));
  out.push(L(G.circleOf(ALONG([13, CRANK_R, 0]), 0, 7.2, P, 22), { tone: "lo" }));
  return out.join("");
}

// The trunk piston: a crown and a skirt, standing in the bore. `crown` is where
// its top face sits, so the crown follows the slider-crank exactly.
function pistonSvg() {
  const out = [];
  const B = barrelOf(0);
  out.push(S(G.lathe([
    [-30, BORE_R - 1.2],
    [-30, BORE_R - 4.4],
    [-5, BORE_R - 4.4],
    [-5, BORE_R - 1.2],
    [0, BORE_R - 1.6],
    [0, 0],
  ], B.up(0), P, { steps: 48, fill: "hull" }), { tone: "hi", crease: "lo" }));
  out.push(L(G.circleOf(B.up(0), 0, BORE_R - 1.6, P, 48), { tone: "lo" }));
  out.push(L(G.arcOf(B.up(1), 0, BORE_R - 4.4, P), { tone: "faint" }));
  return out.join("");
}

/* ------------------------------------------------------------------ gauges, pump, gas cock, pipes */

function gaugePost(cx, cy, top) {
  const out = [];
  out.push(S(k.cylinder(cx, cy, 10, 0, 4.4, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(cx, cy, 7.6, 4.4, 3, P, 26), { tone: "mid" }));
  out.push(S(k.cylinder(cx, cy, 3.2, 7.4, top - 7.4, P, 22), { tone: "mid", crease: "none" }));
  out.push(L(dl(...[top - 24, top - 12].map((z) => k.sideArc(cx, cy, 3.2, z, P, 14))), { tone: "faint" }));
  out.push(S(k.cylinder(cx, cy, 5.4, top, 2.2, P, 26), { tone: "mid" }));
  return out.join("");
}

function gaugeFace(cx, cy, r, z, label) {
  const out = [];
  out.push(S(G.disc(0, 9, r, UP([cx, cy, z]), P, { steps: 56, bevel: 0.8 }), { tone: "hi", crease: "lo" }));
  out.push(L(G.circleOf(UP([cx, cy, z + 9]), 0, r - 1.6, P, 56), { tone: "lo" }));
  out.push(L(k.knurl(cx, cy, r, z + 6, z + 9, 56, P, 0.3), { tone: "faint" }));
  const ticks = k.radialTicks(cx, cy, r - 3, 32, 6, z + 9, [1.3, 3], P, Math.PI * 0.78, Math.PI * 1.44);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([cx, cy + r * 0.44], z + 9, P, "x"), label, { size: 2.2, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(cx, cy, 1.6, z + 9, P, 12), { tone: "mid" }));
  return out.join("");
}

function pump() {
  const out = [];
  const body = { x: 108, y: -18, w: 54, d: 44, r: 6 };
  out.push(S(k.slabOf(body, 0, 15, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(body, 6), 15, 8, P, 5, 0.6), { tone: "hi", crease: "lo" }));
  out.push(D([at([body.x + 4.4, body.y + 4.4, 15]), at([body.x + body.w - 4.4, body.y + body.d - 4.4, 15])], { size: 0.38 }));
  const v = [body.x + 16, body.y + 17];
  out.push(S(k.cylinder(v[0], v[1], 4.8, 23, 10, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(v[0], v[1], 9.6, 33, 2.6, P, 32), { tone: "hi", crease: "lo" }));
  out.push(L(k.radialTicks(v[0], v[1], 9.6, 6, 1, 35.6, [2.6, 5.6], P).major, { tone: "mid" }));
  out.push(L(k.ring(v[0], v[1], 3.4, 35.6, P, 16), { tone: "lo" }));
  out.push(S(k.cylinder(v[0], v[1], 2.4, 35.6, 2, P, 18), { tone: "mid" }));
  out.push(S(k.cylinder(body.x + 42, body.y + 20, 5.2, 23, 8, P, 26), { tone: "hi" }));
  out.push(L(k.ring(body.x + 42, body.y + 20, 5.2, 31, P, 26), { tone: "lo" }));
  for (const x of [body.x + 7, body.x + 51]) {
    out.push(S(k.cylinder(x, body.y + 5, 4.2, 23, 6, P, 22), { tone: "mid" }));
    out.push(L(k.knurl(x, body.y + 5, 4.2, 26, 29, 22, P, 0.3), { tone: "faint" }));
  }
  return out.join("");
}

function gasCock() {
  const out = [];
  const cock = { x: -166, y: 32, w: 38, d: 28, r: 4.5 };
  out.push(S(k.slabOf(cock, 0, 14, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(cock, 7), 14, 7, P, 5, 0.6), { tone: "hi", crease: "lo" }));
  out.push(D([at([cock.x + 4.4, cock.y + 4.4, 14]), at([cock.x + cock.w - 4.4, cock.y + cock.d - 4.4, 14])], { size: 0.38 }));
  const hand = [cock.x + cock.w / 2, cock.y + cock.d / 2];
  out.push(S(k.cylinder(hand[0], hand[1], 4.2, 21, 8, P, 26), { tone: "mid" }));
  out.push(L(k.knurl(hand[0], hand[1], 4.2, 21, 29, 24, P), { tone: "lo" }));
  out.push(S(k.slabOf({ x: hand[0] - 10, y: hand[1] - 1.2, w: 20, d: 2.4, r: 1, }, 29, 1.8, P, 3), { tone: "mid" }));
  return out.join("");
}

function pipes() {
  const out = [];
  const rJ = R_OUT + 4.4;
  const spout = (angle, z) => [COLD_X + (rJ + 7) * Math.cos(angle * DEG), CYL_Y + (rJ + 7) * Math.sin(angle * DEG), z];
  const inlet = spout(AZIMUTH + 150, FOOT_Z + 58);
  const outlet = spout(AZIMUTH + 150, FOOT_Z + 22);
  const runs = [
    [inlet, [COLD_X + 10, CYL_Y + 46, 220], [118, 6, 120], [144, 10, 62], [160, 8, 26]],
    [outlet, [COLD_X + 2, CYL_Y + 50, 160], [104, 22, 92], [136, 26, 44], [170, 20, 20]],
  ];
  for (const run of runs) {
    const route = G.fillet(run, 24, 9);
    for (const piece of tubePieces(route, 4.2, P, { maxLength: 15, rings: { pitch: 3, fade: [0.1, 0.5] } })) out.push(tubeSvg(piece, { tone: "mid" }));
  }
  // the charging line, from the cock to the foot of the hot column
  const gas = G.fillet([[-131, 40, 22], [-114, 34, 46], [-92, 22, 96], [HOT_X - 6, CYL_Y + R_OUT + 12, 118]], 18, 9);
  for (const piece of tubePieces(gas, 3, P, { maxLength: 14 })) out.push(tubeSvg(piece, { tone: "mid" }));
  return out.join("");
}

/* ------------------------------------------------------------------ assemble, back to front */

const START_THETA = 0.7;
const put = (anchor, svg) => order.push({ d: k.depthOf(anchor, P), svg });

put([0, 80, 40], bench());
put([HOT_X, CYL_Y, 30], guideOf(HOT_X));
put([COLD_X, CYL_Y, 30], guideOf(COLD_X));
put([POSTS[0].x0 + 8, POSTS[0].y, 50], standardOf(POSTS[0].x0, POSTS[0].x1, POSTS[0].y));
put([POSTS[1].x0 + 8, POSTS[1].y, 50], standardOf(POSTS[1].x0, POSTS[1].x1, POSTS[1].y));
put([0, CYL_Y, TOP_Z + 16], duct());
put([HOT_X, CYL_Y, TOP_Z], cylinderOf({ cx: HOT_X, heater: true, label: "BURNER", inner: `<g data-slot="hot">${barrelInnerSvg(P, "hot", START_THETA)}</g>` }));
put([COLD_X, CYL_Y, TOP_Z], cylinderOf({ cx: COLD_X, jacket: true, label: "WATER", inner: `<g data-slot="cold">${barrelInnerSvg(P, "cold", START_THETA)}</g>` }));
put([WHEEL.x0 + 10, SH_Y, Z_SHAFT], flywheelStatic());
put([WHEEL.x0 + 10, SH_Y, Z_SHAFT], shaft(WHEEL.x1, HOT_X - 6));
put([HOT_X, SH_Y, Z_SHAFT], shaft(HOT_X + 6, COLD_X - 8));
put([COLD_X, SH_Y, Z_SHAFT], shaft(COLD_X - 8, SHAFT_END));
put([WHEEL.x0, SH_Y + 40, Z_SHAFT + 46], brake());
put([-124, 56, 104], gaugePost(-124, 56, 104) + gaugeFace(-124, 56, 18, 113, "GAS"));
put([-74, 62, 76], gaugePost(-74, 62, 76) + gaugeFace(-74, 62, 13, 85, "WATER"));
put([124, 6, 10], pump());
put([0, CYL_Y + 14, 230], pipes());
// The moving parts go into the same back-to-front order as the frame, so the
// barrels in front of a rod hide it and the piston shows through the opening.
// They are placed *after* the frame has been sorted, at the point the frame
// itself stops: the barrel that stands in front of a rod is nearer the eye than
// the rod, and a part must land behind it, not on top of it.
// The moving parts ride just in front of the barrel that hides their far side:
// the window in the wall is the only place they can be seen, so they are drawn
// over the barrel's own metal and only their near half is drawn at all.
const WINDOW_DEPTH = k.depthOf([HOT_X, CYL_Y - R_OUT, TOP_Z], P) + 0.5;
for (const part of gearParts(P, START_THETA)) {
  order.push({ d: Math.max(k.depthOf(part.anchor, P), WINDOW_DEPTH), svg: part.svg });
}

order.sort((a, b) => a.d - b.d);

const svg = k.figureSvg({
  width: W,
  height: H,
  label:
    "A two-cylinder hot-air engine on a test bench, both barrels sectioned open at the front so the gas shows. The left barrel is banded with a gas heater, the right one jacketed in cooling water, and a short duct joins the two heads through a finned regenerator. Each piston is a trunk piston whose rod runs down to its own throw on the crankshaft; the throws sit a quarter turn apart. The flywheel on the left carries a Prony brake working a spring balance, a gas cock and a water pump stand in the foreground, and two pressure gauges behind.",
  body: `<style>${CSS}</style>` + order.map((item) => item.svg).join(""),
});

// the still keeps the light palette, so it reads in a document of its own;
// the page around it follows the theme the build was asked for
writeFileSync(join(HERE, theme === "light" ? "output.svg" : "output-light.svg"), svg);

/* ------------------------------------------------------------------ the page */

const MODEL = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8");
// What the page needs to rebuild the moving parts without the kit.
const camera = k.cameraOf(P);
const proj = {
  origin: P.origin,
  k: camera.k,
  sinA: camera.sinA,
  cosA: camera.cosA,
  sinE: camera.sinE,
  cosE: camera.cosE,
};
const DATA = {
  proj,
  rig: {
    hotX: RIG.hotX,
    coldX: RIG.coldX,
    cylY: RIG.cylY,
    shaftZ: RIG.shaftZ,
    topZ: RIG.topZ,
    crankR: RIG.crankR,
    rodL: RIG.rodL,
    offset: M.MACHINE.offset * 1000,
    crownAtTdc: RIG.crownAtTdc,
    boreR: RIG.boreR,
    pistonDepth: RIG.pistonDepth,
    floorZ: RIG.floorZ,
    wheel: RIG.wheel,
    azimuth: AZIMUTH,
    open: OPEN,
  },
  travel: M.TRAVEL,
  start: { ...M.START, omega: 22 },
  tint: { hot: "#e0a08a", cold: "#9fb8d8" },
};

// the speed this machine settles at, from the dynamics: 940 °C and 305 K with
// the brake at 0.28 N·m
const SETTLED_RPM = 211;

const figure = k.plateHtml({
  fig: "Fig. 4",
  title: "A hot-air engine, cut open",
  hint: "two barrels, one shaft",
  // the same readout the page shows: settled speed, and the brake's own power
  readout: M.readoutOf(
    M.cycleOf(M.START.heater, M.START.coolant),
    SETTLED_RPM,
    M.START.brake * (SETTLED_RPM * Math.PI) / 30,
  ),
  keys: [
    { mark: "raised", label: "hot end · burner" },
    { mark: "flat", label: "cold end · water" },
    { mark: "line", label: "gas path" },
  ],
  caption:
    "The two pistons run a quarter turn out of step. Neither by itself could make the gas do net work over a turn; together they can, because one is being heated while the other is being cooled.",
  body: `<div class="te"><div class="te-stage" role="img">${svg}</div><p class="te-said" aria-live="polite"></p></div>`,
});

const controls = `
  <div class="te-controls">
    <label class="te-control"><span>Band heater</span><output data-for="heater">667 °C</output>
      <input type="range" data-control="heater" min="${M.RANGE.heater[0]}" max="${M.RANGE.heater[1]}" step="5" value="${M.START.heater}" aria-label="band heater temperature">
    </label>
    <label class="te-control"><span>Cooling water</span><output data-for="coolant">32 °C</output>
      <input type="range" data-control="coolant" min="${M.RANGE.coolant[0]}" max="${M.RANGE.coolant[1]}" step="1" value="${M.START.coolant}" aria-label="cooling water temperature">
    </label>
    <label class="te-control"><span>Brake</span><output data-for="brake">0.28</output>
      <input type="range" data-control="brake" min="0" max="${M.RANGE.brake[1]}" step="0.01" value="${M.START.brake}" aria-label="brake load">
    </label>
    <button type="button" class="te-flip" data-run aria-pressed="true">Stop the shaft</button>
  </div>`;

const page = k.pageHtml({
  title: "Thermodynamics engine",
  theme,
  width: 980,
  body: `${figure}${controls}`,
  script: kitScript() + MODEL + LIVE.replace("__DATA__", JSON.stringify(DATA)),
});

writeFileSync(join(HERE, theme === "light" ? "thermodynamics-engine-light.html" : "thermodynamics-engine.html"), page);
const svgName = theme === "light" ? "output.svg" : "output-light.svg";
const pageName = theme === "light" ? "thermodynamics-engine-light.html" : "thermodynamics-engine.html";
console.log(
  `wrote ${svgName} ${(svg.length / 1024).toFixed(0)} KB and ${pageName} ` +
    `${(page.length / 1024).toFixed(0)} KB · scale ${K.toFixed(3)} · items ${order.length}`,
);
