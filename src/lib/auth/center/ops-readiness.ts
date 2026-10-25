import{postgresPool}from'@/db/postgres/runtime';
import{verifyManagedContract}from'./managed-contract.mjs';
import requirements from'./managed-proxy-requirements.json';
import{opsAdapterVersion,opsReleaseBinding}from'./release';
import type {OpsDiagnostic} from '@/lib/auth/center/ops-diagnostics';

function validCredential(){
 const secret=process.env.OPS_STATUS_READ_SECRET;
 if(!secret||!/^[A-Za-z0-9+/]{43}=$/.test(secret))return false;
 const bytes=Buffer.from(secret,'base64');
 if(bytes.length!==32||bytes.toString('base64')!==secret||new Set(bytes).size<16||[process.env.FELINE_SESSION_SECRET,process.env.USER_CENTER_CLIENT_SECRET,process.env.JWT_SECRET].includes(secret))return false;
 try{return !Object.values(JSON.parse(process.env.FELINE_GRANT_KEYRING??'{}').keys??{}).includes(secret);}catch{return false;}
}
export async function opsReady(diagnostic?:OpsDiagnostic){
 diagnostic?.enter('managed_credential');
 if(!validCredential()){diagnostic?.reject('check_rejected');return false;}
 const acquire=()=>postgresPool.connect();
 let client:Awaited<ReturnType<typeof acquire>>|undefined,expired=false,timer:ReturnType<typeof setTimeout>|undefined;
 const work=(async()=>{
  const adapterVersion=opsAdapterVersion(diagnostic),binding=process.env.VERCEL==='1'?opsReleaseBinding(diagnostic):null;
  diagnostic?.enter('managed_acquire');
  const acquired=await acquire();if(expired){acquired.release(true);return false;}client=acquired;
  let broken=false;
  try{
   diagnostic?.enter('managed_contract');
   await client.query('BEGIN');await client.query('SET LOCAL statement_timeout = 800');
   if(adapterVersion==='managed-proxy-v1')await verifyManagedContract(client,{service:'blog',requirements});
   diagnostic?.enter('cleanup_summary');
   const result=await client.query('SELECT auth_ops.cleanup_status() AS summary');
   const safe=result.rowCount===1&&result.rows[0].summary?.adapterVersion===adapterVersion&&(!binding?.generation||result.rows[0].summary?.generation===binding.generation);
   if(!safe)diagnostic?.reject('binding_mismatch');
   await client.query(safe?'COMMIT':'ROLLBACK');return safe;
  }catch{diagnostic?.reject('contract_rejected');try{if(!expired)await client.query('ROLLBACK');}catch{broken=true;}return false;}
  finally{if(!expired){if(broken)client.release(true);else client.release();client=undefined;}}
 })();
 try{return await Promise.race([work,new Promise<boolean>(resolve=>{timer=setTimeout(()=>{diagnostic?.reject('managed_budget_exhausted');expired=true;client?.release(true);client=undefined;resolve(false);},1000);})]);}
 catch{diagnostic?.reject('connection_failed');return false;}
 finally{if(timer)clearTimeout(timer);}
}
