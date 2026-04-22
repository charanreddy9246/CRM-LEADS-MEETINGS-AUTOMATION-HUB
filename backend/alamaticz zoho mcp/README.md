# Zoho CRM MCP Server

MCP server for Zoho CRM v7 API. Provides 18 tools covering record CRUD, search, lead conversion, tags, settings metadata, users, and org info.

---

## Tools Available

| Tool | Description |
|------|-------------|
| `zohocrm_get_records` | List records from any module with pagination |
| `zohocrm_get_record` | Get a single record by ID |
| `zohocrm_create_records` | Create up to 100 records |
| `zohocrm_update_records` | Update up to 100 records |
| `zohocrm_upsert_records` | Insert-or-update with duplicate check |
| `zohocrm_delete_records` | Delete up to 100 records |
| `zohocrm_search_records` | Search by criteria, email, phone, or word |
| `zohocrm_get_deleted_records` | View recycle bin / permanently deleted records |
| `zohocrm_get_related_records` | Get related records (e.g. Contacts on an Account) |
| `zohocrm_convert_lead` | Convert a Lead to Contact/Account/Deal |
| `zohocrm_add_tags` | Tag up to 500 records |
| `zohocrm_attach_link` | Attach a URL link to a record |
| `zohocrm_get_fields` | Get field metadata for a module |
| `zohocrm_get_module` | Get metadata for a specific module |
| `zohocrm_list_modules` | List all CRM modules |
| `zohocrm_get_roles` | List user roles |
| `zohocrm_get_pipelines` | Get deal pipelines for a layout |
| `zohocrm_get_users` | List/filter CRM users |
| `zohocrm_get_org` | Get organization info |

---

## Prerequisites

- Node.js v18 or later
- A Zoho CRM account with API access

---

## Step 1 — Install Node.js

Download from https://nodejs.org (LTS version recommended).

---

## Step 2 — Get Zoho OAuth Credentials

### 2a. Create a Self-Client App

1. Go to **https://api-console.zoho.com**
2. Sign in with your Zoho account
3. Click **"Add Client"** → choose **"Self Client"**
4. Click **"Create"**
5. Copy the **Client ID** and **Client Secret** — you'll need these

### 2b. Generate a Grant Token

1. In the Self Client page, click the **"Generate Code"** tab
2. In the **Scope** field, enter the scopes you need (see below)
3. Set **Time Duration** to the maximum allowed (e.g. 10 minutes)
4. Click **"Create"**
5. Copy the **grant token** (valid for only ~2 minutes)

**Recommended scopes** (paste as comma-separated):
```
ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL,ZohoCRM.org.ALL,ZohoSearch.securesearch.READ
```

### 2c. Exchange Grant Token for Refresh Token

Run this in your terminal (replace the placeholders):

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_GRANT_TOKEN" \
  -d "redirect_uri=https://www.zoho.com"
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "1000.xxxxxxxxxxxx",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Copy the **`refresh_token`** — this is long-lived and what the MCP server uses.

> **Note for non-US data centers:**
> - EU: use `https://accounts.zoho.eu`
> - IN: use `https://accounts.zoho.in`
> - AU: use `https://accounts.zoho.com.au`
> - JP: use `https://accounts.zoho.jp`

---

## Step 3 — Build the Server

```bash
cd "alamaticz zoho mcp"
npm install
npm run build
```

---

## Step 4 — Configure Claude Desktop (or any MCP client)

Add to your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "zohocrm": {
      "command": "node",
      "args": ["C:/Users/hima7/OneDrive/Desktop/project/alamaticz zoho mcp/dist/index.js"],
      "env": {
        "ZOHO_CLIENT_ID": "your_client_id",
        "ZOHO_CLIENT_SECRET": "your_client_secret",
        "ZOHO_REFRESH_TOKEN": "your_refresh_token",
        "ZOHO_API_DOMAIN": "https://www.zohoapis.com"
      }
    }
  }
}
```

> Change `ZOHO_API_DOMAIN` for your data center:
> - EU: `https://www.zohoapis.eu`
> - IN: `https://www.zohoapis.in`
> - AU: `https://www.zohoapis.com.au`
> - JP: `https://www.zohoapis.jp`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZOHO_CLIENT_ID` | Yes | OAuth app Client ID from api-console.zoho.com |
| `ZOHO_CLIENT_SECRET` | Yes | OAuth app Client Secret |
| `ZOHO_REFRESH_TOKEN` | Yes | Long-lived refresh token |
| `ZOHO_API_DOMAIN` | No | API base URL (default: `https://www.zohoapis.com`) |

---

## Development

```bash
npm run dev    # run with auto-reload (tsx watch)
npm run build  # compile TypeScript → dist/
npm start      # run compiled server
```
