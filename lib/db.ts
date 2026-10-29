import postgres from 'postgres';
import {required} from './config';
let connection:ReturnType<typeof postgres>|undefined;
export function db(){return connection??=postgres(required('DATABASE_URL'),{max:3,idle_timeout:20,connect_timeout:10,prepare:false,ssl:process.env.NODE_ENV==='production'?'require':undefined});}
let attributionSchema:Promise<void>|undefined;
export function ensureAttributionSchema(){
 // Additive and compatible with sessions created by the previous deployment.
 return attributionSchema??=db()`ALTER TABLE nexool_sessions ADD COLUMN IF NOT EXISTS attribution JSONB`.then(()=>{}).catch(error=>{attributionSchema=undefined;throw error;});
}
export async function initialize(){
 const sql=db();
 await sql`CREATE TABLE IF NOT EXISTS nexool_sessions (
 id UUID PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, items JSONB NOT NULL, country TEXT NOT NULL, currency TEXT NOT NULL, cart JSONB NOT NULL,
 address JSONB, quote JSONB, draft_id TEXT UNIQUE, whop_quote_id TEXT, whop_plan JSONB, payment_id TEXT UNIQUE, payment_attempt_key TEXT,
 order_id TEXT UNIQUE, order_url TEXT, status TEXT NOT NULL DEFAULT 'cart', last_error TEXT,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
 await sql`CREATE TABLE IF NOT EXISTS nexool_events (id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, received_at TIMESTAMPTZ DEFAULT NOW(),processed_at TIMESTAMPTZ)`;
 await sql`ALTER TABLE nexool_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`;
 await sql`CREATE TABLE IF NOT EXISTS nexool_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at TIMESTAMPTZ NOT NULL)`;
 await sql`CREATE TABLE IF NOT EXISTS nexool_tracking (order_id TEXT PRIMARY KEY, tracking_number TEXT, synced_at TIMESTAMPTZ, error TEXT)`;
 await ensureAttributionSchema();
}
export async function limit(key:string,max:number,seconds=60){
 const [row]=await db()`INSERT INTO nexool_limits (key,count,resets_at) VALUES (${key},1,NOW()+${seconds}*INTERVAL '1 second')
 ON CONFLICT (key) DO UPDATE SET count=CASE WHEN nexool_limits.resets_at<NOW() THEN 1 ELSE nexool_limits.count+1 END,
 resets_at=CASE WHEN nexool_limits.resets_at<NOW() THEN NOW()+${seconds}*INTERVAL '1 second' ELSE nexool_limits.resets_at END RETURNING count`;
 if(row.count>max)throw new Error('Too many requests. Please wait a minute.');
}
