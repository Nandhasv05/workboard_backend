IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'todo')
    EXEC('CREATE SCHEMA todo');

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'users')
CREATE TABLE todo.users (
  id NVARCHAR(36) PRIMARY KEY,
  name NVARCHAR(120) NOT NULL,
  email NVARCHAR(254) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
  avatar_url NVARCHAR(500) NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'workspaces')
CREATE TABLE todo.workspaces (
  id NVARCHAR(36) PRIMARY KEY,
  name NVARCHAR(160) NOT NULL,
  description NVARCHAR(MAX) NULL,
  owner_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE CASCADE,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'workspace_members')
CREATE TABLE todo.workspace_members (
  workspace_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT fk_todo_wm_user FOREIGN KEY (user_id) REFERENCES todo.users(id) ON DELETE NO ACTION
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'projects')
CREATE TABLE todo.projects (
  id NVARCHAR(36) PRIMARY KEY,
  workspace_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  code NVARCHAR(40) NOT NULL,
  description NVARCHAR(MAX) NULL,
  client NVARCHAR(160) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'planning',
  priority NVARCHAR(50) NOT NULL DEFAULT 'medium',
  manager_id NVARCHAR(36) NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  owner_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  cover_image_url NVARCHAR(500) NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'project_members')
CREATE TABLE todo.project_members (
  project_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.projects(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'boards')
CREATE TABLE todo.boards (
  id NVARCHAR(36) PRIMARY KEY,
  project_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.projects(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'board_columns')
CREATE TABLE todo.board_columns (
  id NVARCHAR(36) PRIMARY KEY,
  board_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'tasks')
CREATE TABLE todo.tasks (
  id NVARCHAR(36) PRIMARY KEY,
  board_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  column_id NVARCHAR(36) NULL FOREIGN KEY REFERENCES todo.board_columns(id) ON DELETE NO ACTION,
  project_id NVARCHAR(36) NOT NULL,
  title NVARCHAR(240) NOT NULL,
  description NVARCHAR(MAX) NULL,
  priority NVARCHAR(50) NOT NULL DEFAULT 'medium',
  start_date DATE NULL,
  due_date DATE NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_assignees')
CREATE TABLE todo.task_assignees (
  task_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (task_id, user_id)
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'labels')
CREATE TABLE todo.labels (
  id NVARCHAR(36) PRIMARY KEY,
  workspace_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  name NVARCHAR(120) NOT NULL,
  color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
  created_at DATETIME2(6) NOT NULL,
  CONSTRAINT uq_todo_labels_workspace_name UNIQUE (workspace_id, name)
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_labels')
CREATE TABLE todo.task_labels (
  task_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  label_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.labels(id) ON DELETE NO ACTION,
  PRIMARY KEY (task_id, label_id)
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_checklists')
CREATE TABLE todo.task_checklists (
  id NVARCHAR(36) PRIMARY KEY,
  task_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  title NVARCHAR(160) NOT NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_checklist_items')
CREATE TABLE todo.task_checklist_items (
  id NVARCHAR(36) PRIMARY KEY,
  checklist_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.task_checklists(id) ON DELETE CASCADE,
  title NVARCHAR(240) NOT NULL,
  completed BIT NOT NULL DEFAULT 0,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_comments')
CREATE TABLE todo.task_comments (
  id NVARCHAR(36) PRIMARY KEY,
  task_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2(6) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_attachments')
CREATE TABLE todo.task_attachments (
  id NVARCHAR(36) PRIMARY KEY,
  task_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  file_name NVARCHAR(255) NOT NULL,
  s3_key NVARCHAR(500) NOT NULL,
  url NVARCHAR(500) NOT NULL,
  file_type NVARCHAR(120) NOT NULL,
  file_size BIGINT NOT NULL,
  created_at DATETIME2(6) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'task_activity_logs')
CREATE TABLE todo.task_activity_logs (
  id NVARCHAR(36) PRIMARY KEY,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE NO ACTION,
  action NVARCHAR(80) NOT NULL,
  entity_type NVARCHAR(80) NOT NULL,
  entity_id NVARCHAR(36) NOT NULL,
  details NVARCHAR(MAX) NULL,
  created_at DATETIME2(6) NOT NULL
);

IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'todo' AND t.name = 'notifications')
CREATE TABLE todo.notifications (
  id NVARCHAR(36) PRIMARY KEY,
  user_id NVARCHAR(36) NOT NULL FOREIGN KEY REFERENCES todo.users(id) ON DELETE CASCADE,
  type NVARCHAR(80) NOT NULL,
  title NVARCHAR(160) NOT NULL,
  message NVARCHAR(MAX) NOT NULL,
  read_at DATETIME2(6) NULL,
  created_at DATETIME2(6) NOT NULL
);
