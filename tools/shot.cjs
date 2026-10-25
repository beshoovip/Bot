const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const { chromium } = require('playwright');(async()=>{
const root = process.cwd();
const srv = http.createServer((q,r)=>{ const f=path.join(root,decodeURIComponent(q.url.split('?')[0])); if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end();} r.setHeader('content-type',f.endsWith('.js')?'text/javascript':'text/html'); fs.createReadStream(f).pipe(r);}).listen(0);
const port = srv.address().port;
const br = await chromium.launch(); const pg = await br.newPage({viewport:{width:1600,height:900}});
const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await pg.goto(`http://localhost:${port}/tests/ui/preview.html`);
await pg.waitForFunction('window.DONE',null,{timeout:20000}).catch(()=>{});
await pg.screenshot({path:process.argv[2],fullPage:true});
console.log('errors:',JSON.stringify(errs));
await br.close(); srv.close();
})();
