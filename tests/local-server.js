/**
 * Local preview of the app on your own computer, with fake data and no Google
 * account needed:
 *
 *   node tests/local-server.js
 *
 * Nothing here talks to Google. Emails are printed to the terminal, "Drive"
 * and the "Sheet" live in memory and vanish when you stop the server.
 * The signed PDFs are real: they are your blank forms from the templates folder, filled in.
 */
const http = require('http');
const { createEnv } = require('./gas-mock');

const PORT = process.env.PORT || 8787;
const BASE = 'http://localhost:' + PORT + '/';
const env = createEnv();
const ADMIN = 'it.admin@abqse.org';

env.call(ADMIN, 'setup');
env.state.user = ADMIN;
env.internal('setConfig_', 'DRIVE_FOLDER_ID', env.state.sharedRootId);
env.internal('setConfig_', 'PARENT_APP_URL', BASE);
env.internal('setConfig_', 'STAFF_APP_URL', BASE);
env.internal('setConfig_', 'CHECKOUT_TEMPLATE_FILE_ID', env.state.templates.checkout || '');
env.internal('setConfig_', 'DP_TEMPLATE_FILE_ID', env.state.templates.dp || '');
env.internal('setConfig_', 'VZ_TEMPLATE_FILE_ID', env.state.templates.vz || '');
env.call(ADMIN, 'apiSaveStaff', { email: 'tech@abqse.org', name: 'Tess Tech', role: 'IT Staff', active: true });
env.call(ADMIN, 'apiSaveStaff', { email: 'volunteer@abqse.org', name: 'Val Volunteer', role: 'Station Helper', active: true });
env.call(ADMIN, 'loadSampleData');
const realSend = env.ctx.MailApp.sendEmail;
env.ctx.MailApp.sendEmail = (m) => { realSend(m); console.log('\n[email] to: ' + m.to + '\n        subject: ' + m.subject); };

let queue = Promise.resolve();

const SHIM = `<script>
(function () {
  function runner(ok, bad) {
    return new Proxy({}, { get: function (_, name) {
      if (name === 'withSuccessHandler') return function (h) { return runner(h, bad); };
      if (name === 'withFailureHandler') return function (h) { return runner(ok, h); };
      return function () {
        fetch('/call', { method: 'POST', credentials: 'same-origin', body: JSON.stringify({ fn: name, args: [].slice.call(arguments) }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j.error) { if (bad) bad(new Error(j.error)); } else if (ok) ok(j.result); });
      };
    } });
  }
  window.google = { script: { run: runner(null, null) } };
})();
</script>`;

function userOf(req, url) {
  if (url.searchParams.has('as')) return url.searchParams.get('as');
  const m = /(?:^|; )as=([^;]*)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}

http.createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const user = userOf(req, url);
  if (req.method === 'POST' && url.pathname === '/call') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const reply = (out) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); };
      // Requests are handled one at a time, like the script lock does on Google.
      queue = queue.then(async () => {
        try { const { fn, args } = JSON.parse(body); reply({ result: await env.call(user, fn, ...(args || [])) }); }
        catch (e) { reply({ error: e.message }); }
      });
    });
    return;
  }
  if (url.pathname !== '/') { res.writeHead(404); return res.end(); }
  env.state.user = user;
  const params = {};
  url.searchParams.forEach((v, k) => { if (k !== 'as') params[k] = v; });
  const out = env.ctx.doGet({ parameter: params });
  const html = out.getContent().replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + out.title + '</title>' + SHIM);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'as=' + encodeURIComponent(user) + '; Path=/' });
  res.end(html);
}).listen(PORT, '127.0.0.1', () => {   // this computer only, never the network
  const code = env.sheetRows('Students')[0].code;
  console.log('ASE Chromebook app – local preview (fake data)\n');
  console.log('  Admin:          ' + BASE + '?as=it.admin@abqse.org');
  console.log('  IT Staff:       ' + BASE + '?as=tech@abqse.org');
  console.log('  Station Helper: ' + BASE + '?as=volunteer@abqse.org');
  console.log('  Parent link:    ' + BASE + '?as=&code=' + code);
  console.log('  Lost my link:   ' + BASE + '?as=&page=find   (try ID 900003, born 2014-11-23)');
  console.log('  Student repair: ' + BASE + '?as=kid@abqse.org&page=repair');
  console.log('\nPress Ctrl+C to stop.');
});
