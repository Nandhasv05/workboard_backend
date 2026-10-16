import http from 'http';
import fs from 'fs';

const productionEnv = fs.readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
const LIVE_HOST = productionEnv.match(/^DEPLOY_SSH_HOST=(.*)$/m)?.[1]?.trim();
if (!LIVE_HOST) throw new Error('DEPLOY_SSH_HOST is required in backend/.env.production');
const BASE_PATH = '/Workboard/TodoList';
const TEST_USER = 'nandhakumar';
const OTHER_USER = 'devadoss';

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: LIVE_HOST,
      port: 80,
      ...options,
      headers: { Accept: 'application/json, text/plain, */*', ...options.headers },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Request timed out')));
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

let authToken = null;
const api = async (method, path, body = null) => {
  const res = await request({
    method,
    path: `${BASE_PATH}/api${path}`,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  }, body);
  let json = {};
  try { json = JSON.parse(res.body || '{}'); } catch {}
  return { status: res.statusCode, json };
};

let passed = 0;
let failed = 0;
const assert = (description, condition, details = '') => {
  if (condition) {
    console.log(`  PASS: ${description}`);
    passed++;
  } else {
    console.error(`  FAIL: ${description}${details ? ` - ${details}` : ''}`);
    failed++;
  }
};

const run = async () => {
  console.log(`\nLive flow on http://${LIVE_HOST}\n`);
  const health = await api('GET', '/health');
  assert('API health', health.status === 200 && health.json.status === 'ok', `status ${health.status}`);

  const session = await api('POST', '/auth/portal-session', { username: TEST_USER });
  authToken = session.json.token;
  const me = session.json.user;
  assert(`Login as ${TEST_USER}`, session.status === 200 && me?.username?.toLowerCase() === TEST_USER, `status ${session.status}`);

  const users = await api('GET', '/auth/users');
  const other = (users.json.users || []).find(user => user.username?.toLowerCase() === OTHER_USER);
  assert(`${OTHER_USER} is in the member list`, !!other, `users ${users.json.users?.length || 0}`);

  const stamp = Date.now();
  let boardId = null;
  let columnId = null;
  let taskId = null;
  try {
    const createdBoard = await api('POST', '/boards', { name: `Live flow board ${stamp}`, visibility: 'public' });
    boardId = createdBoard.json.board?.id;
    assert('Create board', createdBoard.status === 201 && !!boardId, `status ${createdBoard.status}`);

    const viewedBoard = await api('GET', `/boards/${boardId}`);
    assert('View board', viewedBoard.status === 200 && viewedBoard.json.board?.name?.includes('Live flow board'), `status ${viewedBoard.status}`);
    const projectId = viewedBoard.json.board?.project_id;

    if (!other?.id || !me?.id) throw new Error('Login or member list did not return the users this flow needs');
    const boardAccess = await api('PUT', `/boards/${boardId}/members`, {
      members: [
        { userId: me.id, role: 'edit' },
        { userId: other.id, role: 'view' },
      ],
    });
    const boardMembers = boardAccess.json.members || [];
    assert('Board member access: editor and viewer saved',
      boardAccess.status === 200
      && boardMembers.some(member => String(member.user_id) === String(me.id))
      && boardMembers.some(member => String(member.user_id) === String(other.id) && String(member.role).toLowerCase() === 'view'),
      `status ${boardAccess.status}`);

    const createdList = await api('POST', '/boards/columns', { boardId, name: `Live flow list ${stamp}` });
    columnId = createdList.json.column?.id;
    assert('Create list', createdList.status === 201 && !!columnId, `status ${createdList.status}`);

    const viewedList = await api('GET', `/boards/${boardId}`);
    assert('View list on the board', (viewedList.json.board?.columns || []).some(column => String(column.id) === String(columnId)));

    const listAccess = await api('PUT', `/boards/columns/${columnId}/members`, {
      members: [
        { userId: me.id, role: 'edit' },
        { userId: other.id, role: 'view' },
      ],
    });
    assert('List member access saved',
      listAccess.status === 200 && (listAccess.json.members || []).some(member => String(member.user_id) === String(other.id) && String(member.role).toLowerCase() === 'view'),
      `status ${listAccess.status}`);

    const createdCard = await api('POST', '/tasks', {
      title: `Live flow card ${stamp}`,
      boardId,
      projectId,
      columnId,
    });
    taskId = createdCard.json.task?.id;
    assert('Create card', createdCard.status === 201 && !!taskId, `status ${createdCard.status}`);

    const viewedCard = await api('GET', `/tasks/${taskId}`);
    const actions = (viewedCard.json.task?.activities || []).map(item => item.action || '');
    assert('View card', viewedCard.status === 200 && viewedCard.json.task?.title?.includes('Live flow card'), `status ${viewedCard.status}`);
    assert('Activity records card creation', actions.some(action => /created this card/i.test(action)), actions.join(' | '));

    const due = await api('PUT', `/tasks/${taskId}`, { dueDate: '2026-10-20' });
    const afterDue = await api('GET', `/tasks/${taskId}`);
    assert('Set due date', due.status === 200 && String(afterDue.json.task?.due_date || '').startsWith('2026-10-20'), `status ${due.status} due ${afterDue.json.task?.due_date}`);
    assert('Activity records due date', (afterDue.json.task?.activities || []).some(item => /due date/i.test(item.action || '')));

    const secondList = await api('POST', '/boards/columns', { boardId, name: `Live flow done ${stamp}` });
    const moved = await api('PATCH', `/tasks/${taskId}/move`, { columnId: secondList.json.column?.id, position: 0 });
    const afterMove = await api('GET', `/tasks/${taskId}`);
    assert('Move card (automation action)', moved.status === 200 && String(afterMove.json.task?.column_id) === String(secondList.json.column?.id), `status ${moved.status}`);
    assert('Activity records the move', (afterMove.json.task?.activities || []).some(item => /moved card/i.test(item.action || '')));

    const cardAccess = await api('PUT', `/tasks/${taskId}/members`, {
      members: [
        { userId: me.id, role: 'edit' },
        { userId: other.id, role: 'view' },
      ],
    });
    assert('Card member access saved',
      cardAccess.status === 200 && (cardAccess.json.members || []).some(member => String(member.user_id) === String(other.id) && String(member.role).toLowerCase() === 'view'),
      `status ${cardAccess.status}`);

    const ownerToken = authToken;
    const otherSession = await api('POST', '/auth/portal-session', { username: OTHER_USER });
    authToken = otherSession.json.token;
    const otherView = await api('GET', `/tasks/${taskId}`);
    const otherEdit = await api('PUT', `/tasks/${taskId}`, { title: 'should not change' });
    assert(`${OTHER_USER} can view the card`, otherView.status === 200 && otherView.json.task?.my_access === 'view', `status ${otherView.status} access ${otherView.json.task?.my_access}`);
    assert(`${OTHER_USER} cannot edit the card`, otherEdit.status === 403, `status ${otherEdit.status}`);
    authToken = ownerToken;

    const deletedCard = await api('DELETE', `/tasks/${taskId}`);
    const goneCard = await api('GET', `/tasks/${taskId}`);
    assert('Delete card', (deletedCard.status === 200 || deletedCard.status === 204) && goneCard.status === 404, `delete ${deletedCard.status} get ${goneCard.status}`);
    taskId = null;

    const deletedList = await api('DELETE', `/boards/columns/${columnId}`);
    const afterList = await api('GET', `/boards/${boardId}`);
    assert('Delete list', deletedList.status === 200 && !(afterList.json.board?.columns || []).some(column => String(column.id) === String(columnId)), `status ${deletedList.status}`);
    columnId = null;
    if (secondList.json.column?.id) await api('DELETE', `/boards/columns/${secondList.json.column.id}`);

    const deletedBoard = await api('DELETE', `/boards/${boardId}`);
    const goneBoard = await api('GET', `/boards/${boardId}`);
    assert('Delete board', deletedBoard.status === 200 && goneBoard.status === 404, `delete ${deletedBoard.status} get ${goneBoard.status}`);
    boardId = null;
  } finally {
    if (taskId) await api('DELETE', `/tasks/${taskId}`);
    if (columnId) await api('DELETE', `/boards/columns/${columnId}`);
    if (boardId) await api('DELETE', `/boards/${boardId}`);
  }

  console.log(`\n${passed} PASSED | ${failed} FAILED\n`);
  if (failed > 0) process.exit(1);
};

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
