import {utilities} from './finance.js';
const SAFE_ID = /^[a-zA-Z0-9_-]{1,60}$/;
const safeId = value => typeof value === 'string' && SAFE_ID.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const effects = ['social', 'fun', 'stress', 'trust', 'qualification'];
export const DEFAULT_DIALOGUES = [
  { id: 'neighbor', title: '邻里日常', start: 'hello', nodes: [
    { id: 'hello', speaker: '邻居', text: '最近总是匆匆忙忙，今天过得怎么样？', choices: [
      { id: 'share', label: '聊聊最近的烦恼', next: 'listen', effects: { social: 8, trust: 3 } },
      { id: 'invite', label: '邀请周末一起散步', next: 'weekend', effects: { social: 10, fun: 5, trust: 5 } },
      { id: 'leave', label: '今天想自己安静一会儿', next: 'quiet', effects: { stress: -4 } },
    ] },
    { id: 'listen', speaker: '邻居', text: '我也有过这样的日子。你想听建议，还是只想说说？', choices: [
      { id: 'advice', label: '听听你的建议', next: 'end', effects: { stress: -7, trust: 4 }, flag: 'accept_help' },
      { id: 'company', label: '有人听我说就很好', next: 'end', effects: { social: 8, trust: 6 }, flag: 'value_company' },
    ] },
    { id: 'weekend', speaker: '邻居', text: '好啊，下次再见面，我们接着聊。', choices: [
      { id: 'agree', label: '说定了', next: 'end', effects: { fun: 4 }, flag: 'weekend_plan' },
    ] },
    { id: 'quiet', speaker: '邻居', text: '没问题，照顾好自己。', choices: [{ id: 'thanks', label: '谢谢理解', next: 'end' }] },
    { id: 'end', speaker: '邻居', text: '回头见。', choices: [] },
  ] },
  { id: 'colleague', title: '同事来讯', start: 'request', nodes: [
    { id: 'request', speaker: '同事', text: '这次项目有点赶，你愿意和我一起把难点理清吗？', choices: [
      { id: 'help', label: '一起解决，成果一起署名', next: 'team', effects: { trust: 8, qualification: 1, stress: 3 } },
      { id: 'boundary', label: '明早一起看，今晚先休息', next: 'balance', effects: { trust: 2, stress: -6 } },
      { id: 'compete', label: '我独立负责这一块', next: 'rival', effects: { trust: -7, qualification: 2, stress: 7 } },
    ] },
    { id: 'team', speaker: '同事', text: '合作很顺利。汇报时，你想怎么介绍这次成果？', choices: [
      { id: 'credit', label: '强调团队的贡献', next: 'end', effects: { trust: 7 }, flag: 'team_player' },
      { id: 'lead', label: '争取下次带项目', next: 'end', effects: { qualification: 2, stress: 3 }, flag: 'leadership' },
    ] },
    { id: 'balance', speaker: '同事', text: '可以，明天我们都清醒些再处理。', choices: [{ id: 'agree', label: '明天见', next: 'end', flag: 'boundaries' }] },
    { id: 'rival', speaker: '同事', text: '好，那我们各自负责。交接时记得同步。', choices: [
      { id: 'sync', label: '主动约定交接时间', next: 'end', effects: { trust: 4 } },
      { id: 'silent', label: '先专注自己的任务', next: 'end', effects: { trust: -2 }, flag: 'independent' },
    ] },
    { id: 'end', speaker: '同事', text: '收到，我们保持联系。', choices: [] },
  ] },
];
export const newDialogue = () => ({ documents: [], active: null, history: [], flags: [], relationships: {} });
export function validateDocument(doc) {
  if (!doc || !safeId(doc.id) || !text(doc.title, 80) || !safeId(doc.start) ||
    !Array.isArray(doc.nodes) || !doc.nodes.length || doc.nodes.length > 80) return false;
  const ids = new Set(doc.nodes.map(n => n?.id));
  if (ids.size !== doc.nodes.length || !ids.has(doc.start)) return false;
  return doc.nodes.every(n => n && safeId(n.id) && text(n.speaker, 40) && text(n.text, 1200) &&
    Array.isArray(n.choices) && n.choices.length <= 5 && new Set(n.choices.map(c => c?.id)).size === n.choices.length &&
    n.choices.every(c => c && safeId(c.id) && text(c.label, 120) && ids.has(c.next) &&
      (c.flag === undefined || safeId(c.flag)) &&
      (c.requiresFlag === undefined || safeId(c.requiresFlag)) &&
      (c.effects === undefined || c.effects && typeof c.effects === 'object' && !Array.isArray(c.effects) &&
        Object.entries(c.effects).every(([k, v]) => effects.includes(k) && Number.isFinite(v) &&
          Math.abs(v) <= (k === 'qualification' ? 3 : 10)))));
}
export function parseDialogueDocument(source) {
  if (source.length > 200000) throw new Error('对话文档不能超过 200 KB');
  const document = JSON.parse(source);
  if (!validateDocument(document)) throw new Error('对话格式无效，请检查节点、选项和跳转目标');
  if (DEFAULT_DIALOGUES.some(d => d.id === document.id)) throw new Error('文档 ID 与内置对话冲突');
  return document;
}
export const documentsFor = game => [...DEFAULT_DIALOGUES, ...(game.dialogue?.documents || [])];
export function activeDialogue(game) {
  const active = game.dialogue?.active;
  if (!active) return null;
  const doc = documentsFor(game).find(d => d.id === active.documentId);
  return { ...active, title: doc.title, node: doc.nodes.find(n => n.id === active.nodeId) };
}
const clamp = (n, max = 100) => Math.max(0, Math.min(max, n));
export function dialogueAction(game, action) {
  const state = game.dialogue;
  if (action.kind === 'import' && validateDocument(action.document) &&
    !DEFAULT_DIALOGUES.some(d => d.id === action.document.id)) {
    const documents = state.documents.filter(d => d.id !== action.document.id);
    if (documents.length >= 12 || state.active) return game;
    return { ...game, dialogue: { ...state, documents: [...documents, action.document] } };
  }
  if (action.kind === 'open') {
    const doc = documentsFor(game).find(d => d.id === action.documentId);
    const contact = action.contact;
    if(contact==='online-friend'&&!utilities(game).phone)return game;
    const today = state.history.some(h => h.day === game.sim.day && h.documentId === doc?.id && h.contact === contact);
    if (!doc || !safeId(contact) || !text(action.name, 40) || state.active || today || game.life.shopping) return game;
    if (action.colleague && !game.career.colleagues.some(c => c.id === contact)) return game;
    return { ...game, dialogue: { ...state, active: {
      documentId: doc.id, nodeId: doc.start, contact, name: action.name, colleague: !!action.colleague, visited: [],
    } } };
  }
  if (action.kind === 'close' && state.active) return { ...game, dialogue: { ...state, active: null,
    history: [...state.history.slice(-99), { day: game.sim.day, documentId: state.active.documentId, contact: state.active.contact }] } };
  if (action.kind !== 'choose' || !state.active) return game;
  const current = activeDialogue(game), choice = current.node.choices.find(c => c.id === action.choiceId);
  if (!choice || current.visited.includes(current.nodeId) || choice.requiresFlag && !state.flags.includes(choice.requiresFlag)) return game;
  const e = choice.effects || {}, needs = { ...game.sim.needs }, career = { ...game.career };
  for (const k of ['fun', 'social']) needs[k] = clamp(needs[k] + (e[k] || 0));
  career.stress = clamp(career.stress + (e.stress || 0));
  career.qualification = clamp(career.qualification + (e.qualification || 0), 1000000);
  let relationships = state.relationships;
  if (current.colleague) career.colleagues = career.colleagues.map(c => c.id === current.contact ? { ...c, trust: clamp(c.trust + (e.trust || 0)) } : c);
  else relationships = { ...relationships, [current.contact]: clamp((relationships[current.contact] ?? 40) + (e.trust || 0)) };
  return { ...game, sim: { ...game.sim, needs }, career, dialogue: { ...state, relationships,
    flags: choice.flag ? [...new Set([...state.flags, choice.flag])].slice(-200) : state.flags,
    active: { ...state.active, nodeId: choice.next, visited: [...current.visited, current.nodeId] } } };
}
export function validateDialogue(state, sim) {
  if (state === undefined) return true;
  if (!state || !Array.isArray(state.documents) || state.documents.length > 12 ||
    !state.documents.every(validateDocument) || new Set(state.documents.map(d => d.id)).size !== state.documents.length ||
    state.documents.some(d => DEFAULT_DIALOGUES.some(b => b.id === d.id)) ||
    !Array.isArray(state.flags) || state.flags.length > 200 || !state.flags.every(safeId) ||
    !Array.isArray(state.history) || state.history.length > 100 ||
    !state.history.every(h => h && Number.isInteger(h.day) && h.day >= 1 && h.day <= sim.day && safeId(h.documentId) && safeId(h.contact)) ||
    !state.relationships || Array.isArray(state.relationships) || Object.keys(state.relationships).length > 200 ||
    !Object.entries(state.relationships).every(([k, v]) => safeId(k) && Number.isFinite(v) && v >= 0 && v <= 100)) return false;
  if (state.active === null) return true;
  const a = state.active, doc = [...DEFAULT_DIALOGUES, ...state.documents].find(d => d.id === a?.documentId);
  return !!doc && doc.nodes.some(n => n.id === a.nodeId) && safeId(a.contact) && text(a.name, 40) &&
    typeof a.colleague === 'boolean' && Array.isArray(a.visited) && a.visited.length <= 80 &&
    new Set(a.visited).size === a.visited.length && a.visited.every(id => doc.nodes.some(n => n.id === id));
}
