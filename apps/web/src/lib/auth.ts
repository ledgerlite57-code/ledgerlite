const ACCESS_TOKEN_KEY = "ledgerlite.accessToken";

const readStoredToken = () => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
};

let accessToken: string | null = readStoredToken();

export function setAccessToken(token: string) {
  accessToken = token;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // ignore storage failures
    }
  }
}

export function getAccessToken() {
  if (accessToken) {
    return accessToken;
  }
  const stored = readStoredToken();
  if (stored) {
    accessToken = stored;
  }
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } catch {
      // ignore storage failures
    }
  }
}
