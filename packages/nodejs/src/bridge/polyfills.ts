// Early polyfills - this file must be imported FIRST before any other modules
// that might use TextEncoder/TextDecoder (like whatwg-url)

import {
	TextDecoder as PolyfillTextDecoder,
} from "text-encoding-utf-8";

function encodeUtf8ScalarValue(codePoint: number, bytes: number[]): void {
	if (codePoint <= 0x7f) {
		bytes.push(codePoint);
		return;
	}
	if (codePoint <= 0x7ff) {
		bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
		return;
	}
	if (codePoint <= 0xffff) {
		bytes.push(
			0xe0 | (codePoint >> 12),
			0x80 | ((codePoint >> 6) & 0x3f),
			0x80 | (codePoint & 0x3f),
		);
		return;
	}
	bytes.push(
		0xf0 | (codePoint >> 18),
		0x80 | ((codePoint >> 12) & 0x3f),
		0x80 | ((codePoint >> 6) & 0x3f),
		0x80 | (codePoint & 0x3f),
	);
}

function encodeUtf8(input = ""): Uint8Array {
	const value = String(input);
	const bytes: number[] = [];
	for (let index = 0; index < value.length; index += 1) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const nextIndex = index + 1;
			if (nextIndex < value.length) {
				const nextCodeUnit = value.charCodeAt(nextIndex);
				if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
					const codePoint =
						0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00);
					encodeUtf8ScalarValue(codePoint, bytes);
					index = nextIndex;
					continue;
				}
			}
			encodeUtf8ScalarValue(0xfffd, bytes);
			continue;
		}
		if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
			encodeUtf8ScalarValue(0xfffd, bytes);
			continue;
		}
		encodeUtf8ScalarValue(codeUnit, bytes);
	}
	return new Uint8Array(bytes);
}

class PatchedTextEncoder {
	encode(input = ""): Uint8Array {
		return encodeUtf8(input);
	}

	get encoding(): string {
		return "utf-8";
	}
}

const TextEncoder =
	typeof globalThis.TextEncoder === "function"
		? globalThis.TextEncoder
		: (PatchedTextEncoder as typeof globalThis.TextEncoder);
const TextDecoder =
	typeof globalThis.TextDecoder === "function"
		? globalThis.TextDecoder
		: PolyfillTextDecoder;

// Install on globalThis so other modules can use them
if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as Record<string, unknown>).TextDecoder = TextDecoder;
}

export { TextEncoder, TextDecoder };
