// Opt-in integration test: downloads pinned public development UMD fixtures.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMfObservability } from '../dist/open.js';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../../../cli/dist/bin.js', import.meta.url));
const dir = await mkdtemp('/tmp/mf-react-dev-e2e-');
const reports = [];
const sources = {};
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/asset/')) {
    res.writeHead(200, {'content-type':'application/javascript'}).end(sources[decodeURIComponent(req.url.slice(7))]);
    return;
  }
  if (req.url === '/report') {
    let body = ''; for await (const chunk of req) body += chunk;
    reports.push(JSON.parse(body)); res.end('ok'); return;
  }
  const eager = new URL(req.url, 'http://test').searchParams.get('eager') === 'true';
  res.writeHead(200, {'content-type':'text/html','Content-Security-Policy':"script-src 'none'"}).end(`<!doctype html><div id="root"></div><script>
  (async()=>{
    const Runtime=window.__FEDERATION__.__DEBUG_CONSTRUCTOR__;
    const version=window.__TEST_VERSION__;
    const shared={};
    for(const name of ['react','react-dom','react-dom/client']) shared[name]={version,${eager ? 'lib:()=>({production:true}),' : ''}get:()=>()=>({production:true}),shareConfig:{singleton:true,eager:${eager}}};
    const host=new Runtime({name:'host',remotes:[],shared});
    const React=(await host.loadShare('react'))();
    const DOM=(await host.loadShare('react-dom/client'))();
    const root=DOM.createRoot(document.getElementById('root'));
    DOM.flushSync(()=>root.render(React.createElement('div',null,'development renderer')));
    const renderers=window.__TEST_RENDERERS__;
    await fetch('/report',{method:'POST',body:JSON.stringify({version:React.version,dom:DOM.version,text:document.getElementById('root').textContent,refresh:renderers.some(r=>typeof r.scheduleRefresh==='function'&&typeof r.setRefreshHandler==='function'),status:window.__DIVEBELL_MF_REACT_DEV__.status})});
  })().catch(error=>fetch('/report',{method:'POST',body:JSON.stringify({error:String(error)})}));
  </script>`);
});
let env;
async function run(args) { return exec(process.execPath,[cli,...args],{cwd:dir,env,maxBuffer:1024*1024}); }
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  for (const version of ['18.3.1','19.2.4']) {
    for (const pkg of ['react','react-dom']) {
      const url=version.startsWith('19') ? `https://unpkg.com/umd-react@${version}/dist/${pkg}.development.js` : `https://unpkg.com/${pkg}@${version}/umd/${pkg}.development.js`;
      const response=await fetch(url); assert.ok(response.ok,url); sources[url]=await response.text();
    }
    for (const eager of [false,true]) {
      const profile=join(dir,`profile-${version}-${eager}`); await mkdir(profile);
      env={...process.env,DIVEBELL_HOME:join(dir,`home-${version}-${eager}`),AGENT_BROWSER_SOCKET_DIR:join(dir,'sockets'),DIVEBELL_BROWSER_PROFILE_DIR:profile,DIVEBELL_DISABLE_EXTENSIONS:'1'};
      const {scripts}=await openMfObservability({options:new Map([['mf',['true']],['mf-react-dev',['true']]])});
      const prelude=`window.__TEST_VERSION__=${JSON.stringify(version)}; window.__TEST_RENDERERS__=[]; window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(r){window.__TEST_RENDERERS__.push(r);return 1},onCommitFiberRoot(){},onCommitFiberUnmount(){}};
      const nativeFetch=window.fetch.bind(window);window.fetch=(url,...args)=>nativeFetch(typeof url==='string'&&url.startsWith('https://unpkg.com/')?${JSON.stringify(origin)}+'/asset/'+encodeURIComponent(url):url,...args);
      const nativeOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url,...args){return nativeOpen.call(this,method,typeof url==='string'&&url.startsWith('https://unpkg.com/')?${JSON.stringify(origin)}+'/asset/'+encodeURIComponent(url):url,...args)};`;
      const init=join(dir,'init.js'); await writeFile(init,prelude+scripts[0]);
      const count=reports.length;
      await run(['open',`${origin}/?eager=${eager}`,'--no-default-profile','--no-bridge','--init-script',init,'--remove-response-header','content-security-policy']);
      const deadline=Date.now()+15000;
      while(reports.length===count&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,50));
      assert.equal(reports.length,count+1,'page should report a render result');
      assert.deepEqual(reports.at(-1),{version,dom:version,text:'development renderer',refresh:true,status:'ready'});
      await run(['stop']);
      console.log(`verified React ${version}, eager=${eager}`);
    }
  }
} finally {
  if(env) await run(['stop']).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}
