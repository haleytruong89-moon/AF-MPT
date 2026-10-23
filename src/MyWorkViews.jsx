import React, { useState } from "react";

const C = {
  bg:"#F7F5EF",surface:"#FFFFFF",ink:"#1A1A19",muted:"#6E6C66",subtle:"#95938C",
  line:"rgba(26,26,25,0.10)",lineS:"rgba(26,26,25,0.22)",accent:"#3B6D11",
  green:"#356512",greenBg:"#E6EFD6",amber:"#B7791F",amberBg:"#FAEEDA",
  red:"#A32D2D",redBg:"#FCEBEB",blue:"#0C447C",blueBg:"#E6F1FB",
};
const F = '"IBM Plex Sans",-apple-system,sans-serif';
const TODAY = new Date("2026-05-08");
const fmtD = d => d ? new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"}) : "—";
const fmtRel = ts => { const h=(Date.now()-new Date(ts))/3.6e6; return h<1?`${Math.round(h*60)}m ago`:h<24?`${Math.round(h)}h ago`:`${Math.round(h/24)}d ago`; };
const isOver = d => d && new Date(d) < TODAY;
const inWeek = d => d && new Date(d) >= TODAY && new Date(d) <= new Date("2026-05-15");
const ME = "hattt4";

const PROJECTS = [
  {
    id:"crp", name:"CRP", color:"#0C447C", colorBg:"#E6F1FB",
    tasks:[
      {id:"t1",name:"Submit dissolution resolution to BRA",status:"InProgress",pic:"hattt4",end:"2026-04-30",deadlineType:"hard",program:"LLCs",workstream:"HIO",
       updates:[{id:"u1",author:"An Nguyen",text:"@hattt4 BRA portal requires notarised copy AND board resolution as separate uploads",ts:"2026-05-08T08:00:00Z"}],
       steps:[
         {id:"s1",name:"Prepare & notarise document",pic:"Trangvk",due:"2026-04-28",status:"Done",order:1,comments:[]},
         {id:"s2",name:"Get board sign-off",pic:"hattt4",due:"2026-05-04",status:"Done",order:2,comments:[]},
         {id:"s3",name:"Submit to BRA portal + obtain receipt",pic:"hattt4",due:"2026-05-08",status:"Open",order:3,hasUnread:true,comments:[{id:"c1",author:"An Nguyen",text:"@hattt4 portal requires both docs separately",ts:"2026-05-08T08:00:00Z"}]},
         {id:"s4",name:"Confirm receipt & update tracker",pic:"Trangvk",due:"2026-05-10",status:"Open",order:4,comments:[]},
       ]},
      {id:"t2",name:"Q1 financial close & sign-off",status:"InProgress",pic:"hattt4",end:"2026-05-08",deadlineType:"hard",program:"FINTECH",workstream:"Fintech Co",
       updates:[],
       steps:[
         {id:"s5",name:"Reconcile intercompany balances",pic:"An Nguyen",due:"2026-05-07",status:"Done",order:1,comments:[]},
         {id:"s6",name:"CFO review and sign",pic:"hattt4",due:"2026-05-08",status:"Open",order:2,comments:[{id:"c2",author:"hattt4",text:"@An Nguyen Looks good — signing today",ts:"2026-05-08T09:00:00Z"}]},
       ]},
      {id:"t3",name:"Prepare BoD presentation for May",status:"Planned",pic:"hattt4",end:"2026-05-14",deadlineType:"soft",program:"BOD",workstream:"Business strategy",
       updates:[],
       steps:[
         {id:"s7",name:"Draft slide deck structure",pic:"hattt4",due:"2026-05-10",status:"Open",order:1,comments:[]},
         {id:"s8",name:"Add financial data from Q1 close",pic:"Mai Tran",due:"2026-05-12",status:"Open",order:2,comments:[]},
         {id:"s9",name:"Review & sign off with Chairman",pic:"hattt4",due:"2026-05-13",status:"Open",order:3,comments:[]},
       ]},
      {id:"t4",name:"Review SPV1 entity creation docs",status:"Planned",pic:"hattt4",end:"2026-05-15",deadlineType:"hard",program:"SPVs",workstream:"ManagementCo",
       updates:[{id:"u2",author:"An Nguyen",text:"@hattt4 docs sent to shared drive, please review before Thursday",ts:"2026-05-07T16:00:00Z"}],
       steps:[
         {id:"s10",name:"Review ERC and charter documents",pic:"hattt4",due:"2026-05-13",status:"Open",order:1,comments:[]},
         {id:"s11",name:"Sign and return to legal",pic:"hattt4",due:"2026-05-15",status:"Open",order:2,comments:[]},
       ]},
      {id:"t5",name:"ManagementCo capital contribution wire",status:"InProgress",pic:"hattt4",end:"2026-05-07",deadlineType:"hard",program:"SPVs",workstream:"ManagementCo",
       updates:[],
       steps:[
         {id:"s12",name:"Prepare wire transfer memo",pic:"Mai Tran",due:"2026-05-06",status:"Done",order:1,comments:[]},
         {id:"s13",name:"Resubmit wire with corrected IBAN format",pic:"hattt4",due:"2026-05-09",status:"Open",order:2,comments:[]},
       ]},
    ],
    mentions:[
      {id:"m1",author:"An Nguyen",text:"@hattt4 BRA portal requires notarised copy AND board resolution as separate uploads",ts:"2026-05-08T08:00:00Z",taskName:"Submit dissolution",stepName:"Submit to BRA portal"},
      {id:"m2",author:"Trangvk",text:"@hattt4 please review and sign off on the Q1 close memo",ts:"2026-05-07T16:00:00Z",taskName:"Q1 financial close"},
    ],
    raidAlerts:[
      {id:"r1",title:"BRA processing backlog delays acknowledgment",level:"Critical",trend:"escalating",type:"Risk"},
      {id:"r2",title:"HIO bank account closure delayed",level:"High",trend:"stable",type:"Issue"},
    ],
    actionItems:[
      {id:"a1",name:"Send updated KYC docs to bank",due:"2026-05-08",priority:"High",status:"Open",meetingRef:"BoD 7 May",comments:[{id:"ca1",author:"Trangvk",text:"@hattt4 I already sent the draft docs last week, do you need me to resend?",ts:"2026-05-07T11:00:00Z"}]},
      {id:"a2",name:"Confirm SPV1 director list",due:"2026-05-08",priority:"Medium",status:"Open",meetingRef:"Sync 6 May",comments:[]},
    ],
  },
  {
    id:"ma", name:"MA Project", color:"#4B2D8C", colorBg:"#EEEDFE",
    tasks:[
      {id:"t6",name:"Must-Win Battles (MWB) framework sign-off",status:"InProgress",pic:"hattt4",end:"2026-05-13",deadlineType:"hard",program:"BOD",workstream:"Business strategy",
       updates:[{id:"u3",author:"BOD",text:"@hattt4 can we move the sign-off to May 14 meeting instead?",ts:"2026-05-08T09:00:00Z"}],
       steps:[
         {id:"s14",name:"1:1 pre-alignment with Chairman",pic:"hattt4",due:"2026-05-06",status:"Done",order:1,comments:[]},
         {id:"s15",name:"1:1 pre-alignment with CFO",pic:"hattt4",due:"2026-05-09",status:"Open",order:2,hasUnread:true,comments:[{id:"c3",author:"BOD",text:"@hattt4 CFO is available Thursday 4pm",ts:"2026-05-08T09:00:00Z"}]},
         {id:"s16",name:"Prepare tiered proposal (3 options)",pic:"Trangvk",due:"2026-05-11",status:"Open",order:3,comments:[]},
       ]},
      {id:"t7",name:"Investor dataroom access & control setup",status:"Planned",pic:"hattt4",end:"2026-05-20",deadlineType:"soft",program:"Investor",workstream:"Investor DD",
       updates:[],
       steps:[
         {id:"s17",name:"Set up Ansarada dataroom structure",pic:"IT",due:"2026-05-15",status:"Open",order:1,comments:[]},
         {id:"s18",name:"Upload Q1 financials and IM",pic:"hattt4",due:"2026-05-18",status:"Open",order:2,comments:[]},
       ]},
    ],
    mentions:[
      {id:"m3",author:"BOD",text:"@hattt4 can we move the MWB sign-off to May 14 meeting instead?",ts:"2026-05-08T09:00:00Z",taskName:"Must-Win Battles",stepName:"Get BoD sign-off"},
    ],
    raidAlerts:[
      {id:"r3",title:"BoD consensus risk on MWB priorities",level:"High",trend:"improving",type:"Risk"},
    ],
    actionItems:[
      {id:"a3",name:"Get BoD sign-off on MWB framework",due:"2026-05-13",priority:"High",status:"Open",meetingRef:"BoD 7 May",comments:[]},
    ],
  },
];

