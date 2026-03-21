/**
 * Shared mock LLM server for CLI tool E2E tests.
 *
 * Serves both Anthropic Messages API (SSE) and OpenAI Chat Completions API
 * (SSE) with configurable canned responses. Supports multi-turn tool-use
 * conversations via a sequential response queue.
 */

import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TextResponse {
  type: 'text';
  text: string;
}

export interface ToolUseResponse {
  type: 'tool_use';
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

export type MockLlmResponse = TextResponse | ToolUseResponse;

// ---------------------------------------------------------------------------
// Server handle
// ---------------------------------------------------------------------------

export interface MockLlmServerHandle {
  port: number;
  close: () => Promise<void>;
  /** Number of API requests received so far. */
  requestCount: () => number;
  /** Replace the response queue and reset the request counter. */
  reset: (newQueue: MockLlmResponse[]) => void;
  /** Return all captured request bodies (parsed JSON). */
  getReceivedBodies: () => unknown[];
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Create and start a mock LLM HTTP server on a random localhost port.
 *
 * Each POST to /messages (Anthropic) or /chat/completions (OpenAI) pops the
 * next response from the queue. Once exhausted, a default text response is
 * returned. All other routes return 404.
 */
export async function createMockLlmServer(
  responseQueue: MockLlmResponse[],
): Promise<MockLlmServerHandle> {
  let queue = responseQueue;
  let requestIndex = 0;
  let receivedBodies: unknown[] = [];

  const server = http.createServer((req, res) => {
    // Drain request body before responding
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      // Capture request body for inspection
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        receivedBodies.push(body);
      } catch {
        // Non-JSON request; skip capture
      }
      // Anthropic Messages API
      if (req.method === 'POST' && req.url?.includes('/messages')) {
        const response =
          queue[requestIndex++] ??
          ({ type: 'text', text: '[mock exhausted]' } as const);
        serveAnthropicSse(res, response);
        return;
      }

      // OpenAI Chat Completions API
      if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
        const response =
          queue[requestIndex++] ??
          ({ type: 'text', text: '[mock exhausted]' } as const);
        serveOpenAiSse(res, response);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = (server.address() as AddressInfo).port;

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    requestCount: () => requestIndex,
    reset: (newQueue: MockLlmResponse[]) => {
      queue = newQueue;
      requestIndex = 0;
      receivedBodies = [];
    },
    getReceivedBodies: () => receivedBodies,
  };
}

// ---------------------------------------------------------------------------
// Anthropic Messages SSE
// ---------------------------------------------------------------------------

function serveAnthropicSse(
  res: http.ServerResponse,
  response: MockLlmResponse,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const msgId = `msg_mock_${Date.now()}`;
  const model = 'claude-3-5-sonnet-20241022';

  // message_start
  writeEvent(res, 'message_start', {
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  });

  if (response.type === 'text') {
    writeEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    });

    writeEvent(res, 'content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: response.text },
    });

    writeEvent(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    });

    writeEvent(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 15 },
    });
  } else {
    const toolId = response.id ?? `toolu_mock_${Date.now()}`;

    writeEvent(res, 'content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: toolId,
        name: response.name,
        input: {},
      },
    });

    writeEvent(res, 'content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(response.input),
      },
    });

    writeEvent(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: 0,
    });

    writeEvent(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 30 },
    });
  }

  // message_stop
  writeEvent(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions SSE
// ---------------------------------------------------------------------------

function serveOpenAiSse(
  res: http.ServerResponse,
  response: MockLlmResponse,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const id = 'chatcmpl-mock';

  if (response.type === 'text') {
    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: response.text },
            finish_reason: null,
          },
        ],
      })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`,
    );
  } else {
    const toolCallId = response.id ?? `call_mock_${Date.now()}`;

    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [
                {
                  index: 0,
                  id: toolCallId,
                  type: 'function',
                  function: {
                    name: response.name,
                    arguments: JSON.stringify(response.input),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      })}\n\n`,
    );
    res.write(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      })}\n\n`,
    );
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeEvent(
  res: http.ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
