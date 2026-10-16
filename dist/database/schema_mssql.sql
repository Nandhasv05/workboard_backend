-- Idempotent schema for SQL Server. Batches are separated by GO; run with `npm run db:migrate`.
-- Requires a login with CREATE/ALTER rights on the todo schema (the app's runtime login only needs read/write).

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'todo')
  EXEC('CREATE SCHEMA todo');
GO

-- todo.users is a read-only view over the portal's dbo.users, so foreign keys cannot point at it.
IF OBJECT_ID('todo.users', 'U') IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM todo.users)
    THROW 50000, 'todo.users is a table with rows; move them into dbo.users before replacing it with the view.', 1;

  DECLARE @dropFks NVARCHAR(MAX) = N'';
  SELECT @dropFks += N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id))
    + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
  FROM sys.foreign_keys
  WHERE referenced_object_id = OBJECT_ID('todo.users');
  EXEC sp_executesql @dropFks;

  DROP TABLE todo.users;
END
GO

-- Copy of the portal's user directory, refreshed by the API (services/portalUserSync.ts) when PORTAL_DB_HOST is set.
IF OBJECT_ID('todo.portal_users', 'U') IS NULL
CREATE TABLE todo.portal_users (
  id NVARCHAR(36) PRIMARY KEY,
  username NVARCHAR(256) NOT NULL,
  first_name NVARCHAR(256) NULL,
  last_name NVARCHAR(256) NULL,
  email NVARCHAR(256) NULL,
  role NVARCHAR(100) NULL,
  department NVARCHAR(256) NULL,
  emp_code NVARCHAR(100) NULL,
  is_active BIT NOT NULL DEFAULT 1,
  last_login_time DATETIME2 NULL,
  synced_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Dev reads todo.app_users (dbo.users on DATABASE_HOST).
-- Production reads todo.portal_directory, filled from PORTAL_DB_HOST dbo.users.
-- todo.users stays the dev directory so an older dev API keeps using DATABASE_HOST.
DECLARE @nameExpr NVARCHAR(400) = CASE
  WHEN COL_LENGTH('dbo.users', 'Firstname') IS NOT NULL AND COL_LENGTH('dbo.users', 'Lastname') IS NOT NULL
    THEN N'COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Firstname, N'' '', u.Lastname))), N''''), u.UserName)'
  ELSE N'u.UserName' END;
DECLARE @emailExpr NVARCHAR(400) = CASE
  WHEN COL_LENGTH('dbo.users', 'Emailid') IS NOT NULL
    THEN N'COALESCE(NULLIF(CAST(u.Emailid AS NVARCHAR(255)), N''''), NULLIF(CAST(u.Email AS NVARCHAR(255)), N''''))'
  ELSE N'NULLIF(CAST(u.Email AS NVARCHAR(255)), N'''')' END;
DECLARE @empCodeExpr NVARCHAR(400) = CASE
  WHEN COL_LENGTH('dbo.users', 'Empcode') IS NOT NULL THEN N'CAST(u.Empcode AS NVARCHAR(50))'
  ELSE N'CAST(NULL AS NVARCHAR(50))' END;

DECLARE @createAppUsers NVARCHAR(MAX) = N'CREATE OR ALTER VIEW todo.app_users AS
SELECT
  CAST(u.Id AS NVARCHAR(36)) COLLATE DATABASE_DEFAULT AS id,
  CAST(' + @nameExpr + N' AS NVARCHAR(512)) COLLATE DATABASE_DEFAULT AS name,
  CAST(u.UserName AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS username,
  CAST(' + @emailExpr + N' AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS email,
  CAST(LOWER(COALESCE(u.Role, ''user'')) AS NVARCHAR(100)) COLLATE DATABASE_DEFAULT AS role,
  CAST(u.Department AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS department,
  CAST(' + @empCodeExpr + N' AS NVARCHAR(100)) COLLATE DATABASE_DEFAULT AS emp_code,
  CAST(COALESCE(u.IsActive, 1) AS BIT) AS is_active,
  CAST(NULL AS NVARCHAR(500)) AS avatar_url,
  CAST(COALESCE(u.last_login_time, ''2026-01-01'') AS DATETIME2) AS created_at,
  CAST(COALESCE(u.last_login_time, ''2026-01-01'') AS DATETIME2) AS updated_at
FROM dbo.Users u;';
EXEC sp_executesql @createAppUsers;

EXEC(N'CREATE OR ALTER VIEW todo.portal_directory AS
SELECT
  p.id,
  CAST(COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(ISNULL(p.first_name, N''''), N'' '', ISNULL(p.last_name, N'''')))), N''''), p.username) AS NVARCHAR(512)) COLLATE DATABASE_DEFAULT AS name,
  CAST(p.username AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS username,
  CAST(p.email AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS email,
  CAST(LOWER(COALESCE(p.role, N''user'')) AS NVARCHAR(100)) COLLATE DATABASE_DEFAULT AS role,
  CAST(p.department AS NVARCHAR(256)) COLLATE DATABASE_DEFAULT AS department,
  CAST(p.emp_code AS NVARCHAR(100)) COLLATE DATABASE_DEFAULT AS emp_code,
  p.is_active,
  CAST(NULL AS NVARCHAR(500)) AS avatar_url,
  CAST(COALESCE(p.last_login_time, p.synced_at, ''2026-01-01'') AS DATETIME2) AS created_at,
  CAST(COALESCE(p.synced_at, ''2026-01-01'') AS DATETIME2) AS updated_at
FROM todo.portal_users p;');

EXEC(N'CREATE OR ALTER VIEW todo.users AS SELECT * FROM todo.app_users;');
GO

IF OBJECT_ID('todo.workspaces', 'U') IS NULL
CREATE TABLE todo.workspaces (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(160) NOT NULL,
  description NVARCHAR(MAX) NULL,
  owner_id NVARCHAR(36) NOT NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.workspace_members', 'U') IS NULL
CREATE TABLE todo.workspace_members (
  workspace_id INT NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

IF OBJECT_ID('todo.projects', 'U') IS NULL
CREATE TABLE todo.projects (
  id INT IDENTITY(1,1) PRIMARY KEY,
  workspace_id INT NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  code NVARCHAR(40) NOT NULL,
  description NVARCHAR(MAX) NULL,
  client NVARCHAR(160) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'planning',
  priority NVARCHAR(50) NOT NULL DEFAULT 'medium',
  manager_id NVARCHAR(36) NULL,
  owner_id NVARCHAR(36) NOT NULL,
  cover_image_url NVARCHAR(500) NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.project_members', 'U') IS NULL
CREATE TABLE todo.project_members (
  project_id INT NOT NULL FOREIGN KEY REFERENCES todo.projects(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

IF OBJECT_ID('todo.boards', 'U') IS NULL
CREATE TABLE todo.boards (
  id INT IDENTITY(1,1) PRIMARY KEY,
  project_id INT NOT NULL FOREIGN KEY REFERENCES todo.projects(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  background NVARCHAR(500) NULL,
  visibility NVARCHAR(50) NOT NULL DEFAULT 'public',
  access_code NVARCHAR(50) NULL,
  template NVARCHAR(50) NULL,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.board_members', 'U') IS NULL
CREATE TABLE todo.board_members (
  board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'member',
  created_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (board_id, user_id)
);

IF OBJECT_ID('todo.board_columns', 'U') IS NULL
CREATE TABLE todo.board_columns (
  id INT IDENTITY(1,1) PRIMARY KEY,
  board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  name NVARCHAR(160) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.tasks', 'U') IS NULL
CREATE TABLE todo.tasks (
  id INT IDENTITY(1,1) PRIMARY KEY,
  board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  column_id INT NULL FOREIGN KEY REFERENCES todo.board_columns(id) ON DELETE NO ACTION,
  project_id INT NOT NULL,
  title NVARCHAR(240) NOT NULL,
  description NVARCHAR(MAX) NULL,
  priority NVARCHAR(50) NOT NULL DEFAULT 'medium',
  start_date DATE NULL,
  due_date DATE NULL,
  due_time NVARCHAR(20) NULL,
  due_reminder NVARCHAR(50) NULL,
  recurring NVARCHAR(50) NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.task_assignees', 'U') IS NULL
CREATE TABLE todo.task_assignees (
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  created_at DATETIME2(6) NOT NULL,
  PRIMARY KEY (task_id, user_id)
);

IF OBJECT_ID('todo.labels', 'U') IS NULL
CREATE TABLE todo.labels (
  id INT IDENTITY(1,1) PRIMARY KEY,
  workspace_id INT NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
  name NVARCHAR(120) NOT NULL,
  color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
  created_at DATETIME2(6) NOT NULL,
  CONSTRAINT uq_todo_labels_workspace_name UNIQUE (workspace_id, name)
);

IF OBJECT_ID('todo.task_labels', 'U') IS NULL
CREATE TABLE todo.task_labels (
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  label_id INT NOT NULL FOREIGN KEY REFERENCES todo.labels(id) ON DELETE NO ACTION,
  PRIMARY KEY (task_id, label_id)
);

IF OBJECT_ID('todo.task_checklists', 'U') IS NULL
CREATE TABLE todo.task_checklists (
  id INT IDENTITY(1,1) PRIMARY KEY,
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  title NVARCHAR(160) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.task_checklist_items', 'U') IS NULL
CREATE TABLE todo.task_checklist_items (
  id INT IDENTITY(1,1) PRIMARY KEY,
  checklist_id INT NOT NULL FOREIGN KEY REFERENCES todo.task_checklists(id) ON DELETE CASCADE,
  title NVARCHAR(240) NOT NULL,
  completed BIT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  created_at DATETIME2(6) NOT NULL,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('todo.task_comments', 'U') IS NULL
CREATE TABLE todo.task_comments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  body NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2(6) NOT NULL
);

IF OBJECT_ID('todo.task_attachments', 'U') IS NULL
CREATE TABLE todo.task_attachments (
  id INT IDENTITY(1,1) PRIMARY KEY,
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  file_name NVARCHAR(255) NOT NULL,
  s3_key NVARCHAR(500) NOT NULL,
  url NVARCHAR(500) NOT NULL,
  file_type NVARCHAR(120) NOT NULL,
  file_size BIGINT NOT NULL,
  created_at DATETIME2(6) NOT NULL
);

IF OBJECT_ID('todo.task_activity_logs', 'U') IS NULL
CREATE TABLE todo.task_activity_logs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id NVARCHAR(36) NOT NULL,
  action NVARCHAR(80) NOT NULL,
  entity_type NVARCHAR(80) NOT NULL,
  entity_id NVARCHAR(50) NOT NULL,
  details NVARCHAR(MAX) NULL,
  created_at DATETIME2(6) NOT NULL
);

IF OBJECT_ID('todo.notifications', 'U') IS NULL
CREATE TABLE todo.notifications (
  id INT IDENTITY(1,1) PRIMARY KEY,
  user_id NVARCHAR(36) NOT NULL,
  type NVARCHAR(80) NOT NULL,
  title NVARCHAR(160) NOT NULL,
  message NVARCHAR(MAX) NOT NULL,
  read_at DATETIME2(6) NULL,
  created_at DATETIME2(6) NOT NULL
);
GO

IF OBJECT_ID('todo.column_members', 'U') IS NULL
CREATE TABLE todo.column_members (
  column_id INT NOT NULL FOREIGN KEY REFERENCES todo.board_columns(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'view',
  created_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (column_id, user_id)
);

IF OBJECT_ID('todo.task_members', 'U') IS NULL
CREATE TABLE todo.task_members (
  task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  role NVARCHAR(50) NOT NULL DEFAULT 'view',
  created_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (task_id, user_id)
);

IF COL_LENGTH('todo.task_attachments', 'description') IS NULL
  ALTER TABLE todo.task_attachments ADD description NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID('todo.board_access', 'U') IS NULL
CREATE TABLE todo.board_access (
  board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
  user_id NVARCHAR(36) NOT NULL,
  board_view BIT NOT NULL DEFAULT 0,
  board_delete BIT NOT NULL DEFAULT 0,
  list_create BIT NOT NULL DEFAULT 0,
  list_view BIT NOT NULL DEFAULT 0,
  list_delete BIT NOT NULL DEFAULT 0,
  card_create BIT NOT NULL DEFAULT 0,
  card_view BIT NOT NULL DEFAULT 0,
  card_delete BIT NOT NULL DEFAULT 0,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (board_id, user_id)
);
GO

IF OBJECT_ID('todo.workboard_permissions', 'U') IS NULL
CREATE TABLE todo.workboard_permissions (
  user_id NVARCHAR(36) NOT NULL PRIMARY KEY,
  board_create BIT NOT NULL DEFAULT 1,
  board_view BIT NOT NULL DEFAULT 1,
  board_delete BIT NOT NULL DEFAULT 1,
  list_create BIT NOT NULL DEFAULT 1,
  list_view BIT NOT NULL DEFAULT 1,
  list_delete BIT NOT NULL DEFAULT 1,
  card_create BIT NOT NULL DEFAULT 1,
  card_view BIT NOT NULL DEFAULT 1,
  card_delete BIT NOT NULL DEFAULT 1,
  updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Boards are created under the first project; make sure one exists.
DECLARE @owner NVARCHAR(36) = (
  SELECT TOP 1 id FROM todo.users WHERE is_active = 1
  ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, CAST(id AS INT)
);

IF NOT EXISTS (SELECT 1 FROM todo.workspaces)
  INSERT INTO todo.workspaces (name, description, owner_id, created_at, updated_at)
  VALUES (N'Customer Portal Workspace', N'Workspace for portal projects', @owner, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM todo.projects)
  INSERT INTO todo.projects (workspace_id, name, code, status, priority, manager_id, owner_id, created_at, updated_at)
  SELECT TOP 1 id, N'Customer Portal', 'EVOL', 'active', 'medium', @owner, @owner, SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM todo.workspaces ORDER BY created_at;
GO
