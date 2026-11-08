const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Small DOM substitute for exercising forms and RPC callbacks without a browser.
// This checks behavior, not layout, CSS, browser-native validation, or downloads.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.dataset = {}; this.attributes = {}; this._text = ''; this._value = undefined;
    this.disabled = false; this.selected = false; this.checked = false;
    this.classList = {
      add: (...names) => { this.className = [...new Set([...(this.className || '').split(' ').filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = (this.className || '').split(' ').filter(name => !names.includes(name)).join(' '); },
      contains: name => (this.className || '').split(' ').includes(name),
      toggle: (name, value) => { const add = value ?? !this.classList.contains(name); this.classList[add ? 'add' : 'remove'](name); return add; }
    };
  }
  append(...nodes) { nodes.forEach(node => { if (!(node instanceof Element)) { const text = new Element('#text'); text._text = String(node); node = text; } if (node.parentNode) node.remove(); node.parentNode = this; this.children.push(node); }); }
  appendChild(node) { this.append(node); return node; }
  prepend(...nodes) { const old = this.children.slice(); this.replaceChildren(...nodes, ...old); }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; if (this.tagName === 'SELECT') this._value = undefined; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.replaceChildren(); parseHTML(String(value), this); }
  get innerHTML() { return this.textContent; }
  set value(value) { this._value = String(value ?? ''); }
  get value() { if (this._value !== undefined) return this._value; if (this.tagName === 'SELECT') { const opts = this.querySelectorAll('option'); return (opts.find(option => option.selected) || opts[0])?.value || ''; } return this.attributes.value || ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'id') this.id = value; if (key === 'class') this.className = value; if (key === 'value') this.value = value; if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = value; if (key === 'disabled') this.disabled = true; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, callback) { this['on' + type] = callback; }
  focus() { for (let node = this; node; node = node.parentNode) if (node.ownerDocument) { node.ownerDocument.activeElement = this; break; } }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
    if (attr) { const value = attr[1].startsWith('data-') ? this.dataset[attr[1].slice(5)] : this.getAttribute(attr[1]); return value !== undefined && value !== null && (!attr[2] || value === attr[2]); }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const choices = selector.split(',').map(s => s.trim()), result = [];
    const visit = element => element.children.forEach(child => { if (choices.some(choice => child.matches(choice))) result.push(child); visit(child); });
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (node.matches(selector)) return node; return null; }
}
function parseHTML(html, parent) {
  const stack = [parent];
  for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (token.startsWith('<!')) continue;
    if (!token.startsWith('<')) { stack.at(-1).append(token); continue; }
    const match = token.match(/^<([\w-]+)/); if (!match) continue;
    const node = new Element(match[1]);
    const attrs = token.slice(match[0].length).replace(/\/?\s*>$/, '');
    for (const attr of attrs.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    stack.at(-1).append(node);
    if (!['input', 'br', 'meta', 'link', 'hr', 'img'].includes(match[1]) && !token.endsWith('/>')) stack.push(node);
  }
}
function fixture() {
  const group = { id: 'g1', name: 'اليافعين', active: true };
  const student = { id: 's1', name: 'عبدالله', groupId: group.id, joinedOn: '2026-09-01', active: true, enrollments: [{ groupId: 'g1', from: '2026-09-01', to: '' }] };
  const season = { id: 'season', name: 'الفصل الأول', start: '2026-09-01', end: '2026-12-31', status: 'active', types: [{ id: 'q', name: 'القرآن', weight: 100 }] };
  return { user: { id: 'u', username: 'admin', name: 'مدير المركز', active: true, role: 'admin' }, today: '2026-11-07', groups: [group], students: [student], seasons: [season], meetings: [], users: [], scores: [], audit: [], databaseUrl: 'https://example.test/database' };
}
function environment(config = {}) {
  const html = fs.readFileSync(require.resolve('../Index.html'), 'utf8');
  const body = new Element('body'); parseHTML(html.split('<body>')[1].split('<script>')[0], body);
  const data = fixture(), calls = [];
  const document = { body, createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector), addEventListener(type, callback) { this['on' + type] = callback; } };
  const attach = document.createElement; document.createElement = tag => { const el = attach(tag); el.ownerDocument = document; return el; };
  const chain = { withSuccessHandler(fn) { this.success = fn; return this; }, withFailureHandler(fn) { this.failure = fn; return this; }, api(action, payload) { calls.push({ action, payload }); if (config.throwRPC) throw new Error("RPC unavailable"); if (!config.defer) this.success(config.login ? { token: "token", user: data.user, data } : data); } };
  const window = { addEventListener() {}, print() {} };
  const context = vm.createContext({ document, window, sessionStorage: { getItem: () => { if (config.storageBlocked) throw new Error('Storage blocked'); return null; }, setItem() { if (config.storageBlocked) throw new Error('Storage blocked'); }, removeItem() { if (config.storageBlocked) throw new Error('Storage blocked'); } }, google: { script: { run: chain } }, confirm: () => true, console, URL, Blob, setTimeout });
  let source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(source);
  const end = source.lastIndexOf('})();');
  source = source.slice(0, end) + 'globalThis.uiTest={S,render,studentDialog,meetingDialog,seasonDialog,groupDialog,userDialog,reports,call,closeEditors};' + source.slice(end);
  vm.runInContext(source, context);
  const ui = context.uiTest; ui.S.user = data.user; ui.S.data = data; ui.S.seasonId = 'season';
  ui.render();
  return { ui, data, calls, body, document, chain };
}

