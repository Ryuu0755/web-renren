const base = 'http://localhost:3000';
const fetch = global.fetch || require('node-fetch');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitPing(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(base + '/api/ping');
      if (r.ok) return true;
    } catch (e) {}
    await sleep(500);
  }
  return false;
}

(async () => {
  console.log('Menunggu server...');
  const ok = await waitPing(30000);
  if (!ok) {
    console.error('Server tidak merespon /api/ping dalam waktu 30s');
    process.exit(2);
  }

  const ts = Date.now();
  const cust = `cust${ts}`;
  const dev = `dev${ts}dlr01`;
  const password = 'pass1234';

  try {
    console.log('Membuat user customer:', cust);
    let r = await fetch(base + '/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Customer', username: cust, password }) });
    console.log('->', r.status);
    const j1 = await r.json().catch(()=>({}));
    console.log('resp:', j1);

    console.log('Membuat user developer:', dev);
    r = await fetch(base + '/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Developer', username: dev, password }) });
    console.log('->', r.status);
    const j2 = await r.json().catch(()=>({}));
    console.log('resp:', j2);

    console.log('Login customer...');
    r = await fetch(base + '/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: cust, password }) });
    const jcust = await r.json();
    console.log('login cust:', r.status, jcust);
    if (!r.ok) throw new Error('Login customer gagal');

    console.log('Login developer...');
    r = await fetch(base + '/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: dev, password }) });
    const jdev = await r.json();
    console.log('login dev:', r.status, jdev);
    if (!r.ok) throw new Error('Login developer gagal');
    if (jdev.role !== 'developer') console.warn('Perhatian: role developer tidak terdaftar oleh server response');

    console.log('Customer: sinkronisasi transaksi (1 item)');
    const tx = { id: 'tx-'+ts, amount: 50000, note: 'test e2e', datetime: new Date().toISOString() };
    r = await fetch(base + '/api/sync', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: cust, transactions: [tx] }) });
    const syncResp = await r.json();
    console.log('sync status:', r.status, syncResp && syncResp.transactions && syncResp.transactions.length);
    if (!r.ok) throw new Error('Sync failed');

    console.log('Export customer');
    r = await fetch(base + '/api/export?username=' + encodeURIComponent(cust));
    const exp = await r.json();
    console.log('export count:', exp.transactions ? exp.transactions.length : 'no');
    if (!r.ok || !exp.transactions || exp.transactions.length === 0) throw new Error('Export missing transactions');

    console.log('Developer: ambil semua pengguna (admin endpoint)');
    r = await fetch(base + '/api/admin/users', { headers: { 'x-username': dev }});
    const allUsers = await r.json();
    console.log('admin users status:', r.status, (allUsers.users || []).length);
    if (!r.ok) throw new Error('Admin users failed');

    console.log('Developer: ambil semua transaksi (admin endpoint)');
    r = await fetch(base + '/api/admin/transactions', { headers: { 'x-username': dev }});
    const allTx = await r.json();
    console.log('admin tx status:', r.status, (allTx.transactions || []).length);
    if (!r.ok) throw new Error('Admin transactions failed');

    console.log('\nE2E PASSED');
    process.exit(0);
  } catch (err) {
    console.error('E2E FAILED:', err.message || err);
    process.exit(3);
  }
})();
