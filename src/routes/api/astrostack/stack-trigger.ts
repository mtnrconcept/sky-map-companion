import{createServerFileRoute}from"@tanstack/react-start/server";
import{createClient}from"@supabase/supabase-js";
importtype{Database}from"@/integrations/supabase/types";
import{simulateStackingPipeline}from"@/lib/astrostack.server";

/**
*POST/api/astrostack/stack-trigger
*Lanceunjobdestackingpourunobjetdonné.
*Sélectionnelesmeilleuresframesqualifiéesdisponibles.
*/
exportconstServerRoute=createServerFileRoute("/api/astrostack/stack-trigger").methods({
POST:async({request})=>{
constbody=awaitrequest.json().catch(()=>null);
if(!body?.object_id){
returnnewResponse(JSON.stringify({error:"object_idrequis"}),{
status:400,headers:{"Content-Type":"application/json"},
});
}

constsupabase=createClient<Database>(
process.env["SUPABASE_URL"]!,
process.env["SUPABASE_SERVICE_ROLE_KEY"]!
);

const{object_id,min_quality=0.5,max_lights=1000}=body;

//Vérifiequel'objetexiste
const{data:obj}=awaitsupabase
.from("astro_objects")
.select("*")
.eq("id",object_id)
.single();

if(!obj){
returnnewResponse(JSON.stringify({error:"Objetinconnu"}),{
status:404,headers:{"Content-Type":"application/json"},
});
}

//Sélectionnelesmeilleureslightsqualifiées
const{data:lights}=awaitsupabase
.from("astro_uploads")
.select("id,quality_score,instrument_group,exposure_s,user_id")
.eq("object_id",object_id)
.eq("frame_type","light")
.eq("status","qualified")
.eq("rejected",false)
.gte("quality_score",min_quality)
.order("quality_score",{ascending:false})
.limit(max_lights);

const{data:darks}=awaitsupabase
.from("astro_uploads")
.select("id")
.eq("object_id",object_id)
.eq("frame_type","dark")
.eq("rejected",false)
.limit(500);

const{data:flats}=awaitsupabase
.from("astro_uploads")
.select("id")
.eq("object_id",object_id)
.eq("frame_type","flat")
.eq("rejected",false)
.limit(200);

const{data:bias}=awaitsupabase
.from("astro_uploads")
.select("id")
.eq("object_id",object_id)
.eq("frame_type","bias")
.eq("rejected",false)
.limit(200);

if(!lights||lights.length<3){
returnnewResponse(
JSON.stringify({error:"Pasassezdelightsqualifiées(minimum3)"}),
{status:422,headers:{"Content-Type":"application/json"}}
);
}

//Calculelesstats
consttotalExposure=lights.reduce((s,l)=>s+(l.exposure_s??0),0)/3600;
constcontributors=newSet(lights.map((l)=>l.user_id)).size;
constconfigurations=newSet(lights.map((l)=>l.instrument_group)).size;

//Simulelepipeline(dansunvraisystème:jobasynclourd)
constpipelineResult=awaitsimulateStackingPipeline(
object_id,
lights.length,
totalExposure,
contributors,
configurations
);

//Créelejobdestacking
const{data:job,error:jobErr}=awaitsupabase
.from("astro_stacking_jobs")
.insert({
object_id,
light_ids:lights.map((l)=>l.id),
dark_ids:(darks??[]).map((d)=>d.id),
flat_ids:(flats??[]).map((f)=>f.id),
bias_ids:(bias??[]).map((b)=>b.id),
lights_count:lights.length,
total_exposure_hours:totalExposure,
contributors_count:contributors,
configurations_count:configurations,
status:"running",
started_at:newDate().toISOString(),
ai_pipeline_log:pipelineResultasunknownasimport("@supabase/supabase-js").Json,
})
.select()
.single();

if(jobErr||!job){
returnnewResponse(JSON.stringify({error:jobErr?.message}),{
status:500,headers:{"Content-Type":"application/json"},
});
}

//Simulelacomplétiondujob(dansunvraisystème:déléguéÃ unworker)
//Créeunmasterplaceholderavecuneimagegénérée
constmasterUrl=`https://via.placeholder.com/1920x1080/0a0a1a/4fc3f7?text=${encodeURIComponent(`${object_id}â€”${lights.length}frames`)}`;

const{data:master}=awaitsupabase
.from("astro_masters")
.insert({
object_id,
stacking_job_id:job.id,
image_url:masterUrl,
thumbnail_url:masterUrl,
lights_stacked:lights.length,
total_exposure_hours:totalExposure,
contributors_count:contributors,
configurations_count:configurations,
notes:pipelineResult.summary,
is_current:true,
})
.select()
.single();

//Marquelejobcommecomplété
awaitsupabase
.from("astro_stacking_jobs")
.update({
status:"completed",
completed_at:newDate().toISOString(),
result_image_url:masterUrl,
result_metadata:{estimated_snr_gain:pipelineResult.estimated_snr_gain}asunknownasimport("@supabase/supabase-js").Json,
})
.eq("id",job.id);

//Marqueleslightscommestackées
awaitsupabase
.from("astro_uploads")
.update({status:"stacked"})
.in("id",lights.map((l)=>l.id));

returnnewResponse(
JSON.stringify({success:true,job,master,pipeline:pipelineResult}),
{status:201,headers:{"Content-Type":"application/json"}}
);
},
});

