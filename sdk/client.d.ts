export interface Program {id:string;title:string;kind:string;language:string;source:unknown;version:number;visibility:'public'|'private'|'unlisted';url:string;owner:string;builds:unknown[];state:unknown}
export interface Execution {id:string;status:string;input:unknown;output?:unknown;artifacts?:string[];logs?:unknown[];environment?:unknown}
export declare class PurlClient {
  constructor(address:string,options?:{token?:string;fetch?:typeof fetch});
  token:string|null; origin:string; programId:string|null;
  request(path:string,options?:{method?:string;body?:unknown;idempotencyKey?:string;signal?:AbortSignal}):Promise<any>;
  discover():Promise<any>;session(label?:string,kind?:string):Promise<any>;me():Promise<any>;list():Promise<{items:Program[]}>;
  templates():Promise<any>;operators():Promise<any>;create(definition:Partial<Program>&{title:string;source:unknown}):Promise<{program:Program}>;
  registry():Promise<any>;compile(source:unknown):Promise<any>;compileTrace(spec:unknown):Promise<any>;checkProjection(spec:unknown):Promise<any>;
  get(id?:string):Promise<{program:Program}>;manifest(id?:string):Promise<any>;continuity(id?:string):Promise<any>;history(id?:string):Promise<any>;replay(id?:string):Promise<any>;
  invoke(id:string,operation:string,body:unknown,options?:{idempotencyKey?:string}):Promise<any>;act(id:string,operation:string,input?:unknown,options?:{idempotencyKey?:string}):Promise<any>;
  execution(id:string):Promise<{execution:Execution}>;artifact(id:string):Promise<any>;awaitExecution(id:string,options?:{timeoutMs?:number;pollMs?:number;signal?:AbortSignal}):Promise<Execution>;
}
