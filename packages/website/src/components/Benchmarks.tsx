"use client";

import { useState } from "react";
import { motion } from "framer-motion";

const ACCENT = "#CC0000";
const ACCENT_LIGHT = "#FF3333";

function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative group/tip inline-flex ml-1.5 align-middle">
      <svg
        className="w-3.5 h-3.5 text-zinc-600 group-hover/tip:text-zinc-400 cursor-help transition-colors"
        viewBox="0 0 16 16"
        fill="currentColor"
      >
        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm1 12H7V7h2v5zm-1-6a1 1 0 110-2 1 1 0 010 2z" />
      </svg>
      <span className="absolute bottom-full left-0 mb-2 w-72 p-3 rounded-lg bg-zinc-800/95 backdrop-blur-sm text-[11px] text-zinc-300 leading-relaxed shadow-xl border border-zinc-700/50 z-50 opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto transition-opacity duration-200 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </span>
    </span>
  );
}

/* Cold start with p50/p95/p99 tabs — single bar pair visible at a time */
function ColdStartChart() {
  const groups = [
    { label: "p50", secureExec: 16.2, sandbox: 440 },
    { label: "p95", secureExec: 17.9, sandbox: 950 },
    { label: "p99", secureExec: 17.9, sandbox: 3150 },
  ];
  const [active, setActive] = useState(2);
  const g = groups[active];
  const sePct = Math.max((g.secureExec / g.sandbox) * 100, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div>
          <h4 className="text-sm font-medium text-white flex items-center">
            Cold start
            <InfoTooltip>
            Time to interactive (TTI). Sandbox values use the fastest provider — e2b (best median) from{" "}
            <a href="https://www.computesdk.com/benchmarks/" target="_blank" rel="noopener noreferrer">
              ComputeSDK
            </a>{" "}
            as of March 2026. Secure Exec measured over 100 iterations × 100 samples.{" "}
            <a href="/docs/benchmarks">Our benchmarks →</a>
            </InfoTooltip>
          </h4>
          <p className="text-[11px] text-zinc-600 italic mt-1">Lower is better</p>
        </div>
        <div className="flex gap-1 ml-auto">
          {groups.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActive(i)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors ${
                i === active
                  ? "bg-white/10 text-white"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {/* Secure Exec bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">Secure Exec</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              key={active}
              initial={{ width: 0 }}
              animate={{ width: `${sePct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_LIGHT})` }}
            />
            <span
              className="absolute inset-y-0 flex items-center gap-2 text-xs font-mono font-medium z-10 text-zinc-400"
              style={{ left: `calc(${sePct}% + 8px)` }}
            >
              {g.secureExec} ms
              <span className="text-[11px] font-semibold" style={{ color: ACCENT_LIGHT }}>
                {Math.round(g.sandbox / g.secureExec)}x faster
              </span>
            </span>
          </div>
        </div>
        {/* Sandbox bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">Fastest sandbox</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              key={active}
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }}
              className="absolute inset-y-0 left-0 rounded-sm bg-zinc-600"
            />
            <span className="absolute inset-y-0 left-2 flex items-center text-xs font-mono text-zinc-300 z-10">
              {g.sandbox.toLocaleString()} ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Standard comparison bar for memory/cost metrics */
function MetricBar({
  label,
  tooltip,
  secureExec,
  sandbox,
  multiplier,
}: {
  label: string;
  tooltip?: React.ReactNode;
  secureExec: { value: string; bar: number };
  sandbox: { value: string; bar: number; label: string };
  multiplier?: string;
}) {
  const barMin = Math.max(secureExec.bar, 1);
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-white flex items-center">
          {label}
          {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
        </h4>
        <p className="text-[11px] text-zinc-600 italic mt-1">Lower is better</p>
      </div>
      <div className="space-y-1.5">
        {/* Secure Exec bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">Secure Exec</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${barMin}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_LIGHT})` }}
            />
            <span
              className="absolute inset-y-0 flex items-center gap-2 text-xs font-mono font-medium z-10 text-zinc-400"
              style={{ left: `calc(${barMin}% + 8px)` }}
            >
              {secureExec.value}
              {multiplier && (
                <span className="text-[11px] font-semibold" style={{ color: ACCENT_LIGHT }}>
                  {multiplier}
                </span>
              )}
            </span>
          </div>
        </div>
        {/* Sandbox bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">{sandbox.label}</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${sandbox.bar}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.05 }}
              className="absolute inset-y-0 left-0 rounded-sm bg-zinc-600"
            />
            <span className="absolute inset-y-0 left-2 flex items-center text-xs font-mono text-zinc-300 z-10">
              {sandbox.value}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Cost per execution-second with hardware tier tabs */
function CostChart() {
  const tiers = [
    { label: "AWS ARM", value: "$0.000011/s", multiplier: "56x cheaper", bar: 1.8 },
    { label: "AWS x86", value: "$0.000014/s", multiplier: "45x cheaper", bar: 2.2 },
    { label: "Hetzner ARM", value: "$0.0000016/s", multiplier: "380x cheaper", bar: 0.3 },
    { label: "Hetzner x86", value: "$0.0000027/s", multiplier: "232x cheaper", bar: 0.4 },
  ];
  const [active, setActive] = useState(0);
  const t = tiers[active];
  const barMin = Math.max(t.bar, 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div>
          <h4 className="text-sm font-medium text-white flex items-center">
            Cost per execution-second
            <InfoTooltip>
              Sandbox value uses the cheapest provider — Cloudflare Containers (256 MB min, billed per second at $0.0000025/GiB·s) as of March 2026.
              Secure Exec: 3.4 MB baseline (p95) with 30% empty capacity assumed across self-hosted hardware tiers.{" "}
              <a href="/docs/benchmarks">Our benchmarks →</a>
              {" · "}
              <a href="/docs/cost-evaluation">Full cost breakdown →</a>
            </InfoTooltip>
          </h4>
          <p className="text-[11px] text-zinc-600 italic mt-1">Lower is better</p>
        </div>
        <div className="flex gap-1 ml-auto">
          {tiers.map((tier, i) => (
            <button
              key={tier.label}
              onClick={() => setActive(i)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono tracking-wider transition-colors ${
                i === active
                  ? "bg-white/10 text-white"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {/* Secure Exec bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">Secure Exec</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              key={active}
              initial={{ width: 0 }}
              animate={{ width: `${barMin}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_LIGHT})` }}
            />
            <span
              className="absolute inset-y-0 flex items-center gap-2 text-xs font-mono font-medium z-10 text-zinc-400"
              style={{ left: `calc(${barMin}% + 8px)` }}
            >
              {t.value}
              <span className="text-[11px] font-semibold" style={{ color: ACCENT_LIGHT }}>
                {t.multiplier}
              </span>
            </span>
          </div>
        </div>
        {/* Sandbox bar */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 w-48 shrink-0 font-mono">Cheapest sandbox</span>
          <div className="flex-1 relative h-7 bg-white/5 rounded-sm overflow-hidden">
            <motion.div
              key={active}
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.05 }}
              className="absolute inset-y-0 left-0 rounded-sm bg-zinc-600"
            />
            <span className="absolute inset-y-0 left-2 flex items-center text-xs font-mono text-zinc-300 z-10">
              $0.000625/s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Benchmarks() {
  return (
    <section id="benchmarks" className="border-t border-white/10 py-48">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-2 text-2xl font-normal tracking-tight text-white md:text-4xl"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            Benchmarks
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-xl text-base leading-relaxed text-zinc-500"
          >
            V8 isolates vs. container-based sandboxes.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-xl bg-white/[0.02] p-8 chrome-gradient-border"
          style={{ "--chrome-angle": "75deg" } as React.CSSProperties}
        >
          {/* Cold start charts */}
          <ColdStartChart />

          <div className="border-t border-white/5 my-8" />

          {/* Memory */}
          <MetricBar
            label="Memory per instance"
            tooltip={
              <>
                Secure Exec memory is the converged at-scale average per execution.
                Sandbox value uses the smallest minimum among popular providers (e2b, Daytona, Modal, Cloudflare) as of March 2026 — 256 MB for Modal and Cloudflare.{" "}
                <a href="/docs/benchmarks">Our benchmarks →</a>
              </>
            }
            secureExec={{ value: "~3.4 MB", bar: 2 }}
            sandbox={{ value: "~256 MB", bar: 100, label: "Sandbox provider minimum" }}
            multiplier="75x smaller"
          />

          <div className="border-t border-white/5 my-8" />

          {/* Cost */}
          <CostChart />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-4 text-xs text-zinc-600"
        >
          Sandbox provider numbers based on published documentation and benchmarks.
          Secure Exec measured on Intel i7-12700KF, Node.js v24.{" "}
          <a href="/docs/benchmarks" className="underline underline-offset-2 hover:text-zinc-500">
            Methodology →
          </a>
          {" · "}
          <a href="/docs/cost-evaluation" className="underline underline-offset-2 hover:text-zinc-500">
            Cost breakdown →
          </a>
        </motion.p>
      </div>
    </section>
  );
}
