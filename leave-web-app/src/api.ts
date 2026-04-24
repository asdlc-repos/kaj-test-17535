import type { LeaveRequest, LeaveBalance, CreateLeaveRequestPayload, ReviewPayload } from './types';

const BASE_URL: string =
  (window as unknown as Record<string, string>)['RUNTIME_BACKEND_API_URL'] ||
  (import.meta.env['VITE_API_BASE_URL'] as string) ||
  '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(errorData.error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getBalance(employeeId: string): Promise<LeaveBalance> {
  return request<LeaveBalance>(`/employees/${employeeId}/balance`);
}

export function getLeaveRequests(params: {
  employeeId?: string;
  managerId?: string;
  status?: string;
}): Promise<LeaveRequest[]> {
  const query = new URLSearchParams();
  if (params.employeeId) query.set('employeeId', params.employeeId);
  if (params.managerId) query.set('managerId', params.managerId);
  if (params.status) query.set('status', params.status);
  const qs = query.toString();
  return request<LeaveRequest[]>(`/leave-requests${qs ? `?${qs}` : ''}`);
}

export function createLeaveRequest(data: CreateLeaveRequestPayload): Promise<LeaveRequest> {
  return request<LeaveRequest>('/leave-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function approveLeaveRequest(id: string, payload: ReviewPayload): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leave-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function rejectLeaveRequest(id: string, payload: ReviewPayload): Promise<LeaveRequest> {
  return request<LeaveRequest>(`/leave-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
