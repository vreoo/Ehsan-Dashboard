const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function environment() {
  const props = new Map(), books = new Map(), cache = new Map(), logs = [];
  const instant = new Date('2026-11-07T10:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant.getTime(); }
  }
  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
    getValues() { return Array.from({ length: this.nr }, (_, r) => Array.from({ length: this.nc }, (_, c) => this.sheet.cells[this.r - 1 + r]?.[this.c - 1 + c] ?? '')); }
    setValues(rows) { assert.equal(rows.length, this.nr); rows.forEach((row, r) => { assert.equal(row.length, this.nc); this.sheet.cells[this.r - 1 + r] ||= []; row.forEach((value, c) => { this.sheet.cells[this.r - 1 + r][this.c - 1 + c] = value; }); }); return this; }
    clearContent() { return this.setValues(Array.from({ length: this.nr }, () => Array(this.nc).fill(''))); }
    setNumberFormat() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.cells = []; this.max = 1000; }
    setName(name) { this.name = name; return this; }
    getRange(...args) { return new Range(this, ...args); }
    getLastRow() { let n = this.cells.length; while (n && !this.cells[n - 1].some(v => v !== '')) n--; return n; }
    getMaxRows() { return this.max; }
    insertRowsAfter(_after, count) { this.max += count; }
    setRightToLeft() { return this; }
    setFrozenRows() { return this; }
    setColumnWidth() { return this; }
  }
  class Book {
    constructor() { this.id = crypto.randomUUID(); this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getSheets() { return this.sheets; }
    getSheetByName(name) { return this.sheets.find(s => s.name === name); }
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.push(sheet); return sheet; }
    setSpreadsheetTimeZone() {}
    setSpreadsheetLocale() {}
  }
  const context = vm.createContext({
    Date: Clock, console: { log: message => logs.push(message) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null, setProperty: (key, value) => props.set(key, value) }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      computeHmacSha256Signature: (value, key) => Array.from(crypto.createHmac('sha256', key).update(value).digest()),
      formatDate: date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    },
    SpreadsheetApp: { create: () => { const book = new Book(); books.set(book.id, book); return book; }, openById: id => books.get(id), flush() {} },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../Code.gs'), 'utf8'), context);
  context.setup();
  const password = logs.find(line => line.startsWith('كلمة المرور المؤقتة: ')).split(': ').slice(1).join(': ');
  const login = context.api('login', { username: 'admin', password });
  const request = (action, payload = {}, token = login.token) => context.api(action, payload, token);
  return { context, props, books, logs, login, password, request };
}

function prepared() {
  const env = environment(), { request, login } = env;
  const groupId = login.data.groups[0].id;
  request('saveStudent', { name: 'عبدالله', groupId, joinedOn: '2026-09-01', phone: '+٩٦٥ ٥٥٥٥٥٥٥٥', active: true });
  const data = request('saveStudent', { name: 'يوسف', groupId, joinedOn: '2026-10-15', active: true });
  const [a, b] = data.students;
  const draft = request('saveSeason', { name: 'الفصل الأول', start: '2026-09-01', end: '2026-12-31', types: [{ name: 'القرآن', weight: 60 }, { name: 'الرحلات', weight: 40 }] }).seasons[0];
  request('activateSeason', { id: draft.id });
  function meeting(type, date, attendance, status = 'approved', previous) {
    return request('saveMeeting', { id: previous?.id, revision: previous?.revision, seasonId: draft.id, groupId, name: 'لقاء ' + date, typeId: draft.types[type].id, date, status, attendance });
  }
  return { ...env, groupId, a, b, season: draft, meeting };
}

test('setup is repeatable; credentials are hashed and never included in bootstrap', () => {
  const { context, request, books, logs, password, login } = environment();
  context.setup(); assert.equal(books.size, 1);
  assert.equal(logs.filter(line => line.startsWith('كلمة المرور المؤقتة:')).length, 1);
  assert.equal(login.token.length, 64);
  const data = request('bootstrap');
  const text = JSON.stringify(data);
  for (const secret of ['passwordHash', 'authVersion', 'salt', password]) assert(!text.includes(secret));
  assert.throws(() => context.api('bootstrap', {}, ''), /جلسة/);
  request('logout'); assert.throws(() => request('bootstrap'), /جلسة/);
});

