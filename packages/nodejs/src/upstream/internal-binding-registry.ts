import { upstreamHostBindingCatalog } from "./host-bindings/index.js";
import type {
	UpstreamBindingExecutionModel,
	UpstreamBindingPhase,
	UpstreamBindingStatus,
	UpstreamInternalBindingDescriptor,
	UpstreamInternalBindingRegistration,
	UpstreamInternalBindingResolverContext,
} from "./types.js";

type UpstreamInternalBindingInput =
	| UpstreamInternalBindingDescriptor
	| UpstreamInternalBindingRegistration;

function isBindingRegistration(
	binding: UpstreamInternalBindingInput,
): binding is UpstreamInternalBindingRegistration {
	return Object.prototype.hasOwnProperty.call(binding, "descriptor");
}

export class UpstreamInternalBindingRegistry {
	#bindings = new Map<string, UpstreamInternalBindingRegistration>();

	constructor(bindings: Iterable<UpstreamInternalBindingInput> = []) {
		for (const binding of bindings) {
			this.register(binding);
		}
	}

	register(binding: UpstreamInternalBindingInput): void {
		const registration = isBindingRegistration(binding)
			? binding
			: { descriptor: binding };

		if (this.#bindings.has(registration.descriptor.name)) {
			throw new Error(
				`Duplicate upstream internal binding scaffold: ${registration.descriptor.name}`,
			);
		}
		this.#bindings.set(registration.descriptor.name, registration);
	}

	hasBinding(name: string): boolean {
		return this.#bindings.has(name);
	}

	getBinding(name: string): UpstreamInternalBindingDescriptor {
		const binding = this.#bindings.get(name)?.descriptor;
		if (!binding) {
			throw new Error(`Unknown upstream internal binding scaffold: ${name}`);
		}
		return binding;
	}

	listBindings(): UpstreamInternalBindingDescriptor[] {
		return [...this.#bindings.values()].map(({ descriptor }) => descriptor);
	}

	listBindingsByPhase(phase: UpstreamBindingPhase): UpstreamInternalBindingDescriptor[] {
		return this.listBindings().filter((binding) => binding.requiredFor.includes(phase));
	}

	listBindingsByExecutionModel(
		executionModel: UpstreamBindingExecutionModel,
	): UpstreamInternalBindingDescriptor[] {
		return this.listBindings().filter(
			(binding) => binding.executionModel === executionModel,
		);
	}

	listBindingsByStatus(status: UpstreamBindingStatus): UpstreamInternalBindingDescriptor[] {
		return this.listBindings().filter((binding) => binding.status === status);
	}

	assertBindings(names: Iterable<string>): void {
		const missing = [...names].filter((name) => !this.#bindings.has(name));
		if (missing.length > 0) {
			throw new Error(
				`Missing upstream internal binding scaffold entries: ${missing.join(", ")}`,
			);
		}
	}

	createResolver(
		context: UpstreamInternalBindingResolverContext,
	): (name: string) => unknown {
		const cache = new Map<string, unknown>();
		return (name: string) => this.resolveBinding(name, context, cache);
	}

	resolveBinding(
		name: string,
		context: UpstreamInternalBindingResolverContext,
		cache = new Map<string, unknown>(),
	): unknown {
		if (cache.has(name)) {
			return cache.get(name);
		}

		const registration = this.#bindings.get(name);
		if (!registration) {
			throw new Error(`Unknown upstream internal binding scaffold: ${name}`);
		}

		const {
			descriptor,
			createBinding,
		} = registration;
		if (descriptor.status !== "implemented" || typeof createBinding !== "function") {
			throw new Error(
				`Upstream internal binding ${name} is ${descriptor.status} (${descriptor.executionModel}) for ${descriptor.requiredFor.join(", ")}: ${descriptor.notes}`,
			);
		}

		const bindingValue = createBinding(context);
		cache.set(name, bindingValue);
		return bindingValue;
	}
}

export function createBootstrapBindingRegistryScaffold(): UpstreamInternalBindingRegistry {
	return new UpstreamInternalBindingRegistry(upstreamHostBindingCatalog);
}
