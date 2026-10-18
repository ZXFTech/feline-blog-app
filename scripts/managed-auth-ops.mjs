import{readFileSync,writeFileSync,renameSync,mkdirSync,existsSync}from'node:fs';
import{resolve,dirname}from'node:path';
import{createHash,randomUUID}from'node:crypto';
import{Pool}from'pg';
import{installManagedHistory}from'./lib/managed-history.mjs';
import{mutateManagedTask,readManagedTask}from'./lib/managed-task.mjs';
const flag=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const command=process.argv[2],file=flag('target'),recordFile=flag('record');
let pool,operation,claimed=false;
const persist=value=>{const path=resolve(recordFile),tmp=path+'.'+randomUUID()+'.tmp';writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});renameSync(tmp,path);};
try{
 if(!file||!['inspect','install','activate','pause','resume','reconcile'].includes(command))throw Error('MANAGED_COMMAND_INVALID');
 const raw=readFileSync(resolve(file),'utf8');if(Buffer.byteLength(raw)>16384)throw Error('MANAGED_TARGET_INVALID');
 const target=JSON.parse(raw),url=new URL(process.env.MIGRATION_DATABASE_URL??'');
 if(target.schemaVersion!==1||target.adapterVersion!=='managed-proxy-v1'||!['center','blog'].includes(target.service)||!['development','staging','production'].includes(target.environment)||
  !/^[a-z0-9-]{1,64}$/.test(target.projectRef??'')||url.hostname!==target.databaseHost||decodeURIComponent(url.pathname.slice(1))!==target.databaseName||
  !['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||url.search||url.hash||!/^[0-9a-f-]{36}$/.test(target.databaseInstanceId??'')||!/^[0-9a-f-]{36}$/.test(target.generation??''))throw Error('MANAGED_TARGET_INVALID');
 const fixture=process.argv.includes('--fixture')&&target.environment==='development'&&target.projectRef==='isolated-managed-fixture'&&url.hostname==='127.0.0.1'&&url.port==='54358'&&target.databaseName==='runtime_managed_history_blog';
 const local=['127.0.0.1','localhost'].includes(url.hostname);if(local&&!fixture)throw Error('MANAGED_TARGET_INVALID');
 if(!local&&(target.environment!=='production'||!new RegExp('(?:^|\\.)'+target.projectRef+'(?:\\.|$)').test(decodeURIComponent(url.username)+'.'+url.hostname)))throw Error('MANAGED_TARGET_INVALID');
 let ssl;if(!local){const ca=process.env.DATABASE_CA_PEM??(process.env.DATABASE_CA_FILE?readFileSync(process.env.DATABASE_CA_FILE,'utf8'):null);if(!ca)throw Error('MANAGED_CA_REQUIRED');ssl={ca,rejectUnauthorized:true};}
 pool=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:5000,query_timeout:35000,ssl});pool.on('error',()=>{});
 const options={...target,fixture};
 if(command==='inspect'){
  const binding=await readManagedTask(pool,options);console.log(JSON.stringify({code:'MANAGED_TASK_INSPECTED',generation:binding.state.generation,cronJobId:binding.job?.id??null,active:binding.job?.active??false}));
 }else if(command==='reconcile'){
  if(!recordFile)throw Error('MANAGED_RECORD_REQUIRED');operation=JSON.parse(readFileSync(resolve(recordFile),'utf8'));
  if(operation.targetDigest!==createHash('sha256').update(JSON.stringify(target)).digest('hex'))throw Error('MANAGED_RECORD_TARGET_MISMATCH');
  const binding=await readManagedTask(pool,options),receipt=operation.receipt;
  if(operation.action!=='install'&&(!receipt?.cronJobId||binding.job?.id!==receipt.cronJobId||binding.state.generation!==receipt.generation||binding.job.active!==(operation.action!=='pause')))throw Error('MANAGED_RECONCILIATION_REQUIRED');
  claimed=true;operation={...operation,state:'verified',verifiedAt:new Date().toISOString()};persist(operation);console.log(JSON.stringify({code:'MANAGED_TASK_RECONCILED',cronJobId:binding.job?.id??null}));
 }else{
  if(!recordFile)throw Error('MANAGED_RECORD_REQUIRED');mkdirSync(dirname(resolve(recordFile)),{recursive:true});
  operation={schemaVersion:1,operationId:randomUUID(),action:command,targetDigest:createHash('sha256').update(JSON.stringify(target)).digest('hex'),state:'notAttempted',receipt:null,createdAt:new Date().toISOString()};
  if(existsSync(resolve(recordFile)))throw Error('MANAGED_REPLAY_FORBIDDEN');writeFileSync(resolve(recordFile),JSON.stringify(operation,null,2)+'\n',{mode:0o600,flag:'wx'});
  claimed=true;operation.state='unknown';persist(operation);
  const receipt=command==='install'?await installManagedHistory(pool,options):await mutateManagedTask(pool,options,command,async value=>{operation.receipt=value;persist(operation);});
  operation={...operation,state:'acknowledged',result:receipt};persist(operation);
  if(command!=='install'){const binding=await readManagedTask(pool,options);if(binding.job?.id!==receipt.cronJobId||binding.job.active!==receipt.active)throw Error('MANAGED_WRITE_READBACK_MISMATCH');}
  operation.state='verified';operation.verifiedAt=new Date().toISOString();persist(operation);console.log(JSON.stringify({code:'MANAGED_'+command.toUpperCase()+'_VERIFIED',changed:receipt.changed,cronJobId:receipt.cronJobId??null}));
 }
}catch(error){
 if(claimed&&operation&&recordFile){if(error.outcomeUnknown===false)operation.state='rolledBack';operation.sqlCode=/^[A-Z0-9]{5}$/.test(error.sqlCode??'')?error.sqlCode:null;operation.resultCode=/^MANAGED_[A-Z_]+$/.test(error.message)?error.message:'MANAGED_COMMAND_FAILED';try{persist(operation);}catch{}}
 console.log(JSON.stringify({code:/^MANAGED_[A-Z_]+$/.test(error.message)?error.message:'MANAGED_COMMAND_FAILED',sqlCode:/^[A-Z0-9]{5}$/.test(error.sqlCode??'')?error.sqlCode:null}));process.exitCode=1;
}finally{await pool?.end();}
