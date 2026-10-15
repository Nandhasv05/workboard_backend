import sql from 'mssql';
import env from '../config/env.js';
import { getConnection } from '../database/pool.js';

interface SourceUser {
  Id: number | string;
  UserName: string;
  Firstname: string | null;
  Lastname: string | null;
  Email: string | null;
  Emailid: string | null;
  Role: string | null;
  Department: string | null;
  Empcode: string | null;
  IsActive: boolean | number | null;
  last_login_time: Date | null;
}

const COLUMNS = ['id', 'username', 'first_name', 'last_name', 'email', 'role', 'department', 'emp_code', 'is_active', 'last_login_time'] as const;
// SQL Server allows 2100 parameters per request.
const ROWS_PER_INSERT = 150;

const blankToNull = (value: unknown) => {
  const text = value == null ? '' : String(value).trim();
  return text === '' ? null : text;
};

const readSourceUsers = async (): Promise<SourceUser[]> => {
  const cfg = env.portalDb!;
  const pool = await new sql.ConnectionPool({
    server: cfg.host,
    port: cfg.port,
    database: cfg.name,
    user: cfg.user,
    password: cfg.password,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  try {
    const result = await pool.request().query<SourceUser>(
      'SELECT Id, UserName, Firstname, Lastname, Email, Emailid, Role, Department, Empcode, IsActive, last_login_time FROM dbo.users WHERE UserName IS NOT NULL'
    );
    return result.recordset;
  } finally {
    await pool.close();
  }
};

export const syncPortalUsers = async () => {
  const users = await readSourceUsers();
  if (users.length === 0) throw new Error('Portal user directory returned no users');

  const rows = users.map(u => [
    String(u.Id),
    String(u.UserName).trim(),
    blankToNull(u.Firstname),
    blankToNull(u.Lastname),
    blankToNull(u.Emailid) ?? blankToNull(u.Email),
    blankToNull(u.Role),
    blankToNull(u.Department),
    blankToNull(u.Empcode),
    u.IsActive == null ? true : Boolean(u.IsActive),
    u.last_login_time,
  ]);

  const pool = await getConnection();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query('DELETE FROM todo.portal_users');
    for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
      const request = new sql.Request(tx);
      const values = rows.slice(start, start + ROWS_PER_INSERT).map((row, r) =>
        `(${row.map((value, c) => {
          const name = `p${r}_${c}`;
          request.input(name, value);
          return `@${name}`;
        }).join(', ')}, SYSUTCDATETIME())`
      );
      await request.query(`INSERT INTO todo.portal_users (${COLUMNS.join(', ')}, synced_at) VALUES ${values.join(', ')}`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
  return rows.length;
};

export const startPortalUserSync = () => {
  if (!env.portalDb) return;
  const run = () => syncPortalUsers()
    .then(count => console.log(`[PortalUserSync] Synced ${count} portal users`))
    .catch(err => console.error('[PortalUserSync] Failed:', err?.message || err));
  void run();
  setInterval(run, env.portalDb.syncMinutes * 60 * 1000).unref();
};