test('student, season, and meeting editors contain actual input elements', () => {
  let env = environment(); env.ui.studentDialog();
  assert(env.body.querySelector('.overlay').querySelectorAll('input').length >= 5, 'Student editor has real name/date/phone/notes/active inputs');
  env = environment(); env.ui.meetingDialog();
  assert(env.body.querySelector('.overlay').querySelectorAll('input').length >= 2, 'Meeting editor has actual title and date');
  env = environment(); env.ui.seasonDialog();
  assert(env.body.querySelector('.overlay').querySelectorAll('input').length >= 3, 'Season editor has real name, start, and end');
});

test('approved attendance can be corrected while approved metadata remains locked', () => {
  const { ui, body } = environment();
  ui.meetingDialog({ id: 'm', seasonId: 'season', name: 'حلقة', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'approved', roster: ['s1'], attendance: { s1: 'present' }, revision: 2 });
  const dialog = body.querySelector('.overlay');
  const enabledSelects = dialog.querySelectorAll('select').filter(select => !select.disabled);
  assert(enabledSelects.length >= 1, 'Approved attendance selector must be editable');
  assert(dialog.querySelectorAll('button').some(button => /حفظ التعديل/.test(button.textContent)), 'Approved meeting has save edit action');
  assert(!dialog.querySelectorAll('button').some(button => /حفظ مسودة/.test(button.textContent)), 'Approved meeting cannot become draft');
});

test('attendance changes stay local until save', () => {
  const { ui, body, data } = environment();
  const meeting = { id: 'm', seasonId: 'season', name: 'حلقة', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'draft', roster: ['s1'], attendance: { s1: 'present' }, revision: 1 };
  data.meetings.push(meeting); ui.meetingDialog(meeting);
  const select = body.querySelector('.overlay').querySelectorAll('select').at(-1);
  select.value = 'absent'; select.onchange();
  assert.equal(data.meetings[0].attendance.s1, 'present');
});

test('saving a group closes the editor and keeps a visible result', () => {
  const { ui, body, calls } = environment();
  ui.groupDialog({ id: 'g1', name: 'اليافعين', active: true });
  body.querySelector('.overlay').querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(calls.at(-1).action, 'saveGroup');
  assert.equal(body.querySelectorAll('.overlay').length, 0, 'Saved editor is removed');
});

