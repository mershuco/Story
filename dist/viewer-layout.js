// Keep the scroll container itself alive when moving to the next highlight.
export function refreshViewer(app,markup,paint){
 const host=app.querySelector('.match-sheet'),old=host?.querySelector('.live-spectator');if(!old)return false;
 const top=host.scrollTop,left=host.scrollLeft,timelineLeft=old.querySelector('.scene-timeline')?.scrollLeft??0;
 const opened=[...old.querySelectorAll('details[open]')].map(el=>el.className);
 const next=document.createElement('template');next.innerHTML=markup;const view=next.content.firstElementChild;
 // Retain the fitted geometry before inserting the next scene.
 const previousScreen=old.querySelector('.spectator-screen'),nextScreen=view.querySelector('.spectator-screen');
 if(previousScreen&&nextScreen){nextScreen.style.cssText=previousScreen.style.cssText;nextScreen.classList.toggle('is-short',previousScreen.classList.contains('is-short'));}
 for(const details of view.querySelectorAll('details'))details.open=opened.includes(details.className);
 old.replaceWith(view);paint();
 host.scrollTop=top;host.scrollLeft=left;const timeline=view.querySelector('.scene-timeline');if(timeline)timeline.scrollLeft=timelineLeft;
 return true;
}

// Budget from the visible browser viewport, including Safari toolbar changes.
let observedScreen,observedHost,observer,frame;
function queueViewerFit(){if(!frame)frame=requestAnimationFrame(()=>{frame=null;fitViewer();});}
function fitViewer(){
 const screen=document.querySelector('.spectator-screen'),host=screen?.closest('.match-sheet');if(!screen||!host)return;
 const root=screen.parentElement,style=getComputedStyle(root),rect=host.getBoundingClientRect();
 const viewport=window.visualViewport,visibleBottom=viewport?viewport.offsetTop+viewport.height:innerHeight;
 const height=Math.max(180,Math.min(host.clientHeight,visibleBottom-rect.top-2)-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
 screen.style.height=height+'px';
 const board=screen.querySelector('.spectator-layout'),mobile=matchMedia('(max-width:680px)').matches;
 const fixed=[...screen.children].filter(el=>el!==board).reduce((n,el)=>n+el.getBoundingClientRect().height,0);
 const gap=parseFloat(getComputedStyle(screen).gap)||0,gaps=([...screen.children].filter(el=>getComputedStyle(el).display!=='none').length-1)*gap;
 const side=mobile?0:screen.querySelector('.spectator-team').getBoundingClientRect().width;
 const roster=mobile?parseFloat(getComputedStyle(screen).getPropertyValue('--roster-height'))+gap:0;
 const size=Math.floor(Math.max(100,Math.min(screen.clientWidth-(mobile?0:side*2+16),height-fixed-gaps-roster)));
 screen.style.setProperty('--map-size',size+'px');screen.style.setProperty('--board-height',(size+roster)+'px');
 screen.classList.toggle('is-short',size<370);screen.dataset.fitted='true';
}
export function observeViewerLayout(){
 const screen=document.querySelector('.spectator-screen');if(!screen||screen===observedScreen)return;
 observedScreen=screen;const host=screen.closest('.match-sheet');
 // Scene content changes within fixed slots; only the viewport changes geometry.
 if(host!==observedHost){observedHost=host;observer?.disconnect();observer=new ResizeObserver(queueViewerFit);observer.observe(host);}
 fitViewer();
}
if(typeof window!=='undefined'){
 window.addEventListener('resize',queueViewerFit);window.visualViewport?.addEventListener('resize',queueViewerFit);
 document.fonts?.ready.then(queueViewerFit);
}
