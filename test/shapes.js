// test meshes (triangle soup, outward winding)
function icosphere(r,sub){
  const t=(1+Math.sqrt(5))/2; let v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(a=>{const l=Math.hypot(...a);return a.map(x=>x/l)});
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<sub;s++){const nf=[],cache={};const mid=(a,b)=>{const k=a<b?a+'_'+b:b+'_'+a;if(cache[k]!==undefined)return cache[k];const m=[0,1,2].map(i=>(v[a][i]+v[b][i])/2);const l=Math.hypot(...m);v.push(m.map(x=>x/l));return cache[k]=v.length-1;};
    for(const [a,b,c] of f){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}f=nf;}
  const out=[];for(const [a,b,c] of f)for(const i of [a,b,c])out.push(v[i][0]*r,v[i][1]*r,v[i][2]*r);return new Float32Array(out);
}
function torus(R,r,nu,nv){const P=(u,w)=>[(R+r*Math.cos(w))*Math.cos(u),(R+r*Math.cos(w))*Math.sin(u),r*Math.sin(w)];const out=[];
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const u0=i/nu*2*Math.PI,u1=(i+1)/nu*2*Math.PI,w0=j/nv*2*Math.PI,w1=(j+1)/nv*2*Math.PI;
    const a=P(u0,w0),b=P(u1,w0),c=P(u1,w1),d=P(u0,w1);out.push(...a,...b,...c,...a,...c,...d);}return new Float32Array(out);}
function box(x,y,z){const h=[x/2,y/2,z/2];const V=[];for(const i of[0,1])for(const j of[0,1])for(const k of[0,1])V.push([i?h[0]:-h[0],j?h[1]:-h[1],k?h[2]:-h[2]]);
  const q=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];const out=[];
  for(const [a,b,c,d] of q){for(const i of[a,b,c,a,c,d])out.push(...V[i]);}return new Float32Array(out);}
module.exports={icosphere,torus,box};