test('wrong passwords are throttled and staff cannot use admin actions', () => {
  const { context, request } = environment();
  for (let i = 0; i < 5; i++) assert.throws(() => context.api('login', { username: 'unknown', password: 'wrong' }), /غير صحيحة/);
  assert.throws(() => context.api('login', { username: 'unknown', password: 'wrong' }), /١٥ دقيقة/);
  request('saveUser', { username: 'staff1', name: 'مشرف', role: 'staff', active: true, password: 'Example-12345' });
  const staff = context.api('login', { username: 'staff1', password: 'Example-12345' });
  assert.equal(staff.data.users.length, 0); assert.equal(staff.data.databaseUrl, '');
  for (const action of ['saveGroup', 'saveSeason', 'activateSeason', 'reopenSeason', 'closeSeason', 'saveUser']) assert.throws(() => request(action, {}, staff.token), /مدير المركز/);
  assert.throws(() => request('getEverything'), /غير متاحة/);
});

test('student fields, duplicates, phone normalization, and date validity', () => {
  const { request, login } = environment(), groupId = login.data.groups[0].id;
  assert.throws(() => request('saveStudent', { name: '', groupId, joinedOn: '2026-09-01' }), /اسم الطالب/);
  assert.throws(() => request('saveStudent', { name: 'طالب', groupId, joinedOn: '2026-02-30' }), /صالحًا/);
  assert.throws(() => request('saveStudent', { name: 'طالب', groupId, joinedOn: '2026-11-08' }), /المستقبل/);
  assert.throws(() => request('saveStudent', { name: 'طالب', groupId, joinedOn: '2026-09-01', phone: '123' }), /كويتي/);
  const payload = { name: 'طالب', groupId, joinedOn: '2026-09-01', phone: '+٩٦٥ ٥٥٥٥٥٥٥٥' };
  const data = request('saveStudent', payload); assert.equal(data.students[0].phone, '55555555');
  assert.throws(() => request('saveStudent', payload), /DUPLICATE_STUDENT/);
  assert.equal(request('saveStudent', { ...payload, allowDuplicate: true }).students.length, 2);
  assert.throws(() => request('saveGroup', { id: groupId, name: 'اليافعين', active: false }), /الطلاب النشطين/);
});

test('season weights, unique type identifiers, copying, and activation', () => {
  const { request } = environment();
  const base = { name: 'الموسم', start: '2026-09-01', end: '2026-12-31' };
  assert.throws(() => request('saveSeason', { ...base, types: [{ name: 'القرآن', weight: -1 }] }), /وزن النشاط/);
  assert.throws(() => request('saveSeason', { ...base, types: [{ name: 'القرآن', weight: 50 }, { name: 'القرآن', weight: 50 }] }), /مكرر/);
  const season = request('saveSeason', { ...base, types: [{ name: 'القرآن', weight: 70 }] }).seasons[0];
  assert.throws(() => request('activateSeason', { id: season.id }), /١٠٠/);
  const valid = request('saveSeason', { ...base, id: season.id, types: [{ ...season.types[0], weight: 100 }] }).seasons[0];
  request('activateSeason', { id: season.id });
  assert.throws(() => request('saveSeason', { ...base, id: season.id, types: valid.types }), /أعد فتح/);
  const copied = request('saveSeason', { ...base, name: 'الموسم الثاني', copyFromId: season.id }).seasons[1];
  assert.equal(copied.types[0].weight, 100); assert.notEqual(copied.types[0].id, valid.types[0].id);
  assert.equal(copied.status, 'draft');
});

