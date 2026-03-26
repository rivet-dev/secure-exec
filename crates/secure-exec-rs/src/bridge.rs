// Bridge call dispatcher
//
// Routes incoming BridgeCall messages to the correct SystemDriver adapter.
// Includes a minimal V8 ValueSerializer/ValueDeserializer implementation
// for the subset of types used in bridge call arguments and responses.

use std::collections::HashMap;

use crate::error::{Error, Result};
use crate::system::SystemDriver;

// ============================================================
// V8 Serialization Format — Minimal Implementation
// ============================================================

// Header
const V8_VERSION_TAG: u8 = 0xFF;
const V8_SERIALIZER_VERSION: u32 = 15;

// Value tags (from V8 SerializationTag enum)
const TAG_PADDING: u8 = 0x00;
const TAG_UNDEFINED: u8 = b'_';
const TAG_NULL: u8 = b'0';
const TAG_TRUE: u8 = b'T';
const TAG_FALSE: u8 = b'F';
const TAG_INT32: u8 = b'I';
const TAG_UINT32: u8 = b'U';
const TAG_DOUBLE: u8 = b'N';
const TAG_ONE_BYTE_STRING: u8 = b'"';
const TAG_TWO_BYTE_STRING: u8 = b'c';
const TAG_UTF8_STRING: u8 = b'S';
const TAG_BEGIN_JS_OBJECT: u8 = b'o';
const TAG_END_JS_OBJECT: u8 = b'{';
const TAG_BEGIN_DENSE_ARRAY: u8 = b'A';
const TAG_END_DENSE_ARRAY: u8 = b'$';
const TAG_ARRAY_BUFFER: u8 = b'B';
const TAG_ARRAY_BUFFER_VIEW: u8 = b'V';
const TAG_BEGIN_SPARSE_JS_ARRAY: u8 = b'a';
const TAG_END_SPARSE_JS_ARRAY: u8 = b'@';
const TAG_OBJECT_REFERENCE: u8 = b'^';

/// Intermediate representation of a V8-serialized value.
#[derive(Clone, Debug)]
pub(crate) enum V8Value {
    Undefined,
    Null,
    Bool(bool),
    Int32(i32),
    Uint32(u32),
    Double(f64),
    String(String),
    Array(Vec<V8Value>),
    Object(Vec<(String, V8Value)>),
    Bytes(Vec<u8>),
}

impl V8Value {
    pub fn as_str(&self) -> Result<&str> {
        match self {
            V8Value::String(s) => Ok(s),
            _ => Err(Error::Serialization(format!(
                "expected string, got {:?}",
                std::mem::discriminant(self)
            ))),
        }
    }

    pub fn as_f64(&self) -> Result<f64> {
        match self {
            V8Value::Double(n) => Ok(*n),
            V8Value::Int32(n) => Ok(*n as f64),
            V8Value::Uint32(n) => Ok(*n as f64),
            _ => Err(Error::Serialization(format!(
                "expected number, got {:?}",
                std::mem::discriminant(self)
            ))),
        }
    }

    pub fn as_u32(&self) -> Result<u32> {
        match self {
            V8Value::Uint32(n) => Ok(*n),
            V8Value::Int32(n) if *n >= 0 => Ok(*n as u32),
            V8Value::Double(n) => Ok(*n as u32),
            _ => Err(Error::Serialization(format!(
                "expected u32, got {:?}",
                std::mem::discriminant(self)
            ))),
        }
    }

    pub fn as_u64(&self) -> Result<u64> {
        match self {
            V8Value::Uint32(n) => Ok(*n as u64),
            V8Value::Int32(n) if *n >= 0 => Ok(*n as u64),
            V8Value::Double(n) => Ok(*n as u64),
            _ => Err(Error::Serialization(format!(
                "expected u64, got {:?}",
                std::mem::discriminant(self)
            ))),
        }
    }

    pub fn as_bytes(&self) -> Result<&[u8]> {
        match self {
            V8Value::Bytes(b) => Ok(b),
            V8Value::String(s) => Ok(s.as_bytes()),
            _ => Err(Error::Serialization(format!(
                "expected bytes, got {:?}",
                std::mem::discriminant(self)
            ))),
        }
    }
}

// -- Deserialization --

struct V8Deserializer<'a> {
    data: &'a [u8],
    pos: usize,
    version: u32,
    objects: Vec<V8Value>,
}

impl<'a> V8Deserializer<'a> {
    fn new(data: &'a [u8]) -> Self {
        V8Deserializer {
            data,
            pos: 0,
            version: 0,
            objects: Vec::new(),
        }
    }

    fn read_byte(&mut self) -> Result<u8> {
        if self.pos >= self.data.len() {
            return Err(Error::Serialization("unexpected end of V8 data".into()));
        }
        let b = self.data[self.pos];
        self.pos += 1;
        Ok(b)
    }

    fn peek_byte(&self) -> Option<u8> {
        self.data.get(self.pos).copied()
    }

    fn read_varint(&mut self) -> Result<u32> {
        let mut value: u32 = 0;
        let mut shift: u32 = 0;
        loop {
            let byte = self.read_byte()?;
            value |= ((byte & 0x7F) as u32) << shift;
            if byte & 0x80 == 0 {
                return Ok(value);
            }
            shift += 7;
            if shift > 35 {
                return Err(Error::Serialization("V8 varint overflow".into()));
            }
        }
    }

    fn read_zigzag(&mut self) -> Result<i32> {
        let encoded = self.read_varint()?;
        Ok(((encoded >> 1) as i32) ^ -((encoded & 1) as i32))
    }

