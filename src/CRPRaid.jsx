import React, { useState, useMemo } from "react";

// ── Tokens ─────────────────────────────────────────────────────
const C = {
  bg:"#F7F5EF",surface:"#FFFFFF",ink:"#1A1A19",muted:"#6E6C66",subtle:"#95938C",
  line:"rgba(26,26,25,0.10)",lineS:"rgba(26,26,25,0.22)",accent:"#3B6D11",
  green:"#356512",greenBg:"#E6EFD6",
  amber:"#B7791F",amberBg:"#FAEEDA",
  red:"#A32D2D",redBg:"#FCEBEB",
  blue:"#0C447C",blueBg:"#E6F1FB",
  teal:"#0F6E56",tealBg:"#E1F5EE",
  purple:"#4B2D8C",purpleBg:"#EEEDFE",
};
const F='"IBM Plex Sans",-apple-system,sans-serif';

// ── RAID config ────────────────────────────────────────────────
const RTYPE={
  Risk:       {icon:"⚠",fg:C.red,   bg:C.redBg,   desc:"Potential future problem that may impact delivery"},
  Assumption: {icon:"💡",fg:C.blue,  bg:C.blueBg,  desc:"Something assumed true — must be validated"},
  Issue:      {icon:"🔥",fg:C.amber, bg:C.amberBg, desc:"Problem already occurring and needing resolution"},
  Dependency: {icon:"🔗",fg:C.purple,bg:C.purpleBg,desc:"External or internal prerequisite that must happen first"},
};

const MATRIX={"High:High":"Critical","High:Medium":"High","High:Low":"High","Medium:High":"High","Medium:Medium":"Medium","Medium:Low":"Low","Low:High":"Medium","Low:Medium":"Low","Low:Low":"Low"};
const LCFG={Critical:{fg:"#7B1D1D",bg:"#FCEBEB",border:"#F5A0A0",dot:"#A32D2D"},High:{fg:C.red,bg:"#FFF0EE",border:"#F5C8C8",dot:C.red},Medium:{fg:C.amber,bg:C.amberBg,border:"#F0D490",dot:C.amber},Low:{fg:C.green,bg:C.greenBg,border:"#9FCB75",dot:C.green}};
const rl=(l,i)=>MATRIX[`${l}:${i}`]||"Medium";
const lc=l=>LCFG[l]||LCFG.Medium;

// Trend config
const TREND={
  improving:{icon:"🟢",label:"Improving",fg:C.green,bg:C.greenBg},
  stable:   {icon:"🟡",label:"Stable",   fg:C.amber,bg:C.amberBg},
  escalating:{icon:"🔴",label:"Escalating",fg:C.red, bg:C.redBg},
};

const fmtD=d=>d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"—";
const fmtDT=d=>d?new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"}):"—";
const fmtRel=ts=>{const h=(Date.now()-new Date(ts))/3.6e6;return h<1?`${Math.round(h*60)}m ago`:h<24?`${Math.round(h)}h ago`:`${Math.round(h/24)}d ago`;};
const daysSince=ts=>Math.floor((Date.now()-new Date(ts))/86400000);
const isOver=d=>d&&new Date(d)<new Date("2026-05-08");
let _n=0;const uid=()=>`x_${++_n}`;
const TEAM=["hattt4","Trangvk","An Nguyen","Hung Le","Mai Tran","Linh Pham","Legal","AF","HR","BOD","IT","FIN"];