test('weighted attendance, late enrollment, drafts, excused absence, and cancellation', () => {
  const { request, a, b, meeting } = prepared();
  let data = meeting(0, '2026-10-01', { [a.id]: 'present' });
  const score = (data, student) => data.scores.find(s => s.studentId === student.id).value;
  assert.equal(score(data, a), 100); assert.equal(score(data, b), null);
  data = meeting(1, '2026-11-07', { [a.id]: 'present', [b.id]: 'excused' }, 'draft');
  assert.equal(score(data, a), 100); assert.equal(score(data, b), null);
  let draft = data.meetings.at(-1);
  data = meeting(1, '2026-11-07', draft.attendance, 'approved', draft);
  assert.equal(score(data, a), 100); assert.equal(score(data, b), 0);
  data = meeting(0, '2026-10-22', { [a.id]: 'absent', [b.id]: 'present' });
  assert.equal(score(data, a), 70); assert.equal(score(data, b), 60);
  const trip = data.meetings.find(m => m.typeId === draft.typeId);
  data = meeting(1, trip.date, trip.attendance, 'cancelled', trip);
  assert.equal(score(data, a), 50); assert.equal(score(data, b), 100);
  assert(data.audit.some(row => row.action === 'إلغاء لقاء'));
  assert.throws(() => request('saveMeeting', { ...trip, status: 'approved' }), /ملغى/);
});

test('attendance validation and conflict protection preserve previous records', () => {
  const { request, a, b, meeting, season, groupId } = prepared();
  assert.throws(() => meeting(0, '2026-11-07', { [a.id]: 'present' }), /حالة كل طالب/);
  assert.throws(() => meeting(0, '2026-11-08', { [a.id]: 'present', [b.id]: 'present' }), /مستقبلي/);
  assert.throws(() => meeting(0, '2027-01-01', {}), /داخل الموسم/);
  assert.throws(() => meeting(0, '2026-11-07', { [a.id]: 'present', [b.id]: 'present', stranger: 'present' }), /قائمة الطلاب/);
  assert.throws(() => meeting(0, '2026-11-07', { [a.id]: 'invalid', [b.id]: 'present' }), /حالات الحضور/);
  const data = meeting(0, '2026-11-07', { [a.id]: 'present', [b.id]: 'excused' });
  const current = data.meetings[0];
  assert.throws(() => request('saveMeeting', { ...current, revision: 0 }), /مشرف آخر/);
  assert.throws(() => request('saveMeeting', { ...current, date: '2026-11-06' }), /ألغِ اللقاء/);
  const changed = request('saveMeeting', { ...current, attendance: { [a.id]: 'absent', [b.id]: 'excused' } });
  assert.equal(changed.meetings[0].revision, 2);
  assert(changed.audit[0].details.includes('حاضر ← غائب'));
  request('closeSeason', { id: season.id });
  assert.throws(() => request('saveMeeting', { ...changed.meetings[0], groupId }), /غير نشط/);
  request('reopenSeason', { id: season.id });
  assert.throws(() => request('saveMeeting', { ...changed.meetings[0] }), /غير نشط/);
});

test('group transfers and stopping students preserve historical roster and points', () => {
  const { request, login, a, b, meeting, groupId } = prepared();
  const data = meeting(0, '2026-10-22', { [a.id]: 'present', [b.id]: 'present' });
  const otherGroup = login.data.groups[1].id;
  const moved = request('saveStudent', { ...a, groupId: otherGroup });
  assert.equal(moved.scores.find(s => s.studentId === a.id).value, 100);
  const later = meeting(0, '2026-11-07', { [b.id]: 'present' });
  assert.equal(later.meetings.at(-1).roster.length, 1);
  assert.equal(later.meetings[0].roster.length, 2);
  const oldMeeting = data.meetings[0];
  request('saveStudent', { ...b, active: false });
  const edited = request('saveMeeting', { ...oldMeeting, attendance: { [a.id]: 'absent', [b.id]: 'present' } });
  assert.equal(edited.meetings[0].roster.length, 2);
  assert.throws(() => request('saveStudent', { ...b, joinedOn: '2026-10-01', groupId }), /تاريخ الانتساب/);
});

