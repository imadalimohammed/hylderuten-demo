/* HyldeRuten – AI-UI simulering. Ingen Worker-kald, ingen fetch. */
(function(){
"use strict";
const HR=window.HR, store=window.HR_store, redraw=window.HR_redraw;
const products=HR.products, recipes=HR.recipes, MAX=HR.MAX_QTY;
const CASES=[
 {key:"multi",label:"Tre forskellige varer",input:"Jeg mangler mælk, rugbrød og æg",
  result:{matches:[{type:"product",id:"P014",source_text:"mælk",quantity:1},{type:"product",id:"P021",source_text:"rugbrød",quantity:1},{type:"product",id:"P015",source_text:"æg",quantity:1}],unresolved:[]}},
 {key:"quantity",label:"To pakker hakket oksekød",input:"Jeg vil købe 2 pakker hakket oksekød",
  result:{matches:[{type:"product",id:"P010",source_text:"hakket oksekød",quantity:2}],unresolved:[]}},
 {key:"mixed",label:"Rugbrød og uafklaret ost",input:"Jeg mangler rugbrød, men ved ikke hvilken ost",
  result:{matches:[{type:"product",id:"P021",source_text:"rugbrød",quantity:1}],unresolved:[{source_text:"ost",question:"Hvilken ost ønsker du?"}]}},
 {key:"repeatmilk",label:"Mælk nævnt to gange",input:"Jeg mangler mælk, rugbrød og mælk",
  result:{matches:[{type:"product",id:"P021",source_text:"rugbrød",quantity:1}],unresolved:[{source_text:"mælk",question:"Du har nævnt mælk flere gange. Hvor mange enheder ønsker du?"}]}},
 {key:"repeatbread",label:"Rugbrød nævnt to gange",input:"Jeg mangler rugbrød, æg og rugbrød",
  result:{matches:[{type:"product",id:"P015",source_text:"æg",quantity:1}],unresolved:[{source_text:"rugbrød",question:"Du har nævnt rugbrød flere gange. Hvor mange enheder ønsker du?"}]}},
 {key:"recipe",label:"Tacos og mælk",input:"Jeg skal lave tacos og købe mælk",
  result:{matches:[{type:"recipe",id:"R02",source_text:"tacos",quantity:1},{type:"product",id:"P014",source_text:"mælk",quantity:1}],unresolved:[]}},
 {key:"spaghetti",label:"Spaghetti – vare eller ret?",input:"Vi skal have spaghetti i aften",
  result:{matches:[],unresolved:[{source_text:"spaghetti",question:"Mener du varen spaghetti eller en bestemt ret med spaghetti?"}]}}
];
const productById=Object.fromEntries(products.map(p=>[p.id,p]));
const recipeById=Object.fromEntries(recipes.map(r=>[r.id,r]));
const norm=s=>String(s).normalize("NFC").toLocaleLowerCase("da-DK").trim().replace(/\s+/g," ");
const key=m=>m.type+":"+m.id;
function validatePreview(data,input){
 if(!data||Object.keys(data).sort().join()!=="matches,unresolved"||
    !Array.isArray(data.matches)||!Array.isArray(data.unresolved))return false;
 const exact=(o,k)=>o&&typeof o==="object"&&!Array.isArray(o)&&Object.keys(o).sort().join()===k.slice().sort().join();
 const seen=new Set(),spans=new Set();
 for(const m of data.matches){
  if(!exact(m,["type","id","quantity","source_text"]))return false;
  if(!((m.type==="product"&&productById[m.id])||(m.type==="recipe"&&recipeById[m.id])))return false;
  if(!Number.isSafeInteger(m.quantity)||m.quantity<1||m.quantity>MAX||(m.type==="recipe"&&m.quantity!==1))return false;
  if(typeof m.source_text!=="string"||!m.source_text.trim()||!norm(input).includes(norm(m.source_text)))return false;
  if(seen.has(key(m)))return false;
  seen.add(key(m));spans.add(norm(m.source_text));
 }
 for(const u of data.unresolved){
  if(!exact(u,["source_text","question"])||typeof u.source_text!=="string"||
     !u.source_text.trim()||!norm(input).includes(norm(u.source_text))||
     typeof u.question!=="string"||!u.question.trim()||
     spans.has(norm(u.source_text)))return false;
 }
 return true;
}
function mockInterpret(input){
 const sample=CASES.find(c=>norm(c.input)===norm(input));
 if(!sample)return null;
 const out=JSON.parse(JSON.stringify(sample.result));
 return validatePreview(out,input)?out:null;
}
function approveMockMatches(state,matches,decisions={}){
 if(!Array.isArray(matches))return {ok:false,reason:"Forslagene er ikke en liste."};
 const seen=new Set();
 for(const m of matches){
  if(!m||!(m.type==="product"&&productById[m.id]||m.type==="recipe"&&recipeById[m.id])||
    !Number.isSafeInteger(m.quantity)||m.quantity<1||m.quantity>MAX||
    (m.type==="recipe"&&m.quantity!==1)||seen.has(key(m)))return {ok:false,reason:"Ugyldigt eller dubleret forslag."};
  seen.add(key(m));
 }
 let changed=0;
 for(const m of matches.filter(x=>x.type==="product")){
  if(!state.ids.has(m.id)){state.add([m.id],"AI-forslag");state.setQty(m.id,m.quantity);changed++}
  else if(decisions[m.id]==="replace"&&state.qty.get(m.id)!==m.quantity){state.setQty(m.id,m.quantity);changed++}
 }
 for(const m of matches.filter(x=>x.type==="recipe"))changed+=state.addRecipe(m.id);
 return {ok:true,changed};
}
function runMockTests(){
 const out=[],t=(name,expect,actual)=>out.push({name,pass:JSON.stringify(expect)===JSON.stringify(actual),expect,actual});
 const one=mockInterpret("Jeg mangler mælk, rugbrød og æg");
 t("Tre sikre varer",[3,0],[one.matches.length,one.unresolved.length]);
 const mixed=mockInterpret("Jeg mangler rugbrød, æg og rugbrød");
 t("Æg sikkert; rugbrød uafklaret",["P015","rugbrød"],[mixed.matches[0].id,mixed.unresolved[0].source_text]);
 const q=mockInterpret("Jeg vil købe 2 pakker hakket oksekød"),s=HR.createStore();
 const r=approveMockMatches(s,q.matches);
 t("Godkendt antal overføres",[true,1,2],[r.ok,s.ids.size,s.qty.get("P010")]);
 const same=HR.createStore();same.add(["P010"],"manuelt");same.setQty("P010",3);
 approveMockMatches(same,q.matches);
 t("Eksisterende antal bevares",3,same.qty.get("P010"));
 approveMockMatches(same,q.matches,{P010:"replace"});
 t("Kun udtrykkelig erstatning ændrer antal",2,same.qty.get("P010"));
 const rec=HR.createStore(),rr=approveMockMatches(rec,mockInterpret("Jeg skal lave tacos og købe mælk").matches);
 t("Opskrift udvides deterministisk",[true,6,1],[rr.ok,rec.ids.size,rec.qty.get("P014")]);
 const bad=HR.createStore(),br=approveMockMatches(bad,[{type:"product",id:"P999",source_text:"ukendt",quantity:2}]);
 t("Ugyldigt produkt afvises",[false,0],[br.ok,bad.ids.size]);
 t("Ukendt fritekst bliver ikke fabrikeret",null,mockInterpret("Jeg skal købe en vaffelmaskine"));
 t("Syv faste JSON-eksempler er gyldige",true,CASES.every(c=>validatePreview(c.result,c.input)));
 return out;
}
window.HR_AI={CASES,validatePreview,mockInterpret,approveMockMatches,runMockTests};
if(typeof document==="undefined"||!store||typeof redraw!=="function")return;
const $=id=>document.getElementById(id);
const element=(tag,text,cls)=>{
 const x=document.createElement(tag);
 if(text!==undefined&&text!==null)x.textContent=String(text);
 if(cls)x.className=cls;
 return x;
};
const wipe=e=>{while(e.firstChild)e.removeChild(e.firstChild)};
const option=(value,text)=>{const o=element("option",text);o.value=value;return o};
let pending=null,chosen=new Set(),decisions=new Map();
const status=(text,error=false)=>{
 $("aiStatus").textContent=text;
 $("aiStatus").classList.toggle("error",error);
};
const getName=m=>m.type==="product"?productById[m.id].name:recipeById[m.id].name+" (opskrift)";
const kind=u=>u.source_text==="ost"?"cheese":u.source_text==="spaghetti"?"spaghetti":"quantity";
function drawPending(){
 $("aiSuggestions").hidden=!pending;
 if(!pending)return;
 const matches=$("aiMatches"),unresolved=$("aiUnresolved");
 wipe(matches);wipe(unresolved);
 if(!pending.matches.length)matches.appendChild(element("p","Ingen sikre forslag endnu.","ai-small"));
 for(const m of pending.matches){
  const row=element("div",null,"ai-item"),label=element("label",null,"ai-check"),cb=element("input");
  cb.type="checkbox";cb.checked=chosen.has(key(m));cb.setAttribute("aria-label","Vælg "+getName(m));
  cb.onchange=()=>{cb.checked?chosen.add(key(m)):chosen.delete(key(m));$("aiApprove").disabled=!pending.matches.some(x=>chosen.has(key(x)))};
  label.appendChild(cb);
  const text=element("span");
  text.appendChild(element("strong",getName(m)));
  const exists=m.type==="product"&&store.ids.has(m.id),different=exists&&store.qty.get(m.id)!==m.quantity;
  let detail=m.type==="recipe"?" · "+recipeById[m.id].requiredProductIds.length+" obligatoriske ingredienser":
      different?" · På listen: "+store.qty.get(m.id)+" · Foreslået: "+m.quantity:
      exists?" · Allerede på listen, antal "+store.qty.get(m.id):" · Antal: "+m.quantity;
  text.appendChild(element("span",detail,"ai-small"));
  label.appendChild(text);row.appendChild(label);
  if(different){
   const l=element("label","Håndtering af eksisterende antal","ai-small");l.style.display="block";l.style.marginTop="7px";
   const sel=element("select");sel.appendChild(option("keep","Behold nuværende antal"));
   sel.appendChild(option("replace","Erstat med antal "+m.quantity));sel.value=decisions.get(m.id)||"keep";
   sel.onchange=()=>decisions.set(m.id,sel.value);
   l.appendChild(sel);row.appendChild(l);
  }
  matches.appendChild(row);
 }
 if(!pending.unresolved.length)unresolved.appendChild(element("p","Ingen uafklarede ønsker.","ai-small"));
 pending.unresolved.forEach((u,i)=>{
  const row=element("div",null,"ai-item"),question=element("p",u.question);
  question.style.margin="0 0 8px";row.appendChild(question);
  const answer=element("div",null,"ai-answer");
  const k=kind(u);
  let field;
  if(k==="quantity"){
   field=element("input");field.type="number";field.min="1";field.max=String(MAX);field.step="1";field.value="1";
   field.inputMode="numeric";field.setAttribute("aria-label","Ønsket antal "+u.source_text);
  }else{
   field=element("select");
   field.appendChild(option("","Vælg et svar"));
   if(k==="cheese"){
    field.appendChild(option("product:P016","Revet ost"));
    field.appendChild(option("product:P018","Parmesan"));
   }else{
    field.appendChild(option("product:P025","Køb spaghetti som vare"));
    field.appendChild(option("recipe:R01","Lav spaghetti bolognese"));
   }
   field.setAttribute("aria-label","Afklar "+u.source_text);
  }
  answer.appendChild(field);
  const button=element("button","Bekræft svar","sm");button.type="button";
  button.onclick=()=>{
   let m=null;
   if(k==="quantity"){
    const n=Number(field.value),id=u.source_text==="mælk"?"P014":u.source_text==="rugbrød"?"P021":null;
    if(id&&Number.isSafeInteger(n)&&n>=1&&n<=MAX)m={type:"product",id,source_text:u.source_text,quantity:n};
   }else if(["product:P016","product:P018","product:P025","recipe:R01"].includes(field.value)){
    const parts=field.value.split(":");m={type:parts[0],id:parts[1],source_text:u.source_text,quantity:1};
   }
   if(!m){status("Vælg et gyldigt svar mellem 1 og 99 eller en vare fra listen.",true);return}
   pending.unresolved.splice(i,1);
   if(!pending.matches.some(x=>key(x)===key(m)))pending.matches.push(m);
   chosen.add(key(m));drawPending();status("Afklaringen er nu et forslag. Godkend det, før indkøbslisten ændres.");
  };
  answer.appendChild(button);row.appendChild(answer);unresolved.appendChild(row);
 });
 $("aiApprove").disabled=!pending.matches.some(m=>chosen.has(key(m)));
}
CASES.forEach(c=>$("aiPreset").appendChild(option(c.key,c.label)));
$("aiPreset").value=CASES[0].key;$("aiInput").value=CASES[0].input;
$("aiPreset").onchange=()=>{
 const c=CASES.find(c=>c.key===$("aiPreset").value);
 $("aiInput").value=c.input;pending=null;chosen.clear();decisions.clear();drawPending();status("Klar til at vise simulerede forslag.");
};
$("aiInput").oninput=()=>{
 pending=null;chosen.clear();decisions.clear();drawPending();status("Teksten er ændret. Vis forslag igen for at fortsætte.");
};
$("aiReset").onclick=()=>{
 pending=null;chosen.clear();decisions.clear();drawPending();status("Forslag ryddet. Indkøbslisten er uændret.");
};
$("aiInterpret").onclick=()=>{
 const found=mockInterpret($("aiInput").value);
 if(!found){
  pending=null;drawPending();
  status("Denne UI-test understøtter kun de syv præcise eksempler i menuen. Fri tekst er endnu ikke koblet til en AI-model.",true);
  return;
 }
 pending=found;chosen=new Set(found.matches.map(key));decisions.clear();drawPending();
 status("Simuleret JSON modtaget. Gennemgå og godkend de forslag, du ønsker.");
};
$("aiApprove").onclick=()=>{
 if(!pending)return;
 const selected=pending.matches.filter(m=>chosen.has(key(m)));
 if(!selected.length){status("Markér mindst ét forslag.",true);return}
 const res=approveMockMatches(store,selected,Object.fromEntries(decisions));
 if(!res.ok){status(res.reason,true);return}
 pending.matches=pending.matches.filter(m=>!chosen.has(key(m)));chosen.clear();decisions.clear();
 if(!pending.matches.length&&!pending.unresolved.length)pending=null;
 redraw();drawPending();
 status(selected.length+" forslag er godkendt. Indkøbslisten er opdateret. Uafklarede spørgsmål kan stadig besvares.");
};
const testButton=element("button","Kør AI-UI-tests (simulerede)","sm");
testButton.type="button";
testButton.onclick=()=>{
 const results=runMockTests(),passed=results.filter(x=>x.pass).length;
 const para=element("p",passed+"/"+results.length+" AI-UI-tests bestået.");
 const details=element("p",results.filter(x=>!x.pass).map(x=>x.name).join(", ")||"Alle faste UI-logiktests bestået.","ai-small");
 const output=$("aiTestOut");wipe(output);output.appendChild(para);output.appendChild(details);
};
$("runTests").insertAdjacentElement("afterend",testButton);
const testOut=element("div");testOut.id="aiTestOut";testButton.insertAdjacentElement("afterend",testOut);
})();