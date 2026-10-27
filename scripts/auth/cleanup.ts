import { Pool } from "pg";
import { drainAuthRows } from "./cleanup-runner";
let maintenance: Pool | undefined;
try {
  const raw=process.env.POSTGRES_MIGRATION_URL,ca=process.env.POSTGRES_SSL_CA?.replace(/\\n/g,"\n");
  if(!raw||!ca)throw Error("MAINTENANCE_CONFIGURATION_REQUIRED");
  const url=new URL(raw);
  if(!["postgres:","postgresql:"].includes(url.protocol)||!url.username||!url.password||url.search||url.hash||raw===process.env.POSTGRES_DATABASE_URL)throw Error("MAINTENANCE_CONFIGURATION_REQUIRED");
  maintenance=new Pool({connectionString:raw,max:1,connectionTimeoutMillis:3000,query_timeout:5500,ssl:{ca,rejectUnauthorized:true}});
  maintenance.on("error",()=>{});
  const result = await drainAuthRows(async(sql,values)=>{
    const client=await maintenance!.connect();let broken=false;
    try{await client.query("BEGIN");await client.query("SET LOCAL statement_timeout=5000");const value=await client.query(sql,values);await client.query("COMMIT");return value;}
    catch{try{await client.query("ROLLBACK");}catch{broken=true;}throw Error("CLEANUP_UNAVAILABLE");}
    finally{client.release(broken);}
  },{maxDurationMs:25000});
  console.log(JSON.stringify({ event: "feline_auth_cleanup", ...result }));
  if (!result.success) process.exitCode = 1;
} catch { console.error(JSON.stringify({ event: "feline_auth_cleanup", success: false, reason: "database_error" })); process.exitCode = 1; }
finally { await maintenance?.end(); }
