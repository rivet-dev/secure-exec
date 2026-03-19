// Host function injection via v8::FunctionTemplate

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;

use v8::ValueDeserializerHelper;
use v8::ValueSerializerHelper;

use crate::host_call::BridgeCallContext;

// Minimal delegate for V8 ValueSerializer — throws DataCloneError as a V8 exception
struct DefaultSerializerDelegate;

impl v8::ValueSerializerImpl for DefaultSerializerDelegate {
    fn throw_data_clone_error<'s>(
        &self,
        scope: &mut v8::HandleScope<'s>,
        message: v8::Local<'s, v8::String>,
    ) {
        let exc = v8::Exception::error(scope, message);
        scope.throw_exception(exc);
    }
}

// Minimal delegate for V8 ValueDeserializer — default callbacks are sufficient
struct DefaultDeserializerDelegate;

impl v8::ValueDeserializerImpl for DefaultDeserializerDelegate {}

/// Serialize a V8 value to bytes using V8's built-in ValueSerializer.
/// Handles all V8 types natively: primitives, strings, arrays, objects,
/// Uint8Array, Date, Map, Set, RegExp, Error, and circular references.
pub fn serialize_v8_value(
    scope: &mut v8::HandleScope,
    value: v8::Local<v8::Value>,
) -> Result<Vec<u8>, String> {
    let context = scope.get_current_context();
    let serializer = v8::ValueSerializer::new(
        scope,
        Box::new(DefaultSerializerDelegate),
    );
    serializer.write_header();
    serializer
        .write_value(context, value)
        .ok_or_else(|| "V8 ValueSerializer: failed to serialize value".to_string())?;
    Ok(serializer.release())
}

/// Deserialize bytes back to a V8 value using V8's built-in ValueDeserializer.
/// The bytes must have been produced by serialize_v8_value() or node:v8.serialize().
pub fn deserialize_v8_value<'s>(
    scope: &mut v8::HandleScope<'s>,
    data: &[u8],
) -> Result<v8::Local<'s, v8::Value>, String> {
    let context = scope.get_current_context();
    let deserializer = v8::ValueDeserializer::new(
        scope,
        Box::new(DefaultDeserializerDelegate),
        data,
    );
    deserializer
        .read_header(context)
        .ok_or_else(|| "V8 ValueDeserializer: invalid header".to_string())?;
    deserializer
        .read_value(context)
        .ok_or_else(|| "V8 ValueDeserializer: failed to deserialize value".to_string())
}

/// Data attached to each sync bridge function via v8::External.
/// BridgeFnStore keeps these heap allocations alive for the session.
struct SyncBridgeFnData {
    ctx: *const BridgeCallContext,
    method: String,
}

/// Opaque store that keeps bridge function data alive.
/// Must be held for the lifetime of the V8 context.
pub struct BridgeFnStore {
    _data: Vec<Box<SyncBridgeFnData>>,
}

/// Data attached to each async bridge function via v8::External.
struct AsyncBridgeFnData {
    ctx: *const BridgeCallContext,
    pending: *const PendingPromises,
    method: String,
}

/// Opaque store that keeps async bridge function data alive.
/// Must be held for the lifetime of the V8 context.
pub struct AsyncBridgeFnStore {
    _data: Vec<Box<AsyncBridgeFnData>>,
}

/// Stores pending promise resolvers keyed by call_id.
/// Single-threaded: only accessed from the session thread.
pub struct PendingPromises {
    map: RefCell<HashMap<u32, v8::Global<v8::PromiseResolver>>>,
}

impl PendingPromises {
    pub fn new() -> Self {
        PendingPromises {
            map: RefCell::new(HashMap::new()),
        }
    }

    /// Store a resolver for a given call_id.
    pub fn insert(&self, call_id: u32, resolver: v8::Global<v8::PromiseResolver>) {
        self.map.borrow_mut().insert(call_id, resolver);
    }

    /// Remove and return the resolver for a given call_id.
    pub fn remove(&self, call_id: u32) -> Option<v8::Global<v8::PromiseResolver>> {
        self.map.borrow_mut().remove(&call_id)
    }

    /// Number of pending promises.
    pub fn len(&self) -> usize {
        self.map.borrow().len()
    }
}