    fn read_double(&mut self) -> Result<f64> {
        if self.pos + 8 > self.data.len() {
            return Err(Error::Serialization(
                "unexpected end of V8 data for double".into(),
            ));
        }
        let bytes: [u8; 8] = self.data[self.pos..self.pos + 8]
            .try_into()
            .map_err(|_| Error::Serialization("invalid double".into()))?;
        self.pos += 8;
        Ok(f64::from_le_bytes(bytes))
    }

    fn read_raw(&mut self, len: usize) -> Result<&'a [u8]> {
        if self.pos + len > self.data.len() {
            return Err(Error::Serialization(
                "unexpected end of V8 data for raw bytes".into(),
            ));
        }
        let bytes = &self.data[self.pos..self.pos + len];
        self.pos += len;
        Ok(bytes)
    }

    fn read_header(&mut self) -> Result<()> {
        let tag = self.read_byte()?;
        if tag != V8_VERSION_TAG {
            return Err(Error::Serialization(format!(
                "invalid V8 header: expected 0xFF, got 0x{:02x}",
                tag
            )));
        }
        self.version = self.read_varint()?;
        Ok(())
    }

    fn read_value(&mut self) -> Result<V8Value> {
        // Skip padding
        while self.peek_byte() == Some(TAG_PADDING) {
            self.pos += 1;
        }

        let tag = self.read_byte()?;
        match tag {
            TAG_UNDEFINED => Ok(V8Value::Undefined),
            TAG_NULL => Ok(V8Value::Null),
            TAG_TRUE => Ok(V8Value::Bool(true)),
            TAG_FALSE => Ok(V8Value::Bool(false)),

            TAG_INT32 => Ok(V8Value::Int32(self.read_zigzag()?)),
            TAG_UINT32 => Ok(V8Value::Uint32(self.read_varint()?)),
            TAG_DOUBLE => Ok(V8Value::Double(self.read_double()?)),

            TAG_ONE_BYTE_STRING => {
                let len = self.read_varint()? as usize;
                let bytes = self.read_raw(len)?;
                // Latin-1: each byte maps directly to a Unicode code point
                let s: String = bytes.iter().map(|&b| b as char).collect();
                Ok(V8Value::String(s))
            }

            TAG_TWO_BYTE_STRING => {
                let char_count = self.read_varint()? as usize;
                let byte_len = char_count * 2;
                let bytes = self.read_raw(byte_len)?;
                let u16s: Vec<u16> = bytes
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                let s = String::from_utf16_lossy(&u16s);
                Ok(V8Value::String(s))
            }

            TAG_UTF8_STRING => {
                let byte_len = self.read_varint()? as usize;
                let bytes = self.read_raw(byte_len)?;
                let s = String::from_utf8_lossy(bytes).into_owned();
                Ok(V8Value::String(s))
            }

            TAG_BEGIN_DENSE_ARRAY => {
                let length = self.read_varint()? as usize;
                let mut items = Vec::with_capacity(length);
                for _ in 0..length {
                    items.push(self.read_value()?);
                }
                let end_tag = self.read_byte()?;
                if end_tag != TAG_END_DENSE_ARRAY {
                    return Err(Error::Serialization(format!(
                        "expected EndDenseArray (0x{:02x}), got 0x{:02x}",
                        TAG_END_DENSE_ARRAY, end_tag
                    )));
                }
                let _num_props = self.read_varint()?;
                let _end_len = self.read_varint()?;

                let val = V8Value::Array(items);
                self.objects.push(val.clone());
                Ok(val)
            }

            TAG_BEGIN_SPARSE_JS_ARRAY => {
                let length = self.read_varint()? as usize;
                let mut items = vec![V8Value::Undefined; length];
                loop {
                    if self.peek_byte() == Some(TAG_END_SPARSE_JS_ARRAY) {
                        self.read_byte()?;
                        let _num_props = self.read_varint()?;
                        let _end_len = self.read_varint()?;
                        break;
                    }
                    let key = self.read_value()?;
                    let value = self.read_value()?;
                    // Integer keys fill array slots
                    if let Ok(idx) = key.as_u32() {
                        if (idx as usize) < length {
                            items[idx as usize] = value;
                        }
                    }
                }
                let val = V8Value::Array(items);
                self.objects.push(val.clone());
                Ok(val)
            }

            TAG_BEGIN_JS_OBJECT => {
                let mut properties = Vec::new();
                loop {
                    if self.peek_byte() == Some(TAG_END_JS_OBJECT) {
                        self.read_byte()?;
                        let _num_props = self.read_varint()?;
                        break;
                    }
                    let key = self.read_value()?;
                    let key_str = key
                        .as_str()
                        .map_err(|_| {
                            Error::Serialization("expected string key in V8 object".into())
                        })?
                        .to_string();
                    let value = self.read_value()?;
                    properties.push((key_str, value));
                }
                let val = V8Value::Object(properties);
                self.objects.push(val.clone());
                Ok(val)
            }

            TAG_ARRAY_BUFFER => {
                let byte_length = self.read_varint()? as usize;
                let bytes = self.read_raw(byte_length)?.to_vec();
                self.objects.push(V8Value::Bytes(bytes.clone()));

                // ArrayBufferView typically follows its backing ArrayBuffer
                if self.peek_byte() == Some(TAG_ARRAY_BUFFER_VIEW) {
                    self.read_byte()?;
                    let _subtype = self.read_varint()?;
                    let byte_offset = self.read_varint()? as usize;
                    let view_length = self.read_varint()? as usize;
                    if self.version >= 14 {
                        let _flags = self.read_varint()?;
                    }
                    let end = (byte_offset + view_length).min(bytes.len());
                    let start = byte_offset.min(end);
                    let view_val = V8Value::Bytes(bytes[start..end].to_vec());
                    self.objects.push(view_val.clone());
                    Ok(view_val)
                } else {
                    Ok(V8Value::Bytes(bytes))
                }
            }

            TAG_ARRAY_BUFFER_VIEW => {
                // Standalone view — reference the most recent ArrayBuffer
                let _subtype = self.read_varint()?;
                let byte_offset = self.read_varint()? as usize;
                let view_length = self.read_varint()? as usize;
                if self.version >= 14 {
                    let _flags = self.read_varint()?;
                }
                let buffer = self
                    .objects
                    .iter()
                    .rev()
                    .find_map(|obj| match obj {
                        V8Value::Bytes(b) => Some(b.clone()),
                        _ => None,
                    })
                    .ok_or_else(|| {
                        Error::Serialization(
                            "ArrayBufferView without preceding ArrayBuffer".into(),
                        )
                    })?;
                let end = (byte_offset + view_length).min(buffer.len());
                let start = byte_offset.min(end);
                let val = V8Value::Bytes(buffer[start..end].to_vec());
                self.objects.push(val.clone());
                Ok(val)
            }

            TAG_OBJECT_REFERENCE => {
                let id = self.read_varint()? as usize;
                self.objects.get(id).cloned().ok_or_else(|| {
                    Error::Serialization(format!("invalid V8 object reference: {}", id))
                })
            }

            _ => Err(Error::Serialization(format!(
                "unsupported V8 tag: 0x{:02x} at position {}",
                tag,
                self.pos - 1
            ))),
        }
    }
}

