import type { Difficulty, WorkOrder } from './domain';
import type { NewOrderPayload } from './components/NewOrderModal';

export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'IH' | 'VIEWER';

export type CurrentUser = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  orgUnitCode?: string;
  orgUnitName?: string;
};

export type MasterData = {
  routeTeams: Array<{ code: string; name: string }>;
  ownerUnits: Array<{ code: string; name: string; parentCode: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `HTTP_${response.status}`);
    Object.assign(error, { status: response.status, code: body.error });
    throw error;
  }
  return body as T;
}

export const api = {
  async me() {
    return request<{ user: CurrentUser }>('/api/auth/me');
  },
  async login(email: string, password: string) {
    return request<{ user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  async logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  async masterData() {
    return request<MasterData>('/api/master-data');
  },
  async orders() {
    return request<{ orders: WorkOrder[] }>('/api/work-orders');
  },
  async createOrder(payload: NewOrderPayload) {
    const receivedAt = payload.receivedAt
      ? new Date(`${payload.receivedAt}:00+07:00`).toISOString()
      : undefined;
    return request<{ order: WorkOrder }>('/api/work-orders', {
      method: 'POST',
      body: JSON.stringify({ ...payload, receivedAt }),
    });
  },
  async action(id: string, action: string) {
    return request<{ order: WorkOrder }>(`/api/work-orders/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },
  async assess(id: string, level: Difficulty, reason: string, kind: 'INITIAL' | 'IH') {
    return request<{ order: WorkOrder }>(`/api/work-orders/${encodeURIComponent(id)}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ level, reason, kind }),
    });
  },
};
