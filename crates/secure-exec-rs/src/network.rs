use std::collections::HashMap;

use crate::{BoxFuture, Error, Result};

/// Options for a `fetch` call.
#[derive(Clone, Debug)]
pub struct FetchOptions {
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
}

/// Response from a `fetch` call.
#[derive(Clone, Debug)]
pub struct FetchResponse {
    pub ok: bool,
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
    pub redirected: bool,
}

/// Result of a DNS lookup.
#[derive(Clone, Debug)]
pub enum DnsResult {
    Success { address: String, family: u8 },
    Error { error: String, code: String },
}

/// Options for a raw HTTP request.
#[derive(Clone, Debug)]
pub struct HttpRequestOptions {
    pub method: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub reject_unauthorized: Option<bool>,
}

/// Response from a raw HTTP request.
#[derive(Clone, Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
    pub trailers: Option<HashMap<String, String>>,
}

/// Network adapter trait mirroring TypeScript `NetworkAdapter`.
///
/// Provides fetch, DNS lookup, and raw HTTP request capabilities
/// to sandboxed code through the bridge.
pub trait NetworkAdapter: Send + Sync {
    fn fetch<'a>(
        &'a self,
        url: &'a str,
        options: FetchOptions,
    ) -> BoxFuture<'a, Result<FetchResponse>>;

    fn dns_lookup<'a>(
        &'a self,
        hostname: &'a str,
    ) -> BoxFuture<'a, Result<DnsResult>>;

    fn http_request<'a>(
        &'a self,
        url: &'a str,
        options: HttpRequestOptions,
    ) -> BoxFuture<'a, Result<HttpResponse>>;
}

/// Network adapter that denies all operations with ENOSYS errors.
pub struct DenyAllNetwork;

impl NetworkAdapter for DenyAllNetwork {
    fn fetch<'a>(
        &'a self,
        _url: &'a str,
        _options: FetchOptions,
    ) -> BoxFuture<'a, Result<FetchResponse>> {
        Box::pin(async { Err(Error::NotSupported("network fetch not available".into())) })
    }

    fn dns_lookup<'a>(
        &'a self,
        _hostname: &'a str,
    ) -> BoxFuture<'a, Result<DnsResult>> {
        Box::pin(async { Err(Error::NotSupported("DNS lookup not available".into())) })
    }

    fn http_request<'a>(
        &'a self,
        _url: &'a str,
        _options: HttpRequestOptions,
    ) -> BoxFuture<'a, Result<HttpResponse>> {
        Box::pin(async { Err(Error::NotSupported("HTTP request not available".into())) })
    }
}
