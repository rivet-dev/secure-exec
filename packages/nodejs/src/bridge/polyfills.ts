// Early polyfills - this file must be imported FIRST before any other modules
// that might use TextEncoder/TextDecoder (like whatwg-url)

import { TextEncoder, TextDecoder as _PolyTextDecoder } from "text-encoding-utf-8";

// Wrap TextDecoder to fix subarray handling: the text-encoding-utf-8 polyfill
// decodes the entire underlying ArrayBuffer, ignoring byteOffset/byteLength
// of typed array views. This breaks SDK code that uses Uint8Array.subarray().
class TextDecoder extends _PolyTextDecoder {
  decode(input?: ArrayBufferView | ArrayBuffer, options?: { stream?: boolean }): string {
    // If input is a typed array VIEW (subarray), copy just the visible bytes.
    // The text-encoding-utf-8 polyfill accesses .buffer directly, which returns
    // the full underlying ArrayBuffer — ignoring byteOffset and byteLength.
    if (input && 'buffer' in input && (input.byteOffset !== 0 || input.byteLength !== (input as Uint8Array).buffer.byteLength)) {
      input = (input as Uint8Array).slice();
    }
    return super.decode(input as any, options);
  }
}

// Install on globalThis so other modules can use them
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as Record<string, unknown>).TextDecoder = TextDecoder;
}

export { TextEncoder, TextDecoder };
