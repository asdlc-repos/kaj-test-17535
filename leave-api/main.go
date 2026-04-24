package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ─── Data Structures ──────────────────────────────────────────────────────────

type Employee struct {
	ID            string             `json:"id"`
	Name          string             `json:"name"`
	ManagerID     string             `json:"managerId"`
	LeaveBalances map[string]float64 `json:"leaveBalances"`
}

type LeaveRequest struct {
	ID              string     `json:"id"`
	EmployeeID      string     `json:"employeeId"`
	ManagerID       string     `json:"managerId"`
	LeaveType       string     `json:"leaveType"`
	StartDate       string     `json:"startDate"`
	EndDate         string     `json:"endDate"`
	Reason          string     `json:"reason"`
	Status          string     `json:"status"`
	ManagerComments string     `json:"managerComments,omitempty"`
	SubmittedAt     time.Time  `json:"submittedAt"`
	ReviewedAt      *time.Time `json:"reviewedAt,omitempty"`
}

type Store struct {
	mu           sync.RWMutex
	employees    map[string]*Employee
	requests     map[string]*LeaveRequest
	requestCount int
}

// ─── Seed Data ─────────────────────────────────────────────────────────────────

func newStore() *Store {
	s := &Store{
		employees: make(map[string]*Employee),
		requests:  make(map[string]*LeaveRequest),
	}

	defaultBalances := func() map[string]float64 {
		return map[string]float64{"annual": 20, "sick": 10, "personal": 5}
	}

	// 2 managers
	s.employees["mgr1"] = &Employee{ID: "mgr1", Name: "Alice Manager", ManagerID: "", LeaveBalances: defaultBalances()}
	s.employees["mgr2"] = &Employee{ID: "mgr2", Name: "Bob Manager", ManagerID: "", LeaveBalances: defaultBalances()}

	// 3 employees
	s.employees["emp1"] = &Employee{ID: "emp1", Name: "Charlie Smith", ManagerID: "mgr1", LeaveBalances: defaultBalances()}
	s.employees["emp2"] = &Employee{ID: "emp2", Name: "Diana Jones", ManagerID: "mgr1", LeaveBalances: defaultBalances()}
	s.employees["emp3"] = &Employee{ID: "emp3", Name: "Eve Brown", ManagerID: "mgr2", LeaveBalances: defaultBalances()}

	return s
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const dateLayout = "2006-01-02"

func parseDate(s string) (time.Time, error) {
	return time.Parse(dateLayout, s)
}

// businessDays calculates (endDate - startDate + 1) * 5/7 rounded to 2 dp.
func businessDays(start, end time.Time) float64 {
	days := end.Sub(start).Hours()/24 + 1
	return math.Round((days*5/7)*100) / 100
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

func (s *Store) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// POST /api/leave-requests
func (s *Store) handleCreateLeaveRequest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		EmployeeID string `json:"employeeId"`
		LeaveType  string `json:"leaveType"`
		StartDate  string `json:"startDate"`
		EndDate    string `json:"endDate"`
		Reason     string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if body.EmployeeID == "" || body.LeaveType == "" || body.StartDate == "" || body.EndDate == "" {
		writeError(w, http.StatusBadRequest, "employeeId, leaveType, startDate and endDate are required")
		return
	}

	start, err := parseDate(body.StartDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid startDate format, expected YYYY-MM-DD")
		return
	}
	end, err := parseDate(body.EndDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid endDate format, expected YYYY-MM-DD")
		return
	}
	if end.Before(start) {
		writeError(w, http.StatusBadRequest, "endDate must be on or after startDate")
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	emp, ok := s.employees[body.EmployeeID]
	if !ok {
		writeError(w, http.StatusNotFound, "employee not found")
		return
	}

	// Check overlap with existing pending/approved requests
	for _, req := range s.requests {
		if req.EmployeeID != body.EmployeeID {
			continue
		}
		if req.Status == "rejected" {
			continue
		}
		rs, _ := parseDate(req.StartDate)
		re, _ := parseDate(req.EndDate)
		if !end.Before(rs) && !start.After(re) {
			writeError(w, http.StatusConflict, "leave request overlaps with an existing request")
			return
		}
	}

	days := businessDays(start, end)

	bal, exists := emp.LeaveBalances[body.LeaveType]
	if !exists {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown leave type: %s", body.LeaveType))
		return
	}
	if bal < days {
		writeError(w, http.StatusUnprocessableEntity, "insufficient leave balance")
		return
	}

	// Optimistic deduction
	emp.LeaveBalances[body.LeaveType] -= days

	s.requestCount++
	id := fmt.Sprintf("req%d", s.requestCount)

	lr := &LeaveRequest{
		ID:          id,
		EmployeeID:  body.EmployeeID,
		ManagerID:   emp.ManagerID,
		LeaveType:   body.LeaveType,
		StartDate:   body.StartDate,
		EndDate:     body.EndDate,
		Reason:      body.Reason,
		Status:      "pending",
		SubmittedAt: time.Now().UTC(),
	}
	s.requests[id] = lr

	writeJSON(w, http.StatusCreated, lr)
}

// GET /api/leave-requests?employeeId=&managerId=&status=
func (s *Store) handleListLeaveRequests(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filterEmployee := q.Get("employeeId")
	filterManager := q.Get("managerId")
	filterStatus := q.Get("status")

	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]*LeaveRequest, 0)
	for _, req := range s.requests {
		if filterEmployee != "" && req.EmployeeID != filterEmployee {
			continue
		}
		if filterManager != "" && req.ManagerID != filterManager {
			continue
		}
		if filterStatus != "" && req.Status != filterStatus {
			continue
		}
		results = append(results, req)
	}

	writeJSON(w, http.StatusOK, results)
}