// -- Serialization --

struct V8Serializer {
    buf: Vec<u8>,
}

impl V8Serializer {
    fn new() -> Self {
        let mut s = V8Serializer {
            buf: Vec::with_capacity(64),
        };
        s.write_header();
        s
    }

    fn write_header(&mut self) {
        self.buf.push(V8_VERSION_TAG);
        self.write_varint(V8_SERIALIZER_VERSION);
    }

    fn write_varint(&mut self, mut value: u32) {
        loop {
            let byte = (value & 0x7F) as u8;
            value >>= 7;
            if value == 0 {
                self.buf.push(byte);
                return;
            }
            self.buf.push(byte | 0x80);
        }
    }

    fn write_zigzag(&mut self, value: i32) {
        let encoded = ((value << 1) ^ (value >> 31)) as u32;
        self.write_varint(encoded);
    }

    fn write_value(&mut self, val: &V8Value) {
        match val {
            V8Value::Undefined => self.buf.push(TAG_UNDEFINED),
            V8Value::Null => self.buf.push(TAG_NULL),
            V8Value::Bool(true) => self.buf.push(TAG_TRUE),
            V8Value::Bool(false) => self.buf.push(TAG_FALSE),

            V8Value::Int32(n) => {
                self.buf.push(TAG_INT32);
                self.write_zigzag(*n);
            }
            V8Value::Uint32(n) => {
                self.buf.push(TAG_UINT32);
                self.write_varint(*n);
            }
            V8Value::Double(n) => {
                self.buf.push(TAG_DOUBLE);
                self.buf.extend_from_slice(&n.to_le_bytes());
            }

            V8Value::String(s) => {
                if s.is_ascii() {
                    self.buf.push(TAG_ONE_BYTE_STRING);
                    self.write_varint(s.len() as u32);
                    self.buf.extend_from_slice(s.as_bytes());
                } else {
                    self.buf.push(TAG_UTF8_STRING);
                    self.write_varint(s.len() as u32);
                    self.buf.extend_from_slice(s.as_bytes());
                }
            }

            V8Value::Array(items) => {
                self.buf.push(TAG_BEGIN_DENSE_ARRAY);
                self.write_varint(items.len() as u32);
                for item in items {
                    self.write_value(item);
                }
                self.buf.push(TAG_END_DENSE_ARRAY);
                self.write_varint(0); // num_properties
                self.write_varint(items.len() as u32);
            }

            V8Value::Object(properties) => {
                self.buf.push(TAG_BEGIN_JS_OBJECT);
                for (key, value) in properties {
                    self.write_value(&V8Value::String(key.clone()));
                    self.write_value(value);
                }
                self.buf.push(TAG_END_JS_OBJECT);
                self.write_varint(properties.len() as u32);
            }

            V8Value::Bytes(bytes) => {
                self.buf.push(TAG_ARRAY_BUFFER);
                self.write_varint(bytes.len() as u32);
                self.buf.extend_from_slice(bytes);
            }
        }
    }

    fn finish(self) -> Vec<u8> {
        self.buf
    }
}

/// Deserialize V8 ValueSerializer bytes into a V8Value.
pub(crate) fn v8_deserialize(data: &[u8]) -> Result<V8Value> {
    if data.is_empty() {
        return Ok(V8Value::Undefined);
    }
    let mut deser = V8Deserializer::new(data);
    deser.read_header()?;
    deser.read_value()
}

/// Serialize a V8Value into V8 ValueSerializer bytes.
pub(crate) fn v8_serialize(val: &V8Value) -> Vec<u8> {
    let mut ser = V8Serializer::new();
    ser.write_value(val);
    ser.finish()
}

// ============================================================
// Bridge Call Dispatcher
// ============================================================

/// Get arg at index from the args array.
fn get_arg<'a>(args: &'a [V8Value], index: usize, method: &str) -> Result<&'a V8Value> {
    args.get(index).ok_or_else(|| {
        Error::Serialization(format!(
            "{}: expected arg at index {}, got {} args",
            method,
            index,
            args.len()
        ))
    })
}

fn require_fs(system: &SystemDriver) -> Result<&dyn crate::fs::FileSystem> {
    system
        .filesystem
        .as_deref()
        .ok_or_else(|| Error::NotSupported("filesystem not available".into()))
}