/// Register sync-blocking bridge functions on the V8 global object.
///
/// Each registered function, when called from V8:
/// 1. Serializes arguments as a V8 Array via ValueSerializer
/// 2. Sends a BridgeCall over IPC via BridgeCallContext
/// 3. Blocks on read() for the BridgeResponse
/// 4. Returns the V8-deserialized result or throws a V8 exception
///
/// The BridgeCallContext pointer must remain valid for the lifetime of the V8 context.
/// The returned BridgeFnStore must also be kept alive.
pub fn register_sync_bridge_fns(
    scope: &mut v8::HandleScope,
    ctx: *const BridgeCallContext,
    methods: &[&str],
) -> BridgeFnStore {
    let context = scope.get_current_context();
    let global = context.global(scope);
    let mut data = Vec::with_capacity(methods.len());

    for &method_name in methods {
        let boxed = Box::new(SyncBridgeFnData {
            ctx,
            method: method_name.to_string(),
        });
        // Pointer to heap allocation — stable while Box exists in data vec
        let ptr = &*boxed as *const SyncBridgeFnData as *mut c_void;
        data.push(boxed);

        let external = v8::External::new(scope, ptr);
        let template = v8::FunctionTemplate::builder(sync_bridge_callback)
            .data(external.into())
            .build(scope);
        let func = template.get_function(scope).unwrap();

        let key = v8::String::new(scope, method_name).unwrap();
        global.set(scope, key.into(), func.into());
    }

    BridgeFnStore { _data: data }
}

/// V8 FunctionTemplate callback for sync-blocking bridge calls.
fn sync_bridge_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    // Extract SyncBridgeFnData from External
    let external = match v8::Local::<v8::External>::try_from(args.data()) {
        Ok(ext) => ext,
        Err(_) => {
            let msg =
                v8::String::new(scope, "internal error: missing bridge function data").unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
            return;
        }
    };
    // SAFETY: pointer is valid while BridgeFnStore is alive (same session lifetime)
    let data = unsafe { &*(external.value() as *const SyncBridgeFnData) };
    let ctx = unsafe { &*data.ctx };

    // Serialize V8 arguments as V8 Array via ValueSerializer
    let encoded_args = match serialize_v8_args(scope, &args) {
        Ok(bytes) => bytes,
        Err(err) => {
            let msg = v8::String::new(scope, &format!("bridge serialization error: {}", err)).unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
            return;
        }
    };

    // Perform sync-blocking bridge call
    match ctx.sync_call(&data.method, encoded_args) {
        Ok(Some(result_bytes)) => {
            // Try V8 deserialization in a TryCatch scope; if it fails,
            // treat as raw binary (Uint8Array) — covers status=2 raw binary
            // and V8 version incompatibilities for typed arrays.
            let v8_val = {
                let tc = &mut v8::TryCatch::new(scope);
                deserialize_v8_value(tc, &result_bytes).ok()
            };
            if let Some(val) = v8_val {
                rv.set(val);
            } else {
                // Fallback: raw binary data → Uint8Array
                let len = result_bytes.len();
                let ab = v8::ArrayBuffer::new(scope, len);
                if len > 0 {
                    let bs = ab.get_backing_store();
                    unsafe {
                        std::ptr::copy_nonoverlapping(
                            result_bytes.as_ptr(),
                            bs.data().unwrap().as_ptr() as *mut u8,
                            len,
                        );
                    }
                }
                let arr = v8::Uint8Array::new(scope, ab, 0, len).unwrap();
                rv.set(arr.into());
            }
        }
        Ok(None) => {
            rv.set_undefined();
        }
        Err(err_msg) => {
            let msg = v8::String::new(scope, &err_msg).unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
        }
    }
}

/// Register async promise-returning bridge functions on the V8 global object.
///
/// Each registered function, when called from V8:
/// 1. Creates a v8::PromiseResolver
/// 2. Stores the resolver + call_id in PendingPromises
/// 3. Sends a BridgeCall over IPC (non-blocking write)
/// 4. Returns the promise to V8
///
/// The BridgeCallContext and PendingPromises pointers must remain valid
/// for the lifetime of the V8 context.
pub fn register_async_bridge_fns(
    scope: &mut v8::HandleScope,
    ctx: *const BridgeCallContext,
    pending: *const PendingPromises,
    methods: &[&str],
) -> AsyncBridgeFnStore {
    let context = scope.get_current_context();
    let global = context.global(scope);
    let mut data = Vec::with_capacity(methods.len());

    for &method_name in methods {
        let boxed = Box::new(AsyncBridgeFnData {
            ctx,
            pending,
            method: method_name.to_string(),
        });
        // Pointer to heap allocation — stable while Box exists in data vec
        let ptr = &*boxed as *const AsyncBridgeFnData as *mut c_void;
        data.push(boxed);

        let external = v8::External::new(scope, ptr);
        let template = v8::FunctionTemplate::builder(async_bridge_callback)
            .data(external.into())
            .build(scope);
        let func = template.get_function(scope).unwrap();

        let key = v8::String::new(scope, method_name).unwrap();
        global.set(scope, key.into(), func.into());
    }

    AsyncBridgeFnStore { _data: data }
}