test('historical enrollment determines new roster even after group transfer', () => {
  const { ui, body, data } = environment();
  data.students[0].groupId = 'g2';
  data.students[0].enrollments = [{ groupId: 'g1', from: '2026-09-01', to: '2026-11-06' }, { groupId: 'g2', from: '2026-11-07', to: '' }];
  ui.meetingDialog();
  const dialog = body.querySelector('.overlay'), date = dialog.querySelectorAll('input').find(input => input.type === 'date');
  date.value = '2026-10-22'; date.onchange();
  assert(dialog.querySelectorAll('td').some(td => td.textContent.includes('عبدالله')), 'Student is included in their historical group');
});

test('approved save submits the revision and corrected attendance', () => {
  const { ui, body, calls } = environment();
  ui.meetingDialog({ id: 'm', seasonId: 'season', name: 'حلقة', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'approved', roster: ['s1'], attendance: { s1: 'present' }, revision: 2 });
  const dialog = body.querySelector('.overlay'), select = dialog.querySelectorAll('select').at(-1);
  select.value = 'excused'; select.onchange();
  dialog.querySelectorAll('button').find(button => button.textContent === 'حفظ التعديل').onclick();
  const request = calls.at(-1);
  assert.equal(request.action, 'saveMeeting'); assert.equal(request.payload.revision, 2);
  assert.equal(request.payload.status, 'approved'); assert.equal(request.payload.attendance.s1, 'excused');
  assert.equal(body.querySelectorAll('.overlay').length, 0);
});

test('cancelled and inactive-season meetings remain read-only', () => {
  const { ui, body } = environment();
  ui.meetingDialog({ id: 'm', seasonId: 'season', name: 'ملغى', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'cancelled', roster: ['s1'], attendance: { s1: 'present' }, revision: 2 });
  const dialog = body.querySelector('.overlay');
  assert(dialog.querySelectorAll('input').every(input => input.disabled));
  assert(dialog.querySelectorAll('select').every(select => select.disabled));
  assert(!dialog.querySelectorAll('button').some(button => /حفظ|اعتماد/.test(button.textContent)));
});

test('season copy creates independent types and read-only seasons display details', () => {
  const { ui, body, data, calls } = environment();
  ui.seasonDialog(data.seasons[0]);
  assert(body.querySelector('.overlay').querySelectorAll('input').every(input => input.disabled));
  assert(body.querySelector('.overlay').querySelectorAll('input').some(input => input.value === 'القرآن'));
  body.querySelector('.close').onclick();
  ui.seasonDialog();
  const dialog = body.querySelector('.overlay'), copy = dialog.querySelector('select');
  copy.value = 'season'; copy.onchange();
  const fields = dialog.querySelectorAll('input');
  fields[0].value = 'الموسم الثاني'; fields[1].value = '2027-01-01'; fields[2].value = '2027-04-30';
  dialog.querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(calls.at(-1).action, 'saveSeason');
  assert.equal(calls.at(-1).payload.types[0].name, 'القرآن');
  assert.equal(calls.at(-1).payload.types[0].id, undefined);
});

test('reports exclude drafts, future meetings, and students outside the roster', () => {
  const { ui, body, data } = environment();
  const base = { id: 'm', seasonId: 'season', name: 'معتمد', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'approved', roster: ['s1'], attendance: { s1: 'present' }, revision: 1 };
  data.meetings = [base, { ...base, id: 'draft', name: 'مسودة', status: 'draft' }, { ...base, id: 'future', name: 'مستقبلي', date: '2026-11-08' }];
  data.students.push({ id: 'outsider', name: 'طالب خارج اللقاء', groupId: 'g1', active: true });
  ui.reports();
  const main = body.querySelector('#main'), kind = main.querySelector('.toolbar').querySelector('select');
  kind.value = 'log'; kind.onchange();
  const table = main.querySelector('tbody');
  assert.equal(table.children.length, 1); assert(table.textContent.includes('عبدالله'));
  assert(!table.textContent.includes('طالب خارج اللقاء')); assert(!table.textContent.includes('مسودة')); assert(!table.textContent.includes('مستقبلي'));
  const dates = main.querySelectorAll('input').filter(input => input.type === 'date');
  dates[0].value = '2027-01-01'; dates[0].onchange();
  assert(main.querySelectorAll('button').find(button => button.textContent === 'تصدير الجدول').disabled);
});

