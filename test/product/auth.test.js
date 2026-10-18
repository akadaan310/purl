import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseAuth} from '../../service/auth.js';
test('unconfigured provider is explicitly unavailable and never fabricates identity',async()=>{
 const auth=createSupabaseAuth({});assert.equal(auth.available,false);await assert.rejects(auth.verify('x'),/unavailable/);
});
test('provider verifier uses verified subject and rejects editable identity claims',async()=>{
 const calls=[];const auth=createSupabaseAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-key'},{fetch:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'verified-subject',email:'user@example.com',app_metadata:{},user_metadata:{admin:true,id:'fake'}}),{status:200});}});
 const identity=await auth.verify('provider-access-token');assert.equal(identity.id,'verified-subject');assert.equal(identity.issuer,'https://test.supabase.co/auth/v1');assert.equal(identity.admin,undefined);assert.equal(calls[0].options.headers.Authorization,'Bearer provider-access-token');
 await assert.rejects(auth.start('bad-email'),/email/);
 await assert.rejects(auth.start('user@example.com'),/state/);
});
test('OTP redirect carries browser-bound state using provider redirect_to query',async()=>{
 let called;const auth=createSupabaseAuth({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',PURL_BASE_URL:'https://purl.example'},{fetch:async(url,options)=>{called={url,body:JSON.parse(options.body)};return new Response('{}');}});
 await auth.start('user@example.com','a'.repeat(36));const target=new URL(called.url);assert.equal(target.pathname,'/auth/v1/otp');assert.equal(target.searchParams.get('redirect_to'),'https://purl.example/workspace?auth_state='+'a'.repeat(36));assert.equal(called.body.email_redirect_to,undefined);
});
