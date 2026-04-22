import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
      description: `Retrieve a list of records from any Zoho CRM module.

Returns up to 200 records per page. Use page_token for fetching beyond 2000 records.

Args:
  - module (string): CRM module name, e.g. Leads, Contacts, Accounts, Deals
  - fields (string): Comma-separated field API names to return (max 50), e.g. "Last_Name,Email,Phone"
  - page (number): Page number, default 1
  - per_page (number): Records per page, max 200, default 200
  - page_token (string): Token from previous response info.next_page_token for deep pagination
  - sort_by (string): Sort field — id, Created_Time, or Modified_Time
  - sort_order (string): asc or desc (default desc)
  - ids (string): Comma-separated record IDs to fetch specific records

Returns: JSON with data array and info object containing pagination details.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name, e.g. Leads, Contacts, Accounts, Deals"),
        fields: z.string().optional().describe("Comma-separated field API names (max 50)"),
        page: z.number().int().min(1).default(1).describe("Page number"),
        per_page: z.number().int().min(1).max(200).default(200).describe("Records per page (max 200)"),
        page_token: z.string().optional().describe("Token for pagination beyond 2000 records"),
        sort_by: z.enum(["id", "Created_Time", "Modified_Time"]).optional().describe("Sort field"),
        sort_order: z.enum(["asc", "desc"]).default("desc").describe("Sort order"),
        ids: z.string().optional().describe("Comma-separated record IDs"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }],
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
      description: `Retrieve a single record by its ID from any Zoho CRM module.

Args:
  - module (string): CRM module name, e.g. Leads, Contacts
  - record_id (string): Unique ID of the record
  - fields (string): Comma-separated field API names to return

Returns: JSON with a data array containing one record object.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        record_id: z.string().min(1).describe("Unique record ID"),
        fields: z.string().optional().describe("Comma-separated field API names"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module, record_id, fields }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = {};
        if (fields) params.fields = fields;
        const { data } = await client.get<ZohoListResponse>(`/${module}/${record_id}`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text }],
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
      description: `Create one or more records in a Zoho CRM module (up to 100 per call).

Args:
  - module (string): CRM module name, e.g. Leads, Contacts, Deals
  - data (array): Array of record objects with field API names as keys
  - trigger (array): Optional triggers — workflow, approval, blueprint

Mandatory fields by module:
  - Leads/Contacts: Last_Name
  - Accounts: Account_Name
  - Deals: Deal_Name, Stage, Pipeline
  - Tasks: Subject
  - Calls: Subject, Call_Type, Call_Start_Time, Call_Duration

Returns: JSON with status (success/error) and IDs for each record.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        data: z.array(z.record(z.unknown())).min(1).max(100).describe("Array of record objects (max 100)"),
        trigger: z.array(z.enum(["workflow", "approval", "blueprint"])).optional().describe("Triggers to execute"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, data, trigger }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (trigger) body.trigger = trigger;
        const response = await client.post<ZohoActionResponse>(`/${module}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Update one or more existing records in a Zoho CRM module (up to 100 per call).

Each record in data must include the "id" field.

Args:
  - module (string): CRM module name, e.g. Leads, Contacts, Deals
  - data (array): Array of record objects, each must have "id" plus fields to update
  - trigger (array): Optional triggers — workflow, approval, blueprint