fn require_network(system: &SystemDriver) -> Result<&dyn crate::network::NetworkAdapter> {
    system
        .network
        .as_deref()
        .ok_or_else(|| Error::NotSupported("network not available".into()))
}

fn require_command(system: &SystemDriver) -> Result<&dyn crate::command::CommandExecutor> {
    system
        .command_executor
        .as_deref()
        .ok_or_else(|| Error::NotSupported("command execution not available".into()))
}

/// Dispatch a bridge call to the correct SystemDriver adapter.
///
/// Deserializes V8-serialized args, routes by method name, and
/// serializes the response back to V8 format (or raw bytes for
/// binary results like Uint8Array).
pub(crate) async fn dispatch_bridge_call(
    system: &SystemDriver,
    method: &str,
    args: &[u8],
) -> Result<Vec<u8>> {
    let params = v8_deserialize(args)?;
    let args_vec = match params {
        V8Value::Array(items) => items,
        V8Value::Undefined => Vec::new(),
        other => vec![other],
    };

    match method {
        // Filesystem
        "_fsReadFile" => fs_read_file(system, &args_vec).await,
        "_fsWriteFile" => fs_write_file(system, &args_vec).await,
        "_fsReadFileBinary" => fs_read_file_binary(system, &args_vec).await,
        "_fsWriteFileBinary" => fs_write_file_binary(system, &args_vec).await,
        "_fsReadDir" => fs_read_dir(system, &args_vec).await,
        "_fsMkdir" => fs_mkdir(system, &args_vec).await,
        "_fsRmdir" => fs_rmdir(system, &args_vec).await,
        "_fsExists" => fs_exists(system, &args_vec).await,
        "_fsStat" => fs_stat(system, &args_vec).await,
        "_fsUnlink" => fs_unlink(system, &args_vec).await,
        "_fsRename" => fs_rename(system, &args_vec).await,
        "_fsChmod" => fs_chmod(system, &args_vec).await,
        "_fsChown" => fs_chown(system, &args_vec).await,
        "_fsLink" => fs_link(system, &args_vec).await,
        "_fsSymlink" => fs_symlink(system, &args_vec).await,
        "_fsReadlink" => fs_readlink(system, &args_vec).await,
        "_fsLstat" => fs_lstat(system, &args_vec).await,
        "_fsTruncate" => fs_truncate(system, &args_vec).await,
        "_fsUtimes" => fs_utimes(system, &args_vec).await,

        // Network
        "_networkFetchRaw" => network_fetch(system, &args_vec).await,
        "_networkDnsLookupRaw" => network_dns_lookup(system, &args_vec).await,
        "_networkHttpRequestRaw" => network_http_request(system, &args_vec).await,

        // Child process
        "_childProcessSpawnSync" => child_process_spawn_sync(system, &args_vec).await,
        "_childProcessSpawnStart" | "_childProcessStdinWrite"
        | "_childProcessStdinClose" | "_childProcessKill" => {
            // Streaming child process requires session-scoped state (US-014/US-016).
            let _ = require_command(system)?;
            Err(Error::NotSupported(format!(
                "{}: streaming child process not yet implemented",
                method
            )))
        }

        // Crypto (built-in, no adapter needed)
        "_cryptoRandomFill" => crypto_random_fill(&args_vec),
        "_cryptoRandomUUID" => crypto_random_uuid(),

        // Process/OS config
        "_processConfig" => Ok(process_config(system)),
        "_osConfig" => Ok(os_config(system)),

        _ => Err(Error::NotSupported(format!(
            "unknown bridge method: {}",
            method
        ))),
    }
}

/// Extract the formatted log message from V8-serialized `_log`/`_error` args.
///
/// The V8 binary serializes args as an array. For console output the bridge
/// code calls `_log(formattedString)`, so the payload is a 1-element array
/// containing the formatted message string.
pub(crate) fn extract_log_message(payload: &[u8]) -> Result<String> {
    let val = v8_deserialize(payload)?;
    match val {
        V8Value::Array(items) if !items.is_empty() => {
            match &items[0] {
                V8Value::String(s) => Ok(s.clone()),
                other => Ok(format!("{:?}", other)),
            }
        }
        V8Value::String(s) => Ok(s),
        _ => Ok(String::new()),
    }
}

/// Bridge dispatcher that wraps dispatch_bridge_call for BridgeCallHandler.
pub(crate) struct BridgeDispatcher<'a> {
    pub system: &'a SystemDriver,
}

impl<'a> crate::v8_runtime::BridgeCallHandler for BridgeDispatcher<'a> {
    fn handle_bridge_call<'b>(
        &'b self,
        method: &'b str,
        payload: &'b [u8],
    ) -> crate::BoxFuture<'b, Result<Vec<u8>>> {
        Box::pin(dispatch_bridge_call(self.system, method, payload))
    }
}

// ============================================================
// Filesystem Dispatchers
// ============================================================

async fn fs_read_file(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsReadFile")?.as_str()?;
    let text = fs.read_text_file(path).await?;
    Ok(v8_serialize(&V8Value::String(text)))
}

async fn fs_write_file(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsWriteFile")?.as_str()?;
    let content = get_arg(args, 1, "_fsWriteFile")?.as_str()?;
    fs.write_file(path, content.as_bytes()).await?;
    Ok(vec![])
}

async fn fs_read_file_binary(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsReadFileBinary")?.as_str()?;
    let data = fs.read_file(path).await?;
    // Return raw bytes — V8 runtime fallback wraps as Uint8Array
    Ok(data)
}

async fn fs_write_file_binary(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsWriteFileBinary")?.as_str()?;
    let content = get_arg(args, 1, "_fsWriteFileBinary")?.as_bytes()?;
    fs.write_file(path, content).await?;
    Ok(vec![])
}

