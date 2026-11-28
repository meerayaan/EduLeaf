
'use strict';const $=id=>document.getElementById(id);let secret='',session=0,page=1,count=0,busy=false,courses=null,editAction='',editId;const types=['Study Notes','Previous Year Question Papers','Solved Papers','Important Questions','Other'];const groups={MAJOR:'Major',MINOR:'Minor',MULTIDISCIPLINARY:'MDC',ABILITY:'AEC',SKILL:'SEC',VALUE:'VAC'};const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n};const btn=(text,fn,cls='secondary')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b};async function api(action,id,body,params={}){const u=new URL('/api/admin',location.origin);u.searchParams.set('action',action);if(id!=null)u.searchParams.set('id',id);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const res=await fetch(u,{method:body!==undefined?'POST':'GET',body,cache:'no-store',credentials:'same-origin',redirect:'error'});if(res.status===401){location.replace('/admin-login.html');throw Error('Session expired')}if(!res.ok){let d;try{d=await res.json()}catch{}throw Error(d?.error||'HTTP '+res.status)}return res}async function load(){const s=session;const d=await(await api('list',null,undefined,{page,search:$('search').value,status:$('filter').value})).json();if(s!==session)return;count=d.count; selected.clear(); visible=d.submissions; syncSelection();$('stats').replaceChildren();for(const [k,v] of Object.entries(d.stats)){const a=el('article');a.append(el('small',k==='bytes'?'Stored file size':k),el('strong',k==='bytes'?(v/1048576).toFixed(2)+' MB':String(v)));$('stats').append(a)}$('items').replaceChildren();for(const x of d.submissions)render(x);if(!d.submissions.length)$('items').append(el('p','No materials found'));$('page').textContent=`Page ${page} / ${Math.max(1,Math.ceil(count/25))}`;$('prev').disabled=page<=1;$('next').disabled=page*25>=count}async function run(fn){if(busy)return;busy=true;const s=session;try{await fn()}catch(e){if(s===session)$('message').textContent=e.message}finally{busy=false}}function render(x){const a=el('article'),status=x.deleting?'deleting':x.unpublished?'unpublished':x.status;a.append(el('p',status,'tag'),el('h3',x.subject),el('p',`${x.batch} · Semester ${x.semester} · ${x.category}`),el('p',x.material_type),el('p',x.file_name),el('p',x.description||''),el('small',`#${x.id} · ${x.contributor||'Anonymous'}`));const row=el('div','','row');const act=(name,label,cls)=>row.append(btn(label,()=>run(async()=>{if(!confirm(`${label} #${x.id}?`))return;const d=await(await api(name,x.id,null)).json();await load();$('message').textContent=d.warning||label+' completed';}),cls));if(!x.deleting){row.append(btn('Download',()=>run(async()=>{const s=session,b=await(await api('download',x.id)).blob();if(s!==session)return;const u=URL.createObjectURL(b),l=el('a');l.href=u;l.download=x.file_name;document.body.append(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),10000)})),btn('Edit',()=>run(()=>editor('edit',x))),btn('Replace',()=>run(()=>editor('replace',x))));if(status==='pending'){act('approve','Approve');act('reject','Reject','danger')}if(status==='approved')act('unpublish','Unpublish');if(status==='unpublished')act('republish','Republish');if(status==='rejected')act('restore','Restore to pending')}act('delete',x.deleting?'Retry permanent deletion':'Permanently delete','danger');const check=el('input');check.type='checkbox';check.setAttribute('aria-label','Select submission '+x.id);check.dataset.selection=String(x.id);check.onchange=()=>{if(check.checked)selected.add(x.id);else selected.delete(x.id);syncSelection()};const label=el('label','Select #'+x.id+' ');label.prepend(check);a.prepend(label);a.append(row);$('items').append(a)}function field(name,label,tag='input',value='',options=[]){const l=el('label',label),n=el(tag);n.name=name;if(tag==='select'){for(const v of options){const o=el('option',v);o.value=v;n.append(o)}}n.value=value;l.append(n);$('fields').append(l);return n}async function editor(action,x={}){const s=session;editAction=action;editId=x.id;$('fields').replaceChildren();$('editMessage').textContent='';$('editorTitle').textContent=action==='upload'?'Upload material':action==='edit'?'Edit details':'Replace file (returns to pending)';if(action!=='replace'){if(!courses){const r=await fetch('/courses.json');if(!r.ok)throw Error('Catalogue unavailable');courses=await r.json()}if(s!==session)return;const b=field('batch','Batch','select',x.batch||'2026',['2024','2025','2026']),sem=field('semester','Semester','select',String(x.semester||1),['1','2','3','4','5','6','7','8']),cat=field('category','Category','select',x.category||'Major',['Major','Minor','MDC','AEC','SEC','VAC','Other']),sub=field('subject','Subject','select');function update(){sub.replaceChildren();const vals=new Set(courses.filter(c=>c.batch===b.value&&Number(c.semester.startsWith('Ist')?'1':c.semester.match(/^\d+/)?.[0])===Number(sem.value)&&(groups[c.category.split(' ')[0]]||'Other')===cat.value).map(c=>c.name+' | '+c.code));for(const v of [...vals].sort()){const o=el('option',v);o.value=v;sub.append(o)}}b.onchange=sem.onchange=cat.onchange=update;update();if(x.subject)sub.value=x.subject;sub.required=true;field('type','Material type','select',x.material_type||types[0],types);field('details','Description','textarea',x.description||'').maxLength=1000;field('contributor','Contributor','input',x.contributor||'').maxLength=100;if(action==='edit')field('file_name','Filename','input',x.file_name).required=true}if(action!=='edit'){const f=field('file','File (max 10 MB)');f.type='file';f.accept='.pdf,.jpg,.jpeg,.png,.docx';f.required=true;const p=field('permission','I have permission to share this file');p.type='checkbox';p.required=true;p.value='on'}$('editor').showModal()}$('editForm').onsubmit=async ev=>{ev.preventDefault();if(busy)return;busy=true;const s=session;$('save').disabled=true;try{const d=await(await api(editAction,editId,new FormData(ev.target))).json();if(s!==session)return;$('editor').close();await load();$('message').textContent=d.warning||'Saved successfully'}catch(e){if(s===session)$('editMessage').textContent=e.message}finally{busy=false;$('save').disabled=false}};$('cancel').onclick=()=>$('editor').close();
async function initializeDashboard(){
  try {
    const response = await fetch(
      '/api/admin-auth?action=session',
      {credentials:'same-origin',cache:'no-store'}
    );

    if(response.status===401){
      location.replace('/admin-login.html');
      return;
    }

    if(!response.ok)
      throw Error('Authentication service unavailable');

    await load();
    await loadSettings();

    $('login').hidden=true;
    $('dashboard').hidden=false;
    $('logout').hidden=false;
    document.body.classList.add('authenticated');
  } catch(error){
    $('loginMessage').textContent=error.message;
  }
}

