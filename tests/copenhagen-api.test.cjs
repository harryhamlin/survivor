const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load({limited=false,blocked=false,answer=async()=>({blocks:[{text:'April'}],sources:[]})}={}) {
 const exported={};
 class RecommendationError extends Error { constructor(status,message){super(message);this.status=status;} }
 const source=ts.transpileModule(fs.readFileSync('app/copenhagen/api.server.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const calls=[];
 const modules={
  'dotenv/config':{},
  './recommend.server.js':{RecommendationError,validate:p=>{if(typeof p?.question!=='string'||!p.question.trim())throw new RecommendationError(400,'Enter a question');},recommend:async(p,o)=>{calls.push(p);return answer(p,o);}},
  '../rateLimit.server':{limitRequest:async()=>{if(limited)throw new Response('',{status:429});},isRateLimited:async()=>blocked},
  '../trustedOrigin.server':{getTrustedOrigin:r=>new URL(r.url).origin},
 };
 new Function('require','exports','process',source)(name=>{assert.ok(name in modules,name);return modules[name];},exported,{env:{ANTHROPIC_API_KEY:'fake-test-key'}});
 return {handle:exported.handleRecommendation,calls};
}
function request(payload={question:'Coffee?'},origin='https://example.com') {return new Request('https://example.com/api/copenhagen/recommend',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});}
test('rejects off-site requests, invalid input and oversized bodies before a paid call',async()=>{
 const {handle,calls}=load();assert.equal((await handle(request(undefined,'https://other.example'))).status,403);
 assert.equal((await handle(request({question:''}))).status,400);
 assert.equal((await handle(request({question:'x'.repeat(33000)}))).status,413);assert.equal(calls.length,0);
});
test('uses shared rate limits before calling Claude',async()=>{for(const options of [{limited:true},{blocked:true}]){const {handle,calls}=load(options);assert.equal((await handle(request())).status,429);assert.equal(calls.length,0);}});
test('returns the first stream event immediately and emits an answer once ready',async()=>{
 let finish;const {handle}=load({answer:()=>new Promise(resolve=>{finish=resolve;})});const response=await handle(request());
 assert.equal(response.headers.get('Content-Type'),'text/event-stream');const reader=response.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/event: status/);
 finish({blocks:[{text:'April'}],sources:[]});assert.match(new TextDecoder().decode((await reader.read()).value),/event: answer/);assert.equal((await reader.read()).done,true);
});
test('cancelling the stream aborts the provider request',async()=>{
 let signal;const {handle}=load({answer:(p,o)=>{signal=o.signal;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('cancelled'))));}});
 const response=await handle(request());await response.body.cancel();assert.equal(signal.aborted,true);
});
test('provider failures are sanitized in the event stream',async()=>{const {handle}=load({answer:async()=>{throw new Error('private credential');}});const text=await (await handle(request())).text();assert.match(text,/event: error/);assert.ok(!text.includes('private credential'));});
