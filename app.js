const APP_VERSION='7.0.0';
const APP_CACHE_PREFIXES=['unipop-sites-','unipop-go-sites-','unipop-go-'];

async function cleanupLegacyAppCaches(){
  // GitHub settings/token live in localStorage/sessionStorage and are intentionally untouched.
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg=>{
        try{
          const scope=new URL(reg.scope);
          const here=new URL(location.href);
          // Only remove workers that can control this GitHub Pages path/origin.
          if(scope.origin===here.origin && here.href.startsWith(reg.scope)) return reg.unregister();
        }catch{}
        return Promise.resolve(false);
      }));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>APP_CACHE_PREFIXES.some(p=>k.startsWith(p))).map(k=>caches.delete(k)));
    }
  }catch(err){console.warn('Cache cleanup skipped',err)}
}

cleanupLegacyAppCaches();
const DATA_KEY='unipop-go-sites-data-v2';
const CFG_KEY='unipop-go-sites-github-v2';
const DB_NAME='unipop-go-sites-assets-v2';
const DB_STORE='assets';
const API_VERSION='2026-03-10';

const demo={schemaVersion:3,updatedAt:new Date().toISOString(),guides:[],locations:[
  {id:'belval',name:'UniPop Belval',aliases:['Belval','UniPop Esch','Site Belval'],address:'14, Porte de France\nL-4360 Esch-sur-Alzette',description:'Le site UniPop Belval est situé au cœur du quartier universitaire.',lat:49.5001,lng:5.9483,website:'https://www.unipop.lu',phone:'+352 247-88650',email:'',parking:'Parking Belval Plaza',parkingInfo:'À environ 5 minutes à pied.',transport:'Gare Belval-Université',transportInfo:'Train et lignes de bus à proximité.',accessInfo:'Entrée principale côté parvis.',pmr:true,active:true,hero:'',heroThumb:'',gallery:[],media:[],plans:[],tutorials:[],rooms:[]},
  {id:'niederanven',name:'UniPop Niederanven',aliases:['Niederanven'],address:'Niederanven',description:'',lat:49.651,lng:6.26,active:true,hero:'',heroThumb:'',gallery:[],media:[],plans:[],tutorials:[],rooms:[]}
]};

let data=loadData();
let currentId=data.locations[0]?.id||null;
const objectUrls=new Map();
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

function clone(x){return JSON.parse(JSON.stringify(x));}
function ensureUniqueLocationIds(source){
  const out=source&&Array.isArray(source.locations)?source:clone(demo);
  const used=new Set();
  let changed=false;
  out.locations.forEach((loc,index)=>{
    let base=slug(loc.id||loc.name||`lieu-${index+1}`);
    if(!base) base=`lieu-${index+1}`;
    let candidate=base, n=2;
    while(used.has(candidate)) candidate=`${base}-${n++}`;
    if(loc.id!==candidate){loc.id=candidate;changed=true}
    used.add(candidate);
  });
  if(changed){
    out.updatedAt=new Date().toISOString();
    try{localStorage.setItem(DATA_KEY,JSON.stringify(out))}catch{}
    setTimeout(()=>toast('IDs de lieux dupliqués corrigés automatiquement'),300);
  }
  return out;
}
function loadData(){try{const x=JSON.parse(localStorage.getItem(DATA_KEY));const out=ensureUniqueLocationIds(x&&x.locations?x:clone(demo));out.guides=Array.isArray(out.guides)?out.guides:[];out.locations.forEach(l=>{if(l.guideId==null)l.guideId='';(l.rooms||[]).forEach(r=>{if(r.guideId==null)r.guideId=''})});return out}catch{const out=ensureUniqueLocationIds(clone(demo));out.guides=[];return out}}
function saveData(msg='Enregistré'){readFields();persistData(msg)}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function slug(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'item'}
function current(){return data.locations.find(x=>x.id===currentId)}
function newLocation(){return{id:'lieu-'+Date.now(),name:'',aliases:[],address:'',description:'',lat:'',lng:'',website:'',phone:'',email:'',parking:'',parkingInfo:'',transport:'',transportInfo:'',accessInfo:'',pmr:false,active:true,guideId:'',hero:'',heroThumb:'',gallery:[],media:[],plans:[],tutorials:[],rooms:[]}}
function persistData(msg=''){data.updatedAt=new Date().toISOString();localStorage.setItem(DATA_KEY,JSON.stringify(data));stats();if(msg)toast(msg)}
function bytesText(n=0){if(n<1024)return n+' o';if(n<1048576)return (n/1024).toFixed(1)+' Ko';return (n/1048576).toFixed(1)+' Mo'}

