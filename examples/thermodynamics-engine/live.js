// The page: the shaft turns, and the parts that ride it are redrawn.
//
// The model in the page is the same file the still was built from, so the
// speed is not an animation: it is the integral of the gas torque p(θ)·dV/dθ
// against friction, the governor and whatever the brake is taking. Nothing is
// faked with a keyframe. Drag a control and the machine answers the way a
// machine does — the harder the brake, the slower it runs, and if it is short
// of torque it stops.
const DATA = __DATA__;
const root = document.querySelector(".te");
const readout = document.querySelector("[data-readout]");
const stage = document.querySelector(".te-stage");
const said = document.querySelector(".te-said");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clampTo = (value, low, high) => Math.min(high, Math.max(low, value));

/* ------------------------------------------------------------------ geometry */

const proj = DATA.proj;
const project = ([x, y, z]) => [
  proj.origin[0] + (x * proj.sinA - y * proj.cosA) * proj.k,
  proj.origin[1] + ((x * proj.cosA + y * proj.sinA) * proj.sinE - z * proj.cosE) * proj.k,
];
const RIG = DATA.rig;

// The crank pin's place in the shaft's plane, and the crown it carries.
const pinOf = (theta) => [RIG.crankR * Math.sin(theta), RIG.shaftZ + RIG.crankR * Math.cos(theta)];
const crownOf = (theta) => RIG.crownAtTdc - 2 * RIG.crankR * travelOf(theta);

