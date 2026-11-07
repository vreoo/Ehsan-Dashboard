/* مركز إحسان — Google Apps Script V8. شغّل setup مرة واحدة قبل النشر. */
var EHSAN = {
  timezone: 'Asia/Kuwait', sessionSeconds: 21600,
  sheets: { groups: 'الفئات', students: 'الطلاب', seasons: 'المواسم', meetings: 'اللقاءات', users: 'المشرفون', audit: 'سجل التعديلات' }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('مركز إحسان')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** للتشغيل من المحرّر. يعرض بيانات المدير أول مرة فقط، ولا يعيد تعيينها. */
function setup() {
  return locked_(function () {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('DATABASE_ID')) {
      console.log('المشروع مهيأ. قاعدة البيانات: ' + database_().getUrl());
      return;
    }
    var book = SpreadsheetApp.create('مركز إحسان — البيانات');
    book.setSpreadsheetTimeZone(EHSAN.timezone);
    book.setSpreadsheetLocale('ar_KW');
    var state = {};
    Object.keys(EHSAN.sheets).forEach(function (key, index) {
      var sheet = index === 0 ? book.getSheets()[0].setName(EHSAN.sheets[key]) : book.insertSheet(EHSAN.sheets[key]);
      sheet.setRightToLeft(true);
      sheet.getRange(1, 1, 1, 3).setValues([['المعرف', 'الاسم', 'تفاصيل السجل']]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 3).setBackground('#2c345c').setFontColor('#ffffff');
      sheet.setColumnWidth(2, 220);
      state[key] = [];
    });
    var pepper = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PASSWORD_PEPPER', pepper);
    var password = 'Ehsan-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    var admin = { id: id_(), username: 'admin', name: 'مدير المركز', role: 'admin', active: true, authVersion: 1, salt: id_() };
    admin.passwordHash = passwordHash_(password, admin.salt);
    state.users.push(admin);
    ['اليافعين', 'الشباب', 'الرجال'].forEach(function (name) { state.groups.push({ id: id_(), name: name, active: true }); });
    Object.keys(EHSAN.sheets).forEach(function (key) { writeTable_(book, key, state[key]); });
    SpreadsheetApp.flush();
    props.setProperty('DATABASE_ID', book.getId());
    console.log('قاعدة البيانات: ' + book.getUrl());
    console.log('اسم المستخدم: admin');
    console.log('كلمة المرور المؤقتة: ' + password);
    console.log('احتفظ بكلمة المرور ثم غيّرها من إعدادات المشرفين بعد الدخول. لا تشارك سجل التنفيذ.');
  });
}

