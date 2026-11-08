// Manual browser verification; uses an existing Playwright installation, no app dependency.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node audit/mobile/verify.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
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
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const output=path.join(__dirname,'hardened');fs.mkdirSync(output,{recursive:true});
 try {for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:640},hasTouch:true});const page=await context.newPage();
  const hostile=structuredClone(data);hostile.students=hostile.students.slice(0,2);hostile.students[0].name='طالب‌ 中文 😀 '+ 'LongName'.repeat(30);hostile.groups[0].name='الفئة'.repeat(12);hostile.user.name='مشرف'.repeat(20);hostile.meetings[0].roster=hostile.students.map(s=>s.id);
  await page.addInitScript(data=>{window.saved=[];window.google={script:{run:{withSuccessHandler(f){this.success=f;return this},withFailureHandler(f){this.failure=f;return this},api(action,payload){window.saved.push({action,payload});if(action==='saveMeeting'&& !window.retried){window.retried=true;this.failure({message:'تعذر الحفظ. '.repeat(100)});return}this.success(action==='login'?{token:'x',user:data.user,data}:data)}}}}},hostile);
  page.on('dialog',d=>d.accept());await page.goto('file://'+root+'/Index.html');await page.locator('#username').fill('admin');await page.locator('#password').fill('fixture');await page.locator('#loginForm button').click();await page.evaluate(()=>document.fonts.ready);
  const assertPage=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await assertPage();assert(await page.locator('.panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Long names stay inside records');
  await page.screenshot({path:path.join(output,width+'-long-content.png')});
  const textStyle=await page.addStyleTag({content:'body,button,input,select,textarea,td {font-size:32px!important}'});
  await assertPage();await page.screenshot({path:path.join(output,width+'-text-200.png')});await textStyle.evaluate(e=>e.remove());
  await page.locator('.link').first().click();
  assert(await page.locator('.profile-table-scroll').first().evaluate(e=>e.scrollWidth>e.clientWidth));await assertPage();await page.locator('.close').click();
  await page.locator('[data-view=attendance]').click();await page.getByRole('button',{name:'فتح',exact:true}).click();
  const save=page.getByRole('button',{name:'حفظ التعديل',exact:true});await page.locator('select[data-student]').first().selectOption('excused');await save.click();
  assert(await page.locator('.meeting-scroll').evaluate(e=>e.clientHeight>150),'Long save error must not crush roster');
  const error=page.locator('.global-message');assert.equal(await error.getAttribute('role'),'alert');assert(await error.isVisible());
  const bounds=await save.boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=640);
  await page.screenshot({path:path.join(output,width+'-save-error.png')});
  await save.click();assert.equal(await page.locator('.overlay').count(),0);const request=await page.evaluate(()=>window.saved.filter(x=>x.action==='saveMeeting'));assert.equal(request.length,2);assert.equal(request[1].payload.attendance.s0,'excused');
  await context.close();console.log('PASS',width,'long content, contained profile tables, long RPC error and preserved correction retry');
 }
 const page=await browser.newPage({viewport:{width:320,height:640}});
 const empty={...data,students:[],groups:[],seasons:[],meetings:[],users:[],scores:[]};
 await page.addInitScript(data=>{window.google={script:{run:{withSuccessHandler(f){this.success=f;return this},withFailureHandler(){return this},api(action){this.success(action==='login'?{token:'x',user:data.user,data}:data)}}}}},empty);
 await page.goto('file://'+root+'/Index.html');await page.locator('#username').fill('admin');await page.locator('#password').fill('fixture');await page.locator('#loginForm button').click();
 for(const view of ['students','attendance','reports','settings']){await page.locator('[data-view='+view+']').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320)}
 await page.locator('[data-view=reports]').click();assert(await page.getByRole('button',{name:'تصدير الجدول'}).isDisabled());
 console.log('PASS empty data across all main screens');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
