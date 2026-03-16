"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Terminal, Check } from "lucide-react";
import { CopyButton } from "./ui/CopyButton";

const codeRaw = `import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NodeRuntime, createNodeDriver, createNodeRuntimeDriverFactory } from "secure-exec";
import { z } from "zod";

const runtime = new NodeRuntime({
  systemDriver: createNodeDriver({ permissions: { fs: true, network: true } }),
  runtimeDriverFactory: createNodeRuntimeDriverFactory(),
  memoryLimit: 64,
  cpuTimeLimitMs: 5000,
});

const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),
  tools: {
    execute: tool({
      description: "Run JavaScript in a secure sandbox",
      parameters: z.object({ code: z.string() }),
      execute: async ({ code }) => {
        const logs: string[] = [];
        const res = await runtime.exec(code, {
          onStdio: (e) => logs.push(e.message),
        });
        return { exitCode: res.code, output: logs.join("\\n") };
      },
    }),
  },
  prompt: "Calculate the first 20 fibonacci numbers",
});`;

function CodeBlock() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2.5">
        <span className="text-xs font-medium text-zinc-500">agent.ts</span>
        <CopyButton text={codeRaw} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">
        <code>
          <span className="text-purple-400">import</span>
          <span className="text-zinc-300">{" { "}</span>
          <span className="text-white">generateText</span>
          <span className="text-zinc-300">, </span>
          <span className="text-white">tool</span>
          <span className="text-zinc-300">{" } "}</span>
          <span className="text-purple-400">from</span>
          <span className="text-zinc-300"> </span>
          <span className="text-green-400">"ai"</span>
          <span className="text-zinc-300">;</span>
          {"\n"}
          <span className="text-purple-400">import</span>
          <span className="text-zinc-300">{" { "}</span>
          <span className="text-white">anthropic</span>
          <span className="text-zinc-300">{" } "}</span>
          <span className="text-purple-400">from</span>
          <span className="text-zinc-300"> </span>
          <span className="text-green-400">"@ai-sdk/anthropic"</span>
          <span className="text-zinc-300">;</span>
          {"\n"}
          <span className="text-purple-400">import</span>
          <span className="text-zinc-300">{" { "}</span>
          <span className="text-white">NodeRuntime</span>
          <span className="text-zinc-300">, </span>
          <span className="text-white">createNodeDriver</span>
          <span className="text-zinc-300">, </span>
          <span className="text-white">createNodeRuntimeDriverFactory</span>
          <span className="text-zinc-300">{" } "}</span>
          <span className="text-purple-400">from</span>
          <span className="text-zinc-300"> </span>
          <span className="text-green-400">"secure-exec"</span>
          <span className="text-zinc-300">;</span>
          {"\n"}
          <span className="text-purple-400">import</span>
          <span className="text-zinc-300">{" { "}</span>
          <span className="text-white">z</span>
          <span className="text-zinc-300">{" } "}</span>
          <span className="text-purple-400">from</span>
          <span className="text-zinc-300"> </span>
          <span className="text-green-400">"zod"</span>
          <span className="text-zinc-300">;</span>
          {"\n\n"}

          <span className="text-zinc-500">// Create a sandboxed runtime</span>
          {"\n"}
          <span className="text-purple-400">const</span>
          <span className="text-zinc-300"> runtime = </span>
          <span className="text-purple-400">new</span>
          <span className="text-zinc-300"> </span>
          <span className="text-blue-400">NodeRuntime</span>
          <span className="text-zinc-300">{"({"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  systemDriver: "}</span>
          <span className="text-blue-400">createNodeDriver</span>
          <span className="text-zinc-300">{"({ permissions: { fs: "}</span>
          <span className="text-orange-400">true</span>
          <span className="text-zinc-300">{", network: "}</span>
          <span className="text-orange-400">true</span>
          <span className="text-zinc-300">{" } }),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  runtimeDriverFactory: "}</span>
          <span className="text-blue-400">createNodeRuntimeDriverFactory</span>
          <span className="text-zinc-300">{"(),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  memoryLimit: "}</span>
          <span className="text-orange-400">64</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">{"  cpuTimeLimitMs: "}</span>
          <span className="text-orange-400">5000</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">{"});"}</span>
          {"\n\n"}

          <span className="text-zinc-500">// Expose as an AI SDK tool</span>
          {"\n"}
          <span className="text-purple-400">const</span>
          <span className="text-zinc-300"> result = </span>
          <span className="text-purple-400">await</span>
          <span className="text-zinc-300"> </span>
          <span className="text-blue-400">generateText</span>
          <span className="text-zinc-300">{"({"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  model: "}</span>
          <span className="text-blue-400">anthropic</span>
          <span className="text-zinc-300">{"("}</span>
          <span className="text-green-400">"claude-sonnet-4-20250514"</span>
          <span className="text-zinc-300">{"),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  tools: {"}</span>
          {"\n"}
          <span className="text-zinc-300">{"    execute: "}</span>
          <span className="text-blue-400">tool</span>
          <span className="text-zinc-300">{"({"}</span>
          {"\n"}
          <span className="text-zinc-300">{"      description: "}</span>
          <span className="text-green-400">"Run JavaScript in a secure sandbox"</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">{"      parameters: z."}</span>
          <span className="text-blue-400">object</span>
          <span className="text-zinc-300">{"({ code: z."}</span>
          <span className="text-blue-400">string</span>
          <span className="text-zinc-300">{"() }),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"      execute: "}</span>
          <span className="text-purple-400">async</span>
          <span className="text-zinc-300">{" ({ code }) => {"}</span>
          {"\n"}
          <span className="text-zinc-300">{"        "}</span>
          <span className="text-purple-400">const</span>
          <span className="text-zinc-300">{" logs: "}</span>
          <span className="text-blue-400">string</span>
          <span className="text-zinc-300">{"[] = [];"}</span>
          {"\n"}
          <span className="text-zinc-300">{"        "}</span>
          <span className="text-purple-400">const</span>
          <span className="text-zinc-300">{" res = "}</span>
          <span className="text-purple-400">await</span>
          <span className="text-zinc-300">{" runtime."}</span>
          <span className="text-blue-400">exec</span>
          <span className="text-zinc-300">{"(code, {"}</span>
          {"\n"}
          <span className="text-zinc-300">{"          onStdio: (e) => logs."}</span>
          <span className="text-blue-400">push</span>
          <span className="text-zinc-300">{"(e.message),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"        });"}</span>
          {"\n"}
          <span className="text-zinc-300">{"        "}</span>
          <span className="text-purple-400">return</span>
          <span className="text-zinc-300">{" { exitCode: res.code, output: logs."}</span>
          <span className="text-blue-400">join</span>
          <span className="text-zinc-300">{"("}</span>
          <span className="text-green-400">"\\n"</span>
          <span className="text-zinc-300">{") };"}</span>
          {"\n"}
          <span className="text-zinc-300">{"      },"}</span>
          {"\n"}
          <span className="text-zinc-300">{"    }),"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  },"}</span>
          {"\n"}
          <span className="text-zinc-300">{"  prompt: "}</span>
          <span className="text-green-400">"Calculate the first 20 fibonacci numbers"</span>
          <span className="text-zinc-300">,</span>
          {"\n"}
          <span className="text-zinc-300">{"});"}</span>
        </code>
      </pre>
    </div>
  );
}

