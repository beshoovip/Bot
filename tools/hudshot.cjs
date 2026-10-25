const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const { chromium } = require('playwright');
(async()=>{const root=process.cwd();const M={'.js':'text/javascript','.html':'text/html','.css':'text/css'};
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end();}r.setHeader('content-type',M[path.extname(f)]||'text/plain');fs.createReadStream(f).pipe(r);}).listen(0);
const br=await chromium.launch();const pg=await br.newPage({viewport:{width:844,height:390}});
await pg.goto(`http://localhost:${srv.address().port}/tests/ui/harness.html`);await pg.waitForFunction('window.READY');
await pg.evaluate(process.argv[3]||'0');await pg.waitForTimeout(300);await pg.screenshot({path:process.argv[2]});await br.close();srv.close();})();
