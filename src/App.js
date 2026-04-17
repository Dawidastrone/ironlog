import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const C={bg:"#F4F3F8",white:"#FFF",card:"#FFF",sh:"0 1px 3px rgba(0,0,0,.04),0 4px 14px rgba(0,0,0,.04)",text:"#111113",sub:"#6E6E73",muted:"#AEAEB2",acD:"#A8D610",acBg:"rgba(200,245,37,.12)",acBg2:"rgba(200,245,37,.25)",warm:"#FF6B35",warmBg:"rgba(255,107,53,.08)",green:"#2DCE89",greenBg:"rgba(45,206,137,.10)",red:"#FF4757",blue:"#3B82F6",blueBg:"rgba(59,130,246,.08)",purple:"#8B5CF6",purpleBg:"rgba(139,92,246,.08)",border:"rgba(0,0,0,.06)",inp:"#F5F5F7",inpB:"rgba(0,0,0,.08)"};
const font="'DM Sans',-apple-system,sans-serif";
const Btn=({children,onClick,style,...r})=><button type="button" onClick={e=>{e.preventDefault();onClick?.(e);}} style={style} {...r}>{children}</button>;
const roundW=(w,s=2.5)=>Math.round(w/s)*s;

/* ═══ RPE TABLE ═══ */
const RPE_T={1:[.86,.868,.876,.892,.899,.922,.946,.973,1],2:[.846,.852,.86,.868,.876,.892,.899,.922,.946],3:[.837,.846,.852,.86,.868,.876,.892,.899,.922],4:[.818,.824,.837,.846,.852,.86,.868,.876,.892],5:[.8,.818,.824,.837,.846,.852,.86,.868,.876],6:[.782,.8,.818,.824,.837,.846,.852,.86,.868],8:[.749,.765,.782,.8,.818,.824,.837,.846,.852],10:[.715,.732,.749,.765,.782,.8,.818,.824,.837],12:[.68,.696,.715,.732,.749,.765,.782,.8,.818]};
const RPE_K=[6,6.5,7,7.5,8,8.5,9,9.5,10];
function pctFor(reps,rpe){const keys=Object.keys(RPE_T).map(Number).sort((a,b)=>a-b);let rk=keys[0];for(const k of keys)if(k<=reps)rk=k;const row=RPE_T[rk];if(!row)return .8;let i=RPE_K.indexOf(rpe);if(i>=0)return row[i];for(let j=0;j<RPE_K.length-1;j++)if(rpe>=RPE_K[j]&&rpe<=RPE_K[j+1]){const t=(rpe-RPE_K[j])/(RPE_K[j+1]-RPE_K[j]);return row[j]+(row[j+1]-row[j])*t;}return .8;}
function wFor(rm,reps,rpe){return roundW(rm*pctFor(reps,rpe));}

/* ═══ ROADMAP GENERATOR ═══ */
function genMap(plan,rms){
  const rm=[];
  for(let wk=0;wk<plan.weeks.length;wk++){
    const ph=plan.weeks[wk]?.type||"Akumulacja";
    const wm={};
    plan.days.forEach(d=>{const dm={};
      d.exercises.forEach(ex=>{
        const oneRM=rms[ex.name]||80;
        const ns=ex.sets.length;
        const sets=[];
        if(!ex.progOn){for(let s=0;s<ns;s++){const r=parseInt(ex.sets[s]?.target)||10;sets.push({w:wFor(oneRM,r,7.5),r});}
        }else if(plan.model==="linear"){const inc=plan.modelParams?.inc||2.5;for(let s=0;s<ns;s++){const r=parseInt(ex.sets[s]?.target)||5;sets.push({w:roundW(wFor(oneRM,r,8)+wk*inc),r});}
        }else if(plan.model==="double"){const rMin=plan.modelParams?.rMin||8,rMax=plan.modelParams?.rMax||12,inc=plan.modelParams?.inc||2.5;const cl=rMax-rMin+1,cy=Math.floor(wk/cl),pos=wk%cl;for(let s=0;s<ns;s++)sets.push({w:roundW(wFor(oneRM,rMin,8)+cy*inc),r:rMin+pos});
        }else if(plan.model==="block"){const pcts={Akumulacja:(plan.modelParams?.akuPct||70)/100,Intensyfikacja:(plan.modelParams?.intPct||85)/100,Deload:.55};const pct=pcts[ph]||.7;const bump=(wk%4)*.015;for(let s=0;s<ns;s++){const r=parseInt(ex.sets[s]?.target)||5;const ar=ph==="Intensyfikacja"?Math.max(3,Math.min(r,5)):r;sets.push({w:roundW(oneRM*(pct+bump)),r:ar});}
        }else if(plan.model==="rpe"){const rpe=plan.modelParams?.targetRPE||8;for(let s=0;s<ns;s++){const r=parseInt(ex.sets[s]?.target)||5;sets.push({w:wFor(oneRM,r,rpe),r});}
        }else if(plan.model==="dup"){const dt=d.dupType||"Siłowy";const cfg={Lekki:{p:(plan.modelParams?.hypPct||70)/100,r:10},Siłowy:{p:(plan.modelParams?.strPct||85)/100,r:5},Ciężki:{p:.92,r:3}};const c=cfg[dt]||cfg.Siłowy;for(let s=0;s<ns;s++)sets.push({w:roundW(oneRM*c.p),r:c.r});
        }else{for(let s=0;s<ns;s++){const r=parseInt(ex.sets[s]?.target)||10;sets.push({w:wFor(oneRM,r,8),r});}}
        dm[ex.id]=sets;
      });wm[d.id]=dm;
    });rm.push(wm);
  }return rm;
}

/* ═══ CORRECTION ═══ */
function correct(rm,log,wi,plan){
  const a=[...rm];
  plan.days.forEach(d=>d.exercises.forEach(ex=>{
    if(!ex.progOn)return;
    const p=rm[wi]?.[d.id]?.[ex.id]?.[0];
    const r=log[wi]?.[ex.id]?.[0];
    if(!p||!r?.done)return;
    let adj=0;
    const wd=(r.w||0)-p.w,rd=(r.r||0)-p.r;
    if(wd<-5||rd<-2)adj=-.025;else if(wd<0||rd<0)adj=-.01;else if(wd>5||rd>2)adj=.02;else if(wd>0||rd>0)adj=.01;
    if(!adj)return;
    for(let f=wi+1;f<a.length;f++){a[f]={...a[f]};a[f][d.id]={...a[f][d.id]};const ss=a[f][d.id][ex.id];if(ss)a[f][d.id][ex.id]=ss.map(s=>({...s,w:roundW(s.w*(1+adj))}));}
  }));return a;
}

