import { UserRole } from '../types';

const LAST_ROUTE_PREFIX = 'dtep_last_route';

const normalizePath = (path: string) => {
  const trimmed = String(path || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const getDefaultRouteForRole = (role?: UserRole | string) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === UserRole.ADMIN) return '/admin/users';
  if (normalizedRole === UserRole.EVALUATOR) return '/evaluator/tasks';
  if (normalizedRole === UserRole.STUDENT) return '/student/tasks';
  return '/dashboard';
};

export const isRouteAllowedForRole = (path: string, role?: UserRole | string) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || normalizedPath === '/' || normalizedPath.startsWith('/login')) {
    return false;
  }

  if (
    normalizedPath === '/dashboard' ||
    normalizedPath.startsWith('/task/')
  ) {
    return true;
  }

  const normalizedRole = String(role || '').trim().toLowerCase();

  if (normalizedRole === UserRole.ADMIN) {
    return normalizedPath === '/admin/users';
  }

  if (normalizedRole === UserRole.EVALUATOR) {
    return (
      normalizedPath === '/evaluator/tasks' ||
      normalizedPath.startsWith('/evaluator/submissions/')
    );
  }

  if (normalizedRole === UserRole.STUDENT) {
    return normalizedPath === '/student/tasks';
  }

  return false;
};

const getLastRouteKey = (userId: string) => `${LAST_ROUTE_PREFIX}:${String(userId || '').trim()}`;
const isPersistableRoute = (path: string) => {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || normalizedPath === '/' || normalizedPath.startsWith('/login')) {
    return false;
  }

  return (
    normalizedPath === '/dashboard' ||
    normalizedPath === '/admin/users' ||
    normalizedPath === '/evaluator/tasks' ||
    normalizedPath.startsWith('/evaluator/submissions/') ||
    normalizedPath === '/student/tasks' ||
    normalizedPath.startsWith('/task/')
  );
};

export const saveLastRouteForUser = (userId: string, path: string) => {
  if (typeof window === 'undefined') return;
  const trimmedUserId = String(userId || '').trim();
  if (!trimmedUserId) return;

  const normalizedPath = normalizePath(path);
  if (!isPersistableRoute(normalizedPath)) return;

  localStorage.setItem(getLastRouteKey(trimmedUserId), normalizedPath);
};

export const getPreferredRouteForUser = (userId: string, role?: UserRole | string) => {
  const fallback = getDefaultRouteForRole(role);
  if (typeof window === 'undefined') return fallback;

  const trimmedUserId = String(userId || '').trim();
  if (!trimmedUserId) return fallback;

  const stored = normalizePath(localStorage.getItem(getLastRouteKey(trimmedUserId)) || '');
  if (!stored) return fallback;

  return isRouteAllowedForRole(stored, role) ? stored : fallback;
};
