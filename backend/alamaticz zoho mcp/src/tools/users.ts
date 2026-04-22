import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createZohoClient, handleApiError } from "../services/zoho-client.js";
import { CHARACTER_LIMIT, USER_TYPES } from "../constants.js";

export function registerUserTools(server: McpServer): void {
  // ── GET USERS ──────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_users",
    {
      title: "Get Users",
      description: `Retrieve CRM users in the organization.

Args:
  - user_id (string): Optional — fetch a single user by their ID
  - type (string): Filter users by status — AllUsers, ActiveUsers, DeactiveUsers, ConfirmedUsers,
    NotConfirmedUsers, DeletedUsers, ActiveConfirmedUsers, AdminUsers, ActiveConfirmedAdmins, CurrentUser
  - page (number): Page number (default 1)
  - per_page (number): Users per page (max 200)
  - ids (string): Comma-separated user IDs to fetch specific users (max 100)

Returns: JSON with users array containing id, email, name, role, profile, status, and locale info.`,
      inputSchema: z.object({
        user_id: z.string().optional().describe("Optional: fetch a single user by ID"),
        type: z.enum(USER_TYPES).optional().describe("Filter: AllUsers, ActiveUsers, CurrentUser, etc."),
        page: z.number().int().min(1).default(1).describe("Page number"),
        per_page: z.number().int().min(1).max(200).default(200).describe("Users per page"),
        ids: z.string().optional().describe("Comma-separated user IDs (max 100)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ user_id, type, page, per_page, ids }) => {
      try {
        const client = await createZohoClient();
        const endpoint = user_id ? `/users/${user_id}` : `/users`;
        const params: Record<string, unknown> = { page, per_page };
        if (type) params.type = type;
        if (ids) params.ids = ids;
        const { data } = await client.get(endpoint, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET ORG ────────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_org",
    {
      title: "Get Organization Info",
      description: `Retrieve organization-level details for the Zoho CRM account.

Returns company name, contact info, timezone, currency, license details, environment type
(production/sandbox/developer), HIPAA compliance status, and more.

Returns: JSON org object with id, company_name, email, phone, country, time_zone, currency, license info.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const client = await createZohoClient();
        const { data } = await client.get(`/org`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
