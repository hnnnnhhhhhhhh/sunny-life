export const MUSIC_KEY='sunny-life.music.v1';
export const BAR_SECONDS=60/72*4;
const CHORDS=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59],
  [48,55,59,64],[45,52,60,64],[41,48,57,60],[43,50,59,62]];
const MELODY=[[76,74,72,null],[72,69,null,67],[69,72,76,null],[74,71,67,null],
  [76,79,76,74],[72,null,69,72],[69,67,65,null],[67,71,74,null]];

export function readMusicSettings(storage){
  try{
    const value=JSON.parse(storage.getItem(MUSIC_KEY));
    return {enabled:value?.enabled===true,volume:Number.isFinite(value?.volume)?Math.max(0,Math.min(1,value.volume)):.35};
  }catch{return {enabled:false,volume:.35};}
}

export function scheduleBar(context,destination,start,index,onVoice=()=>{}){
  const chord=CHORDS[index%CHORDS.length],melody=MELODY[index%MELODY.length],beat=60/72;
  function note(midi,offset,duration,amplitude){
    if(midi===null)return;
    const envelope=context.createGain(),filter=context.createBiquadFilter();
    filter.type='lowpass';filter.frequency.value=2400;filter.Q.value=.3;
    envelope.gain.setValueAtTime(0,start+offset);
    envelope.gain.linearRampToValueAtTime(amplitude,start+offset+.018);
    envelope.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);
    envelope.connect(filter);filter.connect(destination);
    const voices=[];
    for(const [harmonic,gain] of [[1,1],[2,.18],[3,.035]]){
      const oscillator=context.createOscillator(),level=context.createGain();
      oscillator.type='sine';oscillator.frequency.value=440*2**((midi-69)/12)*harmonic;
      level.gain.value=gain;oscillator.connect(level);level.connect(envelope);
      oscillator.start(start+offset);oscillator.stop(start+offset+duration+.03);
      voices.push(oscillator);onVoice(oscillator);
      oscillator.onended=()=>{
        oscillator.disconnect();level.disconnect();
        if(voices.every(v=>v!==oscillator&&v.ended||v===oscillator)){envelope.disconnect();filter.disconnect();}
        oscillator.ended=true;
      };
    }
  }
  for(const [i,n] of chord.entries())note(n,i*beat*.5,2.7,.035);
  for(const [i,n] of melody.entries())note(n,i*beat,1.9,.065);
}

export class HomeMusic {
  constructor({storage,onChange=()=>{},AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
    this.storage=storage;this.onChange=onChange;this.AudioContextClass=AudioContextClass;
    this.settings=readMusicSettings(storage);this.index=0;this.voices=new Set();this.disposed=false;
    this.visibility=()=>{if(!document.hidden&&this.settings.enabled)this.activate();else this.sync();};
    this.unlock=()=>{if(this.settings.enabled)this.activate();};
    document.addEventListener('visibilitychange',this.visibility);
    window.addEventListener('pointerdown',this.unlock);
    window.addEventListener('keydown',this.unlock);
  }
  state(){
    return {...this.settings,playing:this.context?.state==='running'&&!document.hidden&&this.settings.enabled,
      available:!!this.AudioContextClass,error:this.error||null,bar:this.index,voices:this.voices.size};
  }
  emit(){this.onChange(this.state());}
  save(){try{this.storage?.setItem(MUSIC_KEY,JSON.stringify(this.settings));}catch{/* Optional preference storage. */}}
  async activate(){
    if(this.disposed||!this.AudioContextClass||this.activating)return;
    this.activating=true;
    try{
      if(!this.context){
        this.context=new this.AudioContextClass();
        this.output=this.context.createGain();this.output.gain.value=0;
        this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;
        this.output.connect(this.analyser);this.analyser.connect(this.context.destination);
        this.context.onstatechange=()=>this.emit();
      }
      if(this.settings.enabled&&!document.hidden)await this.context.resume();
      if(this.disposed)return;
      this.error=null;this.sync();
    }catch(error){this.error=error.message;this.emit();}
    finally{this.activating=false;}
  }
  async setEnabled(enabled){
    this.settings.enabled=enabled;this.save();
    if(enabled)await this.activate();else this.sync();
    this.emit();
  }
  setVolume(volume){
    if(!Number.isFinite(volume))return;
    this.settings.volume=Math.max(0,Math.min(1,volume));
    this.save();this.sync();this.emit();
  }
  sync(){
    if(this.disposed||!this.context)return;
    const active=this.settings.enabled&&!document.hidden&&this.context.state==='running';
    const now=this.context.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(active?this.settings.volume*.65:0,now,.06);
    if(active&&!this.timer){
      this.next=now+.08;this.tick();this.timer=setInterval(()=>this.tick(),200);
    }else if(!active){
      clearInterval(this.timer);this.timer=null;
      for(const voice of this.voices){try{voice.stop(now+.12);}catch{/* Voice already ended. */}}
      this.voices.clear();
      if(document.hidden)this.context.suspend().catch(()=>{});
    }
    this.emit();
  }
  tick(){
    if(this.disposed||this.context.state!=='running')return;
    if(this.next<this.context.currentTime)this.next=this.context.currentTime+.08;
    if(this.next<this.context.currentTime+.3){
      scheduleBar(this.context,this.output,this.next,this.index++,voice=>{
        this.voices.add(voice);
        voice.addEventListener('ended',()=>this.voices.delete(voice),{once:true});
      });
      this.next+=BAR_SECONDS;
    }
  }
  diagnostics(){
    const samples=new Float32Array(256);this.analyser?.getFloatTimeDomainData(samples);
    return {...this.state(),peak:Math.max(...samples.map(Math.abs))};
  }
  dispose(){
    this.disposed=true;clearInterval(this.timer);
    document.removeEventListener('visibilitychange',this.visibility);
    window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);
    this.voices.clear();this.output?.disconnect();this.analyser?.disconnect();
    if(this.context){this.context.onstatechange=null;this.context.close().catch(()=>{});}
  }
}
