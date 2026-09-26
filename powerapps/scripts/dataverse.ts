// Minimal Dataverse Web API client (client-credentials flow, no dependencies).
// Configuration comes from the environment:
//   PP_ENV_URL        e.g. https://org64ad231d.crm11.dynamics.com
//   PP_TENANT_ID      Entra tenant id
//   PP_CLIENT_ID      app registration (application user in the environment)
//   PP_CLIENT_SECRET  client secret value

export interface DataverseConfig {
  envUrl: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function configFromEnv(): DataverseConfig {
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing environment variable ${name}`);
    return v;
  };
  return {
    envUrl: need('PP_ENV_URL').replace(/\/+$/, ''),
    tenantId: need('PP_TENANT_ID'),
    clientId: need('PP_CLIENT_ID'),
    clientSecret: need('PP_CLIENT_SECRET'),
  };
}

export class DataverseClient {
  private token: string | null = null;
  private readonly cfg: DataverseConfig;
  readonly api: string;

  constructor(cfg: DataverseConfig) {
    this.cfg = cfg;
    this.api = `${cfg.envUrl}/api/data/v9.2`;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      grant_type: 'client_credentials',
      scope: `${this.cfg.envUrl}/.default`,
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json()) as { access_token?: string; error_description?: string };
    if (!res.ok || !json.access_token) {
      throw new Error(`Token request failed: ${res.status} ${json.error_description ?? ''}`);
    }
    this.token = json.access_token;
    return this.token;
  }

  async request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; headers: Headers; json: unknown }> {
    const token = await this.getToken();
    const url = path.startsWith('http') ? path : `${this.api}/${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
    }
    return { status: res.status, headers: res.headers, json };
  }

  async get<T>(path: string): Promise<T> {
    return (await this.request('GET', path)).json as T;
  }

  async getAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = path;
    while (next) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.get(next);
      out.push(...page.value);
      next = page['@odata.nextLink'] ?? null;
    }
    return out;
  }

  /** Creates a record and returns its id (parsed from the OData-EntityId header). */
  async create(entitySet: string, body: unknown, headers: Record<string, string> = {}): Promise<string> {
    const res = await this.request('POST', entitySet, body, headers);
    const entityId = res.headers.get('OData-EntityId') ?? '';
    const match = /\(([^)]+)\)$/.exec(entityId);
    if (!match?.[1]) throw new Error(`No entity id returned for POST ${entitySet}`);
    return match[1];
  }

  async patch(path: string, body: unknown, headers: Record<string, string> = {}): Promise<void> {
    await this.request('PATCH', path, body, headers);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  async action(name: string, body: unknown): Promise<unknown> {
    return (await this.request('POST', name, body)).json;
  }
}

export function label(text: string, languageCode = 1033) {
  return { '@odata.type': 'Microsoft.Dynamics.CRM.Label', LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: languageCode }] };
}
