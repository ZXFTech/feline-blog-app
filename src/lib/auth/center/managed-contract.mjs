import {createHash} from 'node:crypto';
import{readFileSync}from'node:fs';

export const managedVersion='managed-proxy-v1';
export const scanColumns=['job_name','cron_job_id','activated_at','history_mode','history_initial_floor','history_prune_floor','history_prune_cursor','history_prune_upper','history_prune_keep_from','history_prune_cutoff','history_prune_next_expiry','history_next_expiry'];
const roles=['auth_ops_owner','auth_cleanup_scheduler','auth_cron_history'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Error(code);};
const same=(actual,required)=>JSON.stringify(actual)===JSON.stringify(required);
export async function managedCatalog(client){
 const prior=(await client.query("SELECT current_setting('search_path') AS value")).rows[0].value;
 try{
 await client.query('SET LOCAL search_path=pg_catalog,pg_temp');
 const functions=(await client.query(`SELECT p.oid::regprocedure::text AS signature,r.rolname AS owner,p.prosecdef,p.provolatile,p.proparallel,
  p.prosqlbody IS NOT NULL AS parsed,p.proconfig,pg_get_functiondef(p.oid) AS definition,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee',COALESCE(g.rolname,'PUBLIC'),'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type)
   FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles g ON g.oid=a.grantee),'[]') AS grants
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE n.nspname='auth_ops' ORDER BY p.oid::regprocedure::text`)).rows;
 const columns=(await client.query(`SELECT c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS "notNull"
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='auth_ops' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`)).rows;
 const constraints=(await client.query(`SELECT t.relname AS table,c.conname AS name,pg_get_constraintdef(c.oid) AS definition,c.convalidated AS valid
  FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='auth_ops' ORDER BY t.relname,c.conname`)).rows;
 const indexes=(await client.query(`SELECT t.relname AS table,i.relname AS name,pg_get_indexdef(i.oid) AS definition,ix.indisvalid AS valid
  FROM pg_index ix JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='auth_ops' ORDER BY t.relname,i.relname`)).rows;
 return {functions,columns,constraints,indexes};
 }finally{await client.query("SELECT set_config('search_path',$1,true)",[prior]);}
}
export function managedFingerprint(catalog){return {...catalog,functions:catalog.functions.map(row=>({...Object.fromEntries(Object.entries(row).filter(([name])=>!['definition','grants'].includes(name))),sha256:sha(row.definition)}))};}
export function managedRequirements(){return JSON.parse(readFileSync(new URL('./managed-proxy-requirements.json',import.meta.url),'utf8'));}

