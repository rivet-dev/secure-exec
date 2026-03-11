import { defineConfig } from "vitest/config";

const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

export default defineConfig({
	optimizeDeps: {
		include: ["sucrase", "text-encoding-utf-8", "whatwg-url", "buffer"],
	},
	test: {
		testTimeout: 15000,
		include: [
			"tests/test-suite/node.test.ts",
			"tests/runtime-driver/browser/runtime.test.ts",
		],
		browser: {
			enabled: true,
			provider: "playwright",
			name: "chromium",
			headless: true,
			providerOptions: {
				playwright: {
					launchOptions: {
						executablePath: chromiumPath,
						args: ["--no-sandbox", "--disable-dev-shm-usage"],
					},
				},
			},
		},
	},
});
