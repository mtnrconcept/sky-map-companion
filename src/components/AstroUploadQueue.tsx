importtype{UploadProgress}from"@/hooks/useAstroStack";
import{Progress}from"@/components/ui/progress";
import{Badge}from"@/components/ui/badge";

interfaceProps{
uploads:UploadProgress[];
}

constSTATUS_CONFIG={
uploading:{label:"Envoi...",color:"text-blue-400",badge:"secondary"asconst},
qualifying:{label:"AnalyseIA...",color:"text-yellow-400",badge:"secondary"asconst},
qualified:{label:"Qualifiée?",color:"text-green-400",badge:"default"asconst},
rejected:{label:"Rejetée?",color:"text-red-400",badge:"destructive"asconst},
error:{label:"Erreur",color:"text-red-400",badge:"destructive"asconst},
};

exportfunctionAstroUploadQueue({uploads}:Props){
if(uploads.length===0){
return(
<divclassName="rounded-lgborderborder-dashedborder-borderp-6text-center">
<pclassName="text-smtext-muted-foreground">
Aucunuploadencours.Déposezdesframespourcontribuer.
</p>
</div>
);
}

return(
<divclassName="space-y-2">
{uploads.slice(0,20).map((u)=>{
constcfg=STATUS_CONFIG[u.status];
return(
<div
key={u.id}
className="rounded-lgborderborder-borderbg-card/50p-3space-y-2"
>
<divclassName="flexitems-centerjustify-betweengap-2">
<spanclassName="text-xsfont-monotruncateflex-1">{u.filename}</span>
<Badgevariant={cfg.badge}className="text-[10px]shrink-0">
{cfg.label}
</Badge>
</div>

{(u.status==="uploading"||u.status==="qualifying")&&(
<Progressvalue={u.progress}className="h-1"/>
)}

{u.status==="qualified"&&u.quality_score!==undefined&&(
<divclassName="flexitems-centergap-2text-[11px]">
<spanclassName="text-muted-foreground">Scorequalité:</span>
<span
className={
u.quality_score>=0.7?"text-green-400font-semibold":
u.quality_score>=0.5?"text-yellow-400font-semibold":
"text-red-400font-semibold"
}
>
{Math.round(u.quality_score*100)}%
</span>
<Progress
value={u.quality_score*100}
className="h-1flex-1"
/>
</div>
)}

{u.status==="rejected"&&u.rejection_reason&&(
<pclassName="text-[11px]text-red-400">Raison:{u.rejection_reason}</p>
)}

{u.status==="error"&&u.error&&(
<pclassName="text-[11px]text-red-400break-all">{u.error}</p>
)}
</div>
);
})}
</div>
);
}
