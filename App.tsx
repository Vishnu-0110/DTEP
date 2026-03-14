
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { getPreferredRouteForUser } from './utils/navigationPersistence';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const EvaluatorTasks = lazy(() => import('./pages/EvaluatorTasks'));
const StudentTasks = lazy(() => import('./pages/StudentTasks'));
const Submissions = lazy(() => import('./pages/Submissions'));
const TaskDetails = lazy(() => import('./pages/TaskDetails'));
const Layout = lazy(() => import('./layouts/Layout'));

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

const RoleAwareIndexRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getPreferredRouteForUser(user.id, user.role)} replace />;
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HashRouter>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<RoleAwareIndexRedirect />} />
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
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
