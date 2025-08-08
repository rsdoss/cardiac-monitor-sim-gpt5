
import React, { useEffect, useMemo, useRef, useState } from "react";

// --- Simple Cardiac Monitor + Defibrillator Simulator ---
// Notes:
// - Educational use only. Do not use for real clinical decision-making.
// - Simplified physiology and device behavior.
// - Keyboard shortcuts: [Space]=Shock, [C]=Charge, [P]=Power, [N]=Next Case

// Canvas / ECG rendering constants
const SAMPLE_RATE = 500; // Hz
const BUFFER_SECONDS = 120; // seconds of pre-generated data per rhythm

// Visual scale tuning (not real mm)
const GRID_MINOR_PX = 10; // minor box
const GRID_MAJOR_EVERY = 5; // major every 5 minors

// Helper: clamp
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Gaussian adder for synthetic waveforms
function addGaussian(
  arr: Float32Array,
  centerIdx: number,
  amplitude: number,
  sigmaSamples: number
) {
  const start = Math.max(0, Math.floor(centerIdx - 4 * sigmaSamples));
  const end = Math.min(arr.length - 1, Math.ceil(centerIdx + 4 * sigmaSamples));
  for (let i = start; i <= end; i++) {
    const x = (i - centerIdx) / sigmaSamples;
    arr[i] += amplitude * Math.exp(-0.5 * x * x);
  }
}

// RNG helpers
function randRange(a: number, b: number) {
  return a + Math.random() * (b - a);
}
function jitter(base: number, frac: number) {
  return base * (1 + randRange(-frac, frac));
}

// Rhythm IDs
const RHY = {
  SINUS: "sinus",
  SVT: "svt",
  AFIB_RVR: "afib_rvr",
  VT_PULSE: "vt_pulse",
  PVT: "pvt",
  VF: "vf",
  ASYSTOLE: "asystole",
  PEA_NARROW: "pea_narrow",
} as const;

type RhythmId = typeof RHY[keyof typeof RHY];

type GeneratedBuffer = {
  buffer: Float32Array;
  rPeaks: number[]; // indices of R-peaks (for sync markers)
};

// Generate regular beat ECG (P-QRS-T) with tunable HR and QRS width
function generateRegularECG(
  seconds: number,
  hr: number,
  qrsWidthMs: number,
  opts?: { pWave?: boolean; tWave?: boolean; amp?: number }
): GeneratedBuffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const arr = new Float32Array(samples);
  const rPeaks: number[] = [];

  const cycleSec = 60 / hr;
  const cycleSamples = Math.max(20, Math.floor(cycleSec * SAMPLE_RATE));

  const amp = opts?.amp ?? 1.0;
  const showP = opts?.pWave !== false;
  const showT = opts?.tWave !== false;

  // Approximate timings within a cycle
  const pCenter = 0.2; // as fraction of cycle
  const qrsCenter = 0.3;
  const tCenter = 0.6;

  const qrsSigma = (qrsWidthMs / 1000) * SAMPLE_RATE * 0.28; // fudge factor for width

  for (let k = 0; k * cycleSamples < samples; k++) {
    const base = k * cycleSamples;

    // P wave (small, positive)
    if (showP) addGaussian(arr, base + pCenter * cycleSamples, 0.18 * amp, 0.03 * cycleSamples);

    // QRS complex: tiny Q, big R, tiny S
    addGaussian(arr, base + (qrsCenter - 0.02) * cycleSamples, -0.18 * amp, qrsSigma * 0.5);
    addGaussian(arr, base + qrsCenter * cycleSamples, 1.1 * amp, qrsSigma);
    addGaussian(arr, base + (qrsCenter + 0.02) * cycleSamples, -0.28 * amp, qrsSigma * 0.6);

    // T wave (broad, positive)
    if (showT) addGaussian(arr, base + tCenter * cycleSamples, 0.35 * amp, 0.07 * cycleSamples);

    // Track R-peak index
    const rIdx = Math.round(base + qrsCenter * cycleSamples);
    rPeaks.push(rIdx);
  }

  // Baseline noise
  for (let i = 0; i < samples; i++) {
    arr[i] += randRange(-0.02, 0.02);
  }

  return { buffer: arr, rPeaks };
}

