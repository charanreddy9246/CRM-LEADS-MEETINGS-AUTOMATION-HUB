import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { createZohoClient, handleApiError } from "../services/zoho-client.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type {
  ZohoListResponse,
  ZohoActionResponse,
  ZohoConvertLeadResponse,
} from "../types.js";

export function registerRecordTools(server: McpServer): void {
  // ── GET RECORDS ────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_records",
    {
      title: "Get Records",
      description: `Retrieve a list of records from any Zoho CRM module.`,
      inputSchema: z.object({
        module: z.string().min(1),
        fields: z.string().optional(),
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(200).default(200),
        page_token: z.string().optional(),
        sort_by: z.enum(["id", "Created_Time", "Modified_Time"]).optional(),
        sort_order: z.enum(["asc", "desc"]).default("desc"),
        ids: z.string().optional(),
      }).strict(),
    },
    async ({ module, fields, page, per_page, page_token, sort_by, sort_order, ids }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = { page, per_page, sort_order };
        if (fields) params.fields = fields;
        if (page_token) params.page_token = page_token;
        if (sort_by) params.sort_by = sort_by;
        if (ids) params.ids = ids;

        const { data } = await client.get<ZohoListResponse>(`/${module}`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET SINGLE RECORD ──────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_record",
    {
      title: "Get Record",
      description: `Retrieve a single record by its ID from any Zoho CRM module.`,
      inputSchema: z.object({
        module: z.string().min(1),
        record_id: z.string().min(1),
        fields: z.string().optional(),
      }).strict(),
    },
    async ({ module, record_id, fields }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = {};
        if (fields) params.fields = fields;
        const { data } = await client.get<ZohoListResponse>(`/${module}/${record_id}`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── CREATE RECORDS ─────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_create_records",
    {
      title: "Create Records",
      description: `Create one or more records in a Zoho CRM module.`,
      inputSchema: z.object({
        module: z.string().min(1),
        data: z.array(z.record(z.unknown())).min(1).max(100),
        trigger: z.array(z.enum(["workflow", "approval", "blueprint"])).optional(),
      }).strict(),
    },
    async ({ module, data, trigger }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (trigger) body.trigger = trigger;
        const response = await client.post<ZohoActionResponse>(`/${module}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── UPDATE RECORDS ─────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_update_records",
    {
      title: "Update Records",
      description: `Update one or more existing records.`,
      inputSchema: z.object({
        module: z.string().min(1),
        data: z.array(z.record(z.unknown())).min(1).max(100),
        trigger: z.array(z.enum(["workflow", "approval", "blueprint"])).optional(),
      }).strict(),
    },
    async ({ module, data, trigger }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (trigger) body.trigger = trigger;
        const response = await client.put<ZohoActionResponse>(`/${module}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── UPSERT RECORDS ─────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_upsert_records",
    {
      title: "Upsert Records",
      description: `Insert or update records based on duplicate check fields.`,
      inputSchema: z.object({
        module: z.string().min(1),
        data: z.array(z.record(z.unknown())).min(1).max(100),
        duplicate_check_fields: z.array(z.string()).optional(),
      }).strict(),
    },
    async ({ module, data, duplicate_check_fields }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (duplicate_check_fields) body.duplicate_check_fields = duplicate_check_fields;
        const response = await client.post<ZohoActionResponse>(`/${module}/upsert`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── DELETE RECORDS ─────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_delete_records",
    {
      title: "Delete Records",
      description: `Delete one or more records.`,
      inputSchema: z.object({
        module: z.string().min(1),
        ids: z.array(z.string()).min(1).max(100),
        wf_trigger: z.boolean().default(true),
      }).strict(),
    },
    async ({ module, ids, wf_trigger }) => {
      try {
        const client = await createZohoClient();
        const response = await client.delete<ZohoActionResponse>(`/${module}`, {
          params: { ids: ids.join(","), wf_trigger },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── SEARCH RECORDS ─────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_search_records",
    {
      title: "Search Records",
      description: `Search for records in a Zoho CRM module.`,
      inputSchema: z.object({
        module: z.string().min(1),
        criteria: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        word: z.string().optional(),
        fields: z.string().optional(),
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(200).default(200),
      }).strict(),
    },
    async ({ module, criteria, email, phone, word, fields, page, per_page }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = { page, per_page };
        if (criteria) params.criteria = criteria;
        if (email) params.email = email;
        if (phone) params.phone = phone;
        if (word) params.word = word;
        if (fields) params.fields = fields;

        const { data } = await client.get<ZohoListResponse>(`/${module}/search`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET DELETED RECORDS ────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_deleted_records",
    {
      title: "Get Deleted Records",
      description: `Retrieve deleted records.`,
      inputSchema: z.object({
        module: z.string().min(1),
        type: z.enum(["all", "recycle", "permanent"]).default("all"),
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(200).default(200),
      }).strict(),
    },
    async ({ module, type, page, per_page }) => {
      try {
        const client = await createZohoClient();
        const { data } = await client.get(`/${module}/deleted`, { params: { type, page, per_page } });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── GET RELATED RECORDS ────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_get_related_records",
    {
      title: "Get Related Records",
      description: `Retrieve related records.`,
      inputSchema: z.object({
        module: z.string().min(1),
        record_id: z.string().min(1),
        related_list: z.string().min(1),
        fields: z.string().optional(),
        page: z.number().int().min(1).default(1),
        per_page: z.number().int().min(1).max(200).default(200),
      }).strict(),
    },
    async ({ module, record_id, related_list, fields, page, per_page }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = { page, per_page };
        if (fields) params.fields = fields;
        const { data } = await client.get(`/${module}/${record_id}/${related_list}`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── CONVERT LEAD ───────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_convert_lead",
    {
      title: "Convert Lead",
      description: `Convert a Lead into a Contact and/or Account.`,
      inputSchema: z.object({
        lead_id: z.string().min(1),
        overwrite: z.boolean().optional(),
        notify_lead_owner: z.boolean().default(false),
        notify_new_entity_owner: z.boolean().default(false),
        Accounts: z.record(z.unknown()).optional(),
        Contacts: z.record(z.unknown()).optional(),
        Deals: z.record(z.unknown()).optional(),
        assign_to: z.record(z.unknown()).optional(),
      }).strict(),
    },
    async ({ lead_id, overwrite, notify_lead_owner, notify_new_entity_owner, Accounts, Contacts, Deals, assign_to }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = {
          data: [{
            overwrite,
            notify_lead_owner,
            notify_new_entity_owner,
            ...(Accounts ? { Accounts } : {}),
            ...(Contacts ? { Contacts } : {}),
            ...(Deals ? { Deals } : {}),
            ...(assign_to ? { assign_to } : {}),
          }],
        };
        const response = await client.post<ZohoConvertLeadResponse>(`/Leads/${lead_id}/actions/convert`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── ADD TAGS ───────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_add_tags",
    {
      title: "Add Tags to Records",
      description: `Add tags to one or more records.`,
      inputSchema: z.object({
        module: z.string().min(1),
        record_ids: z.array(z.string()).min(1).max(500),
        tags: z.array(z.object({ name: z.string() })).min(1),
        over_write: z.boolean().default(false),
      }).strict(),
    },
    async ({ module, record_ids, tags, over_write }) => {
      try {
        const client = await createZohoClient();
        const response = await client.post(`/${module}/actions/add_tags`, {
          tags,
          ids: record_ids,
          over_write,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── UPLOAD ATTACHMENT ──────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_attach_link",
    {
      title: "Attach a Link to a Record",
      description: `Attach a URL link as an attachment.`,
      inputSchema: z.object({
        module: z.string().min(1),
        record_id: z.string().min(1),
        attachment_url: z.string().url(),
        title: z.string().optional(),
      }).strict(),
    },
    async ({ module, record_id, attachment_url, title }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, string> = { attachmentUrl: attachment_url };
        if (title) params.title = title;
        const response = await client.post(`/${module}/${record_id}/Attachments`, null, { params });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
  
  // ── UPLOAD FILE ────────────────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_upload_file",
    {
      title: "Upload File to a Record",
      description: `Upload an actual file as an attachment.`,
      inputSchema: z.object({
        module: z.string().min(1),
        record_id: z.string().min(1),
        file_path: z.string().min(1),
      }).strict(),
    },
    async ({ module, record_id, file_path }) => {
      try {
        if (!fs.existsSync(file_path)) {
          return { content: [{ type: "text", text: `Error: File not found at ${file_path}` }] };
        }

        const client = await createZohoClient();
        const fileContent = fs.readFileSync(file_path);
        const fileName = path.basename(file_path);
        
        // In Node 24, use File for correct boundary attachment name
        const fileObj = new File([fileContent], fileName);
        const formData = new FormData();
        formData.append("file", fileObj);

        const response = await client.post(`/${module}/${record_id}/Attachments`, formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });
        
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
