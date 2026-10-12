import { execute } from '../database/pool.js';

type AggregateRow = { total?: number; active?: number; completed?: number; pending?: number; in_progress?: number; overdue?: number };

export const dashboardSummary = async (workspaceId: string) => {
  const [projects, tasks, userTasks] = await Promise.all([
    execute<AggregateRow>(`
      SELECT 
        COUNT(*) AS total, 
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active, 
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed 
      FROM projects 
      WHERE workspace_id = ?`, [workspaceId]),
    execute<AggregateRow>(`
      SELECT 
        COUNT(*) AS total, 
        SUM(CASE WHEN c.name IN ('To Do', 'Backlog') THEN 1 ELSE 0 END) AS pending, 
        SUM(CASE WHEN c.name IN ('In Progress', 'Review', 'Testing') THEN 1 ELSE 0 END) AS in_progress, 
        SUM(CASE WHEN c.name = 'Completed' THEN 1 ELSE 0 END) AS completed, 
        SUM(CASE WHEN t.due_date < CAST(GETDATE() AS DATE) AND (c.name IS NULL OR c.name <> 'Completed') THEN 1 ELSE 0 END) AS overdue 
      FROM tasks t
      LEFT JOIN board_columns c ON c.id = t.column_id
      WHERE t.project_id IN (SELECT id FROM projects WHERE workspace_id = ?)`, [workspaceId]),
    execute('SELECT t.* FROM tasks t JOIN task_assignees a ON a.task_id = t.id WHERE a.user_id = ? ORDER BY t.due_date ASC OFFSET 0 ROWS FETCH NEXT 6 ROWS ONLY', [workspaceId]),
  ]);
  return { totalProjects: Number(projects[0]?.total ?? 0), activeProjects: Number(projects[0]?.active ?? 0), completedProjects: Number(projects[0]?.completed ?? 0), totalTasks: Number(tasks[0]?.total ?? 0), pendingTasks: Number(tasks[0]?.pending ?? 0), inProgressTasks: Number(tasks[0]?.in_progress ?? 0), completedTasks: Number(tasks[0]?.completed ?? 0), overdueTasks: Number(tasks[0]?.overdue ?? 0), recentProjects: [], recentTasks: [], upcomingDeadlines: [], myTasks: userTasks };
};

export const workload = async (workspaceId: string) => execute(`SELECT u.id, u.name, COUNT(t.id) AS tasks, SUM(CASE WHEN t.position >= 0 THEN 1 ELSE 0 END) AS assigned FROM users u LEFT JOIN task_assignees a ON a.user_id = u.id LEFT JOIN tasks t ON t.id = a.task_id LEFT JOIN projects p ON p.id = t.project_id WHERE p.workspace_id = ? GROUP BY u.id, u.name ORDER BY tasks DESC`, [workspaceId]);
