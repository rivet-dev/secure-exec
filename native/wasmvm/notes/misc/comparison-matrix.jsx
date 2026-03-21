import { useState, useMemo } from "react";

const data = [
  // === File Operations ===
  { cmd: "cat", category: "File Operations", justBash: true, uutils: true },
  { cmd: "cp", category: "File Operations", justBash: true, uutils: true },
  { cmd: "dd", category: "File Operations", justBash: false, uutils: true },
  { cmd: "dir", category: "File Operations", justBash: false, uutils: true },
  { cmd: "file", category: "File Operations", justBash: true, uutils: false },
  { cmd: "install", category: "File Operations", justBash: false, uutils: true },
  { cmd: "link", category: "File Operations", justBash: false, uutils: true },
  { cmd: "ln", category: "File Operations", justBash: true, uutils: true },
  { cmd: "ls", category: "File Operations", justBash: true, uutils: true },
  { cmd: "mkdir", category: "File Operations", justBash: true, uutils: true },
  { cmd: "mkfifo", category: "File Operations", justBash: false, uutils: true },
  { cmd: "mknod", category: "File Operations", justBash: false, uutils: true },
  { cmd: "mktemp", category: "File Operations", justBash: false, uutils: true },
  { cmd: "mv", category: "File Operations", justBash: true, uutils: true },
  { cmd: "readlink", category: "File Operations", justBash: true, uutils: true },
  { cmd: "realpath", category: "File Operations", justBash: false, uutils: true },
  { cmd: "rm", category: "File Operations", justBash: true, uutils: true },
  { cmd: "rmdir", category: "File Operations", justBash: true, uutils: true },
  { cmd: "shred", category: "File Operations", justBash: false, uutils: true },
  { cmd: "split", category: "File Operations", justBash: true, uutils: true },
  { cmd: "stat", category: "File Operations", justBash: true, uutils: true },
  { cmd: "sync", category: "File Operations", justBash: false, uutils: true },
  { cmd: "touch", category: "File Operations", justBash: true, uutils: true },
  { cmd: "tree", category: "File Operations", justBash: true, uutils: false },
  { cmd: "truncate", category: "File Operations", justBash: false, uutils: true },
  { cmd: "unlink", category: "File Operations", justBash: false, uutils: true },
  { cmd: "vdir", category: "File Operations", justBash: false, uutils: true },

  // === Text Processing ===
  { cmd: "awk", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "comm", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "csplit", category: "Text Processing", justBash: false, uutils: true },
  { cmd: "cut", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "diff", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "expand", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "fmt", category: "Text Processing", justBash: false, uutils: true },
  { cmd: "fold", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "grep", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "head", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "join", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "nl", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "od", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "paste", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "pr", category: "Text Processing", justBash: false, uutils: true },
  { cmd: "ptx", category: "Text Processing", justBash: false, uutils: true },
  { cmd: "rev", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "rg", category: "Text Processing", justBash: true, uutils: false, note: "ripgrep" },
  { cmd: "sed", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "sort", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "strings", category: "Text Processing", justBash: true, uutils: false },
  { cmd: "tac", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "tail", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "tr", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "tsort", category: "Text Processing", justBash: false, uutils: true },
  { cmd: "unexpand", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "uniq", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "wc", category: "Text Processing", justBash: true, uutils: true },
  { cmd: "column", category: "Text Processing", justBash: true, uutils: false },

  // === Output / Printing ===
  { cmd: "echo", category: "Output / Printing", justBash: true, uutils: true },
  { cmd: "printf", category: "Output / Printing", justBash: true, uutils: true },
  { cmd: "tee", category: "Output / Printing", justBash: true, uutils: true },
  { cmd: "yes", category: "Output / Printing", justBash: false, uutils: true },

  // === Checksums & Encoding ===
  { cmd: "base32", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "base64", category: "Checksums & Encoding", justBash: true, uutils: true },
  { cmd: "basenc", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "cksum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "md5sum", category: "Checksums & Encoding", justBash: true, uutils: true },
  { cmd: "sha1sum", category: "Checksums & Encoding", justBash: true, uutils: true },
  { cmd: "sha224sum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "sha256sum", category: "Checksums & Encoding", justBash: true, uutils: true },
  { cmd: "sha384sum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "sha512sum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "b2sum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "b3sum", category: "Checksums & Encoding", justBash: false, uutils: true },
  { cmd: "sum", category: "Checksums & Encoding", justBash: false, uutils: true },

  // === Permissions & Ownership ===
  { cmd: "chcon", category: "Permissions & Ownership", justBash: false, uutils: true, note: "SELinux" },
  { cmd: "chgrp", category: "Permissions & Ownership", justBash: false, uutils: true },
  { cmd: "chmod", category: "Permissions & Ownership", justBash: true, uutils: true },
  { cmd: "chown", category: "Permissions & Ownership", justBash: false, uutils: true },
  { cmd: "runcon", category: "Permissions & Ownership", justBash: false, uutils: true, note: "SELinux" },

  // === Navigation & Path ===
  { cmd: "basename", category: "Navigation & Path", justBash: true, uutils: true },
  { cmd: "cd", category: "Navigation & Path", justBash: true, uutils: false, note: "shell builtin" },
  { cmd: "dirname", category: "Navigation & Path", justBash: true, uutils: true },
  { cmd: "pwd", category: "Navigation & Path", justBash: true, uutils: true },
  { cmd: "pathchk", category: "Navigation & Path", justBash: false, uutils: true },

  // === Disk & Filesystem ===
  { cmd: "df", category: "Disk & Filesystem", justBash: false, uutils: true },
  { cmd: "du", category: "Disk & Filesystem", justBash: true, uutils: true },

  // === System Info & Environment ===
  { cmd: "arch", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "date", category: "System & Environment", justBash: true, uutils: true },
  { cmd: "env", category: "System & Environment", justBash: true, uutils: true },
  { cmd: "export", category: "System & Environment", justBash: true, uutils: false, note: "shell builtin" },
  { cmd: "groups", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "hostid", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "hostname", category: "System & Environment", justBash: true, uutils: true },
  { cmd: "id", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "logname", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "nproc", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "pinky", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "printenv", category: "System & Environment", justBash: true, uutils: true },
  { cmd: "stty", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "tty", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "uname", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "uptime", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "users", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "who", category: "System & Environment", justBash: false, uutils: true },
  { cmd: "whoami", category: "System & Environment", justBash: true, uutils: true },

  // === Process & Execution ===
  { cmd: "chroot", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "expr", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "factor", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "false", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "kill", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "nice", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "nohup", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "numfmt", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "seq", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "shuf", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "sleep", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "stdbuf", category: "Process & Execution", justBash: false, uutils: true },
  { cmd: "test", category: "Process & Execution", justBash: false, uutils: true, note: "[ ]" },
  { cmd: "timeout", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "true", category: "Process & Execution", justBash: true, uutils: true },
  { cmd: "xargs", category: "Process & Execution", justBash: true, uutils: false, note: "findutils" },

  // === Search ===
  { cmd: "find", category: "Search", justBash: true, uutils: false, note: "findutils" },

  // === Formatting & Display ===
  { cmd: "dircolors", category: "Formatting & Display", justBash: false, uutils: true },

  // === Compression ===
  { cmd: "gzip", category: "Compression", justBash: true, uutils: false },
  { cmd: "gunzip", category: "Compression", justBash: true, uutils: false },
  { cmd: "zcat", category: "Compression", justBash: true, uutils: false },
  { cmd: "tar", category: "Compression", justBash: true, uutils: false },

  // === Shell Utilities (just-bash specific) ===
  { cmd: "alias", category: "Shell Builtins", justBash: true, uutils: false, note: "shell builtin" },
  { cmd: "bash", category: "Shell Builtins", justBash: true, uutils: false, note: "shell" },
  { cmd: "clear", category: "Shell Builtins", justBash: true, uutils: false },
  { cmd: "help", category: "Shell Builtins", justBash: true, uutils: false },
  { cmd: "history", category: "Shell Builtins", justBash: true, uutils: false },
  { cmd: "sh", category: "Shell Builtins", justBash: true, uutils: false, note: "shell" },
  { cmd: "time", category: "Shell Builtins", justBash: true, uutils: false },
  { cmd: "unalias", category: "Shell Builtins", justBash: true, uutils: false, note: "shell builtin" },
  { cmd: "which", category: "Shell Builtins", justBash: true, uutils: false },

  // === Data Processing (just-bash specific) ===
  { cmd: "jq", category: "Data Processing", justBash: true, uutils: false, note: "JSON" },
  { cmd: "yq", category: "Data Processing", justBash: true, uutils: false, note: "YAML/XML/TOML" },
  { cmd: "xan", category: "Data Processing", justBash: true, uutils: false, note: "CSV" },
  { cmd: "sqlite3", category: "Data Processing", justBash: true, uutils: false, note: "SQL" },
  { cmd: "python3", category: "Data Processing", justBash: true, uutils: false, note: "opt-in runtime" },
  { cmd: "js-exec", category: "Data Processing", justBash: true, uutils: false, note: "opt-in runtime" },

  // === Network ===
  { cmd: "curl", category: "Network", justBash: true, uutils: false, note: "opt-in" },
  { cmd: "html-to-markdown", category: "Network", justBash: true, uutils: false, note: "opt-in" },
];

const CATEGORY_ORDER = [
  "File Operations",
  "Text Processing",
  "Output / Printing",
  "Checksums & Encoding",
  "Permissions & Ownership",
  "Navigation & Path",
  "Disk & Filesystem",
  "System & Environment",
  "Process & Execution",
  "Search",
  "Formatting & Display",
  "Compression",
  "Shell Builtins",
  "Data Processing",
  "Network",
];

const FILTERS = ["All", "Both", "just-bash only", "uutils only"];

export default function ComparisonMatrix() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let items = data;
    if (filter === "Both") items = items.filter((d) => d.justBash && d.uutils);
    if (filter === "just-bash only") items = items.filter((d) => d.justBash && !d.uutils);
    if (filter === "uutils only") items = items.filter((d) => !d.justBash && d.uutils);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (d) => d.cmd.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [filter, search]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((d) => {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    });
    return CATEGORY_ORDER.filter((c) => map[c]).map((c) => ({
      category: c,
      items: map[c].sort((a, b) => a.cmd.localeCompare(b.cmd)),
    }));
  }, [filtered]);

  const stats = useMemo(() => {
    const both = data.filter((d) => d.justBash && d.uutils).length;
    const jbOnly = data.filter((d) => d.justBash && !d.uutils).length;
    const uuOnly = data.filter((d) => !d.justBash && d.uutils).length;
    const jbTotal = data.filter((d) => d.justBash).length;
    const uuTotal = data.filter((d) => d.uutils).length;
    return { both, jbOnly, uuOnly, jbTotal, uuTotal, total: data.length };
  }, []);

  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
      background: "#0a0a0f",
      color: "#c8c8d4",
      minHeight: "100vh",
      padding: "28px 24px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #12121a; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 11,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "#5a5a70",
          marginBottom: 8,
        }}>Comparison Matrix</div>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 26,
          fontWeight: 700,
          margin: 0,
          color: "#eeeef4",
          lineHeight: 1.2,
        }}>
          <span style={{ color: "#58d68d" }}>just-bash</span>
          <span style={{ color: "#3a3a4a", margin: "0 12px" }}>vs</span>
          <span style={{ color: "#5dade2" }}>uutils/coreutils</span>
        </h1>
        <p style={{ fontSize: 12, color: "#6a6a7e", margin: "6px 0 0" }}>
          Vercel's sandboxed TypeScript bash interpreter vs Rust reimplementation of GNU coreutils
        </p>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex",
        gap: 1,
        marginBottom: 20,
        borderRadius: 6,
        overflow: "hidden",
      }}>
        {[
          { label: "just-bash", count: stats.jbTotal, color: "#58d68d", bg: "#0f1f16" },
          { label: "Overlap", count: stats.both, color: "#f4d03f", bg: "#1f1d0f" },
          { label: "uutils", count: stats.uuTotal, color: "#5dade2", bg: "#0f161f" },
          { label: "Total unique", count: stats.total, color: "#c8c8d4", bg: "#15151f" },
        ].map((s) => (
          <div key={s.label} style={{
            flex: 1,
            background: s.bg,
            padding: "12px 14px",
            borderTop: `2px solid ${s.color}22`,
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'Space Grotesk', sans-serif" }}>{s.count}</div>
            <div style={{ fontSize: 10, color: "#5a5a70", letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search commands..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#12121a",
            border: "1px solid #2a2a3a",
            color: "#c8c8d4",
            padding: "7px 12px",
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "inherit",
            width: 180,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? "#1e1e2e" : "transparent",
                border: `1px solid ${filter === f ? "#3a3a5a" : "#1e1e2e"}`,
                color: filter === f ? "#eeeef4" : "#5a5a70",
                padding: "6px 12px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >{f}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#4a4a5e", marginLeft: "auto" }}>
          {filtered.length} command{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 6, overflow: "hidden", border: "1px solid #1e1e2e" }}>
        {/* Table header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 160px 100px 100px",
          background: "#12121a",
          padding: "10px 16px",
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "#5a5a70",
          fontWeight: 600,
          borderBottom: "1px solid #1e1e2e",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}>
          <span>Command</span>
          <span>Category</span>
          <span style={{ textAlign: "center", color: "#58d68d" }}>just-bash</span>
          <span style={{ textAlign: "center", color: "#5dade2" }}>uutils</span>
        </div>

        {grouped.map((group) => (
          <div key={group.category}>
            {/* Category divider */}
            <div style={{
              background: "#0e0e16",
              padding: "8px 16px",
              fontSize: 10,
              fontWeight: 600,
              color: "#4a4a5e",
              letterSpacing: 2,
              textTransform: "uppercase",
              borderBottom: "1px solid #1a1a26",
              borderTop: "1px solid #1a1a26",
            }}>
              {group.category}
              <span style={{ color: "#3a3a4a", marginLeft: 8, fontWeight: 400 }}>
                ({group.items.length})
              </span>
            </div>
            {group.items.map((item, idx) => (
              <div
                key={item.cmd}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 100px 100px",
                  padding: "7px 16px",
                  fontSize: 12,
                  borderBottom: "1px solid #14141e",
                  background: idx % 2 === 0 ? "#0a0a0f" : "#0c0c14",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#14142a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "#0a0a0f" : "#0c0c14")}
              >
                <span style={{ fontWeight: 500, color: "#dddde8" }}>
                  {item.cmd}
                  {item.note && (
                    <span style={{
                      fontSize: 9,
                      color: "#4a4a5e",
                      marginLeft: 8,
                      padding: "1px 5px",
                      background: "#16161e",
                      borderRadius: 3,
                      border: "1px solid #22222e",
                    }}>{item.note}</span>
                  )}
                </span>
                <span style={{ color: "#4a4a5e", fontSize: 11 }}>{item.category}</span>
                <span style={{ textAlign: "center" }}>
                  {item.justBash ? (
                    <span style={{ color: "#58d68d", fontSize: 15, fontWeight: 700 }}>●</span>
                  ) : (
                    <span style={{ color: "#2a2a3a" }}>—</span>
                  )}
                </span>
                <span style={{ textAlign: "center" }}>
                  {item.uutils ? (
                    <span style={{ color: "#5dade2", fontSize: 15, fontWeight: 700 }}>●</span>
                  ) : (
                    <span style={{ color: "#2a2a3a" }}>—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footer legend */}
      <div style={{
        marginTop: 16,
        padding: "14px 16px",
        background: "#0e0e16",
        borderRadius: 6,
        fontSize: 11,
        color: "#5a5a70",
        lineHeight: 1.6,
        border: "1px solid #1a1a26",
      }}>
        <strong style={{ color: "#8a8a9e" }}>Notes:</strong>{" "}
        <span style={{ color: "#58d68d" }}>just-bash</span> is a pure-TypeScript sandboxed bash interpreter
        with extra data-processing tools (jq, yq, sqlite3, python3).{" "}
        <span style={{ color: "#5dade2" }}>uutils/coreutils</span> is a Rust reimplementation of
        GNU coreutils focused on full POSIX/GNU compatibility. Tools like grep, sed, awk, find, and xargs
        are not part of GNU coreutils (they belong to grep, sed, gawk, findutils) but are included in just-bash.
      </div>
    </div>
  );
}