/** نقطة الاتصال الوحيدة للواجهة. كل عملية تُراجع صلاحياتها على الخادم. */
function api(action, payload, token) {
  return locked_(function () {
    if (typeof action !== 'string') fail_('طلب غير صحيح.');
    payload = payload || {};
    if (typeof payload !== 'object' || Array.isArray(payload)) fail_('بيانات الطلب غير صحيحة.');
    var state = readState_();
    if (action === 'login') return login_(state, payload);
    var user = authenticate_(state, token);
    if (action === 'logout') {
      CacheService.getScriptCache().remove(sessionKey_(token));
      return {};
    }
    if (action === 'bootstrap') return bootstrap_(state, user);
    var handlers = {
      saveStudent: saveStudent_, saveGroup: saveGroup_, saveSeason: saveSeason_,
      activateSeason: activateSeason_, reopenSeason: reopenSeason_, closeSeason: closeSeason_,
      saveMeeting: saveMeeting_, saveUser: saveUser_
    };
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) fail_('العملية غير متاحة.');
    var change = handlers[action](state, payload, user);
    state.audit.push({ id: id_(), at: now_(), actor: user.name, action: change.description, entityId: change.id, details: change.details || '' });
    var book = database_();
    var tables = change.tables.concat(['audit']);
    // Validate all records before the first write, including the audit entry.
    tables.forEach(function (key) {
      if (state[key].some(function (row) { return JSON.stringify(row).length > 45000; })) fail_('حجم أحد السجلات أكبر من المسموح. قلّل عدد الطلاب في الفئة.');
    });
    tables.forEach(function (key) { writeTable_(book, key, state[key]); });
    SpreadsheetApp.flush();
    return bootstrap_(state, user);
  });
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('النظام مشغول قليلًا. حاول مرة أخرى.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function database_() {
  var id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) fail_('يلزم تشغيل setup من محرّر المشروع أولًا.');
  return SpreadsheetApp.openById(id);
}
function readState_() {
  var book = database_(), state = {};
  Object.keys(EHSAN.sheets).forEach(function (key) {
    var sheet = book.getSheetByName(EHSAN.sheets[key]);
    if (!sheet) fail_('أحد جداول البيانات مفقود. راجع مدير المشروع.');
    var count = sheet.getLastRow() - 1;
    state[key] = count > 0 ? sheet.getRange(2, 3, count, 1).getValues().filter(function (r) { return r[0] !== ''; }).map(function (r) {
      try { return JSON.parse(r[0]); } catch (e) { fail_('تعذر قراءة سجل من قاعدة البيانات. لا تعدّل الجداول يدويًا.'); }
    }) : [];
  });
  return state;
}
function writeTable_(book, key, rows) {
  var sheet = book.getSheetByName(EHSAN.sheets[key]), previous = Math.max(sheet.getLastRow() - 1, 0);
  if (rows.length + 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
  if (rows.length) {
    var values = rows.map(function (row) {
      var name = row.name || row.username || row.action || '';
      // JSON begins with a brace, so user text cannot become a spreadsheet formula.
      var json = JSON.stringify(row);
      if (json.length > 45000) fail_('حجم السجل أكبر من المسموح. قلّل عدد الطلاب في الفئة.');
      return [row.id, /^[=+\-@\t\r\n]/.test(name) ? "'" + name : name, json];
    });
    sheet.getRange(2, 1, values.length, 3).setNumberFormat('@').setValues(values);
  }
  if (previous > rows.length) sheet.getRange(rows.length + 2, 1, previous - rows.length, 3).clearContent();
}
function id_() { return Utilities.getUuid(); }
function now_() { return new Date().toISOString(); }
function today_() { return Utilities.formatDate(new Date(), EHSAN.timezone, 'yyyy-MM-dd'); }
function fail_(message) { throw new Error(message); }
function requireAdmin_(user) { if (user.role !== 'admin') fail_('هذه العملية لمدير المركز فقط.'); }
function find_(rows, id, label) {
  var row = rows.find(function (item) { return item.id === id; });
  if (!row) fail_((label || 'السجل') + ' غير موجود. حدّث الصفحة.');
  return row;
}
function text_(value, label, max, optional) {
  if (typeof value !== 'string') { if (optional && (value === undefined || value === null)) return ''; fail_('أدخل ' + label + '.'); }
  var result = value.trim();
  if (!result && !optional) fail_('أدخل ' + label + '.');
  if (result.length > max) fail_(label + ' أطول من المسموح (' + max + ').');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail_(label + ' يحتوي على محارف غير صالحة.');
  return result;
}
function boolean_(value, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') fail_('حالة السجل غير صحيحة.');
  return value;
}
function date_(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail_('أدخل ' + label + ' بصيغة صحيحة.');
  var date = new Date(value + 'T12:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') fail_('أدخل ' + label + ' صالحًا.');
  return value;
}
function previousDay_(date) { return new Date(new Date(date + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }
function normalize_(value) { return String(value).trim().replace(/\s+/g, ' ').toLowerCase(); }
function digits_(value) { return String(value).replace(/[٠-٩]/g, function (n) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(n); }).replace(/[۰-۹]/g, function (n) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(n); }); }
function username_(value) {
  value = text_(value, 'اسم المستخدم', 40).toLowerCase();
  if (!/^[a-z0-9\u0621-\u064a\u0660-\u0669._-]{3,40}$/.test(value)) fail_('اسم المستخدم من ٣ إلى ٤٠ حرفًا أو رقمًا، دون مسافات.');
  return value;
}
function digest_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function passwordHash_(password, salt) {
  var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) fail_('إعداد المصادقة مفقود. راجع مدير المشروع.');
  return Utilities.computeHmacSha256Signature(salt + '\u0000' + password, pepper, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function equal_(a, b) {
  a = String(a); b = String(b);
  var result = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
function sessionKey_(token) { return 'session:' + digest_(String(token)); }
function login_(state, payload) {
  var username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  var password = typeof payload.password === 'string' ? payload.password : '';
  if (!username || username.length > 40 || !password || password.length > 128) fail_('أدخل اسم المستخدم وكلمة المرور.');
  var cache = CacheService.getScriptCache(), key = 'login:' + digest_(username), attempt = JSON.parse(cache.get(key) || '{"count":0}');
  if (attempt.count >= 5) fail_('محاولات دخول كثيرة. انتظر ١٥ دقيقة ثم حاول.');
  var user = state.users.find(function (u) { return u.username === username && u.active; });
  var hash = passwordHash_(password, user ? user.salt : 'unknown');
  if (!user || !equal_(hash, user.passwordHash)) {
    cache.put(key, JSON.stringify({ count: attempt.count + 1 }), 900);
    fail_('اسم المستخدم أو كلمة المرور غير صحيحة.');
  }
  cache.remove(key);
  var token = (id_() + id_()).replace(/-/g, '');
  cache.put(sessionKey_(token), JSON.stringify({ userId: user.id, version: user.authVersion, expires: Date.now() + EHSAN.sessionSeconds * 1000 }), EHSAN.sessionSeconds);
  return { token: token, user: publicUser_(user), data: bootstrap_(state, user) };
}
function authenticate_(state, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) fail_('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
  var raw = CacheService.getScriptCache().get(sessionKey_(token));
  if (!raw) fail_('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
  var session = JSON.parse(raw), user = state.users.find(function (u) { return u.id === session.userId && u.active; });
  if (!user || session.expires <= Date.now() || session.version !== user.authVersion) fail_('انتهت جلسة الدخول. سجّل الدخول مجددًا.');
  return user;
}
function publicUser_(user) { return { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active }; }
function bootstrap_(state, user) {
  return {
    user: publicUser_(user), today: today_(), groups: state.groups, students: state.students, seasons: state.seasons,
    meetings: state.meetings, users: user.role === 'admin' ? state.users.map(publicUser_) : [],
    scores: state.seasons.flatMap(function (season) { return state.students.map(function (student) { var result = score_(season, student.id, state.meetings); result.seasonId = season.id; result.studentId = student.id; return result; }); }),
    audit: state.audit.slice(-100).reverse(), databaseUrl: user.role === 'admin' ? database_().getUrl() : ''
  };
}

function saveGroup_(state, payload, user) {
  requireAdmin_(user);
  var old = payload.id ? find_(state.groups, payload.id, 'الفئة') : null;
  var name = text_(payload.name, 'اسم الفئة', 60), active = boolean_(payload.active, old ? old.active : true);
  if (state.groups.some(function (g) { return (!old || g.id !== old.id) && normalize_(g.name) === normalize_(name); })) fail_('اسم الفئة مستخدم بالفعل.');
  if (!active && old && state.students.some(function (s) { return s.groupId === old.id && s.active; })) fail_('انقل الطلاب النشطين أو أوقفهم قبل إيقاف الفئة.');
  var row = { id: old ? old.id : id_(), name: name, active: active };
  if (old) Object.assign(old, row); else state.groups.push(row);
  return { tables: ['groups'], id: row.id, description: old ? 'تعديل فئة' : 'إضافة فئة', details: name };
}
function saveStudent_(state, payload, user) {
  var old = payload.id ? find_(state.students, payload.id, 'الطالب') : null;
  var name = text_(payload.name, 'اسم الطالب', 120), group = find_(state.groups, payload.groupId, 'الفئة');
  if (!group.active) fail_('اختر فئة نشطة.');
  var joinedOn = date_(payload.joinedOn, 'تاريخ الانتساب'), active = boolean_(payload.active, old ? old.active : true);
  if (joinedOn > today_()) fail_('تاريخ الانتساب لا يكون في المستقبل.');
  var phone = digits_(text_(payload.phone, 'رقم الهاتف', 30, true)).replace(/[\s()-]/g, '').replace(/^(\+965|00965)/, '');
  if (phone && !/^\d{8}$/.test(phone)) fail_('أدخل رقمًا كويتيًا صحيحًا من ٨ أرقام.');
  var notes = text_(payload.notes, 'الملاحظات', 1500, true);
  if (payload.allowDuplicate !== true && state.students.some(function (s) { return (!old || s.id !== old.id) && normalize_(s.name) === normalize_(name); })) fail_('DUPLICATE_STUDENT|يوجد طالب بنفس الاسم. تأكد أنه طالب آخر.');
  if (old && joinedOn !== old.joinedOn && state.meetings.some(function (m) { return m.status !== 'cancelled' && m.roster.indexOf(old.id) !== -1; })) fail_('لا يمكن تغيير تاريخ الانتساب بعد وجود سجلات حضور؛ يبقى السجل السابق محفوظًا.');
  var moved = old && old.groupId !== group.id;
  var row = old ? JSON.parse(JSON.stringify(old)) : { id: id_(), enrollments: [] };
  if (!old || joinedOn !== old.joinedOn) {
    row.enrollments = [];
    if (active || joinedOn < today_()) row.enrollments.push({ groupId: group.id, from: joinedOn, to: active ? '' : previousDay_(today_()) });
  }
  else if (old.groupId !== group.id || old.active !== active) {
    row.enrollments.forEach(function (period) { if (!period.to) period.to = previousDay_(today_()); });
    row.enrollments = row.enrollments.filter(function (period) { return !period.to || period.to >= period.from; });
    if (active) row.enrollments.push({ groupId: group.id, from: today_(), to: '' });
  }
  Object.assign(row, { name: name, groupId: group.id, phone: phone, notes: notes, joinedOn: joinedOn, active: active });
  if (old) Object.assign(old, row); else state.students.push(row);
  return { tables: ['students'], id: row.id, description: old ? 'تعديل طالب' : 'إضافة طالب', details: name + (moved ? ' — نقل الفئة من اليوم' : '') };
}
function eligible_(student, groupId, date) {
  return student.enrollments.some(function (period) { return period.groupId === groupId && period.from <= date && (!period.to || date <= period.to); });
}
function validTypes_(types, previous) {
  if (!Array.isArray(types) || !types.length || types.length > 40) fail_('أضف من نوع واحد إلى ٤٠ نوع نشاط.');
  var names = Object.create(null), ids = Object.create(null);
  return types.map(function (t) {
    if (!t || typeof t !== 'object') fail_('بيانات نوع النشاط غير صحيحة.');
    var name = text_(t.name, 'اسم نوع النشاط', 70), weight = Number(digits_(t.weight));
    if (!isFinite(weight) || weight <= 0 || weight > 100 || Math.abs(weight * 10 - Math.round(weight * 10)) > 0.00001) fail_('وزن النشاط أكبر من صفر وحتى ١٠٠، وبحد أقصى منزلة عشرية.');
    if (names[normalize_(name)]) fail_('اسم نوع النشاط مكرر.');
    names[normalize_(name)] = true;
    if (t.id && !previous.some(function (old) { return old.id === t.id; })) fail_('معرف نوع النشاط غير صحيح.');
    var id = t.id || id_();
    if (ids[id]) fail_('نوع النشاط مكرر.');
    ids[id] = true;
    return { id: id, name: name, weight: weight };
  });
}
function saveSeason_(state, payload, user) {
  requireAdmin_(user);
  var old = payload.id ? find_(state.seasons, payload.id, 'الموسم') : null;
  if (old && old.status !== 'draft') fail_('أعد فتح الموسم للإعداد قبل تعديل الأوزان أو التواريخ.');
  var name = text_(payload.name, 'اسم الموسم', 100), start = date_(payload.start, 'بداية الموسم'), end = date_(payload.end, 'نهاية الموسم');
  if (end <= start) fail_('نهاية الموسم يجب أن تكون بعد البداية.');
  if (state.seasons.some(function (s) { return (!old || old.id !== s.id) && normalize_(s.name) === normalize_(name); })) fail_('اسم الموسم مستخدم بالفعل.');
  var raw = payload.types;
  if (!old && payload.copyFromId && (!Array.isArray(raw) || !raw.length)) raw = find_(state.seasons, payload.copyFromId, 'الموسم السابق').types.map(function (t) { return { name: t.name, weight: t.weight }; });
  var types = validTypes_(raw, old ? old.types : []);
  if (old) state.meetings.filter(function (m) { return m.seasonId === old.id; }).forEach(function (m) {
    if (m.date < start || m.date > end) fail_('توجد لقاءات خارج التواريخ الجديدة.');
    if (!types.some(function (t) { return t.id === m.typeId; })) fail_('لا يمكن حذف نوع مرتبط بلقاءات؛ يمكن تعديل اسمه أو وزنه.');
  });
  var row = { id: old ? old.id : id_(), name: name, start: start, end: end, status: 'draft', types: types };
  if (old) Object.assign(old, row); else state.seasons.push(row);
  return { tables: ['seasons'], id: row.id, description: old ? 'تعديل إعدادات موسم' : 'إنشاء موسم', details: name };
}
function activateSeason_(state, payload, user) {
  requireAdmin_(user);
  var season = find_(state.seasons, payload.id, 'الموسم');
  if (season.status !== 'draft') fail_('الموسم ليس في وضع الإعداد.');
  validTypes_(season.types, season.types);
  if (Math.abs(season.types.reduce(function (sum, t) { return sum + t.weight; }, 0) - 100) > 0.00001) fail_('يجب أن يكون مجموع الأوزان ١٠٠ قبل التفعيل.');
  season.status = 'active';
  return { tables: ['seasons'], id: season.id, description: 'تفعيل موسم', details: season.name };
}
function reopenSeason_(state, payload, user) {
  requireAdmin_(user);
  var season = find_(state.seasons, payload.id, 'الموسم');
  if (season.status === 'draft') fail_('الموسم مفتوح للإعداد بالفعل.');
  season.status = 'draft';
  return { tables: ['seasons'], id: season.id, description: 'إعادة فتح موسم للإعداد', details: season.name };
}
function closeSeason_(state, payload, user) {
  requireAdmin_(user);
  var season = find_(state.seasons, payload.id, 'الموسم');
  if (season.status !== 'active') fail_('يمكن إغلاق موسم نشط فقط.');
  if (state.meetings.some(function (m) { return m.seasonId === season.id && m.status === 'draft'; })) fail_('اعتمد مسودات الحضور أو ألغها قبل إغلاق الموسم.');
  season.status = 'closed';
  return { tables: ['seasons'], id: season.id, description: 'إغلاق موسم', details: season.name };
}
function saveMeeting_(state, payload, user) {
  var old = payload.id ? find_(state.meetings, payload.id, 'اللقاء') : null;
  var season = find_(state.seasons, payload.seasonId, 'الموسم');
  if (season.status !== 'active') fail_('الموسم غير نشط. اطلب من المدير تفعيله أولًا.');
  var name = text_(payload.name, 'اسم اللقاء', 120), date = date_(payload.date, 'تاريخ اللقاء');
  var group = find_(state.groups, payload.groupId, 'الفئة');
  if (date < season.start || date > season.end) fail_('تاريخ اللقاء يجب أن يقع داخل الموسم.');
  if (!season.types.some(function (t) { return t.id === payload.typeId; })) fail_('اختر نوع نشاط من هذا الموسم.');
  if (['draft', 'approved', 'cancelled'].indexOf(payload.status) === -1) fail_('حالة اللقاء غير صحيحة.');
  if (old) {
    if (old.seasonId !== season.id) fail_('لا يمكن نقل اللقاء إلى موسم آخر.');
    if (old.status === 'cancelled') fail_('اللقاء ملغى. أنشئ لقاءً جديدًا عند الحاجة.');
    if (payload.revision !== old.revision) fail_('عدّل مشرف آخر هذا اللقاء. حدّث البيانات ثم أعد المحاولة.');
    if (old.status === 'approved' && (old.date !== date || old.typeId !== payload.typeId || old.groupId !== group.id)) fail_('لتصحيح تاريخ أو نوع أو فئة لقاء معتمد: ألغِ اللقاء وأنشئ بديلًا له.');
    if (old.status === 'approved' && payload.status === 'draft') fail_('لا يمكن تحويل حضور معتمد إلى مسودة. عدّل الحالات ثم احفظ الاعتماد.');
  } else if (payload.status === 'cancelled') fail_('لا يمكن إنشاء لقاء ملغى.');
  if (!old && !group.active) fail_('اختر فئة نشطة.');
  if (payload.status === 'approved' && date > today_()) fail_('لا يمكن اعتماد حضور لقاء مستقبلي.');
  var roster = old && (old.status === 'approved' || payload.status === 'cancelled') ? old.roster.slice() : state.students.filter(function (s) { return eligible_(s, group.id, date); }).map(function (s) { return s.id; });
  if (!roster.length && payload.status !== 'cancelled') fail_('لا يوجد طلاب منتسبون لهذه الفئة في تاريخ اللقاء.');
  if (roster.length > 300) fail_('الحد الأقصى ٣٠٠ طالب في اللقاء الواحد.');
  var input = payload.status === 'cancelled' && old ? old.attendance : (payload.attendance || {});
  if (typeof input !== 'object' || Array.isArray(input)) fail_('بيانات الحضور غير صحيحة.');
  if (Object.keys(input).some(function (id) { return roster.indexOf(id) === -1; })) fail_('قائمة الطلاب تغيرت. حدّث البيانات ثم أعد تسجيل الحضور.');
  var attendance = {};
  roster.forEach(function (id) {
    var status = Object.prototype.hasOwnProperty.call(input, id) ? input[id] : '';
    if (['', 'present', 'absent', 'excused'].indexOf(status) === -1) fail_('إحدى حالات الحضور غير صحيحة.');
    if (payload.status === 'approved' && !status) fail_('حدد حالة كل طالب قبل اعتماد الحضور.');
    attendance[id] = status;
  });
  var changes = old ? roster.filter(function (id) { return old.attendance[id] !== attendance[id]; }).map(function (id) {
    var s = find_(state.students, id, 'الطالب');
    var labels = { present: 'حاضر', absent: 'غائب', excused: 'بعذر', '': 'لم يُسجّل' };
    return s.name + ': ' + (labels[old.attendance[id]] || 'لم يُسجّل') + ' ← ' + labels[attendance[id]];
  }).join('؛ ') : '';
  var row = { id: old ? old.id : id_(), seasonId: season.id, name: name, typeId: payload.typeId, groupId: group.id, date: date, status: payload.status, roster: roster, attendance: attendance, revision: old ? old.revision + 1 : 1, updatedBy: user.name, updatedAt: now_() };
  if (old) Object.assign(old, row); else state.meetings.push(row);
  return { tables: ['meetings'], id: row.id, description: payload.status === 'cancelled' ? 'إلغاء لقاء' : payload.status === 'approved' ? 'اعتماد أو تعديل حضور' : 'حفظ مسودة حضور', details: name + (changes ? ' — ' + changes : '') };
}
function score_(season, studentId, meetings) {
  var breakdown = season.types.map(function (type) {
    var eligible = meetings.filter(function (m) { return m.seasonId === season.id && m.typeId === type.id && m.status === 'approved' && m.roster.indexOf(studentId) !== -1 && m.date >= season.start && m.date <= season.end && m.date <= today_(); });
    var present = eligible.filter(function (m) { return m.attendance[studentId] === 'present'; }).length;
    return { typeId: type.id, name: type.name, weight: type.weight, total: eligible.length, present: present, points: eligible.length ? present / eligible.length * type.weight : 0 };
  });
  var weights = breakdown.reduce(function (sum, t) { return sum + (t.total ? t.weight : 0); }, 0);
  return { value: weights ? Math.min(100, breakdown.reduce(function (sum, t) { return sum + t.points; }, 0) / weights * 100) : null, breakdown: breakdown };
}
function saveUser_(state, payload, user) {
  requireAdmin_(user);
  var old = payload.id ? find_(state.users, payload.id, 'المشرف') : null;
  var username = username_(payload.username), name = text_(payload.name, 'اسم المشرف', 100), active = boolean_(payload.active, old ? old.active : true);
  if (['admin', 'staff'].indexOf(payload.role) === -1) fail_('صلاحية المشرف غير صحيحة.');
  if (state.users.some(function (u) { return (!old || old.id !== u.id) && u.username === username; })) fail_('اسم المستخدم مستخدم بالفعل.');
  if (old && old.id === user.id && (!active || payload.role !== 'admin')) fail_('لا يمكنك إيقاف حسابك أو سحب صلاحية المدير منه.');
  if (old && old.active && old.role === 'admin' && (!active || payload.role !== 'admin') && !state.users.some(function (u) { return u.id !== old.id && u.active && u.role === 'admin'; })) fail_('يجب بقاء مدير نشط واحد على الأقل.');
  var password = payload.password;
  if (!old || password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !password.trim()) fail_('كلمة المرور من ٨ إلى ١٢٨ حرفًا.');
  }
  var row = old ? JSON.parse(JSON.stringify(old)) : { id: id_(), authVersion: 1 };
  if (!old || password) { row.salt = id_(); row.passwordHash = passwordHash_(password, row.salt); }
  if (old && (password || old.username !== username || old.role !== payload.role || old.active !== active)) row.authVersion++;
  Object.assign(row, { username: username, name: name, role: payload.role, active: active });
  if (old) Object.assign(old, row); else state.users.push(row);
  return { tables: ['users'], id: row.id, description: old ? 'تعديل حساب مشرف' : 'إضافة حساب مشرف', details: name + (password ? ' — تعيين كلمة مرور' : '') };
}
