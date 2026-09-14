export const MONTH_DAYS=28;
export const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
export const weekday=day=>(day-1)%7;
export const weekdayText=day=>WEEKDAYS[weekday(day)];
export const workday=day=>weekday(day)<5;
export const monthFor=day=>Math.floor((day-1)/MONTH_DAYS)+1;
export const dateFor=day=>({month:monthFor(day),date:(day-1)%MONTH_DAYS+1,weekday:weekdayText(day)});
export const newCalendar=()=>({events:[],serial:0});
export function calendarAction(game,action){
  const calendar=game.calendar;
  if(action.kind==='remove')return {...game,calendar:{...calendar,events:calendar.events.filter(e=>e.id!==action.id)}};
  if(action.kind!=='add'||!Number.isInteger(action.day)||action.day<game.sim.day||action.day>game.sim.day+112||
    typeof action.title!=='string'||!action.title.trim()||action.title.length>60||
    !Number.isInteger(action.time)||action.time<0||action.time>=1440||calendar.events.length>=32)return game;
  return {...game,calendar:{serial:calendar.serial+1,events:[...calendar.events,
    {id:calendar.serial+1,day:action.day,time:action.time,title:action.title.trim()}]}};
}
export function validateCalendar(c,sim){
  return c===undefined||!!c&&Number.isInteger(c.serial)&&c.serial>=0&&c.serial<=1e9&&Array.isArray(c.events)&&c.events.length<=32&&
    new Set(c.events.map(e=>e?.id)).size===c.events.length&&c.events.every(e=>e&&Number.isInteger(e.id)&&e.id>0&&e.id<=c.serial&&
      Number.isInteger(e.day)&&e.day>=1&&e.day<=99999+112&&Number.isInteger(e.time)&&e.time>=0&&e.time<1440&&
      typeof e.title==='string'&&e.title.trim().length>0&&e.title.length<=60);
}
