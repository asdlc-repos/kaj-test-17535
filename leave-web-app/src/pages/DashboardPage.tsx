import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getBalance,
  getLeaveRequests,
  approveLeaveRequest,
  rejectLeaveRequest,
} from '../api';
import type { LeaveBalance, LeaveRequest } from '../types';

function statusColor(status: string): 'warning' | 'success' | 'error' {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  return 'error';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviewTarget, setReviewTarget] = useState<{
    id: string;
    action: 'approve' | 'reject';
  } | null>(null);
  const [comments, setComments] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        if (user.role === 'employee') {
          const [bal, reqs] = await Promise.all([
            getBalance(user.employeeId),
            getLeaveRequests({ employeeId: user.employeeId }),
          ]);
          setBalance(bal);
          setMyRequests(reqs.slice(0, 5));
        } else {
          const reqs = await getLeaveRequests({
            managerId: user.employeeId,
            status: 'pending',
          });
          setPendingRequests(reqs);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, navigate]);

  const handleReview = async () => {
    if (!reviewTarget || !user) return;
    setReviewing(true);
    try {
      const payload = { managerId: user.employeeId, comments };
      if (reviewTarget.action === 'approve') {
        await approveLeaveRequest(reviewTarget.id, payload);
      } else {
        await rejectLeaveRequest(reviewTarget.id, payload);
      }
      setPendingRequests((prev) => prev.filter((r) => r.id !== reviewTarget.id));
      setReviewTarget(null);
      setComments('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review action failed');
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {user?.role === 'employee' ? (
        <>
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
            <Typography variant="h5">My Dashboard</Typography>
            <Button variant="contained" onClick={() => navigate('/request')}>
              New Leave Request
            </Button>
          </Box>

          {balance && (
            <>
              <Typography variant="h6" gutterBottom>
                Leave Balance
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
                {(Object.entries(balance.balances) as [string, number][]).map(
                  ([type, days]) => (
                    <Card key={type} sx={{ flex: '1 1 150px', minWidth: 140 }}>
                      <CardContent sx={{ textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">
                          {days}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ textTransform: 'capitalize' }}
                        >
                          {type} days
                        </Typography>
                      </CardContent>
                    </Card>
                  )
                )}
              </Box>
            </>
          )}

          <Typography variant="h6" gutterBottom>
            Recent Requests
          </Typography>
          {myRequests.length === 0 ? (
            <Typography color="text.secondary">No leave requests yet.</Typography>
          ) : (
            myRequests.map((req) => (
              <Card key={req.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: 1,
                    }}
                  >
                    <Box>
                      <Typography
                        variant="subtitle1"
                        sx={{ textTransform: 'capitalize', fontWeight: 600 }}
                      >
                        {req.leaveType} Leave
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {req.startDate} → {req.endDate}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {req.reason}
                      </Typography>
                      {req.managerComments && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 1, fontStyle: 'italic' }}
                        >
                          Manager: {req.managerComments}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label={req.status}
                      color={statusColor(req.status)}
                      size="small"
                    />
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
          {myRequests.length > 0 && (
            <Button onClick={() => navigate('/history')} sx={{ mt: 1 }}>
              View Full History
            </Button>
          )}
        </>
      ) : (
        <>
          <Typography variant="h5" gutterBottom>
            Pending Approvals
          </Typography>
          {pendingRequests.length === 0 ? (
            <Typography color="text.secondary">
              No pending requests from your team.
            </Typography>
          ) : (
            pendingRequests.map((req) => (
              <Card key={req.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 2,
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1">
                        Employee:{' '}
                        <Box component="span" fontWeight={700}>
                          {req.employeeId}
                        </Box>
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ textTransform: 'capitalize' }}
                      >
                        {req.leaveType} leave · {req.startDate} → {req.endDate}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {req.reason}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Submitted:{' '}
                        {new Date(req.submittedAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        onClick={() =>
                          setReviewTarget({ id: req.id, action: 'approve' })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        size="small"
                        onClick={() =>
                          setReviewTarget({ id: req.id, action: 'reject' })
                        }
                      >
                        Reject
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}

      {/* Review Dialog */}
      <Dialog
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {reviewTarget?.action === 'approve' ? 'Approve' : 'Reject'} Leave
          Request
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Comments (optional)"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewTarget(null)}>Cancel</Button>
          <Button
            onClick={handleReview}
            variant="contained"
            color={reviewTarget?.action === 'approve' ? 'success' : 'error'}
            disabled={reviewing}
          >
            {reviewing
              ? 'Processing...'
              : reviewTarget?.action === 'approve'
              ? 'Approve'
              : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
