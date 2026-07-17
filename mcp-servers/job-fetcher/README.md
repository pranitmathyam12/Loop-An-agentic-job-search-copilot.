# job-fetcher MCP server

A **standalone** [Model Context Protocol](https://modelcontextprotocol.io) server
that exposes a single tool:

- **`fetch_job_posting`** — takes a `url`, fetches the page, strips the HTML down
  to clean readable text, and returns it (capped at 20k chars).

This is the `fetchJobPosting` capability extracted out of Loop's
`src/lib/agentScore.ts` so it can be reused by any MCP client (Loop, Claude
Desktop, the MCP Inspector, a test script), not welded to one app.

It knows nothing about Claude, scoring, or Loop. Given a URL, it returns text.

## File structure

```
mcp-servers/job-fetcher/
├── package.json        # its own npm package + its own node_modules
├── tsconfig.json       # NodeNext / ESM
├── src/
│   ├── index.ts        # the server: the fetch logic + one registered tool
│   └── test-client.ts  # a throwaway MCP client to test the server in isolation
└── dist/               # compiled output (after `npm run build`)
```

## Run it

```bash
cd mcp-servers/job-fetcher
npm install

# Dev (no build step, via tsx):
npm run dev
# It will print "[job-fetcher] MCP server running on stdio" and then appear to
# hang. That's correct — it's a stdio server waiting for a client to speak
# JSON-RPC on stdin. Ctrl-C to stop. You don't normally run it this way; a
# client launches it as a subprocess.
```

## Test it in isolation (no Loop, no wiring)

### Option A — the included test client (programmatic)

```bash
npm run test:client -- https://example.com
# or any real job posting URL
```

This launches the server as a subprocess, does the MCP handshake, lists the
advertised tools (printing the JSON Schema the SDK generated), then actually
calls `fetch_job_posting` and prints the result.

### Option B — the official MCP Inspector (visual UI)

```bash
npm run inspect
# opens a browser UI; connect, open the Tools tab, run fetch_job_posting
```

## Build / run compiled

```bash
npm run build     # -> dist/
npm start         # node dist/index.js (same stdio server)
```

## What the MCP SDK does for you

Compared to the hand-rolled tool loop in `src/lib/agentScore.ts`, the SDK
handles:

- **The JSON-RPC 2.0 wire protocol** over stdio (framing, request/response ids,
  errors) — you never parse a message by hand.
- **The `initialize` handshake** and capability negotiation with the client.
- **Tool discovery** (`tools/list`): you register a tool; the SDK advertises it.
- **Input schema generation + validation**: you pass a Zod shape
  (`{ url: z.string() }`); the SDK turns it into JSON Schema (the exact
  `input_schema` object we wrote out by hand in `agentScore.ts`) and validates
  every incoming call before your handler runs.
- **Response serialization**: your handler returns content blocks; the SDK
  wraps them in a protocol-correct `tools/call` response.

Your job shrinks to: implement the capability, `registerTool`, `connect`.
