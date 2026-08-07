import{createServerFileRoute}from"@tanstack/react-start/server";
import{createClient}from"@supabase/supabase-js";
importtype{Database}from"@/integrations/supabase/types";

//POST/api/cosmos/reportâ€”soumetuneobservationentempsréel
exportconstServerRoute=createServerFileRoute("/api/cosmos/report").methods({
POST:async({request})=>{
constbody=awaitrequest.json().catch(()=>null);
if(!body){
returnnewResponse(JSON.stringify({error:"InvalidJSON"}),{
status:400,
headers:{"Content-Type":"application/json"},
});
}

const{
user_id,
latitude,
longitude,
altitude_m=0,
azimuth,
elevation,
phenomenon_type,
description,
image_url,
duration_s,
magnitude,
}=body;

if(!latitude||!longitude||!phenomenon_type||!description){
returnnewResponse(
JSON.stringify({error:"Missingrequiredfields:latitude,longitude,phenomenon_type,description"}),
{status:400,headers:{"Content-Type":"application/json"}}
);
}

constsupabase=createClient<Database>(
process.env["SUPABASE_URL"]!,
process.env["SUPABASE_SERVICE_ROLE_KEY"]!
);

const{data:obs,error}=awaitsupabase
.from("cosmos_observations")
.insert({
user_id:user_id??null,
latitude,
longitude,
altitude_m,
azimuth:azimuth??null,
elevation:elevation??null,
phenomenon_type,
description,
image_url:image_url??null,
duration_s:duration_s??null,
magnitude:magnitude??null,
observed_at:newDate().toISOString(),
})
.select()
.single();

if(error){
returnnewResponse(JSON.stringify({error:error.message}),{
status:500,
headers:{"Content-Type":"application/json"},
});
}

//Déclenchel'analysedeclusterenarrière-plan(sansawait)
constbaseUrl=process.env["VITE_SUPABASE_URL"]
?`https://${newURL(process.env["VITE_SUPABASE_URL"]!).hostname}`
:"http://localhost:3000";

fetch(`${baseUrl}/api/cosmos/analyze-cluster`,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({
observation_id:obs.id,
phenomenon_type,
latitude,
longitude,
}),
}).catch(()=>{});

returnnewResponse(JSON.stringify({success:true,observation:obs}),{
status:201,
headers:{"Content-Type":"application/json"},
});
},
});

