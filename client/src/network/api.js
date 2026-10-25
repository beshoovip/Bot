// واجهة REST للحساب والشخصيات. fetch قابل للحقن للاختبار.

export class ApiClient {
  constructor({ baseUrl, fetchImpl = globalThis.fetch?.bind(globalThis), getToken = () => '' }) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.getToken = getToken;
  }
  async #req(method, path, body) {
    if (!this.baseUrl) return { ok: false, error: 'NO_SERVER' };
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const json = await res.json().catch(() => ({ ok: false, error: 'BAD_RESPONSE' }));
      return json;
    } catch {
      return { ok: false, error: 'NETWORK' };
    } finally {
      clearTimeout(timer);
    }
  }
  register(username, password) { return this.#req('POST', '/api/register', { username, password }); }
  login(username, password) { return this.#req('POST', '/api/login', { username, password }); }
  logout() { return this.#req('POST', '/api/logout'); }
  characters() { return this.#req('GET', '/api/characters'); }
  createCharacter(name, profession) { return this.#req('POST', '/api/characters', { name, profession }); }
  health() { return this.#req('GET', '/healthz'); }
}
