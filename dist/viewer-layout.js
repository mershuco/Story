// Keep the scroll container itself alive when moving to the next highlight.
export function refreshViewer(app,markup,paint){
 const host=app.querySelector('.match-sheet'),old=host?.querySelector('.live-spectator');if(!old)return false;
 const top=host.scrollTop,left=host.scrollLeft,timelineLeft=old.querySelector('.scene-timeline')?.scrollLeft??0;
 const opened=[...old.querySelectorAll('details[open]')].map(el=>el.className);
 const next=document.createElement('template');next.innerHTML=markup;const view=next.content.firstElementChild;
 for(const details of view.querySelectorAll('details'))details.open=opened.includes(details.className);
 old.replaceWith(view);paint();
 host.scrollTop=top;host.scrollLeft=left;const timeline=view.querySelector('.scene-timeline');if(timeline)timeline.scrollLeft=timelineLeft;
 return true;
}