// ── Base UI ────────────────────────────────────────────────────
const Btn = ({children,variant="default",size="sm",onClick,disabled,style={}}) => {
  const sz=size==="sm"?{padding:"5px 11px",fontSize:11}:{padding:"8px 16px",fontSize:13};
  const vr={default:{background:C.surface,color:C.ink,border:`1px solid ${C.lineS}`},primary:{background:C.ink,color:"#fff",border:`1px solid ${C.ink}`},approve:{background:C.greenBg,color:C.green,border:"1px solid #9FCB75"},ghost:{background:"transparent",color:C.muted,border:"none"}};
  return <button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",gap:5,borderRadius:7,fontFamily:F,fontWeight:500,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.45:1,...sz,...vr[variant],...style}}>{children}</button>;
};
const Tag = ({c=C.muted,b=C.bg,children,style={}}) => <span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:b,color:c,fontWeight:600,whiteSpace:"nowrap",...style}}>{children}</span>;
const LCFG={Critical:{fg:"#7B1D1D",bg:"#FCEBEB",dot:"#A32D2D"},High:{fg:C.red,bg:"#FFF0EE",dot:C.red},Medium:{fg:C.amber,bg:C.amberBg,dot:C.amber},Low:{fg:C.green,bg:C.greenBg,dot:C.green}};
const TREND={improving:"🟢",stable:"🟡",escalating:"🔴"};

const MentionText = ({text}) => (
  <span>{text.split(/(@\w[\w.]*)/g).map((p,i)=>p.startsWith("@")?<span key={i} style={{color:C.blue,background:C.blueBg,padding:"0 3px",borderRadius:3,fontWeight:500}}>{p}</span>:p)}</span>
);

