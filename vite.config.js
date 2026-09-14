import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {createReadStream, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const localResident={
  name:'local-resident-preview',
  configureServer(server){
    server.middlewares.use('/__local-resident',(request,response,next)=>{
      const file=new URL(request.url,'http://localhost').pathname.slice(1);
      if(!['manifest.json','resident.glb','resident.glb.gz'].includes(file))return next();
      const path=resolve('.runtime/refined-resident',file);
      if(!existsSync(path))return next();
      response.setHeader('Content-Type',file.endsWith('.json')?'application/json':'application/octet-stream');
      response.setHeader('Cache-Control','no-cache');
      createReadStream(path).pipe(response);
    });
  },
};

export default defineConfig({
  plugins: [react(),localResident],
  base: './',
  server: {
    port: 5186,
    strictPort: true,
    watch: { ignored: ['**/.runtime/**', '**/art/**', '**/test-results/**'] },
  },
});
