/** Supabase Auth is an optional identity provider. PURL grants remain separate. */
export function createSupabaseAuth(env=process.env,{fetch:fetcher=globalThis.fetch}={}){
 const url=env.SUPABASE_URL?.replace(/\/$/,'');
 const publishableKey=env.SUPABASE_PUBLISHABLE_KEY??env.SUPABASE_ANON_KEY;
 const available=Boolean(url&&publishableKey);
 if(url){const parsed=new URL(url);if(parsed.username||parsed.password||!['http:','https:'].includes(parsed.protocol))throw Error('Invalid Supabase Auth URL');}
 const request=async(path,{token,body}={})=>{
  if(!available)throw Error('Supabase Auth unavailable');
  const response=await fetcher(`${url}/auth/v1${path}`,{method:body?'POST':'GET',headers:{apikey:publishableKey,...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error(`Supabase Auth rejected request (${response.status})`);return response.json();
 };
 return {
  available,
  config(){return {available,...(available?{url,publishable_key:publishableKey}:{}),credentials:'Out of band. Resource rights remain ownership/grant based.'};},
  async verify(token){const user=await request('/user',{token});if(!user||typeof user.id!=='string'||!user.id)throw Error('Identity provider returned no verified subject');return {id:user.id,issuer:`${url}/auth/v1`,label:'Verified member'};},
  async start(email,state){
   if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Provide a valid email address');
   if(typeof state!=='string'||!/^[A-Za-z0-9-]{32,128}$/.test(state))throw Error('Sign-in state must be generated and bound by the initiating browser');
   const redirect=env.PURL_BASE_URL?new URL(`/workspace?auth_state=${encodeURIComponent(state)}`,env.PURL_BASE_URL).href:undefined;
   await request(`/otp${redirect?`?redirect_to=${encodeURIComponent(redirect)}`:''}`,{body:{email,create_user:true}});
   return {sent:true,message:'Check your email for a sign-in link. Redirect URLs must be allowlisted in Supabase Auth.'};
  },
 };
}
