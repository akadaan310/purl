import urllib.request,urllib.error,json,time,sys,pathlib,hashlib,uuid
BASE='https://purl-api-production.up.railway.app'
OUT=pathlib.Path('/workspace/purl/evidence/deployment/public-cold-session/final-handoff-http')
token=None
calls=[]
seq=0
last=0
objects={}

def clean(o):
 if isinstance(o,dict): return {k:('[REDACTED]' if k.lower() in ['token','access_token','refresh_token','authorization','bearer','bearer_token'] else clean(v)) for k,v in o.items()}
 if isinstance(o,list): return [clean(v) for v in o]
 if isinstance(o,str) and token: return o.replace(token,'[REDACTED]')
 return o

def req(path,method='GET',body=None,auth=False,key=None,name=None):
 global seq,token,last
 time.sleep(max(0,1.1-(time.monotonic()-last)))
 url=path if path.startswith('https://') else BASE+path
 assert url.startswith(BASE+'/'), 'only public PURL service authorized'
 h={'Accept':'application/purl+json'}
 if body is not None: h['Content-Type']='application/json'
 if auth:
  assert token,'no session token'
  h['Authorization']='Bearer '+token
 if key: h['Idempotency-Key']=key
 q=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
 started=time.time()
 try: r=urllib.request.urlopen(q,timeout=60)
 except urllib.error.HTTPError as e:r=e
 last=time.monotonic(); raw=r.read().decode(); status=r.status
 try:b=json.loads(raw)
 except ValueError:b=raw
 if path=='/api/session' and method=='POST' and 200<=status<300:
  for k in ['token','access_token','bearer_token']:
   if k in b:token=b[k];break
  if not token:
   print('WARNING session shape '+str(list(b)),flush=True)
 seq+=1
 rec=clean({'sequence':seq,'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(started)),'request':{'method':method,'url':url,'headers':h,'body':body},'response':{'status':status,'headers':dict(r.headers),'body':b}})
 f=OUT/('%03d-%s.json'%(seq,name or path.strip('/').replace('/','-') or 'root'))
 f.write_text(json.dumps(rec,indent=2)+'\n')
 objects[name or str(seq)]=b
 calls.append({'sequence':seq,'file':f.name,'status':status,'method':method,'url':url})
 (OUT/'http-index.json').write_text(json.dumps(calls,indent=2)+'\n')
 return b,status
print('HTTP SESSION READY',flush=True)
for line in sys.stdin:
 try:
  cmd=json.loads(line)
  if cmd.get('action')=='calc':
   code=cmd['code']; exec(code,globals());continue
  b,s=req(**cmd)
  print(json.dumps({'status':s,'body':clean(b)},ensure_ascii=False),flush=True)
 except Exception as e:print(json.dumps({'error':str(e)}),flush=True)
