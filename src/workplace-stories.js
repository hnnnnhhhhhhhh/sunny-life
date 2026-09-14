export const STORY_TITLES = ['先找找感觉','谁来做主','有眼光','愿意支持','分配的偏向','不同的标准','原来一直知道'];
export const PROJECT_TITLES = ['业务页面验证','可复用交付模板','跨组流程改版','设计组件试点','业务适配方案','发布前验收'];
const choice=(id,label,outcome,effects={})=>({id,label,outcome,effects});
export const WORK_EVENTS = {
  direction:{npc:'danbao',title:'结论还没有落下',
    text:'“先找找感觉，设计语言要统一。我回头看一下。”蛋宝答应判断方向，但又打开了案例网站。后续工作还等着这个结论。',
    fallback:'wait',choices:[
      choice('wait','等组长看完再动手','等待拍板，主任务暂停 75 分钟。',{time:75,stress:5,trust:2}),
      choice('options','给出 A/B 选项，请他明确拍板','整理选项用时 15 分钟，留下书面范围。',{time:15,evidence:20,communication:15,trust:3,scope:-15}),
      choice('assume','按自己的理解先做','开始得快，但方向未确认，后面增加 45 分钟返工。',{scope:45,stress:6,communication:-8}),
    ]},
  meeting:{npc:'leader',title:'临时方法讨论会',
    text:'组长临时拉起一场“设计方法对齐”。你今天的主任务预计需要六小时，会议没有明确议程，交付时间却没有变化。',
    fallback:'attend',choices:[
      choice('attend','先参加，把手头工作放一放','会议占用 60 分钟；组长觉得你配合。',{time:60,trust:5,stress:4,closeness:3}),
      choice('agenda','先发进度和问题，只参加决策部分','压缩到 15 分钟，并记录主任务被占用的时间。',{time:15,evidence:15,communication:15,trust:-2}),
      choice('decline','直接拒绝，不作解释','保住专注时间，但对方记下“沟通不主动”。',{time:0,trust:-8,communication:-15,stress:5}),
    ]},
  urgent:{npc:'leader',title:'顺手帮忙的急单',
    text:'“这个很快的，你顺手支持一下。”一个临时修改被塞过来。没人主动说明它和原任务哪个更重要。',
    fallback:'accept',choices:[
      choice('accept','两个都答应下来','临时任务占用 90 分钟，原截止时间不变。',{time:90,trust:4,stress:10}),
      choice('trade','列出剩余工时，交换交付范围','沟通用时 20 分钟，原任务缩减 45 分钟。',{time:20,scope:-45,evidence:20,communication:15,trust:2}),
      choice('ignore','不回复，继续原任务','保留时间，但欠下沟通记录。',{time:0,trust:-8,communication:-20,stress:3}),
    ]},
  credit:{npc:'shuijie',title:'一起共建，谁来讲？',
    text:'水姐看过你同步的原型：“你做核心，其他部分姐找人补。这个大家后面都能用，我们一起共建。”她同时提出，由她的组统一汇报。',
    fallback:'share',choices:[
      choice('share','接受人手和统一汇报','获得真实产能，但自己的成果份额降到 60%。',{time:15,help:60,credit:-40,trust:8,closeness:5,stress:-5}),
      choice('contract','先写清模块、署名和验收人','获得 40 分钟产能，保留贡献记录，付出 25 分钟协调。',{time:25,help:40,evidence:25,communication:10,trust:-3,credit:-5}),
      choice('alone','婉拒共建，独立推进','保留归属，但失去跨组资源。',{time:10,trust:-10,stress:8}),
    ]},
  scale:{npc:'zhuoge',title:'从单点到体系',
    text:'桌哥看了已经跑通的演示：“挺好的，什么时候能用？这个要形成体系，不能只停留在单点成果。”新增了推广材料和多业务适配。',
    fallback:'expand',choices:[
      choice('expand','接受扩大范围，仍承诺今天交付','新增 100 分钟工作量，原截止不变。',{scope:100,stress:12,trust:5}),
      choice('pilot','拿验证数据，协商分两期','用 25 分钟明确本期边界，只增加 20 分钟工作。',{time:25,scope:20,evidence:25,communication:15,trust:3}),
      choice('resource','要求明确投入的人手与责任人','协调用时 30 分钟，范围增加 60 分钟，获得 60 分钟支持。',{time:30,scope:60,help:60,evidence:15,trust:-2}),
    ]},
  rework:{npc:'shuijie',title:'验收口径变了',
    text:'“我知道你很辛苦，但这个版本现在确实不能推。”水姐把新业务适配项列入本次验收。此前的需求说明没有这一项。',
    fallback:'redo',choices:[
      choice('redo','全部返工，先把关系顾好','新增 80 分钟工作，关系稍有缓和。',{scope:80,stress:12,trust:5}),
      choice('record','对照确认记录，拆出新增需求','用 20 分钟核对记录；有证据时守住本期范围。',{time:20,scope:25,evidence:15,communication:15,trust:-3}),
      choice('escalate','带时间线请总监协调','用 30 分钟升级沟通；新增工作缩减，并提高项目可见度。',{time:30,scope:10,evidence:20,communication:10,trust:-7,inform:'zhuoge'}),
    ]},
  vision:{npc:'dayanzei',title:'主线 · 有眼光',
    text:'大眼贼看了演示：“有价值的是以后不用每次重来。先小范围试，跑通了再推。”他批准一次小范围试验，并提供可复用方向。',
    fallback:'pilot',choices:[
      choice('pilot','按小范围试点推进','真实获得 60 分钟资源支持，并明确试验范围。',{time:15,help:60,quality:8,evidence:15,trust:8,arc:true}),
      choice('promise','承诺直接覆盖所有业务','获得支持，同时额外承诺 90 分钟适配工作。',{help:60,scope:90,stress:8,trust:10,arc:true}),
    ]},
  support:{npc:'dayanzei',title:'主线 · 愿意支持',
    text:'上一次试点留下了明确结果。大眼贼协调出人手，允许你先修复一个验证中暴露的问题，不追究这次小范围试错。',
    fallback:'fix',choices:[
      choice('fix','记录试验边界，再补齐验证','获得 70 分钟支持，质量提高，试验责任边界留档。',{time:20,help:70,quality:10,evidence:20,trust:8,arc:true}),
      choice('speed','省去记录，争取更快铺开','获得 80 分钟支持，但多出 40 分钟推广范围。',{help:80,scope:40,trust:10,arc:true}),
    ]},
  allocation:{npc:'dayanzei',title:'主线 · 分配的偏向',
    text:'新的资源审批到了：你负责核心实现，水姐的组拥有主要展示名额，桌哥负责向上汇报。大眼贼说这是为了“统一推进”。',
    fallback:'accept',choices:[
      choice('accept','接受安排，先完成交付','得到 35 分钟支持，但核心贡献只记入 55%。',{help:35,credit:-45,stress:10,trust:5,arc:true}),
      choice('ledger','提交模块贡献表，争取共同展示','花 25 分钟保留署名证据，拿到共同展示位置。',{time:25,credit:-10,evidence:30,communication:10,trust:-4,arc:true}),
    ]},
  standards:{npc:'dayanzei',title:'主线 · 不同的标准',
    text:'水姐组的延期被解释为“资源调整”，你的延期却被追问主动性。桌哥把问题归到执行端，蛋宝说“先接受反馈”。相似问题得到了不同处理。',
    fallback:'apologize',choices:[
      choice('apologize','先认下所有执行责任','压力上升，绩效评审少了过程依据。',{stress:16,communication:-12,trust:5,arc:true}),
      choice('timeline','列出打断、改范围和审批时间线','花 20 分钟提交可核对证据，问责不再只看最终完成度。',{time:20,evidence:30,communication:15,trust:-5,arc:true}),
    ]},
  knowing:{npc:'dayanzei',title:'主线 · 原来一直知道',
    text:'你找到了资源调整的确认记录。大眼贼说：“这个调整是我同意的，当时有整体考虑。现在先把交付补上。”他将处理权交回桌哥，管理链条没有改变。',
    fallback:'boundary',choices:[
      choice('boundary','保留记录，明确只承担本次范围','留下完整贡献与依赖记录；组织安排不变，但个人责任边界更清楚。',{time:20,evidence:35,communication:15,stress:5,arc:true}),
      choice('confront','当面指出问责与分配不一致','明确表达异议并保留记录，关系承压；不会因一次异议直接被辞退。',{time:15,evidence:25,trust:-15,stress:12,arc:true}),
      choice('comply','接受安排，争取之后再调整','获得短期资源，自己的成果份额继续下降。',{help:30,credit:-20,trust:8,stress:10,arc:true}),
    ]},
};
export const STORY_EVENTS=['vision','support','allocation','standards','knowing'];
