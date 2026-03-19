// IPC message types and length-prefixed MessagePack framing

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Execution mode for user code
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMode {
    Exec,
    Run,
}

/// Log output channel
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LogChannel {
    Stdout,
    Stderr,
}

/// Process configuration injected into the V8 global as _processConfig
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProcessConfig {
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub timing_mitigation: String,
    pub frozen_time_ms: Option<f64>,
}

/// OS configuration injected into the V8 global as _osConfig
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OsConfig {
    pub homedir: String,
    pub tmpdir: String,
    pub platform: String,
    pub arch: String,
}

/// Structured error information from V8 execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExecutionError {
    #[serde(rename = "type")]
    pub error_type: String,
    pub message: String,
    pub stack: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

/// Messages sent from the host to the Rust V8 runtime process
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum HostMessage {
    CreateSession {
        session_id: u32,
        heap_limit_mb: Option<u32>,
        cpu_time_limit_ms: Option<u32>,
    },
    DestroySession {
        session_id: u32,
    },
    Execute {
        session_id: u32,
        bridge_code: String,
        user_code: String,
        file_path: Option<String>,
        mode: ExecuteMode,
    },
    InjectGlobals {
        session_id: u32,
        process_config: ProcessConfig,
        os_config: OsConfig,
    },
    BridgeResponse {
        call_id: u32,
        #[serde(with = "serde_bytes")]
        result: Option<Vec<u8>>,
        error: Option<String>,
    },
    StreamEvent {
        session_id: u32,
        event_type: String,
        #[serde(with = "serde_bytes")]
        payload: Vec<u8>,
    },
    TerminateExecution {
        session_id: u32,
    },
}

