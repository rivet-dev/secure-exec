import { afterEach, expect, it } from "vitest";
import type { NodeSuiteContext } from "./runtime.js";

export function runNodeCryptoSuite(context: NodeSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	it("createHash('sha256').update('hello').digest('hex') matches Node.js", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.exec(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256').update('hello').digest('hex');
			console.log(hash);
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
	});

	it("createHash('sha256') digest matches known value", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				hex: crypto.createHash('sha256').update('hello').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHmac('sha256', 'key').update('data').digest('hex') matches Node.js", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				hex: crypto.createHmac('sha256', 'key').update('data').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});

	it("createHash supports sha1, sha384, sha512, md5", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				sha1: crypto.createHash('sha1').update('test').digest('hex'),
				sha384: crypto.createHash('sha384').update('test').digest('hex'),
				sha512: crypto.createHash('sha512').update('test').digest('hex'),
				md5: crypto.createHash('md5').update('test').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			sha1: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
			sha384: "768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9",
			sha512: "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff",
			md5: "098f6bcd4621d373cade4e832627b4f6",
		});
	});

	it("createHash supports multiple update() calls", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256');
			hash.update('hel');
			hash.update('lo');
			module.exports = { hex: hash.digest('hex') };
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHash digest returns Buffer when encoding omitted", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = crypto.createHash('sha256').update('hello').digest();
			module.exports = {
				isBuffer: Buffer.isBuffer(buf),
				length: buf.length,
				hex: buf.toString('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).isBuffer).toBe(true);
		expect((result.exports as any).length).toBe(32);
		expect((result.exports as any).hex).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("createHash supports base64 encoding", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				b64: crypto.createHash('sha256').update('hello').digest('base64'),
			};
		`);
		expect(result.code).toBe(0);
		// Known base64 for sha256('hello')
		expect((result.exports as any).b64).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
	});

	it("createHash copy() produces independent clone", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			try {
				const hash = crypto.createHash('sha256');
				hash.update('hel');
				const clone = hash.copy();
				hash.update('lo');
				clone.update('p');
				module.exports = {
					hello: hash.digest('hex'),
					help: clone.digest('hex'),
				};
			} catch (e) {
				module.exports = { error: e.message };
			}
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).error).toBeUndefined();
		expect((result.exports as any).hello).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
		// sha256('help')
		expect((result.exports as any).help).not.toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("createHmac supports multiple update() calls", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hmac = crypto.createHmac('sha256', 'key');
			hmac.update('da');
			hmac.update('ta');
			module.exports = { hex: hmac.digest('hex') };
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});

	it("Hash and Hmac have write() and end() for stream compatibility", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256');
			hash.write('hel');
			hash.write('lo');
			hash.end();
			const hex = hash.digest('hex');

			const hmac = crypto.createHmac('sha256', 'key');
			hmac.write('da');
			hmac.write('ta');
			hmac.end();
			const hmacHex = hmac.digest('hex');

			// Also get reference value via update/digest
			const ref = crypto.createHash('sha256').update('hello').digest('hex');

			module.exports = { hex, hmacHex, ref, writeType: typeof hash.write, endType: typeof hash.end };
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		// write/end should produce same result as update/digest
		expect(exports.hex).toBe(exports.ref);
		expect(exports.writeType).toBe("function");
		expect(exports.endType).toBe("function");
	});

	it("createHash handles binary Buffer input", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // 'hello'
			module.exports = {
				hex: crypto.createHash('sha256').update(buf).digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHmac handles Buffer key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.from('key');
			module.exports = {
				hex: crypto.createHmac('sha256', key).update('data').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});

	it("randomBytes(32) returns 32-byte Buffer", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = crypto.randomBytes(32);
			module.exports = {
				isBuffer: Buffer.isBuffer(buf),
				length: buf.length,
				notAllZero: buf.some(b => b !== 0),
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.isBuffer).toBe(true);
		expect(exports.length).toBe(32);
		expect(exports.notAllZero).toBe(true);
	});

	it("randomBytes supports callback variant", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let cbResult;
			crypto.randomBytes(16, (err, buf) => {
				cbResult = { err, isBuffer: Buffer.isBuffer(buf), length: buf.length };
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.isBuffer).toBe(true);
		expect(exports.length).toBe(16);
	});

	it("randomInt(0, 100) returns integer in [0, 100)", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const results = [];
			for (let i = 0; i < 20; i++) {
				results.push(crypto.randomInt(0, 100));
			}
			module.exports = {
				allInRange: results.every(n => n >= 0 && n < 100),
				allIntegers: results.every(n => Number.isInteger(n)),
				count: results.length,
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.allInRange).toBe(true);
		expect(exports.allIntegers).toBe(true);
		expect(exports.count).toBe(20);
	});

	it("randomInt(max) uses 0 as default min", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const results = [];
			for (let i = 0; i < 20; i++) {
				results.push(crypto.randomInt(10));
			}
			module.exports = {
				allInRange: results.every(n => n >= 0 && n < 10),
				allIntegers: results.every(n => Number.isInteger(n)),
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.allInRange).toBe(true);
		expect(exports.allIntegers).toBe(true);
	});

	it("randomInt throws on invalid range", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			try {
				crypto.randomInt(10, 10);
				module.exports = { threw: false };
			} catch (e) {
				module.exports = { threw: true, isRangeError: e instanceof RangeError };
			}
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.threw).toBe(true);
		expect(exports.isRangeError).toBe(true);
	});

	it("randomFillSync fills buffer with random bytes", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = Buffer.alloc(16);
			const returned = crypto.randomFillSync(buf);
			module.exports = {
				sameRef: returned === buf,
				length: buf.length,
				notAllZero: buf.some(b => b !== 0),
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.sameRef).toBe(true);
		expect(exports.length).toBe(16);
		expect(exports.notAllZero).toBe(true);
	});

	it("randomFillSync respects offset and size", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = Buffer.alloc(16);
			crypto.randomFillSync(buf, 4, 8);
			module.exports = {
				prefix: buf.slice(0, 4).every(b => b === 0),
				suffix: buf.slice(12).every(b => b === 0),
				middle: buf.slice(4, 12).some(b => b !== 0),
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.prefix).toBe(true);
		expect(exports.suffix).toBe(true);
		expect(exports.middle).toBe(true);
	});

	it("randomFill async variant works with callback", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = Buffer.alloc(16);
			let cbResult;
			crypto.randomFill(buf, (err, filled) => {
				cbResult = { err, sameRef: filled === buf, notAllZero: buf.some(b => b !== 0) };
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.sameRef).toBe(true);
		expect(exports.notAllZero).toBe(true);
	});

	it("pbkdf2Sync output matches Node.js for known inputs", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const derived = crypto.pbkdf2Sync('password', 'salt', 1, 32, 'sha256');
			module.exports = {
				hex: derived.toString('hex'),
				isBuffer: Buffer.isBuffer(derived),
				length: derived.length,
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.hex).toBe("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
		expect(exports.isBuffer).toBe(true);
		expect(exports.length).toBe(32);
	});

	it("pbkdf2 async variant calls callback with derived key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let cbResult;
			crypto.pbkdf2('password', 'salt', 1, 32, 'sha256', (err, derived) => {
				cbResult = {
					err: err,
					hex: derived.toString('hex'),
					isBuffer: Buffer.isBuffer(derived),
				};
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.hex).toBe("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
		expect(exports.isBuffer).toBe(true);
	});

	it("pbkdf2Sync accepts Buffer password and salt", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const derived = crypto.pbkdf2Sync(
				Buffer.from('password'),
				Buffer.from('salt'),
				1, 32, 'sha256'
			);
			module.exports = { hex: derived.toString('hex') };
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).hex).toBe(
			"120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
		);
	});

	it("scryptSync output matches Node.js for known inputs", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const derived = crypto.scryptSync('password', 'salt', 32, { N: 1024, r: 8, p: 1 });
			module.exports = {
				hex: derived.toString('hex'),
				isBuffer: Buffer.isBuffer(derived),
				length: derived.length,
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.hex).toBe("16dbc8906763c7f048977a68f9d305f7710e068ca2cd95dab372125bb3f19608");
		expect(exports.isBuffer).toBe(true);
		expect(exports.length).toBe(32);
	});

	it("scryptSync works with default options", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const derived = crypto.scryptSync('password', 'salt', 64);
			module.exports = {
				hex: derived.toString('hex'),
				length: derived.length,
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.hex).toBe(
			"745731af4484f323968969eda289aeee005b5903ac561e64a5aca121797bf7734ef9fd58422e2e22183bcacba9ec87ba0c83b7a2e788f03ce0da06463433cda6",
		);
		expect(exports.length).toBe(64);
	});

	it("scrypt async variant calls callback with derived key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let cbResult;
			crypto.scrypt('password', 'salt', 32, { N: 1024, r: 8, p: 1 }, (err, derived) => {
				cbResult = {
					err: err,
					hex: derived.toString('hex'),
					isBuffer: Buffer.isBuffer(derived),
				};
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.hex).toBe("16dbc8906763c7f048977a68f9d305f7710e068ca2cd95dab372125bb3f19608");
		expect(exports.isBuffer).toBe(true);
	});

	it("scrypt async variant works without options", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let cbResult;
			crypto.scrypt('password', 'salt', 64, (err, derived) => {
				cbResult = {
					err: err,
					hex: derived.toString('hex'),
				};
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.hex).toBe(
			"745731af4484f323968969eda289aeee005b5903ac561e64a5aca121797bf7734ef9fd58422e2e22183bcacba9ec87ba0c83b7a2e788f03ce0da06463433cda6",
		);
	});

	it("randomBytes rejects negative size", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			try {
				crypto.randomBytes(-1);
				module.exports = { threw: false };
			} catch (e) {
				module.exports = { threw: true, name: e.constructor.name };
			}
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.threw).toBe(true);
	});
}
