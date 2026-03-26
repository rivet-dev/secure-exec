import { describe, it, expect } from "vitest";
import {
	SocketTable,
	AF_INET,
	AF_INET6,
	AF_UNIX,
	SOCK_STREAM,
	SOCK_DGRAM,
	SOL_SOCKET,
	IPPROTO_TCP,
	SO_REUSEADDR,
	SO_RCVBUF,
	SO_SNDBUF,
	SO_KEEPALIVE,
	TCP_NODELAY,
	KernelError,
	type InetAddr,
} from "../../src/kernel/index.js";

function createNetworkedSocketTable() {
	return new SocketTable({
		networkCheck: () => ({ allow: true }),
	});
}

describe("SocketTable", () => {
	// -------------------------------------------------------------------
	// create
	// -------------------------------------------------------------------

	it("create returns unique socket IDs", () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(id1).not.toBe(id2);
		expect(table.size).toBe(2);
	});

	it("create initializes socket with correct fields", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET6, SOCK_DGRAM, 17, 42);
		const sock = table.get(id);
		expect(sock).not.toBeNull();
		expect(sock!.id).toBe(id);
		expect(sock!.domain).toBe(AF_INET6);
		expect(sock!.type).toBe(SOCK_DGRAM);
		expect(sock!.protocol).toBe(17);
		expect(sock!.state).toBe("created");
		expect(sock!.nonBlocking).toBe(false);
		expect(sock!.pid).toBe(42);
		expect(sock!.readBuffer).toEqual([]);
		expect(sock!.options.size).toBe(0);
		expect(sock!.localAddr).toBeUndefined();
		expect(sock!.remoteAddr).toBeUndefined();
	});

	it("create rejects unknown owner pids when process validation is configured", () => {
		const table = new SocketTable({
			processExists: (pid) => pid === 42,
		});

		expect(() => table.create(AF_INET, SOCK_STREAM, 0, 99)).toThrow(KernelError);
		try {
			table.create(AF_INET, SOCK_STREAM, 0, 99);
		} catch (e) {
			expect((e as KernelError).code).toBe("ESRCH");
		}

		const id = table.create(AF_INET, SOCK_STREAM, 0, 42);
		expect(table.get(id)?.pid).toBe(42);
	});

	it("create supports AF_UNIX domain", () => {
		const table = new SocketTable();
		const id = table.create(AF_UNIX, SOCK_STREAM, 0, 1);
		const sock = table.get(id);
		expect(sock!.domain).toBe(AF_UNIX);
	});

	// -------------------------------------------------------------------
	// state transitions
	// -------------------------------------------------------------------

	it("newly created socket is in 'created' state", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(table.get(id)!.state).toBe("created");
	});

	it("socket state can be mutated directly", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		sock.state = "connected";
		expect(table.get(id)!.state).toBe("connected");
	});

	// -------------------------------------------------------------------
	// close
	// -------------------------------------------------------------------

	it("close removes socket from table", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(table.size).toBe(1);
		table.close(id, 1);
		expect(table.size).toBe(0);
		expect(table.get(id)).toBeNull();
	});

	it("close sets socket state to closed", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		// Push some data to verify cleanup
		sock.readBuffer.push(new Uint8Array([1, 2, 3]));
		table.close(id, 1);
		// Socket is removed from table, but the object itself was transitioned
		expect(sock.state).toBe("closed");
		expect(sock.readBuffer.length).toBe(0);
	});

	it("close wakes pending read waiters", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		const handle = sock.readWaiters.enqueue();
		table.close(id, 1);
		// Should resolve without hanging
		await handle.wait();
		expect(handle.isSettled).toBe(true);
	});

	it("close wakes pending accept waiters", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		const handle = sock.acceptWaiters.enqueue();
		table.close(id, 1);
		await handle.wait();
		expect(handle.isSettled).toBe(true);
	});

	it("close on nonexistent socket throws EBADF", () => {
		const table = new SocketTable();
		expect(() => table.close(999, 1)).toThrow(KernelError);
		try {
			table.close(999, 1);
		} catch (e) {
			expect((e as KernelError).code).toBe("EBADF");
		}
	});

	// -------------------------------------------------------------------
	// per-process isolation
	// -------------------------------------------------------------------

	it("process A cannot close process B's socket", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, /* pid */ 10);
		expect(() => table.close(id, /* pid */ 20)).toThrow(KernelError);
		try {
			table.close(id, 20);
		} catch (e) {
			expect((e as KernelError).code).toBe("EBADF");
		}
		// Socket is still alive
		expect(table.get(id)).not.toBeNull();
	});

	it("owner process can close its own socket", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 10);
		table.close(id, 10);
		expect(table.get(id)).toBeNull();
	});

	// -------------------------------------------------------------------
	// EMFILE limit
	// -------------------------------------------------------------------

	it("EMFILE when creating too many sockets", () => {
		const table = new SocketTable({ maxSockets: 3 });
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(() => table.create(AF_INET, SOCK_STREAM, 0, 1)).toThrow(KernelError);
		try {
			table.create(AF_INET, SOCK_STREAM, 0, 1);
		} catch (e) {
			expect((e as KernelError).code).toBe("EMFILE");
		}
	});

	it("closing a socket frees a slot for new creation", () => {
		const table = new SocketTable({ maxSockets: 2 });
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		// Table is full
		expect(() => table.create(AF_INET, SOCK_STREAM, 0, 1)).toThrow(KernelError);
		// Close one
		table.close(id1, 1);
		// Now creation works again
		const id3 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(id3).toBeDefined();
		expect(table.size).toBe(2);
	});

	// -------------------------------------------------------------------
	// poll
	// -------------------------------------------------------------------

	it("poll: new empty socket is not readable, writable (created state), no hangup", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const result = table.poll(id);
		expect(result.readable).toBe(false);
		expect(result.writable).toBe(true); // created state is writable
		expect(result.hangup).toBe(false);
	});

	it("poll: socket with data in readBuffer is readable", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		sock.readBuffer.push(new Uint8Array([1]));
		const result = table.poll(id);
		expect(result.readable).toBe(true);
	});

	it("poll: connected socket is writable", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		sock.state = "connected";
		const result = table.poll(id);
		expect(result.writable).toBe(true);
	});

	it("poll: listening socket is readable when backlog has a pending connection", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "127.0.0.1", port: 8082 });
		await table.listen(listenId);

		const clientId = table.create(AF_INET, SOCK_STREAM, 0, 2);
		await table.connect(clientId, { host: "127.0.0.1", port: 8082 });

		expect(table.poll(listenId)).toMatchObject({
			readable: true,
			writable: false,
			hangup: false,
		});

		table.accept(listenId);
		expect(table.poll(listenId).readable).toBe(false);
	});

	it("poll: write-closed socket reports hangup", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		sock.state = "write-closed";
		const result = table.poll(id);
		expect(result.hangup).toBe(true);
	});

	it("poll: read-closed socket reports hangup", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		sock.state = "read-closed";
		const result = table.poll(id);
		expect(result.hangup).toBe(true);
	});

	it("poll on nonexistent socket throws EBADF", () => {
		const table = new SocketTable();
		expect(() => table.poll(999)).toThrow(KernelError);
	});

	// -------------------------------------------------------------------
	// closeAllForProcess
	// -------------------------------------------------------------------

	it("closeAllForProcess removes only sockets owned by that process", () => {
		const table = new SocketTable();
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_STREAM, 0, 2);
		expect(table.size).toBe(3);
		table.closeAllForProcess(1);
		expect(table.size).toBe(1);
	});

	// -------------------------------------------------------------------
	// disposeAll
	// -------------------------------------------------------------------

	it("disposeAll clears all sockets", () => {
		const table = new SocketTable();
		table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.create(AF_INET, SOCK_DGRAM, 0, 2);
		expect(table.size).toBe(2);
		table.disposeAll();
		expect(table.size).toBe(0);
	});

	it("disposeAll wakes pending waiters", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const sock = table.get(id)!;
		const rHandle = sock.readWaiters.enqueue();
		const aHandle = sock.acceptWaiters.enqueue();
		table.disposeAll();
		await rHandle.wait();
		await aHandle.wait();
		expect(rHandle.isSettled).toBe(true);
		expect(aHandle.isSettled).toBe(true);
	});

	// -------------------------------------------------------------------
	// bind
	// -------------------------------------------------------------------

	it("bind sets localAddr and transitions to bound", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const addr: InetAddr = { host: "0.0.0.0", port: 8080 };
		await table.bind(id, addr);
		const sock = table.get(id)!;
		expect(sock.state).toBe("bound");
		expect(sock.localAddr).toEqual(addr);
	});

	it("bind on already-bound socket throws EINVAL", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		await expect(table.bind(id, { host: "0.0.0.0", port: 9090 })).rejects.toThrow(KernelError);
		try {
			await table.bind(id, { host: "0.0.0.0", port: 9090 });
		} catch (e) {
			expect((e as KernelError).code).toBe("EINVAL");
		}
	});

	it("bind to same port returns EADDRINUSE", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		await expect(table.bind(id2, { host: "0.0.0.0", port: 8080 })).rejects.toThrow(KernelError);
		try {
			await table.bind(id2, { host: "0.0.0.0", port: 8080 });
		} catch (e) {
			expect((e as KernelError).code).toBe("EADDRINUSE");
		}
	});

	it("bind wildcard conflicts with specific host on same port", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "127.0.0.1", port: 8080 });
		// Binding wildcard on same port conflicts
		await expect(table.bind(id2, { host: "0.0.0.0", port: 8080 })).rejects.toThrow(KernelError);
		try {
			await table.bind(id2, { host: "0.0.0.0", port: 8080 });
		} catch (e) {
			expect((e as KernelError).code).toBe("EADDRINUSE");
		}
	});

	it("bind specific host conflicts with existing wildcard on same port", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		// Binding specific host on same port conflicts with wildcard
		await expect(table.bind(id2, { host: "127.0.0.1", port: 8080 })).rejects.toThrow(KernelError);
		try {
			await table.bind(id2, { host: "127.0.0.1", port: 8080 });
		} catch (e) {
			expect((e as KernelError).code).toBe("EADDRINUSE");
		}
	});

	it("bind to different ports does not conflict", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		await table.bind(id2, { host: "0.0.0.0", port: 9090 });
		expect(table.get(id1)!.state).toBe("bound");
		expect(table.get(id2)!.state).toBe("bound");
	});

	it("bind port 0 assigns an ephemeral port", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "127.0.0.1", port: 0 });

		const sock = table.get(id)!;
		expect(sock.localAddr).toEqual({
			host: "127.0.0.1",
			port: expect.any(Number),
		});
		expect((sock.localAddr as InetAddr).port).toBeGreaterThanOrEqual(49152);
		expect((sock.localAddr as InetAddr).port).toBeLessThanOrEqual(65535);
		expect((sock.localAddr as InetAddr).port).not.toBe(0);
	});

	it("two bind port 0 calls get different ephemeral ports", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "127.0.0.1", port: 0 });
		await table.bind(id2, { host: "127.0.0.1", port: 0 });

		const port1 = (table.get(id1)!.localAddr as InetAddr).port;
		const port2 = (table.get(id2)!.localAddr as InetAddr).port;
		expect(port1).not.toBe(port2);
	});

	it("SO_REUSEADDR allows binding to same port", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		// Set SO_REUSEADDR on the new socket via setsockopt
		table.setsockopt(id2, SOL_SOCKET, SO_REUSEADDR, 1);
		await table.bind(id2, { host: "0.0.0.0", port: 8080 });
		expect(table.get(id2)!.state).toBe("bound");
	});

	it("port reuse after close", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		table.close(id1, 1);
		// Port should be available again
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id2, { host: "0.0.0.0", port: 8080 });
		expect(table.get(id2)!.state).toBe("bound");
	});

	it("bind nonexistent socket throws EBADF", async () => {
		const table = new SocketTable();
		await expect(table.bind(999, { host: "0.0.0.0", port: 80 })).rejects.toThrow(KernelError);
	});

	// -------------------------------------------------------------------
	// listen
	// -------------------------------------------------------------------

	it("listen transitions bound socket to listening", async () => {
		const table = createNetworkedSocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		await table.listen(id);
		expect(table.get(id)!.state).toBe("listening");
	});

	it("listen on unbound socket throws EINVAL", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await expect(table.listen(id)).rejects.toThrow(KernelError);
		try {
			await table.listen(id);
		} catch (e) {
			expect((e as KernelError).code).toBe("EINVAL");
		}
	});

	it("listen backlog limit refuses excess loopback connections", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "127.0.0.1", port: 8080 });
		await table.listen(listenId, 2);

		const client1 = table.create(AF_INET, SOCK_STREAM, 0, 2);
		const client2 = table.create(AF_INET, SOCK_STREAM, 0, 3);
		const client3 = table.create(AF_INET, SOCK_STREAM, 0, 4);

		await table.connect(client1, { host: "127.0.0.1", port: 8080 });
		await table.connect(client2, { host: "127.0.0.1", port: 8080 });
		await expect(table.connect(client3, { host: "127.0.0.1", port: 8080 }))
			.rejects.toMatchObject({ code: "ECONNREFUSED" });

		const socket = table.get(listenId)!;
		expect(socket.backlog).toHaveLength(2);
	});

	// -------------------------------------------------------------------
	// accept
	// -------------------------------------------------------------------

	it("accept returns null when backlog is empty", async () => {
		const table = createNetworkedSocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		await table.listen(id);
		expect(table.accept(id)).toBeNull();
	});

	it("accept returns socket ID from backlog in FIFO order", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "0.0.0.0", port: 8080 });
		await table.listen(listenId);

		// Simulate connections queued in backlog
		const conn1 = table.create(AF_INET, SOCK_STREAM, 0, 2);
		const conn2 = table.create(AF_INET, SOCK_STREAM, 0, 3);
		table.get(listenId)!.backlog.push(conn1, conn2);

		expect(table.accept(listenId)).toBe(conn1);
		expect(table.accept(listenId)).toBe(conn2);
		expect(table.accept(listenId)).toBeNull();
	});

	it("accept on non-listening socket throws EINVAL", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(() => table.accept(id)).toThrow(KernelError);
		try {
			table.accept(id);
		} catch (e) {
			expect((e as KernelError).code).toBe("EINVAL");
		}
	});

	// -------------------------------------------------------------------
	// bind/listen/accept lifecycle
	// -------------------------------------------------------------------

	it("full bind → listen → accept lifecycle", async () => {
		const table = createNetworkedSocketTable();
		const serverId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(serverId, { host: "0.0.0.0", port: 3000 });
		await table.listen(serverId);
		expect(table.get(serverId)!.state).toBe("listening");

		// Simulate incoming connection
		const clientSock = table.create(AF_INET, SOCK_STREAM, 0, 2);
		table.get(serverId)!.backlog.push(clientSock);

		const accepted = table.accept(serverId);
		expect(accepted).toBe(clientSock);
	});

	it("closing a listener closes queued backlog sockets and detaches their clients", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "127.0.0.1", port: 3001 });
		await table.listen(listenId, 1);

		const clientId = table.create(AF_INET, SOCK_STREAM, 0, 2);
		await table.connect(clientId, { host: "127.0.0.1", port: 3001 });

		const pendingId = table.get(listenId)!.backlog[0];
		expect(pendingId).toBeDefined();
		expect(table.get(pendingId!)).not.toBeNull();

		table.close(listenId, 1);

		expect(table.get(listenId)).toBeNull();
		expect(table.get(pendingId!)).toBeNull();
		expect(() => table.send(clientId, new Uint8Array([1]))).toThrow(KernelError);
	});

	// -------------------------------------------------------------------
	// findListener (wildcard matching)
	// -------------------------------------------------------------------

	it("findListener returns exact match", async () => {
		const table = createNetworkedSocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "127.0.0.1", port: 8080 });
		await table.listen(id);
		const found = table.findListener({ host: "127.0.0.1", port: 8080 });
		expect(found).not.toBeNull();
		expect(found!.id).toBe(id);
	});

	it("findListener matches wildcard 0.0.0.0 for specific host", async () => {
		const table = createNetworkedSocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		await table.listen(id);
		// Connecting to 127.0.0.1:8080 should match 0.0.0.0:8080
		const found = table.findListener({ host: "127.0.0.1", port: 8080 });
		expect(found).not.toBeNull();
		expect(found!.id).toBe(id);
	});

	it("findListener returns null for unmatched port", async () => {
		const table = createNetworkedSocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		await table.listen(id);
		expect(table.findListener({ host: "127.0.0.1", port: 9090 })).toBeNull();
	});

	it("findListener returns null for bound-but-not-listening socket", async () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id, { host: "0.0.0.0", port: 8080 });
		// Not listening yet
		expect(table.findListener({ host: "127.0.0.1", port: 8080 })).toBeNull();
	});

	it("findListener prefers exact match over wildcard", async () => {
		const table = createNetworkedSocketTable();
		// Bind wildcard first
		const wildId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(wildId, SOL_SOCKET, SO_REUSEADDR, 1);
		await table.bind(wildId, { host: "0.0.0.0", port: 8080 });
		await table.listen(wildId);
		// Bind exact — needs SO_REUSEADDR to coexist
		const exactId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(exactId, SOL_SOCKET, SO_REUSEADDR, 1);
		await table.bind(exactId, { host: "127.0.0.1", port: 8080 });
		await table.listen(exactId);
		// Exact match should win
		const found = table.findListener({ host: "127.0.0.1", port: 8080 });
		expect(found!.id).toBe(exactId);
	});

	it("close listener frees port for wildcard matching", async () => {
		const table = createNetworkedSocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		await table.listen(id1);
		expect(table.findListener({ host: "127.0.0.1", port: 8080 })).not.toBeNull();
		// Close the listener
		table.close(id1, 1);
		expect(table.findListener({ host: "127.0.0.1", port: 8080 })).toBeNull();
	});

	// -------------------------------------------------------------------
	// setsockopt / getsockopt
	// -------------------------------------------------------------------

	it("setsockopt stores and getsockopt retrieves option value", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(id, SOL_SOCKET, SO_KEEPALIVE, 1);
		expect(table.getsockopt(id, SOL_SOCKET, SO_KEEPALIVE)).toBe(1);
	});

	it("getsockopt returns undefined for unset option", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(table.getsockopt(id, SOL_SOCKET, SO_KEEPALIVE)).toBeUndefined();
	});

	it("setsockopt overwrites previous value", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(id, SOL_SOCKET, SO_RCVBUF, 1024);
		table.setsockopt(id, SOL_SOCKET, SO_RCVBUF, 4096);
		expect(table.getsockopt(id, SOL_SOCKET, SO_RCVBUF)).toBe(4096);
	});

	it("setsockopt on nonexistent socket throws EBADF", () => {
		const table = new SocketTable();
		expect(() => table.setsockopt(999, SOL_SOCKET, SO_RCVBUF, 1024)).toThrow(KernelError);
		try {
			table.setsockopt(999, SOL_SOCKET, SO_RCVBUF, 1024);
		} catch (e) {
			expect((e as KernelError).code).toBe("EBADF");
		}
	});

	it("getsockopt on nonexistent socket throws EBADF", () => {
		const table = new SocketTable();
		expect(() => table.getsockopt(999, SOL_SOCKET, SO_RCVBUF)).toThrow(KernelError);
		try {
			table.getsockopt(999, SOL_SOCKET, SO_RCVBUF);
		} catch (e) {
			expect((e as KernelError).code).toBe("EBADF");
		}
	});

	it("different levels with same optname are independent", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		// TCP_NODELAY (optname=1) at IPPROTO_TCP level
		table.setsockopt(id, IPPROTO_TCP, TCP_NODELAY, 1);
		// SO_REUSEADDR (optname=2) at SOL_SOCKET has different key
		table.setsockopt(id, SOL_SOCKET, SO_REUSEADDR, 1);
		expect(table.getsockopt(id, IPPROTO_TCP, TCP_NODELAY)).toBe(1);
		expect(table.getsockopt(id, SOL_SOCKET, SO_REUSEADDR)).toBe(1);
	});

	it("SO_REUSEADDR via setsockopt allows port reuse", async () => {
		const table = new SocketTable();
		const id1 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		const id2 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(id1, { host: "0.0.0.0", port: 8080 });
		// Without SO_REUSEADDR, bind fails
		await expect(table.bind(id2, { host: "0.0.0.0", port: 8080 })).rejects.toThrow(KernelError);

		const id3 = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(id3, SOL_SOCKET, SO_REUSEADDR, 1);
		// With SO_REUSEADDR, bind succeeds
		await table.bind(id3, { host: "0.0.0.0", port: 8080 });
		expect(table.get(id3)!.state).toBe("bound");
	});

	it("SO_RCVBUF enforces receive buffer limit via send()", async () => {
		const table = createNetworkedSocketTable();
		// Set up a loopback connection
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "0.0.0.0", port: 7070 });
		await table.listen(listenId);
		const clientId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.connect(clientId, { host: "127.0.0.1", port: 7070 });
		const serverId = table.accept(listenId)!;

		// Set SO_RCVBUF on the server socket to 100 bytes
		table.setsockopt(serverId, SOL_SOCKET, SO_RCVBUF, 100);

		// First send: 80 bytes, should succeed
		table.send(clientId, new Uint8Array(80));
		// Second send: 50 bytes, buffer is at 80 which is >= 100? No, 80 < 100 so it should succeed
		table.send(clientId, new Uint8Array(20));
		// Buffer is now at 100 bytes. Next send should fail with EAGAIN
		expect(() => table.send(clientId, new Uint8Array(1))).toThrow(KernelError);
		try {
			table.send(clientId, new Uint8Array(1));
		} catch (e) {
			expect((e as KernelError).code).toBe("EAGAIN");
		}
	});

	it("SO_RCVBUF allows sending after buffer is drained", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "0.0.0.0", port: 7071 });
		await table.listen(listenId);
		const clientId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.connect(clientId, { host: "127.0.0.1", port: 7071 });
		const serverId = table.accept(listenId)!;

		table.setsockopt(serverId, SOL_SOCKET, SO_RCVBUF, 50);

		// Fill the buffer
		table.send(clientId, new Uint8Array(50));
		expect(() => table.send(clientId, new Uint8Array(1))).toThrow(KernelError);

		// Drain the buffer by receiving
		table.recv(serverId, 50);
		// Now send should succeed again
		table.send(clientId, new Uint8Array(30));
		expect(table.recv(serverId, 30)!.length).toBe(30);
	});

	it("getLocalAddr and getRemoteAddr return the connected socket addresses", async () => {
		const table = createNetworkedSocketTable();
		const listenId = table.create(AF_INET, SOCK_STREAM, 0, 1);
		await table.bind(listenId, { host: "127.0.0.1", port: 8088 });
		await table.listen(listenId);

		const clientId = table.create(AF_INET, SOCK_STREAM, 0, 2);
		await table.bind(clientId, { host: "127.0.0.1", port: 0 });
		const clientLocalAddr = table.getLocalAddr(clientId) as InetAddr;

		await table.connect(clientId, { host: "127.0.0.1", port: 8088 });
		const serverId = table.accept(listenId)!;

		expect(table.getLocalAddr(clientId)).toEqual(clientLocalAddr);
		expect(table.getRemoteAddr(clientId)).toEqual({ host: "127.0.0.1", port: 8088 });
		expect(table.getLocalAddr(serverId)).toEqual({ host: "127.0.0.1", port: 8088 });
		expect(table.getRemoteAddr(serverId)).toEqual(clientLocalAddr);
	});

	it("getRemoteAddr throws ENOTCONN when no peer address exists", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		expect(() => table.getRemoteAddr(id)).toThrow(KernelError);
		try {
			table.getRemoteAddr(id);
		} catch (e) {
			expect((e as KernelError).code).toBe("ENOTCONN");
		}
	});

	it("getLocalAddr throws EBADF for a missing socket", () => {
		const table = new SocketTable();
		expect(() => table.getLocalAddr(999)).toThrow(KernelError);
		try {
			table.getLocalAddr(999);
		} catch (e) {
			expect((e as KernelError).code).toBe("EBADF");
		}
	});

	it("SO_SNDBUF is stored and retrievable", () => {
		const table = new SocketTable();
		const id = table.create(AF_INET, SOCK_STREAM, 0, 1);
		table.setsockopt(id, SOL_SOCKET, SO_SNDBUF, 8192);
		expect(table.getsockopt(id, SOL_SOCKET, SO_SNDBUF)).toBe(8192);
	});
});
