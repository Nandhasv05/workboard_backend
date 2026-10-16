import sql from 'mssql';
import env from '../config/env.js';
let mssqlPool = null;
const getMssqlPool = async () => {
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
    'workspace_members', 'project_members', 'board_members', 'column_members', 'task_members', 'board_columns', 'task_assignees',
    'task_labels', 'task_checklist_items', 'task_checklists', 'task_comments',
    'task_attachments', 'task_activity_logs', 'notifications', 'workspaces',
    'workboard_permissions', 'board_access', 'projects', 'boards', 'tasks', 'labels', 'users'
];
// Production sets PORTAL_DB_* and reads dbo.users from that server (copied into portal_directory).
// Dev leaves PORTAL_DB_HOST empty and reads dbo.users on DATABASE_HOST.
const usersTable = env.portalDb ? 'portal_directory' : 'app_users';
function transformForMssql(query) {
    let q = query;
    for (const table of TABLE_NAMES) {
        const target = table === 'users' ? usersTable : table;
        const regex = new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|TABLE)\\s+(?!\\[?todo\\]?\\.)(\\[?${table}\\]?)\\b`, 'gi');
        q = q.replace(regex, `$1 todo.${target}`);
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
export const execute = async (query, values = []) => {
    const sanitizedValues = values.map(val => {
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
            return val.slice(0, 19).replace('T', ' ');
        }
        return val;
    });
    const pool = await getMssqlPool();
    const request = pool.request();
    let pIdx = 0;
    const sqlText = transformForMssql(query).replace(/\?/g, () => `@p${pIdx++}`);
    sanitizedValues.forEach((val, idx) => {
        request.input(`p${idx}`, val === undefined ? null : val);
    });
    const result = await request.query(sqlText);
    return (result.recordset || []);
};
export const getConnection = getMssqlPool;
export const poolEnd = async () => {
    if (mssqlPool)
        await mssqlPool.close();
};
