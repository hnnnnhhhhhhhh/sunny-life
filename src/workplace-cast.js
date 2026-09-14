// Fictional characters adapted from the user-provided NPC setting document.
export const WORKPLACE_CAST = Object.freeze([
  {id:'danbao',name:'蛋宝',title:'设计组长',minRank:1,color:'#809da1',
    motive:'少麻烦、少担责，维持专业形象',help:'参考案例与熟悉的小修改',
    line:'你先做一版，我们再讨论。',
    avatar:{base:'male',hair:'short',hairColor:'#493c34',skin:'#e5b896',top:'#8da9a7',pants:'#63696a',outfit:'cardigan',glasses:true,height:.96,build:1.04,face:1.08}},
  {id:'shuijie',name:'水姐',title:'业务设计组长',minRank:2,color:'#ae7e83',
    motive:'照顾团队，也争取业务归属与组织主导权',help:'素材、人手和推进支持',
    line:'你做核心，其他部分姐找人帮你补。',
    avatar:{base:'female',hair:'bun',hairColor:'#58463b',skin:'#f3d6bf',top:'#a77583',pants:'#616b67',outfit:'cardigan',height:.95,build:.97,face:1.02}},
  {id:'zhuoge',name:'桌哥',title:'设计总监',minRank:2,color:'#827e9b',
    motive:'专业判断形象、向上汇报与规模化',help:'协调资源、安排展示与推广',
    line:'挺好的，什么时候能用？',
    avatar:{base:'male',hair:'short',hairColor:'#40352e',skin:'#ca9571',top:'#7c7993',pants:'#55565e',outfit:'jacket',glasses:true,height:1.04,build:1,face:.93}},
  {id:'dayanzei',name:'大眼贼',title:'总经理',minRank:3,color:'#6b8e76',
    motive:'业务结果、上级信任与组织控制力',help:'业务方向、预算与关键资源',
    line:'先小范围试，跑通了再推。',
    avatar:{base:'male',hair:'short',hairColor:'#49443f',skin:'#e5b896',top:'#627c69',pants:'#4c5550',outfit:'jacket',height:1.08,build:1.12,face:1.04,eyes:1.2}},
]);
export const castForRank=rank=>WORKPLACE_CAST.filter(n=>n.minRank<=rank);
export const castById=id=>WORKPLACE_CAST.find(n=>n.id===id);
export const relationshipRole=(id,team)=>id===team?'直属组长':['danbao','shuijie'].includes(id)?'跨组协作':id==='zhuoge'?'组长的上级':'总经理';
export const newNpcState=()=>Object.fromEntries(WORKPLACE_CAST.map(n=>[n.id,{
  trust:40,closeness:30,interest:50,energy:85,hunger:80,mood:65,stress:20,known:0,
  informed:false,assignment:null,lastContactDay:0,
}]));
export function npcStatus(state){
  if(state.assignment?.status==='done')return '产物待交接';
  if(state.energy<25)return '休息中';
  if(state.hunger<25)return '用餐中';
  if(state.assignment?.status==='promised')return state.assignment.elapsed<state.assignment.delay?'暂未动手':'处理交接';
  if(state.stress>70)return '赶截止时间';
  return '处理日常事务';
}