async fn fs_read_dir(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsReadDir")?.as_str()?;
    let entries = fs.read_dir_with_types(path).await?;
    let v8_entries: Vec<V8Value> = entries
        .into_iter()
        .map(|e| {
            V8Value::Object(vec![
                ("name".to_string(), V8Value::String(e.name)),
                ("isDirectory".to_string(), V8Value::Bool(e.is_directory)),
            ])
        })
        .collect();
    Ok(v8_serialize(&V8Value::Array(v8_entries)))
}

async fn fs_mkdir(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsMkdir")?.as_str()?;
    fs.mkdir(path).await?;
    Ok(vec![])
}

async fn fs_rmdir(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsRmdir")?.as_str()?;
    fs.remove_dir(path).await?;
    Ok(vec![])
}

async fn fs_exists(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsExists")?.as_str()?;
    let exists = fs.exists(path).await?;
    Ok(v8_serialize(&V8Value::Bool(exists)))
}

fn stat_to_v8(s: &crate::fs::FileStat) -> V8Value {
    V8Value::Object(vec![
        ("mode".to_string(), V8Value::Double(s.mode as f64)),
        ("size".to_string(), V8Value::Double(s.size as f64)),
        ("isDirectory".to_string(), V8Value::Bool(s.is_directory)),
        ("atimeMs".to_string(), V8Value::Double(s.atime_ms)),
        ("mtimeMs".to_string(), V8Value::Double(s.mtime_ms)),
        ("ctimeMs".to_string(), V8Value::Double(s.ctime_ms)),
        (
            "birthtimeMs".to_string(),
            V8Value::Double(s.birthtime_ms),
        ),
    ])
}

fn lstat_to_v8(s: &crate::fs::FileStat) -> V8Value {
    V8Value::Object(vec![
        ("mode".to_string(), V8Value::Double(s.mode as f64)),
        ("size".to_string(), V8Value::Double(s.size as f64)),
        ("isDirectory".to_string(), V8Value::Bool(s.is_directory)),
        (
            "isSymbolicLink".to_string(),
            V8Value::Bool(s.is_symbolic_link),
        ),
        ("atimeMs".to_string(), V8Value::Double(s.atime_ms)),
        ("mtimeMs".to_string(), V8Value::Double(s.mtime_ms)),
        ("ctimeMs".to_string(), V8Value::Double(s.ctime_ms)),
        (
            "birthtimeMs".to_string(),
            V8Value::Double(s.birthtime_ms),
        ),
    ])
}

async fn fs_stat(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsStat")?.as_str()?;
    let s = fs.stat(path).await?;
    Ok(v8_serialize(&stat_to_v8(&s)))
}

async fn fs_unlink(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsUnlink")?.as_str()?;
    fs.remove_file(path).await?;
    Ok(vec![])
}

async fn fs_rename(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let old_path = get_arg(args, 0, "_fsRename")?.as_str()?;
    let new_path = get_arg(args, 1, "_fsRename")?.as_str()?;
    fs.rename(old_path, new_path).await?;
    Ok(vec![])
}

async fn fs_chmod(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsChmod")?.as_str()?;
    let mode = get_arg(args, 1, "_fsChmod")?.as_u32()?;
    fs.chmod(path, mode).await?;
    Ok(vec![])
}

async fn fs_chown(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsChown")?.as_str()?;
    let uid = get_arg(args, 1, "_fsChown")?.as_u32()?;
    let gid = get_arg(args, 2, "_fsChown")?.as_u32()?;
    fs.chown(path, uid, gid).await?;
    Ok(vec![])
}

async fn fs_link(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let old_path = get_arg(args, 0, "_fsLink")?.as_str()?;
    let new_path = get_arg(args, 1, "_fsLink")?.as_str()?;
    fs.link(old_path, new_path).await?;
    Ok(vec![])
}

async fn fs_symlink(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let target = get_arg(args, 0, "_fsSymlink")?.as_str()?;
    let link_path = get_arg(args, 1, "_fsSymlink")?.as_str()?;
    fs.symlink(target, link_path).await?;
    Ok(vec![])
}

async fn fs_readlink(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsReadlink")?.as_str()?;
    let target = fs.readlink(path).await?;
    Ok(v8_serialize(&V8Value::String(target)))
}

async fn fs_lstat(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsLstat")?.as_str()?;
    let s = fs.lstat(path).await?;
    Ok(v8_serialize(&lstat_to_v8(&s)))
}

async fn fs_truncate(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsTruncate")?.as_str()?;
    let length = get_arg(args, 1, "_fsTruncate")?.as_u64()?;
    fs.truncate(path, length).await?;
    Ok(vec![])
}

async fn fs_utimes(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let fs = require_fs(system)?;
    let path = get_arg(args, 0, "_fsUtimes")?.as_str()?;
    let atime = get_arg(args, 1, "_fsUtimes")?.as_f64()?;
    let mtime = get_arg(args, 2, "_fsUtimes")?.as_f64()?;
    fs.utimes(path, atime, mtime).await?;
    Ok(vec![])
}

// ============================================================
// Network Dispatchers
// ============================================================

async fn network_fetch(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let net = require_network(system)?;
    let url = get_arg(args, 0, "_networkFetchRaw")?.as_str()?;
    let options_json = get_arg(args, 1, "_networkFetchRaw")?.as_str()?;

    let opts: serde_json::Value = serde_json::from_str(options_json)
        .map_err(|e| Error::Serialization(format!("invalid fetch options: {}", e)))?;

    let fetch_opts = parse_fetch_options(&opts);
    let result = net.fetch(url, fetch_opts).await?;

    let headers_obj: Vec<(String, V8Value)> = result
        .headers
        .iter()
        .map(|(k, v)| (k.clone(), V8Value::String(v.clone())))
        .collect();

    Ok(v8_serialize(&V8Value::Object(vec![
        ("ok".to_string(), V8Value::Bool(result.ok)),
        (
            "status".to_string(),
            V8Value::Double(result.status as f64),
        ),
        ("statusText".to_string(), V8Value::String(result.status_text)),
        ("headers".to_string(), V8Value::Object(headers_obj)),
        ("body".to_string(), V8Value::String(result.body)),
        ("url".to_string(), V8Value::String(result.url)),
        ("redirected".to_string(), V8Value::Bool(result.redirected)),
    ])))
}

