import type { CaseDetail, DecisionAction, Meta, QueueCase } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let field: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; field?: string };
      if (body.error) message = body.error;
      field = body.field;
    } catch {
      // non-JSON error body; keep generic message
    }
    throw new ApiError(message, res.status, field);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => request<Meta>('/api/meta'),
  listCases: (params: { status?: string; q?: string }) => {
    const search = new URLSearchParams();
    if (params.status && params.status !== 'all') search.set('status', params.status);
    if (params.q) search.set('q', params.q);
    const qs = search.toString();
    return request<QueueCase[]>(`/api/cases${qs ? `?${qs}` : ''}`);
  },
  getCase: (id: string) => request<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`),
  submitDecision: (id: string, body: { action: DecisionAction; reason: string; reviewer: string }) =>
    request<CaseDetail>(`/api/cases/${encodeURIComponent(id)}/decisions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
