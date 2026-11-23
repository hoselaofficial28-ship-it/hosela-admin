// Run the real component's handlers with deterministic hooks/network, no live DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const slots = [];
let cursor = 0;
let dirty = false;
let effects = [];
let tree;
const equalDeps = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
const hooks = {
  useState(initial) {
    const i=cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => { const next=typeof value === 'function' ? value(slots[i]) : value; if(!Object.is(next, slots[i])) { slots[i]=next; dirty=true; } }];
  },
  useRef(initial) { const i=cursor++; return slots[i] ||= { current:initial }; },
  useCallback(fn,deps) { const i=cursor++; if(!slots[i] || !equalDeps(slots[i].deps,deps)) slots[i]={deps,fn}; return slots[i].fn; },
  useEffect(fn,deps) {
    const i=cursor++;
    if(!slots[i] || !equalDeps(slots[i].deps,deps)) {
      slots[i]?.cleanup?.(); slots[i]={deps}; effects.push(()=>{slots[i].cleanup=fn();});
    }
  },
};
function load(file, imports) {
  const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const compiled={exports:{}};
  new Function('require','module','exports',output)(key=>Object.hasOwn(imports,key)?imports[key]:require(key),compiled,compiled.exports);
  return compiled.exports;
}
const types=load('src/lib/custom-order-types.ts',{});
const Component=load('src/components/CustomOrders.tsx',{'react':hooks,'next/image':()=>null,'lucide-react':{AlertTriangle:()=>null,CheckCheck:()=>null,ImagePlus:()=>null,Plus:()=>null,X:()=>null},'@/lib/custom-order-types':types}).default;
const originalFetch=globalThis.fetch;
const originalDocument=globalThis.document;
const originalWindow=globalThis.window;
let focus;
let staleResolve;
let holdNext=false;
let conflictNext=false;
let data=[];
let posts=0;
const stamp=new Date().toISOString();
const props={stores:[{id:1,short_name:'Uji'}],management:true,onBlocked:()=>{},onCount:()=>{}};
globalThis.document={visibilityState:'visible'};
globalThis.window={setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout,addEventListener:(key,fn)=>{if(key==='focus')focus=fn;},removeEventListener:()=>{}};
globalThis.fetch=async (url,options={})=>{
  if(options.method==='POST'){
    posts++;
    const body=JSON.parse(options.body);
    if(conflictNext && body.action==='complete'){
      conflictNext=false;data=data.map(o=>({...o,revision:o.revision+1,needs_read:true,notes:'Permintaan diperbarui'}));
      return Response.json({error:'Pesanan berubah. Baca versi terbaru.'},{status:409});
    }
    if(body.action==='create') data=[{id:'own',store_id:1,store_name:'Uji',order_ref:'FIXTURE',notes:'Merah',image:'',revision:1,status:'open',needs_read:true,created_by:'Owner',created_at:stamp,updated_at:stamp}];
    if(body.action==='read') data=data.map(o=>({...o,needs_read:false}));
    if(body.action==='complete')data=data.map(o=>({...o,status:'done'}));
    return Response.json({id:'own'});
  }
  if(holdNext){holdNext=false; const snapshot=structuredClone(data); return new Promise(resolve=>{staleResolve=()=>resolve(Response.json({orders:snapshot,can_manage:true,completed_total:0}));});}
  return Response.json({orders:structuredClone(data.filter(o=>o.status!=='done')),can_manage:true,completed_total:data.filter(o=>o.status==='done').length});
};
function render(){cursor=0;dirty=false;tree=Component(props);const tasks=effects;effects=[];tasks.forEach(f=>f());}
async function settle(){for(let i=0;i<15;i++){await new Promise(resolve=>setImmediate(resolve));if(dirty)render();}}
function nodes(node=tree){if(!node || typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>n===undefined?[]:nodes(n));return [node,...(node.props?.children===undefined?[]:nodes(node.props.children))];}
function content(node){if(node==null || typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(content).join('');return content(node.props?.children);}
function button(label){const result=nodes().find(n=>n.type==='button'&&content(n)===label);assert.ok(result,`Missing button: ${label}`);return result;}
function modal(title){return nodes().find(n=>typeof n.type==='function'&&n.props.title===title);}
try{
  render();await settle();
  button('Pesanan Custom').props.onClick();await settle();
  const form=nodes().find(n=>n.type==='form');assert.ok(form);
  form.props.onSubmit({preventDefault(){}});await settle();
  assert.equal(nodes().some(n=>n.props?.title?.startsWith('Wajib dibaca')),false);
  console.log('PASS UI: simpan owner tidak langsung membuka popup.');
  button('Tindak lanjuti').props.onClick();await settle();
  assert.ok(modal('Wajib dibaca · 1 permintaan custom'));
  nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();
  // A polling response starts before mutation but arrives after it.
  holdNext=true;focus();await settle();
  const readButton=button('Saya sudah membaca, lanjut input resi');
  const before=posts;
  readButton.props.onClick();readButton.props.onClick();await settle();
  assert.equal(posts,before+1);
  staleResolve();await settle();
  assert.ok(modal('Tindak lanjut pesanan custom'));
  assert.equal(nodes().some(n=>n.props?.title?.startsWith('Wajib dibaca')),false);
  console.log('PASS UI: setelah membaca langsung kembali ke tindak lanjut; klik ganda dan respons lama tidak mengembalikan popup.');
  nodes().find(n=>n.type==='textarea').props.onChange({target:{value:'Sudah sesuai'}});await settle();
  nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();
  assert.equal(button('Konfirmasi sudah disiapkan').props.disabled,false);
  conflictNext=true;
  button('Konfirmasi sudah disiapkan').props.onClick();await settle();
  assert.ok(modal('Wajib dibaca · 1 permintaan custom'));
  nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();
  button('Saya sudah membaca, lanjut input resi').props.onClick();await settle();
  assert.ok(modal('Tindak lanjut pesanan custom'));
  assert.equal(button('Konfirmasi sudah disiapkan').props.disabled,true);
  assert.equal(nodes().find(n=>n.type==='textarea').props.value,'Sudah sesuai');
  nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});await settle();
  console.log('PASS UI: konflik versi kembali ke detail terbaru, catatan tetap ada, konfirmasi harus dicentang ulang.');
  button('Konfirmasi sudah disiapkan').props.onClick();await settle();
  assert.equal(modal('Tindak lanjut pesanan custom'),undefined);
  assert.ok(button('Riwayat selesai (1)'));
  console.log('PASS UI: konfirmasi selesai menutup detail dan memperbarui jumlah riwayat.');
}finally{
  slots.forEach(slot=>slot?.cleanup?.());
  globalThis.fetch=originalFetch;globalThis.document=originalDocument;globalThis.window=originalWindow;
}