$('loginForm').onsubmit=e=>{
  e.preventDefault();
  location.replace('/admin-login.html');
};

$('logout').onclick=async()=>{
  try{
    const response=await fetch(
      '/api/admin-auth?action=logout',{
        method:'POST',
        credentials:'same-origin'
      }
    );

    if(!response.ok)
      throw Error('Logout failed. Please retry.');

    location.replace('/admin-login.html');
  }catch(error){
    $('message').textContent=error.message;
  }
};

window.addEventListener('DOMContentLoaded',
  initializeDashboard);
window.addEventListener('pageshow',event=>{
  if(event.persisted) location.reload();
});

$('refresh').onclick=()=>run(async()=>{await load();await loadSettings()});$('apply').onclick=()=>run(async()=>{page=1;await load()});$('prev').onclick=()=>run(async()=>{if(page>1)page--;await load()});$('next').onclick=()=>run(async()=>{if(page*25<count)page++;await load()});$('upload').onclick=()=>run(()=>editor('upload'));$('activity').onclick=()=>run(async()=>{const d=await(await api('activity')).json();$('message').textContent=d.activity.map(x=>`${x.created_at} · ${x.action} · #${x.submission_id} ${x.details||''}`).join('\n')||'No activity yet'});

const selected=new Set();let visible=[],uploadSetting=null;
function syncSelection(){ $('selectedCount').textContent=selected.size+' selected';$('bulkRun').disabled=!selected.size;for(const c of $('items').querySelectorAll('[data-selection]'))c.checked=selected.has(Number(c.dataset.selection)); }
$('selectAll').onclick=()=>{if(busy)return;visible.forEach(x=>selected.add(x.id));syncSelection()};
$('clearAll').onclick=()=>{if(busy)return;selected.clear();syncSelection()};
async function loadSettings(){const s=session;$('toggleUploads').disabled=true;try{const d=await(await api('settings')).json();if(s!==session)return;uploadSetting=d.enabled;$('uploadState').textContent=d.environmentEnabled?(d.enabled?'ON — public uploads allowed':'OFF — public uploads paused'):'OFF — Cloudflare emergency switch disabled (dashboard setting '+(d.enabled?'ON':'OFF')+')';$('toggleUploads').textContent=d.enabled?'Turn public uploads OFF':'Turn public uploads ON';$('toggleUploads').disabled=false}catch(e){if(s===session)$('uploadState').textContent='Setting unavailable: '+e.message}}
$('toggleUploads').onclick=()=>run(async()=>{const s=session;const next=!uploadSetting;if(!confirm('Turn public uploads '+(next?'ON':'OFF')+'?'))return;await api('settings',null,null,{enabled:String(next)});if(s!==session)return;await loadSettings();});
$('bulkRun').onclick=()=>run(async()=>{const s=session,action=$('bulkAction').value,items=visible.filter(x=>selected.has(x.id));if(!items.length)return;const status=x=>x.deleting?'deleting':x.unpublished?'unpublished':x.status;const allowed={approve:'pending',reject:'pending',unpublish:'approved',republish:'unpublished',restore:'rejected'};const eligible=items.filter(x=>action==='delete'||status(x)===allowed[action]);if(!eligible.length){$('message').textContent='No eligible files selected';return}if(!confirm(action.toUpperCase()+' '+eligible.length+' file(s)?\n'+eligible.map(x=>'#'+x.id+' '+x.file_name).join('\n')+(action==='delete'?'\nThis cannot be undone.':'')))return;if(action==='delete'&&prompt('Type DELETE to permanently remove these files')!=='DELETE')return;let ok=0,failed=[];for(const x of eligible){if(s!==session)return;try{await api(action,x.id,null);ok++}catch(e){failed.push('#'+x.id+': '+e.message)}}if(s!==session)return;const report=`${ok} succeeded · ${failed.length} failed · ${items.length-eligible.length} skipped`+(failed.length?'\n'+failed.join('\n'):'');try{await load();if(!visible.length&&page>1){page--;await load()}}catch(e){if(s===session)$('message').textContent=report+'\nRefresh failed: '+e.message;return}if(s===session)$('message').textContent=report});

