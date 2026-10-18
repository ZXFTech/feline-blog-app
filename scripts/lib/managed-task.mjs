import {inspectManagedBinding} from './managed-history.mjs';
import {verifyManagedContract} from '../../src/lib/auth/center/managed-contract.mjs';
const roles=['auth_ops_owner','auth_cleanup_scheduler'];
const quote=name=>{if(!/^[a-z_][a-z0-9_]{0,62}$/.test(name??''))throw Error('MANAGED_ROLE_INVALID');return '"'+name+'"';};

async function target(client,options){
 const row=(await client.query("SELECT current_user AS role,current_database() AS database,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
 if(row.database!==options.databaseName||row.rolsuper||!row.rolcreaterole||!row.rolbypassrls)throw Error('MANAGED_MAINTENANCE_INVALID');
 const metadata=(await client.query(options.service==='center'?"SELECT app_env,database_instance_id::text AS instance FROM public.service_runtime_metadata WHERE id=1":"SELECT generation::text AS instance FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'")).rows[0];
 if(!metadata||metadata.instance!==options.databaseInstanceId||(options.service==='center'&&metadata.app_env!==options.environment))throw Error('MANAGED_INSTANCE_MISMATCH');
 if(!/^[0-9a-f-]{36}$/.test(options.generation??''))throw Error('MANAGED_GENERATION_REQUIRED');
 await verifyManagedContract(client,options);
 return row;
}
async function temporarily(client,maintenance,work,alter=false){
 for(const role of roles)await client.query('GRANT '+quote(role)+' TO '+quote(maintenance)+' WITH SET TRUE,INHERIT FALSE');
 await client.query('GRANT USAGE ON SCHEMA cron TO auth_cleanup_scheduler');
 if(alter)await client.query('GRANT EXECUTE ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean) TO auth_cleanup_scheduler');
 await work();
 await client.query('RESET ROLE');
 if(alter)await client.query('REVOKE EXECUTE ON FUNCTION cron.alter_job(bigint,text,text,text,text,boolean) FROM auth_cleanup_scheduler');
 await client.query('REVOKE USAGE ON SCHEMA cron FROM auth_cleanup_scheduler');
 for(const role of roles)await client.query('GRANT '+quote(role)+' TO '+quote(maintenance)+' WITH SET FALSE,INHERIT FALSE');
}

// The caller must durably claim this operation and mark it unknown before calling.
// A receipt is persisted while the transaction is open, before COMMIT can be lost.
export async function mutateManagedTask(pool,options,action,persistReceipt){
 if(!['activate','pause','resume'].includes(action)||typeof persistReceipt!=='function')throw Error('MANAGED_ACTION_INVALID');
 const c=await pool.connect();let commitAttempted=false;
 try{
  await c.query("BEGIN; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='1s'; SET LOCAL search_path=pg_catalog,pg_temp");
  const maintenance=await target(c,options);
  await c.query('GRANT auth_ops_owner TO '+quote(maintenance.role)+' WITH SET TRUE,INHERIT FALSE');
  await c.query('SET LOCAL ROLE auth_ops_owner');
  // Serializes operators without changing generation or any scan boundary.
  const locked=(await c.query("SELECT * FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup' FOR UPDATE")).rows[0];
  await c.query('RESET ROLE; GRANT auth_ops_owner TO '+quote(maintenance.role)+' WITH SET FALSE,INHERIT FALSE');
  const before=await inspectManagedBinding(c,options);
  if(locked.generation!==before.state.generation||String(locked.cron_job_id)!==String(before.state.cron_job_id))throw Error('MANAGED_BINDING_MISMATCH');
  let jobId=before.job?.id??null;
  if(action==='activate'&&jobId!==null)throw Error('MANAGED_ALREADY_BOUND');
  if(action!=='activate'&&(!jobId||String(options.cronJobId??'')!==jobId))throw Error('MANAGED_JOB_ID_REQUIRED');
  if(action==='activate'){
   const floor=(await c.query('SELECT COALESCE(max(runid),0)::text AS value FROM cron.job_run_details')).rows[0].value;
   await c.query('ALTER ROLE auth_cleanup_scheduler LOGIN PASSWORD NULL');
   await temporarily(c,maintenance.role,async()=>{
    await c.query('SET LOCAL ROLE auth_cleanup_scheduler');
    jobId=String((await c.query("SELECT cron.schedule('auth-cleanup','* * * * *','SELECT auth_ops.cleanup_tick()') AS id")).rows[0].id);
    if(!/^[1-9][0-9]*$/.test(jobId))throw Error('MANAGED_RECEIPT_INVALID');
    await persistReceipt({cronJobId:jobId,generation:locked.generation,initialFloor:floor});
    await c.query('RESET ROLE; SET LOCAL ROLE auth_ops_owner');
    await c.query("UPDATE auth_ops.cleanup_state SET cron_job_id=$1,activated_at=clock_timestamp(),next_due_at=date_trunc('minute',clock_timestamp()),history_initial_floor=$2,history_prune_floor=$2,history_prune_cursor=$2 WHERE job_name='auth-cleanup'",[jobId,floor]);
   });
  }else{
   if(before.job.active===(action==='resume')){await c.query('ROLLBACK');return{changed:false,cronJobId:jobId,generation:locked.generation,active:before.job.active};}
   await temporarily(c,maintenance.role,async()=>{
    await c.query('SET LOCAL ROLE auth_cleanup_scheduler');
    await c.query('SELECT cron.alter_job($1::bigint,active:=$2::boolean)',[jobId,action==='resume']);
    await persistReceipt({cronJobId:jobId,generation:locked.generation,active:action==='resume'});
   },true);
  }
  await verifyManagedContract(c,options);
  const after=await inspectManagedBinding(c,options);
  if(after.job?.id!==jobId||after.job.active!==(action!=='pause'))throw Error('MANAGED_WRITE_READBACK_MISMATCH');
  commitAttempted=true;await c.query('COMMIT');
  return{changed:true,cronJobId:jobId,generation:locked.generation,active:action!=='pause'};
 }catch(error){
  let rolledBack=false;if(!commitAttempted)try{await c.query('ROLLBACK');rolledBack=true;}catch{}
  const safe=new Error(commitAttempted||!rolledBack?'MANAGED_WRITE_OUTCOME_UNKNOWN':/^MANAGED_[A-Z_]+$/.test(error.message)?error.message:'MANAGED_TASK_FAILED');
  safe.sqlCode=error.code??null;safe.outcomeUnknown=commitAttempted||!rolledBack;throw safe;
 }finally{c.release(commitAttempted===true);}
}
export async function readManagedTask(pool,options){
 const c=await pool.connect();let broken=false;
 try{await c.query('BEGIN READ ONLY');await target(c,options);const binding=await inspectManagedBinding(c,options);await c.query('ROLLBACK');return binding;}
 catch(error){try{await c.query('ROLLBACK');}catch{broken=true;}throw error;}
 finally{c.release(broken);}
}
