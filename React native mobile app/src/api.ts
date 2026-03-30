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
  onUploadProgress?: (progress: number) => void;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

type UploadRequestOptions = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  timeoutMs: number;
  onUploadProgress: (progress: number) => void;
};

function apiUploadRequest<T>(options: UploadRequestOptions): Promise<T> {
  const { url, method, headers, body, timeoutMs, onUploadProgress } = options;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finishResolve = (value: T) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const finishReject = (error: ApiError) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timeoutId = setTimeout(() => {
      try {
        xhr.abort();
      } catch {
        // no-op
      }
      finishReject(new ApiError('Request timeout', 0));
    }, timeoutMs);

    xhr.open(method, url, true);
    xhr.withCredentials = true;

    Object.entries(headers).forEach(([key, value]) => {
      try {
        xhr.setRequestHeader(key, value);
      } catch {
        // Ignore unsupported header errors.
      }
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const next = Math.max(0, Math.min(1, event.loaded / event.total));
      onUploadProgress(next);
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      finishReject(new ApiError('Network error', 0));
    };

    xhr.onabort = () => {
      clearTimeout(timeoutId);
      finishReject(new ApiError('Request timeout', 0));
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4 || settled) return;

      clearTimeout(timeoutId);

      const setCookie = xhr.getResponseHeader('set-cookie');
      if (setCookie) {
        const match = setCookie.match(/connect\.sid=[^;]+/);
        if (match) {
          void saveSessionCookie(match[0]);
        }
      }

      const status = xhr.status || 0;
      const responseText = xhr.responseText || '';

      if (status < 200 || status >= 300) {
        let errorData: any = {};
        if (responseText) {
          try {
            errorData = JSON.parse(responseText);
          } catch {
            errorData = {};
          }
        }
        finishReject(
          new ApiError(
            errorData.message || `Request failed: ${status}`,
            status,
            errorData
          )
        );
        return;
      }

      onUploadProgress(1);

      if (!responseText) {
        finishResolve(undefined as T);
        return;
      }

      try {
        finishResolve(JSON.parse(responseText));
      } catch {
        finishResolve(responseText as unknown as T);
      }
    };

    onUploadProgress(0);
    xhr.send(body);
  });
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    isFormData = false,
    timeoutMs,
    onUploadProgress,
  } = options;

  const requestTimeoutMs = timeoutMs ?? (isFormData ? DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS);

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
      }, requestTimeoutMs)
    : null;

  if (controller) {
    config.signal = controller.signal;
  }

  if (body) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  if (isFormData && onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
    return apiUploadRequest<T>({
      url: `${API_BASE_URL}${path}`,
      method,
      headers: requestHeaders,
      body,
      timeoutMs: requestTimeoutMs,
      onUploadProgress,
    });
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
