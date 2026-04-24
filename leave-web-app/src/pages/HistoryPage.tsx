import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getLeaveRequests } from '../api';
import type { LeaveRequest } from '../types';

function statusColor(status: string): 'warning' | 'success' | 'error' {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  return 'error';
}

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'employee') {
      navigate('/dashboard');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const params: { employeeId: string; status?: string } = {
          employeeId: user.employeeId,
        };
        if (statusFilter) params.status = statusFilter;
        const data = await getLeaveRequests(params);
        setRequests(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, navigate, statusFilter]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h5">Leave History</Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Filter by status</InputLabel>
          <Select
            value={statusFilter}
            label="Filter by status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {requests.length === 0 ? (
        <Typography color="text.secondary">
          No leave requests found.
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Start Date</TableCell>
                <TableCell>End Date</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Manager Comments</TableCell>
                <TableCell>Submitted</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell sx={{ textTransform: 'capitalize' }}>
                    {req.leaveType}
                  </TableCell>
                  <TableCell>{req.startDate}</TableCell>
                  <TableCell>{req.endDate}</TableCell>
                  <TableCell>{req.reason}</TableCell>
                  <TableCell>
                    <Chip
                      label={req.status}
                      color={statusColor(req.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{req.managerComments ?? '—'}</TableCell>
                  <TableCell>
                    {new Date(req.submittedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
