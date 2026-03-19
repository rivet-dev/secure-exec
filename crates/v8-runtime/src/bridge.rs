// Host function injection via v8::FunctionTemplate

use std::ffi::c_void;

use crate::host_call::BridgeCallContext;

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

/// Register sync-blocking bridge functions on the V8 global object.
///
/// Each registered function, when called from V8:
/// 1. Serializes arguments as a MessagePack array
/// 2. Sends a BridgeCall over IPC via BridgeCallContext
/// 3. Blocks on read() for the BridgeResponse
/// 4. Returns the deserialized result or throws a V8 exception
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

    // Serialize V8 arguments as MessagePack array
    let encoded_args = encode_v8_args(scope, &args);

    // Perform sync-blocking bridge call
    match ctx.sync_call(&data.method, encoded_args) {
        Ok(Some(result_bytes)) => match msgpack_to_v8_value(scope, &result_bytes) {
            Ok(v8_val) => rv.set(v8_val),
            Err(err) => {
                let msg =
                    v8::String::new(scope, &format!("bridge deserialization error: {}", err))
                        .unwrap();
                let exc = v8::Exception::error(scope, msg);
                scope.throw_exception(exc);
            }
        },
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

/// Encode V8 function arguments as a MessagePack array.
fn encode_v8_args(scope: &mut v8::HandleScope, args: &v8::FunctionCallbackArguments) -> Vec<u8> {
    let count = args.length();
    let mut values = Vec::with_capacity(count as usize);
    for i in 0..count {
        values.push(v8_to_rmpv(scope, args.get(i)));
    }
    let array = rmpv::Value::Array(values);
    let mut buf = Vec::new();
    rmpv::encode::write_value(&mut buf, &array).unwrap();
    buf
}

/// Convert a V8 value to an rmpv::Value for MessagePack serialization.
fn v8_to_rmpv(scope: &mut v8::HandleScope, val: v8::Local<v8::Value>) -> rmpv::Value {
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