async fn network_dns_lookup(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let net = require_network(system)?;
    let hostname = get_arg(args, 0, "_networkDnsLookupRaw")?.as_str()?;
    let result = net.dns_lookup(hostname).await?;

    let v8_result = match result {
        crate::network::DnsResult::Success { address, family } => V8Value::Object(vec![
            ("address".to_string(), V8Value::String(address)),
            ("family".to_string(), V8Value::Double(family as f64)),
        ]),
        crate::network::DnsResult::Error { error, code } => V8Value::Object(vec![
            ("error".to_string(), V8Value::String(error)),
            ("code".to_string(), V8Value::String(code)),
        ]),
    };

    Ok(v8_serialize(&v8_result))
}

async fn network_http_request(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let net = require_network(system)?;
    let url = get_arg(args, 0, "_networkHttpRequestRaw")?.as_str()?;
    let options_json = get_arg(args, 1, "_networkHttpRequestRaw")?.as_str()?;

    let opts: serde_json::Value = serde_json::from_str(options_json)
        .map_err(|e| Error::Serialization(format!("invalid HTTP options: {}", e)))?;

    let http_opts = crate::network::HttpRequestOptions {
        method: opts.get("method").and_then(|v| v.as_str()).map(String::from),
        headers: parse_string_map(opts.get("headers")),
        body: opts.get("body").and_then(|v| v.as_str()).map(String::from),
        reject_unauthorized: opts.get("rejectUnauthorized").and_then(|v| v.as_bool()),
    };

    let result = net.http_request(url, http_opts).await?;

    let headers_obj: Vec<(String, V8Value)> = result
        .headers
        .iter()
        .map(|(k, v)| (k.clone(), V8Value::String(v.clone())))
        .collect();

    Ok(v8_serialize(&V8Value::Object(vec![
        (
            "status".to_string(),
            V8Value::Double(result.status as f64),
        ),
        ("statusText".to_string(), V8Value::String(result.status_text)),
        ("headers".to_string(), V8Value::Object(headers_obj)),
        ("body".to_string(), V8Value::String(result.body)),
        ("url".to_string(), V8Value::String(result.url)),
    ])))
}

fn parse_fetch_options(opts: &serde_json::Value) -> crate::network::FetchOptions {
    crate::network::FetchOptions {
        method: opts.get("method").and_then(|v| v.as_str()).map(String::from),
        headers: parse_string_map(opts.get("headers")),
        body: opts.get("body").and_then(|v| v.as_str()).map(String::from),
    }
}

fn parse_string_map(val: Option<&serde_json::Value>) -> Option<HashMap<String, String>> {
    val.and_then(|v| {
        v.as_object().map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
    })
}

// ============================================================
// Child Process Dispatchers
// ============================================================

async fn child_process_spawn_sync(system: &SystemDriver, args: &[V8Value]) -> Result<Vec<u8>> {
    let executor = require_command(system)?;
    let command = get_arg(args, 0, "_childProcessSpawnSync")?.as_str()?;
    let args_json = get_arg(args, 1, "_childProcessSpawnSync")?.as_str()?;
    let options_json = get_arg(args, 2, "_childProcessSpawnSync")?.as_str()?;

    let spawn_args: Vec<String> = serde_json::from_str(args_json)
        .map_err(|e| Error::Serialization(format!("invalid spawn args: {}", e)))?;
    let opts: serde_json::Value = serde_json::from_str(options_json)
        .map_err(|e| Error::Serialization(format!("invalid spawn options: {}", e)))?;

    let spawn_opts = crate::command::SpawnOptions {
        cwd: opts.get("cwd").and_then(|v| v.as_str()).map(String::from),
        env: parse_string_map(opts.get("env")),
    };

    // Collect stdout/stderr into shared buffers
    let stdout_buf: std::sync::Arc<std::sync::Mutex<Vec<u8>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
    let stderr_buf: std::sync::Arc<std::sync::Mutex<Vec<u8>>> =
        std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));

    let out = stdout_buf.clone();
    let err = stderr_buf.clone();

    let process = executor
        .spawn(
            command,
            &spawn_args,
            spawn_opts,
            Some(Box::new(move |data: &[u8]| {
                out.lock().unwrap().extend_from_slice(data);
            })),
            Some(Box::new(move |data: &[u8]| {
                err.lock().unwrap().extend_from_slice(data);
            })),
        )
        .await?;

    let exit_code = process.wait().await?;

    let stdout = String::from_utf8_lossy(&stdout_buf.lock().unwrap()).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_buf.lock().unwrap()).into_owned();

    Ok(v8_serialize(&V8Value::Object(vec![
        ("stdout".to_string(), V8Value::String(stdout)),
        ("stderr".to_string(), V8Value::String(stderr)),
        ("code".to_string(), V8Value::Int32(exit_code)),
        ("maxBufferExceeded".to_string(), V8Value::Bool(false)),
    ])))
}

// ============================================================
// Crypto Dispatchers (built-in)
// ============================================================