/// Messages sent from the Rust V8 runtime process to the host
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum RustMessage {
    BridgeCall {
        call_id: u32,
        session_id: u32,
        method: String,
        #[serde(with = "serde_bytes")]
        args: Vec<u8>,
    },
    ExecutionResult {
        session_id: u32,
        code: i32,
        #[serde(with = "serde_bytes")]
        exports: Option<Vec<u8>>,
        error: Option<ExecutionError>,
    },
    Log {
        session_id: u32,
        channel: LogChannel,
        message: String,
    },
    StreamCallback {
        session_id: u32,
        callback_type: String,
        #[serde(with = "serde_bytes")]
        payload: Vec<u8>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Round-trip: serialize to MessagePack then deserialize back
    fn roundtrip<T: Serialize + for<'de> Deserialize<'de> + PartialEq + std::fmt::Debug>(
        msg: &T,
    ) {
        let bytes = rmp_serde::to_vec_named(msg).expect("serialize");
        let decoded: T = rmp_serde::from_slice(&bytes).expect("deserialize");
        assert_eq!(&decoded, msg);
    }

    // -- HostMessage variants --

    #[test]
    fn roundtrip_create_session() {
        roundtrip(&HostMessage::CreateSession {
            session_id: 42,
            heap_limit_mb: Some(128),
            cpu_time_limit_ms: None,
        });
    }

    #[test]
    fn roundtrip_create_session_no_limits() {
        roundtrip(&HostMessage::CreateSession {
            session_id: 1,
            heap_limit_mb: None,
            cpu_time_limit_ms: None,
        });
    }

    #[test]
    fn roundtrip_destroy_session() {
        roundtrip(&HostMessage::DestroySession { session_id: 7 });
    }

    #[test]
    fn roundtrip_execute_exec_mode() {
        roundtrip(&HostMessage::Execute {
            session_id: 1,
            bridge_code: "(function(){ /* bridge */ })()".into(),
            user_code: "console.log('hello')".into(),
            file_path: None,
            mode: ExecuteMode::Exec,
        });
    }

    #[test]
    fn roundtrip_execute_run_mode() {
        roundtrip(&HostMessage::Execute {
            session_id: 2,
            bridge_code: "(function(){ /* bridge */ })()".into(),
            user_code: "export default 42".into(),
            file_path: Some("/app/index.mjs".into()),
            mode: ExecuteMode::Run,
        });
    }

    #[test]
    fn roundtrip_inject_globals() {
        let mut env = HashMap::new();
        env.insert("HOME".into(), "/home/user".into());
        env.insert("PATH".into(), "/usr/bin".into());

        roundtrip(&HostMessage::InjectGlobals {
            session_id: 3,
            process_config: ProcessConfig {
                cwd: "/app".into(),
                env,
                timing_mitigation: "freeze".into(),
                frozen_time_ms: Some(1700000000000.0),
            },
            os_config: OsConfig {
                homedir: "/home/user".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            },
        });
    }

    #[test]
    fn roundtrip_inject_globals_no_frozen_time() {
        roundtrip(&HostMessage::InjectGlobals {
            session_id: 4,
            process_config: ProcessConfig {
                cwd: "/app".into(),
                env: HashMap::new(),
                timing_mitigation: "none".into(),
                frozen_time_ms: None,
            },
            os_config: OsConfig {
                homedir: "/Users/dev".into(),
                tmpdir: "/tmp".into(),
                platform: "darwin".into(),
                arch: "arm64".into(),
            },
        });
    }

    #[test]
    fn roundtrip_bridge_response_with_result() {
        roundtrip(&HostMessage::BridgeResponse {
            call_id: 100,
            result: Some(vec![0x93, 0x01, 0x02, 0x03]),
            error: None,
        });
    }

    #[test]
    fn roundtrip_bridge_response_with_error() {
        roundtrip(&HostMessage::BridgeResponse {
            call_id: 101,
            result: None,
            error: Some("ENOENT: no such file".into()),
        });
    }

    #[test]
    fn roundtrip_stream_event() {
        roundtrip(&HostMessage::StreamEvent {
            session_id: 5,
            event_type: "child_stdout".into(),
            payload: vec![0x48, 0x65, 0x6c, 0x6c, 0x6f],
        });
    }

    #[test]
    fn roundtrip_terminate_execution() {
        roundtrip(&HostMessage::TerminateExecution { session_id: 6 });
    }

    // -- RustMessage variants --

    #[test]
    fn roundtrip_bridge_call() {
        roundtrip(&RustMessage::BridgeCall {
            call_id: 200,
            session_id: 1,
            method: "_fsReadFile".into(),
            args: vec![0x91, 0xa5, 0x2f, 0x74, 0x6d, 0x70],
        });
    }

    #[test]
    fn roundtrip_execution_result_success() {
        roundtrip(&RustMessage::ExecutionResult {
            session_id: 1,
            code: 0,
            exports: Some(vec![0xc0]),
            error: None,
        });
    }

    #[test]
    fn roundtrip_execution_result_with_error() {
        roundtrip(&RustMessage::ExecutionResult {
            session_id: 2,
            code: 1,
            exports: None,
            error: Some(ExecutionError {
                error_type: "TypeError".into(),
                message: "Cannot read properties of undefined".into(),
                stack: "TypeError: Cannot read properties of undefined\n    at main.js:1:5".into(),
                code: None,
            }),
        });
    }

    #[test]
    fn roundtrip_execution_result_with_error_code() {
        roundtrip(&RustMessage::ExecutionResult {
            session_id: 3,
            code: 1,
            exports: None,
            error: Some(ExecutionError {
                error_type: "Error".into(),
                message: "Cannot find module './missing'".into(),
                stack: "Error: Cannot find module './missing'\n    at resolve (node:internal)".into(),
                code: Some("ERR_MODULE_NOT_FOUND".into()),
            }),
        });
    }

    #[test]
    fn roundtrip_log_stdout() {
        roundtrip(&RustMessage::Log {
            session_id: 1,
            channel: LogChannel::Stdout,
            message: "hello world\n".into(),
        });
    }

    #[test]
    fn roundtrip_log_stderr() {
        roundtrip(&RustMessage::Log {
            session_id: 1,
            channel: LogChannel::Stderr,
            message: "warning: deprecated API\n".into(),
        });
    }

    #[test]
    fn roundtrip_stream_callback() {
        roundtrip(&RustMessage::StreamCallback {
            session_id: 1,
            callback_type: "child_dispatch".into(),
            payload: vec![0x92, 0x01, 0xa3, 0x66, 0x6f, 0x6f],
        });
    }

    // -- ExecutionError standalone --

    #[test]
    fn roundtrip_execution_error_structured() {
        let err = ExecutionError {
            error_type: "SyntaxError".into(),
            message: "Unexpected token '}'".into(),
            stack: "SyntaxError: Unexpected token '}'\n    at compile (<anonymous>)".into(),
            code: None,
        };
        roundtrip(&err);
    }

    #[test]
    fn execution_error_code_field_absent_when_none() {
        let err = ExecutionError {
            error_type: "Error".into(),
            message: "test".into(),
            stack: "".into(),
            code: None,
        };
        let bytes = rmp_serde::to_vec_named(&err).expect("serialize");
        // skip_serializing_if omits "code" — map should have 3 keys not 4
        let map: HashMap<String, String> =
            rmp_serde::from_slice(&bytes).expect("deserialize as map");
        assert_eq!(map.len(), 3);
        assert!(!map.contains_key("code"));
        // Round-trip preserves None
        let decoded: ExecutionError = rmp_serde::from_slice(&bytes).expect("deserialize");
        assert_eq!(decoded.code, None);
    }

    // -- Edge cases --

    #[test]
    fn roundtrip_empty_bytes_fields() {
        roundtrip(&HostMessage::BridgeResponse {
            call_id: 0,
            result: Some(vec![]),
            error: None,
        });
        roundtrip(&HostMessage::StreamEvent {
            session_id: 0,
            event_type: "".into(),
            payload: vec![],
        });
        roundtrip(&RustMessage::BridgeCall {
            call_id: 0,
            session_id: 0,
            method: "".into(),
            args: vec![],
        });
    }

    #[test]
    fn roundtrip_large_env_map() {
        let mut env = HashMap::new();
        for i in 0..100 {
            env.insert(format!("VAR_{}", i), format!("value_{}", i));
        }
        roundtrip(&HostMessage::InjectGlobals {
            session_id: 10,
            process_config: ProcessConfig {
                cwd: "/".into(),
                env,
                timing_mitigation: "none".into(),
                frozen_time_ms: None,
            },
            os_config: OsConfig {
                homedir: "/root".into(),
                tmpdir: "/tmp".into(),
                platform: "linux".into(),
                arch: "x64".into(),
            },
        });
    }
}
