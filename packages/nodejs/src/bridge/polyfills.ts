// Early polyfills - this file must be imported FIRST before any other modules
// that might use TextEncoder/TextDecoder (like whatwg-url)

import { TextEncoder, TextDecoder } from "text-encoding-utf-8";

// Install on globalThis so other modules can use them
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as Record<string, unknown>).TextDecoder = TextDecoder;
}

export { TextEncoder, TextDecoder };