fn crypto_random_fill(args: &[V8Value]) -> Result<Vec<u8>> {
    let byte_length = get_arg(args, 0, "_cryptoRandomFill")?.as_u32()? as usize;
    if byte_length > 65536 {
        return Err(Error::Runtime(format!(
            "The ArrayBufferView's byte length ({}) exceeds the number of bytes \
             of entropy available via this API (65536)",
            byte_length
        )));
    }
    let mut buffer = vec![0u8; byte_length];
    getrandom::getrandom(&mut buffer)
        .map_err(|e| Error::Runtime(format!("getrandom failed: {}", e)))?;
    // Return raw bytes — V8 runtime fallback wraps as Uint8Array
    Ok(buffer)
}

fn crypto_random_uuid() -> Result<Vec<u8>> {
    let id = uuid::Uuid::new_v4().to_string();
    Ok(v8_serialize(&V8Value::String(id)))
}

// ============================================================
// Config Dispatchers
// ============================================================

fn process_config(system: &SystemDriver) -> Vec<u8> {
    let pc = &system.runtime.process;
    let mut props = Vec::new();
    if let Some(ref cwd) = pc.cwd {
        props.push(("cwd".to_string(), V8Value::String(cwd.clone())));
    }
    if let Some(ref env) = pc.env {
        let env_obj: Vec<(String, V8Value)> = env
            .iter()
            .map(|(k, v)| (k.clone(), V8Value::String(v.clone())))
            .collect();
        props.push(("env".to_string(), V8Value::Object(env_obj)));
    }
    v8_serialize(&V8Value::Object(props))
}