// AF with RVR: irregular RR + fibrillatory baseline
function generateAfibRvr(seconds: number, meanHr = 150): GeneratedBuffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const arr = new Float32Array(samples);
  const rPeaks: number[] = [];

  // Fibrillatory baseline (5-8 Hz small sine + noise)
  const fHz = randRange(5, 8);
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    arr[i] += 0.08 * Math.sin(2 * Math.PI * fHz * t) + randRange(-0.03, 0.03);
  }

  // Irregularly irregular R-Rs
  const meanRR = 60 / meanHr; // sec
  let t = 0;
  while (t * SAMPLE_RATE < samples) {
    const rr = Math.max(0.28, Math.min(0.9, randRange(meanRR - 0.18, meanRR + 0.18)));
    const rIndex = Math.floor(t * SAMPLE_RATE);
    // Narrow-ish QRS
    addGaussian(arr, rIndex - 6, -0.12, 4);
    addGaussian(arr, rIndex, 0.9, 6);
    addGaussian(arr, rIndex + 6, -0.2, 5);
    rPeaks.push(rIndex);
    // Modest T
    addGaussian(arr, rIndex + Math.floor(0.22 * SAMPLE_RATE), 0.25, 20);

    t += rr;
  }

  return { buffer: arr, rPeaks };
}

// Ventricular fibrillation: chaotic, varying amplitude/frequency
function generateVF(seconds: number): GeneratedBuffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const arr = new Float32Array(samples);
  const rPeaks: number[] = [];

  // Sum of time-varying sines + noise; coarse-to-fine variability
  let f1 = randRange(3, 6);
  let f2 = randRange(6, 9);
  let f3 = randRange(9, 12);
  let a1 = randRange(0.5, 1.0);
  let a2 = randRange(0.2, 0.6);
  let a3 = randRange(0.1, 0.4);
  let phi1 = Math.random() * Math.PI * 2;
  let phi2 = Math.random() * Math.PI * 2;
  let phi3 = Math.random() * Math.PI * 2;

  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    // slowly wander frequencies & amplitudes
    if (i % 500 === 0) {
      f1 = jitter(f1, 0.05);
      f2 = jitter(f2, 0.05);
      f3 = jitter(f3, 0.05);
      a1 = Math.max(0.3, Math.min(1.1, jitter(a1, 0.08)));
      a2 = Math.max(0.1, Math.min(0.8, jitter(a2, 0.1)));
      a3 = Math.max(0.05, Math.min(0.6, jitter(a3, 0.12)));
    }
    const val =
      a1 * Math.sin(2 * Math.PI * f1 * t + phi1) +
      a2 * Math.sin(2 * Math.PI * f2 * t + phi2) +
      a3 * Math.sin(2 * Math.PI * f3 * t + phi3) +
      randRange(-0.05, 0.05);
    arr[i] = val;
  }

  return { buffer: arr, rPeaks };
}

// Monomorphic VT waveform (broad QRS, ~160-180 bpm)
function generateVT(seconds: number, hr = 170): GeneratedBuffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const arr = new Float32Array(samples);
  const rPeaks: number[] = [];

  const cycleSec = 60 / hr;
  const cycleSamples = Math.max(20, Math.floor(cycleSec * SAMPLE_RATE));

  for (let k = 0; k * cycleSamples < samples; k++) {
    const base = k * cycleSamples;
    const center = base + 0.3 * cycleSamples;
    // Very broad, tall R-like complex
    addGaussian(arr, center - 10, -0.18, 5);
    addGaussian(arr, center, 1.0, 20); // wide
    addGaussian(arr, center + 10, -0.25, 6);
    rPeaks.push(Math.round(center));
    // small T
    addGaussian(arr, base + 0.62 * cycleSamples, 0.18, 18);
  }

  // noise
  for (let i = 0; i < samples; i++) arr[i] += randRange(-0.02, 0.02);
  return { buffer: arr, rPeaks };
}

