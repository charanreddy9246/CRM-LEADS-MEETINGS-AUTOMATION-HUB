import axios, { AxiosError, AxiosInstance } from "axios";
import { ZOHO_ACCOUNTS_URL as DEFAULT_ACCOUNTS_URL } from "../constants.js";
import type { ZohoTokenResponse } from "../types.js";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
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
  const response = await axios.post<ZohoTokenResponse>(
    `${accountsUrl}/oauth/v2/token`,
    null,
    {
      params: {
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      },
    }
  );

  const { access_token, expires_in } = response.data;
  tokenCache = {
    accessToken: access_token,
    expiresAt: now + expires_in * 1000,
  };

  return access_token;
}

export function getApiDomain(): string {
  return process.env.ZOHO_API_DOMAIN ?? "https://www.zohoapis.com";
}

export async function createZohoClient(): Promise<AxiosInstance> {
  const accessToken = await getAccessToken();
  const apiDomain = getApiDomain();

  return axios.create({
    baseURL: `${apiDomain}/crm/v7`,
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
    const body = error.response?.data as Record<string, unknown> | undefined;
    const message = body?.message ?? body?.code ?? error.message;

    switch (status) {
      case 400:
        return `Error 400 Bad Request: ${message}`;
      case 401:
        return "Error 401 Unauthorized: Invalid or expired OAuth token. Check your credentials.";
      case 403:
        return `Error 403 Forbidden: Insufficient permissions. ${message}`;
      case 404:
        return "Error 404 Not Found: The resource or module does not exist.";
      case 429:
        return "Error 429 Rate Limit Exceeded: Too many requests. Please wait before retrying.";
      default:
        return `Error ${status ?? "unknown"}: ${message}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
