const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=__dirname;
const server=http.createServer(async(req,res)=>{
  try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/motion-preview.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const data=await fs.readFile(target);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(8765,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8765/'));
