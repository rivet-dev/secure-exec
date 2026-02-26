/**
 * Utility types for bridge type conformance tests.
 *
 * NodePartial<T> recursively makes every property optional and normalizes
 * function/class types to strip Node-internal properties (__promisify__) and
 * relax parameter variance.  This lets us verify that bridge modules export
 * the right *shape* (function vs value, class vs plain object) for each key,
 * without requiring exact parameter/return-type parity with Node's
 * heavily-overloaded signatures.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyConstructor = new (...args: any[]) => any;

export type NodePartial<T> = {
  [K in keyof T]?: T[K] extends AnyConstructor
    ? AnyConstructor // class → any constructor
    : T[K] extends AnyFunction
      ? AnyFunction // function → any function
      : T[K] extends object
        ? NodePartial<T[K]> // recurse into sub-namespaces (e.g. fs.promises)
        : T[K];
};