// ── Seed Data ──────────────────────────────────────────────────
const SEED={
  programs:[
    {id:"pg1",name:"LLCs",description:"HIO & SKT entity dissolutions",
     raid:[
       {id:"r1",type:"Risk",title:"BRA rejects dissolution filing due to document deficiency",
        likelihood:"Medium",impact:"High",owner:"hattt4",status:"Active",escalateToBoD:true,
        mitigationPlan:"Pre-check with BRA desk officer. Prepare notarised copy + board resolution as separate uploads.",
        trend:"stable",lastReviewedAt:"2026-05-06T10:00:00Z",createdAt:"2026-05-01T09:00:00Z",createdBy:"hattt4",
        history:[
          {id:"h1",ts:"2026-05-01T09:00:00Z",author:"hattt4",note:"Risk identified after review of BRA portal requirements.",trend:"stable"},
          {id:"h2",ts:"2026-05-04T14:00:00Z",author:"hattt4",note:"Pre-check call with BRA desk completed. They confirmed both docs needed separately.",trend:"stable"},
          {id:"h3",ts:"2026-05-06T10:00:00Z",author:"hattt4",note:"Trangvk confirmed notarised copy ready. On track for 8 May submission.",trend:"improving"},
        ],
        mitigationActions:[
          {id:"ma1",name:"Pre-check with BRA desk officer before formal submission",pic:"hattt4",due:"2026-05-06",status:"Done",comments:[]},
          {id:"ma2",name:"Prepare notarised copy + board resolution as separate uploads",pic:"Trangvk",due:"2026-05-08",status:"Open",comments:[{id:"c1",author:"An Nguyen",text:"@Trangvk please also prepare certified translation just in case",ts:"2026-05-07T10:00:00Z"}]},
        ]},
       {id:"r2",type:"Risk",title:"BRA processing backlog delays acknowledgment beyond statutory 30-day window",
        likelihood:"High",impact:"High",owner:"hattt4",status:"PendingApproval",escalateToBoD:true,
        mitigationPlan:"Escalate to MPI liaison if no response within 10 business days.",
        trend:"escalating",lastReviewedAt:"2026-05-07T14:00:00Z",createdAt:"2026-05-07T14:00:00Z",createdBy:"Trangvk",
        history:[
          {id:"h4",ts:"2026-05-07T14:00:00Z",author:"Trangvk",note:"BRA officer informally confirmed 3-4 week backlog due to end-of-quarter filings. Flagging as Critical.",trend:"escalating"},
        ],
        mitigationActions:[
          {id:"ma3",name:"Escalate to MPI liaison if no response in 10 business days",pic:"hattt4",due:"2026-05-20",status:"Open",comments:[]},
        ]},
       {id:"r3",type:"Assumption",title:"BRA will accept digital notarisation (not requiring physical stamps)",
        validationDeadline:"2026-05-10",validationOwner:"An Nguyen",validated:false,
        owner:"An Nguyen",status:"Active",trend:"stable",
        lastReviewedAt:"2026-05-05T10:00:00Z",createdAt:"2026-05-03T09:00:00Z",createdBy:"hattt4",
        history:[{id:"h5",ts:"2026-05-05T10:00:00Z",author:"An Nguyen",note:"Still unconfirmed. Email sent to BRA legal desk, awaiting reply.",trend:"stable"}],
        mitigationActions:[
          {id:"ma4",name:"Confirm with BRA legal desk whether e-notary accepted",pic:"An Nguyen",due:"2026-05-09",status:"Open",comments:[]},
        ]},
       {id:"r4",type:"Issue",title:"HIO bank account closure delayed — bank requires original resolution not copy",
        severity:"High",owner:"hattt4",status:"Active",
        trend:"stable",lastReviewedAt:"2026-05-07T09:00:00Z",raisedAt:"2026-05-06T09:00:00Z",createdAt:"2026-05-06T09:00:00Z",createdBy:"hattt4",
        history:[
          {id:"h6",ts:"2026-05-06T09:00:00Z",author:"hattt4",note:"Bank returned the request. They need original wet-ink resolution.",trend:"stable"},
          {id:"h7",ts:"2026-05-07T09:00:00Z",author:"Trangvk",note:"Original being couriered. Expected to arrive 8 May.",trend:"improving"},
        ],
        mitigationActions:[
          {id:"ma5",name:"Submit original resolution to Vietcombank branch",pic:"hattt4",due:"2026-05-09",status:"Open",comments:[]},
          {id:"ma6",name:"Follow up with VCB relationship manager",pic:"Trangvk",due:"2026-05-10",status:"Open",comments:[]},
        ]},
       {id:"r5",type:"Dependency",title:"SKT dissolution cannot start until HIO BRA acknowledgment received",
        dependsOn:"HIO BRA acknowledgment receipt",blockedUntil:"2026-05-10",
        owner:"hattt4",status:"Active",trend:"stable",
        lastReviewedAt:"2026-05-05T10:00:00Z",createdAt:"2026-05-03T09:00:00Z",createdBy:"hattt4",
        history:[{id:"h8",ts:"2026-05-05T10:00:00Z",author:"hattt4",note:"Timeline updated. HIO receipt expected 10 May. SKT start pushed to 11 May.",trend:"stable"}],
        mitigationActions:[]},
     ]},
    {id:"pg2",name:"NSC",description:"New Singapore Co incorporation",
     raid:[
       {id:"r6",type:"Risk",title:"MPI requests supplementary docs not in standard IRC checklist",
        likelihood:"Medium",impact:"Medium",owner:"An Nguyen",status:"Active",escalateToBoD:false,
        mitigationPlan:"Pre-review full checklist with MPI desk officer before submission.",
        trend:"stable",lastReviewedAt:"2026-05-06T11:00:00Z",createdAt:"2026-05-05T10:00:00Z",createdBy:"An Nguyen",
        history:[{id:"h9",ts:"2026-05-06T11:00:00Z",author:"An Nguyen",note:"MPI desk confirmed checklist. Probability reduced.",trend:"improving"}],
        mitigationActions:[{id:"ma7",name:"Pre-review checklist with MPI desk officer",pic:"An Nguyen",due:"2026-05-12",status:"Done",comments:[]}]},
       {id:"r7",type:"Risk",title:"FX rate movement increases USD capital requirement above BoD-approved budget",
        likelihood:"Low",impact:"High",owner:"hattt4",status:"Active",escalateToBoD:true,
        mitigationPlan:"Monitor USD/VND weekly. Alert if moves >3%. Pre-approve 5% buffer.",
        trend:"escalating",lastReviewedAt:"2026-05-07T16:00:00Z",createdAt:"2026-05-04T10:00:00Z",createdBy:"hattt4",
        history:[
          {id:"h10",ts:"2026-05-04T10:00:00Z",author:"hattt4",note:"Risk flagged at initial planning.",trend:"stable"},
          {id:"h11",ts:"2026-05-07T16:00:00Z",author:"Mai Tran",note:"USD/VND moved 2.1% this week. Approaching 3% alert threshold.",trend:"escalating"},
        ],
        mitigationActions:[
          {id:"ma8",name:"Monitor USD/VND rate weekly — alert if >3% movement",pic:"Mai Tran",due:"2026-05-30",status:"Open",comments:[]},
          {id:"ma9",name:"Pre-approve 5% FX buffer in BoD budget",pic:"hattt4",due:"2026-05-12",status:"Open",comments:[]},
        ]},
       {id:"r8",type:"Assumption",title:"Singapore company registration completes within 14 business days",
        validationDeadline:"2026-06-20",validationOwner:"An Nguyen",validated:false,
        owner:"An Nguyen",status:"Active",trend:"stable",
        lastReviewedAt:"2026-05-01T10:00:00Z",createdAt:"2026-05-01T09:00:00Z",createdBy:"An Nguyen",
        history:[{id:"h12",ts:"2026-05-01T10:00:00Z",author:"An Nguyen",note:"ACRA standard timeline is 1-3 days for online incorporation. Assumption should hold.",trend:"stable"}],
        mitigationActions:[]},
       {id:"r9",type:"Dependency",title:"Singapore bank account cannot open until IRC certificate issued by MPI",
        dependsOn:"IRC certificate from MPI",blockedUntil:"2026-06-09",
        owner:"An Nguyen",status:"Active",trend:"stable",
        lastReviewedAt:"2026-05-05T10:00:00Z",createdAt:"2026-05-03T09:00:00Z",createdBy:"An Nguyen",
        history:[{id:"h13",ts:"2026-05-05T10:00:00Z",author:"An Nguyen",note:"MPI acknowledged receipt. Expected certificate: 25 May. Timeline on track.",trend:"stable"}],
        mitigationActions:[]},
     ]},
    {id:"pg3",name:"SPVs",description:"ManagementCo & SPV setup",
     raid:[
       {id:"r10",type:"Risk",title:"DPI delays ERC issuance beyond 5-day SLA",
        likelihood:"Medium",impact:"Medium",owner:"An Nguyen",status:"Active",escalateToBoD:false,
        mitigationPlan:"Submit via expedited channel. Escalate if no response in 3 days.",
        trend:"improving",lastReviewedAt:"2026-05-06T10:00:00Z",createdAt:"2026-04-25T09:00:00Z",createdBy:"An Nguyen",
        history:[
          {id:"h14",ts:"2026-04-25T09:00:00Z",author:"An Nguyen",note:"Risk flagged at start.",trend:"stable"},
          {id:"h15",ts:"2026-05-06T10:00:00Z",author:"An Nguyen",note:"ERC received on day 4. Risk closed on ManagementCo.",trend:"improving"},
        ],
        mitigationActions:[{id:"ma10",name:"Submit via expedited channel (dịch vụ hẹn giờ)",pic:"An Nguyen",due:"2026-04-25",status:"Done",comments:[]}]},
       {id:"r11",type:"Issue",title:"ManagementCo capital contribution wire rejected by bank — beneficiary format error",
        severity:"Medium",owner:"hattt4",status:"Active",
        trend:"improving",lastReviewedAt:"2026-05-07T14:00:00Z",raisedAt:"2026-05-04T14:00:00Z",createdAt:"2026-05-04T14:00:00Z",createdBy:"hattt4",
        history:[
          {id:"h16",ts:"2026-05-04T14:00:00Z",author:"hattt4",note:"Wire rejected. Bank needs account number in IBAN format not SWIFT.",trend:"stable"},
          {id:"h17",ts:"2026-05-07T14:00:00Z",author:"Mai Tran",note:"Corrected format confirmed. Resubmitting 8 May.",trend:"improving"},
        ],
        mitigationActions:[{id:"ma11",name:"Resubmit wire with corrected IBAN format",pic:"Mai Tran",due:"2026-05-09",status:"Open",comments:[]}]},
     ]},
    {id:"pg4",name:"FINTECH",description:"Fintech Co restructuring & compliance",
     raid:[
       {id:"r12",type:"Risk",title:"GDT audits CIT filing due to large intercompany transactions",
        likelihood:"Low",impact:"High",owner:"hattt4",status:"Active",escalateToBoD:true,
        mitigationPlan:"Prepare transfer pricing documentation package proactively.",
        trend:"stable",lastReviewedAt:"2026-05-05T10:00:00Z",createdAt:"2026-05-03T09:00:00Z",createdBy:"hattt4",
        history:[{id:"h18",ts:"2026-05-05T10:00:00Z",author:"hattt4",note:"TP doc package 60% complete. Tax team on track.",trend:"stable"}],
        mitigationActions:[{id:"ma12",name:"Prepare transfer pricing documentation package",pic:"AF",due:"2026-05-15",status:"Open",comments:[]}]},
     ]},
    {id:"pg5",name:"BOD",description:"Board-level strategy",
     raid:[
       {id:"r13",type:"Risk",title:"BoD does not reach consensus on MWB priorities at May meeting",
        likelihood:"Medium",impact:"High",owner:"hattt4",status:"Active",escalateToBoD:true,
        mitigationPlan:"Pre-align individually with key BoD members. Prepare tiered proposal with 3 priority options.",
        trend:"improving",lastReviewedAt:"2026-05-07T11:00:00Z",createdAt:"2026-05-03T14:00:00Z",createdBy:"hattt4",
        history:[
          {id:"h19",ts:"2026-05-03T14:00:00Z",author:"hattt4",note:"Risk flagged after May 1 pre-meeting. Two board members have conflicting views on IB vs organic growth.",trend:"escalating"},
          {id:"h20",ts:"2026-05-07T11:00:00Z",author:"hattt4",note:"1:1 with Chairman completed. He's aligned on option B. Probability of deadlock reducing.",trend:"improving"},
        ],
        mitigationActions:[
          {id:"ma13",name:"1:1 pre-alignment with Chairman",pic:"hattt4",due:"2026-05-06",status:"Done",comments:[]},
          {id:"ma14",name:"1:1 pre-alignment with CFO",pic:"hattt4",due:"2026-05-09",status:"Open",comments:[]},
          {id:"ma15",name:"Prepare tiered proposal (3 priority options)",pic:"Trangvk",due:"2026-05-11",status:"Open",comments:[]},
        ]},
     ]},
  ],
  tasks:[
    {id:"t1",name:"Submit dissolution resolution to BRA",program:"LLCs",programId:"pg1",workstream:"HIO",pic:"hattt4",status:"InProgress",end:"2026-04-30",deadlineType:"hard"},
    {id:"t2",name:"Overseas investment registration (IRC)",program:"NSC",programId:"pg2",workstream:"New SingCo",pic:"An Nguyen",status:"InProgress",end:"2026-06-09",deadlineType:"hard"},
    {id:"t3",name:"Must-Win Battles (MWB)",program:"BOD",programId:"pg5",workstream:"Business strategy",pic:"hattt4",status:"InProgress",end:"2026-05-30",deadlineType:"hard"},
    {id:"t4",name:"ManagementCo capital contribution",program:"SPVs",programId:"pg3",workstream:"ManagementCo",pic:"hattt4",status:"InProgress",end:"2026-05-07",deadlineType:"hard"},
  ],
};

const ME="hattt4",IS_OWNER=true;

