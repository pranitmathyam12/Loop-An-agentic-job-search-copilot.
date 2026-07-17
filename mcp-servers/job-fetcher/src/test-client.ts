import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ===========================================================================
// A throwaway MCP CLIENT that talks to our job-fetcher server IN ISOLATION.
// This is NOT Loop. It's the smallest possible thing that proves the server
// works: it launches the server as a subprocess, does the MCP handshake, asks
// what tools exist, then actually calls one and prints the result.
//
// Run it with:  npm run test:client -- <job-posting-url>
// ===========================================================================

const url = process.argv[2] ?? "https://example.com";

async function main() {
  // StdioClientTransport SPAWNS the server for us (command + args) and wires up
  // the stdin/stdout pipes. This is exactly what Loop or Claude Desktop will do
  // later — the only difference is who's launching it.
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"],
  });

  const client = new Client({ name: "job-fetcher-test-client", version: "1.0.0" });

  // connect() performs the MCP initialize handshake (capabilities exchange).
  await client.connect(transport);
  console.log("✓ connected + handshake complete\n");

  // 1. Discovery: ask the server what it can do. The SDK returns the JSON
  //    Schema it generated from our Zod inputSchema — proof we didn't write it.
  const { tools } = await client.listTools();
  console.log("Tools advertised by the server:");
  for (const t of tools) {
    console.log(`  • ${t.name} — ${t.description}`);
    console.log(`    inputSchema: ${JSON.stringify(t.inputSchema)}`);
  }
  console.log();

  // 2. Invocation: actually call the tool and print what comes back.
  console.log(`Calling fetch_job_posting with url=${url} ...\n`);
  const result = await client.callTool({
    name: "fetch_job_posting",
    arguments: { url },
  });

  const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
  for (const block of blocks) {
    if (block.type === "text") {
      const preview = (block.text ?? "").slice(0, 800);
      console.log("--- tool result (first 800 chars) ---");
      console.log(preview);
      console.log("--------------------------------------");
    }
  }
  if (result.isError) console.log("(the server reported this as an error result)");

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("test-client failed:", err);
  process.exit(1);
});
