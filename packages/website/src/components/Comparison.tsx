"use client";

import { motion } from "framer-motion";

const secureExecItems = [
  "Native V8 performance",
  "Granular deny-by-default permissions",
  "Just npm install — no vendor account",
  "No API keys to manage",
  "Run on any cloud or hardware",
  "No egress fees",
];

const sandboxItems = [
  "Native container performance",
  "Coarse-grained permissions",
  "Vendor account required",
  "API keys to manage",
  "Hardware lock-in",
  "Per-GB egress fees",
];

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="text-red-400 mt-0.5 shrink-0">✓</span>
      <span className="text-zinc-300">{children}</span>
    </div>
  );
}

function CrossItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="text-zinc-600 mt-0.5 shrink-0">✗</span>
      <span className="text-zinc-500">{children}</span>
    </div>
  );
}

export function Comparison() {
  return (
    <section className="py-24">
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
            Secure Exec vs. Sandboxes
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-xl text-base leading-relaxed text-zinc-500"
          >
            Same isolation guarantees, without the infrastructure overhead.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-6"
        >
          {/* Secure Exec column */}
          <div className="rounded-xl bg-red-500/[0.03] border border-red-500/10 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3 mb-6">
              <img src="/secure-exec-logo-long.svg" alt="Secure Exec" className="h-5 w-auto" />
            </div>
            <div className="space-y-3.5">
              {secureExecItems.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </div>
          </div>

          {/* Sandbox provider column */}
          <div className="rounded-xl bg-white/[0.02] border border-white/5 p-6 sm:p-8 space-y-5">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm text-zinc-500 font-mono">Sandbox</span>
            </div>
            <div className="space-y-3.5">
              {sandboxItems.map((item, i) => (
                i === 0 ? <CheckItem key={item}>{item}</CheckItem> : <CrossItem key={item}>{item}</CrossItem>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-xs text-zinc-600"
        >
          <a href="/docs/sandbox-vs-secure-exec" className="underline underline-offset-2 hover:text-zinc-500">
            Full comparison →
          </a>
        </motion.p>
      </div>
    </section>
  );
}
