#!/usr/bin/env node
/**
 * Zoho CRM MCP Server
 *
 * Provides tools to interact with Zoho CRM v7 API:
 * - Record CRUD (get, create, update, upsert, delete, search)
 * - Related records, lead conversion, tags, attachments
 * - Settings metadata (fields, modules, roles, pipelines)
 * - Users and organization info
 *
 * Authentication: OAuth 2.0 with refresh token
 * Required environment variables:
 *   ZOHO_CLIENT_ID      - OAuth client ID
 *   ZOHO_CLIENT_SECRET  - OAuth client secret
 *   ZOHO_REFRESH_TOKEN  - Long-lived refresh token
 *   ZOHO_API_DOMAIN     - Optional, default: https://www.zohoapis.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerRecordTools } from "./tools/records.js";
import { registerSettingsTools } from "./tools/settings.js";
import { registerUserTools } from "./tools/users.js";

const server = new McpServer({
  name: "zohocrm-mcp-server",
  version: "1.0.0",
});

registerRecordTools(server);
registerSettingsTools(server);
registerUserTools(server);

async function main(): Promise<void> {
  const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Zoho CRM MCP server running via stdio");
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});