test('empty enrollment history does not add inactive students to a new encounter', () => {
  const { ui, body, data } = environment();
  data.students[0].active = false; data.students[0].enrollments = [];
  ui.meetingDialog();
  assert(!body.querySelector('.overlay').querySelector('tbody').textContent.includes('عبدالله'));
});

test('season selector explains the empty state and disables selection', () => {
  const { ui, body, data } = environment();
  data.seasons = []; ui.render();
  const select = body.querySelector('#seasonSelect');
  assert.equal(select.disabled, true);
  assert.equal(select.querySelector('option').textContent, 'لا يوجد موسم');
  assert.equal(ui.S.seasonId, null);
});

test('season selector recovers after adding a season and changes the selected season', () => {
  const { ui, body, data } = environment();
  const first = data.seasons[0]; data.seasons = []; ui.render();
  data.seasons = [first, { ...first, id: 'second', name: 'الفصل الثاني' }]; ui.render();
  const select = body.querySelector('#seasonSelect');
  assert.equal(select.disabled, false);
  assert.equal(select.querySelectorAll('option').length, 2);
  select.value = 'second'; select.onchange();
  assert.equal(ui.S.seasonId, 'second');
});


test('blocked session storage does not prevent sign in', () => {
  const { body, ui } = environment({ storageBlocked: true, login: true });
  body.querySelector('#username').value = 'admin'; body.querySelector('#password').value = 'password';
  body.querySelector('#loginForm').onsubmit({ preventDefault() {} });
  assert(body.querySelector('#login').classList.contains('hidden'));
  assert.equal(ui.S.token, 'token');
});

test('rapid sign-in submissions send only one request', () => {
  const { body, calls } = environment({ defer: true });
  body.querySelector('#username').value = 'admin'; body.querySelector('#password').value = 'password';
  for (let i = 0; i < 10; i++) body.querySelector('#loginForm').onsubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
});

test('synchronous RPC failure unlocks controls and preserves editor input', () => {
  const { ui, body } = environment({ throwRPC: true });
  ui.groupDialog(); const name = body.querySelector('.overlay').querySelector('input'); name.value = 'فئة جديدة';
  body.querySelector('.overlay').querySelector('form').onsubmit({ preventDefault() {} });
  assert.equal(ui.S.busy, false); assert.equal(name.disabled, false); assert.equal(name.value, 'فئة جديدة');
  assert(body.querySelector('.global-message').textContent.length > 0);
});

test('failed save preserves dirty editor and allows retry', () => {
  const { ui, body, chain, calls } = environment({ defer: true });
  ui.groupDialog(); const name = body.querySelector('.overlay').querySelector('input'); name.value = 'فئة جديدة'; name.oninput();
  const form = body.querySelector('.overlay').querySelector('form'); form.onsubmit({ preventDefault() {} });
  chain.failure(new Error('تعذر الاتصال. حاول مجددًا.'));
  assert.equal(ui.S.dirty, true); assert.equal(name.value, 'فئة جديدة'); assert.equal(name.disabled, false);
  form.onsubmit({ preventDefault() {} }); assert.equal(calls.length, 2);
});

test('modal traps focus, supports Escape, and restores its opener', () => {
  const { ui, body, document } = environment();
  const opener = document.createElement('button'); body.append(opener); opener.focus(); ui.groupDialog();
  const dialog = body.querySelector('.dialog'), close = dialog.querySelector('.close');
  assert.equal(document.activeElement, close); assert.equal(body.querySelector('#app').inert, true);
  const last = dialog.querySelectorAll('button').at(-1); last.focus();
  let prevented = false; dialog.onkeydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert(prevented); assert.equal(document.activeElement, close);
  dialog.onkeydown({ key: 'Escape', preventDefault() {} });
  assert.equal(body.querySelector('.overlay'), null); assert.equal(document.activeElement, opener);
  assert.equal(body.querySelector('#app').inert, false);
});


