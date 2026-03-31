/**
 * Wasm-backed upstream binding providers land here in later stories.
 *
 * The scaffold exists so fs-first and socket-first backend work can attach to
 * the replacement runtime without mixing provider ownership into the current
 * public NodeRuntime path.
 */
export const upstreamWasmBindingModules: readonly string[] = Object.freeze([]);
