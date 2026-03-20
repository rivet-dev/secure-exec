# V8 IPC Serialization: Eliminating Double Encoding

## Status

Proposal — optimization follow-up to the V8 runtime implementation.

## Problem

The current V8 runtime IPC has **two layers of MessagePack serialization**:

1. **Inner**: Bridge function args/results are converted from V8 values to `rmpv::Value`, then encoded to MessagePack bytes (`Vec<u8>`)
2. **Outer**: Those bytes are stuffed into a `BridgeCall`/`BridgeResponse` struct as an opaque `args`/`result` field, then the entire struct is MessagePack-encoded again via `rmp_serde`

A single `fs.readFileSync("/tmp/foo.txt")` round-trip does **4 encodes and 4 decodes** across the two layers. The inner layer also requires ~130 lines of manual V8-to-rmpv type-walking code (`v8_to_rmpv`, `rmpv_to_v8` in `bridge.rs`) that must handle every V8 type explicitly and still misses types like `Date`, `RegExp`, `Map`, `Set`, `Error`, and circular references.

## Serialization needs

There are two distinct serialization jobs:

| Job | What | Where parsed | Schema |
|-----|-------|-------------|--------|
| **Envelope** | Message type, session_id, call_id, method name | Connection handler thread (no V8 scope) | Fixed, small |
| **Payload** | Bridge function arguments and return values | Session thread (has V8 scope) | Arbitrary, any JS type |

The envelope must be parseable **without a V8 isolate** because the Rust connection handler reads `session_id` to route messages to the correct session thread before V8 is involved.

## Options evaluated

### Payload serialization (bridge args/results)

| Option | Encode (Rust) | Decode (JS) | Binary support | Type coverage | Dependencies | Notes |
|--------|--------------|-------------|----------------|---------------|-------------|-------|
| **V8 ValueSerializer** | `v8::ValueSerializer` | `node:v8.deserialize()` | Native | All V8 types (Date, Map, Set, RegExp, Error, circular refs, typed arrays) | None (built into V8 and Node.js) | Zero manual type conversion |
| MessagePack via rmpv (current) | `v8_to_rmpv()` → `rmpv::encode` | `@msgpack/msgpack decode()` | Native bin format | Primitives, arrays, objects, Uint8Array only | `rmpv`, `@msgpack/msgpack` | 130 lines of manual V8 type walking |
| JSON | `serde_json` | `JSON.parse()` | No (needs base64) | Primitives, arrays, objects | None | +33% overhead on binary, loses undefined/NaN/Infinity |
| CBOR (RFC 8949) | `ciborium` | `cbor-x` | Native | Similar to MessagePack | `ciborium`, `cbor-x` | No advantage over msgpack, less ecosystem |
| Protocol Buffers | `prost` | `protobufjs` | Native | Schema-defined only | `prost`, `protobufjs`, codegen | Overkill — bridge args have no fixed schema |
| FlatBuffers | `flatbuffers` | `flatbuffers` | Zero-copy reads | Schema-defined only | `flatbuffers`, codegen | Zero-copy reads are compelling but schema requirement kills it for arbitrary JS values |
| bincode / postcard | `bincode` / `postcard` | Custom JS decoder | Native | Rust serde types | `bincode` / `postcard` | No JS library — would need a hand-written decoder |

**Winner: V8 ValueSerializer.** It's the only option that requires zero manual type conversion, handles all V8 types natively, and has no external dependencies on either side.

### Envelope serialization (IPC routing metadata)

| Option | Rust | JS | Binary fields | Evolvability | Dependencies |
|--------|------|-----|---------------|-------------|-------------|
| **Custom binary header** | Manual read/write (~80 LOC) | Manual read/write (~60 LOC) | Native | Add fields = bump version byte | None |
| bincode | `bincode` | `bincode-ts` | Native | Positional (fragile across versions) | `bincode`, `bincode-ts` |
| cbor-x | `ciborium` | `cbor-x` | Native | Self-describing | `ciborium`, `cbor-x` |
| MessagePack (current) | `rmp_serde` | `@msgpack/msgpack` | Native | Self-describing | `rmp_serde`, `serde`, `serde_bytes`, `@msgpack/msgpack` |
| JSON | `serde_json` | `JSON.parse()` | No (base64 for payload ref) | Self-describing | `serde_json` (Rust std) |

**Winner: Custom binary header.** The envelope has a small, fixed schema (message type + session_id + call_id + method name) — 5-6 known fields. A serialization library adds more dependency than the problem warrants. A fixed binary layout:

