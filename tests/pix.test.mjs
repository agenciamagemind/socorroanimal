import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createHandler} from '../supabase/functions/_shared/handler.ts';

const origin='https://socorroanimal.online';
const base='https://test.supabase.co/functions/v1/pix-sandbox';
const secret='test-session-secret-never-use-in-production-0000';
function fixture() {
  const state={rows:[],calls:[],provider:new Map(),fail:false};
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_mock"}',SOCORRO_SESSION_SECRET:secret,SOCORRO_ALLOWED_ORIGINS:origin,SOCORRO_PAGUEZY_TEST_KEY:'pk_test_mock',SOCORRO_PAGUEZY_TEST_SECRET:'sk_test_mock',SOCORRO_PAGUEZY_TEST_WEBHOOK_SECRET:'test-hook'};
  const transport=async(url,options={})=>{
    const u=new URL(url),body=options.body?JSON.parse(options.body):{};
    if(u.host==='paguezy.com') {
      state.calls.push({url:u.href,path:u.pathname,method:options.method,body,headers:Object.fromEntries(new Headers(options.headers)),referrerPolicy:options.referrerPolicy,credentials:options.credentials,redirect:options.redirect});
      if(state.fail)return Response.json({error:'unavailable'},{status:503});
      if(options.method==='POST') {
        const row={id:'trx_'+(state.provider.size+1),amount:body.amount,status:'pending',pix_copy_paste:'000201-MOCK-CODE-NOT-A-REAL-PAYMENT-6304ABCD'};
        state.provider.set(row.id,row);return Response.json(row,{status:201});
      }
      return Response.json(state.provider.get(u.pathname.split('/').at(-1)));
    }
    const rpc=u.pathname.split('/').at(-1);
    if(rpc==='socorro_reserve_pix') {
      const found=state.rows.find(r=>r.owner_hash===body.p_owner && r.request_id===body.p_request && r.mode===body.p_mode);
      if(found)return Response.json({created:false,payment:found});
      const pending=state.rows.find(r=>r.owner_hash===body.p_owner && r.amount===body.p_amount && r.status==='pending');
      if(pending)return Response.json({created:false,payment:pending});
      const row={token:String(state.rows.length+1).padStart(64,'a'),owner_hash:body.p_owner,request_id:body.p_request,external_reference:'SA-'+crypto.randomUUID(),amount:body.p_amount,status:'creating',mode:body.p_mode,pix_copy_paste:null,expires_at:null};
      state.rows.push(row);return Response.json({created:true,payment:row});
    }
    if(rpc==='socorro_update_pix') {
      const row=state.rows.find(r=>r.token===body.p_token);
      if(row.status!=='paid')row.status=body.p_status;
      for(const [param,key] of [['p_transaction','transaction_id'],['p_code','pix_copy_paste'],['p_expires','expires_at']])if(body[param])row[key]=body[param];
      return Response.json(row);
    }
    if(rpc==='socorro_claim_pix')return Response.json({claimed:true,payment:state.rows.find(r=>r.token===body.p_token)});
    const rows=state.rows.filter(r=>(!u.searchParams.has('token') || 'eq.'+r.token===u.searchParams.get('token')) && (!u.searchParams.has('owner_hash') || 'eq.'+r.owner_hash===u.searchParams.get('owner_hash')) && (!u.searchParams.has('status') || 'eq.'+r.status===u.searchParams.get('status')) && (!u.searchParams.has('mode') || 'eq.'+r.mode===u.searchParams.get('mode')));
    return Response.json(rows);
  };
  const handler=createHandler(env,'sandbox',transport);
  const call=async(action,body,auth,extra={})=>{
    const req=new Request(base+'?action='+action,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth.session_token,'X-CSRF-Token':auth.csrf}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
    const response=await handler(req);return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const boot=async()=> (await call('bootstrap')).data;
  const create=(auth,amount=2000,id=crypto.randomUUID())=>call('create',{amount,request_id:id},auth);
  return {state,handler,call,boot,create};
}
test('bootstrap enables only approved origins and handles preflight',async()=>{
  const f=fixture(),b=await f.call('bootstrap');assert.equal(b.data.ready,true);assert.equal(b.data.sandbox,true);assert.equal(b.headers.get('access-control-allow-origin'),origin);
  const denied=await f.handler(new Request(base+'?action=bootstrap',{headers:{Origin:'https://evil.invalid'}}));assert.equal(denied.status,403);
  const preflight=await f.handler(new Request(base,{method:'OPTIONS',headers:{Origin:origin}}));assert.equal(preflight.status,204);
});
test('requires signed session and CSRF for creation',async()=>{
  const f=fixture(),b=await f.boot();assert.equal((await f.create()).status,401);
  assert.equal((await f.create({...b,session_token:b.session_token+'x'})).status,401);
  assert.equal((await f.create({...b,csrf:'0'.repeat(64)})).status,403);
  assert.equal(f.state.calls.length,0);
});
test('validates integer cents, preset amounts and custom donations',async()=>{
  const f=fixture(),b=await f.boot();
  for(const bad of [0,-1,2147483648,2000.2,'2000',null,true])assert.equal((await f.create(b,bad)).status,422);
  const amounts=[1000,2000,3000,5000,10000,25000,50000,100000,1234,1,2147483647];
  for(const amount of amounts){
    const p=await f.create(b,amount);assert.equal(p.status,201);assert.equal(p.data.amount,amount);assert.equal(p.data.status,'pending');
  }
  assert.equal(f.state.calls.length,amounts.length);assert.ok(f.state.calls.every(c=>!c.body.customer && c.body.payment_method==='pix'));
});
test('provider sees only whitelisted payment data, never visitor IP, page URL or browser headers',async()=>{
  const f=fixture(),b=await f.boot(),request_id=crypto.randomUUID();
  const page='https://socorroanimal.online/checkout?utm_source=campaign';
  const p=await f.call('create',{amount:2000,request_id,customer:{name:'Private Donor',email:'private@example.invalid',ip:'203.0.113.12'},page_url:page,cpf:'00000000000'},b,{
    Referer:page,'X-Forwarded-For':'203.0.113.12','X-Real-IP':'203.0.113.12','X-Customer-Email':'private@example.invalid',
  });
  assert.equal(p.status,201);
  assert.equal((await f.call('status&token='+p.data.token,undefined,b)).status,200);
  assert.equal(f.state.calls.length,2);
  const [created,checked]=f.state.calls;
  assert.deepEqual(Object.keys(created.body).sort(),['amount','external_reference','payment_method']);
  assert.equal(created.body.amount,2000);
  assert.equal(created.body.payment_method,'pix');
  assert.match(created.body.external_reference,/^SA-[a-f0-9-]{36}$/);
  assert.deepEqual(checked.body,{});
  assert.equal(checked.method,'GET');
  assert.equal(checked.url,'https://paguezy.com/api/v1/payments/trx_1');
  for(const call of f.state.calls){
    assert.equal(call.url.startsWith('https://paguezy.com/api/v1/payments'),true);
    assert.deepEqual(Object.keys(call.headers).sort(),['accept','content-type','x-api-key','x-api-secret']);
    assert.equal(call.referrerPolicy,'no-referrer');
    assert.equal(call.credentials,'omit');
    assert.equal(call.redirect,'error');
    const sent=JSON.stringify(call);
    for(const privateValue of [page,'203.0.113.12','private@example.invalid','Private Donor','00000000000','referer','x-forwarded-for']) assert.ok(!sent.includes(privateValue),privateValue);
  }
});
test('repeated clicks and pending orders do not create duplicate upstream charges',async()=>{
  const f=fixture(),b=await f.boot(),id=crypto.randomUUID();
  const a=await f.create(b,3745,id),again=await f.create(b,3745,id),other=await f.create(b,3745);
  assert.equal(a.data.token,again.data.token);assert.equal(a.data.token,other.data.token);assert.equal(f.state.calls.length,1);
});
test('different donor session cannot retrieve another payment',async()=>{
  const f=fixture(),a=await f.boot(),b=await f.boot(),p=await f.create(a);
  assert.equal((await f.call('status&token='+p.data.token,undefined,b)).status,404);
});
test('confirmation only follows provider paid state and cannot regress',async()=>{
  const f=fixture(),b=await f.boot(),p=await f.create(b),url='status&token='+p.data.token;
  assert.equal((await f.call(url,undefined,b)).data.status,'pending');
  f.state.provider.get('trx_1').status='paid';assert.equal((await f.call(url,undefined,b)).data.status,'paid');
  f.state.provider.get('trx_1').status='pending';assert.equal((await f.call(url,undefined,b)).data.status,'paid');
});
test('upstream amount mismatch never confirms payment',async()=>{
  const f=fixture(),b=await f.boot(),p=await f.create(b);f.state.provider.get('trx_1').amount=3000;f.state.provider.get('trx_1').status='paid';
  assert.equal((await f.call('status&token='+p.data.token,undefined,b)).status,502);assert.equal(f.state.rows[0].status,'pending');
});
test('ambiguous creation is never automatically repeated',async()=>{
  const f=fixture(),b=await f.boot(),id=crypto.randomUUID();f.state.fail=true;
  assert.equal((await f.create(b,2000,id)).status,502);assert.equal((await f.create(b,2000,id)).status,409);assert.equal(f.state.calls.length,1);
});
test('expired payment can be replaced with new request',async()=>{
  const f=fixture(),b=await f.boot(),p=await f.create(b);f.state.provider.get('trx_1').status='expired';
  assert.equal((await f.call('status&token='+p.data.token,undefined,b)).data.status,'expired');
  const next=await f.create(b);assert.equal(next.status,201);assert.notEqual(next.data.token,p.data.token);
});
test('HMAC webhook rejects tampering and accepts duplicate valid paid events',async()=>{
  const f=fixture(),b=await f.boot(),p=await f.create(b),row=f.state.rows[0];
  const data={event:'payment.paid',status:'paid',payment_method:'pix',amount:2000,transaction_id:'trx_1',external_reference:row.external_reference};
  const raw=JSON.stringify(data),signature=createHmac('sha256','test-hook').update(raw).digest('hex');
  const send=(sig,body=raw)=>f.handler(new Request(base+'?action=webhook',{method:'POST',body,headers:{'X-PagueZy-Signature':sig}}));
  assert.equal((await send('0'.repeat(64))).status,401);
  const wrong=JSON.stringify({...data,amount:999}),wrongSig=createHmac('sha256','test-hook').update(wrong).digest('hex');
  assert.equal((await send(wrongSig,wrong)).status,409);
  assert.equal((await send(signature)).status,200);assert.equal((await send(signature)).status,200);assert.equal(row.status,'paid');
});
test('public responses never include provider credentials or private owner data',async()=>{
  const f=fixture(),b=await f.boot(),p=await f.create(b),text=JSON.stringify(p.data);
  for(const value of ['sk_test_mock','pk_test_mock','sb_secret_mock','owner_hash','external_reference'])assert.ok(!text.includes(value));
});
test('recent donation feed includes only paid amounts, up to R$160, without private payment data',async()=>{
  const f=fixture();
  f.state.rows.push(
    {amount:1000,status:'paid',mode:'sandbox',owner_hash:'private1',token:'sensitive1',checked_at:'2026-11-12T11:00:00.000Z'},
    {amount:2000,status:'pending',mode:'sandbox',owner_hash:'private2'},
    {amount:3000,status:'paid',mode:'sandbox',owner_hash:'private3'},
    {amount:10000,status:'paid',mode:'sandbox',owner_hash:'private4'},
    {amount:50000,status:'paid',mode:'sandbox',owner_hash:'private5'},
    {amount:1000,status:'paid',mode:'production',owner_hash:'private6'},
    {amount:2000,status:'paid',mode:'sandbox',owner_hash:'private7'},
  );
  const recent=await f.call('recent');
  assert.equal(recent.status,200);
  assert.deepEqual(recent.data.donations,[
    {amount_cents:1000,paid_at:'2026-11-12T11:00:00.000Z'},
    {amount_cents:3000,paid_at:null},
    {amount_cents:10000,paid_at:null},
    {amount_cents:2000,paid_at:null},
  ]);
  assert.equal(recent.data.donations.reduce((sum,d)=>sum+d.amount_cents,0),16000);
  assert.ok(!JSON.stringify(recent.data).includes('private'));
  assert.equal((await f.handler(new Request(base+'?action=recent',{headers:{Origin:'https://other.invalid'}}))).status,403);
});
