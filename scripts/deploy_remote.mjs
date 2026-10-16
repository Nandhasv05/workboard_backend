import { Client } from 'ssh2';
import fs from 'fs';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import sql from 'mssql';

const TAR_LOCAL_PATH = 'c:/MAMP/htdocs/TodoList/deploy-package.tar.gz';
const PROD_ENV_PATH = 'c:/MAMP/htdocs/TodoList/backend/.env.production';
const REMOTE_DEST_DIR = '/var/www/html/Workboard/TodoList';
const REMOTE_TAR_PATH = '/tmp/todolist-deploy.tar.gz';

if (!fs.existsSync(PROD_ENV_PATH)) {
  console.error('backend/.env.production is missing; it holds the live settings and the DEPLOY_SSH_* login.');
  process.exit(1);
}
const prodEnv = dotenv.parse(fs.readFileSync(PROD_ENV_PATH));
const ssh = {
  host: prodEnv.DEPLOY_SSH_HOST,
  port: Number(prodEnv.DEPLOY_SSH_PORT || 22),
  username: prodEnv.DEPLOY_SSH_USER,
  password: prodEnv.DEPLOY_SSH_PASSWORD,
};
if (!ssh.host || !ssh.username || !ssh.password) {
  console.error('Set DEPLOY_SSH_HOST, DEPLOY_SSH_USER and DEPLOY_SSH_PASSWORD in backend/.env.production.');
  process.exit(1);
}

console.log(`Checking production database ${prodEnv.DATABASE_HOST}/${prodEnv.DATABASE_NAME} as ${prodEnv.DATABASE_USER}...`);
try {
  const pool = await new sql.ConnectionPool({
    server: prodEnv.DATABASE_HOST,
    port: Number(prodEnv.DATABASE_PORT || 1433),
    database: prodEnv.DATABASE_NAME,
    user: prodEnv.DATABASE_USER,
    password: prodEnv.DATABASE_PASSWORD,
    options: { encrypt: prodEnv.DATABASE_SSL === 'true', trustServerCertificate: true },
  }).connect();
  const { recordset: [schema] } = await pool.request().query(
    "SELECT OBJECT_ID('todo.board_members') AS board_members, OBJECT_ID('todo.column_members') AS column_members, OBJECT_ID('todo.task_members') AS task_members, OBJECTPROPERTY(OBJECT_ID('todo.app_users'), 'IsView') AS app_users_is_view, OBJECTPROPERTY(OBJECT_ID('todo.portal_directory'), 'IsView') AS portal_directory_is_view, OBJECT_ID('todo.workboard_permissions') AS workboard_permissions, OBJECT_ID('todo.board_access') AS board_access, COL_LENGTH('todo.boards', 'access_code') AS access_code, COL_LENGTH('todo.task_attachments', 'description') AS attachment_description"
  );
  await pool.close();
  if (!schema.board_members || !schema.column_members || !schema.task_members || !schema.app_users_is_view || !schema.portal_directory_is_view || !schema.workboard_permissions || !schema.board_access || !schema.access_code || schema.attachment_description == null) {
    throw new Error('the todo schema is not migrated there; run backend/src/database/schema_mssql.sql with an admin login first');
  }
  console.log('Production database schema OK.');
} catch (e) {
  console.error('Production database check failed:', e.message);
  process.exit(1);
}
if (process.argv.includes('--check')) process.exit(0);

console.log('Packaging latest build for deployment...');
try {
  execSync('tar -czf deploy-package.tar.gz --exclude="node_modules" --exclude=".git" --exclude="deploy-package.tar.gz" backend frontend index.php .htaccess evolv-logo.png', {
    cwd: 'c:/MAMP/htdocs/TodoList',
    stdio: 'inherit'
  });
} catch (e) {
  console.error('Packaging failed:', e.message);
  process.exit(1);
}

console.log(`Connecting to remote server at ${ssh.host}...`);
const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP Error:', err);
      conn.end();
      return;
    }
    const readStream = fs.createReadStream(TAR_LOCAL_PATH);
    const writeStream = sftp.createWriteStream(REMOTE_TAR_PATH);
    writeStream.on('close', () => {
      fs.unlinkSync(TAR_LOCAL_PATH);
      const bashScript = `
        set -e
        echo "=== EXTRACTING FILES ==="
        mkdir -p ${REMOTE_DEST_DIR}
        rm -rf ${REMOTE_DEST_DIR}/backend/src ${REMOTE_DEST_DIR}/backend/dist ${REMOTE_DEST_DIR}/backend/scripts ${REMOTE_DEST_DIR}/frontend/src ${REMOTE_DEST_DIR}/frontend/dist
        tar -xzf ${REMOTE_TAR_PATH} -C ${REMOTE_DEST_DIR}/
        grep -v '^DEPLOY_' ${REMOTE_DEST_DIR}/backend/.env.production > ${REMOTE_DEST_DIR}/backend/.env
        rm -f ${REMOTE_DEST_DIR}/backend/.env.production

        echo "=== COPYING PRODUCTION FRONTEND BUILD ==="
        cp -rf ${REMOTE_DEST_DIR}/frontend/dist/* ${REMOTE_DEST_DIR}/
        for f in ${REMOTE_DEST_DIR}/assets/index-*; do
          grep -q "$(basename "$f")" ${REMOTE_DEST_DIR}/index.html || rm -f "$f"
        done
        if [ -f "${REMOTE_DEST_DIR}/.htaccess" ]; then chmod 644 ${REMOTE_DEST_DIR}/.htaccess; fi

        echo "=== UPLOADS ==="
        mkdir -p ${REMOTE_DEST_DIR}/backend/uploads
        chmod 777 ${REMOTE_DEST_DIR}/backend/uploads
        ln -sfn ${REMOTE_DEST_DIR}/backend/uploads ${REMOTE_DEST_DIR}/uploads

        echo "=== INSTALLING BACKEND DEPENDENCIES ==="
        cd ${REMOTE_DEST_DIR}/backend
        npm install --omit=dev

        echo "=== RESTARTING WORKBOARD-API ==="
        pm2 delete workboard-api 2>/dev/null || true
        pm2 start --name "workboard-api" "dist/server.js" --cwd "${REMOTE_DEST_DIR}/backend"
        pm2 save
        sleep 3
        echo "=== HEALTH ==="
        curl -s http://127.0.0.1:4000/api/health || echo "health waiting"
        rm -f ${REMOTE_TAR_PATH}
        echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
      `;
      conn.exec(bashScript, (execErr, stream) => {
        if (execErr) {
          console.error('Exec error:', execErr);
          conn.end();
          return;
        }
        stream.on('close', (code) => {
          console.log(`Remote process finished with code ${code}`);
          conn.end();
          process.exit(code ?? 0);
        }).on('data', (data) => process.stdout.write(data))
          .stderr.on('data', (data) => process.stderr.write(data));
      });
    });
    writeStream.on('error', (uploadErr) => {
      console.error('Upload error:', uploadErr);
      conn.end();
    });
    readStream.pipe(writeStream);
  });
}).on('error', (connErr) => {
  console.error(`Connection to ${ssh.host} failed:`, connErr.message || connErr);
  process.exit(1);
}).connect({ ...ssh, readyTimeout: 15000 });
