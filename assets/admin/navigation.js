'use strict';

(()=>{
  const sidebar=document.getElementById('sidebar');
  const menu=document.getElementById('menuToggle');
  const title=document.getElementById('workspaceTitle');
  const description=document.getElementById('workspaceDescription');

  const workspaces={
    overview:['Overview','Manage your educational platform.'],
    submissions:['Submissions','Review community contributions.'],
    library:['Material library','Manage your study materials.'],
    upload:['Upload material','Add resources to your platform.'],
    notifications:['Notifications','Manage platform announcements.'],
    activity:['Activity logs','Review administrative actions.'],
    settings:['Website controls','Configure platform functionality.']
  };

  function closeSidebar(){
    sidebar.classList.remove('open');
    menu.setAttribute('aria-expanded','false');
  }

  menu.addEventListener('click',()=>{
    const open=sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded',String(open));
  });

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape') closeSidebar();
  });

  const links=sidebar.querySelectorAll('[data-view]');

  function openView(view){
    if(!workspaces[view]) view='overview';

    links.forEach(button=>{
      const active=button.dataset.view===view;
      button.classList.toggle('active',active);
      if(active) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });

    title.textContent=workspaces[view][0];
    description.textContent=workspaces[view][1];

    const materialView=
      view==='submissions'||view==='library';

    document.querySelectorAll('[data-workspace]').forEach(section=>{
      section.hidden=section.dataset.workspace!==
        (materialView?'materials':view);
    });

    document.getElementById('message').textContent='';

    if(materialView){
      document.getElementById('filter').value=
        view==='submissions'?'pending':'';
      document.getElementById('apply').click();
    }

    closeSidebar();
  }

  links.forEach(button=>{
    button.addEventListener('click',()=>{
      openView(button.dataset.view);
    });
  });

  for(const [source,target] of [
    ['openUpload','upload'],
    ['openNotices','manageNotices'],
    ['openActivity','activity']
  ]){
    document.getElementById(source).onclick=()=>{
      document.getElementById(target).click();
    };
  }

  openView('overview');
})();

(()=>{
  const icons={
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    submissions:'<path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
    library:'<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="18" rx="1"/><path d="m17 4 4 16"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5"/>',
    notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    activity:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>'
  };

  document.querySelectorAll('[data-view]').forEach(button=>{
    const path=icons[button.dataset.view];
    if(!path)return;

    button.insertAdjacentHTML('afterbegin',
      '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>');
  });

  const brand=document.querySelector('.sidebar-brand');
  const logo=document.createElement('img');
  logo.src='/icon.svg';
  logo.alt='';
  logo.className='admin-brand-icon';
  brand.prepend(logo);
})();

/* Royal Black interface enhancements */
(()=>{
  const sidebar=document.getElementById('sidebar');
  const menu=document.getElementById('menuToggle');

  if(!sidebar||!menu)return;

  const logo=sidebar.querySelector('.admin-brand-icon');
  if(logo){
    logo.src='/icon-192.png';
    logo.addEventListener('error',()=>{
      logo.style.display='none';
    });
  }

  const overlay=document.createElement('div');
  overlay.id='royalOverlay';
  overlay.hidden=true;
  document.body.appendChild(overlay);

  const close=document.createElement('button');
  close.id='royalClose';
  close.type='button';
  close.textContent='Close ×';
  close.setAttribute('aria-label','Close navigation');
  sidebar.prepend(close);

  function dismiss(){
    sidebar.classList.remove('open');
    menu.setAttribute('aria-expanded','false');
    overlay.hidden=true;
  }

  close.addEventListener('click',dismiss);
  overlay.addEventListener('click',dismiss);

  new MutationObserver(()=>{
    overlay.hidden=!sidebar.classList.contains('open');
  }).observe(sidebar,{
    attributes:true,
    attributeFilter:['class']
  });

  sidebar.querySelectorAll('[data-view]').forEach(button=>{
    button.addEventListener('click',()=>{
      window.scrollTo(0,0);
    });
  });

  const paths={
    total:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    pending:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    approved:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    unpublished:'<path d="M4 4l16 16M9 9a4 4 0 0 0 6 6M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/>',
    storage:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 14h18M7 17h1M11 17h1"/>'
  };

  const stats=document.getElementById('stats');

  function decorate(){
    if(!stats)return;
    stats.querySelectorAll('article').forEach(card=>{
      if(card.querySelector('.royal-stat-icon'))return;
      const text=card.textContent.toLowerCase();
      const key=text.includes('size')?'storage':
        text.includes('unpublished')?'unpublished':
        text.includes('approved')?'approved':
        text.includes('pending')?'pending':'total';

      const icon=document.createElement('div');
      icon.className='royal-stat-icon';
      icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[key]+'</svg>';
      card.prepend(icon);
    });
  }

  if(stats){
    new MutationObserver(decorate).observe(stats,{
      childList:true,subtree:true
    });
    decorate();
  }

  const items=document.getElementById('items');

  function emptyState(){
    if(!items||items.querySelector('.royal-empty'))return;
    if(items.textContent.trim()==='No materials found'){
      items.innerHTML='<div class="royal-empty"><strong>No materials found</strong>No resources match your current selection.</div>';
    }
  }

  if(items){
    new MutationObserver(emptyState).observe(items,{
      childList:true,subtree:true
    });
    emptyState();
  }
})();
