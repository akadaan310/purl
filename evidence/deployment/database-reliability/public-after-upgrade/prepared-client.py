#!/usr/bin/env python3
"""Narrow authorized post-upgrade public HTTP client. No request without --go."""
import argparse,datetime,hashlib,json,pathlib,sys,time,urllib.error,urllib.request,uuid

BASE='https://purl-api-production.up.railway.app'
OUT=pathlib.Path('/workspace/purl/evidence/deployment/database-reliability/public-after-upgrade')

class Client:
 def __init__(self):
  self.token=None; self.records=[]; self.last_response=0; self.program_id=None; self.execution_id=None
  self.run_id='sql-reliability-'+uuid.uuid4().hex
 def clean(self,value):
  if isinstance(value,dict):
   return {k:('[REDACTED]' if k.lower() in ('token','access_token','refresh_token','bearer_token') or (k.lower()=='authorization' and isinstance(v,str)) else self.clean(v)) for k,v in value.items()}
  if isinstance(value,list):return [self.clean(v) for v in value]
  if isinstance(value,str) and self.token:return value.replace(self.token,'[REDACTED]')
  return value
 def req(self,path,method='GET',body=None,auth=False,name='request'):
  time.sleep(max(0,1.1-(time.monotonic()-self.last_response)))
  assert path.startswith('/') and not any(x in path.lower() for x in ['token=','secret=','password='])
  headers={'Accept':'application/purl+json'}
  if body is not None:headers['Content-Type']='application/json'
  if auth:
   assert self.token
   headers['Authorization']='Bearer '+self.token
  if method=='POST' and path!='/api/session':
   # Payload-bound key: distinct operations with identical retries use the same key.
   digest=hashlib.sha256(json.dumps(body,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
   headers['Idempotency-Key']=self.run_id+'-'+name+'-'+digest
  wire_body=None if body is None else json.dumps(body).encode()
  started=datetime.datetime.now(datetime.timezone.utc).isoformat();start=time.monotonic();status=None;response_headers={};raw='';error=None
  try:
   try:r=urllib.request.urlopen(urllib.request.Request(BASE+path,data=wire_body,headers=headers,method=method),timeout=90)
   except urllib.error.HTTPError as ex:r=ex
   status=r.status;response_headers=dict(r.headers);raw=r.read().decode()
   try:result=json.loads(raw)
   except json.JSONDecodeError:result={'unparsed_response':raw}
  except Exception as ex:
   error=type(ex).__name__+': '+str(ex);result={'transport_error':error}
  elapsed=time.monotonic()-start;self.last_response=time.monotonic()
  if method=='POST' and path=='/api/session' and status in (200,201):self.token=result.get('token')
  rec=self.clean({'sequence':len(self.records)+1,'name':name,'started_at':started,'duration_seconds':round(elapsed,6),'request':{'method':method,'url':BASE+path,'headers':headers,'body':body},'response':{'status':status,'headers':response_headers,'body':result,'raw_body':raw},'transport_error':error})
  self.records.append(rec);f=OUT/(str(rec['sequence']).zfill(3)+'-'+name+'.json');f.write_text(json.dumps(rec,indent=2,ensure_ascii=False)+'\n')
  (OUT/'http-index.json').write_text(json.dumps([{'file':str(i+1).zfill(3)+'-'+r['name']+'.json','sequence':r['sequence'],'started_at':r['started_at'],'duration_seconds':r['duration_seconds'],'method':r['request']['method'],'url':r['request']['url'],'status':r['response']['status']} for i,r in enumerate(self.records)],indent=2)+'\n')
  print(json.dumps({'sequence':rec['sequence'],'name':name,'status':status,'duration_seconds':rec['duration_seconds'],'error':error or (result.get('error') if isinstance(result,dict) else None)}),flush=True)
  return result,status
 def require(self,result,status,allowed,action):
  if status not in allowed:raise RuntimeError(action+' failed HTTP '+str(status))
  return result
 def act(self,operation,payload=None):
  current,status=self.req('/api/programs/'+self.program_id,auth=True,name=operation+'-current-version');self.require(current,status,[200],operation+' version read')
  data=dict(payload or {});data['expected_version']=current['program']['version']
  result,status=self.req('/api/programs/'+self.program_id+'/'+operation,method='POST',body=data,auth=True,name=operation)
  return result,status
 def run(self):
  session,status=self.req('/api/session',method='POST',body={'label':'Post-SQL-upgrade native arithmetic reliability check','kind':'agent'},name='new-principal');self.require(session,status,[200,201],'session');assert self.token
  created,status=self.req('/api/programs',method='POST',body={'title':'Post-SQL-upgrade bounded arithmetic reliability check','kind':'program','language':'purl','visibility':'private','source':'input number | math.add 2 | math.multiply 3','input_schema':{'type':'number'},'output_schema':{'type':'number'},'tests':[{'input':4,'expected':18},{'input':0,'expected':6},{'input':-2,'expected':0}]},auth=True,name='create-private-arithmetic');self.require(created,status,[201],'create');program=created['program'];self.program_id=program['id'];assert program['visibility']=='private'
  compiled,status=self.act('compile');self.require(compiled,status,[200],'compile');assert compiled['ok']
  built,status=self.act('build');self.require(built,status,[200],'build');build=built['build'];assert build['status']=='passed' and len(build['tests'])==3 and all(t['passed'] for t in build['tests'])
  queued,status=self.act('run',{'input':4,'seed':7});self.require(queued,status,[202],'run');self.execution_id=queued['execution']['id']
  deadline=time.monotonic()+480;execution=None;polls=0
  while time.monotonic()<deadline:
   # Poll conservatively: at least five seconds between completed reads.
   time.sleep(5);polls+=1
   result,status=self.req('/api/executions/'+self.execution_id,auth=True,name='execution-poll-'+str(polls))
   if status!=200:
    # Retain transient GET failures; never requeue an execution.
    if status in [None,429,500,502,503,504]:continue
    raise RuntimeError('execution read failed HTTP '+str(status))
   execution=result['execution'];print(json.dumps({'execution_id':self.execution_id,'status':execution['status'],'attempts':execution.get('attempts'),'value':execution.get('value')}),flush=True)
   if execution['status'] in ['succeeded','completed','failed','cancelled','denied','blocked']:break
  assert execution and execution['status']=='succeeded', 'No successful terminal execution within bounded poll window'
  assert execution['input']==4 and execution['value']==18
  receipt=execution.get('receipt');assert receipt and receipt['execution_id']==execution['id'] and receipt['build_id']==build['id']
  assert receipt.get('content_id') and receipt.get('artifact_content_id') and receipt.get('value_id')==execution.get('value_id')
  replay,status=self.req('/api/programs/'+self.program_id+'/replay',auth=True,name='strict-replay');self.require(replay,status,[200],'strict replay');assert replay['valid'] and replay['program_valid'] and not replay['problems'] and all(x['valid'] and x['replayable'] for x in replay['executions'])
  return {'principal':session['principal'],'program':{'id':program['id'],'url':program['url'],'visibility':program['visibility'],'source':program['source']},'build':build,'execution':execution,'replay':replay,'polls':polls,'receipt_checks':{'execution_matches':True,'build_matches':True,'content_id_present':True,'artifact_content_id_present':True,'value_id_matches':True},'status':'PASS'}
 def finish(self,result):
  errors=[{'sequence':r['sequence'],'status':r['response']['status'],'duration_seconds':r['duration_seconds'],'error':r['response']['body']} for r in self.records if r['response']['status'] is None or r['response']['status']>=400]
  result.update({'sql_upgrade_root_report':{'supabase_version':'20261018152346','applied_at':'2026-10-18T15:23:46Z','fingerprints':'Root reports revision63/document/entities/audit fingerprints unchanged','rpc_authority':'Root reports anon/authenticated denied, service allowed','scope':'Function changed only conditional projection UPSERT; JavaScript deployment unchanged','verification_source':'Parent/root instruction, not an independent database read by this client'},'schema':'purl.post-sql-upgrade-public-arithmetic/1','run_id':self.run_id,'program_id':self.program_id,'execution_id':self.execution_id,'request_count':len(self.records),'errors_preserved':errors,'timings':[{'sequence':r['sequence'],'method':r['request']['method'],'url':r['request']['url'],'status':r['response']['status'],'seconds':r['duration_seconds']} for r in self.records],'scope':'One private native arithmetic lifecycle over public API after root-authorized additive SQL upgrade; product JavaScript deployment unchanged according to root. No broad suite, source, database or environment-variable inspection. No publish/checkpoint/extra artifact fetch.','limits':'One successful narrow run cannot establish general database reliability or elimination of every statement timeout. Existing frozen programs and reports were not touched.'})
  (OUT/'report.json').write_text(json.dumps(self.clean(result),indent=2,ensure_ascii=False)+'\n')
  assert self.token is None or not any(self.token in f.read_text() for f in OUT.rglob('*') if f.is_file())
  (OUT/'redaction-check.json').write_text(json.dumps({'issued_bearer_in_any_evidence_file':False,'token_in_urls':False,'storage':'Memory only; cleared at process end.'},indent=2)+'\n')
  self.token=None
  execution=result.get('execution',{});md='Post-SQL-upgrade public API check: **'+result['status']+'**.\n\nOne private native program; source `input number | math.add 2 | math.multiply 3`; three build tests.\n\nProgram: `'+str(self.program_id)+'`. Execution: `'+str(self.execution_id)+'`. Output: `'+str(execution.get('value'))+'`; attempts: `'+str(execution.get('attempts'))+'`.\n\n'+str(len(self.records))+' HTTP exchanges; '+str(len(errors))+' errors retained. Exact timings, receipt and strict replay are in report.json. No publish, checkpoint or original program mutations. This narrow check does not establish general database reliability.\n';(OUT/'report.md').write_text(md)
  print(json.dumps({'status':result['status'],'program_id':self.program_id,'execution_id':self.execution_id,'request_count':len(self.records),'errors':len(errors),'report':str(OUT/'report.json')}),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--go',action='store_true',help='Run only after explicit root GO');args=parser.parse_args()
 if not args.go:
  print('PREPARED ONLY: no HTTP requests or mutations. Await explicit root GO.');sys.exit(0)
 client=Client();result={}
 try:result=client.run()
 except Exception as ex:result={'status':'FAIL','failure':type(ex).__name__+': '+str(ex)}
 client.finish(result)
 sys.exit(0 if result['status']=='PASS' else 1)
