// The engine on the bench, as numbers.
//
// An alpha hot-air engine on helium: two pistons, two throws on one shaft 90°
// apart, and one duct between the cylinders that holds the regenerator. The
// hot cylinder is wrapped in a band heater, the cold one in a water jacket.
//
// The working gas follows the Schmidt (isothermal) analysis — the standard
// closed-form model for a Stirling machine — but the volumes come from the
// real slider-crank, not a sine, so the gas torque falls to nothing at each
// dead centre exactly as it does on the bench:
//
//     z(θ) = r cos θ + √(L² − r² sin² θ)
//     V(θ) = V_dead + A · (z_top − z(θ))
//     p(θ) = C / ( V_h(θ)/T_h + V_c(θ)/T_c )
//
// C is fixed by the mean charge pressure. From p and the slopes follow the
// work (∮p dV), the heat taken in at the hot end, the heat rejected at the cold
// end, the efficiency, and the entropy each turn.
//
// The gas never sits at the metal's temperature: heat has to cross the wall,
// and that needs a difference. The gas runs cooler than the band heater and
// warmer than the cooling water, so the cycle is Carnot's between the two GAS
// temperatures, and the entropy is made in those two wall gaps. That is why no
// engine on a bench reaches the Carnot figure its temperatures promise.

export const GAS = { name: "helium", R: 2077.1 };
export const MACHINE = {
  boreHot: 0.040, // m
  boreCold: 0.040, // m, the same bore both sides: a fair comparison
  crank: 0.019, // m, throw radius (38 mm stroke)
  rod: 0.072, // m, connecting rod, pin to pin
  offset: 0.010, // m, how far the cylinder axes stand off the crank axis
  deadHot: 22e-6, // m³
  deadCold: 18e-6,
  deadDuct: 12e-6, // m³, the duct and its regenerator
  phase: Math.PI / 2, // the throws' angle
  meanPressure: 4e5, // Pa
  flywheelInertia: 1.5, // kg·m², the spoked wheel and the shaft it turns on
  governorDroop: 0.022, // N·m·s per rad/s: the flyweight governor opens the valve
  frictionTorque: 0.14, // N·m, Coulomb: bushes, glands, crossheads
  frictionRate: 0.004, // N·m·s, viscous
  coolingTorque: 0.04, // N·m at the top of the range: the water pump and fan
  gapHot: 48, // K across the heated wall
  gapCold: 16, // K across the cooled wall
};

const AREA = (bore) => (Math.PI / 4) * bore * bore;
export const AREA_HOT = AREA(MACHINE.boreHot);
export const AREA_COLD = AREA(MACHINE.boreCold);
export const STROKE_HOT = 2 * MACHINE.crankHot;
export const STROKE_COLD = 2 * MACHINE.crankCold;
export const V_SWEPT_HOT = AREA_HOT * STROKE_HOT;
export const V_SWEPT_COLD = AREA_COLD * STROKE_COLD;

// An offset slider-crank. The crank pin runs a circle of radius r about the
// shaft; the rod of length L carries the gudgeon pin, whose line stands the
// offset d away from the shaft. So
//     z(θ) = r cos θ + √(L² − (d + r sin θ)²)
// measured up from the shaft, and that — not a sine — is how the piston moves.
const SLIDE = { r: MACHINE.crank, L: MACHINE.rod, d: MACHINE.offset };

export function sliderOf(theta, { r = SLIDE.r, L = SLIDE.L, d = SLIDE.d } = {}) {
  const s = d + r * Math.sin(theta);
  const root = Math.sqrt(L * L - s * s);
  const z = r * Math.cos(theta) + root;
  const slope = -r * Math.sin(theta) * (1 + (r * Math.cos(theta) * Math.sin(theta) * 0 + s) / root);
  return { pin: [d + r * Math.sin(theta), r * Math.cos(theta)], along: z, slope };
}

// The travel's two ends, found by walking the cycle once.
const LIMITS = (() => {
  let top = -Infinity;
  let bottom = Infinity;
  for (let index = 0; index < 720; index++) {
    const { along } = sliderOf((index / 720) * Math.PI * 2);
    top = Math.max(top, along);
    bottom = Math.min(bottom, along);
  }
  return { top, bottom, span: top - bottom };
})();
export const TRAVEL = LIMITS;

// Piston travel, 0 at bottom dead centre to 1 at top dead centre.
export const travelOf = (theta, options) => {
  const { along } = sliderOf(theta, options);
  return (along - LIMITS.bottom) / LIMITS.span;
};