test('modal wraps reverse Tab and protects unsaved data while saving', () => {
  const { ui, body, document } = environment(); ui.groupDialog();
  const dialog = body.querySelector('.dialog'), close = dialog.querySelector('.close'), last = dialog.querySelectorAll('button').at(-1);
  dialog.onkeydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert(document.activeElement === last, 'Reverse Tab wraps to last control');
  ui.S.busy = true; dialog.onkeydown({ key: 'Escape', preventDefault() {} });
  assert(body.querySelector('.overlay'), 'Escape cannot discard an in-flight save');
});

test('failed requests restore the previous disabled state and announce progress', () => {
  const { ui, body, chain } = environment({ defer: true });
  ui.meetingDialog({ id: 'm', seasonId: 'season', name: 'لقاء', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'approved', roster: ['s1'], attendance: { s1: 'present' }, revision: 2 });
  const locked = body.querySelector('.dialog').querySelectorAll('input').find(input => input.type === 'date'); assert(locked.disabled);
  ui.call('bootstrap', {}, () => {});
  assert(body.querySelector('#requestStatus').textContent.includes('جارٍ'));
  chain.failure(new Error('تعذر الاتصال'));
  assert(locked.disabled); assert.equal(body.querySelector('#requestStatus').textContent, '');
});

test('student editor explains missing active groups before saving', () => {
  const { ui, body, data } = environment(); data.groups = []; ui.studentDialog();
  const dialog = body.querySelector('.dialog');
  assert(dialog.querySelector('.notice').textContent.includes('لا توجد فئة نشطة'));
  assert(dialog.querySelectorAll('button').find(button => button.textContent === 'حفظ').disabled);
});

test('Arabic keyboard search matches Persian Yeh and Kaf without rewriting names', () => {
  const { ui, body, data } = environment(); data.students[0].name = 'کیان'; ui.render();
  const search = body.querySelector('#main').querySelector('.toolbar').querySelector('input');
  search.value = 'كيان'; search.oninput();
  assert(body.querySelector('tbody').textContent.includes('کیان'));
  assert.equal(data.students[0].name, 'کیان');
});

test('long multilingual names and markup remain plain table content', () => {
  const { ui, body, data } = environment(); const name = 'طالب‌ 中文 😀 <img src=x> '.repeat(12);
  data.students[0].name = name; ui.render();
  assert(body.querySelector('tbody').textContent.includes(name));
  assert.equal(body.querySelector('tbody').querySelector('img'), null);
});

test('attendance request errors stay in the scrolling content and preserve corrections for retry', () => {
  const { ui, body, chain, calls } = environment({ defer: true });
  ui.meetingDialog({ id: 'm', seasonId: 'season', name: 'لقاء', date: '2026-11-07', typeId: 'q', groupId: 'g1', status: 'approved', roster: ['s1'], attendance: { s1: 'present' }, revision: 2 });
  const dialog = body.querySelector('.dialog');
  const status = dialog.querySelectorAll('select').at(-1);
  status.value = 'excused'; status.onchange();
  const save = dialog.querySelectorAll('button').find(button => button.textContent === 'حفظ التعديل');
  save.onclick();
  chain.failure(new Error('تعذر الحفظ. '.repeat(80)));
  const message = dialog.querySelector('.meeting-scroll').querySelector('.global-message');
  assert(message.textContent.includes('تعذر الحفظ'));
  assert.equal(message.getAttribute('role'), 'alert');
  assert.equal(status.value, 'excused');
  assert.equal(save.disabled, false);
  save.onclick();
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1).payload.attendance.s1, 'excused');
});
