export type LeaveType = 'annual' | 'sick' | 'personal';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type UserRole = 'employee' | 'manager';

export interface User {
  employeeId: string;
  role: UserRole;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  managerId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  managerComments?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface LeaveBalance {
  employeeId: string;
  balances: {
    annual: number;
    sick: number;
    personal: number;
  };
}

export interface CreateLeaveRequestPayload {
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ReviewPayload {
  managerId: string;
  comments?: string;
}
