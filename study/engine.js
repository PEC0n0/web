(function (root) {
  'use strict';
  const c = (re, im = 0) => ({ re, im });
  const add = (a, b) => c(a.re + b.re, a.im + b.im);
  const sub = (a, b) => c(a.re - b.re, a.im - b.im);
  const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const scale = (a, k) => c(a.re * k, a.im * k);
  const conj = a => c(a.re, -a.im);
  const abs = a => Math.hypot(a.re, a.im);
  const div = (a, b) => scale(mul(a, conj(b)), 1 / (b.re ** 2 + b.im ** 2));
  function power(P, Q, U) {
    const S = Math.hypot(P, Q);
    return { S, pf: S ? P / S : 1, phi: Math.atan2(Q, P), I: S / (Math.sqrt(3) * U) };
  }
  // U: line RMS kV; P,Q: total three-phase MW/Mvar; R,X: per-phase ohm.
  function receivingLine(P, Q, U, R, X, B = 0) {
    const qShunt2 = -U * U * B / 2;
    const qSeries2 = Q + qShunt2;
    const k = (P * P + qSeries2 * qSeries2) / (U * U);
    const dP = k * R, dQ = k * X;
    const longitudinal = (P * R + qSeries2 * X) / U;
    const transverse = (P * X - qSeries2 * R) / U;
    const U1 = Math.hypot(U + longitudinal, transverse);
    const qShunt1 = -U1 * U1 * B / 2;
    return { U1, dP, dQ, longitudinal, transverse, qShunt1, qShunt2, qSeries2,
      P1: P + dP, Q1: qSeries2 + dQ + qShunt1,
      I: Math.sqrt(k / 3), angle: Math.atan2(transverse, U + longitudinal) };
  }
  function transformer(SN, UN, Pk, uk, P0, i0) {
    const R = (Pk / 1000) * UN * UN / (SN * SN);
    const Z = uk / 100 * UN * UN / SN;
    const G = (P0 / 1000) / (UN * UN);
    const Y = i0 / 100 * SN / (UN * UN);
    return { R, Z, X: Math.sqrt(Math.max(0, Z * Z - R * R)), Xapprox: Z,
      G, B: Math.sqrt(Math.max(0, Y * Y - G * G)), Bapprox: Y,
      valid: Z >= R && Y >= G };
  }
  function base(SB, UB, Z) {
    const ZB = UB * UB / SB;
    return { ZB, IB: SB / (Math.sqrt(3) * UB), YB: 1 / ZB, zpu: Z / ZB };
  }
  function changeBase(z, oldS, oldU, newS, newU) {
    return z * newS / oldS * (oldU / newU) ** 2;
  }
  // Exact constant-power backward/forward sweep, no shunt, one voltage level.
  function radial(U0, loads, impedances, tolerance = 1e-10) {
    const n = loads.length;
    let voltages = Array.from({ length: n }, () => c(U0 / Math.sqrt(3)));
    let currents = [], iteration = 0, error = Infinity;
    while (iteration < 200 && error > tolerance) {
      const injection = loads.map((s, i) => conj(div(scale(s, 1 / 3), voltages[i])));
      currents = new Array(n);
      let sum = c(0);
      for (let i = n - 1; i >= 0; i--) { sum = add(sum, injection[i]); currents[i] = sum; }
      let upstream = c(U0 / Math.sqrt(3));
      const next = impedances.map((z, i) => { upstream = sub(upstream, mul(z, currents[i])); return upstream; });
      error = Math.max(...next.map((v, i) => abs(sub(v, voltages[i]))));
      voltages = next;
      iteration++;
    }
    const losses = impedances.map((z, i) => scale(z, 3 * abs(currents[i]) ** 2));
    const sending = mul(c(Math.sqrt(3) * U0), conj(currents[0]));
    return { voltages, U: voltages.map(v => abs(v) * Math.sqrt(3)), currents, losses, sending, iteration, converged: error <= tolerance };
  }
  // Equal source voltages, homogeneous R/X ratio, initial lossless distribution.
  function ring(P2, Q2, P3, Q3, l12, l23, l31) {
    const total = l12 + l23 + l31;
    const left = c((P2 * (l23 + l31) + P3 * l31) / total,
      (Q2 * (l23 + l31) + Q3 * l31) / total);
    const middle = sub(left, c(P2, Q2));
    const right = sub(c(P2 + P3, Q2 + Q3), left);
    return { left, middle, right };
  }
  function ybus(n, branches, shunts = []) {
    const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0)));
    branches.forEach(({ from, to, z, b = 0 }) => {
      const y = div(c(1), z);
      Y[from][from] = add(Y[from][from], add(y, c(0, b / 2)));
      Y[to][to] = add(Y[to][to], add(y, c(0, b / 2)));
      Y[from][to] = sub(Y[from][to], y);
      Y[to][from] = sub(Y[to][from], y);
    });
    shunts.forEach(({ node, y }) => { Y[node][node] = add(Y[node][node], y); });
    return Y;
  }
  const api = { c, add, sub, mul, scale, conj, abs, div, power, receivingLine, transformer, base, changeBase, radial, ring, ybus };
  root.PowerMath = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