// The two working volumes and their slopes.
export function volumesOf(theta) {
  const hot = sliderOf(theta);
  const cold = sliderOf(theta - MACHINE.phase);
  const vh = MACHINE.deadHot + AREA_HOT * (LIMITS.top - hot.along);
  const vc = MACHINE.deadCold + AREA_COLD * (LIMITS.top - cold.along);
  return { hot: vh, cold: vc, duct: MACHINE.deadDuct, total: vh + vc + MACHINE.deadDuct };
}

export function slopesOf(theta) {
  const h = 1e-5;
  const hotA = AREA_HOT * (sliderOf(theta + h).along - sliderOf(theta - h).along) / (2 * h);
  const coldA = AREA_COLD * (sliderOf(theta - MACHINE.phase + h).along - sliderOf(theta - MACHINE.phase - h).along) / (2 * h);
  return { hot: -hotA, cold: -coldA };
}

export function gasTemperatures(heater, coolant) {
  return { hot: Math.max(heater - MACHINE.gapHot, coolant + 60), cold: coolant + MACHINE.gapCold };
}

// The isothermal pressure, normalised so the cycle average is the charge
// pressure. `scale` is C: p = C / (V_h/T_h + V_c/T_c).
let cache = { key: "", scale: 0 };

export function chargeScale(tHot, tCold) {
  const key = `${tHot.toFixed(2)}|${tCold.toFixed(2)}`;
  if (cache.key === key) return cache.scale;
  const steps = 1440;
  let sum = 0;
  for (let index = 0; index < steps; index++) {
    const v = volumesOf((index / steps) * Math.PI * 2);
    sum += 1 / (v.hot / tHot + (v.cold + v.duct) / tCold);
  }
  const scale = MACHINE.meanPressure / (sum / steps);
  cache = { key, scale };
  return scale;
}

export const pressureOf = (theta, tHot, tCold, scale = chargeScale(tHot, tCold)) => {
  const v = volumesOf(theta);
  return scale / (v.hot / tHot + (v.cold + v.duct) / tCold);
};

// One whole cycle, integrated: work, both heats, efficiency, pressure swing,
// and the entropy the reservoirs make to keep it turning.
export function cycleOf(heater, coolant) {
  const gas = gasTemperatures(heater, coolant);
  const steps = 1440;
  const scale = chargeScale(gas.hot, gas.cold);
  const dTheta = (Math.PI * 2) / steps;
  let workHot = 0;
  let workCold = 0;
  let top = 0;
  let bottom = Infinity;
  for (let index = 0; index < steps; index++) {
    const theta = index * dTheta;
    const p = pressureOf(theta, gas.hot, gas.cold, scale);
    const s = slopesOf(theta);
    workHot += p * s.hot * dTheta;
    workCold += p * s.cold * dTheta;
    top = Math.max(top, p);
    bottom = Math.min(bottom, p);
  }
  const work = workHot + workCold;
  const qIn = workHot; // heat taken while the hot gas is held at T_h
  const qOut = -workCold; // heat given up at the cold end
  const efficiency = qIn > 0 ? work / qIn : 0;
  const carnot = 1 - coolant / heater;
  // The cycle is reversible between the gas temperatures; the wall gaps and
  // the brake are where the entropy is actually made.
  const gapEntropy = qIn * (1 / gas.hot - 1 / heater) + qOut * (1 / coolant - 1 / gas.cold);
  // over a whole turn the working gas is back where it started, so it keeps no
  // entropy: whatever the jacket carries away at T_c, less what the burner
  // brought in at T_h, is the entropy the world has to keep. It is positive,
  // and it is the whole reason the brake can never get all of the heat.
  const reservoirEntropy = qOut / coolant - qIn / heater;
  return {
    heater,
    coolant,
    gasHot: gas.hot,
    gasCold: gas.cold,
    work,
    qIn,
    qOut,
    efficiency,
    carnot,
    gapEntropy,
    reservoirEntropy,
    entropy: reservoirEntropy,
    pMax: top,
    pMin: bottom,
    ratio: top / bottom,
    scale,
    meanPressure: MACHINE.meanPressure,
  };
}