const round1 = (value) => Math.round(value * 10) / 10;
const polyline = (points, closed) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${round1(x)} ${round1(y)}`).join("") + (closed ? "Z" : "");
// The gas in the bore, seen as a solid column: the top disk's far arc, the
// bottom disk's near arc, and the two points where the bore's round silhouette
// runs down between them. The disks lie in the horizontal plane; the tangents
// sit a quarter turn either side of the view's own azimuth, so the column is
// exactly as wide as the bore looks.
function columnAt(x0, y0, z0, z1, r, steps = 26, azimuth = AZIMUTH) {
  const at = (a, z) => project([x0 + r * Math.cos(a), y0 + r * Math.sin(a), z]);
  const far = (azimuth + 90) * RADIANS;
  const near = (azimuth - 90) * RADIANS;
  const arc = (from, to, z) =>
    Array.from({ length: steps + 1 }, (_, index) => at(from + ((to - from) * index) / steps, z));
  return [...arc(far, far + Math.PI, z0), ...arc(near, near + Math.PI, z1)];
}

const circleAt = (x0, y0, z0, r, steps = 40) =>
  Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return project([x0, y0 + r * Math.cos(a), z0 + r * Math.sin(a)]);
  });

/* ------------------------------------------------------------------ the parts */

function spokesSvg(theta) {
  const { wheel } = RIG;
  return Array.from({ length: 6 }, (_, index) => {
    const a = theta + (index / 6) * Math.PI * 2;
    const across = [Math.cos(a), Math.sin(a)];
    const along = [-Math.sin(a), Math.cos(a)];
    const quad = [
      [wheel.hub - 1, -5.6],
      [wheel.rim + 1, -3.2],
      [wheel.rim + 1, 3.2],
      [wheel.hub - 1, 5.6],
    ].map(([r, s]) => project([wheel.x1, across[0] * r + along[0] * s, wheel.shaftZ + across[1] * r + along[1] * s]));
    const d = polyline(quad, true);
    const far = Math.sin(a) < 0;
    // the shadow first, then the plate, then its edge
    return (
      `<path class="iso-shade" data-shade="${far ? 1 : 0}" data-shadow="1" d="${d}" transform="translate(0 2.4)"/>` +
      `<path class="iso-shade" data-shade="${far ? 1 : 2}" d="${d}"/>` +
      `<path class="iso-line" data-tone="${far ? "faint" : "mid"}" d="${d}"/>`
    );
  }).join("");
}

function throwSvg(x0, theta) {
  const cheek = circleAt(x0, 0, RIG.shaftZ, 12, 28);
  const back = theta + Math.PI;
  const weight = [];
  for (let i = 0; i <= 14; i++) {
    const a = back - 0.85 + (i / 14) * 1.7;
    weight.push(project([x0, 23 * Math.cos(a), RIG.shaftZ + 23 * Math.sin(a)]));
  }
  for (let i = 14; i >= 0; i--) {
    const a = back - 0.68 + (i / 14) * 1.36;
    weight.push(project([x0, 11 * Math.cos(a), RIG.shaftZ + 11 * Math.sin(a)]));
  }
  const [pinY, pinZ] = pinOf(theta);
  const pin = circleAt(x0 - 15, pinY, pinZ, 7.2, 22);
  return (
    `<path class="iso-fill" d="${polyline(weight, true)}"/><path class="iso-shade" data-shade="2" d="${polyline(weight, true)}"/>` +
    `<path class="iso-fill" d="${polyline(cheek, true)}"/><path class="iso-top" d="${polyline(pin, true)}"/>` +
    `<path class="iso-line" data-tone="hi" d="${polyline(cheek, true)}"/><path class="iso-line" data-tone="lo" d="${polyline(weight, true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${polyline(pin, true)}"/>`
  );
}

function rodSvg(x0, from, to) {
  const a = project([x0, from[0], from[1]]);
  const b = project([x0, to[0], to[1]]);
  const base = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const big = 9.6;
  const small = 5.6;
  const arc = (c, r, from2, to2) =>
    Array.from({ length: 13 }, (_, i) => {
      const t = from2 + ((to2 - from2) * i) / 12;
      return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
    });
  const outline = [...arc(a, big, base + 1.3, base + Math.PI * 2 - 1.3), ...arc(b, small, base - 1.3, base + 1.3)];
  return { outline, small, b };
}

function barrelInnerSvg(name, theta) {
  const x0 = name === "hot" ? RIG.hotX : RIG.coldX;
  const angle = name === "hot" ? theta : theta - Math.PI / 2;
  const crown = crownOf(angle);
  const phi0 = (RIG.azimuth * Math.PI) / 180;
  const bore = RIG.boreR - 1.2;
  const round = (r, z, from, span, steps) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = from + (span * i) / steps;
      return project([x0 + r * Math.cos(a), RIG.cylY + r * Math.sin(a), z]);
    });
  // the crown's whole face, flat in the horizontal plane
  const top = round(bore, crown, 0, Math.PI * 2, 44);
  const skirt = Math.max(crown - RIG.pistonDepth * 0.62, RIG.floorZ + 4);
  const body = [
    ...round(bore, crown, phi0 - Math.PI / 2, Math.PI, 32),
    ...round(bore, skirt, phi0 - Math.PI / 2, Math.PI, 32).reverse(),
  ];
  const gas = columnAt(x0, RIG.cylY, crown + 0.6, RIG.topZ - 2, RIG.boreR - 1.6, 26, RIG.azimuth);
  // the core's width is the gas's bulk, straight from the model's volume
  const share = Math.sqrt(volumesOf(angle)[name === "hot" ? "hot" : "cold"] / (AREA_HOT * 2 * RIG.crankR));
  const coreR = (RIG.boreR - 1.6) * (0.34 + 0.44 * Math.min(1.15, share));
  const core = columnAt(x0, RIG.cylY, crown + 2, RIG.topZ - 3.5, coreR, 22, RIG.azimuth);
  const rod = rodSvg(x0, pinOf(angle), [RIG.cylY, crown - 8]);
  // the gas is tinted by its own temperature, which is the whole point
  const hot = name === "hot";
  return (
    // rod, then the crown and skirt, then the gas: the same order as the still
    `<path class="iso-shade" data-shade="3" d="${polyline(rod.outline, true)}"/>` +
    `<path class="iso-top" d="${polyline(circleAt(x0, RIG.cylY, crown - 8, rod.small - 2, 18), true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${polyline(rod.outline, true)}"/>` +
    `<path class="iso-shade" data-shade="2" d="${polyline(body, true)}"/>` +
    `<path class="iso-shade" data-shade="1" d="${polyline(top, true)}"/>` +
    `<path class="iso-line" data-tone="mid" d="${polyline(body, true)}"/>` +
    `<path class="iso-line" data-tone="lo" d="${polyline(top, true)}"/>` +
    `<path class="te-gas" data-hot="${hot ? 1 : 0}" fill="${hot ? "#d98a6a" : "#7d9dc8"}" d="${polyline(gas, true)}"/>` +
    `<path class="te-gas-core" fill="${hot ? "#efb69a" : "#a9c2e0"}" d="${polyline(core, true)}"/>`
  );
}

