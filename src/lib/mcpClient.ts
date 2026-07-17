import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

// ===========================================================================
// Loop as an MCP CLIENT.
//
// This is the wiring that makes the standalone job-fetcher server (over in
// mcp-servers/job-fetcher/) actually useful to Loop. Loop no longer owns the
// fetch code — it LAUNCHES the server as a subprocess and talks to it over
// stdio, exactly like the test-client did. The capability now lives in one
// reusable place; Loop just consumes it.
// ===========================================================================

// The server's folder and its TypeScript entry point. We run the .ts source
// directly with tsx (the server's own dev runner), so there's NO build step —
// edit mcp-servers/job-fetcher/src/index.ts and the next score picks it up.
const SERVER_DIR = path.join(process.cwd(), "mcp-servers", "job-fetcher");

// The tsx binary that ships in the server's node_modules. Overridable via env
// in case the server lives elsewhere.
const TSX_BIN =
  process.env.JOB_FETCHER_TSX_BIN ??
  path.join(SERVER_DIR, "node_modules", ".bin", "tsx");

// The TypeScript entry, resolved relative to the server dir (its cwd below).
const SERVER_ENTRY = process.env.JOB_FETCHER_MCP_ENTRY ?? "src/index.ts";

/**
 * Spawn the job-fetcher MCP server and return a connected client.
 *
 * StdioClientTransport launches the server as a child process — here, tsx
 * running the .ts source directly — and wires up its stdin/stdout. connect()
 * performs the MCP initialize handshake. The caller MUST close() the client
 * when done — that also tears the subprocess down.
 */
export async function connectJobFetcher(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: TSX_BIN,
    args: [SERVER_ENTRY],
    cwd: SERVER_DIR, // so tsx resolves src/index.ts and the server's deps
  });

  const client = new Client({ name: "loop", version: "0.1.0" });
  await client.connect(transport);
  return client;
}