// Shaft dynamics: the gas torque drives the wheel against Coulomb and viscous
// friction and whatever the brake is taking. Integrated in the page in small
// steps, so the speed is a result and not a dial.
export function torqueOf(theta, tHot, tCold, scale = chargeScale(tHot, tCold)) {
  const p = pressureOf(theta, tHot, tCold, scale);
  const s = slopesOf(theta);
  return p * (s.hot + s.cold);
}

// The governor's set speed: below it the gas valve is wide open, above it the
// flyweights close the valve harder the faster the shaft runs, which is what
// keeps a real engine at a steady speed whatever the load. It rides the same
// shaft as the pump, so a colder jacket also drops the set speed.
const setSpeedOf = (coolant) => 44 - 7 * ((RANGE.coolant[1] - coolant) / (RANGE.coolant[1] - RANGE.coolant[0]));

export function gasFactor(omega, coolant) {
  const share = omega / setSpeedOf(coolant);
  return 1 / (1 + share * share * share * share);
}

export function stepShaft(state, gas, brake, dt, coolant = 305) {
  // the engine turns one way: it cannot run backwards through a dead centre,
  // so the gas torque only ever pushes the way the shaft is already going
  const raw = torqueOf(state.theta, gas.hot, gas.cold) * gasFactor(state.omega, coolant);
  const torque = state.omega > 0.25 ? raw : Math.max(0, raw);
  const drag =
    MACHINE.frictionTorque * Math.tanh(state.omega / 0.4) +
    MACHINE.frictionRate * state.omega +
    brake +
    coolingLoad(RANGE.coolant[1]) +
    MACHINE.governorDroop * state.omega;
  const alpha = (torque - drag) / MACHINE.flywheelInertia;
  const omega = Math.max(0, state.omega + alpha * dt);
  const theta = state.theta + omega * dt;
  return { theta: theta % (Math.PI * 2), omega, torque, drag };
}

// The cooling valve is not only a temperature: the pump and fan that keep the
// jacket cold ride on the same shaft, so a colder jacket costs torque.
export function coolingLoad(coolant) {
  const share = (RANGE.coolant[1] - coolant) / (RANGE.coolant[1] - RANGE.coolant[0]);
  return MACHINE.coolingTorque * Math.max(0, Math.min(1, share)) ** 2;
}

// One revolution is where the work is; the mean torque follows from it.
export const torquePerCycle = (cycle) => cycle.work / (Math.PI * 2);

// The bench's controls: the band heater's dial, the cooling valve, the brake.
export const RANGE = { heater: [620, 1180], coolant: [288, 348], brake: [0, 0.8] };
export const START = { heater: 940, coolant: 305, brake: 0.28, angle: 0.7 };

export const celsius = (kelvin) => kelvin - 273.15;

export const readoutOf = (cycle, rpm, brakePower) =>
  `${celsius(cycle.heater).toFixed(0)}°C heater · ${celsius(cycle.coolant).toFixed(0)}°C water · ` +
  `${Math.round(rpm)} rpm · ${cycle.work.toFixed(1)} J/turn · η ${(cycle.efficiency * 100).toFixed(1)}% ` +
  `(Carnot ${(cycle.carnot * 100).toFixed(1)}%) · ${brakePower.toFixed(0)} W on the brake`;

// The state the page starts from: about a minute of running, so it opens on the
// speed the machine actually settles at rather than on nothing.
export const START_STATE = { theta: START.angle, omega: 22 };

export function wordsOf(cycle, rpm, brakePower = 0) {
  const stalled = rpm < 4;
  return (
    `Band heater at ${celsius(cycle.heater).toFixed(0)} degrees, cooling water at ` +
    `${celsius(cycle.coolant).toFixed(0)}. ` +
    (stalled
      ? "The shaft is stalled: the gas is not making enough torque to turn the brake. Ease the brake off or turn the heat up. "
      : `Shaft turning ${Math.round(rpm)} revolutions a minute, ${brakePower.toFixed(0)} watts going into the brake. `) +
    `Efficiency ${(cycle.efficiency * 100).toFixed(1)} percent, against Carnot's limit of ` +
    `${(cycle.carnot * 100).toFixed(1)} percent between the same two reservoir temperatures; ` +
    `every turn leaves ${(cycle.reservoirEntropy * 1000).toFixed(1)} thousandths of a joule per kelvin behind — ` +
    `that is the entropy this engine cannot give back, and the gap between its ${(cycle.efficiency * 100).toFixed(1)} percent ` +
    `and Carnot's ${(cycle.carnot * 100).toFixed(1)} percent is what it costs.`
  );
}
