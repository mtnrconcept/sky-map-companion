import{createFileRoute}from"@tanstack/react-router";
import{createClient}from"@supabase/supabase-js";
import{compareImages}from"@/lib/vision-analysis.server";
importtype{Database}from"@/integrations/supabase/types";

exportconstRoute=createFileRoute("/api/vision/compare")({
server:{
handlers:{
POST:async({request})=>{
constheaders={"Content-Type":"application/json"};
try{
const{objectId}=(awaitrequest.json())as{
objectId:string;
newImageId:string;
};

if(!objectId){
returnnewResponse(JSON.stringify({error:"objectIdrequis"}),{
status:400,
headers,
});
}

constsupabaseAdmin=createClient<Database>(
process.env["SUPABASE_URL"]!,
process.env["SUPABASE_SERVICE_ROLE_KEY"]??process.env["SUPABASE_PUBLISHABLE_KEY"]!,
);

const{data:images,error}=awaitsupabaseAdmin
.from("user_images")
.select("id,image_url")
.eq("object_id",objectId)
.eq("is_ai_generated",false)
.order("uploaded_at",{ascending:false})
.limit(8);

if(error)throwerror;

if(!images||images.length<2){
returnnewResponse(
JSON.stringify({message:"Pasassezd'imagespourlacomparaison"}),
{status:200,headers},
);
}

constimageUrls=images.map((img)=>img.image_url);
constcomparison=awaitcompareImages(imageUrls,objectId);

awaitsupabaseAdmin.from("image_comparisons").insert({
object_id:objectId,
image_ids:images.map((img)=>img.id),
differences_detected:
comparison.differencesasunknownasimport("@/integrations/supabase/types").Json,
discoveries:
comparison.discoveriesasunknownasimport("@/integrations/supabase/types").Json,
confidence_score:comparison.overallSimilarity,
analysis_metadata:{
recommendations:comparison.recommendations,
}asunknownasimport("@/integrations/supabase/types").Json,
});

returnnewResponse(JSON.stringify(comparison),{status:200,headers});
}catch(err){
console.error("[vision/compare]",err);
returnnewResponse(JSON.stringify({error:"Erreurdecomparaison"}),{
status:500,
headers,
});
}
},
},
},
});