const slots = {};
for (const name of ["flywheel", "throw-hot", "throw-cold", "hot", "cold"]) slots[name] = stage.querySelector(`[data-slot="${name}"]`);

function draw(theta) {
  slots.flywheel.innerHTML = spokesSvg(theta);
  slots["throw-hot"].innerHTML = throwSvg(RIG.hotX, theta);
  slots["throw-cold"].innerHTML = throwSvg(RIG.coldX, theta - Math.PI / 2);
  slots.hot.innerHTML = barrelInnerSvg("hot", theta);
  slots.cold.innerHTML = barrelInnerSvg("cold", theta);
}

/* ------------------------------------------------------------------ the shaft */

const state = { theta: DATA.start.angle, omega: DATA.start.omega };
let controls = { ...DATA.start };
let running = !still.matches;
let lastFrame = 0;
let shown = 0;

const cycle = () => cycleOf(controls.heater, controls.coolant);
let current = cycle();

function step(dt) {
  const gas = { hot: current.gasHot, cold: current.gasCold };
  let next = state;
  // four sub-steps a frame: the torque curve is steep near the dead centres
  for (let i = 0; i < 4; i++) next = stepShaft(next, gas, controls.brake, dt / 4, controls.coolant);
  state.theta = next.theta;
  state.omega = next.omega;
}

function readoutText() {
  const rpm = (state.omega * 60) / (Math.PI * 2);
  // the brake takes its share of the gas torque, and what is left is heat
  const power = controls.brake * state.omega;
  return readoutOf(current, rpm, power);
}

function words() {
  const rpm = (state.omega * 60) / (Math.PI * 2);
  return wordsOf(current, rpm, controls.brake * state.omega);
}

// The still is the machine at the controls' starting point; this keeps the
// dials honest about what they are holding.
const dials = {
  heater: (k) => `${(k - 273.15).toFixed(0)} °C`,
  coolant: (k) => `${(k - 273.15).toFixed(0)} °C`,
  brake: (b) => `${b.toFixed(2)} N·m`,
};
const paintDials = () => {
  for (const out of document.querySelectorAll("[data-for]")) {
    const key = out.dataset.for;
    out.textContent = dials[key](controls[key]);
  }
};

function frame(time) {
  if (!running) return;
  const dt = lastFrame ? clampTo((time - lastFrame) / 1000, 0.004, 0.05) : 1 / 60;
  lastFrame = time;
  step(dt);
  current = cycle();
  draw(state.theta);
  if (time - shown > 180) {
    shown = time;
    readout.textContent = readoutText();
    said.textContent = words();
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ the controls */

for (const input of document.querySelectorAll("input[data-control]")) {
  const key = input.dataset.control;
  input.value = String(controls[key] ?? DATA.start[key]);
  input.addEventListener("input", () => {
    controls[key] = Number(input.value);
    current = cycle();
    paintDials();
    readout.textContent = readoutText();
    said.textContent = words();
    if (!running) {
      draw(state.theta);
      state.theta += 0.35;
    }
  });
}

const flip = document.querySelector("[data-run]");
const paintRun = () => {
  flip.textContent = running ? "Stop the shaft" : "Turn the shaft";
  flip.setAttribute("aria-pressed", running ? "true" : "false");
};
flip.addEventListener("click", () => {
  running = !running;
  paintRun();
  if (running) {
    lastFrame = 0;
    requestAnimationFrame(frame);
  }
});
paintRun();

draw(state.theta);
paintDials();
readout.textContent = readoutText();
said.textContent = words();
if (running) requestAnimationFrame(frame);

// The one thing a still cannot say: why the speed it shows is the speed it
// shows. Written out for anyone who cannot see the dial.
stage.setAttribute(
  "aria-label",
  "A two-cylinder hot-air engine on a test bench. Two vertical barrels stand side by side over the crankshaft, " +
    "both cut open at the front. The left barrel is heated by a gas burner and the right one cooled by water; " +
    "a duct between the two heads carries the gas through a regenerator. Each piston is joined by a connecting " +
    "rod to its own throw on the shaft, the throws a quarter turn apart. The flywheel on the left end of the " +
    "shaft drives a brake that pulls on a spring balance. As it runs, the gas above each piston is tinted by its " +
    "temperature: warm above the hot piston as it is pushed up, cool above the cold one as it comes down.",
);
