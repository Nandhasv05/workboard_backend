import { Client } from 'ssh2';

const cmd = process.argv[2] || 'uptime';

const conn = new Client();
conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      conn.end();
      process.exit(code);
    }).on('data', (d) => process.stdout.write(d))
      .stderr.on('data', (d) => process.stderr.write(d));
  });
}).connect({
  host: '10.103.10.33',
  port: 22,
  username: 'evolv',
  password: 'Evolv@123'
});
