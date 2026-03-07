
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminUsers from './pages/AdminUsers';
import EvaluatorTasks from './pages/EvaluatorTasks';
import StudentTasks from './pages/StudentTasks';
import Submissions from './pages/Submissions';
import TaskDetails from './pages/TaskDetails';
import Layout from './layouts/Layout';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              
              {/* Admin Routes */}
              <Route path="admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />
              
              {/* Evaluator Routes */}
              <Route path="evaluator/tasks" element={<ProtectedRoute allowedRoles={['evaluator']}><EvaluatorTasks /></ProtectedRoute>} />
              <Route path="evaluator/submissions/:taskId" element={<ProtectedRoute allowedRoles={['evaluator']}><Submissions /></ProtectedRoute>} />
              
              {/* Student Routes */}
              <Route path="student/tasks" element={<ProtectedRoute allowedRoles={['student']}><StudentTasks /></ProtectedRoute>} />
              <Route path="task/:taskId" element={<TaskDetails />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
