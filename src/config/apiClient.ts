/**
 * Centralized API Client & Configuration Service
 * Handles environment variable loading across local (.env) and production (Netlify, Vite, Next.js, CRA)
 * with robust timeout management, 401/403/429 error handling, and fallback states.
 */

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  isConfigured: boolean;
  environment: string;
}

export interface ApiErrorDetails {
  status?: number;
  code: 'MISSING_API_KEY' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT';
  message: string;
  userFriendlyMessage: string;
}

export class ApiError extends Error {
  public details: ApiErrorDetails;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.details = details;
  }
}

/**
 * Safely resolves environment variables across Vite, CRA, Next.js, and Node/Netlify runtimes
 */
export function getEnvVariable(key: string): string {
  if (typeof window !== 'undefined') {
    // Vite client-side environment
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const env = (import.meta as any).env;
      if (env[key]) return String(env[key]);
      if (env[`VITE_${key}`]) return String(env[`VITE_${key}`]);
    }
  }

  // Node / Server / Process environment check safely
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return String(process.env[key]);
    if (process.env[`VITE_${key}`]) return String(process.env[`VITE_${key}`]);
    if (process.env[`NEXT_PUBLIC_${key}`]) return String(process.env[`NEXT_PUBLIC_${key}`]);
    if (process.env[`REACT_APP_${key}`]) return String(process.env[`REACT_APP_${key}`]);
  }

  return '';
}

/**
 * Get central API configuration
 */
export function getApiConfig(): ApiConfig {
  const apiKey = 
    getEnvVariable('API_KEY') ||
    getEnvVariable('GEMINI_API_KEY') ||
    getEnvVariable('FIREBASE_API_KEY');

  const baseUrl = 
    getEnvVariable('API_BASE_URL') ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const environment = 
    getEnvVariable('NODE_ENV') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.MODE) ||
    'production';

  return {
    apiKey,
    baseUrl,
    isConfigured: Boolean(apiKey && apiKey.trim().length > 0),
    environment,
  };
}

/**
 * Resilient API fetch wrapper with timeout, quota handling, and user-friendly error formatting
 */
export async function apiClientFetch<T = any>(
  endpoint: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const config = getApiConfig();
  const { timeoutMs = 12000, headers = {}, ...fetchOptions } = options;

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${config.baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (config.apiKey) {
    reqHeaders['x-api-key'] = config.apiKey;
    reqHeaders['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // AbortController for timeout management
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers: reqHeaders,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        // Body might not be JSON
      }

      if (status === 401 || status === 403) {
        throw new ApiError({
          status,
          code: 'UNAUTHORIZED',
          message: errorData.message || `API Authentication error (${status})`,
          userFriendlyMessage: 'Authentication failed. Please verify your API key in environment variables or configuration.',
        });
      }

      if (status === 429) {
        throw new ApiError({
          status,
          code: 'RATE_LIMITED',
          message: errorData.message || 'API quota limit exceeded (429)',
          userFriendlyMessage: 'API rate limit or quota exceeded. Please wait a moment before trying again.',
        });
      }

      throw new ApiError({
        status,
        code: 'SERVER_ERROR',
        message: errorData.message || `Server responded with status ${status}`,
        userFriendlyMessage: `Server error (${status}). Please try again shortly.`,
      });
    }

    const data = await response.json();
    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === 'AbortError') {
      throw new ApiError({
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms`,
        userFriendlyMessage: 'The connection timed out. Please check your network connection and try again.',
      });
    }

    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: error.message || 'Failed to connect to API server',
      userFriendlyMessage: 'Unable to connect to the server. Please check your network connection.',
    });
  }
}