window.addEventListener('DOMContentLoaded',()=>{const dlg=$('noticeAdmin'),f=$('noticeForm'),status=$('noticeAdminStatus');async function refreshNotices(){const current=session;const d=await(await api('notifications')).json();if(current!==session)return;const list=$('noticeAdminList');list.replaceChildren();for(const x of d.notifications){const a=el('article');a.append(el('strong',x.title),el('p',x.body),el('small',x.kind+' · expires '+x.expires_at));if(x.submission_id==null)a.append(btn('Edit',()=>{f.elements.id.value=x.id;f.elements.kind.value=x.kind;f.elements.title.value=x.title;f.elements.body.value=x.body;f.elements.days.value=Math.max(1,Math.min(365,Math.ceil((Date.parse(x.expires_at.replace(' ','T')+'Z')-Date.now())/86400000)));f.scrollIntoView()}));a.append(btn('Delete',async()=>{if(!confirm('Delete notification?'))return;try{const b=new FormData();b.set('op','delete');b.set('id',x.id);await api('notifications',null,b);await refreshNotices()}catch(e){status.textContent=e.message}},'danger'));list.append(a)}}$('manageNotices').onclick=async()=>{f.reset();status.textContent='';dlg.showModal();try{await refreshNotices()}catch(e){status.textContent=e.message}};$('noticeAdminClose').onclick=()=>dlg.close();f.onsubmit=async e=>{e.preventDefault();const b=new FormData(f);b.set('op',b.get('id')?'edit':'publish');try{await api('notifications',null,b);f.reset();status.textContent='Saved';await refreshNotices()}catch(e){status.textContent=e.message}};});
