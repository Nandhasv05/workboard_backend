export type UserRole = 'owner' | 'admin' | 'project_manager' | 'developer' | 'designer' | 'qa' | 'viewer';
export type WorkspaceRole = UserRole;
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'completed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  code: string;
  description: string;
  client: string;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  priority: Priority;
  managerId: string;
  coverImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color?: string;
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  projectId: string;
  title: string;
  description: string;
  priority: Priority;
  assigneeIds: string[];
  dueDate?: string;
  startDate?: string;
  labels: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  overdueTasks: number;
  recentProjects: Project[];
  recentTasks: Task[];
  upcomingDeadlines: Task[];
  myTasks: Task[];
}