// ── Base UI ────────────────────────────────────────────────────
const Btn=({children,variant="default",size="sm",onClick,disabled,style={}})=>{
  const sz=size==="sm"?{padding:"5px 11px",fontSize:11}:{padding:"8px 16px",fontSize:13};
  const vr={default:{background:C.surface,color:C.ink,border:`1px solid ${C.lineS}`},primary:{background:C.ink,color:"#fff",border:`1px solid ${C.ink}`},approve:{background:C.greenBg,color:C.green,border:`1px solid #9FCB75`},danger:{background:C.redBg,color:C.red,border:`1px solid #F5C8C8`},ghost:{background:"transparent",color:C.muted,border:"none"}};
  return <button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",gap:5,borderRadius:7,fontFamily:F,fontWeight:500,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,...sz,...vr[variant],...style}}>{children}</button>;
};
const Tag=({c,b,children,style={}})=><span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:b||C.bg,color:c||C.muted,fontWeight:600,whiteSpace:"nowrap",...style}}>{children}</span>;
const FL=({children,style={}})=><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,marginBottom:5,...style}}>{children}</div>;
const Inp=({value,onChange,...p})=><input value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.lineS}`,borderRadius:7,fontFamily:F,fontSize:12,outline:"none",background:C.surface,boxSizing:"border-box"}} {...p}/>;
const Sel=({value,onChange,children})=><select value={value||""} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.lineS}`,borderRadius:7,fontFamily:F,fontSize:12,outline:"none",background:C.surface}}>{children}</select>;