test('password changes invalidate sessions and last admin cannot disable self', () => {
  const { request, context, login } = environment(), user = login.user;
  assert.throws(() => request('saveUser', { ...user, active: false }), /حسابك/);
  assert.throws(() => request('saveUser', { ...user, password: 'short' }), /٨/);
  request('saveUser', { ...user, password: 'New-Password-12345' });
  assert.throws(() => request('bootstrap'), /جلسة/);
  const newLogin = context.api('login', { username: 'admin', password: 'New-Password-12345' });
  assert(newLogin.token);
});

test('cannot close season with drafts, or remove activity types used by meetings', () => {
  const { request, a, b, meeting, season } = prepared();
  meeting(0, '2026-11-07', { [a.id]: '', [b.id]: '' }, 'draft');
  assert.throws(() => request('closeSeason', { id: season.id }), /مسودات/);
  request('reopenSeason', { id: season.id });
  assert.throws(() => request('saveSeason', { ...season, types: [season.types[1]] }), /لا يمكن حذف/);
  assert.throws(() => request('saveSeason', { ...season, end: '2026-10-31' }), /خارج التواريخ/);
});

test('same-day stopped students have no inverted enrollment periods', () => {
  const { request, login } = environment(), groupId = login.data.groups[0].id;
  const payload = { name: 'طالب موقوف', groupId, joinedOn: '2026-11-07', active: false };
  const student = request('saveStudent', payload).students[0];
  assert.equal(student.enrollments.length, 0);
  const changed = request('saveStudent', { ...student, joinedOn: '2026-11-01' }).students[0];
  assert.equal(changed.enrollments[0].from, '2026-11-01');
  assert.equal(changed.enrollments[0].to, '2026-11-06');
  const active = request('saveStudent', { ...changed, active: true }).students[0];
  assert(active.enrollments.every(period => !period.to || period.to >= period.from));
  const stopped = request('saveStudent', { ...active, active: false }).students[0];
  assert(stopped.enrollments.every(period => !period.to || period.to >= period.from));
});

test('stale attendance does not overwrite a newer approval, and disabled accounts lose access', () => {
  const { request, context, a, b, meeting } = prepared();
  const first = meeting(0, '2026-11-07', { [a.id]: 'present', [b.id]: 'present' }).meetings[0];
  const updated = request('saveMeeting', { ...first, attendance: { [a.id]: 'excused', [b.id]: 'present' } }).meetings[0];
  assert.throws(() => request('saveMeeting', first), /مشرف آخر/);
  assert.equal(request('bootstrap').meetings[0].attendance[a.id], 'excused');
  assert.equal(updated.revision, 2);
  request('saveUser', { username: 'second', name: 'مشرف ثان', role: 'staff', active: true, password: 'Example-12345' });
  const staff = context.api('login', { username: 'second', password: 'Example-12345' });
  request('saveUser', { ...staff.user, active: false });
  assert.throws(() => request('bootstrap', {}, staff.token), /جلسة/);
});

test('unsafe-looking text is stored as data, and malformed requests are rejected', () => {
  const { request, context, login } = environment();
  assert.throws(() => request('saveStudent', []), /بيانات الطلب/);
  assert.throws(() => context.api('__proto__', {}, login.token), /غير متاحة/);
  const data = request('saveStudent', { name: '=HYPERLINK("example")', groupId: login.data.groups[0].id, joinedOn: '2026-09-01', notes: '<img src=x onerror=alert(1)>' });
  assert.equal(data.students[0].name, '=HYPERLINK("example")');
  assert.equal(data.students[0].notes, '<img src=x onerror=alert(1)>');
  const prototypeName = request('saveSeason', { name: 'نوع خاص', start: '2026-09-01', end: '2026-12-31', types: [{ name: '__proto__', weight: 100 }] }).seasons[0];
  assert.equal(prototypeName.types[0].name, '__proto__');
});

test('a draft can be cancelled after roster membership changes', () => {
  const { request, login, a, b, meeting } = prepared();
  const draft = meeting(0, '2026-11-07', { [a.id]: '', [b.id]: '' }, 'draft').meetings[0];
  request('saveStudent', { ...a, groupId: login.data.groups[1].id });
  const cancelled = request('saveMeeting', { ...draft, status: 'cancelled' }).meetings[0];
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.roster.length, 2);
});
