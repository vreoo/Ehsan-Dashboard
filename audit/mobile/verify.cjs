// Manual browser verification; uses an existing Playwright installation, no app dependency.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node audit/mobile/verify.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
fs.mkdirSync(path.join(__dirname, 'after'), { recursive: true });
const data = {
  user: { id: 'u', username: 'admin', name: 'مدير المركز', active: true, role: 'admin' },
  today: '2026-11-07', groups: [{ id: 'g1', name: 'اليافعين', active: true }],
  seasons: [{ id: 'season', name: 'الفصل الأول', start: '2026-09-01', end: '2026-12-31', status: 'active', types: [{ id: 'q', name: 'القرآن', weight: 100 }] }],
  students: Array.from({ length: 300 }, (_, i) => ({ id: 's' + i, name: 'عبدالله أحمد العتيبي ' + i, phone: '99001234', groupId: 'g1', active: true, joinedOn: '2026-09-01' })),
  meetings: [], users: [], scores: [], audit: []
};
data.users = [data.user];
data.meetings = [{ id: 'm', seasonId: 'season', name: 'حلقة القرآن الأسبوعية', date: '2026-11-06', typeId: 'q', groupId: 'g1', status: 'approved', revision: 1, roster: data.students.map(s => s.id), attendance: Object.fromEntries(data.students.map(s => [s.id, 'present'])) }];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--blink-settings=primaryHoverType=0,availableHoverTypes=0,primaryPointerType=2,availablePointerTypes=2'] });
  try {
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 430, height: 844 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(data => {
        window.auditCalls = [];
        window.google = { script: { run: {
          withSuccessHandler(fn) { this.success = fn; return this; },
          withFailureHandler(fn) { this.failure = fn; return this; },
          api(action, payload) {
            window.auditCalls.push({ action, payload });
            this.success(action === 'login' ? { token: 'fixture', user: data.user, data } : data);
          }
        } } };
      }, data);
      page.on('dialog', dialog => dialog.accept());
      await page.goto('file://' + path.join(root, 'Index.html'));
      await page.evaluate(() => document.fonts.ready);
      await page.locator('#username').fill('admin');
      await page.locator('#password').fill('fixture');
      await page.locator('#loginForm button').click();
      assert(await page.evaluate(() => matchMedia('(pointer:coarse)').matches));
      const navHeight = await page.locator('.side').evaluate(e => e.getBoundingClientRect().height);
      await page.locator('input[type=search]').fill('لا يوجد');
      assert.equal(await page.locator('td.empty').textContent(), 'لا توجد نتائج');
      await page.locator('input[type=search]').fill('');
      assert.equal(await page.locator('tbody tr').count(), 300);
      for (const view of ['attendance', 'reports', 'settings', 'students']) {
        await page.locator('[data-view=' + view + ']').click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width, 'No page overflow: ' + view);
        assert.equal(await page.locator('.side').evaluate(e => e.getBoundingClientRect().height), navHeight, 'Stable navigation: ' + view);
      }
      await page.locator('[data-view=reports]').click();
      if (viewport.width <= 560) {
        const toggle = page.locator('.mobile-filter-toggle');
        assert.equal(await page.locator('.secondary-filter').first().isVisible(), false);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await page.screenshot({ path: path.join(__dirname, 'after', viewport.width + '-filters-open.png') });
        await page.locator('input[type=date]').first().fill('2026-11-07');
        await toggle.click();
        assert.match(await toggle.textContent(), /١/);
        assert.equal(await page.locator('tbody tr').first().locator('td').nth(1).textContent(), '٠', 'Closed filters still apply to report');
        const scroll = page.locator('.report-table-scroll');
        assert(await scroll.evaluate(e => e.scrollWidth > e.clientWidth));
        const bounds = await scroll.boundingBox();
        const client = await context.newCDPSession(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await client.send('Input.synthesizeScrollGesture', { x: Math.round(bounds.x + bounds.width / 2), y: Math.min(700, Math.round(bounds.y + 30)), xDistance: 160, yDistance: 0, gestureSourceType: 'touch' });
        assert(await scroll.evaluate(e => Math.abs(e.scrollLeft) > 0), 'Report responds to synthesized horizontal touch swipe');
        await page.setViewportSize({ width: 1440, height: 844 });
        assert.equal(await page.locator('.secondary-filter').first().isVisible(), true, 'Desktop filters visible after resize');
        await page.setViewportSize(viewport);
      }
      await page.locator('[data-view=attendance]').click();
      await page.getByRole('button', { name: 'فتح', exact: true }).click();
      const save = page.getByRole('button', { name: 'حفظ التعديل', exact: true });
      const close = page.locator('.close');
      const visibleBounds = async locator => {
        const b = await locator.boundingBox();
        assert(b.y >= 0 && b.y + b.height <= viewport.height, 'Action remains within viewport');
      };
      await visibleBounds(save); await visibleBounds(close);
      await page.locator('select[data-student]').first().selectOption('excused');
      await page.locator('.meeting-scroll').evaluate(e => e.scrollTop = e.scrollHeight);
      await visibleBounds(save); await visibleBounds(close);
      await page.screenshot({ path: path.join(__dirname, 'after', viewport.width + '-300-student-editor.png') });
      await save.click();
      const calls = await page.evaluate(() => window.auditCalls);
      const request = calls.find(c => c.action === 'saveMeeting');
      assert.equal(request.payload.attendance.s0, 'excused');
      assert.equal(Object.keys(request.payload.attendance).length, 300);
      assert.deepEqual(errors, []);
      console.log('PASS', viewport.width + 'x' + viewport.height, 'navigation, filters, overflow, 300-student attendance save');
      await context.close();
    }
    assert.equal(fs.readFileSync(path.join(root, 'Index.html'), 'utf8'), fs.readFileSync(path.join(root, 'install/Index.txt'), 'utf8'));
    console.log('PASS installation copy matches source');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
