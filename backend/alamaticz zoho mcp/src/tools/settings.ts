import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createZohoClient, handleApiError } from "../services/zoho-client.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerSettingsTools(server: McpServer): void {
  // ── GET FIELDS METADATA ────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_fields",
    {
      title: "Get Fields Metadata",
      description: `Retrieve field metadata (definitions, data types, picklist values, permissions) for a CRM module.

Use this to discover available field API names before querying or writing records.

Args:
  - module (string): CRM module name, e.g. Leads, Contacts, Deals
  - type (string): "unused" returns fields not added to any layout, "all" returns all fields
  - field_id (string): Optional — retrieve metadata for a single specific field

Returns: JSON array of field objects with api_name, data_type, label, picklist values, etc.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name, e.g. Leads, Contacts, Deals"),
        type: z.enum(["unused", "all"]).optional().describe("Filter type: unused fields only, or all fields"),
        field_id: z.string().optional().describe("Specific field ID to retrieve single field metadata"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module, type, field_id }) => {
      try {
        const client = await createZohoClient();
        const endpoint = field_id ? `/settings/fields/${field_id}` : `/settings/fields`;
        const params: Record<string, unknown> = { module };
        if (type) params.type = type;
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

  // ── GET MODULE METADATA ────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_module",
    {
      title: "Get Module Metadata",
      description: `Retrieve metadata for a specific Zoho CRM module including its API name, permissions, fields, and related lists.

Args:
  - module (string): CRM module API name, e.g. Leads, Contacts, Deals, or a custom module name

Returns: JSON with module metadata including api_name, creatable, editable, deletable, visibility, profiles, and field summary.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("Module API name, e.g. Leads, Contacts, Deals"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module }) => {
      try {
        const client = await createZohoClient();
        const { data } = await client.get(`/settings/modules/${module}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET ALL MODULES ────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_list_modules",
    {
      title: "List All Modules",
      description: `Retrieve metadata for all available Zoho CRM modules in the organization.

Use this to discover which modules exist and their API names before working with records.

Returns: JSON array of all modules with their api_name, display_label, permissions, and other metadata.`,
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const client = await createZohoClient();
        const { data } = await client.get(`/settings/modules`);
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

  // ── GET ROLES ──────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_roles",
    {
      title: "Get Roles",
      description: `Retrieve CRM roles (e.g. Manager, Sales Rep, Supervisor) and their hierarchy.

Args:
  - role_id (string): Optional — fetch a single role by its ID

Returns: JSON array of role objects with name, display_label, share_with_peers, and reporting_to.`,
      inputSchema: z.object({
        role_id: z.string().optional().describe("Optional: fetch a specific role by ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ role_id }) => {
      try {
        const client = await createZohoClient();
        const endpoint = role_id ? `/settings/roles/${role_id}` : `/settings/roles`;
        const { data } = await client.get(endpoint);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data as Record<string, unknown>,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET PIPELINES ──────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_pipelines",
    {
      title: "Get Pipelines",
      description: `Retrieve pipeline definitions (stages) for the Deals module within a specific layout.

You must provide a layout_id. Get layout IDs from zohocrm_get_module with module="Deals".

Args:
  - layout_id (string): ID of the Deals module layout
  - pipeline_id (string): Optional — fetch a specific pipeline by its ID

Returns: JSON with pipeline array, each containing display_value, default status, id, and stages (maps array).`,
      inputSchema: z.object({
        layout_id: z.string().min(1).describe("Deals layout ID (required)"),
        pipeline_id: z.string().optional().describe("Optional: fetch a specific pipeline by ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ layout_id, pipeline_id }) => {
      try {
        const client = await createZohoClient();
        const endpoint = pipeline_id ? `/settings/pipeline/${pipeline_id}` : `/settings/pipeline`;
        const { data } = await client.get(endpoint, { params: { layout_id } });
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
