import sql from 'mssql';
import mysql from 'mysql2/promise';
import env from '../config/env.js';

const isMssql = env.database.port === 1433 || process.env.DATABASE_CLIENT === 'mssql';

let mysqlPool: mysql.Pool | null = null;
let mssqlPool: sql.ConnectionPool | null = null;

if (!isMssql) {
  mysqlPool = mysql.createPool({
    host: env.database.host,
    port: env.database.port,
    database: env.database.name,
    user: env.database.user,
    password: env.database.password,
    waitForConnections: true,
    connectionLimit: env.database.poolSize,
    queueLimit: 0,
    ssl: env.database.ssl ? { rejectUnauthorized: true } : undefined,
    timezone: 'Z',
  });
}

const getMssqlPool = async (): Promise<sql.ConnectionPool> => {
  if (!mssqlPool || !mssqlPool.connected) {
    mssqlPool = await new sql.ConnectionPool({
      server: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
      options: {
        encrypt: env.database.ssl,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: {
        max: env.database.poolSize,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    }).connect();
  }
  return mssqlPool;
};

const TABLE_NAMES = [
  'workspace_members', 'project_members', 'board_members', 'board_columns', 'task_assignees',
  'task_labels', 'task_checklist_items', 'task_checklists', 'task_comments',
  'task_attachments', 'task_activity_logs', 'notifications', 'workspaces',
  'projects', 'boards', 'tasks', 'labels', 'users'
];

function transformForMssql(query: string): string {
  let q = query;
  for (const table of TABLE_NAMES) {
    const regex = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE)\\s+(?!\\[?todo\\]?\\.)(\\[?${table}\\]?)\\b`, 'gi');
    q = q.replace(regex, `$1 todo.$2`);
  }
  q = q.replace(/=\s*"([^"]*)"/g, "='$1'");
  q = q.replace(/!=\s*"([^"]*)"/g, "<>'$1'");
  q = q.replace(/<>\s*"([^"]*)"/g, "<>'$1'");
  q = q.replace(/"([^"]*)"/g, "'$1'");
  if (/\bORDER BY\b/i.test(q) && /\bLIMIT\s+(\d+)\b/i.test(q)) {
    q = q.replace(/\bLIMIT\s+(\d+)\b/i, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY');
  }
  return q;
}

export const execute = async <T>(query: string, values: unknown[] = []): Promise<T[]> => {
  const sanitizedValues = values.map(val => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return val.slice(0, 19).replace('T', ' ');
    }
    return val;
  });

  if (isMssql) {
    const pool = await getMssqlPool();
    const request = pool.request();
    let pIdx = 0;
    const transformed = transformForMssql(query);
    const sqlText = transformed.replace(/\?/g, () => `@p${pIdx++}`);

    sanitizedValues.forEach((val, idx) => {
      request.input(`p${idx}`, val === undefined ? null : val);
    });

    const result = await request.query(sqlText);
    return (result.recordset || []) as T[];
  }

  if (!mysqlPool) throw new Error('MySQL pool not initialized');
  const [rows] = await mysqlPool.execute(query, sanitizedValues as never[]);
  return rows as T[];
};

export const getConnection = async () => {
  if (isMssql) {
    return getMssqlPool();
  }
  if (!mysqlPool) throw new Error('MySQL pool not initialized');
  return mysqlPool.getConnection();
};

export const poolEnd = async () => {
  if (mssqlPool) await mssqlPool.close();
  if (mysqlPool) await mysqlPool.end();
};
