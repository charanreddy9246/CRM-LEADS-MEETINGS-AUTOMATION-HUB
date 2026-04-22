export interface ZohoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  api_domain: string;
}

export interface ZohoRecord {
  id: string;
  [key: string]: unknown;
}

export interface ZohoResponseInfo {
  per_page: number;
  count: number;
  page: number;
  more_records: boolean;
  next_page_token?: string;
  previous_page_token?: string;
  [key: string]: unknown;
}

export interface ZohoListResponse {
  data: ZohoRecord[];
  info: ZohoResponseInfo;
  [key: string]: unknown;
}

export interface ZohoActionResult {
  code: string;
  message: string;
  status: string;
  details: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ZohoActionResponse {
  data: ZohoActionResult[];
  [key: string]: unknown;
}

export interface ZohoConvertLeadResponse {
  data: Array<{
    Contacts?: { id: string };
    Accounts?: { id: string };
    Deals?: { id: string };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