- Eliminates `rmp_serde`, `serde`, `serde_bytes`, and `@msgpack/msgpack` entirely
- Is the fastest option (no serialization library in the hot path — just `memcpy` and integer writes)
- Is trivial to parse on the connection handler thread for routing
- ~80 LOC Rust + ~60 LOC TypeScript — less code than the serde boilerplate it replaces

## Proposed wire format

```
Message frame:
┌──────────────────────────────────────────────────────────┐
│ [4 bytes]  total frame length (u32 BE, excludes self)    │
│ [1 byte]   message type enum                             │
│ [1 byte]   session_id length (N)                         │
│ [N bytes]  session_id (UTF-8)                            │
│ [... type-specific fixed fields ...]                     │
│ [M bytes]  V8-serialized payload (rest of frame)         │
└──────────────────────────────────────────────────────────┘
```

### Message types and their fixed fields

```
Type 0x01 — Authenticate
  [T bytes]  token (rest of frame, UTF-8)

Type 0x02 — CreateSession
  [4 bytes]  heap_limit_mb (u32 BE, 0 = unlimited)
  [4 bytes]  cpu_time_limit_ms (u32 BE, 0 = unlimited)

Type 0x03 — DestroySession
  (no additional fields)

Type 0x04 — InjectGlobals
  [M bytes]  V8-serialized { processConfig, osConfig }

Type 0x05 — Execute
  [1 byte]   mode (0 = exec, 1 = run)
  [2 bytes]  file_path length (u16 BE, 0 = none)
  [F bytes]  file_path (UTF-8)
  [4 bytes]  bridge_code length (u32 BE)
  [B bytes]  bridge_code (UTF-8)
  [U bytes]  user_code (rest of frame, UTF-8)

Type 0x06 — BridgeResponse
  [4 bytes]  call_id (u32 BE)
  [1 byte]   status (0 = success, 1 = error)
  [M bytes]  V8-serialized result OR UTF-8 error message

Type 0x07 — StreamEvent
  [2 bytes]  event_type length (u16 BE)
  [E bytes]  event_type (UTF-8)
  [M bytes]  V8-serialized payload

Type 0x08 — TerminateExecution
  (no additional fields)

Type 0x81 — BridgeCall (Rust → Host)
  [4 bytes]  call_id (u32 BE)
  [2 bytes]  method length (u16 BE)
  [N bytes]  method (UTF-8)
  [M bytes]  V8-serialized args

Type 0x82 — ExecutionResult (Rust → Host)
  [4 bytes]  exit code (i32 BE)
  [1 byte]   flags (bit 0 = has_exports, bit 1 = has_error)
  [M bytes]  if has_exports: [4B exports_len][V8-serialized exports]
             if has_error: [2B type_len][type][2B msg_len][msg][2B stack_len][stack][2B code_len][code]

Type 0x83 — Log (Rust → Host)
  [1 byte]   channel (0 = stdout, 1 = stderr)
  [M bytes]  message (rest of frame, UTF-8)

Type 0x84 — StreamCallback (Rust → Host)
  [2 bytes]  callback_type length (u16 BE)
  [C bytes]  callback_type (UTF-8)
  [M bytes]  V8-serialized payload
```

### Connection handler routing

The connection handler only needs to read **byte 5 through 5+N** (the session_id) to route a message. No deserialization library needed. For `BridgeResponse` routing (which has `call_id` but no `session_id`), the existing `CallIdRouter` HashMap maps call_id → session_id.

## Data flow after refactor

