"use client";

import { motion } from "framer-motion";
import { Server, Package, Shield, Gauge, Globe, Cpu } from "lucide-react";

const features = [
  {
    icon: Server,
    title: "No infrastructure required",
    description:
      "No Docker daemon, no hypervisor, no orchestrator. Runs anywhere Node.js, Bun, or an HTML5 browser runs. Deploy to Lambda, a VPS, or a static site — your existing deployment works.",
    hoverColor: "group-hover:text-blue-400",
  },
  {
    icon: Package,
    title: "Node.js & npm compatibility",
    description:
      "fs, child_process, http, dns, process, os — bridged to real host capabilities, not stubbed. Run Express, Hono, Next.js, and any npm package.",
    hoverColor: "group-hover:text-green-400",
    link: { href: "/docs/node-compatability", label: "Compatibility matrix" },
  },
  {
    icon: Shield,
    title: "Deny-by-default permissions",
    description:
      "Filesystem, network, child processes, and env vars are all blocked unless explicitly allowed. Permissions are composable functions — grant read but not write, allow fetch but block spawn.",
    hoverColor: "group-hover:text-purple-400",
  },
  {
    icon: Gauge,
    title: "Configurable resource limits",
    description:
      "CPU time budgets and memory caps. Runaway code is terminated deterministically with exit code 124 — no OOM crashes, no infinite loops, no host exhaustion.",
    hoverColor: "group-hover:text-amber-400",
  },
  {
    icon: Cpu,
    title: "Fast cold starts & low memory",
    description:
      "No container to boot, no filesystem image to mount, no process to fork. Isolate creation is measured in milliseconds. Memory overhead is measured in single-digit megabytes.",
    hoverColor: "group-hover:text-pink-400",
  },
  {
    icon: Globe,
    title: "Powered by V8 isolates",
    description:
      "The same isolation primitive behind Cloudflare Workers for Platforms and every browser tab. Battle-tested at scale by the infrastructure you already trust.",
    hoverColor: "group-hover:text-orange-400",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="border-t border-white/10 py-48">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-2 text-2xl font-normal tracking-tight text-white md:text-4xl"
          >
            Why Secure Exec
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-xl text-base leading-relaxed text-zinc-500"
          >
            V8 isolate-based execution with full Node.js compatibility, granular permissions, and resource limits.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/20"
            >
              <div className="flex items-center gap-3">
                <div className={`text-zinc-500 transition-colors ${feature.hoverColor}`}>
                  <feature.icon className="h-4 w-4" />
                </div>
                <h4 className="text-base font-normal text-white">{feature.title}</h4>
              </div>
              <p className="text-zinc-500 text-sm leading-relaxed">{feature.description}</p>
              {feature.link && (
                <a href={feature.link.href} className="text-sm text-accent hover:text-orange-300 transition-colors">
                  {feature.link.label} &rarr;
                </a>
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
