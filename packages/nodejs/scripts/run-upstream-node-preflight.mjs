#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import dns from "node:dns";
import { once } from "node:events";
import { createRequire } from "node:module";
import net from "node:net";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROBE_NAMES = [
	"bootstrap-realm",
	"bootstrap-node",
	"module-wrap",
	"contextify",
	"uv-net",
	"cares-lookup",
];

if (process.argv[2] === "--child") {
	const name = process.argv[3];
	if (!name) {
		throw new Error("missing probe name");
	}

	try {
		const result = await runChildProbe(name);
		process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	} catch (error) {
		process.stdout.write(
			`${JSON.stringify(
				{
					name,
					status: "blocked",
					blockerId: "probe-threw",
					summary: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				},
				null,
				2,
			)}\n`,
		);
		process.exitCode = 1;
	}
} else {
	const probes = PROBE_NAMES.map(runProbeInChild);
	process.stdout.write(
		`${JSON.stringify(
			{
				runner: "upstream-node-preflight",
				nodeVersion: process.version,
				executedAt: new Date().toISOString(),
				probes,
			},
			null,
			2,
		)}\n`,
	);
}

function runProbeInChild(name) {
	const child = spawnSync(
		process.execPath,
		["--expose-internals", "--no-warnings", SCRIPT_PATH, "--child", name],
		{
			encoding: "utf8",
			timeout: 20_000,
			maxBuffer: 4 * 1024 * 1024,
		},
	);

	const parsed = parseJson(child.stdout);
	if (parsed) {
		return parsed;
	}

	return normalizeChildFailure(name, child);
}

