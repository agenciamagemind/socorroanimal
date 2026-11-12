type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
type Mode = 'sandbox' | 'production';
const encoder = new TextEncoder();
const validAmount = (amount: unknown): amount is number => typeof amount==='number' && Number.isInteger(amount) && amount>=1 && amount<=2147483647;
const statuses = new Set(['pending','paid','expired','failed']);
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status=status; }
}
const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/../g) || [], x=>parseInt(x,16));
const b64 = (value: string) => btoa(value).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unb64 = (value: string) => atob(value.replace(/-/g,'+').replace(/_/g,'/'));
async function hmacKey(secret: string) { return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
async function sign(secret: string, value: string) { return hex(await crypto.subtle.sign('HMAC',await hmacKey(secret),encoder.encode(value))); }
async function validSignature(secret: string, body: string, signature: string) {
  return /^[a-f0-9]{64}$/i.test(signature) && crypto.subtle.verify('HMAC',await hmacKey(secret),unhex(signature),encoder.encode(body));
}
async function readBody(req: Request, limit: number): Promise<string> {
  if (Number(req.headers.get('content-length') || 0)>limit) throw new HttpError(413,'Solicitação muito grande.');
  const reader=req.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[]=[]; let length=0;
  try { while (true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>limit){await reader.cancel();throw new HttpError(413,'Solicitação muito grande.');} chunks.push(value); } }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(length); let at=0; for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function normalizePayment(data: Row, amount: number, creating=false): Row {
  if (data.amount!==undefined && (!Number.isFinite(Number(data.amount)) || Number(data.amount)!==amount)) throw new HttpError(502,'Não foi possível confirmar o valor do Pix.');
  if (!statuses.has(data.status || 'pending')) throw new HttpError(502,'Não foi possível consultar a confirmação do Pix.');
  const id=data.id || data.transaction_id;
  const code=data.pix_copy_paste;
  if (creating && (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id) || typeof code!=='string' || code.length<20 || code.length>4096)) throw new HttpError(502,'O código Pix ainda não está disponível. Aguarde um pouco e tente novamente.');
  const expires=typeof data.expires_at==='string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(data.expires_at) && Number.isFinite(Date.parse(data.expires_at)) ? data.expires_at : null;
  return {transaction_id:id || null,status:data.status || 'pending',pix_copy_paste:code || null,expires_at:expires};
}
export function publicPayment(row: Row): Row {
  return {token:row.token,amount:row.amount,status:['creating','unknown'].includes(row.status)?'pending':row.status,pix_copy_paste:row.pix_copy_paste,expires_at:row.expires_at,sandbox:row.mode==='sandbox'};
}
export function createHandler(env: Env, mode: Mode, transport: typeof fetch = fetch) {
  const sessionSecret=env.SOCORRO_SESSION_SECRET || '';
  const prefix=mode==='sandbox'?'SOCORRO_PAGUEZY_TEST_':'SOCORRO_PAGUEZY_LIVE_';
  const apiKey=env[prefix+'KEY'] || '',apiSecret=env[prefix+'SECRET'] || '';
  const webhookSecret=env[prefix+'WEBHOOK_SECRET'] || '';
  const origins=new Set((env.SOCORRO_ALLOWED_ORIGINS || 'https://socorroanimal.online,https://www.socorroanimal.online,https://agenciamagemind.github.io').split(',').map(v=>v.trim()).filter(Boolean));
  let serviceKey='';
  try { serviceKey=JSON.parse(env.SUPABASE_SECRET_KEYS || '{}').default || ''; } catch { /* compatible fallback below */ }
  serviceKey ||= env.SUPABASE_SERVICE_ROLE_KEY || '';
  const dbUrl=env.SUPABASE_URL || '';
  const ready=Boolean(sessionSecret.length>=32 && serviceKey && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(dbUrl) && apiKey.startsWith(mode==='sandbox'?'pk_test_':'pk_live_') && apiSecret.startsWith(mode==='sandbox'?'sk_test_':'sk_live_'));

  async function database(path: string, method='GET', body?: Row): Promise<any> {
    const headers: Record<string,string>={'apikey':serviceKey,'Content-Type':'application/json','Accept':'application/json'};
    if (!serviceKey.startsWith('sb_secret_')) headers.Authorization='Bearer '+serviceKey;
    const response=await transport(dbUrl+'/rest/v1/'+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new HttpError(503,'Não foi possível consultar seu Pix agora. Tente novamente em instantes.');
    return response.json();
  }
  const rpc=(name: string,body: Row)=>database('rpc/'+name,'POST',body);
  async function provider(path: string, method='GET', body?: Row): Promise<Row> {
    let response: Response;
    try { response=await transport('https://paguezy.com/api/v1'+path,{method,headers:{'Content-Type':'application/json','Accept':'application/json','X-Api-Key':apiKey,'X-Api-Secret':apiSecret},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000),redirect:'error'}); }
    catch { throw new HttpError(502,'Não foi possível confirmar a solicitação de Pix. Aguarde um pouco antes de tentar novamente.'); }
    if (!response.ok) throw new HttpError(502,'Não foi possível concluir esta solicitação de pagamento. Tente novamente em instantes.');
    let data: Row;
    try { data=await response.json(); } catch { throw new HttpError(502,'Não foi possível consultar seu Pix agora.'); }
    if (!data || typeof data!=='object' || data.success===false) throw new HttpError(502,'Não foi possível concluir esta solicitação de Pix.');
    for (const field of ['data','payment','transaction']) if(data[field] && typeof data[field]==='object') {data=data[field];break;}
    return data;
  }
  async function session(token: string, origin: string): Promise<Row | null> {
    const parts=token.split('.');
    if(parts.length!==2 || !await validSignature(sessionSecret,parts[0],parts[1])) return null;
    try { const data=JSON.parse(unb64(parts[0])); if(data.exp<Date.now()/1000 || data.mode!==mode || data.origin!==origin || !/^[a-f0-9]{64}$/.test(data.sub)) return null; return data; } catch {return null;}
  }
  async function issueSession(origin: string, previous: Row | null): Promise<string> {
    const sub=previous?.sub || hex(crypto.getRandomValues(new Uint8Array(32)));
    const payload=b64(JSON.stringify({sub,mode,origin,exp:Math.floor(Date.now()/1000)+86400}));
    return payload+'.'+await sign(sessionSecret,payload);
  }
  async function ownerRow(token: string, owner: string): Promise<Row> {
    if(!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404,'Esta cobrança não foi encontrada.');
    const params=new URLSearchParams({token:'eq.'+token,owner_hash:'eq.'+owner,mode:'eq.'+mode,limit:'1'});
    const rows=await database('socorro_pix_payments?'+params);
    if (!rows[0]) throw new HttpError(404,'Esta cobrança não foi encontrada.');
    return rows[0];
  }
  async function webhook(req: Request): Promise<Response> {
    if(req.method!=='POST') throw new HttpError(405,'Método não permitido.');
    if(!webhookSecret) throw new HttpError(503,'Webhook não configurado.');
    const raw=await readBody(req,65536);
    if(!await validSignature(webhookSecret,raw,req.headers.get('x-paguezy-signature') || '')) throw new HttpError(401,'Assinatura inválida.');
    let data: Row;
    try {data=JSON.parse(raw);} catch {throw new HttpError(400,'Evento inválido.');}
    if(!data || typeof data!=='object' || Array.isArray(data)) throw new HttpError(400,'Evento inválido.');
    if(data.event!=='payment.paid') return Response.json({received:true});
    const id=data.transaction_id, ref=data.external_reference;
    if(data.status!=='paid' || data.payment_method!=='pix' || typeof id!=='string' || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new HttpError(400,'Evento inconsistente.');
    const params=new URLSearchParams({mode:'eq.'+mode,limit:'2'});
    if(typeof ref==='string' && /^SA-[a-f0-9-]{32,36}$/.test(ref)) params.set('or',`(transaction_id.eq.${id},external_reference.eq.${ref})`);
    else params.set('transaction_id','eq.'+id);
    const rows=await database('socorro_pix_payments?'+params);
    if(!rows.length) return Response.json({received:true});
    const row=rows[0];
    if(rows.length!==1 || (row.transaction_id && row.transaction_id!==id) || (ref && row.external_reference!==ref) || !Number.isInteger(data.amount) || row.amount!==data.amount) throw new HttpError(409,'Cobrança inconsistente.');
    await rpc('socorro_update_pix',{p_token:row.token,p_status:'paid',p_transaction:id});
    return Response.json({received:true});
  }
  return async function handler(req: Request): Promise<Response> {
    const url=new URL(req.url),action=url.searchParams.get('action') || '';
    const origin=req.headers.get('origin') || '';
    const cors: Record<string,string>={'Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
    if(origins.has(origin)) {
      cors['Access-Control-Allow-Origin']=origin;
      cors['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
      cors['Access-Control-Allow-Headers']='authorization, content-type, x-csrf-token';
      cors['Access-Control-Max-Age']='600';
    }
    const result=(data: unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
    try {
      if(action==='webhook') return await webhook(req);
      if(!origins.has(origin)) throw new HttpError(403,'Origem não permitida.');
      if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
      if(action==='recent' && req.method==='GET') {
        if(!serviceKey || !dbUrl) throw new HttpError(503,'Doações recentes indisponíveis.');
        const params=new URLSearchParams({select:'amount,checked_at',mode:'eq.'+mode,status:'eq.paid',order:'checked_at.desc',limit:'50'});
        const rows=await database('socorro_pix_payments?'+params);
        const donations: {amount_cents:number;paid_at:string|null}[]=[];
        let total=0;
        for(const row of rows) {
          const amount=row.amount;
          if(!Number.isInteger(amount) || amount<=0 || total+amount>16000) continue;
          donations.push({amount_cents:amount,paid_at:typeof row.checked_at==='string'?row.checked_at:null});
          total+=amount;
          if(donations.length===10 || total===16000) break;
        }
        return result({donations});
      }
      if(sessionSecret.length<32) throw new HttpError(503,'O pagamento está temporariamente indisponível.');
      const token=(req.headers.get('authorization') || '').replace(/^Bearer\s+/i,'');
      const who=token?await session(token,origin):null;
      if(action==='bootstrap' && req.method==='GET') {
        const nextToken=await issueSession(origin,who);
        return result({ready,sandbox:mode==='sandbox',session_token:nextToken,csrf:await sign(sessionSecret,'csrf:'+nextToken)});
      }
      if(!who) throw new HttpError(401,'Sua sessão expirou. Atualize a página e tente novamente.');
      if(!ready) throw new HttpError(503,'O pagamento está temporariamente indisponível. Tente novamente em instantes.');
      const owner=hex(await crypto.subtle.digest('SHA-256',encoder.encode(who.sub)));
      if(action==='create' && req.method==='POST') {
        if(!await validSignature(sessionSecret,'csrf:'+token,req.headers.get('x-csrf-token') || '')) throw new HttpError(403,'Sua sessão expirou. Atualize a página e tente novamente.');
        if(!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415,'Solicitação inválida.');
        let input: Row;try{input=JSON.parse(await readBody(req,8192));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Solicitação inválida.');}
        if(!input || !validAmount(input.amount)) throw new HttpError(422,'Informe um valor de doação válido e maior que zero.');
        if(typeof input.request_id!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.request_id)) throw new HttpError(422,'Não foi possível iniciar esta solicitação. Atualize a página.');
        const ip=(req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
        const ipHash=await sign(sessionSecret,'ip:'+ip);
        const reserved=await rpc('socorro_reserve_pix',{p_owner:owner,p_request:input.request_id,p_amount:input.amount,p_ip:ipHash,p_mode:mode});
        if(reserved.rate_limited) throw new HttpError(429,'Você fez várias solicitações. Aguarde alguns minutos antes de gerar outro Pix.');
        const row=reserved.payment;
        if(!reserved.created) {
          if(['creating','unknown'].includes(row.status)) throw new HttpError(409,'Sua solicitação ainda está sendo verificada. Aguarde um pouco antes de tentar novamente.');
          if(row.amount!==input.amount) throw new HttpError(409,'Selecione o valor novamente para gerar outro Pix.');
          return result(publicPayment(row),201);
        }
        try {
          const data=normalizePayment(await provider('/payments','POST',{amount:input.amount,payment_method:'pix',external_reference:row.external_reference}),input.amount,true);
          const updated=await rpc('socorro_update_pix',{p_token:row.token,p_status:data.status,p_transaction:data.transaction_id,p_code:data.pix_copy_paste,p_expires:data.expires_at});
          return result(publicPayment(updated),201);
        } catch(e) {try{await rpc('socorro_update_pix',{p_token:row.token,p_status:'unknown'});}catch{}throw e;}
      }
      if(action==='status' && req.method==='GET') {
        const row=await ownerRow(url.searchParams.get('token') || '',owner);
        if(row.status==='paid' || !row.transaction_id) return result(publicPayment(row));
        const claimed=await rpc('socorro_claim_pix',{p_token:row.token});
        if(!claimed.claimed) return result(publicPayment(claimed.payment));
        const data=normalizePayment(await provider('/payments/'+encodeURIComponent(row.transaction_id)),row.amount);
        if(data.transaction_id && data.transaction_id!==row.transaction_id) throw new HttpError(502,'Não foi possível confirmar este Pix.');
        const updated=await rpc('socorro_update_pix',{p_token:row.token,p_status:data.status});
        return result(publicPayment(updated));
      }
      throw new HttpError(405,'Solicitação não permitida.');
    } catch(e) {
      if(e instanceof HttpError) return result({error:e.message},e.status);
      console.error('Socorro Pix: falha interna', e instanceof Error?e.name:'unknown');
      return result({error:'Não foi possível concluir esta solicitação. Tente novamente em instantes.'},500);
    }
  };
}
