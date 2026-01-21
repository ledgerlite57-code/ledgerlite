let accessToken: string | null = null;
const STORAGE_KEY = "ledgerlite_access_token";

export function setAccessToken(token: string) {
  accessToken = token;
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, token);
  }
}

export function getAccessToken() {
  if (accessToken) {
    return accessToken;
  }
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    accessToken = stored;
  }
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