function parseJson(stdout) {
	const trimmed = stdout?.trim();
	if (!trimmed) {
		return null;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

function excerpt(value) {
	if (!value) {
		return "";
	}

	const normalized = value.trim();
	return normalized.length > 600 ? `${normalized.slice(0, 600)}...` : normalized;
}

function normalizeChildFailure(name, child) {
	const stderr = child.stderr ?? "";

	if (
		name === "bootstrap-node" &&
		(/async_hooks_init_function\(\)\.IsEmpty\(\)/.test(stderr) ||
			/void node::SetupHooks/.test(stderr))
	) {
		return {
			name,
			status: "blocked",
			blockerId: "async-wrap-init",
			summary:
				"internal/bootstrap/node replay reaches async_wrap.setupHooks and aborts because the host environment never initialized async hook state",
			exitCode: child.status,
			requiredHarnessShims: [
				"mutable-process-prototype",
				"buffer.setBufferPrototype-noop",
			],
			stderrExcerpt: excerpt(stderr),
		};
	}

	if (
		name === "bootstrap-node" &&
		/bufferBinding\.setBufferPrototype is not a function/.test(stderr)
	) {
		return {
			name,
			status: "blocked",
			blockerId: "buffer-bootstrap-surface",
			summary:
				"internal/bootstrap/node replay expects internalBinding('buffer').setBufferPrototype before async_wrap is even reached",
			exitCode: child.status,
			stderrExcerpt: excerpt(stderr),
		};
	}

	if (child.error) {
		return {
			name,
			status: "blocked",
			blockerId: "spawn-error",
			summary: child.error.message,
			exitCode: child.status ?? null,
			signal: child.signal ?? null,
			stderrExcerpt: excerpt(stderr),
		};
	}

	return {
		name,
		status: "blocked",
		blockerId: "child-exit",
		summary: `probe exited with code ${child.status ?? "unknown"}${child.signal ? ` (${child.signal})` : ""}`,
		exitCode: child.status ?? null,
		signal: child.signal ?? null,
		stdoutExcerpt: excerpt(child.stdout ?? ""),
		stderrExcerpt: excerpt(stderr),
	};
}

function unique(values) {
	return [...new Set(values)];
}

function getNativeSource(id) {
	const source = process.binding("natives")[id];
	if (typeof source !== "string") {
		throw new Error(`missing builtin source for ${id}`);
	}
	return source;
}

function loadPrimordials() {
	const primordials = {};
	const source = getNativeSource("internal/per_context/primordials");
	const fn = vm.compileFunction(source, ["primordials"], {
		filename: "internal/per_context/primordials.js",
	});
	fn(primordials);
	return primordials;
}

function createRealmSupport(processShim, primordials, callLog) {
	const { internalBinding } = require("internal/test/binding");
	const builtinCache = new Map();

	function compileBuiltin(id) {
		return vm.compileFunction(
			getNativeSource(id),
			["exports", "require", "module", "process", "internalBinding", "primordials"],
			{ filename: `${id}.js` },
		);
	}

	function requireBuiltin(id) {
		if (builtinCache.has(id)) {
			return builtinCache.get(id).exports;
		}

		const moduleRecord = { exports: {} };
		builtinCache.set(id, moduleRecord);
		compileBuiltin(id)(
			moduleRecord.exports,
			requireBuiltin,
			moduleRecord,
			processShim,
			internalBindingShim,
			primordials,
		);
		return moduleRecord.exports;
	}

	let capturedLoaders = null;

	function internalBindingShim(name) {
		callLog.requestedBindings.push(name);

		if (name === "builtins") {
			return {
				builtinIds: Object.keys(process.binding("natives")),
				compileFunction(id) {
					callLog.compiledBuiltins.push(id);
					return compileBuiltin(id);
				},
				setInternalLoaders(internalBindingFn, requireBuiltinFn) {
					capturedLoaders = {
						internalBinding: internalBindingFn,
						requireBuiltin: requireBuiltinFn,
					};
				},
			};
		}

		if (name === "buffer") {
			return {
				...internalBinding("buffer"),
				setBufferPrototype() {},
			};
		}

		return internalBinding(name);
	}

	return {
		internalBindingShim,
		requireBuiltin,
		getCapturedLoaders() {
			return capturedLoaders;
		},
	};
}

function createBootstrapNodeProcessShim() {
	const { internalBinding } = require("internal/test/binding");
	const utilBinding = internalBinding("util");
	const processShim = Object.create({});

	Object.assign(processShim, {
		versions: process.versions,
		emitWarning() {},
		env: {},
		argv: ["node"],
		execArgv: [],
		features: process.features,
		pid: process.pid,
		ppid: process.ppid,
		platform: process.platform,
		arch: process.arch,
		cwd: process.cwd.bind(process),
		nextTick: process.nextTick.bind(process),
		on: () => processShim,
		once: () => processShim,
		emit: () => false,
	});

	processShim.hrtime = process.hrtime.bind(process);
	processShim.hrtime.bigint = process.hrtime.bigint.bind(process.hrtime);
	processShim[utilBinding.privateSymbols.exit_info_private_symbol] = new Uint32Array(3);

	return processShim;
}

async function runChildProbe(name) {
	switch (name) {
		case "bootstrap-realm":
			return probeBootstrapRealm();
		case "bootstrap-node":
			return probeBootstrapNode();
		case "module-wrap":
			return probeModuleWrap();
		case "contextify":
			return probeContextify();
		case "uv-net":
			return probeUvNet();
		case "cares-lookup":
			return probeCaresLookup();
		default:
			throw new Error(`unknown probe: ${name}`);
	}
}

function probeBootstrapRealm() {
	const primordials = loadPrimordials();
	const processShim = {
		versions: process.versions,
		emitWarning() {},
	};
	const callLog = {
		requestedBindings: [],
		compiledBuiltins: [],
	};
	const realmSupport = createRealmSupport(processShim, primordials, callLog);
	const realmFn = vm.compileFunction(
		getNativeSource("internal/bootstrap/realm"),
		["process", "getLinkedBinding", "getInternalBinding", "primordials"],
		{ filename: "internal/bootstrap/realm.js" },
	);

	realmFn(processShim, () => ({}), realmSupport.internalBindingShim, primordials);

	const loaders = realmSupport.getCapturedLoaders();
	return {
		name: "bootstrap-realm",
		status: "pass",
		summary:
			"internal/bootstrap/realm replays to completion with explicit builtins/module_wrap/errors inputs and produces internal loaders",
		internalBindings: unique(callLog.requestedBindings),
		compiledBuiltins: unique(callLog.compiledBuiltins),
		processKeys: Object.keys(processShim).sort(),
		producedInternalLoaders:
			typeof loaders?.internalBinding === "function" &&
			typeof loaders?.requireBuiltin === "function",
	};
}

function probeBootstrapNode() {
	const { internalBinding } = require("internal/test/binding");
	const primordials = loadPrimordials();
	const processShim = createBootstrapNodeProcessShim();
	const requested = [];
	const required = [];
	const nodeFn = vm.compileFunction(
		getNativeSource("internal/bootstrap/node"),
		["process", "require", "internalBinding", "primordials"],
		{ filename: "internal/bootstrap/node.js" },
	);

	nodeFn(
		processShim,
		(id) => {
			required.push(id);
			return require(id);
		},
		(name) => {
			requested.push(name);
			if (name === "buffer") {
				return {
					...internalBinding("buffer"),
					setBufferPrototype() {},
				};
			}
			return internalBinding(name);
		},
		primordials,
	);

	return {
		name: "bootstrap-node",
		status: "pass",
		summary:
			"internal/bootstrap/node replay unexpectedly completed; update the documented blocker inventory",
		requiredHarnessShims: [
			"mutable-process-prototype",
			"buffer.setBufferPrototype-noop",
		],
		requiredBuiltins: unique(required),
		internalBindings: unique(requested),
	};
}

async function probeModuleWrap() {
	const { internalBinding } = require("internal/test/binding");
	const { ModuleWrap } = internalBinding("module_wrap");
	const foo = new ModuleWrap("foo", undefined, 'export * from "bar";', 0, 0);
	const bar = new ModuleWrap("bar", undefined, "export const five = 5;", 0, 0);
	const moduleRequests = foo
		.getModuleRequests()
		.map(({ specifier, phase }) => ({ specifier, phase }));

	try {
		// Node 24+ expects a single array of linked ModuleWrap instances.
		foo.link([bar]);
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}

		// Node 22-era builds use the older two-array signature.
		foo.link(["bar"], [bar]);
	}
	foo.instantiate();
	await foo.evaluate(-1, false);

	return {
		name: "module-wrap",
		status: "pass",
		summary:
			"internalBinding('module_wrap').ModuleWrap can compile, link, instantiate, and evaluate a trivial ESM graph",
		moduleRequests,
		namespace: {
			five: foo.getNamespace().five,
		},
	};
}

function probeContextify() {
	const { internalBinding } = require("internal/test/binding");
	const contextifyKeys = Object.keys(internalBinding("contextify")).sort();
	const context = vm.createContext({ value: 1 });
	const script = new vm.Script("globalThis.extra = value * 2; value + 41;");
	const result = script.runInContext(context);

	return {
		name: "contextify",
		status: "pass",
		summary:
			"node:vm createContext/runInContext works and the contextify binding surface is present in the host runtime",
		contextifyKeys,
		result,
		extra: context.extra,
	};
}

async function probeUvNet() {
	const { internalBinding } = require("internal/test/binding");
	const uv = internalBinding("uv");
	const transcript = {
		clientToServer: "",
		serverToClient: "",
	};
	const server = net.createServer((socket) => {
		socket.on("data", (chunk) => {
			transcript.clientToServer += chunk.toString("utf8");
			socket.end("pong");
		});
	});

	server.listen(0, "127.0.0.1");
	await once(server, "listening");

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("expected an ephemeral TCP port");
	}

	const client = net.createConnection({
		host: "127.0.0.1",
		port: address.port,
	});

	client.once("connect", () => {
		client.write("ping");
	});

	client.on("data", (chunk) => {
		transcript.serverToClient += chunk.toString("utf8");
	});

	await once(client, "close");
	await new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

	return {
		name: "uv-net",
		status: "pass",
		summary:
			"minimal net.createServer().listen(0) and net.connect() round-trip succeeds with the host uv binding present",
		uvHasErrname: typeof uv.errname === "function",
		port: address.port,
		transcript,
	};
}

async function probeCaresLookup() {
	const { internalBinding } = require("internal/test/binding");
	const cares = internalBinding("cares_wrap");
	const result = await dns.promises.lookup("localhost");

	return {
		name: "cares-lookup",
		status: "pass",
		summary:
			"dns.lookup('localhost') succeeds and the host cares_wrap binding exposes getaddrinfo-style entrypoints",
		caresExports: unique(
			["GetAddrInfoReqWrap", "getaddrinfo"].filter(
				(key) => Object.prototype.hasOwnProperty.call(cares, key),
			),
		),
		address: result.address,
		family: result.family,
	};
}
