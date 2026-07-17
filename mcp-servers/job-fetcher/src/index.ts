#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { convert } from "html-to-text";
import { z } from "zod";

// ===========================================================================
// A STANDALONE MCP server. One process, one job: expose the fetch_job_posting
// tool over the Model Context Protocol so ANY MCP client (Loop, Claude
// Desktop, the MCP Inspector, a test script) can call it.
//
// Compare this to src/lib/agentScore.ts in the Loop app. There, the tool was
// hard-wired INTO the agent loop: the tool description, the fetch code, and the
// dispatch-by-name were all tangled together with the Anthropic API calls. Here
// the tool stands on its own. It knows nothing about Claude, about scoring, or
// about Loop. It just answers the question "given a URL, what's the text?".
// ===========================================================================

// --- The tool's ACTUAL implementation --------------------------------------
// Byte-for-byte the same behavior as fetchJobPosting() in agentScore.ts:
// fetch the page, strip HTML to readable text, cap the length. This is the
// part that was worth extracting — it's the real capability.
async function fetchJobPosting(url: string): Promise<string> {
  const res = await fetch(url, {
    // A browser-ish UA — some job boards reject the default fetch UA.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LoopBot/1.0)" },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // Strip tags/scripts/styles and collapse into clean text. We drop links and
  // images so the model isn't distracted by nav chrome and asset URLs.
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();

  // Guard against gigantic pages blowing up the context window.
  const MAX_CHARS = 20_000;
  return text.length > MAX_CHARS
    ? text.slice(0, MAX_CHARS) + "\n…[truncated]"
    : text;
}

// --- The MCP server ---------------------------------------------------------
// McpServer is the SDK's high-level server object. Creating it just declares
// the server's identity (name + version) that gets sent to clients during the
// initialize handshake. Nothing is listening yet.
const server = new McpServer({
  name: "job-fetcher",
  version: "1.0.0",
});

// registerTool wires up ONE tool. Note what we DON'T write by hand:
//   - We describe the input with a plain object of Zod schemas. The SDK turns
//     that into the JSON Schema that agentScore.ts wrote out by hand
//     (input_schema: { type: "object", properties: { url: ... }, ... }).
//   - The SDK validates every incoming call against that schema BEFORE our
//     handler runs, so `url` is guaranteed to be a string here.
//   - Our handler just returns content blocks; the SDK serializes them into a
//     protocol-correct JSON-RPC response.
server.registerTool(
  "fetch_job_posting",
  {
    title: "Fetch job posting",
    description:
      "Fetches the text content of a job posting from a given URL. " +
      "Use this to read the actual job description before scoring it.",
    inputSchema: {
      url: z.string().describe("The URL of the job posting to fetch."),
    },
  },
  async ({ url }) => {
    try {
      const text = await fetchJobPosting(url);
      return {
        content: [{ type: "text", text }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown fetch error";
      // isError lets the CLIENT (and the model behind it) see the failure and
      // recover, exactly like the is_error tool_result in agentScore.ts.
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  },
);

// --- Start the process ------------------------------------------------------
// stdio transport = the server speaks JSON-RPC over stdin/stdout. That's why
// this process looks like it "hangs" if you run it directly: it's blocking on
// stdin, waiting for a client to send the initialize handshake. A client
// (Loop, the Inspector, our test-client) launches this file as a subprocess
// and talks to it through those pipes.
//
// IMPORTANT: never console.log to stdout here — stdout is the protocol channel.
// Diagnostics must go to stderr (console.error), which is what we do below.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[job-fetcher] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[job-fetcher] fatal:", err);
  process.exit(1);
});