fn os_config(system: &SystemDriver) -> Vec<u8> {
    let oc = &system.runtime.os;
    let mut props = Vec::new();
    if let Some(ref homedir) = oc.homedir {
        props.push(("homedir".to_string(), V8Value::String(homedir.clone())));
    }
    if let Some(ref tmpdir) = oc.tmpdir {
        props.push(("tmpdir".to_string(), V8Value::String(tmpdir.clone())));
    }
    if let Some(ref platform) = oc.platform {
        props.push(("platform".to_string(), V8Value::String(platform.clone())));
    }
    if let Some(ref arch) = oc.arch {
        props.push(("arch".to_string(), V8Value::String(arch.clone())));
    }
    v8_serialize(&V8Value::Object(props))
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{create_node_driver, NodeDriverOptions};

    // -- V8 serde roundtrip tests --

    #[test]
    fn roundtrip_string_ascii() {
        let val = V8Value::String("hello world".into());
        let bytes = v8_serialize(&val);
        let result = v8_deserialize(&bytes).unwrap();
        assert_eq!(result.as_str().unwrap(), "hello world");
    }

    #[test]
    fn roundtrip_string_unicode() {
        let val = V8Value::String("héllo wörld 🌍".into());
        let bytes = v8_serialize(&val);
        let result = v8_deserialize(&bytes).unwrap();
        assert_eq!(result.as_str().unwrap(), "héllo wörld 🌍");
    }

    #[test]
    fn roundtrip_int32() {
        let val = V8Value::Int32(-42);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Int32(n) => assert_eq!(n, -42),
            other => panic!("expected Int32, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_uint32() {
        let val = V8Value::Uint32(12345);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Uint32(n) => assert_eq!(n, 12345),
            other => panic!("expected Uint32, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_double() {
        let val = V8Value::Double(3.14);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Double(n) => assert!((n - 3.14).abs() < f64::EPSILON),
            other => panic!("expected Double, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_bool_true_false() {
        for b in [true, false] {
            let bytes = v8_serialize(&V8Value::Bool(b));
            match v8_deserialize(&bytes).unwrap() {
                V8Value::Bool(got) => assert_eq!(got, b),
                other => panic!("expected Bool({}), got {:?}", b, other),
            }
        }
    }

    #[test]
    fn roundtrip_null_undefined() {
        match v8_deserialize(&v8_serialize(&V8Value::Null)).unwrap() {
            V8Value::Null => {}
            other => panic!("expected Null, got {:?}", other),
        }
        match v8_deserialize(&v8_serialize(&V8Value::Undefined)).unwrap() {
            V8Value::Undefined => {}
            other => panic!("expected Undefined, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_array() {
        let val = V8Value::Array(vec![
            V8Value::String("/test.txt".into()),
            V8Value::Int32(42),
            V8Value::Bool(true),
        ]);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Array(items) => {
                assert_eq!(items.len(), 3);
                assert_eq!(items[0].as_str().unwrap(), "/test.txt");
                assert_eq!(items[1].as_f64().unwrap() as i32, 42);
            }
            other => panic!("expected Array, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_object() {
        let val = V8Value::Object(vec![
            ("mode".into(), V8Value::Double(0o644 as f64)),
            ("isDirectory".into(), V8Value::Bool(false)),
        ]);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Object(props) => {
                assert_eq!(props.len(), 2);
                assert_eq!(props[0].0, "mode");
                assert_eq!(props[1].0, "isDirectory");
            }
            other => panic!("expected Object, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_bytes() {
        let val = V8Value::Bytes(vec![1, 2, 3, 4, 5]);
        let bytes = v8_serialize(&val);
        match v8_deserialize(&bytes).unwrap() {
            V8Value::Bytes(b) => assert_eq!(b, vec![1, 2, 3, 4, 5]),
            other => panic!("expected Bytes, got {:?}", other),
        }
    }

    #[test]
    fn deserialize_empty_returns_undefined() {
        match v8_deserialize(&[]).unwrap() {
            V8Value::Undefined => {}
            other => panic!("expected Undefined, got {:?}", other),
        }
    }

    // -- Dispatch tests --

    #[tokio::test]
    async fn dispatch_fs_read_file() {
        let driver = create_node_driver(NodeDriverOptions::default());
        driver
            .filesystem
            .as_ref()
            .unwrap()
            .write_file("/test.txt", b"hello world")
            .await
            .unwrap();

        let args = v8_serialize(&V8Value::Array(vec![V8Value::String(
            "/test.txt".into(),
        )]));
        let result = dispatch_bridge_call(&driver, "_fsReadFile", &args)
            .await
            .unwrap();
        let val = v8_deserialize(&result).unwrap();
        assert_eq!(val.as_str().unwrap(), "hello world");
    }

    #[tokio::test]
    async fn dispatch_fs_write_and_read_roundtrip() {
        let driver = create_node_driver(NodeDriverOptions::default());

        // Write
        let write_args = v8_serialize(&V8Value::Array(vec![
            V8Value::String("/out.txt".into()),
            V8Value::String("test content".into()),
        ]));
        let wr = dispatch_bridge_call(&driver, "_fsWriteFile", &write_args)
            .await
            .unwrap();
        assert!(wr.is_empty());

        // Read back
        let read_args = v8_serialize(&V8Value::Array(vec![V8Value::String(
            "/out.txt".into(),
        )]));
        let result = dispatch_bridge_call(&driver, "_fsReadFile", &read_args)
            .await
            .unwrap();
        assert_eq!(v8_deserialize(&result).unwrap().as_str().unwrap(), "test content");
    }

    #[tokio::test]
    async fn dispatch_fs_exists() {
        let driver = create_node_driver(NodeDriverOptions::default());
        driver
            .filesystem
            .as_ref()
            .unwrap()
            .write_file("/yes.txt", b"")
            .await
            .unwrap();

        let yes_args = v8_serialize(&V8Value::Array(vec![V8Value::String("/yes.txt".into())]));
        let no_args = v8_serialize(&V8Value::Array(vec![V8Value::String("/nope.txt".into())]));

        match v8_deserialize(
            &dispatch_bridge_call(&driver, "_fsExists", &yes_args)
                .await
                .unwrap(),
        )
        .unwrap()
        {
            V8Value::Bool(b) => assert!(b),
            other => panic!("expected true, got {:?}", other),
        }
        match v8_deserialize(
            &dispatch_bridge_call(&driver, "_fsExists", &no_args)
                .await
                .unwrap(),
        )
        .unwrap()
        {
            V8Value::Bool(b) => assert!(!b),
            other => panic!("expected false, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn dispatch_fs_stat_returns_object() {
        let driver = create_node_driver(NodeDriverOptions::default());
        driver
            .filesystem
            .as_ref()
            .unwrap()
            .write_file("/f.txt", b"abc")
            .await
            .unwrap();

        let args = v8_serialize(&V8Value::Array(vec![V8Value::String("/f.txt".into())]));
        let result = dispatch_bridge_call(&driver, "_fsStat", &args)
            .await
            .unwrap();
        match v8_deserialize(&result).unwrap() {
            V8Value::Object(props) => {
                let keys: Vec<&str> = props.iter().map(|(k, _)| k.as_str()).collect();
                assert!(keys.contains(&"mode"));
                assert!(keys.contains(&"size"));
                assert!(keys.contains(&"isDirectory"));
            }
            other => panic!("expected Object, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn dispatch_crypto_random_uuid() {
        let driver = create_node_driver(NodeDriverOptions::default());
        let args = v8_serialize(&V8Value::Array(vec![]));
        let result = dispatch_bridge_call(&driver, "_cryptoRandomUUID", &args)
            .await
            .unwrap();
        let val = v8_deserialize(&result).unwrap();
        let uuid_str = val.as_str().unwrap();
        assert_eq!(uuid_str.len(), 36);
        assert_eq!(uuid_str.chars().filter(|&c| c == '-').count(), 4);
    }

    #[tokio::test]
    async fn dispatch_crypto_random_fill() {
        let driver = create_node_driver(NodeDriverOptions::default());
        let args = v8_serialize(&V8Value::Array(vec![V8Value::Uint32(16)]));
        let result = dispatch_bridge_call(&driver, "_cryptoRandomFill", &args)
            .await
            .unwrap();
        // Raw bytes (not V8-serialized)
        assert_eq!(result.len(), 16);
        assert!(result.iter().any(|&b| b != 0));
    }

    #[tokio::test]
    async fn dispatch_unknown_method_errors() {
        let driver = create_node_driver(NodeDriverOptions::default());
        let args = v8_serialize(&V8Value::Array(vec![]));
        match dispatch_bridge_call(&driver, "_unknown", &args).await {
            Err(Error::NotSupported(msg)) => assert!(msg.contains("_unknown")),
            other => panic!("expected NotSupported, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn dispatch_missing_adapter_errors() {
        let driver = crate::system::SystemDriver {
            filesystem: None,
            network: None,
            command_executor: None,
            permissions: None,
            runtime: Default::default(),
        };
        let args = v8_serialize(&V8Value::Array(vec![V8Value::String("/f.txt".into())]));
        match dispatch_bridge_call(&driver, "_fsReadFile", &args).await {
            Err(Error::NotSupported(_)) => {}
            other => panic!("expected NotSupported, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn dispatch_process_config() {
        let driver = create_node_driver(crate::NodeDriverOptions {
            process_config: Some(crate::ProcessConfig {
                cwd: Some("/custom".into()),
                env: None,
            }),
            ..NodeDriverOptions::default()
        });
        let args = v8_serialize(&V8Value::Array(vec![]));
        let result = dispatch_bridge_call(&driver, "_processConfig", &args)
            .await
            .unwrap();
        match v8_deserialize(&result).unwrap() {
            V8Value::Object(props) => {
                let cwd = props.iter().find(|(k, _)| k == "cwd");
                assert!(cwd.is_some());
                assert_eq!(cwd.unwrap().1.as_str().unwrap(), "/custom");
            }
            other => panic!("expected Object, got {:?}", other),
        }
    }
}
