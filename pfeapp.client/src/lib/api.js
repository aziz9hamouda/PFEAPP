const TOKEN_KEY = "pfeapp_token";

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

// Wrapper autour de fetch() qui injecte le token JWT et déclenche onUnauthorized
// (déconnexion) en cas de 401/403, pour tous les appels vers des endpoints protégés.
export async function apiFetch(url, options = {}, onUnauthorized) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });

    if ((res.status === 401 || res.status === 403) && onUnauthorized) {
        onUnauthorized();
    }

    return res;
}
