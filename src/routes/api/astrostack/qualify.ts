import{createServerFileRoute}from"@tanstack/react-start/server";
import{createClient}from"@supabase/supabase-js";
importtype{Database}from"@/integrations/supabase/types";
import{
analyzeFrameWithAI,
computeInstrumentGroup,
typeFrameMetadata,
}from"@/lib/astrostack.server";

/**
*POST/api/astrostack/qualify
*Qualifieuneframeuploadée:analyseIA,scorequalité,groupeinstrument.
*Appeléautomatiquementaprèschaqueupload.
*/
exportconstServerRoute=createServerFileRoute("/api/astrostack/qualify").methods({
POST:async({request})=>{
constbody=awaitrequest.json().catch(()=>null);
if(!body?.upload_id){
returnnewResponse(JSON.stringify({error:"upload_idrequis"}),{
status:400,headers:{"Content-Type":"application/json"},
});
}

constsupabase=createClient<Database>(
process.env["SUPABASE_URL"]!,
process.env["SUPABASE_SERVICE_ROLE_KEY"]!
);

//Récupèrel'upload
const{data:upload,error:fetchErr}=awaitsupabase
.from("astro_uploads")
.select("*")
.eq("id",body.upload_id)
.single();

if(fetchErr||!upload){
returnnewResponse(JSON.stringify({error:"Uploadintrouvable"}),{
status:404,headers:{"Content-Type":"application/json"},
});
}

//Marquecommeencoursdequalification
awaitsupabase
.from("astro_uploads")
.update({status:"qualifying"})
.eq("id",upload.id);

//Extraitlesmétadonnées
constmeta:FrameMetadata={
telescope:upload.telescope??undefined,
camera:upload.camera??undefined,
focal_length_mm:upload.focal_length_mm??undefined,
aperture_mm:upload.aperture_mm??undefined,
exposure_s:upload.exposure_s??undefined,
gain:upload.gain??undefined,
temperature_c:upload.temperature_c??undefined,
filter_name:upload.filter_name??undefined,
binning:upload.binning??undefined,
latitude:upload.latitude??undefined,
longitude:upload.longitude??undefined,
};

//AnalyseIA
constanalysis=awaitanalyzeFrameWithAI(
upload.object_id??"unknown",
upload.frame_type,
meta,
upload.original_filename
);

//MetÃ jourl'uploadaveclesrésultats
awaitsupabase
.from("astro_uploads")
.update({
quality_score:analysis.quality_score,
fwhm:analysis.fwhm??null,
eccentricity:analysis.eccentricity??null,
snr:analysis.snr??null,
rejected:analysis.rejected,
rejection_reason:analysis.rejection_reason??null,
instrument_group:analysis.instrument_group,
ai_analysis:analysis.ai_analysisasimport("@supabase/supabase-js").Json,
status:analysis.rejected?"rejected":"qualified",
})
.eq("id",upload.id);

returnnewResponse(JSON.stringify({success:true,analysis}),{
status:200,headers:{"Content-Type":"application/json"},
});
},
});

