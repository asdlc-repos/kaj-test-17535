import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
  Paper,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getBalance, createLeaveRequest } from '../api';
import type { LeaveType, LeaveBalance } from '../types';

function estimateBusinessDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  const diffDays = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.round(diffDays * 5 / 7);
}

export default function RequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'employee') {
      navigate('/dashboard');
      return;
    }
    getBalance(user.employeeId)
      .then(setBalance)
      .catch(() => {
        /* balance unavailable, proceed without check */
      })
      .finally(() => setLoadingBalance(false));
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!user) return;

    if (!startDate || !endDate) {
      setError('Please select start and end dates');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date must be on or after start date');
      return;
    }
    if (!reason.trim()) {
      setError('Please provide a reason for your leave request');
      return;
    }

    if (balance) {
      const requested = estimateBusinessDays(startDate, endDate);
      const available = balance.balances[leaveType] ?? 0;
      if (requested > available) {
        setError(
          `Insufficient ${leaveType} leave balance. Requested: ${requested} business days, Available: ${available} days.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      await createLeaveRequest({
        employeeId: user.employeeId,
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
      });
      setSuccess('Leave request submitted successfully!');
      setTimeout(() => navigate('/history'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingBalance) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const availableDays = balance?.balances[leaveType] ?? 0;
  const requestedDays = estimateBusinessDays(startDate, endDate);

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        New Leave Request
      </Typography>

      {balance && (
        <Box
          sx={{
            mb: 2,
            p: 2,
            bgcolor: 'grey.50',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Available balance — Annual: <strong>{balance.balances.annual}d</strong> · Sick:{' '}
            <strong>{balance.balances.sick}d</strong> · Personal:{' '}
            <strong>{balance.balances.personal}d</strong>
          </Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Box component="form" onSubmit={handleSubmit}>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Leave Type</InputLabel>
            <Select
              value={leaveType}
              label="Leave Type"
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            >
              <MenuItem value="annual">Annual</MenuItem>
              <MenuItem value="sick">Sick</MenuItem>
              <MenuItem value="personal">Personal</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />

          {startDate && endDate && requestedDays > 0 && (
            <Alert
              severity={requestedDays > availableDays ? 'error' : 'info'}
              sx={{ mb: 2 }}
            >
              Estimated business days: {requestedDays} · Available {leaveType}{' '}
              days: {availableDays}
            </Alert>
          )}

          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            required
            multiline
            rows={4}
            sx={{ mb: 3 }}
            placeholder="Please describe the reason for your leave request"
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              fullWidth
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/dashboard')}
              fullWidth
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