/// V8 FunctionTemplate callback for async promise-returning bridge calls.
fn async_bridge_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    // Extract AsyncBridgeFnData from External
    let external = match v8::Local::<v8::External>::try_from(args.data()) {
        Ok(ext) => ext,
        Err(_) => {
            let msg =
                v8::String::new(scope, "internal error: missing async bridge function data")
                    .unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
            return;
        }
    };
    // SAFETY: pointer is valid while AsyncBridgeFnStore is alive (same session lifetime)
    let data = unsafe { &*(external.value() as *const AsyncBridgeFnData) };
    let ctx = unsafe { &*data.ctx };
    let pending = unsafe { &*data.pending };

    // Create PromiseResolver
    let resolver = match v8::PromiseResolver::new(scope) {
        Some(r) => r,
        None => {
            let msg = v8::String::new(scope, "failed to create PromiseResolver").unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
            return;
        }
    };

    // Get the promise to return to V8
    let promise = resolver.get_promise(scope);

    // Serialize V8 arguments as V8 Array via ValueSerializer
    let encoded_args = match serialize_v8_args(scope, &args) {
        Ok(bytes) => bytes,
        Err(err) => {
            let msg = v8::String::new(scope, &format!("bridge serialization error: {}", err)).unwrap();
            let exc = v8::Exception::error(scope, msg);
            scope.throw_exception(exc);
            return;
        }
    };

    // Send BridgeCall (non-blocking write)
    match ctx.async_send(&data.method, encoded_args) {
        Ok(call_id) => {
            // Store resolver in pending promises map
            let global_resolver = v8::Global::new(scope, resolver);
            pending.insert(call_id, global_resolver);
        }
        Err(err_msg) => {
            // Reject the promise immediately if send fails
            let msg = v8::String::new(scope, &err_msg).unwrap();
            let exc = v8::Exception::error(scope, msg);
            resolver.reject(scope, exc);
        }
    }

    // Return the promise
    rv.set(promise.into());
}

/// Serialize V8 function arguments as a V8 Array via ValueSerializer.
fn serialize_v8_args(scope: &mut v8::HandleScope, args: &v8::FunctionCallbackArguments) -> Result<Vec<u8>, String> {
    let count = args.length();
    let array = v8::Array::new(scope, count);
    for i in 0..count {
        array.set_index(scope, i as u32, args.get(i));
    }
    serialize_v8_value(scope, array.into())
}

/// Serialize a V8 value to MessagePack bytes.
pub fn v8_value_to_msgpack(scope: &mut v8::HandleScope, val: v8::Local<v8::Value>) -> Vec<u8> {
    let rmpv_val = v8_to_rmpv(scope, val);
    let mut buf = Vec::new();
    rmpv::encode::write_value(&mut buf, &rmpv_val).unwrap();
    buf
}

/// Convert a V8 value to an rmpv::Value for MessagePack serialization.
pub fn v8_to_rmpv(scope: &mut v8::HandleScope, val: v8::Local<v8::Value>) -> rmpv::Value {
    if val.is_null_or_undefined() {
        rmpv::Value::Nil
    } else if val.is_boolean() {
        rmpv::Value::Boolean(val.boolean_value(scope))
    } else if val.is_number() {
        let n = val.number_value(scope).unwrap_or(0.0);
        // Encode integers compactly; floats as f64
        if n.fract() == 0.0 && n.abs() < (1i64 << 53) as f64 {
            if n < 0.0 {
                rmpv::Value::Integer(rmpv::Integer::from(n as i64))
            } else {
                rmpv::Value::Integer(rmpv::Integer::from(n as u64))
            }
        } else {
            rmpv::Value::F64(n)
        }
    } else if val.is_string() {
        rmpv::Value::String(val.to_rust_string_lossy(scope).into())
    } else if val.is_uint8_array() {
        let arr = v8::Local::<v8::Uint8Array>::try_from(val).unwrap();
        let mut data = vec![0u8; arr.byte_length()];
        arr.copy_contents(&mut data);
        rmpv::Value::Binary(data)
    } else if val.is_array() {
        let arr = v8::Local::<v8::Array>::try_from(val).unwrap();
        let len = arr.length();
        let mut items = Vec::with_capacity(len as usize);
        for i in 0..len {
            let item = arr
                .get_index(scope, i)
                .unwrap_or_else(|| v8::undefined(scope).into());
            items.push(v8_to_rmpv(scope, item));
        }
        rmpv::Value::Array(items)
    } else if val.is_object() {
        let obj = v8::Local::<v8::Object>::try_from(val).unwrap();
        if let Some(names) = obj.get_own_property_names(scope, Default::default()) {
            let len = names.length();
            let mut entries = Vec::with_capacity(len as usize);
            for i in 0..len {
                let key = names.get_index(scope, i).unwrap();
                let value = obj
                    .get(scope, key)
                    .unwrap_or_else(|| v8::undefined(scope).into());
                entries.push((
                    rmpv::Value::String(key.to_rust_string_lossy(scope).into()),
                    v8_to_rmpv(scope, value),
                ));
            }
            rmpv::Value::Map(entries)
        } else {
            rmpv::Value::Map(vec![])
        }
    } else {
        rmpv::Value::Nil
    }
}

