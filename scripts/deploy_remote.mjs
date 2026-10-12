import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

import { execSync } from 'child_process';

const TAR_LOCAL_PATH = 'c:/MAMP/htdocs/TodoList/deploy-package.tar.gz';
const REMOTE_DEST_DIR = '/var/www/html/Evolv-Application/TodoList';
const REMOTE_TAR_PATH = '/tmp/todolist-deploy.tar.gz';

console.log('Packaging latest build for deployment...');
try {
  execSync('tar -czf deploy-package.tar.gz --exclude="node_modules" --exclude=".git" --exclude="deploy-package.tar.gz" backend frontend index.html assets', {
    cwd: 'c:/MAMP/htdocs/TodoList',
    stdio: 'inherit'
  });
  console.log('Package created successfully: deploy-package.tar.gz');
} catch (e) {
  console.warn('Packaging warning/skipped:', e.message);
}

console.log('Connecting to remote server at 10.103.10.33...');

const conn = new Client();

conn.on('ready', () => {
  console.log('SSH Connection established successfully!');

  // Step 1: Open SFTP and upload deploy-package.tar.gz
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP Error:', err);
      conn.end();
      return;
    }

    console.log('Uploading tarball to ' + REMOTE_TAR_PATH + '...');
    const readStream = fs.createReadStream(TAR_LOCAL_PATH);
    const writeStream = sftp.createWriteStream(REMOTE_TAR_PATH);

    writeStream.on('close', () => {
      console.log('Upload complete! Extracting and configuring on remote server...');

      // Step 2: Extract tarball, copy dist, install backend deps, and start with PM2
      const bashScript = `
        set -e
        echo "=== EXTRACTING FILES ==="
        mkdir -p ${REMOTE_DEST_DIR}
        tar -xzf ${REMOTE_TAR_PATH} -C ${REMOTE_DEST_DIR}/
        
        echo "=== COPYING PRODUCTION FRONTEND BUILD TO TODOLIST ROOT ==="
        cp -rf ${REMOTE_DEST_DIR}/frontend/dist/* ${REMOTE_DEST_DIR}/
        
        echo "=== VERIFYING BACKEND DEPENDENCIES ==="
        cd ${REMOTE_DEST_DIR}/backend
        if [ ! -d "node_modules" ]; then
          echo "Installing backend dependencies..."
          npm install --omit=dev
        fi
        
        echo "=== SETTING UP PM2 PROCESS ==="
        pm2 delete todolist-api 2>/dev/null || true
        pm2 start --name "todolist-api" "npx tsx src/server.ts" --cwd "${REMOTE_DEST_DIR}/backend"
        pm2 save

        echo "=== VERIFYING PM2 STATUS ==="
        pm2 status

        echo "=== TESTING API HEALTH ==="
        sleep 3
        curl -s http://127.0.0.1:4000/api/health || echo "Local health check waiting..."

        echo "=== CLEANING UP TEMP TAR ==="
        rm -f ${REMOTE_TAR_PATH}
        echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
      `;

      conn.exec(bashScript, (execErr, stream) => {
        if (execErr) {
          console.error('Exec error:', execErr);
          conn.end();
          return;
        }

        stream.on('close', (code, signal) => {
          console.log(`Remote process finished with code ${code}`);
          conn.end();
        }).on('data', (data) => {
          process.stdout.write(data);
        }).stderr.on('data', (data) => {
          process.stderr.write(data);
        });
      });
    });

    writeStream.on('error', (uploadErr) => {
      console.error('Upload error:', uploadErr);
      conn.end();
    });

    readStream.pipe(writeStream);
  });
}).on('error', (connErr) => {
  console.error('\n❌ Connection to 10.103.10.33 failed:', connErr.message || connErr);
  console.error('👉 Tip: Ensure you are connected to the office network (LAN / Office Wi-Fi) or Sophos Connect VPN.');
  process.exit(1);
}).connect({
  host: '10.103.10.33',
  port: 22,
  username: 'evolv',
  password: 'Evolv@123',
  readyTimeout: 15000
});