function generateAsystole(seconds: number): GeneratedBuffer {
  const samples = Math.floor(seconds * SAMPLE_RATE);
  const arr = new Float32Array(samples);
  for (let i = 0; i < samples; i++) arr[i] = randRange(-0.015, 0.015);
  return { buffer: arr, rPeaks: [] };
}

function generatePEA_narrow(seconds: number, hr = 50): GeneratedBuffer {
  // Clinically there is electrical activity but no pulse; monitor looks like sinus brady (simplified)
  return generateRegularECG(seconds, hr, 80, { amp: 0.9 });
}

// Library of scenarios
const SCENARIOS: Record<
  RhythmId,
  {
    label: string;
    desc: string;
    generator: () => GeneratedBuffer;
    shockable: boolean; // unsynchronized defib recommended
    syncRecommended?: boolean; // synchronized cardioversion recommended
    syncable: boolean; // has R-peaks for sync markers
  }
> = {
  [RHY.SINUS]: {
    label: "Normal Sinus (75 bpm)",
    desc: "Baseline for comparison.",
    generator: () => generateRegularECG(BUFFER_SECONDS, 75, 80),
    shockable: false,
    syncRecommended: false,
    syncable: true,
  },
  [RHY.SVT]: {
    label: "SVT ~180",
    desc: "Regular narrow-complex tachycardia.",
    generator: () => generateRegularECG(BUFFER_SECONDS, 180, 70, { pWave: false, amp: 0.9 }),
    shockable: false,
    syncRecommended: true,
    syncable: true,
  },
  [RHY.AFIB_RVR]: {
    label: "Atrial Fibrillation (RVR)",
    desc: "Irregularly irregular narrow-complex.",
    generator: () => generateAfibRvr(BUFFER_SECONDS, 150),
    shockable: false,
    syncRecommended: true,
    syncable: true,
  },
  [RHY.VT_PULSE]: {
    label: "Monomorphic VT (with pulse)",
    desc: "Wide-complex tachycardia, unstable → synchronized cardioversion.",
    generator: () => generateVT(BUFFER_SECONDS, 160),
    shockable: false,
    syncRecommended: true,
    syncable: true,
  },
  [RHY.PVT]: {
    label: "Pulseless VT",
    desc: "Shockable rhythm (unsynchronized defib).",
    generator: () => generateVT(BUFFER_SECONDS, 170),
    shockable: true,
    syncRecommended: false,
    syncable: true,
  },
  [RHY.VF]: {
    label: "Ventricular Fibrillation",
    desc: "Coarse → fine VF; shockable.",
    generator: () => generateVF(BUFFER_SECONDS),
    shockable: true,
    syncRecommended: false,
    syncable: false,
  },
  [RHY.ASYSTOLE]: {
    label: "Asystole",
    desc: "Flatline (confirm in 2 leads). Not shockable.",
    generator: () => generateAsystole(BUFFER_SECONDS),
    shockable: false,
    syncRecommended: false,
    syncable: false,
  },
  [RHY.PEA_NARROW]: {
    label: "PEA (narrow)",
    desc: "Electrical activity, no pulse. Not shockable.",
    generator: () => generatePEA_narrow(BUFFER_SECONDS, 50),
    shockable: false,
    syncRecommended: false,
    syncable: true,
  },
};

