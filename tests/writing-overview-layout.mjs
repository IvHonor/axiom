import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
let checks=0;
try {
 for(const kind of ['', 'notes']) for(const scenario of ['', 'long','empty','written','fail','light']) {
  await page.goto(`http://localhost:1427/tests/writing-overview-preview.html?${kind}&${scenario}`);
  await page.locator('.jt-summary,.nst-summary,.jt-status').waitFor();
  for(const viewport of [1440,900,600]) {
   await page.setViewportSize({width:viewport,height:1100});
   for(const w of [2,3,4,6,8,12]) for(const h of [2,3,4,5,7,10,16]) {
    await page.getByLabel('Width',{exact:true}).fill(String(w));
    await page.getByLabel('Height',{exact:true}).fill(String(h)); await settle();
    const issues=await page.evaluate(()=>{
     const body=document.querySelector('.panel-body'), bounds=body.getBoundingClientRect(), issues=[];
     if(body.scrollHeight>body.clientHeight+2 || body.scrollWidth>body.clientWidth+2) issues.push('body overflow');
     for(const n of document.querySelectorAll('.jt-summary button,.nst-summary button')) {
      const b=n.getBoundingClientRect();
      if(b.width && b.height && (b.left<bounds.left-1 || b.right>bounds.right+1 || b.top<bounds.top-1 || b.bottom>bounds.bottom+1)) issues.push(n.className+': '+n.textContent);
     }
     return issues;
    });
    assert.deepEqual(issues,[],`${kind} ${scenario} viewport ${viewport} ${w}x${h}`); checks++;
   }
  }
 }
 await page.goto('http://localhost:1427/tests/writing-overview-preview.html?notes');
 await page.locator('.nst-note').first().waitFor();
 const first=await page.locator('.nst-note').first().getAttribute('title');
 await page.getByRole('button',{name:'Next notes page',exact:true}).click();
 assert.notEqual(await page.locator('.nst-note').first().getAttribute('title'),first);
 await page.locator('.nst-note').first().click(); assert.match(await page.locator('output').textContent(),/n\d+/);
 await page.goto('http://localhost:1427/tests/writing-overview-preview.html?written');
 await page.locator('.jt-main').click(); assert.match(await page.locator('output').textContent(),/journal/);
 assert.deepEqual(errors,[]);
 console.log(`PASS ${checks} size/state/viewport combinations and navigation`);
} finally {await browser.close();}