function StatusPill({status,onChange}){
  const [open,setOpen]=useState(false);
  const cfg={InProgress:{fg:C.amber,bg:C.amberBg,icon:"◐",l:"In Progress"},Planned:{fg:C.muted,bg:"#EDEBE4",icon:"○",l:"Planned"},Completed:{fg:C.green,bg:C.greenBg,icon:"✓",l:"Completed"}};
  const c=cfg[status]||cfg.Planned;
  if(!onChange) return <span style={{fontSize:10,padding:"2px 9px",borderRadius:999,background:c.bg,color:c.fg,fontWeight:500}}>{c.l}</span>;
  return(
    <span style={{position:"relative",display:"inline-flex"}}>
      <button onClick={e=>{e.stopPropagation();setOpen(!open);}} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"3px 9px",borderRadius:999,border:`1px solid ${C.lineS}`,background:C.surface,fontSize:10,fontFamily:F,color:c.fg,cursor:"pointer",fontWeight:500}}>{c.icon} {c.l} ▾</button>
      {open&&<div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:0,marginTop:3,background:C.surface,border:`1px solid ${C.lineS}`,borderRadius:6,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:200,minWidth:120}}>
        {Object.entries(cfg).map(([s,cv])=><button key={s} onClick={()=>{onChange(s);setOpen(false);}} style={{display:"flex",alignItems:"center",gap:5,width:"100%",padding:"6px 10px",fontFamily:F,fontSize:11,border:"none",background:s===status?C.bg:"transparent",cursor:"pointer",color:cv.fg}}>{cv.icon} {cv.l}</button>)}
      </div>}
    </span>
  );
}