// Outcome model for shocks / cardioversion (toy probabilities)
function handleShock(
  rhythm: RhythmId,
  energyJ: number,
  syncMode: boolean
): {
  appropriate: boolean;
  converted: boolean;
  message: string;
  nextRhythm: RhythmId;
} {
  let appropriate = false;
  let converted = false;
  let nextRhythm: RhythmId = rhythm;
  let message = "";

  const e = Math.max(0, Math.min(360, energyJ));

  if (rhythm === RHY.VF || rhythm === RHY.PVT) {
    // Defibrillation
    appropriate = !syncMode || true; // sync markers irrelevant in VF
    const p = Math.max(0.15, Math.min(0.88, (e - 80) / 160)); // ~0% at 80J → ~88% at 240J
    converted = Math.random() < p;
    nextRhythm = converted ? RHY.SINUS : rhythm;
    message = converted
      ? `Defibrillation at ${e}J converted the rhythm → Normal Sinus.`
      : `Shock at ${e}J unsuccessful. Continue high-quality CPR and escalate energy.`;
  } else if (rhythm === RHY.SVT) {
    if (syncMode) {
      appropriate = true;
      const p = Math.max(0.4, Math.min(0.95, (e - 40) / 120)); // 50–100J commonly effective
      converted = Math.random() < p;
      nextRhythm = converted ? RHY.SINUS : RHY.SVT;
      message = converted
        ? `Synchronized cardioversion at ${e}J successful → Normal Sinus.`
        : `Cardioversion at ${e}J failed. Consider higher energy or alternative maneuvers.`;
    } else {
      appropriate = false;
      // small risk of deterioration
      if (Math.random() < 0.08) {
        nextRhythm = RHY.VF;
        message = `Unsynchronized shock delivered in SVT → degenerated to VF. Begin defibrillation.`;
      } else {
        nextRhythm = RHY.SVT;
        message = `Unsynchronized shock in SVT is inappropriate. No conversion.`;
      }
    }
  } else if (rhythm === RHY.AFIB_RVR) {
    if (syncMode) {
      appropriate = true;
      const p = Math.max(0.35, Math.min(0.85, (e - 90) / 160)); // 120–200J typical
      converted = Math.random() < p;
      nextRhythm = converted ? RHY.SINUS : RHY.AFIB_RVR;
      message = converted
        ? `Synchronized cardioversion at ${e}J → Normal Sinus.`
        : `Cardioversion at ${e}J failed. Consider higher energy or repeat.`;
    } else {
      appropriate = false;
      if (Math.random() < 0.06) {
        nextRhythm = RHY.VF;
        message = `Unsynchronized shock in AF with RVR → degenerated to VF.`;
      } else {
        nextRhythm = RHY.AFIB_RVR;
        message = `Unsynchronized shock in AF is inappropriate.`;
      }
    }
  } else if (rhythm === RHY.VT_PULSE) {
    if (syncMode) {
      appropriate = true;
      const p = Math.max(0.35, Math.min(0.9, (e - 80) / 160)); // 100–200J
      converted = Math.random() < p;
      nextRhythm = converted ? RHY.SINUS : RHY.VT_PULSE;
      message = converted
        ? `Synchronized cardioversion at ${e}J → Normal Sinus.`
        : `Cardioversion at ${e}J failed. Increase energy or reattempt.`;
    } else {
      appropriate = false;
      if (Math.random() < 0.12) {
        nextRhythm = RHY.VF;
        message = `Unsynchronized shock in VT with a pulse → degenerated to VF.`;
      } else {
        nextRhythm = RHY.VT_PULSE;
        message = `Unsynchronized shock in VT with pulse is inappropriate.`;
      }
    }
  } else if (rhythm === RHY.ASYSTOLE || rhythm === RHY.PEA_NARROW || rhythm === RHY.SINUS) {
    appropriate = false;
    nextRhythm = rhythm;
    message = `Not a shockable rhythm. Focus on high-quality CPR/epinephrine & reversible causes.`;
  }

  return { appropriate, converted, message, nextRhythm };
}

function formatEnergy(e: number) {
  return `${Math.round(e)} J`;
}