Returns: JSON with status (success/error) per record.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        data: z.array(z.record(z.unknown())).min(1).max(100).describe("Array of records with id and fields to update"),
        trigger: z.array(z.enum(["workflow", "approval", "blueprint"])).optional().describe("Triggers to execute"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, data, trigger }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (trigger) body.trigger = trigger;
        const response = await client.put<ZohoActionResponse>(`/${module}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Insert or update records based on duplicate check fields. If a matching record exists it is updated; otherwise a new record is created. Up to 100 records per call.

Args:
  - module (string): CRM module name
  - data (array): Array of record objects
  - duplicate_check_fields (array): Fields used to check for duplicates, e.g. ["Email"]

Returns: JSON with action (insert/update), status, and record IDs per entry.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        data: z.array(z.record(z.unknown())).min(1).max(100).describe("Array of record objects (max 100)"),
        duplicate_check_fields: z.array(z.string()).optional().describe("Fields to check for duplicates, e.g. [\"Email\"]"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, data, duplicate_check_fields }) => {
      try {
        const client = await createZohoClient();
        const body: Record<string, unknown> = { data };
        if (duplicate_check_fields) body.duplicate_check_fields = duplicate_check_fields;
        const response = await client.post<ZohoActionResponse>(`/${module}/upsert`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Delete one or more records from a Zoho CRM module (up to 100 per call).

Args:
  - module (string): CRM module name, e.g. Leads, Contacts
  - ids (array): Array of record ID strings to delete (max 100)
  - wf_trigger (boolean): Whether to trigger workflows on delete (default true)

Returns: JSON with status (success/error) per record ID.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        ids: z.array(z.string()).min(1).max(100).describe("Array of record IDs to delete (max 100)"),
        wf_trigger: z.boolean().default(true).describe("Trigger workflows on delete"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, ids, wf_trigger }) => {
      try {
        const client = await createZohoClient();
        const response = await client.delete<ZohoActionResponse>(`/${module}`, {
          params: { ids: ids.join(","), wf_trigger },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Search for records in a Zoho CRM module using criteria, email, phone, or word search.

Provide exactly ONE of: criteria, email, phone, or word.

Criteria format: ((Field_API_Name:operator:value)and(Field_API_Name:operator:value))
Operators: equals, starts_with, in, not_equal, greater_equal, greater_than, less_equal, less_than, between
Max 10 criteria.

Args:
  - module (string): CRM module name
  - criteria (string): Search criteria string, e.g. "((Last_Name:equals:Smith)and(Email:starts_with:john))"
  - email (string): Email address to search
  - phone (string): Phone number to search
  - word (string): Word to search across all fields
  - fields (string): Comma-separated fields to return
  - page (number): Page number
  - per_page (number): Results per page (max 200)

Returns: JSON with data array and info pagination object.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        criteria: z.string().optional().describe("Search criteria string"),
        email: z.string().email().optional().describe("Email address to search"),
        phone: z.string().optional().describe("Phone number to search"),
        word: z.string().optional().describe("Word to search across all fields"),
        fields: z.string().optional().describe("Comma-separated field API names to return"),
        page: z.number().int().min(1).default(1).describe("Page number"),
        per_page: z.number().int().min(1).max(200).default(200).describe("Results per page (max 200)"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }],
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
      description: `Retrieve deleted records from a Zoho CRM module's recycle bin or permanent deletion log.

Args:
  - module (string): CRM module name
  - type (string): all (default), recycle (in recycle bin), or permanent (permanently deleted)
  - page (number): Page number
  - per_page (number): Records per page (max 200)

Returns: JSON with deleted records including deleted_by, display_name, deleted_time, and type.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        type: z.enum(["all", "recycle", "permanent"]).default("all").describe("Deletion type filter"),
        page: z.number().int().min(1).default(1).describe("Page number"),
        per_page: z.number().int().min(1).max(200).default(200).describe("Records per page"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module, type, page, per_page }) => {
      try {
        const client = await createZohoClient();
        const { data } = await client.get(`/${module}/deleted`, { params: { type, page, per_page } });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
      description: `Retrieve records related to a specific record via a relationship (related list).

Example: Get all Contacts related to an Account, or all Notes on a Lead.

Args:
  - module (string): Parent module name, e.g. Accounts
  - record_id (string): ID of the parent record
  - related_list (string): API name of the related list, e.g. Contacts, Notes, Attachments, Activities
  - fields (string): Comma-separated field API names to return
  - page (number): Page number
  - per_page (number): Records per page (max 200)

Returns: JSON with related records and pagination info.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("Parent module name, e.g. Accounts"),
        record_id: z.string().min(1).describe("Parent record ID"),
        related_list: z.string().min(1).describe("Related list API name, e.g. Contacts, Notes, Attachments"),
        fields: z.string().optional().describe("Comma-separated field API names"),
        page: z.number().int().min(1).default(1).describe("Page number"),
        per_page: z.number().int().min(1).max(200).default(200).describe("Records per page"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ module, record_id, related_list, fields, page, per_page }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, unknown> = { page, per_page };
        if (fields) params.fields = fields;
        const { data } = await client.get(`/${module}/${record_id}/${related_list}`, { params });
        const text = JSON.stringify(data, null, 2);
        return {
          content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... [truncated]" : text }],
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
      description: `Convert a Lead into a Contact and/or Account, optionally creating a Deal.

Args:
  - lead_id (string): ID of the Lead record to convert
  - overwrite (boolean): Replace account name when associating with existing account
  - notify_lead_owner (boolean): Send email to lead owner
  - notify_new_entity_owner (boolean): Send email to new record owner
  - Accounts (object): Existing account to associate, e.g. {"id": "123"}
  - Contacts (object): Existing contact to associate, e.g. {"id": "456"}
  - Deals (object): Deal to create, e.g. {"Deal_Name": "...", "Closing_Date": "YYYY-MM-DD", "Pipeline": "...", "Stage": "..."}
  - assign_to (object): Assign new records to user, e.g. {"id": "user_id"}

Returns: JSON with created/associated Contact, Account, and Deal IDs.`,
      inputSchema: z.object({
        lead_id: z.string().min(1).describe("Lead record ID to convert"),
        overwrite: z.boolean().optional().describe("Replace account name on existing account"),
        notify_lead_owner: z.boolean().default(false).describe("Notify lead owner"),
        notify_new_entity_owner: z.boolean().default(false).describe("Notify new record owner"),
        Accounts: z.record(z.unknown()).optional().describe("Existing account to link, e.g. {\"id\": \"123\"}"),
        Contacts: z.record(z.unknown()).optional().describe("Existing contact to link, e.g. {\"id\": \"456\"}"),
        Deals: z.record(z.unknown()).optional().describe("Deal to create with fields: Deal_Name, Closing_Date, Pipeline, Stage"),
        assign_to: z.record(z.unknown()).optional().describe("User to assign new records to, e.g. {\"id\": \"user_id\"}"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Add tags to one or more records in a Zoho CRM module (up to 500 record IDs).

Args:
  - module (string): CRM module name
  - record_ids (array): Array of record IDs (max 500) to tag
  - tags (array): Array of tag objects with "name" field, e.g. [{"name": "VIP"}, {"name": "Prospect"}]
  - over_write (boolean): Replace existing tags instead of appending (default false)

Returns: JSON with success/failure per record and success_count summary.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        record_ids: z.array(z.string()).min(1).max(500).describe("Record IDs to tag (max 500)"),
        tags: z.array(z.object({ name: z.string() })).min(1).describe("Tags to add, e.g. [{\"name\": \"VIP\"}]"),
        over_write: z.boolean().default(false).describe("Replace existing tags if true"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
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
      description: `Attach a URL link as an attachment to a specific record in Zoho CRM.

To upload an actual file, use the Zoho CRM UI or a multipart form tool directly.

Args:
  - module (string): CRM module name
  - record_id (string): ID of the record to attach the link to
  - attachment_url (string): The URL to attach
  - title (string): Display title for the attachment link

Returns: JSON with attachment metadata including ID and creation details.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        record_id: z.string().min(1).describe("Record ID"),
        attachment_url: z.string().url().describe("URL to attach"),
        title: z.string().optional().describe("Title for the attachment link"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, record_id, attachment_url, title }) => {
      try {
        const client = await createZohoClient();
        const params: Record<string, string> = { attachmentUrl: attachment_url };
        if (title) params.title = title;
        const response = await client.post(`/${module}/${record_id}/Attachments`, null, { params });
        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── UPLOAD FILE ATTACHMENT ────────────────────────────────────────────────
  server.registerTool(
    "zohocrm_upload_file",
    {
      title: "Upload File to a Record",
      description: `Upload a local file as an attachment to a specific record in Zoho CRM.
      
Args:
  - module (string): CRM module name (e.g. Events, Contacts)
  - record_id (string): ID of the record to attach the file to
  - file_path (string): Absolute path to the local file to upload

Returns: JSON with attachment metadata including ID.`,
      inputSchema: z.object({
        module: z.string().min(1).describe("CRM module name"),
        record_id: z.string().min(1).describe("Record ID"),
        file_path: z.string().min(1).describe("Absolute local file path"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ module, record_id, file_path }) => {
      try {
        console.error(`[INFO] ATTACH: Processing ${module}/${record_id} for path: ${file_path}`);
        
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const { createZohoClient, getAccessToken, getApiDomain } = await import("../services/zoho-client.js");

        // 1. Validate file exists
        await fs.access(file_path);
        const fileBuffer = await fs.readFile(file_path);
        const fileName = path.basename(file_path);
        
        // 2. Prepare Auth and Domain
        const accessToken = await getAccessToken();
        const apiDomain = getApiDomain();
        const uploadUrl = `${apiDomain}/crm/v6/${module}/${record_id}/Attachments`;

        // 3. Prepare Multipart Form Data using Native File and FormData (Node 20+)
        const formData = new FormData();
        // Native File(bits, name, options) - Node 20+
        const file = new File([fileBuffer], fileName, { type: "application/octet-stream" });
        formData.append("file", file);

        console.error(`[INFO] ATTACH: Sending ${fileName} (${fileBuffer.length} bytes) to ${uploadUrl}`);

        // 4. Use AXIOS for the upload (more reliable boundary handling)
        const response = await (await import("axios")).default.post(uploadUrl, formData, {
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            // Do NOT set Content-Type header, axios + FormData will handle it correctly with boundary
          },
        });

        console.error(`[INFO] ATTACH: ZOHO RESPONSE: ${JSON.stringify(response.data)}`);

        return {
          content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
        };
      } catch (error: any) {
        console.error(`[ERROR] ATTACH: FAILED:`, error.response?.data || error.message);
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
