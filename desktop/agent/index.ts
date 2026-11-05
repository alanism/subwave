// Packaged as a standalone CJS program and run by Electron's Node runtime.
// stdout is exclusively JSON or the SDK's MCP protocol; no GUI is created.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { listTools } from '../src/agent-tools.cjs';
import { call, connection } from '../src/agent-client.cjs';
import { version } from '../package.json';

async function main() {
  const [command = '--help', name, input] = process.argv.slice(2);
  if (command === '--mcp') {
    const server = new Server({ name: 'subwave-desktop', version }, { capabilities: { tools: {} },
      instructions: 'Control the open local Subwave player. Search first and use exact IDs. Download jobs are asynchronous: poll before adding/playing. Preserve playlist membership unless asked to change it. Music, local filesystem and playback actions affect the user’s computer.' });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }));
    server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        const result = await call(request.params.name, request.params.arguments || {});
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }; }
    });
    await server.connect(new StdioServerTransport());
  } else if (command === 'tools') console.log(JSON.stringify({ tools: listTools() }));
  else if (command === 'info') {
    const value = await connection(); console.log(JSON.stringify({ browserUrl: `${value.origin}/agent`, transport: 'stdio', command: 'subwave-agent --mcp' }));
  } else if (command === 'call' && name) console.log(JSON.stringify(await call(name, input ? JSON.parse(input) : {})));
  else {
    console.error('Usage: subwave-agent tools | info | call TOOL \'JSON\' | --mcp');
    if (command !== '--help') process.exitCode = 1;
  }
}
void main().catch(error => { console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