// ── Step Row (with expand for thread) ─────────────────────────
function StepRow({step,isMine,onDone,onComment,compact=false}){
  const [expanded,setExpanded]=useState(false);
  const [commentText,setCommentText]=useState("");
  const over=isOver(step.due)&&step.status!=="Done";
  const unread=(step.comments||[]).filter(c=>c.text.includes(`@${ME}`)).length;

  const post=()=>{if(!commentText.trim())return;onComment(step.id,commentText);setCommentText("");};

  return(
    <div style={{borderLeft:`2px solid ${step.status==="Done"?C.greenBg:expanded?C.blue:C.lineS}`,paddingLeft:10,marginBottom:6,opacity:step.status==="Done"?0.62:1}}>
      <div onClick={()=>step.status!=="Done"&&setExpanded(!expanded)} style={{display:"flex",alignItems:"center",gap:7,cursor:step.status!=="Done"?"pointer":"default"}}>
        <div style={{width:18,height:18,borderRadius:"50%",background:step.status==="Done"?C.accent:step.order===1?C.ink:"#EDEBE4",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,flexShrink:0}}>
          {step.status==="Done"?"✓":step.order}
        </div>
        <span style={{fontSize:12,flex:1,color:step.status==="Done"?C.muted:C.ink,textDecoration:step.status==="Done"?"line-through":"none",fontWeight:step.order===1&&step.status!=="Done"?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{step.name}</span>
        {step.order===1&&step.status!=="Done"&&<Tag c="#fff" b={C.ink} style={{fontSize:9}}>NEXT</Tag>}
        {over&&<Tag c={C.red} b={C.redBg}>⚠</Tag>}
        {unread>0&&<Tag c={C.accent} b={C.greenBg}>💬 @you</Tag>}
        {(step.comments||[]).length>0&&unread===0&&<Tag c={C.muted} b={C.bg}>💬 {step.comments.length}</Tag>}
        {isMine&&step.status==="Open"&&<Btn variant="approve" size="sm" onClick={e=>{e.stopPropagation();onDone(step.id);}}>✓</Btn>}
        {step.status!=="Done"&&<span style={{color:C.muted,fontSize:11}}>{expanded?"▲":"▼"}</span>}
      </div>
      {/* Inline thread expand */}
      {expanded&&step.status!=="Done"&&(
        <div style={{marginTop:6,padding:"8px 10px",background:C.bg,borderRadius:6,border:`1px solid ${C.line}`}}>
          {(step.comments||[]).length>0&&(
            <div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:5}}>
              {step.comments.map(c=>(
                <div key={c.id} style={{display:"flex",gap:7}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:C.blueBg,color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,background:C.surface,borderRadius:5,padding:"5px 8px",fontSize:11}}>
                    <div style={{display:"flex",gap:6,marginBottom:2}}><strong style={{fontSize:10,color:C.ink}}>{c.author}</strong><span style={{fontSize:9,color:C.subtle}}>{fmtRel(c.ts)}</span></div>
                    <MentionText text={c.text}/>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:5,alignItems:"flex-end"}}>
            <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} rows={2} placeholder={`Comment as ${ME}… @ to mention`}
              style={{flex:1,padding:"6px 9px",border:`1px solid ${C.lineS}`,borderRadius:6,fontFamily:F,fontSize:11,outline:"none",resize:"none",background:C.surface}}
              onClick={e=>e.stopPropagation()}/>
            <Btn size="sm" variant="primary" disabled={!commentText.trim()} onClick={e=>{e.stopPropagation();post();}}>Post</Btn>
          </div>
          <div style={{display:"flex",gap:5,marginTop:6,paddingTop:6,borderTop:`1px solid ${C.line}`}}>
            <Btn size="sm">🚫 Blocked</Btn>
            <Btn size="sm">📅 Request extension</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action Item Row (with expand for thread) ───────────────────
function ActionItemRow({action,onDone,onComment}){
  const [expanded,setExpanded]=useState(false);
  const [commentText,setCommentText]=useState("");
  const over=isOver(action.due)&&action.status!=="Open";
  const unread=(action.comments||[]).filter(c=>c.text.includes(`@${ME}`)).length;
  const post=()=>{if(!commentText.trim())return;onComment(action.id,commentText);setCommentText("");};

  return(
    <div style={{border:`1px solid ${unread>0?C.accent:expanded?C.lineS:C.line}`,borderRadius:7,marginBottom:5,background:C.surface,overflow:"hidden"}}>
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",gap:8,padding:"8px 10px",alignItems:"center",cursor:"pointer"}}>
        <div style={{width:13,height:13,border:`1.5px solid ${C.lineS}`,borderRadius:3,flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:500,color:C.ink,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{action.name}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:1}}>due {fmtD(action.due)} · {action.meetingRef}{unread>0&&<span style={{marginLeft:6,color:C.accent,fontWeight:600}}>💬 @you</span>}{(action.comments||[]).length>0&&unread===0&&<span style={{marginLeft:6,color:C.muted}}>💬 {action.comments.length}</span>}</div>
        </div>
        <Tag c={action.priority==="High"?C.red:C.amber} b={action.priority==="High"?C.redBg:C.amberBg}>{action.priority}</Tag>
        <Btn variant="approve" size="sm" onClick={e=>{e.stopPropagation();onDone(action.id);}}>✓ Done</Btn>
        <span style={{color:C.muted,fontSize:11}}>{expanded?"▲":"▼"}</span>
      </div>
      {expanded&&(
        <div style={{borderTop:`1px solid ${C.line}`,padding:"8px 10px",background:C.bg}}>
          {(action.comments||[]).length>0&&(
            <div style={{marginBottom:8,display:"flex",flexDirection:"column",gap:5}}>
              {action.comments.map(c=>(
                <div key={c.id} style={{display:"flex",gap:7}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:C.blueBg,color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0}}>{c.author.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,background:C.surface,borderRadius:5,padding:"5px 8px",fontSize:11}}>
                    <div style={{display:"flex",gap:6,marginBottom:2}}><strong style={{fontSize:10}}>{c.author}</strong><span style={{fontSize:9,color:C.subtle}}>{fmtRel(c.ts)}</span></div>
                    <MentionText text={c.text}/>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:5,alignItems:"flex-end"}}>
            <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} rows={2} placeholder={`Comment as ${ME}… @ to mention`}
              style={{flex:1,padding:"6px 9px",border:`1px solid ${C.lineS}`,borderRadius:6,fontFamily:F,fontSize:11,outline:"none",resize:"none",background:C.surface}}
              onClick={e=>e.stopPropagation()}/>
            <Btn size="sm" variant="primary" disabled={!commentText.trim()} onClick={e=>{e.stopPropagation();post();}}>Post</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── THE CORE: Task Card used in BOTH views ─────────────────────
// Same component everywhere — no interaction difference between "today" and "this week"
function TaskCard({task,project,onStatusChange,onStepDone,onStepComment,onPostUpdate,showToast}){
  const [expanded,setExpanded]=useState(false);
  const [updateText,setUpdateText]=useState("");
  const [isBlocker,setIsBlocker]=useState(false);
  const openSteps=task.steps.filter(s=>s.status!=="Done");
  const doneSteps=task.steps.filter(s=>s.status==="Done");
  const over=isOver(task.end);
  const unreadUpdates=(task.updates||[]).filter(u=>u.text.includes(`@${ME}`)).length;
  const unreadSteps=task.steps.some(s=>(s.comments||[]).some(c=>c.text.includes(`@${ME}`)));

  const postUpdate=()=>{if(!updateText.trim())return;onPostUpdate(task.id,updateText,isBlocker);setUpdateText("");setIsBlocker(false);showToast("Update posted");};

  return(
    <div style={{border:`1px solid ${over?"#F5C8C8":expanded?C.lineS:C.line}`,borderRadius:9,marginBottom:8,background:over?"#FFF8F8":C.surface,overflow:"hidden"}}>
      {/* Header row — always visible */}
      <div onClick={()=>setExpanded(!expanded)} style={{display:"flex",gap:8,padding:"10px 12px",cursor:"pointer",alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,color:over?C.red:C.ink,marginBottom:2}}>{task.name}</div>
          <div style={{fontSize:11,color:C.subtle,display:"flex",gap:8,flexWrap:"wrap"}}>
            <span>{task.program} › {task.workstream}</span>
            <span style={{color:over?C.red:C.subtle}}>{over?`was due ${fmtD(task.end)}`:`due ${fmtD(task.end)}`}</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
          <StatusPill status={task.status} onChange={s=>{onStatusChange(task.id,s);showToast(`Status updated to ${s}`);}}/>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            {openSteps.length>0&&<span style={{fontSize:10,color:C.muted}}>{openSteps.length} steps</span>}
            {unreadUpdates>0&&<Tag c={C.accent} b={C.greenBg}>💬 @you</Tag>}
            {unreadSteps&&<Tag c={C.blue} b={C.blueBg}>💬 steps</Tag>}
          </div>
        </div>
        <span style={{color:C.muted,fontSize:12,marginLeft:4,marginTop:2}}>{expanded?"▲":"▼"}</span>
      </div>

      {/* Expanded: steps + update form */}
      {expanded&&(
        <div style={{borderTop:`1px solid ${C.line}`,padding:"10px 12px 12px",background:C.bg}}>

          {/* Open steps */}
          {openSteps.length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:6}}>Steps</div>
              {openSteps.map(s=>(
                <StepRow key={s.id} step={s} isMine={s.pic===ME}
                  onDone={id=>{onStepDone(task.id,id);showToast("✓ Step done");}}
                  onComment={(id,text)=>{onStepComment(task.id,id,text);showToast("Comment posted");}}
                />
              ))}
              {doneSteps.length>0&&<div style={{fontSize:10,color:C.subtle,paddingLeft:10,marginTop:4}}>✓ {doneSteps.length} completed step{doneSteps.length>1?"s":""}</div>}
            </div>
          )}

          {/* Recent updates feed (last 2) */}
          {(task.updates||[]).length>0&&(
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:6}}>Recent updates</div>
              {(task.updates||[]).slice(0,2).map(u=>(
                <div key={u.id} style={{display:"flex",gap:7,marginBottom:5}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:C.blueBg,color:C.blue,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,flexShrink:0}}>{u.author.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,background:C.surface,borderRadius:5,padding:"5px 8px",fontSize:11,border:`1px solid ${C.line}`}}>
                    <div style={{display:"flex",gap:6,marginBottom:2}}><strong style={{fontSize:10}}>{u.author}</strong><span style={{fontSize:9,color:C.subtle}}>{fmtRel(u.ts)}</span></div>
                    <MentionText text={u.text}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Post update form */}
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,marginBottom:6}}>Post update</div>
            <textarea value={updateText} onChange={e=>setUpdateText(e.target.value)} rows={2}
              placeholder={`Update as ${ME}… type @ to mention. Mark blockers for owner review.`}
              style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.lineS}`,borderRadius:7,fontFamily:F,fontSize:12,outline:"none",resize:"none",background:C.surface,boxSizing:"border-box"}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
              <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:C.muted,cursor:"pointer"}}>
                <input type="checkbox" checked={isBlocker} onChange={e=>setIsBlocker(e.target.checked)}/>
                🚩 This is a blocker
              </label>
              <span style={{flex:1}}/>
              <Btn size="sm" variant="primary" disabled={!updateText.trim()} onClick={postUpdate}>Post update</Btn>
            </div>
          </div>

          {/* Secondary actions */}
          <div style={{display:"flex",gap:5,marginTop:8,paddingTop:8,borderTop:`1px solid ${C.line}`}}>
            <Btn size="sm">📅 Request extension</Btn>
            <Btn size="sm" style={{marginLeft:"auto"}}>→ Open full task</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BY PROJECT VIEW ───────────────────────────────────────────
function ByProjectView({projects,state,dispatch,showToast}){
  const [collapsed,setCollapsed]=useState({});
  const [expandedSec,setExpandedSec]=useState({});
  const togP=id=>setCollapsed(c=>({...c,[id]:!c[id]}));
  const togS=(pid,sec)=>setExpandedSec(s=>({...s,[`${pid}:${sec}`]:!s[`${pid}:${sec}`]}));
  const isSec=(pid,sec)=>!!expandedSec[`${pid}:${sec}`];

  return(
    <div style={{overflowY:"auto",padding:"20px 20px 40px"}}>
      <div style={{maxWidth:820,margin:"0 auto"}}>
        {projects.map(proj=>{
          const myTasks=proj.tasks.filter(t=>t.pic===ME);
          const myActions=proj.actionItems.filter(a=>a.status==="Open");
          const overdueTasks=myTasks.filter(t=>isOver(t.end));
          const escalating=proj.raidAlerts.filter(r=>r.trend==="escalating");
          const unread=proj.mentions;
          const urgentCount=overdueTasks.length+escalating.length+unread.length;
          const todayTasks=myTasks.filter(t=>isOver(t.end)||(t.end&&new Date(t.end)<=TODAY));
          const weekTasks=myTasks.filter(t=>inWeek(t.end)&&!isOver(t.end));
          const laterTasks=myTasks.filter(t=>t.end&&new Date(t.end)>new Date("2026-05-15"));
          const isCol=collapsed[proj.id];
          const totalOpen=myTasks.length+myActions.length;

          return(
            <div key={proj.id} style={{marginBottom:14,border:`1.5px solid ${urgentCount>0?proj.color:C.lineS}`,borderRadius:12,overflow:"hidden",background:C.surface,boxShadow:urgentCount>0?"0 2px 8px rgba(0,0,0,0.06)":"none"}}>
              {/* Header */}
              <div onClick={()=>togP(proj.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",cursor:"pointer",background:proj.colorBg,borderBottom:isCol?"none":`1px solid ${C.line}`}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:proj.color,flexShrink:0}}/>
                <span style={{fontSize:15,fontWeight:700,color:proj.color}}>{proj.name}</span>
                {overdueTasks.length>0&&<Tag c={C.red} b={C.redBg}>⚠ {overdueTasks.length} overdue</Tag>}
                {unread.length>0&&<Tag c={C.accent} b={C.greenBg}>💬 {unread.length} @you</Tag>}
                {escalating.length>0&&<Tag c={C.red} b={C.redBg}>🔴 {escalating.length} escalating</Tag>}
                <span style={{flex:1}}/>
                <span style={{fontSize:11,color:proj.color,opacity:0.7}}>{myTasks.length} tasks · {myActions.length} actions</span>
                <span style={{color:proj.color,fontSize:12,marginLeft:8}}>{isCol?"▼":"▲"}</span>
              </div>

              {!isCol&&<div style={{padding:"12px 16px 14px"}}>
                {/* Alert strip */}
                {urgentCount>0&&(
                  <div style={{padding:"8px 12px",background:"#FFF8F8",border:"1px solid #F5C8C8",borderRadius:8,marginBottom:12,fontSize:12}}>
                    {overdueTasks.map(t=><div key={t.id} style={{color:C.red,fontWeight:500,marginBottom:2}}>⚠ Task overdue: <strong>{t.name}</strong></div>)}
                    {escalating.map(r=><div key={r.id} style={{color:C.red,marginBottom:2}}>🔴 {r.title}</div>)}
                    {unread.map(m=><div key={m.id} style={{color:C.accent,marginBottom:2}}>💬 {m.author}: "{m.text.slice(0,55)}…"</div>)}
                  </div>
                )}

                {/* Tasks due today/overdue */}
                {todayTasks.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,marginBottom:8}}>Tasks due today / overdue</div>
                    {todayTasks.map(t=>(
                      <TaskCard key={t.id} task={t} project={proj}
                        onStatusChange={(tid,s)=>dispatch({type:"STATUS",proj:proj.id,tid,s})}
                        onStepDone={(tid,sid)=>dispatch({type:"STEP_DONE",proj:proj.id,tid,sid})}
                        onStepComment={(tid,sid,text)=>{dispatch({type:"STEP_COMMENT",proj:proj.id,tid,sid,text});}}
                        onPostUpdate={(tid,text,isBlocker)=>dispatch({type:"UPDATE",proj:proj.id,tid,text,isBlocker})}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                )}

                {/* Action items */}
                {myActions.length>0&&(
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>Action items ({myActions.length})</div>
                    {myActions.map(a=>(
                      <ActionItemRow key={a.id} action={a}
                        onDone={id=>{ dispatch({type:"ACTION_DONE",proj:proj.id,id}); showToast("✓ Action done"); }}
                        onComment={(id,text)=>{ dispatch({type:"ACTION_COMMENT",proj:proj.id,id,text}); showToast("Comment posted"); }}
                      />
                    ))}
                  </div>
                )}

                {/* Tasks this week — SAME TaskCard, same interactions */}
                {weekTasks.length>0&&(
                  <div style={{marginBottom:8}}>
                    <button onClick={()=>togS(proj.id,"week")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,display:"flex",alignItems:"center",gap:5,marginBottom:6,padding:0}}>
                      {isSec(proj.id,"week")?"▼":"▶"} Tasks this week ({weekTasks.length})
                    </button>
                    {/* KEY: same TaskCard component — all interactions available */}
                    {isSec(proj.id,"week")&&weekTasks.map(t=>(
                      <TaskCard key={t.id} task={t} project={proj}
                        onStatusChange={(tid,s)=>dispatch({type:"STATUS",proj:proj.id,tid,s})}
                        onStepDone={(tid,sid)=>dispatch({type:"STEP_DONE",proj:proj.id,tid,sid})}
                        onStepComment={(tid,sid,text)=>dispatch({type:"STEP_COMMENT",proj:proj.id,tid,sid,text})}
                        onPostUpdate={(tid,text,isBlocker)=>dispatch({type:"UPDATE",proj:proj.id,tid,text,isBlocker})}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                )}

                {/* Tasks later */}
                {laterTasks.length>0&&(
                  <div>
                    <button onClick={()=>togS(proj.id,"later")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,display:"flex",alignItems:"center",gap:5,marginBottom:6,padding:0}}>
                      {isSec(proj.id,"later")?"▼":"▶"} Later ({laterTasks.length})
                    </button>
                    {isSec(proj.id,"later")&&laterTasks.map(t=>(
                      <TaskCard key={t.id} task={t} project={proj}
                        onStatusChange={(tid,s)=>dispatch({type:"STATUS",proj:proj.id,tid,s})}
                        onStepDone={(tid,sid)=>dispatch({type:"STEP_DONE",proj:proj.id,tid,sid})}
                        onStepComment={(tid,sid,text)=>dispatch({type:"STEP_COMMENT",proj:proj.id,tid,sid,text})}
                        onPostUpdate={(tid,text,isBlocker)=>dispatch({type:"UPDATE",proj:proj.id,tid,text,isBlocker})}
                        showToast={showToast}
                      />
                    ))}
                  </div>
                )}

                {/* RAID */}
                {proj.raidAlerts.length>0&&(
                  <div style={{marginTop:8}}>
                    <button onClick={()=>togS(proj.id,"raid")} style={{background:"none",border:"none",cursor:"pointer",fontFamily:F,fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4,display:"flex",alignItems:"center",gap:5,marginBottom:6,padding:0}}>
                      {isSec(proj.id,"raid")?"▼":"▶"} RAID ({proj.raidAlerts.length} active)
                    </button>
                    {isSec(proj.id,"raid")&&proj.raidAlerts.map(r=>{const cfg=LCFG[r.level]||LCFG.Medium;return(
                      <div key={r.id} style={{display:"flex",gap:8,padding:"6px 10px",border:`1px solid ${C.line}`,borderRadius:6,marginBottom:4,background:C.surface,alignItems:"center",fontSize:12}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:cfg.dot}}/>
                        <span style={{flex:1}}>{r.title}</span>
                        <Tag c={cfg.fg} b={cfg.bg}>{r.level}</Tag>
                        <span style={{fontSize:13}}>{TREND[r.trend]}</span>
                      </div>
                    );})}
                  </div>
                )}
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BY URGENCY VIEW ───────────────────────────────────────────
function ByUrgencyView({projects,state,dispatch,showToast}){
  const allTasks=projects.flatMap(p=>p.tasks.filter(t=>t.pic===ME).map(t=>({...t,project:p})));
  const allMentions=projects.flatMap(p=>p.mentions.map(m=>({...m,project:p})));
  const allRAID=projects.flatMap(p=>p.raidAlerts.map(r=>({...r,project:p})));
  const allActions=projects.flatMap(p=>p.actionItems.filter(a=>a.status==="Open").map(a=>({...a,project:p})));
  const overdueTasks=allTasks.filter(t=>isOver(t.end));
  const escalating=allRAID.filter(r=>r.trend==="escalating");
  const [tBucket,setTBucket]=useState("today");
  const tToday=allTasks.filter(t=>isOver(t.end)||(t.end&&new Date(t.end)<=TODAY));
  const tWeek=allTasks.filter(t=>inWeek(t.end)&&!isOver(t.end));
  const tLater=allTasks.filter(t=>t.end&&new Date(t.end)>new Date("2026-05-15"));
  const curTasks=tBucket==="today"?tToday:tBucket==="week"?tWeek:tLater;

  const Sec=({icon,title,count,accent,def,children})=>{const[o,setO]=useState(def);return(
    <div style={{background:C.surface,border:`1px solid ${C.line}`,borderRadius:10,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setO(!o)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",cursor:"pointer",background:o?C.bg:"transparent",borderBottom:o?`1px solid ${C.line}`:"none"}}>
        <span style={{fontSize:14}}>{icon}</span><span style={{fontSize:13,fontWeight:600}}>{title}</span>
        {count>0&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:accent||C.bg,color:accent?"#fff":C.muted,fontWeight:700}}>{count}</span>}
        <span style={{flex:1}}/><span style={{color:C.muted,fontSize:12}}>{o?"▲":"▼"}</span>
      </div>
      {o&&<div style={{padding:"10px 16px 14px"}}>{children}</div>}
    </div>
  );};
  const Tabs=({v,set,opts})=><div style={{display:"flex",gap:2,marginBottom:10,padding:3,background:C.bg,borderRadius:6}}>{opts.map(o=><button key={o.id} onClick={()=>set(o.id)} style={{flex:1,padding:"5px 10px",borderRadius:5,border:"none",background:v===o.id?C.surface:"transparent",fontFamily:F,fontSize:11,color:v===o.id?C.ink:C.muted,fontWeight:v===o.id?600:400,cursor:"pointer",boxShadow:v===o.id?"0 1px 2px rgba(0,0,0,0.06)":"none"}}>{o.l} ({o.n})</button>)}</div>;

  return(
    <div style={{overflowY:"auto",padding:"20px 20px 40px"}}>
      <div style={{maxWidth:820,margin:"0 auto"}}>
        <Sec icon="🔴" title="Needs attention" count={overdueTasks.length+escalating.length} accent={C.red} def={overdueTasks.length+escalating.length>0}>
          {overdueTasks.length===0&&escalating.length===0?<div style={{fontSize:12,color:C.subtle,fontStyle:"italic"}}>All clear.</div>:<>
            {overdueTasks.map(t=><div key={t.id} style={{padding:10,background:C.redBg,border:"1px solid #F5C8C8",borderRadius:8,marginBottom:6}}><div style={{fontSize:13,fontWeight:600,color:C.ink,marginBottom:2}}>⚠ {t.name}</div><div style={{fontSize:11,color:C.muted,marginBottom:6}}>{t.project.name} · was due {fmtD(t.end)}</div><StatusPill status={t.status} onChange={s=>{dispatch({type:"STATUS",proj:t.project.id,tid:t.id,s});showToast(`Status updated`); }}/></div>)}
            {escalating.map(r=>{const cfg=LCFG[r.level]||LCFG.Medium;return <div key={r.id} style={{padding:10,background:"#FFF0EE",border:"1px solid #F5C8C8",borderRadius:8,marginBottom:6,display:"flex",gap:8,alignItems:"center"}}><span style={{width:8,height:8,borderRadius:"50%",background:cfg.dot}}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{r.title}</div><div style={{fontSize:10,color:C.muted}}>{r.project.name} · 🔴 Escalating</div></div><Tag c={cfg.fg} b={cfg.bg}>{r.level}</Tag></div>;})}
          </>}
        </Sec>
        <Sec icon="💬" title="Mentions & @you" count={allMentions.length} def={allMentions.length>0}>
          {allMentions.map(m=><div key={m.id} style={{padding:"8px 12px",background:C.bg,border:`1px solid ${C.line}`,borderLeft:`3px solid ${C.accent}`,borderRadius:6,marginBottom:6}}><div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}><Tag c="#fff" b={C.accent}>@YOU</Tag><strong style={{fontSize:12}}>{m.author}</strong><span style={{fontSize:10,color:C.subtle}}>in {m.project.name}</span></div><div style={{fontSize:12,fontStyle:"italic"}}><MentionText text={m.text}/></div></div>)}
        </Sec>
        <Sec icon="📋" title="Tasks I own" count={allTasks.length} def={true}>
          <Tabs v={tBucket} set={setTBucket} opts={[{id:"today",l:"Today",n:tToday.length},{id:"week",l:"This week",n:tWeek.length},{id:"later",l:"Later",n:tLater.length}]}/>
          {curTasks.map(t=>(
            <TaskCard key={t.id} task={t} project={t.project}
              onStatusChange={(tid,s)=>dispatch({type:"STATUS",proj:t.project.id,tid,s})}
              onStepDone={(tid,sid)=>dispatch({type:"STEP_DONE",proj:t.project.id,tid,sid})}
              onStepComment={(tid,sid,text)=>dispatch({type:"STEP_COMMENT",proj:t.project.id,tid,sid,text})}
              onPostUpdate={(tid,text,isBlocker)=>dispatch({type:"UPDATE",proj:t.project.id,tid,text,isBlocker})}
              showToast={showToast}
            />
          ))}
        </Sec>
        <Sec icon="☑" title="Action items" count={allActions.length} def={allActions.length>0}>
          {allActions.map(a=>(
            <ActionItemRow key={a.id} action={a}
              onDone={id=>{dispatch({type:"ACTION_DONE",proj:a.project.id,id});showToast("✓ Done");}}
              onComment={(id,text)=>{dispatch({type:"ACTION_COMMENT",proj:a.project.id,id,text});showToast("Comment posted");}}
            />
          ))}
        </Sec>
      </div>
    </div>
  );
}

// ── STATE MANAGEMENT ──────────────────────────────────────────
function reducer(state,action){
  return state.map(proj=>{
    if(proj.id!==action.proj) return proj;
    if(action.type==="STATUS") return {...proj,tasks:proj.tasks.map(t=>t.id===action.tid?{...t,status:action.s}:t)};
    if(action.type==="STEP_DONE") return {...proj,tasks:proj.tasks.map(t=>t.id===action.tid?{...t,steps:t.steps.map(s=>s.id===action.sid?{...s,status:"Done"}:s)}:t)};
    if(action.type==="STEP_COMMENT") return {...proj,tasks:proj.tasks.map(t=>t.id===action.tid?{...t,steps:t.steps.map(s=>s.id===action.sid?{...s,comments:[...(s.comments||[]),{id:`c_${Date.now()}`,author:ME,text:action.text,ts:new Date().toISOString()}]}:s)}:t)};
    if(action.type==="UPDATE") return {...proj,tasks:proj.tasks.map(t=>t.id===action.tid?{...t,updates:[{id:`u_${Date.now()}`,author:ME,text:action.text,isBlocker:action.isBlocker,ts:new Date().toISOString()},...(t.updates||[])]}:t)};
    if(action.type==="ACTION_DONE") return {...proj,actionItems:proj.actionItems.map(a=>a.id===action.id?{...a,status:"Done"}:a)};
    if(action.type==="ACTION_COMMENT") return {...proj,actionItems:proj.actionItems.map(a=>a.id===action.id?{...a,comments:[...(a.comments||[]),{id:`ca_${Date.now()}`,author:ME,text:action.text,ts:new Date().toISOString()}]}:a)};
    return proj;
  });
}

// ── MAIN ──────────────────────────────────────────────────────
export default function App(){
  const [viewMode,setViewMode]=useState("project");
  const [state,dispatch]=React.useReducer(reducer,PROJECTS);
  const [toast,setToast]=useState(null);
  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),2000);};
  const totalUrgent=state.reduce((s,p)=>s+p.tasks.filter(t=>t.pic===ME&&isOver(t.end)).length+p.raidAlerts.filter(r=>r.trend==="escalating").length+p.mentions.length,0);

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:F,color:C.ink,display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{background:C.ink,color:"#fff",padding:"6px 16px",fontSize:11,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{background:C.accent,padding:"1px 6px",borderRadius:3,fontWeight:700}}>DEMO</span>
        <span>My Work · By Project: click any task row (today AND this week) — same interactions everywhere</span>
        <span style={{flex:1}}/><span style={{opacity:0.6}}>{ME}</span>
      </div>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.line}`,padding:"12px 20px",display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
        <div>
          <h1 style={{margin:0,fontSize:18,fontWeight:700}}>My Work</h1>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Friday, 8 May 2026 · {state.length} projects</div>
        </div>
        <span style={{flex:1}}/>
        <div style={{display:"flex",background:C.bg,borderRadius:8,padding:3,border:`1px solid ${C.line}`}}>
          <button onClick={()=>setViewMode("urgency")} style={{padding:"7px 16px",borderRadius:6,border:"none",background:viewMode==="urgency"?C.surface:"transparent",fontFamily:F,fontSize:12,color:viewMode==="urgency"?C.ink:C.muted,fontWeight:viewMode==="urgency"?600:400,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,boxShadow:viewMode==="urgency"?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.12s"}}>
            ⚡ By urgency
            {totalUrgent>0&&<span style={{background:C.redBg,color:C.red,borderRadius:999,padding:"1px 6px",fontSize:10,fontWeight:700}}>{totalUrgent}</span>}
          </button>
          <button onClick={()=>setViewMode("project")} style={{padding:"7px 16px",borderRadius:6,border:"none",background:viewMode==="project"?C.surface:"transparent",fontFamily:F,fontSize:12,color:viewMode==="project"?C.ink:C.muted,fontWeight:viewMode==="project"?600:400,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,boxShadow:viewMode==="project"?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.12s"}}>
            📁 By project
          </button>
        </div>
        <div style={{fontSize:11,color:C.subtle,fontStyle:"italic",maxWidth:220,lineHeight:1.4}}>
          {viewMode==="urgency"?"Morning triage — what's on fire?":"Focus mode — block time per project"}
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        {viewMode==="urgency"&&<ByUrgencyView projects={state} state={state} dispatch={dispatch} showToast={showToast}/>}
        {viewMode==="project"&&<ByProjectView projects={state} state={state} dispatch={dispatch} showToast={showToast}/>}
      </div>
      {toast&&<div style={{position:"absolute",bottom:20,left:"50%",transform:"translateX(-50%)",padding:"10px 18px",background:C.ink,color:"#fff",borderRadius:8,fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,0.2)",zIndex:999,whiteSpace:"nowrap",fontWeight:500}}>{toast}</div>}
    </div>
  );
}