function RiskMatrix({likelihood,impact,onSelect,compact=false}){
  return(
    <div>
      {!compact&&<FL>Click to set likelihood × impact</FL>}
      <div style={{display:"grid",gridTemplateColumns:compact?"20px 1fr 1fr 1fr":"30px 1fr 1fr 1fr",gap:2,fontSize:10}}>
        <div/><div style={{textAlign:"center",color:C.muted,fontSize:9}}>Low</div><div style={{textAlign:"center",color:C.muted,fontSize:9}}>Med</div><div style={{textAlign:"center",color:C.muted,fontSize:9}}>High</div>
        {["High","Medium","Low"].map(lik=>(
          <React.Fragment key={lik}>
            <div style={{color:C.muted,fontSize:8,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:3}}>{lik[0]}.</div>
            {["Low","Medium","High"].map(imp=>{const lvl=rl(lik,imp),cfg=lc(lvl),sel=likelihood===lik&&impact===imp;return(
              <div key={imp} onClick={()=>onSelect&&onSelect(lik,imp)} style={{padding:compact?"3px 2px":"5px 2px",borderRadius:3,background:cfg.bg,border:`1.5px solid ${sel?cfg.dot:cfg.border}`,textAlign:"center",cursor:onSelect?"pointer":"default",boxShadow:sel?`0 0 0 1px ${cfg.dot}`:""}}>
                <span style={{fontSize:8,color:cfg.fg,fontWeight:sel?700:500}}>{lvl[0]}</span>
              </div>
            );})}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Mitigation Action Row ──────────────────────────────────────
function MitigationActionRow({action,onUpdate,onRemove,currentUser}){
  const [expanded,setExpanded]=useState(false);
  const [commentText,setCommentText]=useState("");
  const over=isOver(action.due)&&action.status!=="Done";
  const unread=(action.comments||[]).filter(c=>c.text.includes(`@${currentUser}`)).length;
  const post=()=>{if(!commentText.trim())return;onUpdate({...action,comments:[...(action.comments||[]),{id:uid(),author:currentUser,text:commentText.trim(),ts:new Date().toISOString()}]});setCommentText("");};
  return(
    <div style={{border:`1px solid ${expanded?C.lineS:C.line}`,borderRadius:7,marginBottom:5,background:action.status==="Done"?"#FAFEF7":C.surface,opacity:action.status==="Done"?0.72:1}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer"}}>
        <div style={{width:14,height:14,border:`1.5px solid ${action.status==="Done"?C.green:C.lineS}`,borderRadius:3,background:action.status==="Done"?C.green:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {action.status==="Done"&&<span style={{color:"#fff",fontSize:9}}>✓</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:action.status==="Done"?C.muted:C.ink,textDecoration:action.status==="Done"?"line-through":"none",fontWeight:action.status!=="Done"?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{action.name}</div>
          <div style={{fontSize:10,color:C.subtle,marginTop:1,display:"flex",gap:6}}>
            <span>@{action.pic}</span>
            {action.due&&<span style={{color:over?C.red:C.subtle}}>due {fmtD(action.due)}{over?" ⚠":""}</span>}
            {(action.comments||[]).length>0&&<span>💬 {action.comments.length}{unread>0&&<span style={{background:C.red,color:"#fff",borderRadius:999,padding:"0 3px",fontSize:9,marginLeft:2}}>@you</span>}</span>}
          </div>
        </div>
        {action.status==="Open"&&action.pic===currentUser&&<Btn variant="approve" size="sm" onClick={e=>{e.stopPropagation();onUpdate({...action,status:"Done"});}}>✓ Done</Btn>}
        <span style={{color:C.muted,fontSize:11}}>{expanded?"▲":"▼"}</span>
      </div>
      {expanded&&(
        <div style={{borderTop:`1px solid ${C.line}`,padding:"8px 10px",background:C.bg}}>
          {(action.comments||[]).length===0&&<div style={{fontSize:11,color:C.subtle,fontStyle:"italic",marginBottom:8}}>No comments yet.</div>}
          {(action.comments||[]).map(c=>(
            <div key={c.id} style={{display:"flex",gap:6,marginBottom:6}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:C.blueBg,color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
              <div style={{flex:1,background:C.surface,borderRadius:5,padding:"5px 8px",fontSize:11}}>
                <div style={{display:"flex",gap:6,marginBottom:2}}><strong style={{fontSize:10}}>{c.author}</strong><span style={{fontSize:9,color:C.subtle}}>{fmtRel(c.ts)}</span></div>
                {c.text.split(/(@\w+)/g).map((p,i)=>p.startsWith("@")?<span key={i} style={{color:C.blue,background:C.blueBg,padding:"0 2px",borderRadius:2,fontWeight:500}}>{p}</span>:p)}
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:5,marginTop:4}}>
            <input value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={`Comment as ${currentUser}… @ to mention`}
              style={{flex:1,padding:"6px 9px",border:`1px solid ${C.lineS}`,borderRadius:6,fontFamily:F,fontSize:11,outline:"none",background:C.surface}}/>
            <Btn size="sm" variant="primary" disabled={!commentText.trim()} onClick={e=>{e.stopPropagation();post();}}>Post</Btn>
          </div>
          {onRemove&&<div style={{marginTop:6,paddingTop:6,borderTop:`1px solid ${C.line}`,display:"flex",justifyContent:"flex-end"}}><Btn size="sm" variant="danger" onClick={()=>onRemove(action.id)}>Remove</Btn></div>}
        </div>
      )}
    </div>
  );
}

// ── Risk Trend History ─────────────────────────────────────────
function TrendHistory({item,onAddReview,currentUser}){
  const [show,setShow]=useState(false);
  const [note,setNote]=useState("");
  const [trend,setTrend]=useState("stable");
  const history=(item.history||[]).slice().reverse();
  return(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <FL style={{marginBottom:0}}>Review history</FL>
        <button onClick={()=>setShow(!show)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:11,color:C.blue,padding:0}}>
          {show?"Hide":"Show all"} ({history.length})
        </button>
        <span style={{flex:1}}/>
        <span style={{fontSize:10,color:C.subtle}}>Last reviewed: {fmtRel(item.lastReviewedAt||item.createdAt)}</span>
        {daysSince(item.lastReviewedAt||item.createdAt)>7&&<Tag c={C.red} b={C.redBg}>⏰ Needs review</Tag>}
      </div>

      {/* Latest entry preview */}
      {history.length>0&&(
        <div style={{display:"flex",gap:8,padding:"7px 10px",background:C.bg,borderRadius:6,border:`1px solid ${C.line}`,marginBottom:6}}>
          <span style={{fontSize:13,flexShrink:0}}>{TREND[history[0].trend]?.icon||"🟡"}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:1}}>{history[0].author} · {fmtD(history[0].ts)}</div>
            <div style={{fontSize:12,color:C.ink}}>{history[0].note}</div>
          </div>
        </div>
      )}

      {/* Full history */}
      {show&&history.length>1&&(
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
          {history.slice(1).map(h=>(
            <div key={h.id} style={{display:"flex",gap:8,padding:"5px 10px",background:C.bg,borderRadius:5,opacity:0.7,borderLeft:`3px solid ${TREND[h.trend]?.fg||C.muted}`}}>
              <span style={{fontSize:12,flexShrink:0}}>{TREND[h.trend]?.icon||"🟡"}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,color:C.muted}}>{h.author} · {fmtD(h.ts)}</div>
                <div style={{fontSize:11,color:C.muted}}>{h.note}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add review */}
      {!show?(
        <button onClick={()=>setShow(true)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:11,color:C.blue,padding:"2px 0",display:"flex",alignItems:"center",gap:4}}>
          + Add review note
        </button>
      ):(
        <div style={{padding:"10px 12px",background:C.bg,border:`1px dashed ${C.lineS}`,borderRadius:7}}>
          <FL>Add review note</FL>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            {Object.entries(TREND).map(([k,v])=>(
              <button key={k} onClick={()=>setTrend(k)} style={{flex:1,padding:"5px 8px",borderRadius:6,border:`1.5px solid ${trend===k?v.fg:C.lineS}`,background:trend===k?v.bg:C.surface,fontFamily:F,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4,fontWeight:trend===k?600:400,color:trend===k?v.fg:C.muted}}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="What's the current status? Any changes since last review?"
            style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.lineS}`,borderRadius:6,fontFamily:F,fontSize:12,outline:"none",resize:"none",background:C.surface,boxSizing:"border-box",marginBottom:6}}/>
          <div style={{display:"flex",gap:5}}>
            <Btn variant="primary" size="sm" disabled={!note.trim()} onClick={()=>{if(!note.trim())return;onAddReview({...item,trend,lastReviewedAt:new Date().toISOString(),history:[...(item.history||[]),{id:uid(),ts:new Date().toISOString(),author:currentUser,note:note.trim(),trend}]});setNote("");setShow(false);}}>Save review</Btn>
            <Btn size="sm" onClick={()=>{setNote("");setShow(false);}}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add RAID Form ──────────────────────────────────────────────
function AddRAIDForm({onSave,onCancel,currentUser}){
  const [type,setType]=useState("Risk");
  const [title,setTitle]=useState("");
  const [likelihood,setLikelihood]=useState("Medium");
  const [impact,setImpact]=useState("High");
  const [owner,setOwner]=useState(currentUser);
  const [mitigationPlan,setMitigationPlan]=useState("");
  const [severity,setSeverity]=useState("Medium");
  const [validationDeadline,setValidationDeadline]=useState("");
  const [dependsOn,setDependsOn]=useState("");
  const [blockedUntil,setBlockedUntil]=useState("");
  const level=rl(likelihood,impact);
  const valid=title.trim().length>4;
  const save=()=>{
    const base={id:uid(),type,title:title.trim(),owner,status:"PendingApproval",createdBy:currentUser,mitigationActions:[],trend:"stable",lastReviewedAt:new Date().toISOString(),createdAt:new Date().toISOString(),history:[{id:uid(),ts:new Date().toISOString(),author:currentUser,note:"Risk identified and submitted for owner review.",trend:"stable"}]};
    if(type==="Risk")Object.assign(base,{likelihood,impact,mitigationPlan:mitigationPlan.trim()||null,escalateToBoD:impact==="High"});
    if(type==="Assumption")Object.assign(base,{validationDeadline:validationDeadline||null,validationOwner:owner,validated:false});
    if(type==="Issue")Object.assign(base,{severity,raisedAt:new Date().toISOString()});
    if(type==="Dependency")Object.assign(base,{dependsOn:dependsOn.trim()||null,blockedUntil:blockedUntil||null});
    onSave(base);
  };
  return(
    <div style={{background:C.surface,border:`1.5px solid ${C.lineS}`,borderRadius:10,padding:16,marginBottom:8}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:12}}>Add RAID item</div>
      <div style={{display:"flex",gap:3,marginBottom:12,padding:3,background:C.bg,borderRadius:8}}>
        {Object.entries(RTYPE).map(([k,v])=>(
          <button key={k} onClick={()=>setType(k)} style={{flex:1,padding:"6px 4px",borderRadius:6,border:"none",background:type===k?C.surface:"transparent",fontFamily:F,fontSize:10,color:type===k?v.fg:C.muted,fontWeight:type===k?600:400,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,boxShadow:type===k?"0 1px 3px rgba(0,0,0,0.07)":"none"}}>
            <span style={{fontSize:14}}>{v.icon}</span><span>{k}</span>
          </button>
        ))}
      </div>
      <div style={{marginBottom:10}}>
        <FL>Describe the {type.toLowerCase()}</FL>
        <textarea value={title} onChange={e=>setTitle(e.target.value)} rows={2} placeholder={`${RTYPE[type].desc}…`} style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.lineS}`,borderRadius:7,fontFamily:F,fontSize:12,outline:"none",resize:"vertical",boxSizing:"border-box",background:C.surface}}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <div style={{flex:1}}><FL>Owner</FL><Sel value={owner} onChange={setOwner}>{TEAM.map(t=><option key={t}>{t}</option>)}</Sel></div>
        {type==="Issue"&&<div style={{flex:1}}><FL>Severity</FL><Sel value={severity} onChange={setSeverity}>{["High","Medium","Low"].map(s=><option key={s}>{s}</option>)}</Sel></div>}
        {type==="Assumption"&&<div style={{flex:1}}><FL>Validate by</FL><Inp type="date" value={validationDeadline} onChange={setValidationDeadline}/></div>}
        {type==="Dependency"&&<div style={{flex:1}}><FL>Blocked until</FL><Inp type="date" value={blockedUntil} onChange={setBlockedUntil}/></div>}
      </div>
      {type==="Risk"&&(
        <div style={{display:"flex",gap:14,marginBottom:10,flexWrap:"wrap"}}>
          <RiskMatrix likelihood={likelihood} impact={impact} onSelect={(l,i)=>{setLikelihood(l);setImpact(i);}}/>
          <div style={{flex:1,minWidth:120}}>
            <div style={{padding:"8px 10px",borderRadius:7,border:`1.5px solid ${lc(level).border}`,background:lc(level).bg,marginBottom:8}}>
              <div style={{fontSize:12,color:lc(level).fg,fontWeight:700}}>{level} risk</div>
              <div style={{fontSize:10,color:lc(level).fg,opacity:0.8}}>{likelihood} likelihood · {impact} impact</div>
            </div>
            {impact==="High"&&<Tag c={C.red} b={C.redBg}>⬆ Will be flagged for BoD</Tag>}
          </div>
        </div>
      )}
      {type==="Risk"&&<div style={{marginBottom:10}}><FL>Mitigation plan (optional)</FL><textarea value={mitigationPlan} onChange={e=>setMitigationPlan(e.target.value)} rows={2} placeholder="How to prevent or reduce…" style={{width:"100%",padding:"8px 10px",border:`1px solid ${C.lineS}`,borderRadius:7,fontFamily:F,fontSize:12,outline:"none",resize:"vertical",boxSizing:"border-box",background:C.surface}}/></div>}
      {type==="Dependency"&&<div style={{marginBottom:10}}><FL>Depends on what?</FL><Inp value={dependsOn} onChange={setDependsOn} placeholder="e.g. HIO BRA acknowledgment, BoD approval…"/></div>}
      <div style={{display:"flex",gap:6,justifyContent:"flex-end",paddingTop:8,borderTop:`1px solid ${C.line}`}}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" disabled={!valid} onClick={save}>Submit for owner review →</Btn>
      </div>
    </div>
  );
}

// ── RAID Item Card ─────────────────────────────────────────────
function RAIDCard({item,onUpdate,onDelete,isOwner,currentUser}){
  const [expanded,setExpanded]=useState(false);
  const [showAddAction,setShowAddAction]=useState(false);
  const [showReject,setShowReject]=useState(false);
  const [rejectNote,setRejectNote]=useState("");
  const [newAction,setNewAction]=useState({name:"",pic:currentUser,due:""});
  const tc=RTYPE[item.type];
  const level=item.type==="Risk"?rl(item.likelihood,item.impact):null;
  const cfg=level?lc(level):null;
  const trend=item.trend?TREND[item.trend]:null;
  const allActions=item.mitigationActions||[];
  const openActions=allActions.filter(a=>a.status!=="Done");
  const doneActions=allActions.filter(a=>a.status==="Done");
  const needsReview=daysSince(item.lastReviewedAt||item.createdAt)>7;
  const updateAction=updated=>onUpdate({...item,mitigationActions:allActions.map(a=>a.id===updated.id?updated:a)});
  const removeAction=id=>onUpdate({...item,mitigationActions:allActions.filter(a=>a.id!==id)});
  const addAction=()=>{if(!newAction.name.trim())return;onUpdate({...item,mitigationActions:[...allActions,{id:uid(),name:newAction.name.trim(),pic:newAction.pic,due:newAction.due||null,status:"Open",comments:[]}]});setNewAction({name:"",pic:currentUser,due:""});setShowAddAction(false);};
  return(
    <div style={{border:`1.5px solid ${expanded?(cfg?.border||C.lineS):C.line}`,borderRadius:10,marginBottom:8,background:C.surface,overflow:"hidden"}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"11px 14px",cursor:"pointer"}}>
        <span style={{fontSize:16,marginTop:1,flexShrink:0}}>{tc.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,color:C.ink,marginBottom:4,lineHeight:1.4}}>{item.title}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
            {level&&<Tag c={cfg.fg} b={cfg.bg}>{level}</Tag>}
            <Tag c={tc.fg} b={tc.bg}>{item.type}</Tag>
            {item.status==="PendingApproval"&&<Tag c={C.amber} b={C.amberBg}>⏳ Pending</Tag>}
            {item.status==="Draft"&&<Tag c={C.muted} b="#EDEBE4">Draft</Tag>}
            {item.escalateToBoD&&<Tag c={C.red} b={C.redBg}>⬆ BoD</Tag>}
            {item.type==="Assumption"&&!item.validated&&<Tag c={C.amber} b={C.amberBg}>⚠ Not validated</Tag>}
            {item.type==="Issue"&&item.severity&&<Tag c={item.severity==="High"?C.red:C.amber} b={item.severity==="High"?C.redBg:C.amberBg}>{item.severity}</Tag>}
            {item.type==="Dependency"&&<Tag c={C.purple} b={C.purpleBg}>Blocked until {fmtD(item.blockedUntil)}</Tag>}
            {trend&&<span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,padding:"1px 6px",borderRadius:4,background:trend.bg,color:trend.fg,fontWeight:600}}>{trend.icon} {trend.label}</span>}
            {needsReview&&<Tag c={C.red} b={C.redBg}>⏰ Needs review</Tag>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {allActions.length>0&&<span style={{fontSize:11,color:openActions.length>0?C.amber:C.green,fontWeight:500}}>{openActions.length>0?`${openActions.length} open`:` ✓ all done`}</span>}
          <span style={{fontSize:11,color:C.muted}}>@{item.owner}</span>
          <span style={{color:C.muted,fontSize:12}}>{expanded?"▲":"▼"}</span>
        </div>
      </div>
      {expanded&&(
        <div style={{borderTop:`1px solid ${C.line}`,padding:"12px 14px",background:C.bg}}>
          {/* Pending approval */}
          {item.status==="PendingApproval"&&isOwner&&(
            <div style={{padding:"10px 12px",background:C.amberBg,border:"1px solid #F0D490",borderRadius:8,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:C.amber,marginBottom:6}}>⏳ Awaiting your approval — submitted by {item.createdBy}</div>
              {!showReject?<div style={{display:"flex",gap:6}}><Btn variant="approve" size="sm" onClick={()=>onUpdate({...item,status:"Active",approvedBy:currentUser,approvedAt:new Date().toISOString()})}>✓ Approve & activate</Btn><Btn variant="danger" size="sm" onClick={()=>setShowReject(true)}>✕ Reject</Btn></div>
              :<div><Inp value={rejectNote} onChange={setRejectNote} placeholder="Rejection note…" style={{marginBottom:6}}/><Btn variant="danger" size="sm" onClick={()=>{onUpdate({...item,status:"Draft",rejectNote:rejectNote||null});setShowReject(false);}}>Confirm reject</Btn><Btn size="sm" onClick={()=>setShowReject(false)} style={{marginLeft:6}}>Cancel</Btn></div>}
            </div>
          )}
          {/* Type details */}
          {item.type==="Risk"&&(
            <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",alignItems:"flex-start"}}>
              <RiskMatrix likelihood={item.likelihood} impact={item.impact} compact/>
              <div style={{flex:1,minWidth:100}}>
                {item.mitigationPlan&&<div style={{fontSize:12,color:C.ink,lineHeight:1.6,padding:"7px 10px",background:C.surface,borderRadius:6,border:`1px solid ${C.line}`,marginBottom:6}}>{item.mitigationPlan}</div>}
                <div style={{fontSize:11,color:C.muted,display:"flex",gap:10}}><span>{item.likelihood} likelihood</span><span>{item.impact} impact</span><span style={{color:cfg.fg,fontWeight:600}}>{level}</span></div>
              </div>
            </div>
          )}
          {item.type==="Assumption"&&<div style={{marginBottom:12,padding:"8px 12px",background:C.blueBg,borderRadius:6,fontSize:12,color:C.blue}}>Validate by: <strong>{fmtD(item.validationDeadline)}</strong> · Owner: <strong>{item.validationOwner}</strong>{!item.validated&&<span style={{marginLeft:8,color:C.amber,fontWeight:500}}>⚠ Not yet validated</span>}</div>}
          {item.type==="Issue"&&item.raisedAt&&<div style={{marginBottom:12,fontSize:11,color:C.muted}}>Raised: {fmtD(item.raisedAt)}</div>}
          {item.type==="Dependency"&&<div style={{marginBottom:12,padding:"8px 12px",background:C.purpleBg,borderRadius:6,fontSize:12,color:C.purple}}>Depends on: <strong>{item.dependsOn}</strong> · Blocked until: <strong>{fmtD(item.blockedUntil)}</strong></div>}

          {/* TREND HISTORY — new */}
          <TrendHistory item={item} onAddReview={onUpdate} currentUser={currentUser}/>

          {/* Mitigation actions */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <FL style={{marginBottom:0}}>Actions to minimise / resolve</FL>
              {allActions.length>0&&<><div style={{flex:1,height:4,background:C.line,borderRadius:999,overflow:"hidden",maxWidth:80}}><div style={{height:"100%",width:`${Math.round(doneActions.length/allActions.length*100)}%`,background:C.green}}/></div><span style={{fontSize:10,color:C.muted}}>{doneActions.length}/{allActions.length}</span></>}
            </div>
            {allActions.length===0&&!showAddAction&&<div style={{fontSize:11,color:C.subtle,fontStyle:"italic",marginBottom:8}}>No actions yet. Add specific steps to address this {item.type.toLowerCase()}.</div>}
            {allActions.map(a=><MitigationActionRow key={a.id} action={a} onUpdate={updateAction} onRemove={removeAction} currentUser={currentUser}/>)}
            {showAddAction?(
              <div style={{padding:"10px 12px",background:C.bg,borderRadius:7,border:`1px dashed ${C.lineS}`}}>
                <FL>New mitigation action</FL>
                <div style={{marginBottom:6}}><Inp value={newAction.name} onChange={v=>setNewAction({...newAction,name:v})} placeholder="What needs to be done?"/></div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  <div style={{flex:1}}><Sel value={newAction.pic} onChange={v=>setNewAction({...newAction,pic:v})}>{TEAM.map(t=><option key={t}>{t}</option>)}</Sel></div>
                  <div style={{flex:1}}><Inp type="date" value={newAction.due} onChange={v=>setNewAction({...newAction,due:v})}/></div>
                </div>
                <div style={{display:"flex",gap:5}}><Btn variant="primary" size="sm" disabled={!newAction.name.trim()} onClick={addAction}>Add action</Btn><Btn size="sm" onClick={()=>setShowAddAction(false)}>Cancel</Btn></div>
              </div>
            ):(
              <button onClick={()=>setShowAddAction(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",border:`1px dashed ${C.lineS}`,borderRadius:6,background:"transparent",color:C.muted,fontFamily:F,fontSize:11,cursor:"pointer",width:"100%",justifyContent:"center"}}>+ Add action</button>
            )}
          </div>
          {/* Status transitions */}
          <div style={{display:"flex",gap:5,paddingTop:10,marginTop:10,borderTop:`1px solid ${C.line}`,flexWrap:"wrap"}}>
            {item.status==="Active"&&item.type==="Risk"&&<><Btn size="sm" onClick={()=>onUpdate({...item,status:"Mitigating"})}>→ Mitigating</Btn><Btn size="sm" onClick={()=>onUpdate({...item,status:"Accepted"})}>Accept risk</Btn></>}
            {item.status==="Active"&&item.type==="Issue"&&<Btn size="sm" onClick={()=>onUpdate({...item,status:"Resolved"})}>→ Mark resolved</Btn>}
            {item.status==="Active"&&item.type==="Assumption"&&<Btn variant="approve" size="sm" onClick={()=>onUpdate({...item,validated:true})}>✓ Mark validated</Btn>}
            {["Active","Mitigating","Resolved"].includes(item.status)&&<Btn variant="approve" size="sm" onClick={()=>onUpdate({...item,status:"Closed"})}>✓ Close</Btn>}
            <Btn size="sm" variant="danger" onClick={()=>onDelete(item.id)} style={{marginLeft:"auto"}}>Delete</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RAID Program View ──────────────────────────────────────────
function RAIDProgramView({data,onUpdate,onNavigateTask}){
  const [selectedPg,setSelectedPg]=useState("pg1");
  const [typeFilter,setTypeFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("Active");
  const [showForm,setShowForm]=useState(false);
  const pg=data.programs.find(p=>p.id===selectedPg);
  const counts=(pg.raid||[]).reduce((a,r)=>{a[r.type]=(a[r.type]||0)+1;if(r.status==="PendingApproval")a._pend=(a._pend||0)+1;if(r.escalateToBoD&&["Active","Mitigating"].includes(r.status))a._bod=(a._bod||0)+1;return a},{});
  const filtered=(pg.raid||[]).filter(item=>{
    if(item.status==="Draft"&&item.createdBy!==ME)return false;
    const typeOk=typeFilter==="All"||item.type===typeFilter;
    const statusOk=statusFilter==="All"||(statusFilter==="Active"?["Active","PendingApproval","Mitigating","Draft"].includes(item.status):item.status===statusFilter);
    return typeOk&&statusOk;
  });
  const updateItem=updated=>onUpdate(selectedPg,updated);
  const deleteItem=id=>onUpdate(selectedPg,null,id);
  const addItem=item=>{onUpdate(selectedPg,item);setShowForm(false);};
  const pgTasks=data.tasks.filter(t=>t.programId===selectedPg);
  const activeRisks=(pg.raid||[]).filter(r=>r.type==="Risk"&&["Active","Mitigating"].includes(r.status));
  const rLevels=activeRisks.reduce((a,r)=>{const l=rl(r.likelihood,r.impact);a[l]=(a[l]||0)+1;return a},{});

  return(
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:170,flexShrink:0,borderRight:`1px solid ${C.line}`,background:C.surface,overflowY:"auto",padding:"12px 0"}}>
        <div style={{padding:"0 12px",marginBottom:8,fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>Programs</div>
        {data.programs.map(p=>{
          const aR=(p.raid||[]).filter(r=>r.type==="Risk"&&["Active","Mitigating"].includes(r.status));
          const topL=["Critical","High","Medium","Low"].find(l=>aR.some(r=>rl(r.likelihood,r.impact)===l));
          const pend=(p.raid||[]).filter(r=>r.status==="PendingApproval").length;
          const needs=(p.raid||[]).filter(r=>daysSince(r.lastReviewedAt||r.createdAt)>7&&["Active","Mitigating"].includes(r.status)).length;
          return(
            <button key={p.id} onClick={()=>setSelectedPg(p.id)} style={{width:"100%",padding:"8px 12px",border:"none",background:selectedPg===p.id?C.bg:"transparent",fontFamily:F,fontSize:12,color:selectedPg===p.id?C.ink:C.muted,fontWeight:selectedPg===p.id?600:400,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:6,borderRight:selectedPg===p.id?`2px solid ${C.ink}`:"2px solid transparent"}}>
              <span style={{flex:1}}>{p.name}</span>
              {topL&&<span style={{width:7,height:7,borderRadius:"50%",background:lc(topL).dot}}/>}
              {pend>0&&<Tag c={C.amber} b={C.amberBg} style={{fontSize:9,padding:"0 4px"}}>{pend}</Tag>}
              {needs>0&&!pend&&<Tag c={C.red} b={C.redBg} style={{fontSize:9,padding:"0 4px"}}>⏰</Tag>}
            </button>
          );
        })}
      </div>

      {/* Main */}
      <div style={{flex:1,overflowY:"auto",padding:"20px 20px 40px"}}>
        <div style={{maxWidth:800}}>
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{pg.name} — RAID Register</h2>
              {counts._pend>0&&<Tag c={C.amber} b={C.amberBg}>⏳ {counts._pend} pending</Tag>}
              {counts._bod>0&&<Tag c={C.red} b={C.redBg}>⬆ {counts._bod} → BoD</Tag>}
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>{pg.description}</div>
            {/* Risk summary strip */}
            {activeRisks.length>0&&(
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["Critical","High","Medium","Low"].map(l=>rLevels[l]&&<span key={l} style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,padding:"3px 9px",borderRadius:4,background:lc(l).bg,color:lc(l).fg,fontWeight:600}}><span style={{width:7,height:7,borderRadius:"50%",background:lc(l).dot}}/>{rLevels[l]} {l}</span>)}
                {(pg.raid||[]).filter(r=>r.type==="Issue"&&r.status==="Active").length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:4,background:C.amberBg,color:C.amber,fontWeight:600}}>🔥 {(pg.raid||[]).filter(r=>r.type==="Issue"&&r.status==="Active").length} open</span>}
                {(pg.raid||[]).filter(r=>r.type==="Assumption"&&!r.validated).length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:4,background:C.blueBg,color:C.blue,fontWeight:600}}>💡 {(pg.raid||[]).filter(r=>r.type==="Assumption"&&!r.validated).length} unvalidated</span>}
                {(pg.raid||[]).filter(r=>daysSince(r.lastReviewedAt||r.createdAt)>7&&["Active","Mitigating"].includes(r.status)).length>0&&<span style={{fontSize:11,padding:"3px 9px",borderRadius:4,background:C.redBg,color:C.red,fontWeight:600}}>⏰ {(pg.raid||[]).filter(r=>daysSince(r.lastReviewedAt||r.createdAt)>7&&["Active","Mitigating"].includes(r.status)).length} needs review</span>}
              </div>
            )}
          </div>

          {/* Filters */}
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            <div style={{display:"flex",gap:2,padding:3,background:C.bg,borderRadius:7}}>
              {["All",...Object.keys(RTYPE)].map(t=>(
                <button key={t} onClick={()=>setTypeFilter(t)} style={{padding:"4px 9px",borderRadius:5,border:"none",background:typeFilter===t?C.surface:"transparent",fontFamily:F,fontSize:11,color:typeFilter===t?C.ink:C.muted,fontWeight:typeFilter===t?600:400,cursor:"pointer",display:"flex",alignItems:"center",gap:3,boxShadow:typeFilter===t?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
                  {t!=="All"&&RTYPE[t].icon}{t}{t!=="All"&&counts[t]>0&&<span style={{fontSize:9,background:RTYPE[t].bg,color:RTYPE[t].fg,borderRadius:999,padding:"0 4px"}}>{counts[t]}</span>}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:2,padding:3,background:C.bg,borderRadius:7}}>
              {["Active","Closed","All"].map(s=><button key={s} onClick={()=>setStatusFilter(s)} style={{padding:"4px 9px",borderRadius:5,border:"none",background:statusFilter===s?C.surface:"transparent",fontFamily:F,fontSize:11,color:statusFilter===s?C.ink:C.muted,fontWeight:statusFilter===s?600:400,cursor:"pointer",boxShadow:statusFilter===s?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>{s}</button>)}
            </div>
            <span style={{flex:1}}/>
            <Btn variant="primary" size="sm" onClick={()=>setShowForm(true)}>+ Add RAID item</Btn>
          </div>

          {showForm&&<AddRAIDForm onSave={addItem} onCancel={()=>setShowForm(false)} currentUser={ME}/>}

          {filtered.length===0&&!showForm&&(
            <div style={{padding:"32px 20px",textAlign:"center",color:C.subtle,fontSize:12,fontStyle:"italic"}}>
              No {typeFilter==="All"?"RAID items":typeFilter.toLowerCase()+"s"} for {pg.name}. Click "+ Add RAID item" to start.
            </div>
          )}

          {filtered.map(item=><RAIDCard key={item.id} item={item} onUpdate={updateItem} onDelete={deleteItem} isOwner={IS_OWNER} currentUser={ME}/>)}
        </div>
      </div>
    </div>
  );
}

// ── Task Detail — Program Risk Signal ─────────────────────────
function TaskDetailWithRisks({data,onNavigateRaid}){
  const [selectedTask,setSelectedTask]=useState(0);
  const task=data.tasks[selectedTask];
  const pg=data.programs.find(p=>p.id===task.programId);
  const activeRaids=(pg?.raid||[]).filter(r=>["Active","Mitigating"].includes(r.status));
  const activeRisks=activeRaids.filter(r=>r.type==="Risk");
  const openIssues=activeRaids.filter(r=>r.type==="Issue");
  const topLevel=["Critical","High","Medium","Low"].find(l=>activeRisks.some(r=>rl(r.likelihood,r.impact)===l));
  const escalating=activeRisks.filter(r=>r.trend==="escalating");
  return(
    <div style={{overflowY:"auto",padding:"20px 20px 40px"}}>
      <div style={{maxWidth:660,margin:"0 auto"}}>
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",gap:4,marginBottom:12,padding:3,background:C.bg,borderRadius:7}}>
            {data.tasks.map((t,i)=>(
              <button key={t.id} onClick={()=>setSelectedTask(i)} style={{flex:1,padding:"5px 8px",borderRadius:5,border:"none",background:i===selectedTask?C.surface:"transparent",fontFamily:F,fontSize:11,color:i===selectedTask?C.ink:C.muted,fontWeight:i===selectedTask?600:400,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",boxShadow:i===selectedTask?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>
                {t.program}: {t.name.slice(0,16)}{t.name.length>16?"…":""}
              </button>
            ))}
          </div>
        </div>

        {/* Task detail card */}
        <div style={{background:C.surface,border:`1px solid ${C.lineS}`,borderRadius:12,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.line}`}}>
            <div style={{fontSize:11,color:C.subtle,marginBottom:4}}>{task.program} › {task.workstream}</div>
            <div style={{fontSize:15,fontWeight:600,marginBottom:8}}>{task.name}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <Tag c={C.amber} b={C.amberBg}>◐ In Progress</Tag>
              <Tag c={C.red} b={C.redBg}>{task.deadlineType==="hard"?"🔒 Hard":"🎯 Soft"} · {fmtD(task.end)}</Tag>
              <Tag c={C.blue} b={C.blueBg}>👤 {task.pic}</Tag>
            </div>
          </div>
          <div style={{display:"flex",borderBottom:`1px solid ${C.line}`}}>
            {["Actions","Updates","Info"].map(t=><button key={t} style={{padding:"9px 14px",border:"none",background:"none",borderBottom:`2px solid ${"Actions"===t?C.ink:"transparent"}`,cursor:"pointer",fontFamily:F,fontSize:12,fontWeight:"Actions"===t?600:400,color:"Actions"===t?C.ink:C.muted}}>{t}</button>)}
          </div>
          <div style={{padding:"12px 16px",fontSize:12,color:C.subtle,fontStyle:"italic"}}>
            Task actions, updates, info — existing v29 feature.
          </div>
        </div>

        {/* ── PROGRAM RISK SIGNAL (new connection) ── */}
        <div style={{background:C.surface,border:`1.5px solid ${topLevel?lc(topLevel).border:C.line}`,borderRadius:10,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",background:topLevel?lc(topLevel).bg:C.bg,borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,fontWeight:600,color:topLevel?lc(topLevel).fg:C.muted}}>
              {activeRaids.length>0?`⚠ ${activeRaids.length} active RAID item${activeRaids.length>1?"s":""} in ${pg?.name}`:`✓ No active risks in ${pg?.name}`}
            </span>
            <span style={{flex:1}}/>
            <button onClick={()=>onNavigateRaid(task.programId)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:11,color:C.blue,fontWeight:500}}>View all → </button>
          </div>
          {activeRaids.length>0&&(
            <div style={{padding:"8px 14px"}}>
              {escalating.length>0&&(
                <div style={{padding:"6px 10px",background:C.redBg,borderRadius:6,marginBottom:8,fontSize:11,color:C.red,fontWeight:500}}>
                  🔴 {escalating.length} risk{escalating.length>1?"s":""} escalating: {escalating.map(r=>r.title.slice(0,40)+(r.title.length>40?"…":"")).join(" · ")}
                </div>
              )}
              {activeRisks.slice(0,3).map(r=>{
                const lvl=rl(r.likelihood,r.impact),cfg=lc(lvl),tc2=TREND[r.trend];
                return(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.line}`,fontSize:12}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:cfg.dot,flexShrink:0}}/>
                    <span style={{flex:1,color:C.ink}}>{r.title.slice(0,60)}{r.title.length>60?"…":""}</span>
                    <Tag c={cfg.fg} b={cfg.bg}>{lvl}</Tag>
                    {tc2&&<span style={{fontSize:10,color:tc2.fg}}>{tc2.icon}</span>}
                  </div>
                );
              })}
              {openIssues.length>0&&(
                <div style={{padding:"5px 0",fontSize:11,color:C.amber}}>🔥 {openIssues.length} open issue{openIssues.length>1?"s":""} in this program</div>
              )}
              {activeRisks.length>3&&<div style={{fontSize:11,color:C.muted,paddingTop:4}}>+{activeRisks.length-3} more risks — <button onClick={()=>onNavigateRaid(task.programId)} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:11,color:C.blue,padding:0}}>view all</button></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── My Work Risks Section ──────────────────────────────────────
function MyWorkView({data,onNavigateRaid}){
  const myItems=useMemo(()=>{
    return data.programs.flatMap(pg=>(pg.raid||[]).filter(r=>{
      if(r.status==="Draft")return r.createdBy===ME;
      if(["Closed","Accepted","Resolved"].includes(r.status))return false;
      return r.owner===ME||(IS_OWNER&&r.status==="PendingApproval");
    }).map(r=>({...r,program:pg})));
  },[data]);

  const pending=myItems.filter(r=>r.status==="PendingApproval");
  const escalating=myItems.filter(r=>r.trend==="escalating"&&r.status!=="PendingApproval");
  const needsReview=myItems.filter(r=>daysSince(r.lastReviewedAt||r.createdAt)>7&&["Active","Mitigating"].includes(r.status));
  const overdueActions=data.programs.flatMap(pg=>(pg.raid||[]).flatMap(r=>(r.mitigationActions||[]).filter(a=>a.pic===ME&&a.status==="Open"&&isOver(a.due)).map(a=>({action:a,item:r,program:pg}))));
  const dueThisWeek=data.programs.flatMap(pg=>(pg.raid||[]).flatMap(r=>(r.mitigationActions||[]).filter(a=>a.pic===ME&&a.status==="Open"&&a.due&&new Date(a.due)<=new Date("2026-05-15")&&!isOver(a.due)).map(a=>({action:a,item:r,program:pg}))));
  const hasAttention=pending.length>0||escalating.length>0||overdueActions.length>0||needsReview.length>0;

  const Block=({title,children,accent})=>(
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:600,color:accent||C.muted,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>{title}</div>
      {children}
    </div>
  );

  const MiniRiskCard=({item})=>{
    const tc=RTYPE[item.type];const lvl=item.type==="Risk"?rl(item.likelihood,item.impact):null;const cfg=lvl?lc(lvl):null;const tr=item.trend?TREND[item.trend]:null;
    return(
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",border:`1px solid ${C.line}`,borderRadius:8,marginBottom:5,background:C.surface,cursor:"pointer"}} onClick={()=>onNavigateRaid(item.program.id)}>
        <span style={{fontSize:14}}>{tc.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:500,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
          <div style={{fontSize:10,color:C.muted}}>{item.program.name} · @{item.owner}</div>
        </div>
        {lvl&&<Tag c={cfg.fg} b={cfg.bg}>{lvl}</Tag>}
        {item.status==="PendingApproval"&&<Tag c={C.amber} b={C.amberBg}>⏳ Approve</Tag>}
        {tr&&item.status!=="PendingApproval"&&<span style={{fontSize:12}}>{tr.icon}</span>}
        {daysSince(item.lastReviewedAt||item.createdAt)>7&&item.status==="Active"&&<Tag c={C.red} b={C.redBg}>⏰ Review</Tag>}
        <span style={{fontSize:10,color:C.blue,flexShrink:0}}>→</span>
      </div>
    );
  };

  return(
    <div style={{overflowY:"auto",padding:"20px 20px 40px"}}>
      <div style={{maxWidth:760,margin:"0 auto"}}>
        <div style={{marginBottom:20}}>
          <h1 style={{margin:0,fontSize:20,fontWeight:700}}>My Work</h1>
          <div style={{fontSize:12,color:C.muted,marginTop:3}}>{ME} · 8 May 2026</div>
        </div>

        {/* Needs attention (aggregated) */}
        <div style={{background:C.surface,border:`1.5px solid ${hasAttention?C.lineS:C.line}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",background:hasAttention?"#FFF8F8":C.bg,borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:14}}>🔴</span>
            <span style={{fontSize:13,fontWeight:600}}>RAID items needing my attention</span>
            {hasAttention&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:C.redBg,color:C.red,fontWeight:700}}>{pending.length+escalating.length+overdueActions.length+needsReview.length}</span>}
            <span style={{flex:1}}/>
          </div>
          <div style={{padding:"10px 16px 14px"}}>
            {!hasAttention&&<div style={{fontSize:12,color:C.subtle,fontStyle:"italic"}}>All clear — no RAID items need immediate attention.</div>}

            {pending.length>0&&<Block title={`⏳ Pending your approval (${pending.length})`} accent={C.amber}>
              {pending.map(item=><MiniRiskCard key={item.id} item={item}/>)}
            </Block>}

            {escalating.length>0&&<Block title={`🔴 Escalating risks I own (${escalating.length})`} accent={C.red}>
              {escalating.map(item=><MiniRiskCard key={item.id} item={item}/>)}
            </Block>}

            {overdueActions.length>0&&<Block title={`⚠ Overdue mitigation actions (${overdueActions.length})`} accent={C.red}>
              {overdueActions.map(({action,item,program})=>(
                <div key={action.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",border:`1px solid #F5C8C8`,borderRadius:7,background:C.redBg,marginBottom:5,fontSize:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500,color:C.red}}>{action.name}</div>
                    <div style={{fontSize:10,color:C.red,opacity:0.8}}>In: {item.title.slice(0,40)} · {program.name} · was due {fmtD(action.due)}</div>
                  </div>
                  <Btn variant="approve" size="sm" style={{flexShrink:0}}>✓ Done</Btn>
                </div>
              ))}
            </Block>}

            {needsReview.length>0&&<Block title={`⏰ Risks not reviewed in >7 days (${needsReview.length})`} accent={C.amber}>
              {needsReview.map(item=><MiniRiskCard key={item.id} item={item}/>)}
            </Block>}
          </div>
        </div>

        {/* All my RAID items */}
        <div style={{background:C.surface,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden",marginBottom:10}}>
          <div style={{padding:"12px 16px",background:C.bg,borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:14}}>⚠</span>
            <span style={{fontSize:13,fontWeight:600}}>All RAID items I own</span>
            <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:C.bg,color:C.muted,fontWeight:600}}>{myItems.length}</span>
          </div>
          <div style={{padding:"10px 16px 14px"}}>
            {myItems.length===0&&<div style={{fontSize:12,color:C.subtle,fontStyle:"italic"}}>No active RAID items assigned to you.</div>}
            {myItems.map(item=><MiniRiskCard key={item.id} item={item}/>)}
          </div>
        </div>

        {/* Due this week */}
        {dueThisWeek.length>0&&(
          <div style={{background:C.surface,border:`1px solid ${C.line}`,borderRadius:10,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",background:C.bg,borderBottom:`1px solid ${C.line}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:14}}>📅</span>
              <span style={{fontSize:13,fontWeight:600}}>Mitigation actions due this week</span>
              <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:C.amberBg,color:C.amber,fontWeight:600}}>{dueThisWeek.length}</span>
            </div>
            <div style={{padding:"10px 16px 14px"}}>
              {dueThisWeek.map(({action,item,program})=>(
                <div key={action.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",border:`1px solid ${C.line}`,borderRadius:7,background:C.surface,marginBottom:5,fontSize:12}}>
                  <div style={{width:14,height:14,border:`1.5px solid ${C.lineS}`,borderRadius:3}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500,color:C.ink}}>{action.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>{item.title.slice(0,40)} · {program.name} · due {fmtD(action.due)}</div>
                  </div>
                  <Btn variant="approve" size="sm">✓ Done</Btn>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{margin:"16px 0 0",padding:"10px 14px",background:C.surface,border:`1px solid ${C.line}`,borderRadius:8,color:C.subtle,fontSize:12,fontStyle:"italic"}}>
          … other My Work sections (tasks, action steps, mentions, decisions) appear here …
        </div>
      </div>
    </div>
  );
}

// ── Portfolio ──────────────────────────────────────────────────
function PortfolioView({data}){
  const all=data.programs.flatMap(p=>(p.raid||[]).filter(r=>["Active","Mitigating"].includes(r.status)).map(r=>({...r,program:p})));
  const bod=all.filter(r=>r.escalateToBoD&&r.type==="Risk");
  return(
    <div style={{overflowY:"auto",padding:"20px 20px 40px"}}>
      <div style={{maxWidth:880,margin:"0 auto"}}>
        <div style={{marginBottom:16}}><h2 style={{margin:0,fontSize:20,fontWeight:700}}>Portfolio RAID Summary</h2><div style={{fontSize:12,color:C.muted,marginTop:3}}>{all.length} active items · 8 May 2026</div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
          {[{l:"Open Risks",v:all.filter(r=>r.type==="Risk").length,c:C.red,b:C.redBg},{l:"Open Issues",v:all.filter(r=>r.type==="Issue").length,c:C.amber,b:C.amberBg},{l:"Unvalidated",v:all.filter(r=>r.type==="Assumption"&&!r.validated).length,c:C.blue,b:C.blueBg},{l:"Blocked",v:all.filter(r=>r.type==="Dependency").length,c:C.purple,b:C.purpleBg}].map(s=>(
            <div key={s.l} style={{padding:"10px 14px",background:C.surface,border:`1px solid ${C.line}`,borderRadius:9}}><div style={{fontSize:11,color:C.muted,marginBottom:4}}>{s.l}</div><div style={{fontSize:22,fontWeight:700,color:s.v>0?s.c:C.subtle}}>{s.v}</div></div>
          ))}
        </div>
        {bod.length>0&&(
          <div style={{marginBottom:14,padding:"12px 16px",background:C.redBg,border:"1.5px solid #F5C8C8",borderRadius:10}}>
            <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:8}}>⬆ {bod.length} risks flagged for BoD</div>
            {bod.map(r=>{const cfg=lc(rl(r.likelihood,r.impact));const tr=TREND[r.trend];return(
              <div key={r.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(163,45,45,0.12)",alignItems:"center",fontSize:12}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:cfg.dot}}/>
                <span style={{flex:1,color:C.ink}}>{r.title}</span>
                <Tag c={cfg.fg} b={cfg.bg}>{rl(r.likelihood,r.impact)}</Tag>
                {tr&&<span>{tr.icon}</span>}
                <span style={{color:C.muted,fontSize:11}}>{r.program.name} · @{r.owner}</span>
              </div>
            );})}
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {data.programs.map(p=>{
            const pR=(p.raid||[]).filter(r=>["Active","Mitigating"].includes(r.status));
            const rL={Critical:0,High:0,Medium:0,Low:0};pR.filter(r=>r.type==="Risk").forEach(r=>rL[rl(r.likelihood,r.impact)]++);
            const topL=["Critical","High","Medium","Low"].find(l=>rL[l]>0);
            const esc=pR.filter(r=>r.trend==="escalating").length;
            const rev=pR.filter(r=>daysSince(r.lastReviewedAt||r.createdAt)>7).length;
            return(
              <div key={p.id} style={{padding:"12px 14px",background:C.surface,border:`1px solid ${topL?lc(topL).border:C.line}`,borderRadius:9}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:13,fontWeight:600,color:C.pgFg}}>{p.name}</span>
                  {esc>0&&<span style={{fontSize:10,color:C.red}}>🔴 {esc} escalating</span>}
                  {rev>0&&<span style={{fontSize:10,color:C.amber}}>⏰ {rev} stale</span>}
                  {!pR.length&&<span style={{fontSize:10,color:C.green,fontWeight:600}}>✓ Clean</span>}
                </div>
                {pR.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {["Critical","High","Medium","Low"].map(l=>rL[l]>0&&<span key={l} style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:lc(l).bg,color:lc(l).fg,fontWeight:600,display:"inline-flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:"50%",background:lc(l).dot}}/>{rL[l]} {l}</span>)}
                  {pR.filter(r=>r.type==="Issue").length>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:C.amberBg,color:C.amber,fontWeight:600}}>🔥 {pR.filter(r=>r.type==="Issue").length}</span>}
                </div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function App(){
  const [data,setData]=useState(SEED);
  const [view,setView]=useState("raid");
  const [raidPg,setRaidPg]=useState("pg1");
  const [toast,setToast]=useState(null);
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),2000);};

  const updateItem=(pgId,updated,deleteId=null)=>{
    setData(d=>({...d,programs:d.programs.map(p=>{
      if(p.id!==pgId)return p;
      if(deleteId)return{...p,raid:(p.raid||[]).filter(r=>r.id!==deleteId)};
      const exists=(p.raid||[]).some(r=>r.id===updated.id);
      return{...p,raid:exists?(p.raid||[]).map(r=>r.id===updated.id?updated:r):[...(p.raid||[]),updated]};
    })}));
    showToast(deleteId?"Deleted":"Updated");
  };

  const totalPend=data.programs.reduce((s,p)=>s+(p.raid||[]).filter(r=>r.status==="PendingApproval").length,0);
  const totalBoD=data.programs.reduce((s,p)=>s+(p.raid||[]).filter(r=>r.escalateToBoD&&["Active","Mitigating"].includes(r.status)).length,0);
  const totalEsc=data.programs.reduce((s,p)=>s+(p.raid||[]).filter(r=>r.trend==="escalating"&&["Active","Mitigating"].includes(r.status)).length,0);
  const VIEWS=[
    {id:"raid",label:"RAID Register"},
    {id:"task",label:"Task detail → risks"},
    {id:"mywork",label:"My Work (risks)"},
    {id:"portfolio",label:"Portfolio summary"},
  ];

  const navigateToRaid=(pgId)=>{setRaidPg(pgId);setView("raid");};

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F,color:C.ink,display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{background:C.ink,color:"#fff",padding:"6px 16px",fontSize:11,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{background:C.accent,padding:"1px 6px",borderRadius:3,fontWeight:700}}>v30 DEMO</span>
        <span>RAID Register · Trend & history · Task connection · My Work</span>
        <span style={{flex:1}}/>
        {totalPend>0&&<Tag c={C.amber} b={C.amberBg}>⏳ {totalPend} pending</Tag>}
        {totalEsc>0&&<Tag c={C.red} b={C.redBg}>🔴 {totalEsc} escalating</Tag>}
        {totalBoD>0&&<Tag c={C.red} b={C.redBg}>⬆ {totalBoD} BoD</Tag>}
        <span style={{opacity:0.6,marginLeft:4}}>hattt4 (owner)</span>
      </div>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.line}`,padding:"10px 20px",display:"flex",gap:2,flexShrink:0}}>
        {VIEWS.map(v=><button key={v.id} onClick={()=>setView(v.id)} style={{padding:"7px 13px",borderRadius:7,border:"none",background:view===v.id?C.ink:"transparent",color:view===v.id?"#fff":C.muted,fontFamily:F,fontSize:12,fontWeight:view===v.id?600:400,cursor:"pointer"}}>{v.label}</button>)}
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {view==="raid"&&<RAIDProgramView data={{...data,initialPg:raidPg}} onUpdate={updateItem} key={raidPg}/>}
        {view==="task"&&<TaskDetailWithRisks data={data} onNavigateRaid={navigateToRaid}/>}
        {view==="mywork"&&<MyWorkView data={data} onNavigateRaid={navigateToRaid}/>}
        {view==="portfolio"&&<PortfolioView data={data}/>}
      </div>
      {toast&&<div style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",padding:"10px 18px",background:C.ink,color:"#fff",borderRadius:8,fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",zIndex:999,whiteSpace:"nowrap",fontWeight:500}}>{toast}</div>}
    </div>
  );
}
