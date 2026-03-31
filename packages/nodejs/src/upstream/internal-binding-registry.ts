import type { UpstreamInternalBindingDescriptor } from "./types.js";

const DEFAULT_BOOTSTRAP_BINDINGS: ReadonlyArray<UpstreamInternalBindingDescriptor> =
	Object.freeze([
		{
			name: "builtins",
			status: "implemented",
			notes:
				"US-005 wires builtinIds, compileFunction, setInternalLoaders, and cached builtin require() access.",
		},
		{
			name: "module_wrap",
			status: "planned",
			notes: "US-005 and US-006 wire module compilation and linker hooks.",
		},
		{
			name: "contextify",
			status: "planned",
			notes: "US-006 adds the initial vm/createContext bridge surface.",
		},
		{
			name: "config",
			status: "planned",
			notes: "Bootstrap config constants stay host-owned in early bring-up.",
		},
		{
			name: "util",
			status: "planned",
			notes: "Bootstrap-visible util helpers remain host-side.",
		},
		{
			name: "process_methods",
			status: "planned",
			notes: "Process lifecycle helpers land with the bootstrap host binding set.",
		},
		{
			name: "uv",
			status: "planned",
			notes: "Listener and handle state stay host-owned while kernel I/O remains below.",
		},
		{
			name: "cares_wrap",
			status: "planned",
			notes: "DNS request dispatch stays host-lifecycle-plus-backend.",
		},
		{
			name: "credentials",
			status: "planned",
			notes: "Credential probes stay explicit even before full implementation.",
		},
		{
			name: "async_wrap",
			status: "planned",
			notes:
				"US-006 snapshot-free bring-up reuses host async_wrap exports but keeps setupHooks() as a scoped no-op until real host lifecycle wiring lands.",
		},
		{
			name: "trace_events",
			status: "planned",
			notes:
				"US-006 bring-up reuses host trace_events exports but keeps the trace state update setter as a no-op during eval_string smoke tests.",
		},
		{
			name: "timers",
			status: "planned",
			notes: "Timer bridge hooks stay on the host side during bring-up.",
		},
		{
			name: "errors",
			status: "planned",
			notes: "Bootstrap error constructors and codes remain explicit host bindings.",
		},
		{
			name: "buffer",
			status: "planned",
			notes:
				"US-006 bring-up keeps buffer bootstrap host-owned and patches setBufferPrototype() as a narrow no-op so bootstrap/node can complete.",
		},
		{
			name: "constants",
			status: "planned",
			notes: "Constants mirror the pinned upstream release metadata.",
		},
		{
			name: "symbols",
			status: "planned",
			notes: "Bootstrap symbol exports remain part of the early host surface.",
		},
		{
			name: "modules",
			status: "planned",
			notes: "CommonJS and ESM loader state stays explicit instead of implicit globals.",
		},
	]);

export class UpstreamInternalBindingRegistry {
	#bindings = new Map<string, UpstreamInternalBindingDescriptor>();

	constructor(bindings: Iterable<UpstreamInternalBindingDescriptor> = []) {
		for (const binding of bindings) {
			this.register(binding);
		}
	}

	register(binding: UpstreamInternalBindingDescriptor): void {
		if (this.#bindings.has(binding.name)) {
			throw new Error(`Duplicate upstream internal binding scaffold: ${binding.name}`);
		}
		this.#bindings.set(binding.name, binding);
	}

	hasBinding(name: string): boolean {
		return this.#bindings.has(name);
	}

	getBinding(name: string): UpstreamInternalBindingDescriptor {
		const binding = this.#bindings.get(name);
		if (!binding) {
			throw new Error(`Unknown upstream internal binding scaffold: ${name}`);
		}
		return binding;
	}

	listBindings(): UpstreamInternalBindingDescriptor[] {
		return [...this.#bindings.values()];
	}

	assertBindings(names: Iterable<string>): void {
		const missing = [...names].filter((name) => !this.#bindings.has(name));
		if (missing.length > 0) {
			throw new Error(
				`Missing upstream internal binding scaffold entries: ${missing.join(", ")}`,
			);
		}
	}
}

export function createBootstrapBindingRegistryScaffold(): UpstreamInternalBindingRegistry {
	return new UpstreamInternalBindingRegistry(DEFAULT_BOOTSTRAP_BINDINGS);
}