/// Decode a MessagePack byte array into a V8 value.
pub fn msgpack_to_v8_value<'s>(
    scope: &mut v8::HandleScope<'s>,
    bytes: &[u8],
) -> Result<v8::Local<'s, v8::Value>, String> {
    let value: rmpv::Value =
        rmpv::decode::read_value(&mut &bytes[..]).map_err(|e| format!("msgpack decode: {}", e))?;
    Ok(rmpv_to_v8(scope, &value))
}

/// Convert an rmpv::Value to a V8 Local value.
fn rmpv_to_v8<'s>(scope: &mut v8::HandleScope<'s>, val: &rmpv::Value) -> v8::Local<'s, v8::Value> {
    match val {
        rmpv::Value::Nil => v8::null(scope).into(),
        rmpv::Value::Boolean(b) => v8::Boolean::new(scope, *b).into(),
        rmpv::Value::Integer(i) => {
            if let Some(n) = i.as_i64() {
                v8::Number::new(scope, n as f64).into()
            } else if let Some(n) = i.as_u64() {
                v8::Number::new(scope, n as f64).into()
            } else {
                v8::null(scope).into()
            }
        }
        rmpv::Value::F32(f) => v8::Number::new(scope, *f as f64).into(),
        rmpv::Value::F64(f) => v8::Number::new(scope, *f).into(),
        rmpv::Value::String(s) => {
            let s = s.as_str().unwrap_or("");
            v8::String::new(scope, s).unwrap().into()
        }
        rmpv::Value::Binary(data) => {
            let len = data.len();
            let ab = v8::ArrayBuffer::new(scope, len);
            if len > 0 {
                let bs = ab.get_backing_store();
                // SAFETY: backing store is freshly allocated with exactly `len` bytes
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        data.as_ptr(),
                        bs.data().unwrap().as_ptr() as *mut u8,
                        len,
                    );
                }
            }
            v8::Uint8Array::new(scope, ab, 0, len).unwrap().into()
        }
        rmpv::Value::Array(items) => {
            let arr = v8::Array::new(scope, items.len() as i32);
            for (i, item) in items.iter().enumerate() {
                let v = rmpv_to_v8(scope, item);
                arr.set_index(scope, i as u32, v);
            }
            arr.into()
        }
        rmpv::Value::Map(entries) => {
            let obj = v8::Object::new(scope);
            for (k, v) in entries {
                let key = rmpv_to_v8(scope, k);
                let val = rmpv_to_v8(scope, v);
                obj.set(scope, key, val);
            }
            obj.into()
        }
        rmpv::Value::Ext(_, _) => v8::null(scope).into(),
    }
}

/// Resolve or reject a pending async bridge promise by call_id.
///
/// Called when a BridgeResponse arrives during the session event loop.
/// Flushes microtasks after resolution to process .then() handlers.
pub fn resolve_pending_promise(
    scope: &mut v8::HandleScope,
    pending: &PendingPromises,
    call_id: u32,
    result: Option<Vec<u8>>,
    error: Option<String>,
) -> Result<(), String> {
    let resolver_global = pending
        .remove(call_id)
        .ok_or_else(|| format!("no pending promise for call_id {}", call_id))?;
    let resolver = v8::Local::new(scope, &resolver_global);

    if let Some(err_msg) = error {
        let msg = v8::String::new(scope, &err_msg).unwrap();
        let exc = v8::Exception::error(scope, msg);
        resolver.reject(scope, exc);
    } else if let Some(result_bytes) = result {
        // Try V8 deserialization in a TryCatch scope; fallback to raw binary
        let v8_val = {
            let tc = &mut v8::TryCatch::new(scope);
            deserialize_v8_value(tc, &result_bytes).ok()
        };
        if let Some(val) = v8_val {
            resolver.resolve(scope, val);
        } else {
            // Fallback: raw binary data → Uint8Array
            let len = result_bytes.len();
            let ab = v8::ArrayBuffer::new(scope, len);
            if len > 0 {
                let bs = ab.get_backing_store();
                unsafe {
                    std::ptr::copy_nonoverlapping(
                        result_bytes.as_ptr(),
                        bs.data().unwrap().as_ptr() as *mut u8,
                        len,
                    );
                }
            }
            let arr = v8::Uint8Array::new(scope, ab, 0, len).unwrap();
            resolver.resolve(scope, arr.into());
        }
    } else {
        let undef = v8::undefined(scope);
        resolver.resolve(scope, undef.into());
    }

    // Flush microtasks after resolution
    scope.perform_microtask_checkpoint();

    Ok(())
}
