import pg from 'pg';
import {execFileSync} from 'node:child_process';
const url=execFileSync('heroku',['config:get','DATABASE_URL','--app','survivor-hham'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const pool=new pg.Pool({connectionString:url,ssl:{rejectUnauthorized:false}});
try {
for(const sql of ["SELECT column_name,data_type FROM information_schema.columns WHERE table_name = 'tribal_episodes' ORDER BY table_name,ordinal_position", "SELECT id,player_id,contestant_name FROM survivor_stats WHERE season_number=49 ORDER BY id", "SELECT * FROM tribal_episodes ORDER BY id"]){const r=await pool.query(sql);console.log(JSON.stringify(r.rows));}
} finally {await pool.end();}
