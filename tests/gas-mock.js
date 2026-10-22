/**
 * A small in-memory stand-in for the Google Apps Script services this project
 * uses (Sheets, Drive, Mail, Lock, Cache, Properties, HtmlService).
 *
 * It lets the real .gs files run under Node for tests and for a local preview.
 * It is NOT uploaded to Apps Script (see .claspignore).
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function createEnv() {
  const state = {
    user: '', owner: 'it.admin@abqse.org', quota: 100, mails: [], triggers: [],
    props: {}, cache: {}, reads: {}, sheets: {}, order: [], files: {}, folders: {}, seq: 0
  };
  const id = (p) => p + (++state.seq);

  /* ---------- Sheets ---------- */
  function makeSheet(name) {
    const sh = { name, data: [], maxRows: 1000, maxCols: 26 };
    const api = {
      getName: () => name,
      getLastRow: () => { for (let r = sh.data.length; r > 0; r--) if (sh.data[r - 1].some((c) => c !== '')) return r; return 0; },
      getLastColumn: () => sh.data.reduce((m, row) => { for (let c = row.length; c > m; c--) if (row[c - 1] !== '') return c; return m; }, 0),
      getMaxRows: () => sh.maxRows,
      getMaxColumns: () => sh.maxCols,
      insertRowsAfter: (after, n) => { sh.maxRows += n; },
      insertColumnsAfter: (after, n) => { sh.maxCols += n; },
      setFrozenRows: () => api,
      getDataRange: () => api.getRange(1, 1, Math.max(1, api.getLastRow()), Math.max(1, api.getLastColumn())),
      getRange: (r, c, nr = 1, nc = 1) => {
        if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Mock: bad range');
        if (r + nr - 1 > sh.maxRows || c + nc - 1 > sh.maxCols) throw new Error('Mock: range is outside the sheet grid (' + name + ')');
        const range = {
          getDisplayValues: () => {
            state.reads[name] = (state.reads[name] || 0) + nr * nc;
            const out = [];
            for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((sh.data[r - 1 + i] || [])[c - 1 + j] || ''); out.push(row); }
            return out;
          },
          setNumberFormat: () => range,
          getRow: () => r,
          // Server-side search of the range; does not count as reading cells.
          createTextFinder: (text) => {
            let whole = false, exactCase = false;
            const finder = {
              matchEntireCell: (b) => { whole = b; return finder; }, matchCase: (b) => { exactCase = b; return finder; },
              findAll: () => {
                const out = [], norm = (x) => (exactCase ? String(x) : String(x).toLowerCase());
                for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
                  const cell = (sh.data[r - 1 + i] || [])[c - 1 + j] || '';
                  if (whole ? norm(cell) === norm(text) : norm(cell).indexOf(norm(text)) >= 0) out.push(api.getRange(r + i, c + j));
                }
                return out;
              }
            };
            return finder;
          },
          setValues: (values) => {
            if (values.length !== nr || values.some((v) => v.length !== nc)) throw new Error('Mock: setValues size mismatch on ' + name);
            for (let i = 0; i < nr; i++) {
              while (sh.data.length < r + i) sh.data.push([]);
              const row = sh.data[r - 1 + i];
              for (let j = 0; j < nc; j++) {
                while (row.length < c + j) row.push('');
                let v = values[i][j];
                if (typeof v !== 'string') throw new Error('Mock: non-string cell written to ' + name + ': ' + v);
                if (/^[=+\-@]/.test(v)) throw new Error('Mock: FORMULA written to ' + name + ': ' + v);
                if (v.charAt(0) === "'") v = v.substring(1);   // Sheets consumes one leading apostrophe
                row[c - 1 + j] = v;
              }
            }
            return range;
          },
          clearContent: () => { for (let i = 0; i < nr; i++) { const row = sh.data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) if (c - 1 + j < row.length) row[c - 1 + j] = ''; } return range; }
        };
        return range;
      },
      _raw: sh
    };
    return api;
  }
  const spreadsheet = {
    getId: () => 'SHEET1', getUrl: () => 'https://docs.google.com/spreadsheets/d/SHEET1',
    getSheetByName: (n) => state.sheets[n] || null,
    insertSheet: (n) => { state.sheets[n] = makeSheet(n); state.order.push(n); return state.sheets[n]; },
    getSheets: () => state.order.map((n) => state.sheets[n]),
    deleteSheet: (s) => { delete state.sheets[s.getName()]; state.order = state.order.filter((n) => n !== s.getName()); }
  };

  /* ---------- Blobs, Drive ---------- */
  function makeBlob(bytes, type, name) {
    const b = {
      getBytes: () => Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)),
      getContentType: () => type, getName: () => name, setName: (n) => { name = n; return b; },
      getDataAsString: () => bytes.toString('utf8'),
      getAs: (t) => makeBlob(Buffer.concat([Buffer.from('%PDF-1.4 mock\n'), bytes]), t, name),
      _buf: () => bytes
    };
    return b;
  }
  function makeFolder(name, parent) {
    const f = { id: id('FOLDER'), name, parent, folders: [], files: [] };
    const api = {
      getId: () => f.id, getName: () => f.name,
      getFoldersByName: (n) => { const hits = f.folders.filter((x) => x.getName() === n); let i = 0; return { hasNext: () => i < hits.length, next: () => hits[i++] }; },
      createFolder: (n) => { const c = makeFolder(n, api); f.folders.push(c); return c; },
      createFile: (blob) => {
        const file = { id: id('FILE'), name: blob.getName(), blob, folder: api, trashed: false };
        const fa = {
          getId: () => file.id, getName: () => file.name, setName: (n) => { file.name = n; return fa; },
          getUrl: () => 'https://drive.google.com/file/d/' + file.id + '/view',
          getBlob: () => makeBlob(file.blob._buf(), file.blob.getContentType(), file.name),
          moveTo: (dest) => { file.folder._f.files = file.folder._f.files.filter((x) => x !== fa); dest._f.files.push(fa); file.folder = dest; return fa; },
          setTrashed: (t) => { file.trashed = t; return fa; }, _file: file,
          path: () => { const parts = [file.name]; let p = file.folder; while (p) { parts.unshift(p.getName()); p = p._f.parent; } return parts.join('/'); }
        };
        f.files.push(fa); state.files[file.id] = fa; return fa;
      },
      _f: f
    };
    state.folders[f.id] = api;
    return api;
  }
  const sharedRoot = makeFolder('Shared Drive – Chromebooks', null);
  state.sharedRootId = sharedRoot.getId();
  // The blank PDF forms, as the school would upload them to Drive.
  const forms = makeFolder('Blank forms', null);
  state.templates = {};
  [['checkout', 'Chromebook_Checkout_blank.pdf'], ['dp', 'Digital_Promise_Agreement_blank.pdf'], ['vz', 'Verizon_General_Release_blank.pdf']].forEach(([key, file]) => {
    const p = path.join(ROOT, 'templates', file);
    if (fs.existsSync(p)) state.templates[key] = forms.createFile(makeBlob(fs.readFileSync(p), 'application/pdf', file)).getId();
  });

  const sandbox = {
    console,
    SpreadsheetApp: {
      openById: () => spreadsheet, getActiveSpreadsheet: () => spreadsheet, flush: () => {},
      create: (title) => {   // a new, separate spreadsheet file in "My Drive"
        const file = makeFolder('My Drive', null).createFile(makeBlob(Buffer.alloc(0), 'application/vnd.google-apps.spreadsheet', title));
        const sheet = makeSheet('Sheet1');
        state.created = state.created || {};
        state.created[file.getId()] = { title, sheet, file };
        return { getId: () => file.getId(), getUrl: () => 'https://docs.google.com/spreadsheets/d/' + file.getId(), getSheets: () => [sheet] };
      }
    },
    DriveApp: {
      getFolderById: (i) => { if (!state.folders[i]) throw new Error('Mock: no folder ' + i); return state.folders[i]; },
      getFileById: (i) => { if (!state.files[i]) throw new Error('Mock: no file ' + i); return state.files[i]; },
      createFolder: (n) => makeFolder(n, null)
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => state.user }),
      getEffectiveUser: () => ({ getEmail: () => state.owner }),
      getScriptTimeZone: () => 'America/Denver'
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in state.props ? state.props[k] : null), setProperty: (k, v) => { state.props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in state.cache ? state.cache[k] : null), put: (k, v) => { state.cache[k] = v; }, remove: (k) => { delete state.cache[k]; } }) },
    MailApp: {
      getRemainingDailyQuota: () => state.quota,
      sendEmail: (m) => {
        const n = String(m.to).split(',').length;
        if (state.quota < n) throw new Error('Service invoked too many times for one day: email.');
        state.quota -= n; state.mails.push(m);
      }
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/MOCK/exec' }),
      getProjectTriggers: () => state.triggers,
      newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, create: () => { const t = { getHandlerFunction: () => fn, getUniqueId: () => 'TRIG-' + fn }; state.triggers.push(t); return t; } }; return b; },
      deleteTrigger: (t) => { state.triggers = state.triggers.filter((x) => x !== t); }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => Array.from(new Int8Array(crypto.createHash('sha256').update(String(s)).digest())),
      base64Decode: (s) => Array.from(new Int8Array(Buffer.from(s, 'base64'))),
      base64Encode: (b) => Buffer.from(typeof b === 'string' ? b : Uint8Array.from(b.map((x) => x & 255))).toString('base64'),
      newBlob: (d, type, name) => makeBlob(typeof d === 'string' ? Buffer.from(d, 'utf8') : Buffer.from(Uint8Array.from(d.map((x) => x & 255))), type, name),
      formatDate: (d, tz, fmt) => {
        const p = (n) => String(n).padStart(2, '0');
        const day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        return fmt === 'yyyy-MM-dd' ? day : day + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
      }
    },
    HtmlService: {
      createHtmlOutputFromFile: (n) => ({ getContent: () => fs.readFileSync(path.join(ROOT, n + '.html'), 'utf8') }),
      createTemplateFromFile: (n) => {
        const t = {
          evaluate: () => {
            let html = fs.readFileSync(path.join(ROOT, n + '.html'), 'utf8')
              .replace(/<\?!= include_\('(\w+)'\) \?>/g, (m, f) => fs.readFileSync(path.join(ROOT, f + '.html'), 'utf8'))
              .replace(/<\?!= boot \?>/g, () => t.boot);
            if (/<\?/.test(html)) throw new Error('Mock: unsupported scriptlet in ' + n + '.html');
            const out = { title: '', setTitle: (x) => { out.title = x; return out; }, addMetaTag: () => out, getContent: () => html };
            return out;
          }
        };
        return t;
      }
    }
  };

  const ctx = vm.createContext(sandbox);
  fs.readdirSync(ROOT).filter((f) => f.endsWith('.gs')).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });

  /** Runs one server function as one "request" by the given user ('' = anonymous parent). */
  function call(user, fn, ...args) {
    state.user = user;
    vm.runInContext('SS_ = null; TCACHE_ = {}; HCACHE_ = {}; CONFIG_CACHE_ = null; LOCK_DEPTH_ = 0; LOG_BUFFER_ = [];', ctx);
    if (/_$/.test(fn) || typeof ctx[fn] !== 'function') throw new Error('Not callable from the browser: ' + fn);
    // JSON round-trip, like google.script.run
    const clone = (r) => (r === undefined ? undefined : JSON.parse(JSON.stringify(r)));
    const result = ctx[fn](...JSON.parse(JSON.stringify(args)));
    // Functions that build PDFs are async and return a promise, as they do in Apps Script.
    return result && typeof result.then === 'function' ? result.then(clone) : clone(result);
  }
  /** Runs a private helper (for unit tests only). */
  function internal(fn, ...args) { return ctx[fn](...args); }
  function sheetRows(name) {
    const d = state.sheets[name]._raw.data;
    return d.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => Object.fromEntries(d[0].map((h, i) => [h, r[i] || ''])));
  }
  return { state, ctx, call, internal, sheetRows };
}

module.exports = { createEnv, ROOT };
