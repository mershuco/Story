const groups=[['시작·이전 수입',['starting','previous']],['자동 수입',['passive']],['라인 CS',['lane']],['정글 CS',['jungle']],['처치·첫 킬',['kills','firstBlood']],['어시스트',['assists']],['챔피언 현상금',['shutdown']],['구조물·첫 포탑',['structures','firstTower']],['오브젝트',['objectives']],['오브젝트 현상금',['objectiveBounty']],['추가 라인·정글 자원',['sideLane','sideJungle']],['기타',['other']]];
export function economyMarkup(c,set){return set.simulationVersion>=10?`<details class="economy-ledger"><summary>골드 수입 내역</summary><p>실제로 획득한 누적 골드입니다. 구조물 보상은 파괴 시에만 지급하며, 운영 한 번의 추가 라인·정글 수입은 합계 최대 350G입니다.</p><div class="table-wrap"><table><thead><tr><th>수입</th><th>${c.esc(c.teamName(set.blue))}</th><th>${c.esc(c.teamName(set.red))}</th><th>차이</th></tr></thead><tbody>${groups.map(([label],i)=>`<tr data-income-row="${i}"><th>${label}</th><td></td><td></td><td></td></tr>`).join('')}<tr data-income-total><th>전체 합계</th><td></td><td></td><td></td></tr></tbody></table></div></details>`:'';}
export function paintEconomy(set,scene,prior,progress){
 const ledger=(progress>=.8?scene:prior??scene)?.rift?.economy;if(!ledger)return;
 const show=(selector,values)=>{const row=document.querySelector(selector);if(!row)return;const [b,r]=values;row.querySelectorAll('td').forEach((td,i)=>{const n=i===2?b-r:values[i];td.textContent=(i===2&&n>0?'+':'')+n.toLocaleString()+'G';});};
 groups.forEach(([,sources],i)=>show(`[data-income-row="${i}"]`,[set.blue,set.red].map(id=>sources.reduce((sum,key)=>sum+(ledger[id]?.[key]??0),0))));
 show('[data-income-total]',[set.blue,set.red].map(id=>Object.values(ledger[id]??{}).reduce((a,b)=>a+b,0)));
}