export async function verifyProxyDataScope(client){
 const result=await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
   AND NOT (c.relkind='r' AND ((n.nspname='cron' AND c.relname IN ('job','job_run_details'))
    OR (n.nspname='auth_ops' AND c.relname IN ('cleanup_state','cleanup_run'))))
   AND c.relkind IN ('r','p','v','m','f','S') AND (
    c.relowner=(SELECT oid FROM pg_roles WHERE rolname='auth_cron_history')
    OR EXISTS(SELECT 1 FROM aclexplode(c.relacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname='auth_cron_history')
    OR EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN LATERAL aclexplode(col.attacl) a JOIN pg_roles r ON r.oid=a.grantee
      WHERE col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped AND r.rolname='auth_cron_history')
    OR (has_schema_privilege('auth_cron_history',n.oid,'USAGE') AND CASE WHEN c.relkind='S'
      THEN has_sequence_privilege('auth_cron_history',c.oid,'USAGE,SELECT,UPDATE')
      ELSE has_table_privilege('auth_cron_history',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('auth_cron_history',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END)
   ) LIMIT 1`);
 if(result.rowCount)fail('MANAGED_PROXY_DATA_PRIVILEGE_INVALID');
}

export async function verifyManagedContract(client,options={}){
 const expected=options.requirements??managedRequirements();
 if(expected.adapterVersion!==managedVersion||expected.service!==options.service||expected.cronVersion!=='1.6.4')fail('MANAGED_DEFINITIONS_UNPROVEN');
 const observed=await managedCatalog(client),fingerprint=managedFingerprint(observed);
 if(!same(fingerprint.functions,expected.catalog.functions))fail('MANAGED_DEFINITION_MISMATCH');
 for(const key of ['columns','constraints','indexes'])if(!expected.catalog[key].every(row=>observed[key].some(actual=>same(actual,row))))fail('MANAGED_SCHEMA_MISMATCH');
 const migration=(await client.query(options.service==='blog'?'SELECT checksum AS hash FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL':'SELECT hash FROM drizzle.__drizzle_migrations')).rows;
 if(!expected.migrations.every(item=>migration.some(row=>row.hash===item.hash)))fail('MANAGED_SCHEMA_MISMATCH');
 const runtime=options.runtimeRole??(await client.query('SELECT current_user AS role')).rows[0].role;
 if(!/^[a-z_][a-z0-9_]{0,62}$/.test(runtime)||roles.includes(runtime))fail('MANAGED_RUNTIME_INVALID');
 const owners=(await client.query(`SELECT c.relname,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='auth_ops' AND c.relkind IN ('r','p')`)).rows;
 if(owners.length!==2||owners.some(row=>row.owner!=='auth_ops_owner'))fail('MANAGED_PRIVILEGE_MISMATCH');
 const attributes=(await client.query('SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolinherit,rolconfig FROM pg_roles WHERE rolname=ANY($1::text[])',[[...roles,runtime].flat()])).rows;
 if(attributes.length!==4)fail('MANAGED_ROLE_MISMATCH');
 for(const row of attributes){
  if(row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolbypassrls!==(row.rolname==='auth_cron_history')||
    (roles.includes(row.rolname)&&row.rolinherit)||(row.rolname!=='auth_cleanup_scheduler'&&row.rolname!==runtime&&row.rolcanlogin))fail('MANAGED_ROLE_MISMATCH');
  if(row.rolname==='auth_cleanup_scheduler'&&(!row.rolconfig?.includes('statement_timeout=30s')||!row.rolconfig.includes('lock_timeout=1s')))fail('MANAGED_ROLE_MISMATCH');
 }
 const membership=(await client.query(`SELECT r.rolname AS role,m.rolname AS member,a.inherit_option,a.set_option FROM pg_auth_members a
  JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member
  WHERE r.rolname=ANY($1::text[]) OR m.rolname=ANY($1::text[])`,[roles])).rows;
 if(membership.some(row=>roles.includes(row.member)||row.member===runtime||row.inherit_option||row.set_option))fail('MANAGED_MEMBERSHIP_MISMATCH');
 const forbidden=(await client.query(`WITH actors AS (SELECT unnest($1::text[]) AS role)
  SELECT 1 FROM actors a WHERE has_schema_privilege(a.role,'cron','USAGE') OR has_schema_privilege(a.role,'public','CREATE')
   OR (a.role<>'auth_ops_owner' AND has_schema_privilege(a.role,'auth_ops','CREATE'))
   OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth_ops' AND c.relkind='r'
     AND a.role<> 'auth_ops_owner' AND a.role<> 'auth_cron_history' AND (has_table_privilege(a.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(a.role,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 LIMIT 1`,[[...roles,runtime,'anon','authenticated','service_role']])).rowCount;
 if(forbidden)fail('MANAGED_PRIVILEGE_MISMATCH');
 try{await verifyProxyDataScope(client);}catch(error){if(error.message==='MANAGED_PROXY_DATA_PRIVILEGE_INVALID')fail('MANAGED_PRIVILEGE_MISMATCH');throw error;}
 const directManagement=(await client.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='cron' AND r.rolname=ANY($1::text[]) LIMIT 1`,[[...roles,runtime,'anon','authenticated','service_role']])).rowCount;
 if(directManagement)fail('MANAGED_PRIVILEGE_MISMATCH');
 const defaults=(await client.query(`SELECT r.rolname,a.defaclacl FROM pg_default_acl a JOIN pg_roles r ON r.oid=a.defaclrole
  WHERE a.defaclobjtype='f' AND a.defaclnamespace=0 AND r.rolname IN ('auth_ops_owner','auth_cron_history')`)).rows;
 if(defaults.length!==2||(await client.query(`SELECT 1 FROM pg_default_acl d JOIN pg_roles owner ON owner.oid=d.defaclrole CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclobjtype='f' AND d.defaclnamespace=0 AND owner.rolname IN ('auth_ops_owner','auth_cron_history') AND a.grantee<>d.defaclrole LIMIT 1`)).rowCount)fail('MANAGED_PRIVILEGE_MISMATCH');
 // Supabase already grants metadata SELECT (and history DELETE) to PUBLIC.
 // Schema USAGE remains denied. Only these fixed parsed bodies can use that ACL.
 // Check our explicit column grants, never rewrite shared supplier ACLs.
 const unexpectedTable=(await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='cron' AND c.relname IN ('job','job_run_details') AND
   ((r.rolname='auth_cron_history' AND (c.relname<>'job_run_details' OR a.privilege_type<>'DELETE' OR a.is_grantable))
    OR (a.grantee=0 AND NOT (a.privilege_type='SELECT' OR (c.relname='job_run_details' AND a.privilege_type='DELETE')))) LIMIT 1`)).rowCount;
 if(unexpectedTable)fail('MANAGED_PRIVILEGE_MISMATCH');
 const supplierColumns={job:['jobid','jobname','username','database','command','schedule','active'],job_run_details:['jobid','runid','job_pid','database','username','command','status','start_time','end_time'],cleanup_state:scanColumns,cleanup_run:[]};
 const supplier=(await client.query(`SELECT n.nspname,c.relname,a.attname,
  has_table_privilege('auth_cron_history',c.oid,'SELECT') AS table_read,
  EXISTS(SELECT 1 FROM aclexplode(a.attacl) acl JOIN pg_roles r ON r.oid=acl.grantee WHERE r.rolname='auth_cron_history' AND acl.privilege_type='SELECT' AND NOT acl.is_grantable) AS read,
  has_column_privilege('auth_cron_history',c.oid,a.attnum,'INSERT,UPDATE,REFERENCES') AS write,
  has_table_privilege('auth_cron_history',c.oid,'DELETE') AS delete,
  has_table_privilege('auth_cron_history',c.oid,'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER') AS table_write
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE ((n.nspname='cron' AND c.relname IN ('job','job_run_details')) OR (n.nspname='auth_ops' AND c.relname IN ('cleanup_state','cleanup_run')))
  AND a.attnum>0 AND NOT a.attisdropped`)).rows;
 if(supplier.some(row=>row.read!==supplierColumns[row.relname].includes(row.attname)||(row.nspname==='auth_ops'&&row.table_read)||row.write||row.table_write||row.delete!==(row.relname==='job_run_details')))fail('MANAGED_PRIVILEGE_MISMATCH');
 for(const fn of observed.functions){
  const allowed=[fn.owner];if(fn.owner==='auth_cron_history')allowed.push('auth_ops_owner');
  if(fn.signature==='auth_ops.cleanup_tick()')allowed.push('auth_cleanup_scheduler');
  if(fn.signature==='auth_ops.cleanup_status()')allowed.push(runtime);
  if(fn.grants.some(g=>g.privilege!=='EXECUTE'||!allowed.includes(g.grantee)||(g.grantable&&g.grantee!==fn.owner)))fail('MANAGED_PRIVILEGE_MISMATCH');
  if(!allowed.every(name=>fn.grants.some(g=>g.grantee===name&&g.privilege==='EXECUTE')))fail('MANAGED_PRIVILEGE_MISMATCH');
 }
 return {adapterVersion:managedVersion};
}
