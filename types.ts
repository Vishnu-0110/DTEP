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
  department?: string;
  profilePhoto?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string;
  createdBy: string;
  createdAt: string;
  requiredPages?: number;
  rubricText?: string;
  rubricSections?: Array<{
    key?: string;
    label: string;
    maxMarks: number;
    required?: boolean;
    minWords?: number;
    aliases?: string[];
    guidance?: string;
  }>;
  rubricModel?: string;
  rubricGeneratedAt?: string | null;
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
  evaluationDetails?: any;
  allowResubmission?: boolean;
  reopenReason?: string;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  resubmissionCount?: number;
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

export type HelpdeskQueryStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface HelpdeskQuery {
  _id: string;
  subject: string;
  message: string;
  status: HelpdeskQueryStatus;
  raisedBy?: string;
  raisedByRole?: string;
  raisedByName?: string;
  raisedByEmail?: string;
  raisedByDepartment?: string;
  adminNotes?: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}
