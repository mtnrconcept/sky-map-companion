import{useState,useCallback}from"react";
import{supabase}from"@/integrations/supabase/client";
import{toast}from"sonner";

exporttypeUploadStatus="idle"|"uploading"|"analyzing"|"complete"|"error";

exportinterfaceUploadState{
progress:number;
status:UploadStatus;
imageId?:string;
errorMessage?:string;
}

exportfunctionuseImageUpload(objectId:string,objectName:string){
const[uploadState,setUploadState]=useState<UploadState>({
progress:0,
status:"idle",
});

constreset=useCallback(()=>{
setUploadState({progress:0,status:"idle"});
},[]);

constuploadImage=useCallback(
async(file:File):Promise<string|null>=>{
constMAX_SIZE=10*1024*1024;
constALLOWED=["image/jpeg","image/png","image/webp"];

if(file.size>MAX_SIZE){
toast.error("L'imagenedoitpasdpasser10Mo.");
returnnull;
}
if(!ALLOWED.includes(file.type)){
toast.error("Formatnonsupport.UtilisezJPEG,PNGouWebP.");
returnnull;
}

try{
setUploadState({progress:10,status:"uploading"});

const{
data:{user},
}=awaitsupabase.auth.getUser();
if(!user){
toast.error("Vousdeveztreconnectpouruploaderdesimages.");
setUploadState({progress:0,status:"error"});
returnnull;
}

constext=file.name.split(".").pop()??"jpg";
conststoragePath=`${user.id}/${objectId}/${Date.now()}.${ext}`;

const{error:uploadError}=awaitsupabase.storage
.from("user-images")
.upload(storagePath,file,{cacheControl:"3600",upsert:false});

if(uploadError)throwuploadError;

setUploadState({progress:40,status:"uploading"});

const{
data:{publicUrl},
}=supabase.storage.from("user-images").getPublicUrl(storagePath);

setUploadState({progress:55,status:"analyzing"});

constanalysisRes=awaitfetch("/api/vision/analyze",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({imageUrl:publicUrl}),
});

if(!analysisRes.ok)thrownewError("checdel'analyseVision.");

constanalysis=awaitanalysisRes.json();

setUploadState({progress:80,status:"analyzing"});

if(analysis.isAiGenerated&&analysis.confidence>0.65){
awaitsupabase.storage.from("user-images").remove([storagePath]);
toast.error(
`Imagerejete:notreIAadtectqu'elleestgnreparordinateur(confiance${Math.round(analysis.confidence*100)}%).Seuleslesvraiesphotographiesastronomiquessontacceptes.`,
);
setUploadState({
progress:0,
status:"error",
errorMessage:"ImagegnreparIAdtecte",
});
returnnull;
}

const{data:imageRow,error:dbError}=awaitsupabase
.from("user_images")
.insert({
user_id:user.id,
object_id:objectId,
object_name:objectName,
image_url:publicUrl,
storage_path:storagePath,
file_size:file.size,
mime_type:file.type,
is_ai_generated:analysis.isAiGenerated,
ai_detection_score:analysis.confidence,
vision_analysis:analysis,
})
.select("id")
.single();

if(dbError)throwdbError;

setUploadState({progress:100,status:"complete",imageId:imageRow.id});
toast.success("Imageuploadeetvalide!Elleenrichitlagaleriecollaborative.");

fetch("/api/vision/compare",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({objectId,newImageId:imageRow.id}),
}).catch(console.error);

returnimageRow.id;
}catch(err){
console.error("Uploaderror:",err);
toast.error("Uneerreurestsurvenuelorsdel'upload.");
setUploadState({progress:0,status:"error"});
returnnull;
}
},
[objectId,objectName],
);

return{uploadImage,uploadState,reset};
}
