import { randomBytes, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const stablePrincipal = (issuer, subject) => 'id_' + digest(JSON.stringify([issuer, subject]));
export function encryptionKey(raw) {
  if(typeof raw!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(raw))return null;
  const key=Buffer.from(raw, 'base64');
  return key.length===32?key:null;
}
export function seal(value, key, aad) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b=>b.toString('base64url')).join('.');
}
export function unseal(value, key, aad) {
  const [iv, tag, data]=value.split('.').map(b=>Buffer.from(b, 'base64url'));
  const cipher=createDecipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
}
export const mac = (value, key) => createHmac('sha256', key).update(value).digest('base64url');
export function equal(a, b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x, y);
}
