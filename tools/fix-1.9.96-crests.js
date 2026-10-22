'use strict';
const fs=require('fs'),path=require('path');
const D=process.env.DATA_DIR||path.join(__dirname,'..','data');
const cf=path.join(D,'crests.json'); const c=JSON.parse(fs.readFileSync(cf,'utf8'));
const set=(id,en,zh,af)=>{c.teams[id]={...(c.teams[id]||{}),en,zh,afTeamId:af,badge:`https://media.api-sports.io/football/teams/${af}.png`,filledFrom:'manual-1.9.96',filledAt:new Date().toISOString()};};
set('277','AEK Athens','雅典AEK',575);
if(!c.teams['336']) set('336','Slavia Praha','斯拉维亚',560);
if(!c.teams['1264']) set('1264','Slovan Bratislava','布拉迪斯',656);
if(c.teams['132'] && !c.teams['132'].afTeamId) c.teams['132'].afTeamId=497;
fs.writeFileSync(cf,JSON.stringify(c,null,2)+'\n');
for(const f of fs.readdirSync(path.join(D,'live-stats'))){
  if(!/team/.test(f)||!f.endsWith('.json')) continue;
  const fp=path.join(D,'live-stats',f); let j; try{j=JSON.parse(fs.readFileSync(fp,'utf8'));}catch{continue;}
  let n=0; for(const k of Object.keys(j)){ const v=j[k]; if(v&&Number(v.afTeamId)===323&&(k==='s:277'||/aek/.test(k))){delete j[k];n++;} }
  if(n){fs.writeFileSync(fp,JSON.stringify(j,null,2));console.log('purged',n,'from',f);}
}
console.log('crests fixed');
