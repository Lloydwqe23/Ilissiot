import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './config';

const SESSION_COOKIE_KEY = 'ilissiot_session_cookie';

let sessionCookie: string | null = null;

export { API_BASE_URL };

export async function loadSessionCookie() {
  sessionCookie = await AsyncStorage.getItem(SESSION_COOKIE_KEY);
}

export async function saveSessionCookie(cookie: string) {
  sessionCookie = cookie;
  await AsyncStorage.setItem(SESSION_COOKIE_KEY, cookie);
}

export async function clearSessionCookie() {
  sessionCookie = null;
  await AsyncStorage.removeItem(SESSION_COOKIE_KEY);
}

export function getSessionCookie() {
  return sessionCookie;
}

type RequestOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  isFormData?: boolean;
  timeoutMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    isFormData = false,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = options;

  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  if (!isFormData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (sessionCookie) {
    requestHeaders['Cookie'] = sessionCookie;
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
    credentials: 'include',
  };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  if (controller) {
    config.signal = controller.signal;
  }

  if (body) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, config);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timeout', 0);
    }
    throw new ApiError(err.message || 'Network error', 0);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  // Extract and save session cookie from response
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/connect\.sid=[^;]+/);
    if (match) {
      await saveSessionCookie(match[0]);
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.message || `Request failed: ${response.status}`,
      response.status,
      errorData
    );
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getFullUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE_URL}${path}`;
}
