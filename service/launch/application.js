import { createLaunchStore } from './store.js';
import { IdentityService } from './identity.js';
import { ProviderConsentService } from './provider-consent.js';
import { MemoryService } from './memory.js';
import { CatalogService } from './catalog.js';
import { CgitService } from './cgit.js';
import { ModelGateway } from './models.js';
import { ConstellationService } from './constellations.js';
import { ResourceService } from './resources.js';

export function createLaunchApplication({env=process.env,store=createLaunchStore(env),fetch=globalThis.fetch}={}){
 const product=env.PURL_PRODUCT??'purls',baseUrl=env.PURL_BASE_URL??`http://127.0.0.1:${env.PORT??8180}`;
 const identity=new IdentityService({store,product,baseUrl,env,fetch});
 const providerConsent=new ProviderConsentService({store,identity,baseUrl,env,fetch});
 const memory=new MemoryService({store,baseUrl});
 const cgit=new CgitService({store,baseUrl,fetch,githubToken:env.PURL_GITHUB_READ_TOKEN});
 const gateway=new ModelGateway({store,encryptionKey:env.MODEL_ENCRYPTION_KEY??env.PURL_IDENTITY_ENCRYPTION_KEY,env,fetch});
 const identities=new Map([[product,identity]]);
 const identityFor=target=>{
  if(!identities.has(target))identities.set(target,new IdentityService({store,product:target,baseUrl:target==='cgit'?(env.CGIT_BASE_URL??baseUrl):(env.PURLS_BASE_URL??baseUrl),env:{...env,PURL_PRODUCT:target,PURL_OIDC_CLIENT_ID:env[`${target.toUpperCase()}_OIDC_CLIENT_ID`]??env.PURL_OIDC_CLIENT_ID,PURL_OIDC_CLIENT_SECRET:env[`${target.toUpperCase()}_OIDC_CLIENT_SECRET`]??env.PURL_OIDC_CLIENT_SECRET},fetch}));
  return identities.get(target);
 };
 const authenticateActor=async(credentialId,options={})=>{
  for(const target of options.product?[options.product]:['purls','cgit']){
   const provider=identityFor(target),actor=await provider.authenticateCredentialId(credentialId,{product:target});
   if(!actor)continue;
   // A domain integration grant is revalidated against the consented target
   // profile. It never becomes a browser session or expands an agent's token.
   try{const grant=await provider.authorizeIntegration(actor,'cgit',['cgit:write']);return {...actor,scopes:[...new Set([...actor.scopes,...grant.scopes])],integration_authority:{product:'cgit',source_product:actor.product,scopes:grant.scopes}};}catch{return actor;}
  }
  return null;
 };
 const constellations=new ConstellationService({store,gateway,cgit,authenticateActor});
 const catalog=new CatalogService({store,memory,gateway,cgit,constellations,baseUrl});
 const resources=new ResourceService({store,baseUrl,authenticateActor});
 const app={env,store,product,baseUrl,identity,providerConsent,memory,cgit,gateway,constellations,catalog,resources,authenticateActor};
 app.maintain=async()=>{const results=[];for(const target of ['purls','cgit']){const service=identityFor(target);results.push({product:target,expired:await service.compactExpired({limit:100,maxBuckets:32}),deletions:await service.resumeDeletions({limit:10})});}return results;};
 app.configureOrigin=origin=>{app.baseUrl=new URL(origin).origin;for(const service of [identity,providerConsent,memory,cgit,catalog,resources])service.baseUrl=app.baseUrl;};
 return app;
}
