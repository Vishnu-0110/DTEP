export enum UserRole {
  ADMIN = 'admin',
  EVALUATOR = 'evaluator',
  STUDENT = 'student'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  createdBy: string;
  createdAt: string;
  submissionCount?: number;
  submissions?: number;
  total?: number;
}

export interface Submission {
  id: string;
  taskId: string;
  studentId: string;
  studentName: string;
  fileUrl: string;
  fileName: string;
  submittedAt: string;
  answer?: string;
  marks?: number;
  feedback?: string;
  remarks?: string;
  aiMarks?: number | null;
  aiFeedback?: string;
  missingPoints?: string;
  aiEvaluatedAt?: string | null;
  aiModel?: string | null;
  isAutoZero?: boolean;
  status: 'pending' | 'evaluated';
  aiReport?: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
}

export interface Stats {
  totalTasks: number;
  totalStudents: number;
  totalSubmissions: number;
  pendingEvaluations: number;
}
