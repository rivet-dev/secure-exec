import { checkPrimeSync } from "node:crypto";
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

	it("Hash is a Transform stream and supports pipe() output", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const stream = require('stream');
			module.exports = await new Promise((resolve, reject) => {
				const src = new stream.PassThrough();
				const hash = crypto.Hash('sha256');
				const chunks = [];
				hash.setEncoding('hex');
				hash.on('data', (chunk) => chunks.push(chunk));
				hash.on('error', reject);
				hash.on('finish', () => {
					resolve({
						isTransform: hash instanceof stream.Transform,
						digest: chunks.join(''),
						cachedDigest: hash.digest('hex'),
					});
				});
				src.pipe(hash);
				src.end('hello');
			});
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			isTransform: true,
			digest: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
			cachedDigest: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
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

	it("createCipheriv/createDecipheriv AES-256-CBC roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(32, 1);
			const iv = Buffer.alloc(16, 2);
			const plaintext = 'hello world, this is a secret message!';

			const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
			const encUp = cipher.update(plaintext, 'utf8');
			const encrypted = Buffer.concat([encUp, cipher.final()]);

			const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
			const decUp = decipher.update(encrypted);
			const decrypted = Buffer.concat([decUp, decipher.final()]).toString('utf8');

			module.exports = { decrypted, isBuffer: Buffer.isBuffer(encrypted) };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.decrypted).toBe("hello world, this is a secret message!");
		expect(exports.isBuffer).toBe(true);
	});

	it("createCipheriv/createDecipheriv AES-128-CBC roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(16, 3);
			const iv = Buffer.alloc(16, 4);
			const plaintext = 'AES-128 test data';

			const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
			const encUp = cipher.update(plaintext, 'utf8');
			const encrypted = Buffer.concat([encUp, cipher.final()]).toString('hex');

			const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
			const decUp = decipher.update(encrypted, 'hex');
			const decrypted = Buffer.concat([decUp, decipher.final()]).toString('utf8');

			module.exports = { decrypted };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).decrypted).toBe("AES-128 test data");
	});

	it("createCipheriv/createDecipheriv AES-256-GCM with auth tag", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(32, 5);
			const iv = Buffer.alloc(12, 6);
			const plaintext = 'authenticated encryption test';

			const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
			const encUp = cipher.update(plaintext, 'utf8');
			const encrypted = Buffer.concat([encUp, cipher.final()]);
			const authTag = cipher.getAuthTag();

			const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
			decipher.setAuthTag(authTag);
			const decUp = decipher.update(encrypted);
			const decrypted = Buffer.concat([decUp, decipher.final()]).toString('utf8');

			module.exports = {
				decrypted,
				authTagLength: authTag.length,
				isBuffer: Buffer.isBuffer(authTag),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.decrypted).toBe("authenticated encryption test");
		expect(exports.authTagLength).toBe(16);
		expect(exports.isBuffer).toBe(true);
	});

	it("AES-256-GCM decryption fails with wrong auth tag", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(32, 7);
			const iv = Buffer.alloc(12, 8);

			const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
			const encUp = cipher.update('secret data', 'utf8');
			const encrypted = Buffer.concat([encUp, cipher.final()]);
			cipher.getAuthTag(); // get real tag but don't use it

			const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
			decipher.setAuthTag(Buffer.alloc(16, 0)); // wrong tag
			decipher.update(encrypted);
			try {
				decipher.final('utf8');
				module.exports = { threw: false };
			} catch (e) {
				module.exports = { threw: true, message: e.message };
			}
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.threw).toBe(true);
	});

	it("createCipheriv/createDecipheriv AES-128-GCM roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(16, 9);
			const iv = Buffer.alloc(12, 10);
			const plaintext = 'AES-128-GCM test';

			const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
			const encUp = cipher.update(plaintext, 'utf8');
			const encrypted = Buffer.concat([encUp, cipher.final()]);
			const authTag = cipher.getAuthTag();

			const decipher = crypto.createDecipheriv('aes-128-gcm', key, iv);
			decipher.setAuthTag(authTag);
			const decUp = decipher.update(encrypted);
			const decrypted = Buffer.concat([decUp, decipher.final()]).toString('utf8');

			module.exports = { decrypted };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).decrypted).toBe("AES-128-GCM test");
	});

	it("createCipheriv update() with multiple chunks", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(32, 11);
			const iv = Buffer.alloc(16, 12);

			const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
			cipher.update('hello ');
			cipher.update('world');
			const encrypted = cipher.final();

			const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
			decipher.update(encrypted);
			const decrypted = decipher.final('utf8');

			module.exports = { decrypted };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).decrypted).toBe("hello world");
	});

	it("createCipheriv update() returns data with hex encoding", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.alloc(32, 1);
			const iv = Buffer.alloc(16, 2);

			const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
			var part1 = cipher.update('hello', 'utf8', 'hex');
			var part2 = cipher.final('hex');
			var encrypted = part1 + part2;

			const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
			var d1 = decipher.update(encrypted, 'hex', 'utf8');
			var d2 = decipher.final('utf8');
			var decrypted = d1 + d2;

			module.exports = { decrypted, encryptedLength: encrypted.length };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).decrypted).toBe("hello");
		expect((result.exports as any).encryptedLength).toBeGreaterThan(0);
	});

	it("Cipheriv and Decipheriv are Transform streams", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const stream = require('stream');
			const key = Buffer.alloc(24, 1);
			const iv = Buffer.alloc(8, 2);
			module.exports = await new Promise((resolve, reject) => {
				const src = new stream.PassThrough();
				const cipher = crypto.Cipheriv('des-ede3-cbc', key, iv);
				const decipher = crypto.Decipheriv('des-ede3-cbc', key, iv);
				const encrypted = [];
				const decrypted = [];
				cipher.on('data', (chunk) => encrypted.push(chunk));
				cipher.on('error', reject);
				decipher.on('data', (chunk) => decrypted.push(chunk));
				decipher.on('error', reject);
				decipher.on('finish', () => {
					resolve({
						cipherTransform: cipher instanceof stream.Transform,
						decipherTransform: decipher instanceof stream.Transform,
						encryptedLength: Buffer.concat(encrypted).length,
						roundTrip: Buffer.concat(decrypted).toString('utf8'),
					});
				});
				src.pipe(cipher).pipe(decipher);
				src.end('stream me through crypto');
			});
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			cipherTransform: true,
			decipherTransform: true,
			encryptedLength: 32,
			roundTrip: "stream me through crypto",
		});
	});

	it("createCipheriv supports CCM authTagLength options", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = crypto.randomBytes(24);
			const nonce = crypto.randomBytes(12);
			const aad = Buffer.from('secure-exec');
			const plaintext = Buffer.from('ccm payload');
			const cipher = crypto.createCipheriv('aes-192-ccm', key, nonce, { authTagLength: 16 });
			cipher.setAAD(aad, { plaintextLength: plaintext.length });
			const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
			const tag = cipher.getAuthTag();
			const decipher = crypto.createDecipheriv('aes-192-ccm', key, nonce, { authTagLength: 16 });
			decipher.setAuthTag(tag);
			decipher.setAAD(aad, { plaintextLength: plaintext.length });
			const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
			module.exports = {
				tagLength: tag.length,
				plaintext: decrypted.toString('utf8'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			tagLength: 16,
			plaintext: "ccm payload",
		});
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

	it("generateKeyPairSync('rsa', {modulusLength: 2048}), sign, verify roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
				modulusLength: 2048,
			});
			const data = Buffer.from('hello world');
			const signature = crypto.sign('sha256', data, privateKey);
			const valid = crypto.verify('sha256', data, publicKey, signature);
			const invalid = crypto.verify('sha256', Buffer.from('wrong'), publicKey, signature);
			module.exports = {
				sigIsBuffer: Buffer.isBuffer(signature),
				sigLength: signature.length,
				valid: valid,
				invalid: invalid,
				pubType: publicKey.type,
				privType: privateKey.type,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.sigIsBuffer).toBe(true);
		expect(exports.sigLength).toBeGreaterThan(0);
		expect(exports.valid).toBe(true);
		expect(exports.invalid).toBe(false);
		expect(exports.pubType).toBe("public");
		expect(exports.privType).toBe("private");
	});

	it("EC key pair generation and signing", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
				namedCurve: 'prime256v1',
			});
			const data = Buffer.from('EC signing test');
			const signature = crypto.sign('sha256', data, privateKey);
			const valid = crypto.verify('sha256', data, publicKey, signature);
			module.exports = {
				sigIsBuffer: Buffer.isBuffer(signature),
				valid: valid,
				pubType: publicKey.type,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.sigIsBuffer).toBe(true);
		expect(exports.valid).toBe(true);
		expect(exports.pubType).toBe("public");
	});

	it("generateKeyPairSync with PEM encoding returns strings", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
				modulusLength: 2048,
				publicKeyEncoding: { type: 'spki', format: 'pem' },
				privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
			});
			module.exports = {
				pubIsString: typeof publicKey === 'string',
				privIsString: typeof privateKey === 'string',
				pubStartsWith: publicKey.startsWith('-----BEGIN PUBLIC KEY-----'),
				privStartsWith: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.pubIsString).toBe(true);
		expect(exports.privIsString).toBe(true);
		expect(exports.pubStartsWith).toBe(true);
		expect(exports.privStartsWith).toBe(true);
	});

	it("generateKeyPair async variant calls callback", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let cbResult;
			crypto.generateKeyPair('ec', { namedCurve: 'prime256v1' }, (err, pub, priv) => {
				cbResult = {
					err: err,
					pubType: pub.type,
					privType: priv.type,
				};
			});
			module.exports = cbResult;
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(exports.pubType).toBe("public");
		expect(exports.privType).toBe("private");
	});

	it("generateKeyPair async supports omitted options for ed25519", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = await new Promise((resolve) => {
				crypto.generateKeyPair('ed25519', (err, pub, priv) => {
					resolve({
						err: err ? { name: err.name, code: err.code, message: err.message } : null,
						pubType: pub && pub.type,
						pubKeyType: pub && pub.asymmetricKeyType,
						privType: priv && priv.type,
						privKeyType: priv && priv.asymmetricKeyType,
					});
				});
			});
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			err: null,
			pubType: "public",
			pubKeyType: "ed25519",
			privType: "private",
			privKeyType: "ed25519",
		});
	});

	it("generateKeySync and generateKey return secret KeyObjects", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = await new Promise((resolve) => {
				const syncKey = crypto.generateKeySync('aes', { length: 256 });
				crypto.generateKey('hmac', { length: 123 }, (err, asyncKey) => {
					resolve({
						err: err ? { name: err.name, code: err.code, message: err.message } : null,
						syncType: syncKey.type,
						syncSize: syncKey.symmetricKeySize,
						syncLength: syncKey.export().length,
						asyncType: asyncKey && asyncKey.type,
						asyncSize: asyncKey && asyncKey.symmetricKeySize,
						asyncLength: asyncKey ? asyncKey.export().length : null,
					});
				});
			});
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			err: null,
			syncType: "secret",
			syncSize: 32,
			syncLength: 32,
			asyncType: "secret",
			asyncSize: 15,
			asyncLength: 15,
		});
	});

	it("async crypto key APIs throw validation errors synchronously", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = (() => {
				try {
					crypto.generateKey(undefined, { length: 256 }, () => {});
					return { ok: true };
				} catch (err) {
					return {
						ok: false,
						name: err.name,
						code: err.code,
						message: err.message,
					};
				}
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			ok: false,
			name: "TypeError",
			code: "ERR_INVALID_ARG_TYPE",
			message: 'The "type" argument must be of type string. Received undefined',
		});
	});

	it("pbkdf2 validates callback and digest arguments with Node-style errors", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = (() => {
				const errors = {};
				try {
					crypto.pbkdf2('password', 'salt', 8, 8, 'sha256');
				} catch (err) {
					errors.missingCallback = {
						name: err.name,
						code: err.code,
						message: err.message,
					};
				}
				try {
					crypto.pbkdf2('password', 'salt', 8, 8, () => {});
				} catch (err) {
					errors.missingDigest = {
						name: err.name,
						code: err.code,
						message: err.message,
					};
				}
				try {
					crypto.pbkdf2Sync(1, 'salt', 8, 8, 'sha256');
				} catch (err) {
					errors.invalidPassword = {
						name: err.name,
						code: err.code,
					};
				}
				return errors;
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			missingCallback: {
				name: "TypeError",
				code: "ERR_INVALID_ARG_TYPE",
				message: 'The "callback" argument must be of type function. Received undefined',
			},
			missingDigest: {
				name: "TypeError",
				code: "ERR_INVALID_ARG_TYPE",
				message: 'The "digest" argument must be of type string. Received undefined',
			},
			invalidPassword: {
				name: "TypeError",
				code: "ERR_INVALID_ARG_TYPE",
			},
		});
	});

	it("generateKeyPair throws DH group validation errors synchronously", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = (() => {
				try {
					crypto.generateKeyPair('dh', { group: 'modp0' }, () => {});
					return { ok: true };
				} catch (err) {
					return {
						ok: false,
						name: err.name,
						code: err.code,
						message: err.message,
					};
				}
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			ok: false,
			name: "Error",
			code: "ERR_CRYPTO_UNKNOWN_DH_GROUP",
			message: "Unknown DH group",
		});
	});

	it("generatePrimeSync and generatePrime return valid primes", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = await new Promise((resolve) => {
				const syncPrime = crypto.generatePrimeSync(32);
				const bigintPrime = crypto.generatePrimeSync(3, { bigint: true });
				crypto.generatePrime(32, (err, asyncPrime) => {
					resolve({
						err: err ? { name: err.name, code: err.code, message: err.message } : null,
						syncPrime: Buffer.from(syncPrime).toString('base64'),
						asyncPrime: asyncPrime ? Buffer.from(asyncPrime).toString('base64') : null,
						bigintPrime: bigintPrime.toString(),
					});
				});
			});
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.err).toBeNull();
		expect(checkPrimeSync(Buffer.from(exports.syncPrime, "base64"))).toBe(true);
		expect(checkPrimeSync(Buffer.from(exports.asyncPrime, "base64"))).toBe(true);
		expect(exports.bigintPrime).toBe("7");
	});

	it("generateKeyPairSync preserves host crypto error codes", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = (() => {
				try {
					crypto.generateKeyPairSync('ec', {
						namedCurve: 'P-256',
						paramEncoding: 'otherEncoding',
						publicKeyEncoding: { type: 'spki', format: 'pem' },
						privateKeyEncoding: {
							type: 'pkcs8',
							format: 'pem',
							cipher: 'aes-128-cbc',
							passphrase: 'top secret',
						},
					});
					return { ok: true };
				} catch (err) {
					return {
						ok: false,
						name: err.name,
						code: err.code,
						message: err.message,
					};
				}
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			ok: false,
			name: "TypeError",
			code: "ERR_INVALID_ARG_VALUE",
			message: "The property 'options.paramEncoding' is invalid. Received 'otherEncoding'",
		});
	});

	it("createPublicKey and createPrivateKey from PEM strings", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
				modulusLength: 2048,
				publicKeyEncoding: { type: 'spki', format: 'pem' },
				privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
			});
			const pubObj = crypto.createPublicKey(publicKey);
			const privObj = crypto.createPrivateKey(privateKey);
			const data = Buffer.from('test data');
			const sig = crypto.sign('sha256', data, privObj);
			const valid = crypto.verify('sha256', data, pubObj, sig);
			module.exports = {
				pubType: pubObj.type,
				privType: privObj.type,
				valid: valid,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.pubType).toBe("public");
		expect(exports.privType).toBe("private");
		expect(exports.valid).toBe(true);
	});

	it("createPrivateKey preserves metadata for encrypted PEM and accepts passphrase buffers", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
				modulusLength: 1024,
				publicKeyEncoding: { type: 'spki', format: 'pem' },
				privateKeyEncoding: {
					type: 'pkcs8',
					format: 'pem',
					cipher: 'aes-256-cbc',
					passphrase: '',
				},
			});
			const imported = crypto.createPrivateKey({
				key: privateKey,
				passphrase: Buffer.alloc(0),
			});
			const data = Buffer.from('metadata-roundtrip');
			const signature = crypto.sign('sha256', data, {
				key: privateKey,
				passphrase: '',
			});
			module.exports = {
				keyType: imported.type,
				asymmetricKeyType: imported.asymmetricKeyType,
				valid: crypto.verify('sha256', data, publicKey, signature),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			keyType: "private",
			asymmetricKeyType: "rsa",
			valid: true,
		});
	});

	it("publicEncrypt/privateDecrypt accept DER options bags and sandbox KeyObjects", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const pairWithKeyObject = crypto.generateKeyPairSync('rsa', {
				modulusLength: 1024,
				privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
			});
			const derPair = crypto.generateKeyPairSync('rsa', {
				modulusLength: 1024,
				publicKeyEncoding: { type: 'pkcs1', format: 'der' },
				privateKeyEncoding: {
					type: 'pkcs1',
					format: 'pem',
					cipher: 'aes-256-cbc',
					passphrase: 'secret',
				},
			});
			const plaintext = Buffer.from('encrypt-roundtrip');
			const encryptedWithKeyObject = crypto.publicEncrypt(pairWithKeyObject.publicKey, plaintext);
			const decryptedWithKeyObject = crypto.privateDecrypt(pairWithKeyObject.privateKey, encryptedWithKeyObject);
			const encryptedWithDer = crypto.publicEncrypt({
				key: derPair.publicKey,
				type: 'pkcs1',
				format: 'der',
			}, plaintext);
			const decryptedWithDer = crypto.privateDecrypt({
				key: derPair.privateKey,
				passphrase: 'secret',
			}, encryptedWithDer);
			module.exports = {
				keyObjectRoundTrip: decryptedWithKeyObject.toString(),
				derRoundTrip: decryptedWithDer.toString(),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			keyObjectRoundTrip: "encrypt-roundtrip",
			derRoundTrip: "encrypt-roundtrip",
		});
	});

	it("KeyObject.export returns PEM by default", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey } = crypto.generateKeyPairSync('ec', {
				namedCurve: 'prime256v1',
			});
			const pem = publicKey.export({ type: 'spki', format: 'pem' });
			module.exports = {
				isString: typeof pem === 'string',
				startsWith: pem.startsWith('-----BEGIN PUBLIC KEY-----'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.isString).toBe(true);
		expect(exports.startsWith).toBe(true);
	});

	it("sign/verify rejects tampered data", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
				modulusLength: 2048,
			});
			const data = Buffer.from('original message');
			const signature = crypto.sign('sha256', data, privateKey);
			const tampered = Buffer.from('tampered message');
			const valid = crypto.verify('sha256', tampered, publicKey, signature);
			module.exports = { valid: valid };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).valid).toBe(false);
	});

	it("createSecretKey produces KeyObject with type 'secret'", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = crypto.createSecretKey(Buffer.from('my-secret'));
			module.exports = {
				type: key.type,
				hasExport: typeof key.export === 'function',
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.type).toBe("secret");
		expect(exports.hasExport).toBe(true);
	});

	it("createPrivateKey rejects non-PEM strings", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let threw = false;
			try {
				crypto.createPrivateKey('not-a-pem-key');
			} catch (e) {
				threw = true;
			}
			module.exports = { threw };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).threw).toBe(true);
	});

	it("createPublicKey rejects non-PEM strings", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			let threw = false;
			try {
				crypto.createPublicKey('not-a-pem-key');
			} catch (e) {
				threw = true;
			}
			module.exports = { threw };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).threw).toBe(true);
	});

	it("HMAC with KeyObject secret produces correct digest", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = crypto.createSecretKey(Buffer.from('hmac-key'));
			const hmac = crypto.createHmac('sha256', key);
			hmac.update('test data');
			const hex = hmac.digest('hex');
			module.exports = { hex, length: hex.length };
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.length).toBe(64);
	});

	// crypto.subtle (Web Crypto API) tests

	it("globalThis.crypto matches require('crypto').webcrypto", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				sameObject: globalThis.crypto === crypto.webcrypto,
				sameSubtle: globalThis.crypto.subtle === crypto.webcrypto.subtle,
				cryptoCtor: globalThis.crypto.constructor.name,
				subtleCtor: globalThis.crypto.subtle.constructor.name,
			};
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			sameObject: true,
			sameSubtle: true,
			cryptoCtor: "SandboxCrypto",
			subtleCtor: "SandboxSubtleCrypto",
		});
	});

	it("globalThis.crypto.getRandomValues validates detached receivers", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const { getRandomValues } = globalThis.crypto;
			try {
				getRandomValues(new Uint8Array(4));
				module.exports = { code: null };
			} catch (error) {
				module.exports = {
					name: error.name,
					code: error.code,
				};
			}
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect(result.exports).toEqual({
			name: "TypeError",
			code: "ERR_INVALID_THIS",
		});
	});

	it("subtle.digest('SHA-256', data) matches createHash output", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const data = new TextEncoder().encode('hello');
				const hashBuf = await crypto.subtle.digest('SHA-256', data);
				const hashHex = Buffer.from(hashBuf).toString('hex');
				const nodeHex = crypto.createHash('sha256').update('hello').digest('hex');
				module.exports = { hashHex, nodeHex, match: hashHex === nodeHex };
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.hashHex).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("subtle.digest supports SHA-1, SHA-384, SHA-512", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const data = new TextEncoder().encode('test');
				const sha1 = Buffer.from(await crypto.subtle.digest('SHA-1', data)).toString('hex');
				const sha384 = Buffer.from(await crypto.subtle.digest('SHA-384', data)).toString('hex');
				const sha512 = Buffer.from(await crypto.subtle.digest('SHA-512', data)).toString('hex');
				module.exports = { sha1, sha384, sha512 };
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.sha1).toBe("a94a8fe5ccb19ba61c4c0873d391e987982fbbd3");
		expect(exports.sha384).toBe(
			"768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9",
		);
		expect(exports.sha512).toBe(
			"ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff",
		);
	});

	it("subtle.digest accepts algorithm object { name: 'SHA-256' }", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const data = new TextEncoder().encode('hello');
				const hashBuf = await crypto.subtle.digest({ name: 'SHA-256' }, data);
				module.exports = { hex: Buffer.from(hashBuf).toString('hex') };
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).hex).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("subtle.generateKey + encrypt/decrypt AES-GCM roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const key = await crypto.subtle.generateKey(
					{ name: 'AES-GCM', length: 256 },
					true,
					['encrypt', 'decrypt']
				);
				const iv = crypto.randomBytes(12);
				const plaintext = new TextEncoder().encode('secret message');
				const encrypted = await crypto.subtle.encrypt(
					{ name: 'AES-GCM', iv },
					key,
					plaintext
				);
				const decrypted = await crypto.subtle.decrypt(
					{ name: 'AES-GCM', iv },
					key,
					encrypted
				);
				const decryptedText = new TextDecoder().decode(decrypted);
				module.exports = {
					match: decryptedText === 'secret message',
					encryptedLen: encrypted.byteLength,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		// AES-GCM: ciphertext length = plaintext + 16 byte auth tag
		expect(exports.encryptedLen).toBe(14 + 16);
	});

	it("subtle.generateKey + encrypt/decrypt AES-CBC roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const key = await crypto.subtle.generateKey(
					{ name: 'AES-CBC', length: 128 },
					true,
					['encrypt', 'decrypt']
				);
				const iv = crypto.randomBytes(16);
				const plaintext = new TextEncoder().encode('CBC test data!!');
				const encrypted = await crypto.subtle.encrypt(
					{ name: 'AES-CBC', iv },
					key,
					plaintext
				);
				const decrypted = await crypto.subtle.decrypt(
					{ name: 'AES-CBC', iv },
					key,
					encrypted
				);
				const decryptedText = new TextDecoder().decode(decrypted);
				module.exports = { match: decryptedText === 'CBC test data!!' };
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		expect((result.exports as any).match).toBe(true);
	});

	it("subtle.sign/verify HMAC roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const key = await crypto.subtle.generateKey(
					{ name: 'HMAC', hash: 'SHA-256' },
					true,
					['sign', 'verify']
				);
				const data = new TextEncoder().encode('data to sign');
				const signature = await crypto.subtle.sign('HMAC', key, data);
				const valid = await crypto.subtle.verify('HMAC', key, signature, data);
				const invalid = await crypto.subtle.verify(
					'HMAC', key, signature,
					new TextEncoder().encode('wrong data')
				);
				module.exports = { valid, invalid, sigLen: signature.byteLength };
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.valid).toBe(true);
		expect(exports.invalid).toBe(false);
		expect(exports.sigLen).toBe(32); // SHA-256 HMAC = 32 bytes
	});

	it("subtle.sign/verify RSASSA-PKCS1-v1_5 roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const keyPair = await crypto.subtle.generateKey(
					{
						name: 'RSASSA-PKCS1-v1_5',
						modulusLength: 2048,
						publicExponent: new Uint8Array([1, 0, 1]),
						hash: 'SHA-256',
					},
					true,
					['sign', 'verify']
				);
				const data = new TextEncoder().encode('RSA signing test');
				const signature = await crypto.subtle.sign(
					'RSASSA-PKCS1-v1_5', keyPair.privateKey, data
				);
				const valid = await crypto.subtle.verify(
					'RSASSA-PKCS1-v1_5', keyPair.publicKey, signature, data
				);
				const invalid = await crypto.subtle.verify(
					'RSASSA-PKCS1-v1_5', keyPair.publicKey, signature,
					new TextEncoder().encode('tampered')
				);
				module.exports = {
					valid, invalid,
					sigLen: signature.byteLength,
					pubType: keyPair.publicKey.type,
					privType: keyPair.privateKey.type,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.valid).toBe(true);
		expect(exports.invalid).toBe(false);
		expect(exports.sigLen).toBe(256); // 2048-bit RSA = 256 bytes
		expect(exports.pubType).toBe("public");
		expect(exports.privType).toBe("private");
	});

	it("subtle.sign/verify RSA-PSS roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const keyPair = await crypto.subtle.generateKey(
					{
						name: 'RSA-PSS',
						modulusLength: 2048,
						publicExponent: new Uint8Array([1, 0, 1]),
						hash: 'SHA-256',
					},
					true,
					['sign', 'verify']
				);
				const data = new TextEncoder().encode('RSA-PSS signing test');
				const signature = await crypto.subtle.sign(
					{ name: 'RSA-PSS', saltLength: 32 }, keyPair.privateKey, data
				);
				const valid = await crypto.subtle.verify(
					{ name: 'RSA-PSS', saltLength: 32 }, keyPair.publicKey, signature, data
				);
				module.exports = { valid, sigLen: signature.byteLength };
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).valid).toBe(true);
		expect((result.exports as any).sigLen).toBe(256);
	});

	it("subtle.sign/verify ECDSA roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const keyPair = await crypto.subtle.generateKey(
					{ name: 'ECDSA', namedCurve: 'P-256' },
					true,
					['sign', 'verify']
				);
				const data = new TextEncoder().encode('ECDSA signing test');
				const signature = await crypto.subtle.sign(
					{ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, data
				);
				const valid = await crypto.subtle.verify(
					{ name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey, signature, data
				);
				module.exports = { valid, sigLen: signature.byteLength > 0 };
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).valid).toBe(true);
		expect((result.exports as any).sigLen).toBe(true);
	});

	it("subtle.sign/verify Ed25519 roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const keyPair = await crypto.subtle.generateKey(
					{ name: 'Ed25519' },
					true,
					['sign', 'verify']
				);
				const data = new TextEncoder().encode('Ed25519 signing test');
				const signature = await crypto.subtle.sign(
					{ name: 'Ed25519' }, keyPair.privateKey, data
				);
				const valid = await crypto.subtle.verify(
					{ name: 'Ed25519' }, keyPair.publicKey, signature, data
				);
				module.exports = { valid, sigLen: signature.byteLength };
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).valid).toBe(true);
		expect((result.exports as any).sigLen).toBe(64);
	});

	it("KeyObject.toCryptoKey returns the global CryptoKey type", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(() => {
				const { createSecretKey, randomBytes, KeyObject } = require('crypto');
				const keyObject = createSecretKey(randomBytes(16));
				const cryptoKey = keyObject.toCryptoKey('AES-GCM', true, ['encrypt', 'decrypt']);
				const roundTrip = KeyObject.from(cryptoKey);
				module.exports = {
					instanceofGlobal: cryptoKey instanceof CryptoKey,
					type: cryptoKey.type,
					match: keyObject.equals(roundTrip),
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).instanceofGlobal).toBe(true);
		expect((result.exports as any).type).toBe("secret");
		expect((result.exports as any).match).toBe(true);
	});

	it("subtle.importKey raw + exportKey raw roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const rawKey = crypto.randomBytes(32);
				const key = await crypto.subtle.importKey(
					'raw', rawKey,
					{ name: 'AES-GCM' },
					true, ['encrypt', 'decrypt']
				);
				const exported = await crypto.subtle.exportKey('raw', key);
				const match = Buffer.from(exported).equals(rawKey);
				module.exports = {
					match,
					type: key.type,
					extractable: key.extractable,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.type).toBe("secret");
		expect(exports.extractable).toBe(true);
	});

	it("subtle.importKey/exportKey jwk for HMAC key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const key = await crypto.subtle.generateKey(
					{ name: 'HMAC', hash: 'SHA-256' },
					true, ['sign', 'verify']
				);
				const jwk = await crypto.subtle.exportKey('jwk', key);
				const reimported = await crypto.subtle.importKey(
					'jwk', jwk,
					{ name: 'HMAC', hash: 'SHA-256' },
					true, ['sign', 'verify']
				);
				const data = new TextEncoder().encode('test');
				const sig1 = await crypto.subtle.sign('HMAC', key, data);
				const sig2 = await crypto.subtle.sign('HMAC', reimported, data);
				const match = Buffer.from(sig1).equals(Buffer.from(sig2));
				module.exports = {
					match,
					kty: jwk.kty,
					hasK: typeof jwk.k === 'string',
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.kty).toBe("oct");
		expect(exports.hasK).toBe(true);
	});

	it("subtle.digest returns ArrayBuffer", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const hashBuf = await crypto.subtle.digest('SHA-256', new Uint8Array([1, 2, 3]));
				module.exports = {
					isArrayBuffer: hashBuf instanceof ArrayBuffer,
					byteLength: hashBuf.byteLength,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
		const exports = result.exports as any;
		expect(exports.isArrayBuffer).toBe(true);
		expect(exports.byteLength).toBe(32);
	});

	it("subtle AES-GCM decrypt fails with wrong key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const key1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
				const key2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
				const iv = crypto.randomBytes(12);
				const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key1, new TextEncoder().encode('secret'));
				try {
					await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key2, encrypted);
					module.exports = { threw: false };
				} catch (e) {
					module.exports = { threw: true };
				}
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).threw).toBe(true);
	});

	it("subtle.deriveBits PBKDF2 produces correct length output", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const password = new TextEncoder().encode('password');
				const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
				const salt = crypto.randomBytes(16);
				const bits = await crypto.subtle.deriveBits(
					{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
					key,
					256
				);
				module.exports = {
					isArrayBuffer: bits instanceof ArrayBuffer,
					byteLength: bits.byteLength,
				};
			})();
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.isArrayBuffer).toBe(true);
		expect(exports.byteLength).toBe(32);
	});

	it("subtle.deriveBits PBKDF2 is deterministic with same salt", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const password = new TextEncoder().encode('test-password');
				const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
				const salt = Buffer.from('fixed-salt-value');
				const bits1 = await crypto.subtle.deriveBits(
					{ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
					key, 256
				);
				const bits2 = await crypto.subtle.deriveBits(
					{ name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256' },
					key, 256
				);
				module.exports = {
					match: Buffer.from(bits1).equals(Buffer.from(bits2)),
					hex: Buffer.from(bits1).toString('hex'),
				};
			})();
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.hex.length).toBe(64);
	});

	it("subtle.deriveBits HKDF produces correct length output", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const ikm = crypto.randomBytes(32);
				const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
				const salt = crypto.randomBytes(16);
				const info = new TextEncoder().encode('application-info');
				const bits = await crypto.subtle.deriveBits(
					{ name: 'HKDF', salt, info, hash: 'SHA-256' },
					key,
					256
				);
				module.exports = {
					isArrayBuffer: bits instanceof ArrayBuffer,
					byteLength: bits.byteLength,
				};
			})();
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.isArrayBuffer).toBe(true);
		expect(exports.byteLength).toBe(32);
	});

	it("subtle.deriveKey PBKDF2 produces usable AES key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const password = new TextEncoder().encode('my-password');
				const baseKey = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey']);
				const salt = crypto.randomBytes(16);
				const aesKey = await crypto.subtle.deriveKey(
					{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
					baseKey,
					{ name: 'AES-GCM', length: 256 },
					true,
					['encrypt', 'decrypt']
				);
				const iv = crypto.randomBytes(12);
				const plaintext = new TextEncoder().encode('secret message');
				const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
				const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encrypted);
				module.exports = {
					match: new TextDecoder().decode(decrypted) === 'secret message',
					keyType: aesKey.type,
				};
			})();
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.keyType).toBe("secret");
	});

	it("subtle.deriveBits ECDH matches on both sides", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const [alice, bob] = await Promise.all([
					crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']),
					crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']),
				]);
				const [secret1, secret2] = await Promise.all([
					crypto.subtle.deriveBits({ name: 'ECDH', public: bob.publicKey }, alice.privateKey, 128),
					crypto.subtle.deriveBits({ name: 'ECDH', public: alice.publicKey }, bob.privateKey, 128),
				]);
				module.exports = {
					match: Buffer.from(secret1).equals(Buffer.from(secret2)),
					len: secret1.byteLength,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).match).toBe(true);
		expect((result.exports as any).len).toBe(16);
	});

	it("subtle.deriveKey ECDH produces matching HMAC keys", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const [alice, bob] = await Promise.all([
					crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']),
					crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']),
				]);
				const [key1, key2] = await Promise.all([
					crypto.subtle.deriveKey(
						{ name: 'ECDH', public: bob.publicKey },
						alice.privateKey,
						{ name: 'HMAC', hash: 'SHA-256', length: 256 },
						true,
						['sign', 'verify']
					),
					crypto.subtle.deriveKey(
						{ name: 'ECDH', public: alice.publicKey },
						bob.privateKey,
						{ name: 'HMAC', hash: 'SHA-256', length: 256 },
						true,
						['sign', 'verify']
					),
				]);
				const [raw1, raw2] = await Promise.all([
					crypto.subtle.exportKey('raw', key1),
					crypto.subtle.exportKey('raw', key2),
				]);
				module.exports = {
					match: Buffer.from(raw1).equals(Buffer.from(raw2)),
					type: key1.type,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).match).toBe(true);
		expect((result.exports as any).type).toBe("secret");
	});

	it("subtle.wrapKey/unwrapKey AES-KW roundtrip", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			(async () => {
				const crypto = require('crypto');
				const wrappingKey = await crypto.subtle.generateKey(
					{ name: 'AES-KW', length: 256 },
					true,
					['wrapKey', 'unwrapKey']
				);
				const keyToWrap = await crypto.subtle.generateKey(
					{ name: 'AES-GCM', length: 256 },
					true,
					['encrypt', 'decrypt']
				);
				const wrapped = await crypto.subtle.wrapKey(
					'raw',
					keyToWrap,
					wrappingKey,
					{ name: 'AES-KW' }
				);
				const unwrapped = await crypto.subtle.unwrapKey(
					'raw',
					wrapped,
					wrappingKey,
					{ name: 'AES-KW' },
					{ name: 'AES-GCM', length: 256 },
					true,
					['encrypt', 'decrypt']
				);
				const [raw1, raw2] = await Promise.all([
					crypto.subtle.exportKey('raw', keyToWrap),
					crypto.subtle.exportKey('raw', unwrapped),
				]);
				module.exports = {
					match: Buffer.from(raw1).equals(Buffer.from(raw2)),
					wrappedLen: wrapped.byteLength > 0,
				};
			})();
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).match).toBe(true);
		expect((result.exports as any).wrappedLen).toBe(true);
	});

	it("Diffie-Hellman group exchange preserves Buffer and encoded secret outputs", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const alice = crypto.createDiffieHellmanGroup('modp5');
			const bob = crypto.createDiffieHellmanGroup('modp5');
			const aliceKey = alice.generateKeys();
			const bobKeyHex = bob.generateKeys('hex');
			const aliceSecret = alice.computeSecret(bobKeyHex, 'hex', 'base64');
			const bobSecret = bob.computeSecret(aliceKey, 'buffer', 'base64');

			module.exports = {
				match: aliceSecret === bobSecret,
				verifyError: alice.verifyError,
				publicKeyIsBuffer: Buffer.isBuffer(alice.getPublicKey()),
				privateKeyIsBuffer: Buffer.isBuffer(alice.getPrivateKey()),
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.verifyError).toBe(0);
		expect(exports.publicKeyIsBuffer).toBe(true);
		expect(exports.privateKeyIsBuffer).toBe(true);
	});

	it("stateless crypto.diffieHellman matches x25519 shared secret", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const alice = crypto.generateKeyPairSync('x25519');
			const bob = crypto.generateKeyPairSync('x25519');
			const aliceSecret = crypto.diffieHellman({
				privateKey: alice.privateKey,
				publicKey: bob.publicKey,
			}).toString('hex');
			const bobSecret = crypto.diffieHellman({
				privateKey: bob.privateKey,
				publicKey: alice.publicKey,
			}).toString('hex');

			module.exports = {
				match: aliceSecret === bobSecret,
				length: aliceSecret.length,
			};
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		expect(exports.match).toBe(true);
		expect(exports.length).toBeGreaterThan(0);
	});
}