export default function CardiacMonitorDefibSimulator() {
  // Device & display state
  const [powerOn, setPowerOn] = useState(true);
  const [padsOn, setPadsOn] = useState(true);
  const [speed, setSpeed] = useState<25 | 50>(25); // mm/s feel
  const [gain, setGain] = useState<5 | 10 | 20>(10); // mm/mV feel
  const [syncMode, setSyncMode] = useState(false);
  const [energy, setEnergy] = useState(200);
  const [charged, setCharged] = useState(false);
  const [charging, setCharging] = useState(false);
  const [scenario, setScenario] = useState<RhythmId>(RHY.VF);
  const [status, setStatus] = useState<string>("Press CHARGE, then SHOCK. Use SYNC for cardioversion.");
  const [shockFlashTs, setShockFlashTs] = useState<number>(0);

  // Generate & memoize waveform for current scenario
  const gen = useMemo(() => SCENARIOS[scenario].generator, [scenario]);
  const { buffer, rPeaks } = useMemo(() => gen(), [gen]);

  // Animation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastTs = useRef<number>(0);
  const scroll = useRef<number>(0); // in samples

  // Visible window in seconds depends on speed (faster speed → shorter display window width)
  const visibleSec = speed === 25 ? 6 : 3;
  const canvasHeight = 240; // px

  useEffect(() => {
    if (!powerOn) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !canvasRef.current) return;

    // Keep a single rafId declaration
    let rafId = 0;

    const drawGrid = (w: number, h: number) => {
      // background
      ctx.fillStyle = "#0b1a0f"; // dark green/black
      ctx.fillRect(0, 0, w, h);

      // minor grid
      for (let x = 0; x < w; x += GRID_MINOR_PX) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += GRID_MINOR_PX) {
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
      // major grid
      for (let x = 0; x < w; x += GRID_MINOR_PX * GRID_MAJOR_EVERY) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += GRID_MINOR_PX * GRID_MAJOR_EVERY) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
    };

    const draw = (ts: number) => {
      const canvas = canvasRef.current!;
      const w = canvas.width;
      const h = canvas.height;

      if (!lastTs.current) lastTs.current = ts;
      const dt = (ts - lastTs.current) / 1000; // seconds
      lastTs.current = ts;

      // Advance scroll by real-time sample rate
      scroll.current = (scroll.current + dt * SAMPLE_RATE) % buffer.length;

      drawGrid(w, h);

      // Waveform style
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Visible samples: map visibleSec across width
      const visSamples = Math.floor(visibleSec * SAMPLE_RATE);
      const startIdx = Math.floor(scroll.current) % buffer.length;

      const midY = h * 0.5;
      const gainScale = gain === 20 ? 36 : gain === 10 ? 24 : 14; // amplitude scaler

      for (let px = 0; px < w; px++) {
        const frac = px / w;
        const sampleOffset = Math.floor(frac * visSamples);
        const idx = (startIdx + sampleOffset) % buffer.length;
        const y = midY - buffer[idx] * gainScale;
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();

      // Sync markers (if enabled and rhythm is syncable)
      if (syncMode && SCENARIOS[scenario].syncable) {
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 1.5;
        const visStart = startIdx;
        const visEnd = (startIdx + visSamples) % buffer.length;
        const drawMarkerAt = (idx: number) => {
          let delta = idx - visStart;
          if (delta < 0) delta += buffer.length;
          const x = (delta / visSamples) * w;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, 18);
          ctx.stroke();
        };
        if (visStart < visEnd) {
          for (const rp of rPeaks) if (rp >= visStart && rp <= visEnd) drawMarkerAt(rp);
        } else {
          for (const rp of rPeaks) if (rp >= visStart || rp <= visEnd) drawMarkerAt(rp);
        }
      }

      // Shock flash overlay
      if (shockFlashTs && ts - shockFlashTs < 160) {
        const alpha = 1 - (ts - shockFlashTs) / 160;
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
        ctx.fillRect(0, 0, w, h);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [powerOn, buffer, gain, speed, scenario, syncMode, shockFlashTs]);

  // Handle charging
  const onCharge = () => {
    if (!powerOn) return setStatus("Power is OFF.");
    if (!padsOn) return setStatus("Attach pads first.");
    if (charging) return;
    setCharging(true);
    setCharged(false);
    setStatus(`Charging to ${formatEnergy(energy)}...`);
    const t = setTimeout(() => {
      setCharging(false);
      setCharged(true);
      setStatus(`Charged: ${formatEnergy(energy)}. Ready to shock.`);
    }, 1800);
    // cleanup safety
    setTimeout(() => clearTimeout(t), 2000);
  };

  const onShock = () => {
    if (!powerOn) return setStatus("Power is OFF.");
    if (!padsOn) return setStatus("Attach pads to patient first.");
    if (!charged) return setStatus("Not charged.");

    setShockFlashTs(performance.now());
    setCharged(false);

    const { appropriate, converted, message, nextRhythm } = handleShock(
      scenario,
      energy,
      syncMode
    );

    setStatus(
      `${syncMode ? "SYNCHRONIZED " : "UNSYNCHRONIZED "}SHOCK ${formatEnergy(
        energy
      )} → ${message} ${appropriate ? "[Appropriate]" : "[Inappropriate]"}`
    );

    setScenario(nextRhythm);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "c") onCharge();
      if (e.key === " ") {
        e.preventDefault();
        onShock();
      }
      if (e.key.toLowerCase() === "p") setPowerOn((v) => !v);
      if (e.key.toLowerCase() === "n") randomCase();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onShock]);

  const randomCase = () => {
    const pool: RhythmId[] = [
      RHY.VF,
      RHY.PVT,
      RHY.SVT,
      RHY.AFIB_RVR,
      RHY.VT_PULSE,
      RHY.ASYSTOLE,
      RHY.PEA_NARROW,
    ];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setScenario(pick);
    setStatus(`Case loaded: ${SCENARIOS[pick].label}. ${SCENARIOS[pick].desc}`);
    setCharged(false);
    setCharging(false);
  };

  // Canvas size responsive
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          const w = Math.max(420, Math.floor(entry.contentRect.width));
          setCanvasWidth(w);
        }
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="w-full min-h-[720px] bg-neutral-900 text-neutral-100 p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Monitor */}
        <div className="xl:col-span-2">
          <div ref={containerRef} className="w-full bg-neutral-800 rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full ${powerOn ? "bg-emerald-400" : "bg-neutral-500"}`}></span>
                Monitor
                <span className="text-xs text-neutral-400 ml-2">{SCENARIOS[scenario].label}</span>
              </div>
              <div className="text-xs text-neutral-400">Speed: {speed} mm/s · Gain: {gain} mm/mV</div>
            </div>
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className={`w-full rounded-xl border border-neutral-700 ${powerOn ? "opacity-100" : "opacity-40"}`}
            />
            <div className="mt-3 text-sm text-neutral-300 min-h-[48px]">
              {status}
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="xl:col-span-1">
          <div className="bg-neutral-800 rounded-2xl shadow-lg p-4 grid gap-4">
            {/* Power & Pads */}
            <div className="grid grid-cols-2 gap-3">
              <button
                className={`py-2 rounded-xl border ${powerOn ? "bg-emerald-600 border-emerald-500" : "bg-neutral-700 border-neutral-600"}`}
                onClick={() => setPowerOn((v) => !v)}
              >
                {powerOn ? "Power ON" : "Power OFF"} (P)
              </button>
              <button
                className={`py-2 rounded-xl border ${padsOn ? "bg-sky-700 border-sky-600" : "bg-neutral-700 border-neutral-600"}`}
                onClick={() => setPadsOn((v) => !v)}
              >
                {padsOn ? "Pads Attached" : "Attach Pads"}
              </button>
            </div>

            {/* Case controls */}
            <div className="grid gap-2">
              <label className="text-sm text-neutral-300">Load Rhythm</label>
              <select
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2"
                value={scenario}
                onChange={(e) => {
                  const v = e.target.value as RhythmId;
                  setScenario(v);
                  setStatus(`Loaded: ${SCENARIOS[v].label}. ${SCENARIOS[v].desc}`);
                  setCharged(false);
                  setCharging(false);
                }}
              >
                {Object.entries(SCENARIOS).map(([id, meta]) => (
                  <option key={id} value={id}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <button
                onClick={randomCase}
                className="mt-1 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-900 hover:bg-neutral-800"
              >
                Random Case (N)
              </button>
            </div>

            {/* Speed / Gain */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-neutral-300">Speed</label>
                <div className="flex gap-2 mt-1">
                  {[25, 50].map((s) => (
                    <button
                      key={s}
                      className={`px-3 py-2 rounded-lg border ${speed === s ? "bg-neutral-50 text-neutral-900" : "bg-neutral-900 border-neutral-600"}`}
                      onClick={() => setSpeed(s as 25 | 50)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-neutral-300">Gain</label>
                <div className="flex gap-2 mt-1">
                  {[5, 10, 20].map((g) => (
                    <button
                      key={g}
                      className={`px-3 py-2 rounded-lg border ${gain === g ? "bg-neutral-50 text-neutral-900" : "bg-neutral-900 border-neutral-600"}`}
                      onClick={() => setGain(g as 5 | 10 | 20)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sync */}
            <div>
              <label className="text-sm text-neutral-300">SYNCHRONIZED Mode (for cardioversion)</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="sync"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={syncMode}
                  onChange={(e) => setSyncMode(e.target.checked)}
                />
                <label htmlFor="sync" className="text-sm">
                  {syncMode ? "SYNC ON" : "SYNC OFF"}
                </label>
              </div>
            </div>

            {/* Energy */}
            <div>
              <label className="text-sm text-neutral-300">Energy: {formatEnergy(energy)}</label>
              <input
                type="range"
                min={10}
                max={360}
                step={10}
                value={energy}
                onChange={(e) => setEnergy(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[50, 70, 100, 120, 150, 200, 300, 360].map((j) => (
                  <button
                    key={j}
                    onClick={() => setEnergy(j)}
                    className={`px-2 py-1 rounded border ${energy === j ? "bg-neutral-50 text-neutral-900" : "bg-neutral-900 border-neutral-600"}`}
                  >
                    {j}J
                  </button>
                ))}
              </div>
            </div>

            {/* Charge / Shock */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onCharge}
                className={`py-3 rounded-xl border text-lg font-semibold ${
                  charging
                    ? "bg-amber-700 border-amber-600 animate-pulse"
                    : charged
                    ? "bg-amber-500 border-amber-400"
                    : "bg-neutral-900 border-neutral-600"
                }`}
              >
                {charging ? "Charging..." : charged ? "Charged" : "Charge (C)"}
              </button>
              <button
                onClick={onShock}
                disabled={!charged}
                className={`py-3 rounded-xl border text-lg font-bold ${
                  charged
                    ? "bg-red-600 border-red-500 hover:bg-red-500"
                    : "bg-neutral-800 border-neutral-700 text-neutral-400 cursor-not-allowed"
                }`}
              >
                SHOCK (Space)
              </button>
            </div>

            {/* Quick Tips */}
            <div className="text-xs text-neutral-400 leading-relaxed">
              <p className="mb-1">• Shockable: VF / pulseless VT → Defibrillate (unsynchronized).</p>
              <p className="mb-1">• SVT / Afib / VT with pulse → Synchronized cardioversion.</p>
              <p className="mb-1">• Asystole / PEA → No shocks; focus on CPR/epi & Hs/Ts.</p>
              <p>Educational simulator. Not a medical device. Don’t practice on your mother-in-law.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
