import{createServerFileRoute}from"@tanstack/react-start/server";
import{createClient}from"@supabase/supabase-js";
importtype{Database}from"@/integrations/supabase/types";
import{
analyzeObservationCluster,
triangulateObservations,
typeCosmosObservationInput,
}from"@/lib/cosmos-live.server";

//POST/api/cosmos/analyze-cluster
//RegroupementetanalyseIAdesobservationsrécentesdumêmetype
exportconstServerRoute=createServerFileRoute("/api/cosmos/analyze-cluster").methods({
POST:async({request})=>{
constbody=awaitrequest.json().catch(()=>null);
if(!body){
returnnewResponse(JSON.stringify({error:"InvalidJSON"}),{
status:400,
headers:{"Content-Type":"application/json"},
});
}

const{observation_id,phenomenon_type,latitude,longitude}=body;

constsupabase=createClient<Database>(
process.env["SUPABASE_URL"]!,
process.env["SUPABASE_SERVICE_ROLE_KEY"]!
);

//Récupèrelesobservationsrécentesdumêmetypedansunrayonde30°et30min
constsince=newDate(Date.now()-30*60*1000).toISOString();
const{data:nearby}=awaitsupabase
.from("cosmos_observations")
.select("*")
.eq("phenomenon_type",phenomenon_type)
.eq("status","pending")
.gte("observed_at",since)
.gte("latitude",latitude-30)
.lte("latitude",latitude+30)
.gte("longitude",longitude-30)
.lte("longitude",longitude+30)
.limit(20);

if(!nearby||nearby.length<2){
returnnewResponse(JSON.stringify({message:"Notenoughobservationstocluster"}),{
status:200,
headers:{"Content-Type":"application/json"},
});
}

constinputs:CosmosObservationInput[]=nearby.map((o)=>({
latitude:o.latitude,
longitude:o.longitude,
altitude_m:o.altitude_m??0,
azimuth:o.azimuth??undefined,
elevation:o.elevation??undefined,
phenomenon_type:o.phenomenon_type,
description:o.description,
observed_at:o.observed_at,
}));

//AnalyseIAducluster
constanalysis=awaitanalyzeObservationCluster(inputs);

if(!analysis.is_same_event||analysis.confidence<0.5){
returnnewResponse(JSON.stringify({message:"Observationsnotclustered(lowconfidence)"}),{
status:200,
headers:{"Content-Type":"application/json"},
});
}

//Triangulationsipossible
consttri=analysis.triangulation_possible
?triangulateObservations(inputs)
:null;

//Créel'événement
const{data:event,error:evErr}=awaitsupabase
.from("cosmos_events")
.insert({
phenomenon_type:analysis.phenomenon_confirmed,
title:analysis.event_title,
description:analysis.event_description,
event_at:nearby[0].observed_at,
confidence_score:analysis.confidence,
status:analysis.scientific_significance==="exceptional"?"confirmed":"unverified",
ai_analysis:analysis.ai_analysisasunknownasimport("@supabase/supabase-js").Json,
triangulation:triasunknownasimport("@supabase/supabase-js").Json,
min_latitude:Math.min(...nearby.map((o)=>o.latitude)),
max_latitude:Math.max(...nearby.map((o)=>o.latitude)),
min_longitude:Math.min(...nearby.map((o)=>o.longitude)),
max_longitude:Math.max(...nearby.map((o)=>o.longitude)),
})
.select()
.single();

if(evErr||!event){
returnnewResponse(JSON.stringify({error:evErr?.message}),{
status:500,
headers:{"Content-Type":"application/json"},
});
}

//AssocielesobservationsÃ l'événement
constobsIds=nearby.map((o)=>o.id);
awaitsupabase
.from("cosmos_observations")
.update({event_id:event.id,status:"clustered"})
.in("id",obsIds);

//Insèrelatriangulationsicalculée
if(tri){
awaitsupabase.from("cosmos_triangulations").insert({
event_id:event.id,
observation_ids:obsIds,
estimated_latitude:tri.estimated_latitude,
estimated_longitude:tri.estimated_longitude,
estimated_altitude_km:tri.estimated_altitude_km,
estimated_speed_km_s:tri.estimated_speed_km_s,
trajectory:tri.trajectoryasunknownasimport("@supabase/supabase-js").Json,
error_margin_km:tri.error_margin_km,
confidence:tri.confidence,
method:tri.method,
});
}

returnnewResponse(JSON.stringify({success:true,event,triangulation:tri}),{
status:200,
headers:{"Content-Type":"application/json"},
});
},
});