/* ═══ ICONS ═══ */
const Ic={
  back:<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 19L8 12L15 5" stroke={C.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  check:c=><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12L10 17L20 7" stroke={c||"#fff"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  plus:<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  timer:<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M12 9v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  brain:c=><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C9.5 2 7.5 4 7.5 6.5 6 6.5 4.5 7.5 4.5 9.5 3 10 2 11.5 2 13c0 2 1.5 3.5 3.5 3.5 0 2 1.5 3.5 3.5 4 .5 1 1.5 1.5 3 1.5s2.5-.5 3-1.5c2-.5 3.5-2 3.5-4 2 0 3.5-1.5 3.5-3.5 0-1.5-1-3-2.5-3.5 0-2-1.5-3-3-3C16.5 4 14.5 2 12 2Z" stroke={c||C.acD} strokeWidth="1.5"/></svg>,
  barbell:c=><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke={c||C.text} strokeWidth="2" strokeLinecap="round"/><rect x="2" y="9" width="4" height="6" rx="1" stroke={c||C.text} strokeWidth="1.5"/><rect x="18" y="9" width="4" height="6" rx="1" stroke={c||C.text} strokeWidth="1.5"/></svg>,
  target:c=><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={c||C.warm} strokeWidth="1.8"/><circle cx="12" cy="12" r="6" stroke={c||C.warm} strokeWidth="1.8"/><circle cx="12" cy="12" r="2" fill={c||C.warm}/></svg>,
  trend:c=><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 20 10.5 10.5 14 15 21 5" stroke={c||C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 5h6v6" stroke={c||C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  fire:c=><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 23c4.97 0 9-4.03 9-9 0-5-4.5-9.5-6-12-1 2-2.5 3.5-4 3-1.5-.5-1-3-1-3-3 3-7 7-7 12 0 4.97 4.03 9 9 9Z" stroke={c||C.warm} strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  plan:c=><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke={c||C.muted} strokeWidth="1.8" strokeLinecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke={c||C.muted} strokeWidth="1.8"/></svg>,
  hist:c=><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 2" stroke={c||C.muted} strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke={c||C.muted} strokeWidth="1.8"/></svg>,
  pause:<svg width="12" height="12" viewBox="0 0 24 24" fill={C.text}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>,
  play:<svg width="12" height="12" viewBox="0 0 24 24" fill={C.text}><path d="M8 5v14l11-7L8 5Z"/></svg>,
  resetIc:<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3.51 15A9 9 0 105 5.34L1 10" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  trash:<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" stroke={C.red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const PH={Akumulacja:{s:"AKU",c:C.blue},Intensyfikacja:{s:"INT",c:C.warm},Deload:{s:"DEL",c:C.green}};
const MODELS=[{id:"linear",name:"Stały przyrost",color:C.green,bg:C.greenBg,icon:Ic.trend},{id:"double",name:"Podwójna progresja",color:C.green,bg:C.greenBg,icon:Ic.trend},{id:"block",name:"Period. blokowa",color:C.purple,bg:C.purpleBg,icon:Ic.brain},{id:"rpe",name:"Autoregulacja",color:C.warm,bg:C.warmBg,icon:Ic.brain},{id:"dup",name:"Zmienne obciąż.",color:C.blue,bg:C.blueBg,icon:Ic.brain}];

const StatusBar=()=><div style={{height:"env(safe-area-inset-top, 12px)",minHeight:12,flexShrink:0}}/>;
function BNav({a,go,hide}){if(hide)return null;return <div style={{position:"absolute",bottom:0,left:0,right:0,height:78,paddingBottom:"max(12px, env(safe-area-inset-bottom, 12px))",background:`linear-gradient(to top,${C.bg} 60%,transparent)`,display:"flex",alignItems:"center",justifyContent:"center",gap:32,zIndex:10}}>{[{l:"Trening",ic:Ic.barbell,s:"home"},{l:"Historia",ic:Ic.hist,s:"hist"},{l:"Mapa",ic:Ic.plan,s:"map"},{l:"Plan",ic:Ic.trend,s:"edit"}].map(t=><Btn key={t.l} onClick={()=>go(t.s)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}><span>{t.ic(a===t.s?C.acD:C.muted)}</span><span style={{fontSize:9,fontWeight:600,color:a===t.s?C.acD:C.muted}}>{t.l}</span></Btn>)}</div>;}
function RTimer({sec,onDone}){const[r,setR]=useState(sec);useEffect(()=>{if(r<=0){onDone();return;}const t=setTimeout(()=>setR(x=>x-1),1000);return()=>clearTimeout(t);},[r]);return <div style={{position:"absolute",bottom:88,left:16,right:16,background:C.white,borderRadius:16,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,zIndex:50,boxShadow:"0 8px 30px rgba(0,0,0,.15)"}}><div><div style={{fontSize:10,fontWeight:600,color:C.muted}}>PRZERWA</div><div style={{fontSize:20,fontWeight:800,color:C.text,fontFamily:"monospace"}}>{Math.floor(r/60)}:{String(r%60).padStart(2,"0")}</div></div><div style={{flex:1}}/><Btn onClick={onDone} style={{background:C.inp,border:"none",borderRadius:10,padding:"8px 16px",fontSize:13,fontWeight:700,color:C.sub,cursor:"pointer",fontFamily:font}}>Pomiń</Btn></div>;}

/* ═══ DATA ═══ */
const plan0=()=>({id:"ul",name:"Upper / Lower",model:"block",modelParams:{inc:2.5,rMin:8,rMax:12,akuPct:70,intPct:85,targetRPE:8,hypPct:70,strPct:85},weeks:[{type:"Akumulacja"},{type:"Akumulacja"},{type:"Intensyfikacja"},{type:"Deload"}],days:[
  {id:"u1",name:"Upper 1",dupType:"Siłowy",exercises:[{id:"bp",name:"Bench Press",block:"A1",rest:150,progOn:true,sets:[{target:"5",note:"Top"},{target:"8",note:"Back"},{target:"8",note:"Back"}]},{id:"row",name:"DB Row",block:"A2",rest:120,progOn:false,sets:[{target:"8-10"},{target:"8-10"},{target:"8-10"}]},{id:"inc",name:"Incline Press",block:"B1",rest:90,progOn:false,sets:[{target:"10-12"},{target:"10-12"},{target:"10-12"}]}]},
  {id:"l1",name:"Lower 1",dupType:"Siłowy",exercises:[{id:"sq",name:"Squat",block:"A1",rest:150,progOn:true,sets:[{target:"5",note:"Top"},{target:"8",note:"Back"},{target:"8",note:"Back"}]},{id:"rdl",name:"Romanian DL",block:"A2",rest:90,progOn:false,sets:[{target:"8-10"},{target:"8-10"},{target:"8-10"}]}]},
  {id:"u2",name:"Upper 2",dupType:"Lekki",exercises:[{id:"ohp",name:"OHP",block:"A1",rest:120,progOn:true,sets:[{target:"8"},{target:"8"},{target:"8"}]},{id:"pu",name:"Pull-ups",block:"A2",rest:90,progOn:false,sets:[{target:"6-8"},{target:"6-8"},{target:"6-8"}]}]},
  {id:"l2",name:"Lower 2",dupType:"Ciężki",exercises:[{id:"dl",name:"Deadlift",block:"A1",rest:180,progOn:true,sets:[{target:"3",note:"Top"},{target:"5",note:"Back"}]},{id:"bss",name:"Split Squat",block:"A2",rest:90,progOn:false,sets:[{target:"8-10"},{target:"8-10"},{target:"8-10"}]}]},
]});
const RMS={"Bench Press":100,"Squat":120,"Deadlift":100,"OHP":50,"DB Row":40,"Incline Press":60,"Romanian DL":80,"Pull-ups":90,"Split Squat":40};

const fs={background:C.inp,border:`1.5px solid ${C.inpB}`,borderRadius:10,color:C.text,fontSize:15,fontWeight:600,padding:"10px 12px",width:"100%",outline:"none",fontFamily:font,boxSizing:"border-box"};

/* ═══ APP ═══ */
export default function App(){
  const[scr,setScr]=useState("onboard");
  const[obStep,setObStep]=useState(0);
  const[profile,setProfile]=useState({name:"",weight:80,age:28,exp:"intermediate"});
  const[rms,setRms]=useState({"Bench Press":100,"Squat":120,"Deadlift":100,"OHP":50});
  const[goals,setGoals]=useState({"Bench Press":150,"Squat":160,"Deadlift":150,"OHP":75});
  const[plans,setPlans]=useState([plan0()]);
  const[pid,setPid]=useState("ul");
  const[wk,setWk]=useState(1);
  const[did,setDid]=useState(null);
  const[log,setLog]=useState({});
  const[tmr,setTmr]=useState(null);
  const[wSec,setWSec]=useState(0);
  const[wRun,setWRun]=useState(false);
  const[fin,setFin]=useState(false);
  const[hWk,setHWk]=useState(0);
  const[edid,setEdid]=useState("u1");
  const[pp,setPp]=useState(false); // plan picker
  const[ms,setMs]=useState(false); // model settings

  const tRef=useRef(null);
  useEffect(()=>{if(wRun&&!fin){tRef.current=setInterval(()=>setWSec(s=>s+1),1000);return()=>clearInterval(tRef.current);}else if(tRef.current)clearInterval(tRef.current);},[wRun,fin]);

  const plan=plans.find(p=>p.id===pid)||plans[0];
  const setPlan=fn=>setPlans(ps=>ps.map(p=>p.id===plan.id?(typeof fn==="function"?fn(p):fn):p));
  const uD=ud=>setPlan(p=>({...p,days:p.days.map(d=>d.id===ud.id?ud:d)}));

  // Build full RMS including non-compound exercises
  const allRms=useMemo(()=>{const r={...rms};plan.days.forEach(d=>d.exercises.forEach(ex=>{if(!r[ex.name])r[ex.name]=40;}));return r;},[rms,plan]);

  const wk0=plan.weeks[wk-1];const day=plan.days.find(d=>d.id===did);const mdl=MODELS.find(m=>m.id===plan.model);const eday=plan.days.find(d=>d.id===edid);
  const roadmap=useMemo(()=>{let rm=genMap(plan,allRms);Object.keys(log).forEach(k=>{const wi=parseInt(k);if(!isNaN(wi)&&log[wi])rm=correct(rm,log,wi,plan);});return rm;},[plan,log,allRms]);
  const wLog=log[wk-1]||{};
  const tSets=Object.values(wLog).reduce((s,a)=>s+(Array.isArray(a)?a.filter(x=>x?.done).length:0),0);
  const tVol=Object.values(wLog).reduce((s,a)=>s+(Array.isArray(a)?a.reduce((s2,x)=>s2+(x?.done&&x?.w&&x?.r?x.w*x.r:0),0):0),0);

  const goWo=d=>{setDid(d);setWSec(0);setWRun(true);setFin(false);setScr("wo");};
  const upd=useCallback((eid,si,p)=>{setLog(prev=>{const wl={...(prev[wk-1]||{})};const a=[...(wl[eid]||[])];while(a.length<=si)a.push({});a[si]={...(a[si]||{}),...p};wl[eid]=a;return{...prev,[wk-1]:wl};});},[wk]);

  const ph={width:"100%",height:"100%",background:C.bg,overflow:"hidden",position:"relative",fontFamily:font,display:"flex"};
  const sc={flex:1,overflow:"auto",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch"};

  // Responsive: detect desktop
  const[isWide,setIsWide]=useState(typeof window!=="undefined"?window.innerWidth>=768:false);
  useEffect(()=>{const h=()=>setIsWide(window.innerWidth>=768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);

  const px=isWide?"0 40px ":"0 16px ";
  const ts={fontSize:10,fontWeight:600,color:C.muted,textAlign:"center",padding:"5px 3px",borderBottom:`1px solid ${C.border}`};
  const td={fontSize:12,fontWeight:700,color:C.text,textAlign:"center",padding:"7px 3px",borderBottom:`1px solid ${C.border}`};
  const m2=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const navItems=[{l:"Trening",ic:Ic.barbell,s:"home"},{l:"Historia",ic:Ic.hist,s:"hist"},{l:"Mapa",ic:Ic.plan,s:"map"},{l:"Plan",ic:Ic.trend,s:"edit"}];

  return <div style={{height:"100%",width:"100%",background:isWide?"#E8E7ED":C.bg,display:"flex"}}>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet"/>

    {/* Desktop sidebar */}
    {isWide&&<div style={{width:220,background:"#111113",display:"flex",flexDirection:"column",padding:"24px 0",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 20px",marginBottom:32}}>
        <div style={{width:36,height:36,borderRadius:10,background:"#C8F525",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.barbell("#111")}</div>
        <span style={{fontSize:20,fontWeight:900,color:"#fff",letterSpacing:"-.03em"}}>IRONLOG</span>
      </div>
      {navItems.map(t=>{const a=scr===t.s||(t.s==="home"&&scr==="wo");return <Btn key={t.l} onClick={()=>setScr(t.s)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",margin:"2px 8px",borderRadius:12,background:a?"rgba(200,245,37,.12)":"transparent",border:"none",cursor:"pointer",fontFamily:font}}>
        <span>{t.ic(a?C.acD:"#888")}</span>
        <span style={{fontSize:14,fontWeight:a?700:500,color:a?C.acD:"#888"}}>{t.l}</span>
      </Btn>;})}
      <div style={{flex:1}}/>
      <div style={{padding:"0 20px"}}>
        <div style={{background:"rgba(255,255,255,.06)",borderRadius:10,padding:"10px 12px"}}>
          <div style={{fontSize:10,color:"#666",fontWeight:600}}>AKTYWNY PLAN</div>
          <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:2}}>{plan.name}</div>
          <div style={{fontSize:10,color:C.acD,fontWeight:600,marginTop:1}}>{mdl?.name||"Brak modelu"}</div>
        </div>
      </div>
    </div>}

    {/* Main content area */}
    <div style={{flex:1,height:"100%",overflow:"hidden",position:"relative",background:C.bg,maxWidth:isWide?900:"none",margin:isWide?"0 auto":"0"}}>

    {/* HOME */}
    <div style={{height:"100%",display:scr==="home"?"flex":"none",flexDirection:"column"}}>
      <StatusBar/>
      <div style={{...sc,padding:px+"96px"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,background:(PH[wk0?.type]?.c||C.blue)+"14",padding:"4px 12px",borderRadius:8,marginBottom:6}}><div style={{width:6,height:6,borderRadius:3,background:PH[wk0?.type]?.c}}/><span style={{fontSize:11,fontWeight:700,color:PH[wk0?.type]?.c}}>T{wk}/{plan.weeks.length} · {wk0?.type}</span></div>
        <h1 style={{fontSize:24,fontWeight:900,color:C.text,margin:"4px 0 4px"}}>Cześć {profile.name||"Dawid"}!</h1>
        <div style={{display:"flex",alignItems:"center",gap:6,margin:"0 0 14px"}}>
          <Btn onClick={()=>setPp(true)} style={{display:"flex",alignItems:"center",gap:4,background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",cursor:"pointer",color:C.text,fontSize:11,fontWeight:700,fontFamily:font,boxShadow:C.sh}}>{Ic.barbell(C.acD)}<span>{plan.name}</span></Btn>
          <span style={{fontSize:11,color:C.sub}}>·</span>
          <span style={{fontSize:11,color:mdl?.color,fontWeight:700}}>{mdl?.name||"Brak modelu"}</span>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto"}}>{plan.weeks.map((w,i)=>{const a=i+1===wk,pc=PH[w.type]?.c;const hl=!!log[i];return <Btn key={i} onClick={()=>setWk(i+1)} style={{minWidth:44,padding:"8px 4px",borderRadius:10,fontFamily:font,border:a?`2px solid ${pc}`:`1px solid ${C.border}`,background:a?pc+"14":C.white,color:a?pc:C.sub,fontSize:12,fontWeight:700,flexShrink:0,cursor:"pointer",position:"relative"}}>T{i+1}<span style={{display:"block",fontSize:8,color:pc,fontWeight:600,marginTop:1}}>{PH[w.type]?.s}</span>{hl&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:4,background:C.green,border:`2px solid ${C.bg}`}}/>}</Btn>})}</div>
        <div style={{fontSize:10,fontWeight:800,color:C.muted,letterSpacing:".05em",marginBottom:8}}>PLAN NA TYDZIEŃ {wk}</div>
        <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr":"1fr",gap:8}}>
        {plan.days.map(d=>{const dr=roadmap[wk-1]?.[d.id];return <div key={d.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:12,boxShadow:C.sh}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}><h3 style={{fontSize:14,fontWeight:700,color:C.text,margin:0}}>{d.name}</h3><span style={{fontSize:9,color:PH[wk0?.type]?.c,fontWeight:700,background:PH[wk0?.type]?.c+"14",padding:"2px 8px",borderRadius:5}}>{wk0?.type}</span></div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:8}}><thead><tr><th style={{...ts,textAlign:"left"}}>Ćwiczenie</th><th style={ts}>Serie</th><th style={ts}>Ciężar</th><th style={ts}>Powt.</th></tr></thead>
            <tbody>{d.exercises.map(ex=>{const p=dr?.[ex.id]?.[0];return <tr key={ex.id}><td style={{...td,textAlign:"left",fontWeight:ex.progOn?700:500,color:ex.progOn?C.text:C.sub,fontSize:11}}>{ex.progOn&&<span style={{color:mdl?.color,marginRight:3}}>●</span>}{ex.name}</td><td style={td}>{(dr?.[ex.id]||ex.sets).length}</td><td style={{...td,color:ex.progOn?mdl?.color:C.text,fontWeight:800}}>{p?`${p.w}kg`:"—"}</td><td style={td}>×{p?.r||"?"}</td></tr>})}</tbody>
          </table>
          <Btn onClick={()=>goWo(d.id)} style={{width:"100%",padding:10,borderRadius:10,border:"none",background:C.acD,color:"#111",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:font}}>Rozpocznij trening</Btn>
        </div>;})}
        </div>
        <div style={{background:C.card,borderRadius:14,padding:12,boxShadow:C.sh,marginTop:4}}>
          <div style={{fontSize:10,fontWeight:800,color:C.muted,marginBottom:6}}>TWOJE 1RM</div>
          <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr 1fr 1fr":"1fr 1fr",gap:6}}>{Object.entries(allRms).filter(([k])=>["Bench Press","Squat","Deadlift","OHP"].includes(k)).map(([k,v])=><div key={k} style={{background:C.inp,borderRadius:8,padding:"6px 8px"}}><div style={{fontSize:9,color:C.muted}}>{k}</div><div style={{fontSize:16,fontWeight:800,color:C.text}}>{v}<span style={{fontSize:10,color:C.muted}}>kg</span></div></div>)}</div>
        </div>
      </div>
      <BNav a="home" go={setScr} hide={isWide}/>
    </div>

    {/* WORKOUT */}
    <div style={{height:"100%",display:scr==="wo"?"flex":"none",flexDirection:"column"}}>
      {fin&&<div style={{position:"absolute",inset:0,background:C.bg,zIndex:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32}}>
        <h2 style={{fontSize:22,fontWeight:900,color:C.text,margin:"0 0 4px"}}>Trening ukończony!</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,width:"100%",margin:"20px 0"}}>{[{l:"CZAS",v:m2(wSec)},{l:"OBJĘTOŚĆ",v:(tVol/1000).toFixed(1)+"t"},{l:"SERIE",v:`${tSets}`}].map(s=><div key={s.l} style={{background:C.card,borderRadius:12,padding:"12px 6px",textAlign:"center",boxShadow:C.sh}}><div style={{fontSize:8,fontWeight:700,color:C.muted,marginBottom:3}}>{s.l}</div><div style={{fontSize:18,fontWeight:900,color:C.text}}>{s.v}</div></div>)}</div>
        <Btn onClick={()=>{setFin(false);setScr("home");}} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:C.acD,color:"#111",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:font}}>Zamknij</Btn>
      </div>}
      <StatusBar/>
      <div style={{display:"flex",alignItems:"center",padding:"0 14px 6px",flexShrink:0}}><Btn onClick={()=>{setWRun(false);setScr("home");}} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 9px",cursor:"pointer",color:C.text,display:"flex",boxShadow:C.sh}}>{Ic.back}</Btn><div style={{flex:1,textAlign:"center"}}><h2 style={{fontSize:16,fontWeight:800,color:C.text,margin:0}}>{day?.name||""}</h2><span style={{fontSize:10,color:C.sub}}>T{wk} · {wk0?.type}</span></div><div style={{width:38}}/></div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 14px 8px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontFamily:"monospace",fontSize:13,fontWeight:700,color:C.text}}>{m2(wSec)}</span><Btn onClick={()=>setWRun(r=>!r)} style={{width:26,height:26,borderRadius:7,background:C.inp,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{wRun?Ic.pause:Ic.play}</Btn><Btn onClick={()=>{setWSec(0);setWRun(true);}} style={{width:26,height:26,borderRadius:7,background:C.inp,border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{Ic.resetIc}</Btn></div>
        <div style={{fontSize:11,fontWeight:700,color:C.sub}}>{tSets}s · {(tVol/1000).toFixed(1)}t</div>
      </div>
      <div style={{...sc,padding:isWide?"10px 32px 120px":"10px 10px 120px"}}>
        {day?.exercises.map(ex=>{const pl=roadmap[wk-1]?.[day.id]?.[ex.id]||[];const sets=wLog[ex.id]||[];const tot=Math.max(pl.length,sets.length,ex.sets.length);const dn=sets.filter(s=>s?.done).length;const ok=dn>=pl.length&&pl.length>0;const rm1=allRms[ex.name]||0;
          return <div key={ex.id} style={{background:C.card,borderRadius:14,marginBottom:10,boxShadow:C.sh,border:`1px solid ${ok?C.acBg2:C.border}`,overflow:"hidden"}}>
            <div style={{padding:"12px 14px 0"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{fontSize:9,fontWeight:800,color:C.text,background:C.acBg,padding:"2px 7px",borderRadius:5}}>{ex.block}</span>
                {ok&&<span style={{fontSize:8,fontWeight:800,color:C.green,background:C.greenBg,padding:"2px 7px",borderRadius:5}}>DONE</span>}
                {ex.progOn&&mdl&&<span style={{marginLeft:"auto",fontSize:8,fontWeight:700,color:mdl.color,background:mdl.bg,padding:"2px 7px",borderRadius:5,display:"flex",alignItems:"center",gap:2}}>{Ic.brain(mdl.color)}{mdl.name}</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><h3 style={{fontSize:16,fontWeight:800,color:C.text,margin:"3px 0 0"}}>{ex.name}</h3>{rm1>0&&<span style={{fontSize:9,fontWeight:700,color:C.muted,background:C.inp,padding:"2px 6px",borderRadius:4}}>1RM {rm1}kg</span>}</div>
            </div>
            <div style={{padding:"6px 8px 3px"}}>
              <table style={{width:"100%",borderCollapse:"separate",borderSpacing:"0 3px"}}>
                <thead><tr><th style={{width:30,fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",paddingBottom:1}}>SET</th><th style={{fontSize:9,fontWeight:700,color:mdl?.color||C.muted,textAlign:"center",paddingBottom:1}}>PLAN</th><th style={{fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",paddingBottom:1}}>KG</th><th style={{fontSize:9,fontWeight:700,color:C.muted,textAlign:"center",paddingBottom:1}}>POWT.</th><th style={{width:38,paddingBottom:1}}/></tr></thead>
                <tbody>{Array.from({length:tot}).map((_,i)=>{const p=pl[i]||pl[pl.length-1];const d=sets[i]||{};const tgt=ex.sets[i]||ex.sets[ex.sets.length-1];const fw=d.w!=null&&d.w!=="",fr=d.r!=null&&d.r!=="",done=d.done;
                  const iS=f=>({width:"100%",background:done?C.acBg:f?"rgba(168,214,16,.15)":C.inp,border:`1.5px solid ${done?C.acD:f?C.acD+"66":C.inpB}`,borderRadius:9,color:C.text,fontSize:15,fontWeight:700,textAlign:"center",padding:"9px 3px",outline:"none",fontFamily:font,boxSizing:"border-box"});
                  return <tr key={i} style={{opacity:done?.45:1}}>
                    <td style={{textAlign:"center",padding:"3px 0",width:30}}><div style={{fontSize:13,fontWeight:800,color:done?C.acD:C.muted}}>{i+1}</div>{tgt?.note&&<div style={{fontSize:7,fontWeight:700,color:C.warm}}>{tgt.note}</div>}</td>
                    <td style={{textAlign:"center",padding:"3px"}}><div style={{fontSize:10,fontWeight:700,color:ex.progOn?mdl?.color:C.muted}}>{p?`${p.w}×${p.r}`:"—"}</div>{p&&rm1?<div style={{fontSize:8,color:C.muted}}>{Math.round(p.w/rm1*100)}%</div>:null}</td>
                    <td style={{padding:"3px 2px"}}><input type="number" inputMode="decimal" placeholder={p?`${p.w}`:"—"} value={d.w??""} onChange={e=>upd(ex.id,i,{w:e.target.value===""?null:parseFloat(e.target.value)})} style={iS(fw)}/></td>
                    <td style={{padding:"3px 2px"}}><input type="number" inputMode="numeric" placeholder={p?`${p.r}`:tgt?.target||"—"} value={d.r??""} onChange={e=>upd(ex.id,i,{r:e.target.value===""?null:parseInt(e.target.value)})} style={iS(fr)}/></td>
                    <td style={{textAlign:"center",padding:"3px 0",width:38}}><Btn onClick={()=>{upd(ex.id,i,{done:!done});if(!done&&ex.rest)setTmr(ex.rest);}} style={{width:34,height:34,borderRadius:9,border:done?"none":`2px solid ${C.inpB}`,background:done?C.acD:C.white,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{done&&Ic.check()}</Btn></td>
                  </tr>;})}</tbody>
              </table>
            </div>
            <div style={{padding:"2px 14px 10px",display:"flex",alignItems:"center",gap:4,color:C.muted}}>{Ic.timer}<span style={{fontSize:10,fontWeight:600}}>{ex.rest>=60?`${Math.floor(ex.rest/60)}m${ex.rest%60>0?` ${ex.rest%60}s`:""}`:ex.rest+"s"}</span></div>
          </div>;
        })}
      </div>
      {tmr&&<RTimer sec={tmr} onDone={()=>setTmr(null)}/>}
      <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"10px 16px 28px",background:`linear-gradient(to top,${C.bg} 60%,transparent)`,zIndex:5}}><Btn onClick={()=>{setWRun(false);setFin(true);}} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:C.acD,color:"#111",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:font,boxShadow:`0 4px 20px ${C.acBg2}`}}>Zakończ trening</Btn></div>
    </div>

    {/* HISTORY */}
    <div style={{height:"100%",display:scr==="hist"?"flex":"none",flexDirection:"column"}}>
      <StatusBar/>
      <div style={{padding:"0 16px 6px"}}><h1 style={{fontSize:20,fontWeight:800,color:C.text,margin:0}}>Historia treningów</h1></div>
      <div style={{display:"flex",gap:3,padding:"4px 16px 8px",overflowX:"auto"}}>{plan.weeks.map((w,i)=>{const a=i===hWk,pc=PH[w.type]?.c;const hl=!!log[i];return <Btn key={i} onClick={()=>setHWk(i)} style={{minWidth:40,padding:"6px 4px",borderRadius:7,fontFamily:font,border:a?`2px solid ${pc}`:`1px solid ${C.border}`,background:a?pc+"14":C.white,color:a?pc:C.sub,fontSize:10,fontWeight:700,flexShrink:0,cursor:"pointer",opacity:hl?1:.4}}>T{i+1}</Btn>})}</div>
      <div style={{...sc,padding:"0 "+(isWide?"32px":"6px")+" 96px"}}>
        {plan.days.map(d=>{const pl=roadmap[hWk]?.[d.id];const ac=log[hWk];
          return <div key={d.id} style={{background:C.card,borderRadius:12,marginBottom:8,boxShadow:C.sh,overflow:"hidden"}}>
            <div style={{padding:"8px 10px 4px",background:C.inp,display:"flex",justifyContent:"space-between",alignItems:"center"}}><h3 style={{fontSize:12,fontWeight:700,color:C.text,margin:0}}>{d.name}</h3><span style={{fontSize:9,color:PH[plan.weeks[hWk]?.type]?.c,fontWeight:600}}>{plan.weeks[hWk]?.type}</span></div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:320}}>
                <thead><tr style={{background:C.inp}}><th style={{...ts,textAlign:"left",paddingLeft:8,minWidth:80}}>Ćwiczenie</th><th style={{...ts,minWidth:24}}>#</th><th style={{...ts,minWidth:48,color:mdl?.color}}>Plan</th><th style={{...ts,minWidth:48}}>Wynik</th><th style={{...ts,minWidth:24}}>?</th></tr></thead>
                <tbody>{d.exercises.flatMap(ex=>{const pS=pl?.[ex.id]||[];const aS=ac?.[ex.id]||[];
                  return pS.map((p,si)=>{const a=aS[si];const ok=a?.done;const hit=ok&&a.w>=p.w&&a.r>=p.r;
                    return <tr key={`${ex.id}-${si}`}>{si===0?<td rowSpan={pS.length} style={{...td,textAlign:"left",paddingLeft:8,verticalAlign:"top",fontSize:10,fontWeight:ex.progOn?700:500,borderRight:`1px solid ${C.border}`}}>{ex.name}</td>:null}
                      <td style={{...td,fontSize:10}}>{si+1}</td>
                      <td style={{...td,fontSize:10,color:mdl?.color,fontWeight:700}}>{p.w}×{p.r}</td>
                      <td style={{...td,fontSize:10,fontWeight:700,color:ok?(hit?C.green:C.warm):C.muted}}>{ok?`${a.w}×${a.r}`:"—"}</td>
                      <td style={{...td,fontSize:12}}>{ok?(hit?"✓":"△"):"—"}</td>
                    </tr>;
                  });
                })}</tbody>
              </table>
            </div>
          </div>;
        })}
        {!log[hWk]&&<p style={{fontSize:12,color:C.muted,textAlign:"center",marginTop:16}}>Brak danych dla tego tygodnia</p>}
      </div>
      <BNav a="hist" go={setScr} hide={isWide}/>
    </div>

    {/* ROADMAP */}
    <div style={{height:"100%",display:scr==="map"?"flex":"none",flexDirection:"column"}}>
      <StatusBar/>
      <div style={{padding:"0 16px 6px"}}><h1 style={{fontSize:20,fontWeight:800,color:C.text,margin:0}}>Mapa progresji</h1><p style={{fontSize:11,color:C.sub,margin:"2px 0 0"}}>{mdl?.name} · Pełna mapa treningowa</p></div>
      <div style={{...sc,padding:"4px "+(isWide?"32px":"6px")+" 96px"}}>
        {plan.days.map(d=><div key={d.id} style={{background:C.card,borderRadius:12,marginBottom:8,boxShadow:C.sh,overflow:"hidden"}}>
          <div style={{padding:"8px 10px 4px",background:C.inp}}><h3 style={{fontSize:12,fontWeight:700,color:C.text,margin:0}}>{d.name}</h3></div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:300}}>
              <thead><tr style={{background:C.inp}}><th style={{...ts,textAlign:"left",paddingLeft:8,minWidth:70}}>Ćwiczenie</th>{plan.weeks.map((w,i)=><th key={i} style={{...ts,color:PH[w.type]?.c,minWidth:50}}>T{i+1} {PH[w.type]?.s}</th>)}</tr></thead>
              <tbody>{d.exercises.filter(ex=>ex.progOn).map(ex=><tr key={ex.id}>
                <td style={{...td,textAlign:"left",paddingLeft:8,fontSize:10}}>{ex.name}<br/><span style={{fontSize:8,color:C.muted}}>1RM:{allRms[ex.name]||"?"}kg</span></td>
                {plan.weeks.map((w,wi)=>{const p=roadmap[wi]?.[d.id]?.[ex.id]?.[0];const a=log[wi]?.[ex.id]?.[0];const done=a?.done;const hit=done&&a.w>=p?.w;
                  return <td key={wi} style={{...td,background:done?(hit?C.greenBg:C.warmBg):(wi<wk-1?"rgba(0,0,0,.02)":"transparent"),fontSize:10}}>
                    <div style={{fontWeight:800,color:done?(hit?C.green:C.warm):C.text}}>{done?a.w:p?.w||"—"}</div>
                    <div style={{fontSize:8,color:C.muted}}>×{done?a.r:p?.r||"?"}</div>
                    {!done&&p&&<div style={{fontSize:7,color:PH[w.type]?.c}}>{Math.round(p.w/(allRms[ex.name]||100)*100)}%</div>}
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
        </div>)}
        <div style={{background:C.card,borderRadius:12,padding:12,boxShadow:C.sh}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><div style={{width:32,height:32,borderRadius:8,background:mdl?.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>{mdl?.icon(mdl?.color)}</div><div><div style={{fontSize:13,fontWeight:700,color:mdl?.color}}>{mdl?.name}</div></div></div>
          <p style={{fontSize:11,color:C.text,margin:0,lineHeight:1.6}}>
            {plan.model==="block"&&`Ciężary na podstawie 1RM i fazy: AKU=${plan.modelParams.akuPct}%, INT=${plan.modelParams.intPct}%, DEL=55%. System koryguje plan po każdym treningu.`}
            {plan.model==="linear"&&`+${plan.modelParams.inc}kg/tydzień od ciężaru bazowego (RPE 8). Korekta przy niedociągnięciu.`}
            {plan.model==="double"&&`Powt. ${plan.modelParams.rMin}→${plan.modelParams.rMax}, potem +${plan.modelParams.inc}kg. Korekta automatyczna.`}
            {plan.model==="rpe"&&`Ciężar z tabeli RPE Tuchscherer. Cel: RPE ${plan.modelParams.targetRPE}/10.`}
            {plan.model==="dup"&&`Lekki=${plan.modelParams.hypPct}%, Siłowy=${plan.modelParams.strPct}%, Ciężki=92%.`}
          </p>
        </div>
      </div>
      <BNav a="map" go={setScr} hide={isWide}/>
    </div>

    {/* ONBOARDING */}
    {scr==="onboard"&&<div style={{position:"absolute",inset:0,zIndex:300,background:C.bg,display:"flex",flexDirection:"column"}}>
      <StatusBar/>
      {obStep===0&&<div style={{flex:1,display:"flex",flexDirection:"column",background:"linear-gradient(170deg,#111113,#1a1a1c 50%,#111113)"}}>
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 40px",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}><div style={{width:48,height:48,borderRadius:14,background:"#C8F525",display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.barbell("#111")}</div><span style={{fontSize:32,fontWeight:900,color:"#fff",letterSpacing:"-.04em"}}>IRONLOG</span></div>
          <p style={{fontSize:15,color:"rgba(255,255,255,.45)",textAlign:"center",lineHeight:1.6}}>Śledź progresję. Bij rekordy. Trenuj mądrzej.</p>
        </div>
        <div style={{padding:"0 28px 56px",zIndex:1}}><Btn onClick={()=>setObStep(1)} style={{width:"100%",padding:16,borderRadius:16,border:"none",background:"#C8F525",color:"#111",fontSize:17,fontWeight:800,cursor:"pointer",fontFamily:font}}>Zaczynajmy</Btn></div>
      </div>}
      {obStep===1&&<div style={{flex:1,display:"flex",flexDirection:"column"}}><div style={{padding:isWide?"0 60px":"0 20px",flex:1,maxWidth:600,margin:isWide?"0 auto":"0",overflow:"auto",paddingBottom:100}}>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text,margin:"0 0 14px"}}>O Tobie</h2>
        {[{l:"Imię",v:profile.name,o:v=>setProfile(p=>({...p,name:v})),p:"Dawid",t:"text"},{l:"Waga (kg)",v:profile.weight,o:v=>setProfile(p=>({...p,weight:parseFloat(v)||0})),t:"number"},{l:"Wiek",v:profile.age,o:v=>setProfile(p=>({...p,age:parseInt(v)||0})),t:"number"}].map((f,i)=><div key={i} style={{marginBottom:12}}><label style={{fontSize:10,fontWeight:700,color:C.muted}}>{f.l.toUpperCase()}</label><input type={f.t} value={f.v} onChange={e=>f.o(e.target.value)} placeholder={f.p} style={{...fs,marginTop:4}}/></div>)}
        <label style={{fontSize:10,fontWeight:700,color:C.muted}}>DOŚWIADCZENIE</label>
        <div style={{display:"flex",gap:6,marginTop:6}}>{["beginner","intermediate","advanced"].map(e=><Btn key={e} onClick={()=>setProfile(p=>({...p,exp:e}))} style={{flex:1,padding:"10px 4px",borderRadius:12,border:profile.exp===e?`2px solid ${C.acD}`:`1px solid ${C.border}`,background:profile.exp===e?C.acBg:C.white,fontSize:11,fontWeight:700,color:profile.exp===e?C.acD:C.text,fontFamily:font,textAlign:"center",cursor:"pointer"}}>{e==="beginner"?"Początkujący":e==="intermediate"?"Średni":"Zaawansowany"}</Btn>)}</div>
      </div><div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 20px 34px",background:`linear-gradient(to top,${C.bg} 60%,transparent)`}}><Btn onClick={()=>setObStep(2)} style={{width:"100%",padding:15,borderRadius:16,border:"none",background:C.acD,color:"#111",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:font}}>Dalej</Btn></div></div>}
      {obStep===2&&<div style={{flex:1,display:"flex",flexDirection:"column"}}><div style={{padding:isWide?"0 60px":"0 20px",flex:1,maxWidth:600,margin:isWide?"0 auto":"0",overflow:"auto",paddingBottom:100}}>
        <h2 style={{fontSize:20,fontWeight:800,color:C.text,margin:"0 0 4px"}}>Twoje 1RM</h2>
        <p style={{fontSize:11,color:C.muted,margin:"0 0 12px"}}>Maksymalny ciężar na 1 powtórzenie</p>
        {["Bench Press","Squat","Deadlift","OHP"].map(k=><div key={k} style={{background:C.card,borderRadius:14,padding:12,marginBottom:8,boxShadow:C.sh}}>
          <label style={{fontSize:12,fontWeight:700,color:C.text}}>{k}</label>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}><input type="number" value={rms[k]||""} onChange={e=>setRms(r=>({...r,[k]:parseFloat(e.target.value)||0}))} style={{...fs,flex:1}}/><span style={{fontSize:14,fontWeight:600,color:C.muted}}>kg</span></div>
        </div>)}
      </div><div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 20px 34px",background:`linear-gradient(to top,${C.bg} 60%,transparent)`}}><Btn onClick={()=>setObStep(3)} style={{width:"100%",padding:15,borderRadius:16,border:"none",background:C.acD,color:"#111",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:font}}>Dalej</Btn></div></div>}
      {obStep===3&&<div style={{flex:1,display:"flex",flexDirection:"column"}}><div style={{padding:isWide?"0 60px":"0 20px",flex:1,maxWidth:600,margin:isWide?"0 auto":"0",overflow:"auto",paddingBottom:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>{Ic.target(C.warm)}<h2 style={{fontSize:20,fontWeight:800,color:C.text,margin:0}}>Twoje cele</h2></div>
        <p style={{fontSize:11,color:C.muted,margin:"4px 0 12px"}}>Docelowe 1RM</p>
        {["Bench Press","Squat","Deadlift","OHP"].map(k=><div key={k} style={{background:C.card,borderRadius:14,padding:12,marginBottom:8,boxShadow:C.sh}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><label style={{fontSize:12,fontWeight:700,color:C.text}}>{k}</label><span style={{fontSize:10,color:C.muted}}>Teraz: {rms[k]||0}kg</span></div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}><input type="number" value={goals[k]||""} onChange={e=>setGoals(g=>({...g,[k]:parseFloat(e.target.value)||0}))} style={{...fs,flex:1,borderColor:C.warm+"44"}}/><span style={{fontSize:14,fontWeight:600,color:C.warm}}>kg</span></div>
        </div>)}
      </div><div style={{position:"absolute",bottom:0,left:0,right:0,padding:"14px 20px 34px",background:`linear-gradient(to top,${C.bg} 60%,transparent)`}}><Btn onClick={()=>setScr("home")} style={{width:"100%",padding:15,borderRadius:16,border:"none",background:C.acD,color:"#111",fontSize:16,fontWeight:800,cursor:"pointer",fontFamily:font}}>Rozpocznij trening</Btn></div></div>}
    </div>}

    {/* PLAN EDITOR */}
    <div style={{height:"100%",display:scr==="edit"?"flex":"none",flexDirection:"column"}}>
      <StatusBar/>
      <div style={{padding:"0 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><h1 style={{fontSize:18,fontWeight:800,color:C.text,margin:0}}>Edytuj plan</h1></div><Btn onClick={()=>setScr("home")} style={{background:C.inp,border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:C.text,fontSize:11,fontWeight:700,fontFamily:font}}>Gotowe</Btn></div>
      <div style={{...sc,padding:"6px "+(isWide?"32px":"14px")+" 96px"}}>
        <div style={{background:C.card,borderRadius:12,padding:10,marginBottom:8,boxShadow:C.sh}}>
          <label style={{fontSize:9,fontWeight:700,color:C.muted}}>NAZWA PLANU</label>
          <input value={plan.name} onChange={e=>setPlan(p=>({...p,name:e.target.value}))} style={{...fs,marginTop:4}}/>
        </div>
        <Btn onClick={()=>setMs(true)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${mdl?mdl.color+"33":C.border}`,background:mdl?mdl.bg:C.card,cursor:"pointer",boxShadow:C.sh,marginBottom:10,textAlign:"left"}}>
          <div style={{width:28,height:28,borderRadius:7,background:mdl?C.white:C.inp,display:"flex",alignItems:"center",justifyContent:"center"}}>{mdl?mdl.icon(mdl.color):Ic.trend(C.muted)}</div>
          <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:mdl?mdl.color:C.text}}>{mdl?mdl.name:"Wybierz model"}</div></div>
        </Btn>
        <div style={{display:"flex",gap:3,marginBottom:8,overflowX:"auto"}}>
          {plan.days.map(d=><Btn key={d.id} onClick={()=>setEdid(d.id)} style={{padding:"6px 12px",borderRadius:8,fontFamily:font,border:d.id===edid?`2px solid ${C.acD}`:`1px solid ${C.border}`,background:d.id===edid?C.acBg:C.white,color:d.id===edid?C.acD:C.sub,fontSize:11,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer"}}>{d.name}</Btn>)}
          <Btn onClick={()=>{const nd={id:`d${Date.now()}`,name:`Dzień ${plan.days.length+1}`,dupType:"Siłowy",exercises:[]};setPlan(p=>({...p,days:[...p.days,nd]}));setEdid(nd.id);}} style={{padding:"6px 8px",borderRadius:8,border:`1px dashed ${C.acD}`,background:"transparent",color:C.acD,display:"flex",alignItems:"center",flexShrink:0,cursor:"pointer"}}>{Ic.plus}</Btn>
        </div>
        {eday&&<>
          <div style={{background:C.card,borderRadius:12,padding:10,marginBottom:6,boxShadow:C.sh}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
              <label style={{fontSize:9,fontWeight:700,color:C.muted}}>NAZWA DNIA</label>
              {plan.days.length>1&&<Btn onClick={()=>{setPlan(p=>({...p,days:p.days.filter(d=>d.id!==eday.id)}));setEdid(plan.days.find(d=>d.id!==eday.id)?.id);}} style={{fontSize:10,color:C.red,background:C.white,border:"none",fontWeight:700,cursor:"pointer",fontFamily:font}}>Usuń dzień</Btn>}
            </div>
            <input value={eday.name} onChange={e=>uD({...eday,name:e.target.value})} style={{...fs,marginTop:2}}/>
          </div>
          {eday.exercises.map(ex=><div key={ex.id} style={{background:C.card,borderRadius:12,padding:10,marginBottom:6,boxShadow:C.sh}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
              <span style={{fontSize:9,fontWeight:800,color:C.text,background:C.acBg,padding:"2px 5px",borderRadius:4}}>{ex.block}</span>
              <input value={ex.name} onChange={e=>uD({...eday,exercises:eday.exercises.map(x=>x.id===ex.id?{...x,name:e.target.value}:x)})} style={{...fs,flex:1,fontSize:13,padding:"7px 8px",fontWeight:700}} placeholder="Nazwa"/>
              <Btn onClick={()=>uD({...eday,exercises:eday.exercises.map(x=>x.id===ex.id?{...x,progOn:!x.progOn}:x)})} style={{width:36,height:20,borderRadius:10,background:ex.progOn?C.acD:C.inp,border:ex.progOn?"none":`1.5px solid ${C.inpB}`,cursor:"pointer",position:"relative"}}><div style={{width:14,height:14,borderRadius:7,background:C.white,position:"absolute",top:3,left:ex.progOn?19:3,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.15)"}}/></Btn>
              <Btn onClick={()=>uD({...eday,exercises:eday.exercises.filter(x=>x.id!==ex.id)})} style={{color:C.red,background:"none",border:"none",cursor:"pointer",display:"flex",padding:2}}>{Ic.trash}</Btn>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{fontSize:10,color:C.muted}}>{(ex.sets||[]).length} serii</span>
              <Btn onClick={()=>{const s=[...(ex.sets||[])];if(s.length>1)s.pop();uD({...eday,exercises:eday.exercises.map(x=>x.id===ex.id?{...x,sets:s}:x)});}} style={{width:20,height:20,borderRadius:5,border:`1px solid ${C.border}`,background:C.white,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.sub,fontSize:10}}>{Ic.minus}</Btn>
              <Btn onClick={()=>{const last=(ex.sets||[]).slice(-1)[0]||{target:"10"};uD({...eday,exercises:eday.exercises.map(x=>x.id===ex.id?{...x,sets:[...(x.sets||[]),{target:last.target}]}:x)});}} style={{width:20,height:20,borderRadius:5,border:`1px solid ${C.acD}`,background:C.acBg,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.acD,fontSize:10}}>{Ic.plus}</Btn>
            </div>
          </div>)}
          <Btn onClick={()=>{const id=`${eday.id}_e${Date.now()}`;uD({...eday,exercises:[...eday.exercises,{id,name:"",block:`A${eday.exercises.length+1}`,rest:90,progOn:false,sets:[{target:"10"},{target:"10"},{target:"10"}]}]});}} style={{width:"100%",padding:10,borderRadius:12,border:`2px dashed ${C.acBg2}`,background:C.acBg,color:C.acD,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>{Ic.plus} Dodaj ćwiczenie</Btn>
        </>}
        <div style={{background:C.card,borderRadius:12,padding:10,marginTop:10,boxShadow:C.sh}}>
          <div style={{fontSize:9,fontWeight:800,color:C.muted,marginBottom:6}}>TYGODNIE</div>
          {plan.weeks.map((w,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:800,color:C.text,minWidth:20}}>T{i+1}</span>
            <div style={{flex:1,display:"flex",gap:2}}>{Object.entries(PH).map(([k,v])=><Btn key={k} onClick={()=>{const ws=[...plan.weeks];ws[i]={type:k};setPlan(p=>({...p,weeks:ws}));}} style={{flex:1,padding:"4px 2px",borderRadius:6,fontFamily:font,border:w.type===k?`2px solid ${v.c}`:`1px solid ${C.border}`,background:w.type===k?v.c+"14":C.white,color:w.type===k?v.c:C.muted,fontSize:8,fontWeight:700,cursor:"pointer"}}>{v.s}</Btn>)}</div>
            <Btn onClick={()=>{const ws=[...plan.weeks];ws.splice(i,1);setPlan(p=>({...p,weeks:ws}));}} style={{color:C.red,background:"none",border:"none",cursor:"pointer",display:"flex",padding:1}}>{Ic.trash}</Btn>
          </div>)}
          <Btn onClick={()=>setPlan(p=>({...p,weeks:[...p.weeks,{type:"Akumulacja"}]}))} style={{width:"100%",padding:6,borderRadius:8,border:`2px dashed ${C.acBg2}`,background:C.acBg,color:C.acD,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:font,marginTop:4}}>{Ic.plus} Tydzień</Btn>
        </div>
      </div>
      <BNav a="edit" go={setScr} hide={isWide}/>
    </div>

    {/* MODEL SETTINGS */}
    {ms&&<div style={{position:"absolute",inset:0,zIndex:200,background:C.bg,display:"flex",flexDirection:"column"}}>
      <StatusBar/>
      <div style={{display:"flex",alignItems:"center",padding:"0 14px 8px",flexShrink:0}}><Btn onClick={()=>setMs(false)} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 9px",cursor:"pointer",color:C.text,display:"flex",boxShadow:C.sh}}>{Ic.back}</Btn><div style={{flex:1,textAlign:"center"}}><h2 style={{fontSize:16,fontWeight:800,color:C.text,margin:0}}>Model progresji</h2></div><div style={{width:38}}/></div>
      <div style={{...sc,padding:"4px 14px 20px"}}>
        {MODELS.map(m=>{const a=plan.model===m.id;return <Btn key={m.id} onClick={()=>setPlan(p=>({...p,model:m.id}))} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,marginBottom:6,cursor:"pointer",border:a?`2.5px solid ${m.color}`:`1px solid ${C.border}`,background:a?m.bg:C.white,textAlign:"left",boxShadow:a?`0 0 0 3px ${m.color}18`:"none"}}><div style={{width:32,height:32,borderRadius:8,background:a?C.white:C.inp,display:"flex",alignItems:"center",justifyContent:"center"}}>{m.icon(a?m.color:C.sub)}</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:a?m.color:C.text}}>{m.name}</div><div style={{fontSize:10,color:C.sub}}>{m.desc}</div></div>{a&&<div style={{width:20,height:20,borderRadius:10,background:m.color,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check()}</div>}</Btn>;})}
        {mdl&&<div style={{background:C.card,borderRadius:12,padding:12,marginTop:8,boxShadow:C.sh}}>
          <div style={{fontSize:9,fontWeight:800,color:C.muted,marginBottom:8}}>USTAWIENIA</div>
          {plan.model==="linear"&&<div><span style={{fontSize:11,fontWeight:600,color:C.text}}>Przyrost/tydzień</span><div style={{display:"flex",gap:4,marginTop:4}}>{[1.25,2.5,5].map(v=><Btn key={v} onClick={()=>setPlan(p=>({...p,modelParams:{...p.modelParams,inc:v}}))} style={{flex:1,padding:"10px 0",borderRadius:8,fontFamily:font,border:plan.modelParams?.inc===v?`2px solid ${mdl.color}`:`1px solid ${C.border}`,background:plan.modelParams?.inc===v?mdl.bg:C.white,color:plan.modelParams?.inc===v?mdl.color:C.text,fontSize:13,fontWeight:700,cursor:"pointer"}}>+{v}kg</Btn>)}</div></div>}
          {plan.model==="block"&&<div>
            <div style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}><span>Budowanie (AKU)</span><span style={{fontWeight:700,color:C.blue}}>{plan.modelParams?.akuPct||70}%</span></div><input type="range" min="60" max="80" step="5" value={plan.modelParams?.akuPct||70} onChange={e=>setPlan(p=>({...p,modelParams:{...p.modelParams,akuPct:parseInt(e.target.value)}}))} style={{width:"100%",accentColor:C.blue}}/></div>
            <div><div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}><span>Siła (INT)</span><span style={{fontWeight:700,color:C.warm}}>{plan.modelParams?.intPct||85}%</span></div><input type="range" min="75" max="95" step="5" value={plan.modelParams?.intPct||85} onChange={e=>setPlan(p=>({...p,modelParams:{...p.modelParams,intPct:parseInt(e.target.value)}}))} style={{width:"100%",accentColor:C.warm}}/></div>
          </div>}
          {plan.model==="rpe"&&<div><span style={{fontSize:11,fontWeight:600,color:C.text}}>Docelowy RPE</span><div style={{display:"flex",gap:3,marginTop:4}}>{[7,7.5,8,8.5,9].map(v=><Btn key={v} onClick={()=>setPlan(p=>({...p,modelParams:{...p.modelParams,targetRPE:v}}))} style={{flex:1,padding:"10px 0",borderRadius:8,fontFamily:font,border:plan.modelParams?.targetRPE===v?`2px solid ${mdl.color}`:`1px solid ${C.border}`,background:plan.modelParams?.targetRPE===v?mdl.bg:C.white,color:plan.modelParams?.targetRPE===v?mdl.color:C.text,fontSize:12,fontWeight:700,cursor:"pointer"}}>{v}/10</Btn>)}</div></div>}
        </div>}
      </div>
    </div>}

    {/* PLAN PICKER */}
    {pp&&<div style={{position:"absolute",inset:0,zIndex:100,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"flex-end"}} onClick={()=>setPp(false)}><div onClick={e=>e.stopPropagation()} style={{width:"100%",background:C.white,borderRadius:"24px 24px 0 0",padding:"20px 20px 40px"}}><div style={{width:36,height:4,borderRadius:2,background:C.muted,margin:"0 auto 16px",opacity:.4}}/><h3 style={{fontSize:18,fontWeight:800,color:C.text,margin:"0 0 12px"}}>Twoje plany</h3>
      {plans.map(p=>{const a=p.id===pid;return <Btn key={p.id} onClick={()=>{setPid(p.id);setWk(1);setPp(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:14,marginBottom:8,cursor:"pointer",border:a?`2px solid ${C.acD}`:`1px solid ${C.border}`,background:a?C.acBg:C.white,textAlign:"left"}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:C.text}}>{p.name}</div><div style={{fontSize:11,color:C.sub}}>{p.days.length} dni · {MODELS.find(m=>m.id===p.model)?.name||"—"}</div></div>{a&&<div style={{width:20,height:20,borderRadius:10,background:C.acD,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check()}</div>}</Btn>;})}
      <Btn onClick={()=>{const np={id:`p${Date.now()}`,name:"Nowy plan",model:"linear",modelParams:{inc:2.5,akuPct:70,intPct:85,targetRPE:8,hypPct:70,strPct:85,rMin:8,rMax:12},weeks:[{type:"Akumulacja"},{type:"Akumulacja"}],days:[{id:`d${Date.now()}`,name:"Dzień 1",dupType:"Siłowy",exercises:[]}]};setPlans(ps=>[...ps,np]);setPid(np.id);setEdid(np.days[0].id);setPp(false);setScr("edit");}} style={{width:"100%",padding:12,borderRadius:14,border:`2px dashed ${C.acBg2}`,background:C.acBg,color:C.acD,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:font}}>{Ic.plus} Nowy plan</Btn>
    </div></div>}

    </div>
  </div>;
}