// POST /api/leave-requests/{id}/approve
func (s *Store) handleApprove(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		ManagerID string `json:"managerId"`
		Comments  string `json:"comments"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	s.mu.Lock()
	defer s.mu.Unlock()

	req, ok := s.requests[id]
	if !ok {
		writeError(w, http.StatusNotFound, "leave request not found")
		return
	}
	if req.Status != "pending" {
		writeError(w, http.StatusConflict, fmt.Sprintf("leave request is already %s", req.Status))
		return
	}
	if body.ManagerID == "" {
		writeError(w, http.StatusBadRequest, "managerId is required")
		return
	}
	if req.ManagerID != body.ManagerID {
		writeError(w, http.StatusForbidden, "manager not authorized to approve this request")
		return
	}

	now := time.Now().UTC()
	req.Status = "approved"
	req.ManagerComments = body.Comments
	req.ReviewedAt = &now

	writeJSON(w, http.StatusOK, req)
}

// POST /api/leave-requests/{id}/reject
func (s *Store) handleReject(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		ManagerID string `json:"managerId"`
		Comments  string `json:"comments"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	s.mu.Lock()
	defer s.mu.Unlock()

	req, ok := s.requests[id]
	if !ok {
		writeError(w, http.StatusNotFound, "leave request not found")
		return
	}
	if req.Status != "pending" {
		writeError(w, http.StatusConflict, fmt.Sprintf("leave request is already %s", req.Status))
		return
	}
	if body.ManagerID == "" {
		writeError(w, http.StatusBadRequest, "managerId is required")
		return
	}
	if req.ManagerID != body.ManagerID {
		writeError(w, http.StatusForbidden, "manager not authorized to reject this request")
		return
	}

	// Restore balance
	emp, ok := s.employees[req.EmployeeID]
	if ok {
		start, _ := parseDate(req.StartDate)
		end, _ := parseDate(req.EndDate)
		days := businessDays(start, end)
		emp.LeaveBalances[req.LeaveType] += days
	}

	now := time.Now().UTC()
	req.Status = "rejected"
	req.ManagerComments = body.Comments
	req.ReviewedAt = &now

	writeJSON(w, http.StatusOK, req)
}

// GET /api/employees/{id}/balance
func (s *Store) handleGetBalance(w http.ResponseWriter, r *http.Request, id string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	emp, ok := s.employees[id]
	if !ok {
		writeError(w, http.StatusNotFound, "employee not found")
		return
	}

	leaveType := r.URL.Query().Get("type")
	if leaveType != "" {
		bal, exists := emp.LeaveBalances[leaveType]
		if !exists {
			writeError(w, http.StatusNotFound, fmt.Sprintf("leave type %s not found", leaveType))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"employeeId": emp.ID,
			"leaveType":  leaveType,
			"balance":    bal,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"employeeId":    emp.ID,
		"leaveBalances": emp.LeaveBalances,
	})
}

// ─── Router ────────────────────────────────────────────────────────────────────

func (s *Store) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	method := r.Method

	// GET /health
	if path == "/health" && method == http.MethodGet {
		s.handleHealth(w, r)
		return
	}

	// /api/leave-requests
	if path == "/api/leave-requests" {
		switch method {
		case http.MethodPost:
			s.handleCreateLeaveRequest(w, r)
		case http.MethodGet:
			s.handleListLeaveRequests(w, r)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	// /api/leave-requests/{id}/approve  or  /api/leave-requests/{id}/reject
	if strings.HasPrefix(path, "/api/leave-requests/") {
		rest := strings.TrimPrefix(path, "/api/leave-requests/")
		parts := strings.SplitN(rest, "/", 2)
		if len(parts) == 2 && method == http.MethodPost {
			id := parts[0]
			action := parts[1]
			switch action {
			case "approve":
				s.handleApprove(w, r, id)
				return
			case "reject":
				s.handleReject(w, r, id)
				return
			}
		}
	}

	// /api/employees/{id}/balance
	if strings.HasPrefix(path, "/api/employees/") && strings.HasSuffix(path, "/balance") {
		rest := strings.TrimPrefix(path, "/api/employees/")
		id := strings.TrimSuffix(rest, "/balance")
		if id != "" && method == http.MethodGet {
			s.handleGetBalance(w, r, id)
			return
		}
	}

	writeError(w, http.StatusNotFound, "not found")
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

func main() {
	store := newStore()
	addr := ":9090"
	log.Printf("leave-api listening on %s", addr)
	if err := http.ListenAndServe(addr, store); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
