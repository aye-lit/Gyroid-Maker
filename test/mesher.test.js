const fs=require('fs');
const meshGyroid=new Function(fs.readFileSync(require('path').join(__dirname,'../src/mesher.js'),'utf8')+';return meshGyroid;')();
function check(name,p){
  const t0=Date.now(); const r=meshGyroid(Object.assign({noSplit:true},p)); const dt=Date.now()-t0;
  const I=r.indices, E=new Map(); let bad=0; 
  for(let f=0;f<I.length;f+=3){ for(let e=0;e<3;e++){ const a=I[f+e],b=I[f+(e+1)%3]; if(a===b){bad++;continue;} const k=a+','+b; E.set(k,(E.get(k)||0)+1);} }
  let open=0,nonman=0; for(const [k,c] of E){ const [a,b]=k.split(','); if(c!==1) nonman++; if(!E.has(b+','+a)) open++; }
  // vertex euler
  const edges=new Set(); for(const k of E.keys()){const [a,b]=k.split(',').map(Number); edges.add(Math.min(a,b)+','+Math.max(a,b));}
  const chi=r.vertices-edges.size+r.triangles;
  console.log(name,'tris',r.triangles,'verts',r.vertices,'ms',dt,'size',r.size.map(v=>v.toFixed(2)).join('x'),'vol',r.volume.toFixed(1),'openEdges',open,'nonManifold',nonman,'degenerateIdx',bad,'euler',chi,'vox',r.voxel.toFixed(3),'thin',r.thin);
  if(r.triangles&&(open||nonman||bad)){console.error('FAIL',name);process.exitCode=1;}
  return r;
}
const base={quality:'standard'};
const cell=check('cell40 t2',{...base,mode:'cell',size:40,thickness:2,nx:1,ny:1,nz:1});
console.log(' expected vol ~', (3.09*1600*2).toFixed(0));
check('cell40 2x2x1',{...base,mode:'cell',size:40,thickness:2,nx:2,ny:2,nz:1});
const cube=check('cube40 t2',{...base,mode:'cube',size:40,thickness:2});
const patch=check('patch20 t2',{...base,mode:'patch',size:20,thickness:2});
console.log(' 6*patch',(6*patch.volume).toFixed(0),'cube',cube.volume.toFixed(0));
check('patch20 t0.6 draft',{mode:'patch',size:20,thickness:0.6,quality:'draft'});
check('patch20 t4 fine',{mode:'patch',size:20,thickness:4,quality:'fine'});
check('cell60 t1 3x3x3 std',{...base,mode:'cell',size:60,thickness:1,nx:3,ny:3,nz:3});
