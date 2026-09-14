import React,{useEffect,useRef,useState} from 'react';
import {Music2,Volume2,VolumeX,ChevronDown} from 'lucide-react';
import {HomeMusic,readMusicSettings} from './music.js';
import './music.css';

export function MusicControl(){
  const engine=useRef(null);
  const [state,setState]=useState(()=>{
    let storage;try{storage=window.localStorage;}catch{}
    return {...readMusicSettings(storage),available:!!(window.AudioContext||window.webkitAudioContext),playing:false};
  });
  useEffect(()=>{
    let storage;try{storage=window.localStorage;}catch{}
    const music=new HomeMusic({storage,onChange:setState});engine.current=music;
    if(import.meta.env.DEV)window.__sunnyMusic=()=>music.diagnostics();
    return ()=>{music.dispose();engine.current=null;if(import.meta.env.DEV)delete window.__sunnyMusic;};
  },[]);
  const label=state.enabled?'关闭背景音乐':'播放背景音乐',Icon=state.enabled?Music2:VolumeX;
  return <div className="music-controls" data-playing={state.playing} data-error={!!state.error}>
    <button className="icon-button" aria-label={label} title={state.error?'音乐暂不可用，点击关闭后重试':label}
      aria-pressed={state.enabled} disabled={!state.available}
      onClick={()=>engine.current?.setEnabled(!state.enabled)}><Icon size={17}/></button>
    <details className="music-volume">
      <summary aria-label="音乐音量设置" title="音乐音量设置"><ChevronDown size={12}/></summary>
      <div className="music-popover">
        <Volume2 size={15} aria-hidden="true"/>
        <input aria-label="音乐音量" type="range" min="0" max="100" step="1" value={Math.round(state.volume*100)}
          onChange={event=>engine.current?.setVolume(Number(event.target.value)/100)}/>
        <output>{Math.round(state.volume*100)}%</output>
      </div>
    </details>
  </div>;
}
