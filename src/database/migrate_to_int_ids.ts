import { execute, getConnection } from './pool.js';

async function migrate() {
  console.log('--- Step 1: Fetching current data ---');
  
  const workspaces = await execute<any>('SELECT * FROM todo.workspaces ORDER BY created_at ASC');
  const workspace_members = await execute<any>('SELECT * FROM todo.workspace_members');
  const projects = await execute<any>('SELECT * FROM todo.projects ORDER BY created_at ASC');
  const project_members = await execute<any>('SELECT * FROM todo.project_members');
  const boards = await execute<any>('SELECT * FROM todo.boards ORDER BY created_at ASC');
  const board_members = await execute<any>('SELECT * FROM todo.board_members');
  const board_columns = await execute<any>('SELECT * FROM todo.board_columns ORDER BY position ASC, created_at ASC');
  const tasks = await execute<any>('SELECT * FROM todo.tasks ORDER BY position ASC, created_at ASC');
  const task_assignees = await execute<any>('SELECT * FROM todo.task_assignees');
  const labels = await execute<any>('SELECT * FROM todo.labels');
  const task_labels = await execute<any>('SELECT * FROM todo.task_labels');
  const task_checklists = await execute<any>('SELECT * FROM todo.task_checklists ORDER BY created_at ASC');
  const task_checklist_items = await execute<any>('SELECT * FROM todo.task_checklist_items ORDER BY created_at ASC');
  const task_comments = await execute<any>('SELECT * FROM todo.task_comments ORDER BY created_at ASC');
  const task_attachments = await execute<any>('SELECT * FROM todo.task_attachments ORDER BY created_at ASC');
  const task_activity_logs = await execute<any>('SELECT * FROM todo.task_activity_logs ORDER BY created_at ASC');
  const notifications = await execute<any>('SELECT * FROM todo.notifications ORDER BY created_at ASC');

  console.log(`Fetched:
  - ${workspaces.length} workspaces
  - ${projects.length} projects
  - ${boards.length} boards
  - ${board_columns.length} columns
  - ${tasks.length} tasks
  - ${board_members.length} board_members
  - ${task_assignees.length} task_assignees
  - ${labels.length} labels
  - ${task_labels.length} task_labels
  - ${task_checklists.length} checklists
  - ${task_checklist_items.length} checklist items
  - ${task_attachments.length} attachments
  - ${task_activity_logs.length} activity logs
  - ${notifications.length} notifications`);

  // Build ID Maps
  const wsMap = new Map<string, number>();
  workspaces.forEach((w, idx) => wsMap.set(w.id, idx + 1));

  const projMap = new Map<string, number>();
  projects.forEach((p, idx) => projMap.set(p.id, idx + 1));

  const boardMap = new Map<string, number>();
  boards.forEach((b, idx) => boardMap.set(b.id, idx + 1));

  const colMap = new Map<string, number>();
  board_columns.forEach((c, idx) => colMap.set(c.id, idx + 1));

  const taskMap = new Map<string, number>();
  tasks.forEach((t, idx) => taskMap.set(t.id, idx + 1));

  const labelMap = new Map<string, number>();
  labels.forEach((l, idx) => labelMap.set(l.id, idx + 1));

  const clMap = new Map<string, number>();
  task_checklists.forEach((c, idx) => clMap.set(c.id, idx + 1));

  const cliMap = new Map<string, number>();
  task_checklist_items.forEach((item, idx) => cliMap.set(item.id, idx + 1));

  const attMap = new Map<string, number>();
  task_attachments.forEach((a, idx) => attMap.set(a.id, idx + 1));

  const actMap = new Map<string, number>();
  task_activity_logs.forEach((a, idx) => actMap.set(a.id, idx + 1));

  const notifMap = new Map<string, number>();
  notifications.forEach((n, idx) => notifMap.set(n.id, idx + 1));

  console.log('--- Step 2: Dropping existing tables and constraints ---');
  const pool = await getConnection();

  const dropScript = `
    DECLARE @sql NVARCHAR(MAX) = N'';
    SELECT @sql += N'ALTER TABLE ' + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id))
      + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'
    FROM sys.foreign_keys
    WHERE OBJECT_SCHEMA_NAME(referenced_object_id) = 'todo' OR OBJECT_SCHEMA_NAME(parent_object_id) = 'todo';
    EXEC sp_executesql @sql;

    DROP TABLE IF EXISTS todo.task_activity_logs;
    DROP TABLE IF EXISTS todo.notifications;
    DROP TABLE IF EXISTS todo.task_attachments;
    DROP TABLE IF EXISTS todo.task_comments;
    DROP TABLE IF EXISTS todo.task_checklist_items;
    DROP TABLE IF EXISTS todo.task_checklists;
    DROP TABLE IF EXISTS todo.task_labels;
    DROP TABLE IF EXISTS todo.labels;
    DROP TABLE IF EXISTS todo.task_assignees;
    DROP TABLE IF EXISTS todo.tasks;
    DROP TABLE IF EXISTS todo.board_columns;
    DROP TABLE IF EXISTS todo.board_members;
    DROP TABLE IF EXISTS todo.boards;
    DROP TABLE IF EXISTS todo.project_members;
    DROP TABLE IF EXISTS todo.projects;
    DROP TABLE IF EXISTS todo.workspace_members;
    DROP TABLE IF EXISTS todo.workspaces;
  `;
  await pool.request().query(dropScript);
  console.log('Dropped old tables.');

  console.log('--- Step 3: Recreating tables with INT IDENTITY(1,1) ---');
  const createScript = `
    CREATE TABLE todo.workspaces (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(160) NOT NULL,
      description NVARCHAR(MAX) NULL,
      owner_id NVARCHAR(36) NOT NULL,
      created_at DATETIME2(6) NOT NULL,
      updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE todo.workspace_members (
      workspace_id INT NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
      user_id NVARCHAR(36) NOT NULL,
      role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
      created_at DATETIME2(6) NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );

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

    CREATE TABLE todo.project_members (
      project_id INT NOT NULL FOREIGN KEY REFERENCES todo.projects(id) ON DELETE CASCADE,
      user_id NVARCHAR(36) NOT NULL,
      role NVARCHAR(50) NOT NULL DEFAULT 'viewer',
      created_at DATETIME2(6) NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );

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

    CREATE TABLE todo.board_members (
      board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
      user_id NVARCHAR(36) NOT NULL,
      role NVARCHAR(50) NOT NULL DEFAULT 'member',
      created_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME(),
      PRIMARY KEY (board_id, user_id)
    );

    CREATE TABLE todo.board_columns (
      id INT IDENTITY(1,1) PRIMARY KEY,
      board_id INT NOT NULL FOREIGN KEY REFERENCES todo.boards(id) ON DELETE CASCADE,
      name NVARCHAR(160) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
      created_at DATETIME2(6) NOT NULL,
      updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
    );

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

    CREATE TABLE todo.task_assignees (
      task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
      user_id NVARCHAR(36) NOT NULL,
      created_at DATETIME2(6) NOT NULL,
      PRIMARY KEY (task_id, user_id)
    );

    CREATE TABLE todo.labels (
      id INT IDENTITY(1,1) PRIMARY KEY,
      workspace_id INT NOT NULL FOREIGN KEY REFERENCES todo.workspaces(id) ON DELETE CASCADE,
      name NVARCHAR(120) NOT NULL,
      color NVARCHAR(20) NOT NULL DEFAULT '#6c63ff',
      created_at DATETIME2(6) NOT NULL,
      CONSTRAINT uq_todo_labels_workspace_name UNIQUE (workspace_id, name)
    );

    CREATE TABLE todo.task_labels (
      task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
      label_id INT NOT NULL FOREIGN KEY REFERENCES todo.labels(id) ON DELETE NO ACTION,
      PRIMARY KEY (task_id, label_id)
    );

    CREATE TABLE todo.task_checklists (
      id INT IDENTITY(1,1) PRIMARY KEY,
      task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
      title NVARCHAR(160) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      created_at DATETIME2(6) NOT NULL,
      updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE todo.task_checklist_items (
      id INT IDENTITY(1,1) PRIMARY KEY,
      checklist_id INT NOT NULL FOREIGN KEY REFERENCES todo.task_checklists(id) ON DELETE CASCADE,
      title NVARCHAR(240) NOT NULL,
      completed BIT NOT NULL DEFAULT 0,
      position INT NOT NULL DEFAULT 0,
      created_at DATETIME2(6) NOT NULL,
      updated_at DATETIME2(6) NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE TABLE todo.task_comments (
      id INT IDENTITY(1,1) PRIMARY KEY,
      task_id INT NOT NULL FOREIGN KEY REFERENCES todo.tasks(id) ON DELETE CASCADE,
      user_id NVARCHAR(36) NOT NULL,
      body NVARCHAR(MAX) NOT NULL,
      created_at DATETIME2(6) NOT NULL
    );

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

    CREATE TABLE todo.task_activity_logs (
      id INT IDENTITY(1,1) PRIMARY KEY,
      user_id NVARCHAR(36) NOT NULL,
      action NVARCHAR(80) NOT NULL,
      entity_type NVARCHAR(80) NOT NULL,
      entity_id NVARCHAR(50) NOT NULL,
      details NVARCHAR(MAX) NULL,
      created_at DATETIME2(6) NOT NULL
    );

    CREATE TABLE todo.notifications (
      id INT IDENTITY(1,1) PRIMARY KEY,
      user_id NVARCHAR(36) NOT NULL,
      type NVARCHAR(80) NOT NULL,
      title NVARCHAR(160) NOT NULL,
      message NVARCHAR(MAX) NOT NULL,
      read_at DATETIME2(6) NULL,
      created_at DATETIME2(6) NOT NULL
    );
  `;
  await pool.request().query(createScript);
  console.log('Recreated tables with INT IDENTITY.');

  console.log('--- Step 4: Inserting mapped records with IDENTITY_INSERT ---');

  // Workspaces
  if (workspaces.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.workspaces ON;');
    for (const w of workspaces) {
      const newId = wsMap.get(w.id)!;
      await execute('INSERT INTO todo.workspaces (id, name, description, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
        newId, w.name, w.description, w.owner_id, w.created_at, w.updated_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.workspaces OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.workspaces', RESEED, ${workspaces.length});`);
  }

  // Workspace members
  for (const wm of workspace_members) {
    const newWsId = wsMap.get(wm.workspace_id);
    if (newWsId) {
      await execute('INSERT INTO todo.workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [
        newWsId, wm.user_id, wm.role, wm.created_at
      ]);
    }
  }

  // Projects
  if (projects.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.projects ON;');
    for (const p of projects) {
      const newId = projMap.get(p.id)!;
      const newWsId = wsMap.get(p.workspace_id) || 1;
      await execute('INSERT INTO todo.projects (id, workspace_id, name, code, description, client, start_date, end_date, status, priority, manager_id, owner_id, cover_image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        newId, newWsId, p.name, p.code, p.description, p.client, p.start_date, p.end_date, p.status, p.priority, p.manager_id, p.owner_id, p.cover_image_url, p.created_at, p.updated_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.projects OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.projects', RESEED, ${projects.length});`);
  }

  // Project members
  for (const pm of project_members) {
    const newProjId = projMap.get(pm.project_id);
    if (newProjId) {
      await execute('INSERT INTO todo.project_members (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [
        newProjId, pm.user_id, pm.role, pm.created_at
      ]);
    }
  }

  // Boards
  if (boards.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.boards ON;');
    for (const b of boards) {
      const newId = boardMap.get(b.id)!;
      const newProjId = projMap.get(b.project_id) || 1;
      await execute('INSERT INTO todo.boards (id, project_id, name, background, visibility, access_code, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        newId, newProjId, b.name, b.background, b.visibility, b.access_code, b.template, b.created_at, b.updated_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.boards OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.boards', RESEED, ${boards.length});`);
  }

  // Board members
  for (const bm of board_members) {
    const newBoardId = boardMap.get(bm.board_id);
    if (newBoardId) {
      await execute('INSERT INTO todo.board_members (board_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [
        newBoardId, bm.user_id, bm.role, bm.created_at
      ]);
    }
  }

  // Board columns
  if (board_columns.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.board_columns ON;');
    for (const c of board_columns) {
      const newId = colMap.get(c.id)!;
      const newBoardId = boardMap.get(c.board_id);
      if (newBoardId) {
        await execute('INSERT INTO todo.board_columns (id, board_id, name, position, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          newId, newBoardId, c.name, c.position, c.color, c.created_at, c.updated_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.board_columns OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.board_columns', RESEED, ${board_columns.length});`);
  }

  // Tasks
  if (tasks.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.tasks ON;');
    for (const t of tasks) {
      const newId = taskMap.get(t.id)!;
      const newBoardId = boardMap.get(t.board_id);
      const newColId = colMap.get(t.column_id) || null;
      const newProjId = projMap.get(t.project_id) || 1;
      if (newBoardId) {
        await execute('INSERT INTO todo.tasks (id, board_id, column_id, project_id, title, description, priority, start_date, due_date, due_time, due_reminder, recurring, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          newId, newBoardId, newColId, newProjId, t.title, t.description, t.priority, t.start_date, t.due_date, t.due_time, t.due_reminder, t.recurring, t.position, t.created_at, t.updated_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.tasks OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.tasks', RESEED, ${tasks.length});`);
  }

  // Task assignees
  for (const ta of task_assignees) {
    const newTaskId = taskMap.get(ta.task_id);
    if (newTaskId) {
      await execute('INSERT INTO todo.task_assignees (task_id, user_id, created_at) VALUES (?, ?, ?)', [
        newTaskId, ta.user_id, ta.created_at
      ]);
    }
  }

  // Labels
  if (labels.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.labels ON;');
    for (const l of labels) {
      const newId = labelMap.get(l.id)!;
      const newWsId = wsMap.get(l.workspace_id) || 1;
      await execute('INSERT INTO todo.labels (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)', [
        newId, newWsId, l.name, l.color, l.created_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.labels OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.labels', RESEED, ${labels.length});`);
  }

  // Task labels
  for (const tl of task_labels) {
    const newTaskId = taskMap.get(tl.task_id);
    const newLabelId = labelMap.get(tl.label_id);
    if (newTaskId && newLabelId) {
      await execute('INSERT INTO todo.task_labels (task_id, label_id) VALUES (?, ?)', [
        newTaskId, newLabelId
      ]);
    }
  }

  // Task Checklists
  if (task_checklists.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.task_checklists ON;');
    for (const tc of task_checklists) {
      const newId = clMap.get(tc.id)!;
      const newTaskId = taskMap.get(tc.task_id);
      if (newTaskId) {
        await execute('INSERT INTO todo.task_checklists (id, task_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [
          newId, newTaskId, tc.title, tc.position ?? 0, tc.created_at, tc.updated_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.task_checklists OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.task_checklists', RESEED, ${task_checklists.length});`);
  }

  // Task Checklist Items
  if (task_checklist_items.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.task_checklist_items ON;');
    for (const tci of task_checklist_items) {
      const newId = cliMap.get(tci.id)!;
      const newClId = clMap.get(tci.checklist_id);
      if (newClId) {
        await execute('INSERT INTO todo.task_checklist_items (id, checklist_id, title, completed, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          newId, newClId, tci.title, tci.completed ? 1 : 0, tci.position ?? 0, tci.created_at, tci.updated_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.task_checklist_items OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.task_checklist_items', RESEED, ${task_checklist_items.length});`);
  }

  // Task Comments
  if (task_comments.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.task_comments ON;');
    for (const [idx, c] of task_comments.entries()) {
      const newTaskId = taskMap.get(c.task_id);
      if (newTaskId) {
        await execute('INSERT INTO todo.task_comments (id, task_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [
          idx + 1, newTaskId, c.user_id, c.body, c.created_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.task_comments OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.task_comments', RESEED, ${task_comments.length});`);
  }

  // Task Attachments
  if (task_attachments.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.task_attachments ON;');
    for (const a of task_attachments) {
      const newId = attMap.get(a.id)!;
      const newTaskId = taskMap.get(a.task_id);
      if (newTaskId) {
        await execute('INSERT INTO todo.task_attachments (id, task_id, user_id, file_name, s3_key, url, file_type, file_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          newId, newTaskId, a.user_id, a.file_name, a.s3_key, a.url, a.file_type, a.file_size, a.created_at
        ]);
      }
    }
    await pool.request().query('SET IDENTITY_INSERT todo.task_attachments OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.task_attachments', RESEED, ${task_attachments.length});`);
  }

  // Task Activity Logs
  if (task_activity_logs.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.task_activity_logs ON;');
    for (const a of task_activity_logs) {
      const newId = actMap.get(a.id)!;
      const mappedEntityId = taskMap.get(a.entity_id) ? String(taskMap.get(a.entity_id)) : (boardMap.get(a.entity_id) ? String(boardMap.get(a.entity_id)) : a.entity_id);
      await execute('INSERT INTO todo.task_activity_logs (id, user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        newId, a.user_id, a.action, a.entity_type, mappedEntityId, a.details, a.created_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.task_activity_logs OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.task_activity_logs', RESEED, ${task_activity_logs.length});`);
  }

  // Notifications
  if (notifications.length > 0) {
    await pool.request().query('SET IDENTITY_INSERT todo.notifications ON;');
    for (const n of notifications) {
      const newId = notifMap.get(n.id)!;
      await execute('INSERT INTO todo.notifications (id, user_id, type, title, message, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        newId, n.user_id, n.type, n.title, n.message, n.read_at, n.created_at
      ]);
    }
    await pool.request().query('SET IDENTITY_INSERT todo.notifications OFF;');
    await pool.request().query(`DBCC CHECKIDENT('todo.notifications', RESEED, ${notifications.length});`);
  }

  console.log('--- Migration completed successfully! All tables now use INT IDENTITY(1,1) starting from 1, 2, 3... ---');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