```
 SANDBOX V8 (Rust)                              HOST (Node.js)
 ─────────────────                              ──────────────

 User code calls fs.readFileSync("/foo")
       │
       │ V8 FunctionTemplate callback
       ▼
 v8::FunctionCallbackArguments
       │
       │ ① v8::ValueSerializer::write_value()
       │   (native V8 → V8 wire bytes)
       ▼
 Vec<u8> [V8 wire format]
       │
       │ ② Write binary header:
       │   [4B frame_len][0x81 BridgeCall]
       │   [1B sid_len][32B session_id]
       │   [4B call_id][2B method_len][method]
       │   [V8 payload bytes]
       ▼
 raw bytes on UDS socket
       │
 ══════╪═══════════════════════════════════════════
       │
       ▼
 raw bytes from UDS socket
       │
       │ ③ Read binary header
       │   (connection handler: route by session_id)
       │   Extract call_id, method name
       ▼
 { callId, method, payloadBytes }
       │
       │ ④ v8.deserialize(payloadBytes)
       │   (Node built-in, zero dependencies)
       ▼
 JS args: ["/foo"]
       │
       │ ⑤ handler("/foo")
       │   → node:fs.readFile → kernel I/O
       ▼
 Buffer<file contents>
       │
       │ ⑥ v8.serialize(result)
       │   (Node built-in)
       ▼
 Buffer [V8 wire format]
       │
       │ ⑦ Write binary header:
       │   [4B frame_len][0x06 BridgeResponse]
       │   [1B sid_len][32B session_id]
       │   [4B call_id][0x00 success]
       │   [V8 payload bytes]
       ▼
 raw bytes on UDS socket
       │
 ══════╪═══════════════════════════════════════════
       │
       ▼
 raw bytes from UDS socket
       │
       │ ⑧ Read binary header
       │   Extract call_id, status
       ▼
 { callId, payloadBytes }
       │
       │ ⑨ v8::ValueDeserializer::read_value()
       │   (native bytes → V8 value)
       ▼
 v8::Uint8Array (file contents in V8 heap)
       │
       │ returned to user code
       ▼
 Buffer in sandbox JS
```

**9 steps** (down from 13). **1 encode + 1 decode per direction** (down from 2+2). Zero serialization libraries.

## What gets deleted

### Rust crates removed
- `rmp-serde` — MessagePack struct serialization
- `serde_bytes` — binary field annotation
- `rmpv` — dynamic MessagePack value type
- `serde` derive feature may be reducible (only needed if other code uses it)

### Rust code removed
- `bridge.rs`: `v8_to_rmpv()`, `rmpv_to_v8()`, `encode_v8_args()`, `msgpack_to_v8_value()`, `v8_value_to_msgpack()` (~130 lines)
- `ipc.rs`: `write_message()`, `read_message()` replaced with binary header read/write (~40 lines replaced with ~80 lines)
- All `#[serde(tag = "type")]`, `#[serde(with = "serde_bytes")]` annotations

### JS code removed
- `@msgpack/msgpack` dependency from `packages/secure-exec-v8/`
- `ipc-client.ts`: MessagePack encode/decode replaced with binary header + `v8.serialize()`
- `runtime.ts`: `decode(msg.args)` / `encode(result)` replaced with `v8.deserialize()` / `v8.serialize()`
- `ipc-types.ts`: discriminated union types replaced with simpler typed interfaces

### JS code added
- `import v8 from 'node:v8'` — built-in, zero dependencies

## Performance impact

| Operation | Current (double msgpack) | Proposed (V8 serialize) | Why |
|-----------|------------------------|------------------------|-----|
| Serialize bridge args | `v8_to_rmpv` walk + `rmpv::encode` | `ValueSerializer::write_value` (single V8 API call) | No intermediate representation |
| Deserialize bridge result | `rmpv::decode` + `rmpv_to_v8` walk | `ValueDeserializer::read_value` (single V8 API call) | No intermediate representation |
| Serialize IPC envelope | `rmp_serde::to_vec_named` (allocates, hashes field names) | `memcpy` fixed fields into pre-allocated buffer | No serialization library |
| Deserialize IPC envelope | `rmp_serde::from_slice` (parses msgpack map, matches field names) | Read fixed offsets from buffer | No deserialization library |
| Binary data (1MB file) | V8 → rmpv::Binary → msgpack bin → msgpack envelope bin | V8 → ValueSerializer (includes backing store) | One fewer copy |

## Bun compatibility

Bun supports `v8.serialize()` / `v8.deserialize()` as a compatibility shim over JSC's serialization. The V8 wire format is a de facto standard. If a future host runtime doesn't support it, the binary header format allows swapping the payload serializer per-connection (add a version/capability byte to the Authenticate handshake).

## Migration plan

1. Add `v8::ValueSerializer` / `v8::ValueDeserializer` wrappers in `bridge.rs`
2. Replace `encode_v8_args` and `msgpack_to_v8_value` with the V8 serializer
3. Replace `ipc.rs` MessagePack framing with binary header read/write
4. Replace JS-side `@msgpack/msgpack` with `node:v8` serialize/deserialize
5. Remove `rmp-serde`, `serde_bytes`, `rmpv` from Cargo.toml
6. Remove `@msgpack/msgpack` from package.json
7. Update all tests
