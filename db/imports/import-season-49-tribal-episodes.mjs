import pg from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(readFileSync(new URL('./season-49-tribal-episodes.json',import.meta.url),'utf8'));
const url=execFileSync('heroku',['config:get','DATABASE_URL','--app','survivor-hham'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const pool=new pg.Pool({connectionString:url,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const client=await pool.connect();
const normalize=name=>name.replace(/\*+$/,'').trim();
try {
 await client.query('BEGIN');
 await client.query('LOCK TABLE tribal_episodes IN EXCLUSIVE MODE');
 const stats=await client.query('SELECT * FROM survivor_stats ORDER BY id');
 const originals=await client.query('SELECT * FROM tribal_episodes ORDER BY id');
 const names=new Map();
 for(const r of stats.rows.filter(r=>r.season_number===49)){
  const name=normalize(r.contestant_name);
  if(names.has(name))throw new Error(`Ambiguous season 49 name: ${name}`);
  names.set(name,r.id);
 }
 if(names.size!==18)throw new Error('Expected 18 contestant appearances for season 49');
 const prepared=plan.rosters.map(r=>({...r,ids:r.contestants.map(n=>{
  if(!names.has(n))throw new Error(`Unmatched contestant: ${n}`);
  return names.get(n);
 })}));
 const seasonIds=new Set(names.values());
 const allIds=new Set(stats.rows.map(r=>r.id));
 const targetIds=new Set();
 for(const r of originals.rows){
  if(!Array.isArray(r.contestants))throw new Error('Expected contestants array; recreate tribal_episodes using the updated schema first');
  if(r.contestants.some(id=>!allIds.has(id)))throw new Error(`Roster ${r.id} contains an unknown survivor_stats ID`);
  if(r.contestants.some(id=>seasonIds.has(id))){
   if(r.contestants.some(id=>!seasonIds.has(id)))throw new Error('Existing roster mixes seasons; refusing to edit');
   targetIds.add(r.id);
  }
 }
 const snapshot={tribal_episodes:originals.rows};
 if(!process.argv.includes('--apply')){
  await client.query('ROLLBACK');
  console.log(JSON.stringify({mode:'preview',season:49,existingRowsToReplace:targetIds.size,newRosters:prepared.length,links:prepared.reduce((n,r)=>n+r.ids.length,0),rosters:prepared},null,2));
 }else{
  writeFileSync(new URL('./season-49-tribal-episodes-before.json',import.meta.url),JSON.stringify(snapshot,null,2));
  if(targetIds.size)await client.query('DELETE FROM tribal_episodes WHERE id=ANY($1::int[])',[[...targetIds]]);
  const inserted=[];
  for(const r of prepared){
   const result=await client.query('INSERT INTO tribal_episodes (tribe_name,episode_start,episode_end,challenge_wins,contestants,season_number) VALUES ($1,$2,$3,$4,$5::int[],$6) RETURNING *',[r.tribe_name,r.episode_start,r.episode_end,r.challenge_wins,r.ids,plan.season_number]);
   const id=result.rows[0].id;
   inserted.push({...result.rows[0],ids:[...r.ids].sort((a,b)=>a-b)});
  }
  const afterStats=await client.query('SELECT * FROM survivor_stats ORDER BY id');
  if(JSON.stringify(stats.rows)!==JSON.stringify(afterStats.rows))throw new Error('survivor_stats changed; rolling back');
  const after=await client.query('SELECT * FROM tribal_episodes ORDER BY id');
  const newIds=new Set(inserted.map(r=>r.id));
  if(JSON.stringify(originals.rows.filter(r=>!targetIds.has(r.id)))!==JSON.stringify(after.rows.filter(r=>!newIds.has(r.id))))throw new Error('Unrelated tribe records changed');
  for(const expected of inserted){
   const actual=after.rows.find(r=>r.id===expected.id);
   const links=[...actual.contestants].sort((a,b)=>a-b);
   if(!actual||actual.season_number!==plan.season_number||actual.name_reference!==expected.name_reference||actual.tribe_name!==expected.tribe_name||actual.episode_start!==expected.episode_start||actual.episode_end!==expected.episode_end||Number(actual.challenge_wins)!==Number(expected.challenge_wins)||JSON.stringify(links)!==JSON.stringify(expected.ids))throw new Error('Readback mismatch');
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({season:49,rosters:inserted.length,contestantLinks:inserted.reduce((n,r)=>n+r.ids.length,0),survivorStatsUnchanged:true,otherSeasonsUnchanged:true}));
 }
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1;}finally{client.release();await pool.end();}
