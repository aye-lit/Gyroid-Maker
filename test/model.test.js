const fs=require('fs');const {icosphere,torus,box}=require('./shapes');
const meshGyroid=new Function(fs.readFileSync(require('path').join(__dirname,'../src/mesher.js'),'utf8')+';return meshGyroid;')();
function orient(pos){ // signed volume; flip if negative
  let v=0;for(let i=0;i<pos.length;i+=9){const a=pos.subarray(i,i+3),b=pos.subarray(i+3,i+6),c=pos.subarray(i+6,i+9);
   v+=(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return v;}
function check(name,model,p){
  const t0=Date.now();const r=meshGyroid(Object.assign({mode:'model',model:{positions:model},quality:'standard',noSplit:true},p));const dt=Date.now()-t0;
  if(r.tooBig){console.log(name,'TOOBIG maxSize',r.maxSize);return r;}
  const I=r.indices,E=new Map();for(let f=0;f<I.length;f+=3)for(let e=0;e<3;e++){const a=I[f+e],b=I[f+(e+1)%3];const k=a+','+b;E.set(k,(E.get(k)||0)+1);}
  let open=0,nm=0;for(const [k,c] of E){const [a,b]=k.split(',');if(c!==1)nm++;if(!E.has(b+','+a))open++;}
  console.log(name,'tris',r.triangles,'ms',dt,'size',r.size.map(v=>v.toFixed(1)).join('x'),'vol',r.volume.toFixed(0),'open',open,'nonMan',nm,'vox',r.voxel.toFixed(2),'modelVol',(orient(model)).toFixed(0));
  if(open||nm){console.error('FAIL',name);process.exitCode=1;}
  return r;
}
const s=icosphere(10,3), tor=torus(10,4,48,24), bx=box(10,20,30);
console.log('sphere vol sig',orient(s).toFixed(1), 'torus',orient(tor).toFixed(1));
check('sphere 40mm cell10 t1',s,{size:40,cellSize:10,thickness:1});
check('torus 60mm cell12 t1.2',tor,{size:60,cellSize:12,thickness:1.2});
check('box 50mm cell10 t1',bx,{size:50,cellSize:10,thickness:1});
check('sphere too fine',s,{size:100,cellSize:5,thickness:0.5});
