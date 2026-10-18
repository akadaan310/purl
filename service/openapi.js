const json={content:{'application/json':{schema:{type:'object'}}}};
const response={200:{description:'Successful read',...json},400:{description:'Invalid request'},401:{description:'Authentication required'},403:{description:'Insufficient current authority'},409:{description:'Version or idempotency conflict'},422:{description:'Schema, build or runtime contract rejected'}};
const mutation=(summary)=>({
  summary,security:[{bearer:[]}],
  parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}},{name:'Idempotency-Key',in:'header',schema:{type:'string'}}],
  requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{expected_version:{type:'integer',minimum:1},input:{},source:{},summary:{type:'string'}},required:['expected_version']}}}},
  responses:response,
});
export function openapi(){
 const paths={'/.well-known/purl':{get:{summary:'Discover service, SDK, templates, operators and mission',responses:response}},'/api/session':{post:{summary:'Create a self-declared principal',requestBody:{required:true,...json},responses:response},get:{summary:'Inspect authenticated principal',responses:response}},'/api/programs':{get:{summary:'List visible programs',responses:response},post:{summary:'Create a typed program or authored performer',security:[{bearer:[]}],requestBody:{required:true,...json},responses:response}},'/api/programs/{id}':{get:{summary:'Read visible program source and state',responses:response}},'/api/openapi':{get:{summary:'Read this API description',responses:response}}};
 for(const name of ['manifest','history','continuity','replay','diff','mission'])paths[`/api/programs/{id}/${name}`]={get:{summary:`Read ${name}`,responses:response}};
 for(const name of ['source','compile','build','run','publish','fork','checkpoint','propose','commit','grants','revoke','join','move','mission'])paths[`/api/programs/{id}/${name}`]={...paths[`/api/programs/{id}/${name}`],post:mutation(name)};
 for(const name of ['executions','artifacts','releases'])paths[`/api/${name}/{id}`]={get:{summary:`Read authorized ${name}`,responses:response}};
 return {openapi:'3.1.0',info:{title:'PURL',version:'0.2.0',description:'Discovery does not convey authority. All mutations are explicit POST requests with current grants and expected versions.'},servers:[{url:'/'}],components:{securitySchemes:{bearer:{type:'http',scheme:'bearer'}}},paths};
}
