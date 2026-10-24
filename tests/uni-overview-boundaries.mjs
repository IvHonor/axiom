import assert from 'node:assert/strict';
// Keep long content fitted at the exact view and header/footer boundaries in every font.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1100}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
try {
 await page.goto((process.env.UNI_OVERVIEW_TEST_URL || 'http://localhost:1427/tests/uni-overview-preview.html')+'?w=12&h=16&long'); await page.locator('.un-ov-root').waitFor();
 const {themes,views}=await page.evaluate(async()=>({themes:(await import('/src/extensions/index.ts')).EXTENSIONS.flatMap(ext=>ext.themes||[]),views:(await import('/src/features/uni/overview/model.ts')).VIEWS}));
 for(const theme of themes) {
  await page.evaluate(async theme=>{(await import('/src/shell/theme/applyTheme.ts')).applyTheme(theme); await document.fonts.ready;},theme);
  for(const view of views) {
   await page.locator('.tile-cell').evaluate(node=>{node.style.width='';node.style.height='';}); await settle();
   await page.getByRole('button',{name:'University display options',exact:true}).click(); await page.getByRole('radio',{name:view.label,exact:true}).click(); await page.keyboard.press('Escape');
   for(const height of [...new Set([Math.max(52,view.height),209,210,219,220,279,280,299,300])].filter(h=>h>=view.height)) {
    await page.locator('.tile-cell').evaluate((node,{width,height})=>{node.style.width=`${Math.max(70,width)+26}px`;node.style.height=`${height+60}px`;},{width:view.width,height}); await settle();
    const problems=await page.evaluate(()=>[...document.querySelectorAll('.panel-body,.un-ov-root,.un-ov-content,.un-ov-pulse,.un-ov-term,.un-ov-progress,.un-ov-items,.un-ov-module-copy,.un-ov-week,.un-ov-dashboard-main,.un-ov-dashboard-side')].filter(node=>node.scrollHeight>node.clientHeight+2||node.scrollWidth>node.clientWidth+2).map(node=>({class:node.className,w:node.clientWidth,sw:node.scrollWidth,h:node.clientHeight,sh:node.scrollHeight})));
    assert.deepEqual(problems,[],`${theme.id} ${view.id} ${height}`);
   }
  }
  console.log('PASS boundary fonts: '+theme.id);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
