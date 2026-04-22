import axios, { AxiosError, AxiosInstance } from "axios";
import { ZOHO_ACCOUNTS_URL as DEFAULT_ACCOUNTS_URL } from "../constants.js";
import type { ZohoTokenResponse } from "../types.js";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
  apiDomain: string;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing required environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN"
    );
  }

  const accountsUrl = process.env.ZOHO_ACCOUNTS_URL ?? DEFAULT_ACCOUNTS_URL;
  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("refresh_token", refreshToken);

  try {
    const response = await axios.post<ZohoTokenResponse>(
      `${accountsUrl}/oauth/v2/token`,
      params.toString(), // Hard-stringify for maximum compatibility
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    
    // Check if body has an error despite being status 200
    if ((response.data as any).error) {
      throw new Error(`Zoho OAuth Error: ${(response.data as any).error} (${(response.data as any).error_description || "no description"})`);
    }

    const { access_token, api_domain, expires_in } = response.data;
    tokenCache = {
      accessToken: access_token,
      apiDomain: api_domain || process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in",
      expiresAt: now + expires_in * 1000,
    };

    return access_token;
  } catch (error: any) {
    if (error.response?.data) {
        const detail = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
        throw new Error(`Failed to refresh Zoho token: ${detail}`);
    }
    throw error;
  }
}

export function getApiDomain(): string {
  if (tokenCache?.apiDomain) {
    return tokenCache.apiDomain;
  }
  return process.env.ZOHO_API_DOMAIN ?? "https://www.zohoapis.in";
}

export async function createZohoClient(): Promise<AxiosInstance> {
  const accessToken = await getAccessToken();
  const apiDomain = getApiDomain();

  return axios.create({
    baseURL: `${apiDomain}/crm/v6`,
    timeout: 30_000,
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const body = error.response?.data as Record<string, any> | undefined;
    let message = body?.message ?? body?.code ?? body?.error ?? error.message;

    // Handle Zoho's data-level error array (e.g. for module creation errors)
    if (body?.data && Array.isArray(body.data) && body.data.length > 0) {
      const firstError = body.data[0];
      if (firstError.code || firstError.message) {
        const detail = firstError.details ? JSON.stringify(firstError.details) : "";
        message = `${firstError.code || "Error"}: ${firstError.message || "No message"}. ${detail}`;
      }
    }

    switch (status) {
      case 400:
        return `Error 400 Bad Request: ${message}`;
      case 401:
        return `Error 401 Unauthorized: ${message}. (Check if your credentials match the .in region)`;
      case 403:
        return `Error 403 Forbidden: Insufficient permissions. ${message}`;
      case 404:
        return `Error 404 Not Found: The resource or module does not exist. (Tried module: Events)`;
      case 429:
        return "Error 429 Rate Limit Exceeded: Too many requests. Please wait before retrying.";
      default:
        return `Error ${status ?? "unknown"}: ${message}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
