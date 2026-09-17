import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import { createReactDevInitScript } from '../dist/react-dev.js';

function setup(options = []) {
  const requests = [];
  const source = (url) => {
    const version = url.match(/@(\d+\.\d+\.\d+)/)[1];
    return url.includes('/react-dom@')
      ? `module.exports={version:'${version}',react:require('react')}`
      : `module.exports={version:'${version}',createElement:()=>Object.freeze({})}`;
  };
  const page = {};
  class XHR {
    open(_method, url) { this.url = url; }
    send() { requests.push(this.url); this.status = 200; this.responseText = source(this.url); }
  }
  vm.runInNewContext(createReactDevInitScript({options:new Map([['mf-react-dev',['true']], ...options])}), {
    window: page, XMLHttpRequest: XHR, AbortSignal,
    fetch: async (url) => { requests.push(url); return {ok:true,text:async()=>source(url)}; }
  });
  return {page, requests, register:page.__FEDERATION__.__GLOBAL_PLUGIN__[0].beforeRegisterShare};
}
const share = (pkgName, version, eager = false) => ({pkgName, origin:{options:{name:'host'}}, shared:{version,shareConfig:{eager}}});

test('disabled by default and rejects invalid explicit versions', () => {
  assert.equal(createReactDevInitScript(), '');
  assert.throws(()=>createReactDevInitScript({options:new Map([['mf-react-version',['latest']]])}), /exact/);
});
test('async DOM-first consumption loads React first and shares one instance across providers', async () => {
  const {register, requests} = setup();
  const react = share('react','18.2.0');
  const dom = share('react-dom','18.2.0');
  const remote = share('react','18.3.1');
  register(react); register(dom); register(remote);
  const domLib = (await dom.shared.get())();
  const reactLib = (await react.shared.get())();
  assert.equal(domLib.react,reactLib);
  assert.equal((await remote.shared.get())(),reactLib);
  assert.equal(requests.length,2);
  assert.match(requests[0], /react@18.2.0/);
});
test('explicit version wins and eager factories are ready synchronously', () => {
  const {register, requests} = setup([['mf-react-version',['18.3.1']]]);
  const dom = share('react-dom','18.2.0',true);
  register(dom);
  assert.equal(dom.shared.lib().version,'18.3.1');
  assert.equal(dom.shared.lib().react.version,'18.3.1');
  assert.equal(requests.length,2);
});

test('real MF runtime consumes the replacement factory before any remote is registered', async () => {
  const { openMfObservability } = await import('../dist/open.js');
  const context = vm.createContext({console, URL, setTimeout, clearTimeout, queueMicrotask, postMessage() {}, AbortSignal,
    fetch: async (url) => ({ok:true,text:async()=>url.includes('/react-dom@')
      ? "module.exports={version:'18.2.0',react:require('react')}"
      : "module.exports={version:'18.2.0',createElement:()=>Object.freeze({})}"})});
  context.globalThis=context; context.window=context; context.top=context;
  const {scripts} = await openMfObservability({options:new Map([['mf',['true']],['mf-react-dev',['true']]])});
  vm.runInContext(scripts[0], context);
  const Runtime = context.__FEDERATION__.__DEBUG_CONSTRUCTOR__;
  const host = new Runtime({name:'host',remotes:[],shared:{react:{version:'18.2.0',get:()=>()=>({production:true}),shareConfig:{singleton:true}}}});
  const factory = await host.loadShare('react');
  assert.equal(factory().version,'18.2.0');
  assert.equal(factory().production,undefined);
  assert.equal(context.__DIVEBELL_MF_REACT_DEV__.host,'host');
});

test('unsupported provider versions fail visibly before replacing a share', () => {
  const {register,page} = setup([['mf-react-version',['19.3.0']]]);
  const original=()=>()=>({original:true});
  const args=share('react','19.3.0');args.shared.get=original;
  assert.throws(()=>register(args), /19.2.4/);
  assert.equal(args.shared.get,original);
  assert.equal(page.__DIVEBELL_MF_REACT_DEV__.status,'failed');
});


test('an eager registration racing an async fetch retains one React instance', async () => {
  const {register} = setup();
  const asyncReact=share('react','18.2.0'); register(asyncReact);
  const loading=asyncReact.shared.get();
  const eagerReact=share('react','18.2.0',true); register(eagerReact);
  const eagerLibrary=eagerReact.shared.lib();
  assert.equal((await loading)(),eagerLibrary);
});
