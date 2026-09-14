export const BILL_TYPES=Object.freeze({
  rent:{label:'房租',grace:3},power:{label:'电费',grace:2},water:{label:'水费',grace:4},
  phone:{label:'电话费',grace:3},internet:{label:'网络费',grace:3},upkeep:{label:'住宅维护费',grace:5},
});
export function newFinance(day=1,salary=450){
  return {rent:salary*4,leaseLocked:false,nextDue:day+28,serial:0,invoices:[],autoPay:false,totalPaid:0};
}
export function utilities(game){
  const unpaid=game.finance?.invoices.filter(i=>!i.paid&&game.sim.day>=i.due+BILL_TYPES[i.kind].grace)||[];
  return {power:!unpaid.some(i=>i.kind==='power'),water:!unpaid.some(i=>i.kind==='water'),
    phone:!unpaid.some(i=>i.kind==='phone'),internet:!unpaid.some(i=>i.kind==='internet'),
    rentOverdue:unpaid.some(i=>i.kind==='rent'),overdue:unpaid.length,
    debt:(game.finance?.invoices||[]).filter(i=>!i.paid).reduce((n,i)=>n+i.amount,0)};
}
export function serviceError(game,type,recipe){
  const u=utilities(game);
  if(['watch','onlineChat','jobSearch'].includes(type)&&!u.power)return '电费逾期已停电，缴清电费后恢复';
  if(['onlineChat','jobSearch'].includes(type)&&!u.internet)return '网络已暂停，缴清网络费后恢复';
  if(['shower','washHands','laundryWash'].includes(type)&&!u.water)return '水费逾期已停水，缴清水费后恢复';
  if(type==='eat'&&!u.power&&!['salad','toast'].includes(recipe))return '停电期间可吃沙拉或吐司';
  return null;
}
export function financeAction(game,action){
  const f=game.finance;
  if(action.kind==='autoPay'&&typeof action.value==='boolean')return {...game,finance:{...f,autoPay:action.value}};
  if(action.kind!=='pay')return game;
  const bill=f.invoices.find(i=>i.id===action.id);
  if(!bill||bill.paid||game.budget<bill.amount)return game;
  return {...game,budget:game.budget-bill.amount,finance:{...f,totalPaid:Math.min(1e12,f.totalPaid+bill.amount),
    invoices:f.invoices.map(i=>i.id===bill.id?{...i,paid:true,paidDay:game.sim.day}:i)}};
}
export function advanceFinance(game,salary=0){
  let next=game,f=game.finance;
  if(!f)return game;
  if(!f.leaseLocked&&salary>0){
    f={...f,leaseLocked:true,rent:salary*4};next={...next,finance:f};
  }
  while(game.sim.day>=f.nextDue){
    const size=1+(game.life.housing||0)*.4;
    const charges={...(game.life.housing?{upkeep:300*game.life.housing}:{rent:f.rent}),
      power:Math.round(120*size),water:Math.round(80*size),phone:40,internet:60};
    let invoices=f.invoices.filter(i=>!i.paid||i.due>=game.sim.day-56),serial=f.serial;
    for(const [kind,amount] of Object.entries(charges))invoices.push({id:++serial,kind,amount,due:f.nextDue,paid:false,paidDay:null});
    // Long-running saves merge old unpaid bills by service without erasing debt.
    if(invoices.length>100){
      const old=invoices.slice(0,-60),recent=invoices.slice(-60);
      const merged=new Map();
      for(const i of old.filter(i=>!i.paid)){
        const first=merged.get(i.kind);
        merged.set(i.kind,first?{...first,amount:Math.min(1e12,first.amount+i.amount)}:i);
      }
      invoices=[...merged.values(),...recent];
    }
    f={...f,invoices,serial,nextDue:f.nextDue+28};next={...next,finance:f};
  }
  if(f.autoPay)for(const bill of f.invoices.filter(i=>!i.paid))next=financeAction(next,{kind:'pay',id:bill.id});
  return next;
}
export function validateFinance(f,sim){
  if(f===undefined)return true;
  return !!f&&Number.isFinite(f.rent)&&f.rent>=0&&f.rent<=100000&&typeof f.leaseLocked==='boolean'&&
    Number.isInteger(f.nextDue)&&f.nextDue>=1&&f.nextDue<=99999+28&&Number.isInteger(f.serial)&&f.serial>=0&&f.serial<=1e9&&
    typeof f.autoPay==='boolean'&&Number.isFinite(f.totalPaid)&&f.totalPaid>=0&&f.totalPaid<=1e12&&
    Array.isArray(f.invoices)&&f.invoices.length<=100&&new Set(f.invoices.map(i=>i?.id)).size===f.invoices.length&&
    f.invoices.every(i=>i&&Number.isInteger(i.id)&&i.id>0&&i.id<=f.serial&&Object.hasOwn(BILL_TYPES,i.kind)&&
      Number.isFinite(i.amount)&&i.amount>0&&i.amount<=1e12&&Number.isInteger(i.due)&&i.due>=1&&i.due<=sim.day&&
      typeof i.paid==='boolean'&&(i.paid?Number.isInteger(i.paidDay)&&i.paidDay>=i.due&&i.paidDay<=sim.day:i.paidDay===null));
}
