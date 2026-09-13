import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadBlenderModels } from './model-assets.js';
import { loadResidentAssets } from './characters.js';
import './index.css';
import './hud.css';

class GameBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div className="world-loading"><strong>这个小世界暂时遇到了一点问题</strong><p>现有存档仍保留在浏览器中。</p><button className="primary-button" onClick={() => window.location.reload()}>重新加载</button></div>;
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root'));
root.render(<div className="world-loading" role="status"><strong>正在加载居民</strong></div>);
let lastProgress=-1;
loadResidentAssets((loaded,total)=>{
  const progress=total?Math.min(99,Math.floor(loaded/total*100)):0;
  if(progress===lastProgress)return;
  lastProgress=progress;
  root.render(<div className="world-loading" role="status"><strong>正在加载居民 · {progress}%</strong><progress aria-label="居民资源加载进度" max={100} value={progress} style={{width:200,maxWidth:'70%'}} /></div>);
}).then(async resident => {
  root.render(<div className="world-loading" role="status"><strong>正在布置家园</strong></div>);
  const status=await loadBlenderModels();
  root.render(<GameBoundary><App modelWarning={!resident.loaded || Object.keys(status.failed).length + Object.keys(status.scenery.failed).length > 0} /></GameBoundary>);
});
