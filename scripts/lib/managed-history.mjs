import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyManagedContract,verifyProxyDataScope} from '../../src/lib/auth/center/managed-contract.mjs';

const base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const signatures=['cron_registration()','cron_current_run()','cron_history_range(bigint,bigint)','cron_prune_range(bigint,bigint)'];
const scanColumns='job_name,cron_job_id,activated_at,history_mode,history_initial_floor,history_prune_floor,history_prune_cursor,history_prune_upper,history_prune_keep_from,history_prune_cutoff,history_prune_next_expiry,history_next_expiry';
const identity=value=>{if(!/^[a-z_][a-z0-9_]{0,62}$/.test(value??''))throw Error('MANAGED_ROLE_INVALID');return '"'+value+'"';};
const fail=(message,stage)=>{const error=new Error(message);error.stage=stage;throw error;};
async function proxyDefinitions(client){const result=await client.query("SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth_ops' AND p.proname=ANY($1::text[]) ORDER BY p.proname",[['cron_registration','cron_current_run','cron_history_range','cron_prune_range']]);return result.rows.map(row=>({signature:row.signature,sha256:createHash('sha256').update(row.definition).digest('hex')}));}

export async function installManagedHistory(pool,options){
 const runtime=identity(options.runtimeRole);
 if(!['center','blog'].includes(options.service)||!['development','staging','production'].includes(options.environment)||!options.databaseName||!options.databaseInstanceId)fail('MANAGED_TARGET_REQUIRED','target');
 const client=await pool.connect();let stage='begin';
 try{
  await client.query('BEGIN READ ONLY');
  await client.query('SET LOCAL search_path=pg_catalog,pg_temp');
  stage='maintenance_identity';
  const actual=(await client.query("SELECT current_database() AS database,current_user AS maintenance,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(actual.database!==options.databaseName||actual.rolsuper||!actual.rolbypassrls||!actual.rolcreaterole)fail('MANAGED_MAINTENANCE_INVALID',stage);
  const maintenance=identity(actual.maintenance);
  stage='metadata';
  const metadata=(await client.query(options.service==='center'?"SELECT app_env,database_instance_id::text AS instance FROM public.service_runtime_metadata WHERE id=1":"SELECT generation::text AS instance FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'")).rows[0];
  if(!metadata||metadata.instance!==options.databaseInstanceId||(options.service==='center'&&metadata.app_env!==options.environment))fail('MANAGED_INSTANCE_MISMATCH',stage);
  const fixture=options.fixture===true&&options.environment==='development'&&actual.database==='runtime_managed_history_blog'&&new URL(pool.options.connectionString).hostname==='127.0.0.1'&&new URL(pool.options.connectionString).port==='54358';
  const expectedPath=resolve(base,'src/lib/auth/center/managed-proxy-requirements.json');
  const expected=existsSync(expectedPath)?JSON.parse(readFileSync(expectedPath,'utf8')):null;
  if(!expected&&!fixture)fail('MANAGED_DEFINITIONS_UNPROVEN',stage);
  stage='state';
  const state=(await client.query("SELECT history_mode,cron_job_id FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'")).rows[0];
  if(!state)fail('MANAGED_SCHEMA_MISSING',stage);
  if(state.history_mode==='managed-proxy-v1'){
   await verifyManagedContract(client,options);
   await inspectManagedBinding(client,options);
   await client.query('ROLLBACK');return{code:'MANAGED_HISTORY_ALREADY_INSTALLED',changed:false};
  }
  if(state.history_mode!=='disabled'||state.cron_job_id!==null)fail('MANAGED_INSTALL_CONFLICT',stage);
  await client.query('ROLLBACK');await client.query('BEGIN');
  const locked=(await client.query("SELECT history_mode,cron_job_id FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup' FOR UPDATE")).rows[0];
  if(locked.history_mode!=='disabled'||locked.cron_job_id!==null)fail('MANAGED_INSTALL_CONFLICT',stage);
  stage='runtime';
  const runtimeRole=(await client.query('SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=$1',[options.runtimeRole])).rows[0];
  if(!runtimeRole||Object.values(runtimeRole).some(Boolean))fail('MANAGED_RUNTIME_INVALID',stage);
  stage='job';
  if((await client.query("SELECT 1 FROM cron.job WHERE jobname='auth-cleanup'")).rowCount)fail('MANAGED_JOB_CONFLICT',stage);
  stage='capability';
  const capability=(await client.query("SELECT (SELECT extversion FROM pg_extension WHERE extname='pg_cron') AS version,current_setting('cron.log_run',true) AS log_run,current_setting('cron.use_background_workers',true) AS workers")).rows[0];
  if(capability.version!=='1.6.4'||capability.log_run!=='on'||capability.workers!=='off')fail('MANAGED_CRON_CAPABILITY_UNPROVEN',stage);
  stage='roles';
  for(const [role,bypass]of[['auth_ops_owner',false],['auth_cleanup_scheduler',false],['auth_cron_history',true]]){
   const current=(await client.query('SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit FROM pg_roles WHERE rolname=$1',[role])).rows[0];
   if(!current)await client.query('CREATE ROLE '+identity(role)+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT '+(bypass?'BYPASSRLS':'NOBYPASSRLS'));
   else if(current.rolcanlogin||current.rolsuper||current.rolcreatedb||current.rolcreaterole||current.rolreplication||current.rolinherit||current.rolbypassrls!==bypass)fail('MANAGED_ROLE_CONFLICT',stage);
   if((await client.query("SELECT pg_has_role($1,$2,'MEMBER') AS member,has_schema_privilege($2,'cron','USAGE') AS cron_usage",[options.runtimeRole,role])).rows[0].member)fail('MANAGED_RUNTIME_MEMBERSHIP_INVALID',stage);
   if((await client.query("SELECT has_schema_privilege($1,'cron','USAGE') AS allowed",[role])).rows[0].allowed)fail('MANAGED_CRON_USAGE_INVALID',stage);
   if((await client.query("SELECT pg_has_role(current_user,$1,'SET') AS can_set,pg_has_role(current_user,$1,'USAGE') AS inherits",[role])).rows[0].can_set||(await client.query("SELECT pg_has_role(current_user,$1,'USAGE') AS inherits",[role])).rows[0].inherits)fail('MANAGED_MAINTENANCE_MEMBERSHIP_INVALID',stage);
   await client.query('GRANT '+identity(role)+' TO '+maintenance+' WITH SET TRUE,INHERIT FALSE');
  }
  stage='defaults';
  for(const owner of[actual.maintenance,'auth_ops_owner','auth_cron_history']){
   if(owner!==actual.maintenance)await client.query('SET LOCAL ROLE '+identity(owner));
   await client.query('ALTER DEFAULT PRIVILEGES FOR ROLE '+identity(owner)+' REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role,'+runtime+',auth_cleanup_scheduler');
   if(owner!==actual.maintenance)await client.query('RESET ROLE');
  }
  stage='proxy_grants';
  await client.query('GRANT USAGE,CREATE ON SCHEMA auth_ops TO auth_ops_owner,auth_cron_history');
  await client.query('GRANT SELECT(jobid,jobname,username,database,command,schedule,active) ON cron.job TO auth_cron_history');
  await client.query('GRANT SELECT(jobid,runid,job_pid,database,username,command,status,start_time,end_time),DELETE ON cron.job_run_details TO auth_cron_history');
  await client.query('GRANT SELECT('+scanColumns+') ON auth_ops.cleanup_state TO auth_cron_history');
  stage='parsed_functions';
  await client.query(readFileSync(resolve(base,'ops/auth-cleanup/managed-history.sql'),'utf8').replaceAll('\r\n','\n'));
  for(const signature of signatures){await client.query('REVOKE ALL ON FUNCTION auth_ops.'+signature+' FROM PUBLIC,anon,authenticated,service_role,'+runtime+',auth_cleanup_scheduler');await client.query('ALTER FUNCTION auth_ops.'+signature+' OWNER TO auth_cron_history');}
  await client.query('SET LOCAL ROLE auth_cron_history');
  for(const signature of signatures)await client.query('GRANT EXECUTE ON FUNCTION auth_ops.'+signature+' TO auth_ops_owner');
  await client.query('RESET ROLE');
  await client.query('REVOKE CREATE ON SCHEMA auth_ops FROM auth_cron_history');
  stage='managed_core';
  await client.query(readFileSync(resolve(base,'ops/auth-cleanup/managed-core.sql'),'utf8').replaceAll('\r\n','\n'));
  stage='core_ownership';
  if(options.service==='blog'){
   const authOwner=(await client.query("SELECT rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication AS unsafe FROM pg_roles WHERE rolname='feline_auth_owner'")).rows[0];
   if(!authOwner||authOwner.unsafe||(await client.query("SELECT pg_has_role(current_user,'feline_auth_owner','SET') OR pg_has_role(current_user,'feline_auth_owner','USAGE') AS unsafe")).rows[0].unsafe)fail('MANAGED_AUTH_OWNER_INVALID',stage);
   await client.query('GRANT USAGE ON SCHEMA public TO auth_ops_owner');
   await client.query('GRANT feline_auth_owner TO '+maintenance+' WITH SET TRUE,INHERIT FALSE');
   await client.query('SET LOCAL ROLE feline_auth_owner');
   const side=readFileSync(resolve(base,'ops/auth-cleanup/permissions-blog.sql'),'utf8').replace('GRANT USAGE ON SCHEMA public TO auth_ops_owner;','').replaceAll('__RUNTIME__',options.runtimeRole);
   await client.query(side);await client.query('RESET ROLE');await client.query('GRANT feline_auth_owner TO '+maintenance+' WITH SET FALSE,INHERIT FALSE');
  }else await client.query(readFileSync(resolve(base,'ops/auth-cleanup/permissions-center.sql'),'utf8'));
  const core=(await client.query("SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth_ops' AND p.proname=ANY($1::text[])",[['failure_count','cleanup_tick','cleanup_status','cleanup_eligible','cleanup_batch','protect_history_state']])).rows;
  for(const row of core){await client.query('REVOKE ALL ON FUNCTION '+row.signature+' FROM PUBLIC,anon,authenticated,service_role,'+runtime+',auth_cleanup_scheduler');await client.query('ALTER FUNCTION '+row.signature+' OWNER TO auth_ops_owner');}
  await client.query('ALTER TABLE auth_ops.cleanup_state OWNER TO auth_ops_owner; ALTER TABLE auth_ops.cleanup_run OWNER TO auth_ops_owner; ALTER SCHEMA auth_ops OWNER TO auth_ops_owner');
  await client.query('SET LOCAL ROLE auth_ops_owner');
  await client.query('GRANT USAGE ON SCHEMA auth_ops TO '+maintenance+'; GRANT SELECT ON auth_ops.cleanup_state,auth_ops.cleanup_run TO '+maintenance);
  await client.query('REVOKE ALL ON SCHEMA auth_ops FROM PUBLIC,anon,authenticated,service_role; REVOKE ALL ON ALL TABLES IN SCHEMA auth_ops FROM PUBLIC,anon,authenticated,service_role,'+runtime+',auth_cleanup_scheduler; GRANT USAGE ON SCHEMA auth_ops TO '+runtime+',auth_cleanup_scheduler; GRANT EXECUTE ON FUNCTION auth_ops.cleanup_status() TO '+runtime+'; GRANT EXECUTE ON FUNCTION auth_ops.cleanup_tick() TO auth_cleanup_scheduler');
  await client.query("UPDATE auth_ops.cleanup_state SET history_mode='managed-proxy-v1' WHERE job_name='auth-cleanup'");
  await client.query('RESET ROLE');
  await client.query("ALTER ROLE auth_cleanup_scheduler SET statement_timeout='30s'; ALTER ROLE auth_cleanup_scheduler SET lock_timeout='1s'");
  stage='restore';
  for(const role of['auth_ops_owner','auth_cleanup_scheduler','auth_cron_history'])await client.query('GRANT '+identity(role)+' TO '+maintenance+' WITH SET FALSE,INHERIT FALSE');
  await verifyProxyDataScope(client);
  const observed=await proxyDefinitions(client);
  if(expected)await verifyManagedContract(client,options);
  await inspectManagedBinding(client,options);
  await client.query('COMMIT');return{code:'MANAGED_HISTORY_INSTALLED',changed:true,functions:observed};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(/^MANAGED_[A-Z_]+$/.test(error.message))throw error;const safe=new Error('MANAGED_INSTALL_FAILED');safe.stage=stage;safe.sqlCode=error.code??null;throw safe;}
 finally{client.release();}
}

export async function inspectManagedBinding(client,options){
 const state=(await client.query("SELECT * FROM auth_ops.cleanup_state WHERE job_name='auth-cleanup'")).rows[0];
 if(!state||state.history_mode!=='managed-proxy-v1'||(options.generation&&state.generation!==options.generation))throw Error('MANAGED_BINDING_MISMATCH');
 const jobs=(await client.query("SELECT jobid::text AS id,username,command,database,schedule,active FROM cron.job WHERE jobname='auth-cleanup'")).rows;
 if(state.cron_job_id===null){if(jobs.length||state.activated_at!==null)throw Error('MANAGED_BINDING_MISMATCH');}
 else if(jobs.length!==1||jobs[0].id!==String(state.cron_job_id)||jobs[0].username!=='auth_cleanup_scheduler'||jobs[0].command!=='SELECT auth_ops.cleanup_tick()'||jobs[0].database!==options.databaseName||jobs[0].schedule!=='* * * * *'||state.activated_at===null)throw Error('MANAGED_BINDING_MISMATCH');
 const settings=(await client.query("SELECT (SELECT extversion FROM pg_extension WHERE extname='pg_cron') AS version,current_setting('cron.log_run',true) AS logs,current_setting('cron.use_background_workers',true) AS workers,(SELECT rolcanlogin FROM pg_roles WHERE rolname='auth_cleanup_scheduler') AS login")).rows[0];
 if(settings.version!=='1.6.4'||settings.logs!=='on'||settings.workers!=='off'||settings.login!==(state.cron_job_id!==null))throw Error('MANAGED_CRON_CAPABILITY_UNPROVEN');
 return {state,job:jobs[0]??null};
}