const CopyInstallButton = () => {
  const [copied, setCopied] = useState(false);
  const installCommand = "npm install secure-exec";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-white/10 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-white/20 hover:text-white font-mono"
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Terminal className="h-4 w-4 flex-shrink-0" />}
      <span>{installCommand}</span>
    </button>
  );
};

export function Hero() {
  const [scrollOpacity, setScrollOpacity] = useState(1);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateViewportMode = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setScrollOpacity(1);
      }
    };

    const handleScroll = () => {
      if (window.innerWidth < 1024) {
        setScrollOpacity(1);
        return;
      }
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const fadeStart = windowHeight * 0.15;
      const fadeEnd = windowHeight * 0.5;
      const opacity = 1 - Math.min(1, Math.max(0, (scrollY - fadeStart) / (fadeEnd - fadeStart)));
      setScrollOpacity(opacity);
    };

    updateViewportMode();
    handleScroll();
    window.addEventListener("resize", updateViewportMode);
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("resize", updateViewportMode);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ backgroundImage: "url('/hero-bg.jpg')", opacity: 0.15 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/60 via-[#09090b]/40 to-[#09090b] pointer-events-none" />

        <div
          className="flex flex-1 flex-col justify-start pt-32 lg:justify-center lg:pt-0 px-6"
          style={isMobile ? undefined : { opacity: scrollOpacity, filter: `blur(${(1 - scrollOpacity) * 8}px)` }}
        >
          <div className="mx-auto w-full max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="mb-12 md:mb-16 flex justify-center"
            >
              <img
                id="hero-logo"
                src="/secure-exec-logo.png"
                alt="Secure Exec"
                className="h-48 sm:h-56 md:h-72 lg:h-80 w-auto drop-shadow-[0_0_60px_rgba(14,165,164,0.15)]"
              />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-6 text-2xl font-bold leading-[1.15] uppercase tracking-[0.05em] sm:text-3xl md:text-[2.8rem] lg:text-5xl"
              style={{ fontFamily: "'Cinzel', serif", color: "#CC0000" }}
            >
              Secure Node.js Execution
              <br />
              Without a Sandbox
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mx-auto mb-10 max-w-xl md:max-w-2xl text-lg text-zinc-500 leading-relaxed"
            >
              Supports Node.js and npm packages natively.
              <br />
              Just a library. No containers, no VMs, no external services.
              <br />
              Powered by the same V8 isolate technology behind Cloudflare Workers and Chrome.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.9 }}
              className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
            >
              <a
                href="/docs"
                className="selection-dark inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
              <CopyInstallButton />
            </motion.div>
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto w-full max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl font-semibold text-white mb-3">Give your AI agent a secure sandbox</h2>
            <p className="text-zinc-500 max-w-lg mx-auto">
              Expose secure-exec as a tool with the Vercel AI SDK. Your agent can execute arbitrary code without risking your infrastructure.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <CodeBlock />
          </motion.div>
        </div>
      </section>
    </>
  );
}
