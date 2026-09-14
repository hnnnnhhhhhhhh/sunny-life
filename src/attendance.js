import {workday,monthFor} from './calendar.js';
export const newAttendance=day=>({startDay:day,lastChecked:day-1,noticeDay:0,leaveDay:0,leaveMonth:monthFor(day),
  leavesUsed:0,absences:0,review:false,probationUsed:false,records:[]});
export function attendanceAction(game,action,job){
  const a=game.career.attendance;
  if(!job||!a)return game;
  if(action.kind==='leave'){
    const used=a.leaveMonth===monthFor(game.sim.day)?a.leavesUsed:0;
    if(!workday(game.sim.day)||game.career.location==='office'||game.sim.time>=job.start||
      a.leaveDay===game.sim.day||used>=2||a.review)return game;
    return {...game,career:{...game.career,attendance:{...a,leaveDay:game.sim.day,
      leaveMonth:monthFor(game.sim.day),leavesUsed:used+1}}};
  }
  if(action.kind==='review'&&a.review){
    if(action.choice==='plan'&&!a.probationUsed)return {...game,career:{...game.career,attendance:{...a,review:false,absences:2,probationUsed:true}}};
    if(action.choice==='accept')return {...game,career:{...game.career,jobId:null,stress:Math.min(100,game.career.stress+20),
      attendance:{...a,review:false},workplace:{...game.career.workplace,
        dismissed:{day:game.sim.day,jobId:job.id,reason:'多次无故缺勤'},
        emotion:{kind:'dismissal',remaining:4320}}},
      sim:{...game.sim,needs:{...game.sim.needs,fun:Math.max(0,game.sim.needs.fun-20)}}};
  }
  return game;
}
export function markArrival(career,sim,job){
  const a=career.attendance;
  if(!a)return career;
  const late=Math.max(0,Math.floor(sim.time-job.start));
  return {...career,attendance:{...a,records:[...a.records.slice(-59),{day:sim.day,kind:late>15?'late':'present',minutes:late}]},
    workplace:late>15?{...career.workplace,performance:Math.max(0,career.workplace.performance-4)}:career.workplace};
}
export function advanceAttendance(before,game,job){
  const a=game.career.attendance;
  if(!job||!a||game.career.jobId!==job.id||game.career.location==='office'||a.review||
    game.career.workplace?.event?.type==='appraisal'||
    game.sim.day<a.startDay||!workday(before.sim.day)||a.lastChecked>=before.sim.day)return game;
  if(before.sim.day===game.sim.day&&game.sim.time<job.end){
    if(game.sim.time>=job.start+30&&a.noticeDay!==game.sim.day&&a.leaveDay!==game.sim.day&&game.career.lastPaidDay!==game.sim.day)
      return {...game,career:{...game.career,attendance:{...a,noticeDay:game.sim.day}}};
    return game;
  }
  const day=before.sim.day,attended=game.career.lastPaidDay===day||a.records.some(r=>r.day===day&&['present','late'].includes(r.kind));
  const excused=a.leaveDay===day;
  const absences=Math.min(3,a.absences+(!attended&&!excused?1:0));
  const kind=excused?'leave':attended?null:'absent';
  return {...game,career:{...game.career,attendance:{...a,lastChecked:day,absences,review:absences>=3&&!attended&&!excused,
    records:kind?[...a.records.slice(-59),{day,kind,minutes:0}]:a.records},
    workplace:kind==='absent'?{...game.career.workplace,performance:Math.max(0,game.career.workplace.performance-12),
      emotion:{kind:'reprimand',remaining:720}}:game.career.workplace,
    stress:Math.min(100,game.career.stress+(kind==='absent'?10:0))}};
}
export function validateAttendance(a,sim){
  if(a===undefined)return true;
  const day=n=>Number.isInteger(n)&&n>=0&&n<=sim.day;
  return !!a&&day(a.startDay)&&a.startDay>=1&&day(a.lastChecked)&&day(a.noticeDay)&&day(a.leaveDay)&&
    Number.isInteger(a.leaveMonth)&&a.leaveMonth>=1&&a.leaveMonth<=monthFor(sim.day)&&
    Number.isInteger(a.leavesUsed)&&a.leavesUsed>=0&&a.leavesUsed<=2&&
    Number.isInteger(a.absences)&&a.absences>=0&&a.absences<=3&&typeof a.review==='boolean'&&typeof a.probationUsed==='boolean'&&
    Array.isArray(a.records)&&a.records.length<=60&&a.records.every(r=>r&&day(r.day)&&r.day>0&&
      ['present','late','absent','leave'].includes(r.kind)&&Number.isFinite(r.minutes)&&r.minutes>=0&&r.minutes<=1440);
}