function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE,{keyPath:'path'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbPut(rec){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(rec);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbGet(path){if(!path)return null;const db=await openDb();return new Promise((res,rej)=>{const r=db.transaction(DB_STORE).objectStore(DB_STORE).get(path);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}
async function dbDelete(path){if(!path)return;const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(path);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function dbAll(){const db=await openDb();return new Promise((res,rej)=>{const r=db.transaction(DB_STORE).objectStore(DB_STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}

async function optimizeImage(file,maxSide=1800,quality=.84){
  if(!file.type.startsWith('image/')||file.type==='image/svg+xml')return file;
  try{
    const bmp=await createImageBitmap(file);let w=bmp.width,h=bmp.height;const scale=Math.min(1,maxSide/Math.max(w,h));w=Math.round(w*scale);h=Math.round(h*scale);
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(bmp,0,0,w,h);bmp.close?.();
    const blob=await new Promise(r=>c.toBlob(r,'image/webp',quality));return blob||file;
  }catch{return file}
}
async function storeFile(file,path,optimize=true){
  let blob=optimize?await optimizeImage(file):file;
  await dbPut({path,blob,name:file.name,type:blob.type||file.type||'application/octet-stream',size:blob.size,updatedAt:new Date().toISOString()});
  if(objectUrls.has(path)){URL.revokeObjectURL(objectUrls.get(path));objectUrls.delete(path)}
  return {path,name:file.name,type:blob.type||file.type,size:blob.size};
}
async function previewUrl(path){
  if(!path)return '';
  if(objectUrls.has(path))return objectUrls.get(path);
  const rec=await dbGet(path);
  if(rec?.blob){const u=URL.createObjectURL(rec.blob);objectUrls.set(path,u);return u}
  const cfg=getCfg();if(cfg.owner&&cfg.repo)return `https://raw.githubusercontent.com/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/${encodeURIComponent(cfg.branch||'main')}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return '';
}
function extFor(file,optimized=true){if(optimized&&file.type.startsWith('image/')&&file.type!=='image/svg+xml')return 'webp';const n=file.name||'file';const i=n.lastIndexOf('.');return i>=0?slug(n.slice(i+1)):''}
function uniquePath(folder,file,optimize=true,prefix=''){const e=extFor(file,optimize);const base=slug(file.name.replace(/\.[^.]+$/,''));return `${folder}/${prefix}${Date.now()}-${base}${e?'.'+e:''}`}

function readFields(){const x=current();if(!x)return;const oldId=x.id;$$('[data-field]').forEach(el=>{const f=el.dataset.field;let v=el.type==='checkbox'?el.checked:el.value;if(f==='aliases')v=v.split(',').map(s=>s.trim()).filter(Boolean);if(['lat','lng'].includes(f))v=v===''?'':Number(v);x[f]=v});if(!x.id)x.id='lieu-'+Date.now();if(currentId===oldId&&x.id!==oldId)currentId=x.id}
function renderList(filter=''){
  const rows=data.locations.filter(x=>((x.name||'')+' '+(x.aliases||[]).join(' ')).toLowerCase().includes(filter.toLowerCase()));
  $('#locationList').innerHTML=rows.map(x=>{const idx=data.locations.indexOf(x);return `<button type="button" class="location-item ${x.id===currentId?'active':''}" data-index="${idx}"><img data-thumb="${esc(x.heroThumb||x.hero||'')}"><div><b>${esc(x.name||'Nouveau lieu')}</b><small>${esc((x.address||'').split('\n').pop()||'À compléter')}</small></div><span>›</span></button>`}).join('');
  $('#lieuCount').textContent=data.locations.length;
  $$('.location-item').forEach(el=>el.onclick=()=>{
    const idx=Number(el.dataset.index), target=data.locations[idx];
    if(!target)return;
    if(current()&&currentId!==target.id)saveData('');
    currentId=target.id;
    $('#lieuxView').classList.remove('focus-list');
    renderList($('#search').value);
    fill();
  });
  $$('[data-thumb]').forEach(async img=>{img.src=await previewUrl(img.dataset.thumb)||''});
}
async function fill(){const x=current();if(!x)return;$$('[data-field]').forEach(el=>{const f=el.dataset.field;if(el.type==='checkbox')el.checked=!!x[f];else el.value=f==='aliases'?(x.aliases||[]).join(', '):(x[f]??'')});$('#heroDrop').classList.toggle('has',!!x.hero);$('#heroImg').src=await previewUrl(x.hero)||'';renderGallery();renderMedia();renderPlans();renderTuts();renderGuideSelects();renderRooms();updateMap();previewData()}

async function setHero(file){const x=current(),folder=`assets/${slug(x.id||x.name)}`;const main=await storeFile(file,`${folder}/hero.webp`,true);const thumbBlob=await optimizeImage(file,520,.78);await dbPut({path:`${folder}/thumb.webp`,blob:thumbBlob,name:file.name,type:thumbBlob.type,size:thumbBlob.size,updatedAt:new Date().toISOString()});x.hero=main.path;x.heroThumb=`${folder}/thumb.webp`;saveData('Photo principale optimisée');renderList($('#search').value);fill()}
async function addFiles(files,target,kind){const x=current();x[target]=x[target]||[];const folder=`assets/${slug(x.id||x.name)}/${kind}`;for(const f of files){const optimize=f.type.startsWith('image/');const rec=await storeFile(f,uniquePath(folder,f,optimize),optimize);x[target].push(rec)}saveData('Fichier ajouté');fill()}
async function removeAsset(path){await dbDelete(path);if(objectUrls.has(path)){URL.revokeObjectURL(objectUrls.get(path));objectUrls.delete(path)}}

async function renderGallery(){const x=current();$('#gallery').innerHTML=(x.gallery||[]).map((g,i)=>`<div class="thumb"><img data-path="${esc(g.path)}"><button data-g="${i}">×</button></div>`).join('');for(const img of $$('#gallery [data-path]'))img.src=await previewUrl(img.dataset.path);$$('[data-g]').forEach(b=>b.onclick=async()=>{const g=x.gallery.splice(+b.dataset.g,1)[0];await removeAsset(g?.path);saveData();renderGallery()})}
async function renderMedia(){const x=current();$('#mediaGrid').innerHTML=(x.media||[]).map((m,i)=>`<div class="media-card">${m.type?.startsWith('image')?`<img data-path="${esc(m.path)}">`:'<div class="fileicon">▧</div>'}<button data-m="${i}">×</button><b>${esc(m.name)}</b><small>${esc(bytesText(m.size||0))}</small></div>`).join('')||'<p>Aucun média.</p>';for(const img of $$('#mediaGrid [data-path]'))img.src=await previewUrl(img.dataset.path);$$('[data-m]').forEach(b=>b.onclick=async()=>{const m=x.media.splice(+b.dataset.m,1)[0];await removeAsset(m?.path);saveData();renderMedia()})}
function renderPlans(){const x=current();$('#planGrid').innerHTML=(x.plans||[]).map((m,i)=>`<div class="file-card"><button data-p="${i}">×</button><b>▱ ${esc(m.name)}</b><p>${esc(m.type||'document')} · ${esc(bytesText(m.size||0))}</p></div>`).join('')||'<p>Aucun plan.</p>';$$('[data-p]').forEach(b=>b.onclick=async()=>{const m=x.plans.splice(+b.dataset.p,1)[0];await removeAsset(m?.path);saveData();renderPlans()})}
function renderTuts(){const x=current();$('#tutList').innerHTML=(x.tutorials||[]).map((t,i)=>`<div class="tutorial-row"><input value="${esc(t.title||'')}" data-ti="${i}" placeholder="Titre"><input value="${esc(t.url||'')}" data-tu="${i}" placeholder="URL externe (optionnel)"><label class="ghost small upload-inline">${t.path?'Remplacer fichier':'Ajouter fichier'}<input type="file" data-tf="${i}" hidden></label><button class="danger small" data-td="${i}">×</button>${t.path?`<small class="assetpath">${esc(t.path)}</small>`:''}</div>`).join('')||'<p>Aucun tutoriel.</p>';$$('[data-ti]').forEach(e=>e.oninput=()=>x.tutorials[+e.dataset.ti].title=e.value);$$('[data-tu]').forEach(e=>e.oninput=()=>x.tutorials[+e.dataset.tu].url=e.value);$$('[data-tf]').forEach(e=>e.onchange=async()=>{const f=e.files[0];if(!f)return;const t=x.tutorials[+e.dataset.tf];if(t.path)await removeAsset(t.path);const rec=await storeFile(f,uniquePath(`assets/${slug(x.id||x.name)}/tutorials`,f,f.type.startsWith('image/')),f.type.startsWith('image/'));Object.assign(t,rec);saveData('Tutoriel ajouté');renderTuts()});$$('[data-td]').forEach(e=>e.onclick=async()=>{const t=x.tutorials.splice(+e.dataset.td,1)[0];if(t?.path)await removeAsset(t.path);saveData();renderTuts()})}

function guideOptions(selected=''){
  return `<option value="">Aucun guide technique</option>`+(data.guides||[]).map(g=>`<option value="${esc(g.id)}" ${String(g.id)===String(selected)?'selected':''}>${esc(g.title||'Guide sans titre')}</option>`).join('');
}
function renderGuideSelects(){
  const x=current();if(!x)return;
  const sel=$('#lieuGuideSelect');if(sel){sel.innerHTML=guideOptions(x.guideId||'');sel.value=x.guideId||'';sel.onchange=()=>{x.guideId=sel.value;persistData('Guide technique du lieu mis à jour')}}
}
async function renderGuidesManager(){
  data.guides=data.guides||[];
  $('#genericContent').innerHTML=`<div class="guide-manager"><div class="sectiontitle"><div><h3>Guides techniques</h3><p>Créez les guides une fois, puis attribuez-les aux lieux ou aux salles.</p></div><button class="primary" id="addGuideGlobal">＋ Ajouter un guide</button></div><div id="guideRows" class="guide-list"></div></div>`;
  const rows=$('#guideRows');
  const draw=()=>{
    rows.innerHTML=(data.guides||[]).map((g,i)=>`<article class="guide-card"><div class="guide-card-head"><input value="${esc(g.title||'')}" data-gtitle="${i}" placeholder="Titre du guide"><button class="danger small" data-gdel="${i}">Supprimer</button></div><textarea data-gdesc="${i}" placeholder="Description courte (optionnel)">${esc(g.description||'')}</textarea><input value="${esc(g.url||'')}" data-gurl="${i}" placeholder="URL externe (optionnel)"><div class="guide-actions"><label class="ghost small upload-inline">${g.path?'Remplacer le fichier':'Ajouter un fichier'}<input type="file" data-gfile="${i}" hidden></label>${g.path?`<small class="assetpath">${esc(g.path)}</small>`:''}</div></article>`).join('')||'<p>Aucun guide technique. Cliquez sur « Ajouter un guide ».</p>';
    $$('[data-gtitle]').forEach(e=>e.oninput=()=>{data.guides[+e.dataset.gtitle].title=e.value;persistData('')});
    $$('[data-gdesc]').forEach(e=>e.oninput=()=>{data.guides[+e.dataset.gdesc].description=e.value;persistData('')});
    $$('[data-gurl]').forEach(e=>e.oninput=()=>{data.guides[+e.dataset.gurl].url=e.value;persistData('')});
    $$('[data-gfile]').forEach(e=>e.onchange=async()=>{const f=e.files[0];if(!f)return;const g=data.guides[+e.dataset.gfile];if(g.path)await removeAsset(g.path);const rec=await storeFile(f,uniquePath('assets/guides',f,f.type.startsWith('image/')),f.type.startsWith('image/'));Object.assign(g,rec);persistData('Guide technique ajouté');draw()});
    $$('[data-gdel]').forEach(e=>e.onclick=async()=>{const i=+e.dataset.gdel,g=data.guides[i];if(!confirm(`Supprimer le guide « ${g.title||'sans titre'} » ?`))return;if(g.path)await removeAsset(g.path);data.locations.forEach(l=>{if(l.guideId===g.id)l.guideId='';(l.rooms||[]).forEach(r=>{if(r.guideId===g.id)r.guideId=''})});data.guides.splice(i,1);persistData('Guide supprimé');draw()});
  };
  $('#addGuideGlobal').onclick=()=>{data.guides.push({id:'guide-'+Date.now(),title:'Nouveau guide technique',description:'',url:'',path:''});persistData('Guide ajouté');draw()};
  draw();
}
function newRoom(){return{id:'salle-'+Date.now(),name:'Nouvelle salle',aliases:[],floor:'',description:'',directions:'',equipment:[],guideId:'',hero:'',gallery:[]}}
async function renderRooms(){const x=current();x.rooms=x.rooms||[];$('#roomList').innerHTML=x.rooms.map((r,i)=>`<div class="room-card"><div class="room-head"><input value="${esc(r.name||'')}" data-rname="${i}"><button class="danger small" data-rdel="${i}">Supprimer</button></div><div class="two"><div><label>Étage</label><input value="${esc(r.floor||'')}" data-rfloor="${i}"></div><div><label>Alias</label><input value="${esc((r.aliases||[]).join(', '))}" data-ralias="${i}"></div></div><label>Chemin vers la salle</label><textarea data-rdir="${i}">${esc(r.directions||'')}</textarea><label>Équipement</label><input value="${esc((r.equipment||[]).join(', '))}" data-req="${i}" placeholder="Projecteur, HDMI, PC…"><label>Guide technique</label><select data-rguide="${i}">${guideOptions(r.guideId||'')}</select><div class="room-media"><div class="room-photo"><img data-rimg="${i}"><label class="ghost small">Photo salle<input type="file" accept="image/*" data-rfile="${i}" hidden></label></div><div><label>Galerie</label><div class="room-gallery" data-rgallery="${i}"></div><label class="ghost small">Ajouter images<input type="file" accept="image/*" multiple data-rgfile="${i}" hidden></label></div></div></div>`).join('')||'<p>Aucune salle enregistrée.</p>';
  for(const img of $$('[data-rimg]')){const r=x.rooms[+img.dataset.rimg];img.src=await previewUrl(r.hero)||''}
  for(const box of $$('[data-rgallery]')){const r=x.rooms[+box.dataset.rgallery];box.innerHTML=(r.gallery||[]).map((g,j)=>`<span class="mini-thumb"><img data-rgimg="${box.dataset.rgallery}:${j}"><button data-rgdel="${box.dataset.rgallery}:${j}">×</button></span>`).join('')}
  for(const img of $$('[data-rgimg]')){const[i,j]=img.dataset.rgimg.split(':').map(Number);img.src=await previewUrl(x.rooms[i].gallery[j].path)||''}
  $$('[data-rname]').forEach(e=>e.oninput=()=>x.rooms[+e.dataset.rname].name=e.value);$$('[data-rfloor]').forEach(e=>e.oninput=()=>x.rooms[+e.dataset.rfloor].floor=e.value);$$('[data-ralias]').forEach(e=>e.oninput=()=>x.rooms[+e.dataset.ralias].aliases=e.value.split(',').map(s=>s.trim()).filter(Boolean));$$('[data-rdir]').forEach(e=>e.oninput=()=>x.rooms[+e.dataset.rdir].directions=e.value);$$('[data-req]').forEach(e=>e.oninput=()=>x.rooms[+e.dataset.req].equipment=e.value.split(',').map(s=>s.trim()).filter(Boolean));$$('[data-rguide]').forEach(e=>e.onchange=()=>{x.rooms[+e.dataset.rguide].guideId=e.value;persistData('Guide technique de la salle mis à jour')});
  $$('[data-rdel]').forEach(e=>e.onclick=async()=>{const r=x.rooms.splice(+e.dataset.rdel,1)[0];for(const p of [r?.hero,...(r?.gallery||[]).map(g=>g.path)].filter(Boolean))await removeAsset(p);saveData('Salle supprimée');renderRooms()});
  $$('[data-rfile]').forEach(e=>e.onchange=async()=>{const f=e.files[0];if(!f)return;const r=x.rooms[+e.dataset.rfile];if(r.hero)await removeAsset(r.hero);const path=`assets/${slug(x.id||x.name)}/rooms/${slug(r.id||r.name)}/hero.webp`;r.hero=(await storeFile(f,path,true)).path;saveData('Photo de salle ajoutée');renderRooms()});
  $$('[data-rgfile]').forEach(e=>e.onchange=async()=>{const r=x.rooms[+e.dataset.rgfile];r.gallery=r.gallery||[];for(const f of e.files){r.gallery.push(await storeFile(f,uniquePath(`assets/${slug(x.id||x.name)}/rooms/${slug(r.id||r.name)}/gallery`,f,true),true))}saveData('Images de salle ajoutées');renderRooms()});
  $$('[data-rgdel]').forEach(e=>e.onclick=async()=>{const[i,j]=e.dataset.rgdel.split(':').map(Number);const g=x.rooms[i].gallery.splice(j,1)[0];await removeAsset(g?.path);saveData();renderRooms()});
}

function updateMap(){const x=current(),lat=Number(x.lat)||49.6116,lng=Number(x.lng)||6.1319;$('#mapFrame').src=`https://www.openstreetmap.org/export/embed.html?bbox=${lng-.01}%2C${lat-.006}%2C${lng+.01}%2C${lat+.006}&layer=mapnik&marker=${lat}%2C${lng}`}
function stats(){const loc=data.locations,rooms=loc.reduce((a,x)=>a+(x.rooms?.length||0),0),tuts=loc.reduce((a,x)=>a+(x.tutorials?.length||0),0),med=loc.reduce((a,x)=>a+(x.gallery?.length||0)+(x.media?.length||0)+(x.plans?.length||0)+(x.hero?1:0),0);$('#statLieux').textContent=loc.length;$('#statSalles').textContent=rooms;$('#statTuts').textContent=tuts;$('#statMedia').textContent=med;$('#lastUpdate').textContent='Dernière mise à jour '+new Date(data.updatedAt).toLocaleString('fr-LU')}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
async function previewData(){
  const x=current();if(!x)return;
  const hero=await previewUrl(x.hero)||'';
  $('#pHero').src=hero;$('#pHero').style.display=hero?'block':'none';
  $('#pName').textContent=x.name||'Lieu sans nom';
  $('#pAddress').textContent=x.address||'Adresse non renseignée';
  $('#pParking').innerHTML=`<b>🅿 ${esc(x.parking||'Parking non renseigné')}</b>${x.parkingInfo?`<small>${esc(x.parkingInfo)}</small>`:''}`;
  $('#pTransport').innerHTML=`<b>▣ ${esc(x.transport||'Transport non renseigné')}</b>${x.transportInfo?`<small>${esc(x.transportInfo)}</small>`:''}`;
  $('#pDesc').textContent=x.description||'';
  const lat=Number(x.lat),lng=Number(x.lng),hasGps=Number.isFinite(lat)&&Number.isFinite(lng)&&x.lat!==''&&x.lng!=='';
  const gallery=[...(x.gallery||[]),...(x.media||[]).filter(m=>m.type?.startsWith('image/'))];
  const galleryHtml=gallery.length?`<section class="psection"><h3>Photos</h3><div class="pgrid">${gallery.map((g,i)=>`<img data-passet="${esc(g.path)}" alt="Photo ${i+1}">`).join('')}</div></section>`:'';
  const accessHtml=(x.accessInfo||x.pmr)?`<section class="psection"><h3>Accès</h3>${x.accessInfo?`<p>${esc(x.accessInfo)}</p>`:''}${x.pmr?'<div class="pchips"><span>♿ Accessible PMR</span></div>':''}</section>`:'';
  const contact=[];if(x.website)contact.push(`<a href="${esc(x.website)}" target="_blank">🌐 Site web</a>`);if(x.phone)contact.push(`<a href="tel:${esc(x.phone)}">☎ ${esc(x.phone)}</a>`);if(x.email)contact.push(`<a href="mailto:${esc(x.email)}">✉ ${esc(x.email)}</a>`);
  const contactHtml=contact.length?`<section class="psection"><h3>Contact</h3><div class="plinks">${contact.join('')}</div></section>`:'';
  const guideFor=id=>(data.guides||[]).find(g=>String(g.id)===String(id));
  const roomsHtml=(x.rooms||[]).length?`<section class="psection"><h3>Salles</h3><div class="prooms">${x.rooms.map((r,i)=>`<div class="proom">${r.hero?`<img data-proomimg="${i}" alt="${esc(r.name||'Salle')}">`:''}<div><b>${esc(r.name||'Salle')}</b>${r.floor?`<small>Étage : ${esc(r.floor)}</small>`:''}${r.directions?`<p>${esc(r.directions)}</p>`:''}${(r.equipment||[]).length?`<div class="pchips">${r.equipment.map(e=>`<span>${esc(e)}</span>`).join('')}</div>`:''}${guideFor(r.guideId)?`<small>🛠 Guide technique : ${esc(guideFor(r.guideId).title||'Guide')}</small>`:''}</div></div>`).join('')}</div></section>`:'';
  const plansHtml=(x.plans||[]).length?`<section class="psection"><h3>Plans & documents</h3><div class="pdocs">${x.plans.map(p=>`<div>▱ <b>${esc(p.name||'Document')}</b><small>${esc(bytesText(p.size||0))}</small></div>`).join('')}</div></section>`:'';
  const tutsHtml=(x.tutorials||[]).length?`<section class="psection"><h3>Tutoriels</h3><div class="pdocs">${x.tutorials.map(t=>`<div>▶ <b>${esc(t.title||t.name||'Tutoriel')}</b>${t.url?'<small>Lien externe</small>':t.path?'<small>Fichier</small>':''}</div>`).join('')}</div></section>`:'';
  const siteGuide=guideFor(x.guideId);const guideHtml=siteGuide?`<section class="psection"><h3>Guide technique</h3><div class="pdocs"><div>🛠 <b>${esc(siteGuide.title||'Guide technique')}</b></div></div></section>`:'';
  const mapHtml=hasGps?`<section class="psection"><h3>Carte</h3><iframe class="pmap" src="https://www.openstreetmap.org/export/embed.html?bbox=${lng-.01}%2C${lat-.006}%2C${lng+.01}%2C${lat+.006}&layer=mapnik&marker=${lat}%2C${lng}"></iframe></section>`:'';
  $('#pExtra').innerHTML=`${accessHtml}${galleryHtml}${roomsHtml}${guideHtml}${plansHtml}${tutsHtml}${contactHtml}${mapHtml}`;
  for(const img of $$('#pExtra [data-passet]'))img.src=await previewUrl(img.dataset.passet)||'';
  for(const img of $$('#pExtra [data-proomimg]')){const r=x.rooms[+img.dataset.proomimg];img.src=await previewUrl(r.hero)||'';}
  $('#pGoogle').onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hasGps?lat+','+lng:(x.address||x.name))}`,'_blank');
  $('#pApple').onclick=()=>window.open(`https://maps.apple.com/?q=${encodeURIComponent(x.name||'UniPop')}${hasGps?`&ll=${lat},${lng}`:''}`,'_blank');
}


function cleanForExport(){readFields();const out=clone(data);out.schemaVersion=3;out.updatedAt=new Date().toISOString();out.locations=out.locations.filter(x=>x.active!==false);return out}
function downloadJson(){const out=cleanForExport(),blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sites.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}

function getCfg(){let x={owner:'letzbug',repo:'unipop_go_sites',branch:'main',remember:false};try{x={...x,...JSON.parse(localStorage.getItem(CFG_KEY)||'{}')}}catch{};const sessionToken=sessionStorage.getItem(CFG_KEY+'-token');const localToken=localStorage.getItem(CFG_KEY+'-token');x.token=sessionToken||localToken||'';return x}
function loadCfgUI(){const c=getCfg();$('#ghOwner').value=c.owner;$('#ghRepo').value=c.repo;$('#ghBranch').value=c.branch;$('#ghToken').value=c.token||'';$('#ghRemember').checked=!!c.remember}
function saveCfgUI(){const c={owner:$('#ghOwner').value.trim(),repo:$('#ghRepo').value.trim(),branch:$('#ghBranch').value.trim()||'main',remember:$('#ghRemember').checked};localStorage.setItem(CFG_KEY,JSON.stringify(c));const token=$('#ghToken').value.trim();sessionStorage.setItem(CFG_KEY+'-token',token);if(c.remember)localStorage.setItem(CFG_KEY+'-token',token);else localStorage.removeItem(CFG_KEY+'-token');return{...c,token}}
async function gh(url,{method='GET',body}={}){const c=saveCfgUI();if(!c.token)throw new Error('Ajoutez d’abord un token GitHub.');const r=await fetch(`https://api.github.com${url}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${c.token}`,'X-GitHub-Api-Version':API_VERSION,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok){const txt=await r.text();throw new Error(`GitHub ${r.status}: ${txt.slice(0,280)}`)}return r.status===204?null:r.json()}
function toBase64(bytes){let s='',u=new Uint8Array(bytes),chunk=0x8000;for(let i=0;i<u.length;i+=chunk)s+=String.fromCharCode(...u.subarray(i,i+chunk));return btoa(s)}
function referencedPaths(obj){const set=new Set();const walk=x=>{if(!x)return;if(Array.isArray(x))return x.forEach(walk);if(typeof x==='object'){for(const[k,v]of Object.entries(x)){if((k==='path'||k==='hero'||k==='heroThumb')&&typeof v==='string'&&v.startsWith('assets/'))set.add(v);else walk(v)}}};walk(obj);return [...set]}

function isoTime(v){
  const t=Date.parse(v||'');
  return Number.isFinite(t)?t:0;
}
function looksLikeRealData(x){
  return !!(x && Array.isArray(x.locations) && x.locations.length);
}
function githubRawSitesUrl(c){
  return `https://raw.githubusercontent.com/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/${encodeURIComponent(c.branch||'main')}/sites.json?v=${Date.now()}`;
}
async function fetchRemoteSites(){
  const c=getCfg();
  if(!c.owner||!c.repo)throw new Error('Owner ou repository GitHub manquant.');
  // Public raw file does not need the token. This is deliberate: a new Mac can
  // restore the central database before any write operation is allowed.
  const r=await fetch(githubRawSitesUrl(c),{cache:'no-store'});
  if(!r.ok)throw new Error(`Impossible de charger sites.json depuis GitHub (${r.status}).`);
  const remote=await r.json();
  if(!looksLikeRealData(remote))throw new Error('Le sites.json GitHub ne contient aucun lieu.');
  remote.guides=Array.isArray(remote.guides)?remote.guides:[];
  remote.locations.forEach(l=>{
    l.rooms=Array.isArray(l.rooms)?l.rooms:[];
    l.tutorials=Array.isArray(l.tutorials)?l.tutorials:[];
    if(l.guideId==null)l.guideId='';
    l.rooms.forEach(room=>{if(room.guideId==null)room.guideId=''});
  });
  return ensureUniqueLocationIds(remote);
}
function applyRemoteSites(remote,msg='Données GitHub chargées'){
  data=remote;
  currentId=data.locations[0]?.id||null;
  localStorage.setItem(DATA_KEY,JSON.stringify(data));
  renderList($('#search')?.value||'');
  fill();
  stats();
  const info=$('#syncInfo');
  if(info)info.textContent=`✓ ${msg} · ${data.locations.length} lieu(x) · ${data.updatedAt?new Date(data.updatedAt).toLocaleString('fr-LU'):'date inconnue'}`;
  toast(msg);
}
async function syncFromGitHub({manual=false}={}){
  const info=$('#syncInfo');
  try{
    if(info)info.textContent='Synchronisation avec GitHub…';
    const remote=await fetchRemoteSites();
    const local=loadData();
    const remoteTime=isoTime(remote.updatedAt);
    const localTime=isoTime(local.updatedAt);

    if(manual){
      const ok=confirm(
        `Charger la base centrale depuis GitHub ?\n\n`+
        `GitHub : ${remote.locations.length} lieu(x)\n`+
        `Local : ${local.locations?.length||0} lieu(x)\n\n`+
        `La copie locale actuelle sera remplacée, mais rien ne sera supprimé sur GitHub.`
      );
      if(!ok){
        if(info)info.textContent='Synchronisation annulée. Les données locales restent inchangées.';
        return false;
      }
      applyRemoteSites(remote,'Base centrale GitHub chargée');
      return true;
    }

    // SAFE AUTO-SYNC:
    // - New/old browsers get the newer central copy.
    // - If this browser contains newer unpublished work, NEVER overwrite it.
    const localLooksDefault=(local.locations?.length||0)<=2;
    if(localLooksDefault || remoteTime>localTime){
      applyRemoteSites(remote,'Base centrale GitHub synchronisée');
      return true;
    }

    if(info){
      info.textContent=localTime>remoteTime
        ? 'Données locales plus récentes : aucune donnée locale n’a été écrasée.'
        : 'Données locales déjà à jour.';
    }
    return false;
  }catch(e){
    console.warn('GitHub sync:',e);
    if(info)info.textContent='GitHub indisponible : utilisation de la copie locale, aucune donnée supprimée.';
    if(manual)alert(e.message);
    return false;
  }
}

async function publishGitHub(){
  saveData(null);const c=saveCfgUI();if(!c.owner||!c.repo||!c.token)throw new Error('Renseignez owner, repository et token GitHub dans Paramètres.');
  const out=cleanForExport();const paths=referencedPaths(out);const assets=await dbAll();const byPath=new Map(assets.map(a=>[a.path,a]));const files=[];
  for(const p of paths){const rec=byPath.get(p);if(rec?.blob)files.push({path:p,content:toBase64(await rec.blob.arrayBuffer()),encoding:'base64'});}
  files.push({path:'sites.json',content:toBase64(new TextEncoder().encode(JSON.stringify(out,null,2))),encoding:'base64'});
  $('#publishProgress').classList.remove('hidden');$('#publishStatus').textContent=`Préparation de ${files.length} fichier(s)…`;
  const ref=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/ref/heads/${encodeURIComponent(c.branch)}`);const parentSha=ref.object.sha;
  const parentCommit=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/commits/${parentSha}`);const treeEntries=[];let n=0;
  for(const f of files){$('#publishStatus').textContent=`Upload ${++n}/${files.length} · ${f.path}`;const blob=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/blobs`,{method:'POST',body:{content:f.content,encoding:f.encoding}});treeEntries.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha})}
  $('#publishStatus').textContent='Création du commit…';const tree=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/trees`,{method:'POST',body:{base_tree:parentCommit.tree.sha,tree:treeEntries}});const commit=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/commits`,{method:'POST',body:{message:`UniPop Go Sites · ${new Date().toLocaleString('fr-LU')}`,tree:tree.sha,parents:[parentSha]}});await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/git/refs/heads/${encodeURIComponent(c.branch)}`,{method:'PATCH',body:{sha:commit.sha,force:false}});$('#publishStatus').textContent='Publié avec succès ✓';setTimeout(()=>$('#publishProgress').classList.add('hidden'),1800);toast('Données publiées sur GitHub')
}
async function testGithub(){const state=$('#ghState');try{if(state){state.textContent='Test en cours…';state.className='gh-state'}const c=saveCfgUI();const r=await gh(`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);if(state){state.textContent='Connexion OK';state.className='gh-state ok'}toast(`Connexion OK · ${r.full_name}`)}catch(e){if(state){state.textContent='Connexion échouée';state.className='gh-state error'}alert(e.message)}}

function generic(view){$('#lieuxView').classList.add('hidden');$('#githubView')?.classList.add('hidden');$('#genericView').classList.remove('hidden');const title={dashboard:'Tableau de bord',salles:'Salles',tutorials:'Tutoriels',guides:'Guides techniques',plans:'Plans',media:'Médias'}[view];$('#genericTitle').textContent=title;if(view==='guides'){ $('#pageTitle').textContent=title;renderGuidesManager();return;}let items=[];if(view==='dashboard')items=data.locations.map(x=>({h:x.name,p:`${x.rooms?.length||0} salles · ${x.gallery?.length||0} images`}));if(view==='salles')data.locations.forEach(x=>(x.rooms||[]).forEach(r=>items.push({h:r.name,p:x.name+' · '+(r.floor||'')})));if(view==='tutorials')data.locations.forEach(x=>(x.tutorials||[]).forEach(r=>items.push({h:r.title,p:x.name})));if(view==='plans')data.locations.forEach(x=>(x.plans||[]).forEach(r=>items.push({h:r.name,p:x.name})));if(view==='media')data.locations.forEach(x=>(x.media||[]).forEach(r=>items.push({h:r.name,p:x.name})));$('#genericContent').innerHTML=items.map(i=>`<div class="generic-card"><h3>${esc(i.h)}</h3><p>${esc(i.p)}</p></div>`).join('')||'<p>Aucune donnée.</p>';$('#pageTitle').textContent=title}

$$('nav button[data-view]').forEach(b=>b.onclick=()=>{$$('nav button[data-view]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#lieuxView').classList.add('hidden');$('#genericView').classList.add('hidden');$('#githubView')?.classList.add('hidden');if(b.dataset.view==='lieux'){$('#lieuxView').classList.remove('hidden');$('#pageTitle').textContent='Lieux & Salles';$('#pageSub').textContent='Base de données pour UniPop Go'}else if(b.dataset.view==='github'){$('#githubView').classList.remove('hidden');$('#pageTitle').textContent='Configuration GitHub';$('#pageSub').textContent='Publication de sites.json et des assets';loadCfgUI()}else generic(b.dataset.view)});
$$('.tabs button').forEach(b=>b.onclick=()=>{$$('.tabs button').forEach(x=>x.classList.remove('active'));$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#tab-'+b.dataset.tab).classList.add('active')});
$('#search').oninput=e=>renderList(e.target.value);$('#saveBtn').onclick=()=>{saveData();renderList($('#search').value);fill()};$('#addLieu').onclick=()=>{if(current())saveData('');const x=newLocation();data.locations.unshift(x);currentId=x.id;persistData('Nouveau lieu créé');$('#search').value='';$('#lieuxView').classList.remove('focus-list');renderList();fill();document.querySelector('[data-field="name"]')?.focus()};$('#backToList').onclick=()=>{if(current())saveData('');$('#search').value='';renderList();$('#lieuxView').classList.add('focus-list');document.querySelector('.locations')?.scrollIntoView({behavior:'smooth',block:'start'})};
$('#deleteLieu').onclick=()=>{if(!current()||!confirm('Supprimer ce lieu ?'))return;data.locations=data.locations.filter(x=>x.id!==currentId);currentId=data.locations[0]?.id||null;persistData('Lieu supprimé');renderList();fill();if(!currentId)$('#lieuxView').classList.add('focus-list')};
$('#heroFile').onchange=e=>{const f=e.target.files[0];if(f)setHero(f)};$('#addGallery').onclick=()=>$('#galleryFile').click();$('#galleryFile').onchange=e=>addFiles(e.target.files,'gallery','gallery');$('#mediaUploadBtn').onclick=()=>$('#mediaFile').click();$('#mediaFile').onchange=e=>addFiles(e.target.files,'media','media');$('#planUploadBtn').onclick=()=>$('#planFile').click();$('#planFile').onchange=e=>addFiles(e.target.files,'plans','plans');$('#addTut').onclick=()=>{current().tutorials=current().tutorials||[];current().tutorials.push({title:'Nouveau tutoriel',url:'',path:''});renderTuts()};$('#addRoom').onclick=()=>{current().rooms=current().rooms||[];current().rooms.push(newRoom());saveData('Salle ajoutée');renderRooms()};
$('#googleMaps').onclick=()=>{const x=current();window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((x.lat&&x.lng)?x.lat+','+x.lng:x.address)}`,'_blank')};$('#appleMaps').onclick=()=>{const x=current();window.open(`https://maps.apple.com/?q=${encodeURIComponent(x.name)}&ll=${x.lat},${x.lng}`,'_blank')};
$('#exportBtn').onclick=downloadJson;$('#publishTop').onclick=$('#publishBtn').onclick=()=>publishGitHub().catch(e=>{console.error(e);$('#publishProgress').classList.add('hidden');alert(e.message)});$('#testGithub').onclick=testGithub;
$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!x.locations)throw new Error();data=x;currentId=data.locations[0]?.id||null;localStorage.setItem(DATA_KEY,JSON.stringify(data));renderList();fill();stats();toast('JSON importé')}catch{alert('JSON invalide')}};
$('#resetBtn').onclick=()=>{if(!confirm('Réinitialiser les données locales ?'))return;data=clone(demo);currentId=data.locations[0].id;localStorage.setItem(DATA_KEY,JSON.stringify(data));renderList();fill();stats()};
$('#previewBtn').onclick=()=>{$('#previewModal').classList.remove('hidden');previewData()};$('#closePreview').onclick=()=>$('#previewModal').classList.add('hidden');
['ghOwner','ghRepo','ghBranch','ghToken','ghRemember'].forEach(id=>$('#'+id)?.addEventListener('change',saveCfgUI));
$('#saveGithub')?.addEventListener('click',()=>{saveCfgUI();toast('Configuration GitHub enregistrée')});
$('#syncGithub')?.addEventListener('click',()=>syncFromGitHub({manual:true}));
$('#publishGithubNow')?.addEventListener('click',()=>publishGitHub().catch(e=>{console.error(e);$('#publishProgress').classList.add('hidden');alert(e.message)}));


let startupSyncFinished=false;
const _syncFromGitHub=syncFromGitHub;
syncFromGitHub=async function(opts={}){
  try{return await _syncFromGitHub(opts)}
  finally{
    startupSyncFinished=true;
    ['publishTop','publishBtn','publishGithubNow'].forEach(id=>{const b=$('#'+id);if(b)b.disabled=false});
  }
};
['publishTop','publishBtn','publishGithubNow'].forEach(id=>{const b=$('#'+id);if(b)b.disabled=true});

loadCfgUI();renderList();fill();stats();syncFromGitHub({manual:false});
