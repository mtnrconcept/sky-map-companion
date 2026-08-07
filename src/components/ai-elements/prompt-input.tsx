"useclient";

import{
Command,
CommandEmpty,
CommandGroup,
CommandInput,
CommandItem,
CommandList,
CommandSeparator,
}from"@/components/ui/command";
import{
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuTrigger,
}from"@/components/ui/dropdown-menu";
import{
HoverCard,
HoverCardContent,
HoverCardTrigger,
}from"@/components/ui/hover-card";
import{
InputGroup,
InputGroupAddon,
InputGroupButton,
InputGroupTextarea,
}from"@/components/ui/input-group";
import{
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
}from"@/components/ui/select";
import{Spinner}from"@/components/ui/spinner";
import{
Tooltip,
TooltipContent,
TooltipTrigger,
}from"@/components/ui/tooltip";
import{cn}from"@/lib/utils";
importtype{ChatStatus,FileUIPart,SourceDocumentUIPart}from"ai";
import{
CornerDownLeftIcon,
ImageIcon,
Monitor,
PlusIcon,
SquareIcon,
XIcon,
}from"lucide-react";
import{nanoid}from"nanoid";
importtype{
ChangeEvent,
ChangeEventHandler,
ClipboardEventHandler,
ComponentProps,
FormEvent,
FormEventHandler,
HTMLAttributes,
KeyboardEventHandler,
PropsWithChildren,
ReactNode,
RefObject,
}from"react";
import{
Children,
createContext,
useCallback,
useContext,
useEffect,
useMemo,
useRef,
useState,
}from"react";

//============================================================================
//Helpers
//============================================================================

constconvertBlobUrlToDataUrl=async(url:string):Promise<string|null>=>{
try{
constresponse=awaitfetch(url);
constblob=awaitresponse.blob();
//FileReaderusescallback-basedAPI,wrappinginPromiseisnecessary
//oxlint-disable-next-lineeslint-plugin-promise(avoid-new)
returnnewPromise((resolve)=>{
constreader=newFileReader();
//oxlint-disable-next-lineeslint-plugin-unicorn(prefer-add-event-listener)
reader.onloadend=()=>resolve(reader.resultasstring);
//oxlint-disable-next-lineeslint-plugin-unicorn(prefer-add-event-listener)
reader.onerror=()=>resolve(null);
reader.readAsDataURL(blob);
});
}catch{
returnnull;
}
};

constcaptureScreenshot=async():Promise<File|null>=>{
if(
typeofnavigator==="undefined"||
!navigator.mediaDevices?.getDisplayMedia
){
returnnull;
}

letstream:MediaStream|null=null;
constvideo=document.createElement("video");
video.muted=true;
video.playsInline=true;

try{
stream=awaitnavigator.mediaDevices.getDisplayMedia({
audio:false,
video:true,
});

video.srcObject=stream;

//Videoelementusescallback-basedAPI,wrappinginPromiseisnecessary
//oxlint-disable-next-lineeslint-plugin-promise(avoid-new)
awaitnewPromise<void>((resolve,reject)=>{
//oxlint-disable-next-lineeslint-plugin-unicorn(prefer-add-event-listener)
video.onloadedmetadata=()=>resolve();
//oxlint-disable-next-lineeslint-plugin-unicorn(prefer-add-event-listener)
video.onerror=()=>reject(newError("Failedtoloadscreenstream"));
});

awaitvideo.play();

constwidth=video.videoWidth;
constheight=video.videoHeight;
if(!width||!height){
returnnull;
}

constcanvas=document.createElement("canvas");
canvas.width=width;
canvas.height=height;
constcontext=canvas.getContext("2d");
if(!context){
returnnull;
}

context.drawImage(video,0,0,width,height);
//canvas.toBlobusescallback-basedAPI,wrappinginPromiseisnecessary
//oxlint-disable-next-lineeslint-plugin-promise(avoid-new)
constblob=awaitnewPromise<Blob|null>((resolve)=>{
canvas.toBlob(resolve,"image/png");
});
if(!blob){
returnnull;
}

consttimestamp=newDate()
.toISOString()
.replaceAll(/[:.]/g,"-")
.replace("T","_")
.replace("Z","");

returnnewFile([blob],`screenshot-${timestamp}.png`,{
lastModified:Date.now(),
type:"image/png",
});
}finally{
if(stream){
for(consttrackofstream.getTracks()){
track.stop();
}
}
video.pause();
video.srcObject=null;
}
};

//============================================================================
//ProviderContext&Types
//============================================================================

exportinterfaceAttachmentsContext{
files:(FileUIPart&{id:string})[];
add:(files:File[]|FileList)=>void;
remove:(id:string)=>void;
clear:()=>void;
openFileDialog:()=>void;
fileInputRef:RefObject<HTMLInputElement|null>;
}

exportinterfaceTextInputContext{
value:string;
setInput:(v:string)=>void;
clear:()=>void;
}

exportinterfacePromptInputControllerProps{
textInput:TextInputContext;
attachments:AttachmentsContext;
/**INTERNAL:AllowsPromptInputtoregisteritsfiletextInput+"open"callback*/
__registerFileInput:(
ref:RefObject<HTMLInputElement|null>,
open:()=>void
)=>void;
}

constPromptInputController=createContext<PromptInputControllerProps|null>(
null
);
constProviderAttachmentsContext=createContext<AttachmentsContext|null>(
null
);

exportconstusePromptInputController=()=>{
constctx=useContext(PromptInputController);
if(!ctx){
thrownewError(
"Wrapyourcomponentinside<PromptInputProvider>touseusePromptInputController()."
);
}
returnctx;
};

//Optionalvariants(doNOTthrow).Usefulfordual-modecomponents.
constuseOptionalPromptInputController=()=>
useContext(PromptInputController);

exportconstuseProviderAttachments=()=>{
constctx=useContext(ProviderAttachmentsContext);
if(!ctx){
thrownewError(
"Wrapyourcomponentinside<PromptInputProvider>touseuseProviderAttachments()."
);
}
returnctx;
};

constuseOptionalProviderAttachments=()=>
useContext(ProviderAttachmentsContext);

exporttypePromptInputProviderProps=PropsWithChildren<{
initialInput?:string;
}>;

/**
*OptionalglobalproviderthatliftsPromptInputstateoutsideofPromptInput.
*Ifyoudon'tuseit,PromptInputstaysfullyself-managed.
*/
exportconstPromptInputProvider=({
initialInput:initialTextInput="",
children,
}:PromptInputProviderProps)=>{
//-----textInputstate
const[textInput,setTextInput]=useState(initialTextInput);
constclearInput=useCallback(()=>setTextInput(""),[]);

//-----attachmentsstate(globalwhenwrapped)
const[attachmentFiles,setAttachmentFiles]=useState<
(FileUIPart&{id:string})[]
>([]);
constfileInputRef=useRef<HTMLInputElement|null>(null);
//oxlint-disable-next-lineeslint(no-empty-function)
constopenRef=useRef<()=>void>(()=>{});

constadd=useCallback((files:File[]|FileList)=>{
constincoming=[...files];
if(incoming.length===0){
return;
}

setAttachmentFiles((prev)=>[
...prev,
...incoming.map((file)=>({
filename:file.name,
id:nanoid(),
mediaType:file.type,
type:"file"asconst,
url:URL.createObjectURL(file),
})),
]);
},[]);

constremove=useCallback((id:string)=>{
setAttachmentFiles((prev)=>{
constfound=prev.find((f)=>f.id===id);
if(found?.url){
URL.revokeObjectURL(found.url);
}
returnprev.filter((f)=>f.id!==id);
});
},[]);

constclear=useCallback(()=>{
setAttachmentFiles((prev)=>{
for(constfofprev){
if(f.url){
URL.revokeObjectURL(f.url);
}
}
return[];
});
},[]);

//Keepareftoattachmentsforcleanuponunmount(avoidsstaleclosure)
constattachmentsRef=useRef(attachmentFiles);

useEffect(()=>{
attachmentsRef.current=attachmentFiles;
},[attachmentFiles]);

//CleanupblobURLsonunmounttopreventmemoryleaks
useEffect(
()=>()=>{
for(constfofattachmentsRef.current){
if(f.url){
URL.revokeObjectURL(f.url);
}
}
},
[]
);

constopenFileDialog=useCallback(()=>{
openRef.current?.();
},[]);

constattachments=useMemo<AttachmentsContext>(
()=>({
add,
clear,
fileInputRef,
files:attachmentFiles,
openFileDialog,
remove,
}),
[attachmentFiles,add,remove,clear,openFileDialog]
);

const__registerFileInput=useCallback(
(ref:RefObject<HTMLInputElement|null>,open:()=>void)=>{
fileInputRef.current=ref.current;
openRef.current=open;
},
[]
);

constcontroller=useMemo<PromptInputControllerProps>(
()=>({
__registerFileInput,
attachments,
textInput:{
clear:clearInput,
setInput:setTextInput,
value:textInput,
},
}),
[textInput,clearInput,attachments,__registerFileInput]
);

return(
<PromptInputController.Providervalue={controller}>
<ProviderAttachmentsContext.Providervalue={attachments}>
{children}
</ProviderAttachmentsContext.Provider>
</PromptInputController.Provider>
);
};

//============================================================================
//ComponentContext&Hooks
//============================================================================

constLocalAttachmentsContext=createContext<AttachmentsContext|null>(null);

exportconstusePromptInputAttachments=()=>{
//Preferlocalcontext(insidePromptInput)asithasvalidation,fallbacktoprovider
constprovider=useOptionalProviderAttachments();
constlocal=useContext(LocalAttachmentsContext);
constcontext=local??provider;
if(!context){
thrownewError(
"usePromptInputAttachmentsmustbeusedwithinaPromptInputorPromptInputProvider"
);
}
returncontext;
};

//============================================================================
//ReferencedSources(LocaltoPromptInput)
//============================================================================

exportinterfaceReferencedSourcesContext{
sources:(SourceDocumentUIPart&{id:string})[];
add:(sources:SourceDocumentUIPart[]|SourceDocumentUIPart)=>void;
remove:(id:string)=>void;
clear:()=>void;
}

exportconstLocalReferencedSourcesContext=
createContext<ReferencedSourcesContext|null>(null);

exportconstusePromptInputReferencedSources=()=>{
constctx=useContext(LocalReferencedSourcesContext);
if(!ctx){
thrownewError(
"usePromptInputReferencedSourcesmustbeusedwithinaLocalReferencedSourcesContext.Provider"
);
}
returnctx;
};

exporttypePromptInputActionAddAttachmentsProps=ComponentProps<
typeofDropdownMenuItem
>&{
label?:string;
};

exportconstPromptInputActionAddAttachments=({
label="Addphotosorfiles",
...props
}:PromptInputActionAddAttachmentsProps)=>{
constattachments=usePromptInputAttachments();

consthandleSelect=useCallback(
(e:Event)=>{
e.preventDefault();
attachments.openFileDialog();
},
[attachments]
);

return(
<DropdownMenuItem{...props}onSelect={handleSelect}>
<ImageIconclassName="mr-2size-4"/>{label}
</DropdownMenuItem>
);
};

exporttypePromptInputActionAddScreenshotProps=ComponentProps<
typeofDropdownMenuItem
>&{
label?:string;
};

exportconstPromptInputActionAddScreenshot=({
label="Takescreenshot",
onSelect,
...props
}:PromptInputActionAddScreenshotProps)=>{
constattachments=usePromptInputAttachments();

consthandleSelect=useCallback(
async(event:Event)=>{
onSelect?.(event);
if(event.defaultPrevented){
return;
}

try{
constscreenshot=awaitcaptureScreenshot();
if(screenshot){
attachments.add([screenshot]);
}
}catch(error){
if(
errorinstanceofDOMException&&
(error.name==="NotAllowedError"||error.name==="AbortError")
){
return;
}
throwerror;
}
},
[onSelect,attachments]
);

return(
<DropdownMenuItem{...props}onSelect={handleSelect}>
<MonitorclassName="mr-2size-4"/>
{label}
</DropdownMenuItem>
);
};

exportinterfacePromptInputMessage{
text:string;
files:FileUIPart[];
}

exporttypePromptInputProps=Omit<
HTMLAttributes<HTMLFormElement>,
"onSubmit"|"onError"
>&{
//e.g.,"image/*"orleaveundefinedforany
accept?:string;
multiple?:boolean;
//Whentrue,acceptsdropsanywhereondocument.Defaultfalse(opt-in).
globalDrop?:boolean;
//Renderahiddeninputwithgivennameandkeepitinsyncfornativeformposts.Defaultfalse.
syncHiddenInput?:boolean;
//Minimalconstraints
maxFiles?:number;
//bytes
maxFileSize?:number;
onError?:(err:{
code:"max_files"|"max_file_size"|"accept";
message:string;
})=>void;
onSubmit:(
message:PromptInputMessage,
event:FormEvent<HTMLFormElement>
)=>void|Promise<void>;
};

exportconstPromptInput=({
className,
accept,
multiple,
globalDrop,
syncHiddenInput,
maxFiles,
maxFileSize,
onError,
onSubmit,
children,
...props
}:PromptInputProps)=>{
//Trytouseaprovidercontrollerifpresent
constcontroller=useOptionalPromptInputController();
constusingProvider=!!controller;

//Refs
constinputRef=useRef<HTMLInputElement|null>(null);
constformRef=useRef<HTMLFormElement|null>(null);

//-----Localattachments(onlyusedwhennoprovider)
const[items,setItems]=useState<(FileUIPart&{id:string})[]>([]);
constfiles=usingProvider?controller.attachments.files:items;

//-----Localreferencedsources(alwayslocaltoPromptInput)
const[referencedSources,setReferencedSources]=useState<
(SourceDocumentUIPart&{id:string})[]
>([]);

//Keepareftofilesforcleanuponunmount(avoidsstaleclosure)
constfilesRef=useRef(files);

useEffect(()=>{
filesRef.current=files;
},[files]);

constopenFileDialogLocal=useCallback(()=>{
inputRef.current?.click();
},[]);

constmatchesAccept=useCallback(
(f:File)=>{
if(!accept||accept.trim()===""){
returntrue;
}

constpatterns=accept
.split(",")
.map((s)=>s.trim())
.filter(Boolean);

returnpatterns.some((pattern)=>{
if(pattern.endsWith("/*")){
//e.g:image/*->image/
constprefix=pattern.slice(0,-1);
returnf.type.startsWith(prefix);
}
returnf.type===pattern;
});
},
[accept]
);

constaddLocal=useCallback(
(fileList:File[]|FileList)=>{
constincoming=[...fileList];
constaccepted=incoming.filter((f)=>matchesAccept(f));
if(incoming.length&&accepted.length===0){
onError?.({
code:"accept",
message:"Nofilesmatchtheacceptedtypes.",
});
return;
}
constwithinSize=(f:File)=>
maxFileSize?f.size<=maxFileSize:true;
constsized=accepted.filter(withinSize);
if(accepted.length>0&&sized.length===0){
onError?.({
code:"max_file_size",
message:"Allfilesexceedthemaximumsize.",
});
return;
}

setItems((prev)=>{
constcapacity=
typeofmaxFiles==="number"
?Math.max(0,maxFiles-prev.length)
:undefined;
constcapped=
typeofcapacity==="number"?sized.slice(0,capacity):sized;
if(typeofcapacity==="number"&&sized.length>capacity){
onError?.({
code:"max_files",
message:"Toomanyfiles.Somewerenotadded.",
});
}
constnext:(FileUIPart&{id:string})[]=[];
for(constfileofcapped){
next.push({
filename:file.name,
id:nanoid(),
mediaType:file.type,
type:"file",
url:URL.createObjectURL(file),
});
}
return[...prev,...next];
});
},
[matchesAccept,maxFiles,maxFileSize,onError]
);

constremoveLocal=useCallback(
(id:string)=>
setItems((prev)=>{
constfound=prev.find((file)=>file.id===id);
if(found?.url){
URL.revokeObjectURL(found.url);
}
returnprev.filter((file)=>file.id!==id);
}),
[]
);

//Wrapperthatvalidatesfilesbeforecallingprovider'sadd
constaddWithProviderValidation=useCallback(
(fileList:File[]|FileList)=>{
constincoming=[...fileList];
constaccepted=incoming.filter((f)=>matchesAccept(f));
if(incoming.length&&accepted.length===0){
onError?.({
code:"accept",
message:"Nofilesmatchtheacceptedtypes.",
});
return;
}
constwithinSize=(f:File)=>
maxFileSize?f.size<=maxFileSize:true;
constsized=accepted.filter(withinSize);
if(accepted.length>0&&sized.length===0){
onError?.({
code:"max_file_size",
message:"Allfilesexceedthemaximumsize.",
});
return;
}

constcurrentCount=files.length;
constcapacity=
typeofmaxFiles==="number"
?Math.max(0,maxFiles-currentCount)
:undefined;
constcapped=
typeofcapacity==="number"?sized.slice(0,capacity):sized;
if(typeofcapacity==="number"&&sized.length>capacity){
onError?.({
code:"max_files",
message:"Toomanyfiles.Somewerenotadded.",
});
}

if(capped.length>0){
controller?.attachments.add(capped);
}
},
[matchesAccept,maxFileSize,maxFiles,onError,files.length,controller]
);

constclearAttachments=useCallback(
()=>
usingProvider
?controller?.attachments.clear()
:setItems((prev)=>{
for(constfileofprev){
if(file.url){
URL.revokeObjectURL(file.url);
}
}
return[];
}),
[usingProvider,controller]
);

constclearReferencedSources=useCallback(
()=>setReferencedSources([]),
[]
);

constadd=usingProvider?addWithProviderValidation:addLocal;
constremove=usingProvider?controller.attachments.remove:removeLocal;
constopenFileDialog=usingProvider
?controller.attachments.openFileDialog
:openFileDialogLocal;

constclear=useCallback(()=>{
clearAttachments();
clearReferencedSources();
},[clearAttachments,clearReferencedSources]);

//LetproviderknowaboutourhiddenfileinputsoexternalmenuscancallopenFileDialog()
useEffect(()=>{
if(!usingProvider){
return;
}
controller.__registerFileInput(inputRef,()=>inputRef.current?.click());
},[usingProvider,controller]);

//Note:Fileinputcannotbeprogrammaticallysetforsecurityreasons
//ThesyncHiddenInputpropisnolongerfunctional
useEffect(()=>{
if(syncHiddenInput&&inputRef.current&&files.length===0){
inputRef.current.value="";
}
},[files,syncHiddenInput]);

//Attachdrophandlersonnearestformanddocument(opt-in)
useEffect(()=>{
constform=formRef.current;
if(!form){
return;
}
if(globalDrop){
//whenglobaldropison,letthedocument-levelhandlerowndrops
return;
}

constonDragOver=(e:DragEvent)=>{
if(e.dataTransfer?.types?.includes("Files")){
e.preventDefault();
}
};
constonDrop=(e:DragEvent)=>{
if(e.dataTransfer?.types?.includes("Files")){
e.preventDefault();
}
if(e.dataTransfer?.files&&e.dataTransfer.files.length>0){
add(e.dataTransfer.files);
}
};
form.addEventListener("dragover",onDragOver);
form.addEventListener("drop",onDrop);
return()=>{
form.removeEventListener("dragover",onDragOver);
form.removeEventListener("drop",onDrop);
};
},[add,globalDrop]);

useEffect(()=>{
if(!globalDrop){
return;
}

constonDragOver=(e:DragEvent)=>{
if(e.dataTransfer?.types?.includes("Files")){
e.preventDefault();
}
};
constonDrop=(e:DragEvent)=>{
if(e.dataTransfer?.types?.includes("Files")){
e.preventDefault();
}
if(e.dataTransfer?.files&&e.dataTransfer.files.length>0){
add(e.dataTransfer.files);
}
};
document.addEventListener("dragover",onDragOver);
document.addEventListener("drop",onDrop);
return()=>{
document.removeEventListener("dragover",onDragOver);
document.removeEventListener("drop",onDrop);
};
},[add,globalDrop]);

useEffect(
()=>()=>{
if(!usingProvider){
for(constfoffilesRef.current){
if(f.url){
URL.revokeObjectURL(f.url);
}
}
}
},
[usingProvider]
);

consthandleChange:ChangeEventHandler<HTMLInputElement>=useCallback(
(event)=>{
if(event.currentTarget.files){
add(event.currentTarget.files);
}
//Resetinputvaluetoallowselectingfilesthatwerepreviouslyremoved
event.currentTarget.value="";
},
[add]
);

constattachmentsCtx=useMemo<AttachmentsContext>(
()=>({
add,
clear:clearAttachments,
fileInputRef:inputRef,
files:files.map((item)=>({...item,id:item.id})),
openFileDialog,
remove,
}),
[files,add,remove,clearAttachments,openFileDialog]
);

constrefsCtx=useMemo<ReferencedSourcesContext>(
()=>({
add:(incoming:SourceDocumentUIPart[]|SourceDocumentUIPart)=>{
constarray=Array.isArray(incoming)?incoming:[incoming];
setReferencedSources((prev)=>[
...prev,
...array.map((s)=>({...s,id:nanoid()})),
]);
},
clear:clearReferencedSources,
remove:(id:string)=>{
setReferencedSources((prev)=>prev.filter((s)=>s.id!==id));
},
sources:referencedSources,
}),
[referencedSources,clearReferencedSources]
);

consthandleSubmit:FormEventHandler<HTMLFormElement>=useCallback(
async(event)=>{
event.preventDefault();

constform=event.currentTarget;
consttext=usingProvider
?controller.textInput.value
:(()=>{
constformData=newFormData(form);
return(formData.get("message")asstring)||"";
})();

//Resetformimmediatelyaftercapturingtexttoavoidracecondition
//whereuserinputduringasyncblobconversionwouldbelost
if(!usingProvider){
form.reset();
}

try{
//ConvertblobURLstodataURLsasynchronously
constconvertedFiles:FileUIPart[]=awaitPromise.all(
files.map(async({id:_id,...item})=>{
if(item.url?.startsWith("blob:")){
constdataUrl=awaitconvertBlobUrlToDataUrl(item.url);
//Ifconversionfailed,keeptheoriginalblobURL
return{
...item,
url:dataUrl??item.url,
};
}
returnitem;
})
);

constresult=onSubmit({files:convertedFiles,text},event);

//HandlebothsyncandasynconSubmit
if(resultinstanceofPromise){
try{
awaitresult;
clear();
if(usingProvider){
controller.textInput.clear();
}
}catch{
//Don'tclearonerror-usermaywanttoretry
}
}else{
//Syncfunctioncompletedwithoutthrowing,clearinputs
clear();
if(usingProvider){
controller.textInput.clear();
}
}
}catch{
//Don'tclearonerror-usermaywanttoretry
}
},
[usingProvider,controller,files,onSubmit,clear]
);

//Renderwithorwithoutlocalprovider
constinner=(
<>
<input
accept={accept}
aria-label="Uploadfiles"
className="hidden"
multiple={multiple}
onChange={handleChange}
ref={inputRef}
title="Uploadfiles"
type="file"
/>
<form
className={cn("w-full",className)}
onSubmit={handleSubmit}
ref={formRef}
{...props}
>
<InputGroupclassName="overflow-hidden">{children}</InputGroup>
</form>
</>
);

constwithReferencedSources=(
<LocalReferencedSourcesContext.Providervalue={refsCtx}>
{inner}
</LocalReferencedSourcesContext.Provider>
);

//AlwaysprovideLocalAttachmentsContextsochildrengetvalidatedaddfunction
return(
<LocalAttachmentsContext.Providervalue={attachmentsCtx}>
{withReferencedSources}
</LocalAttachmentsContext.Provider>
);
};

exporttypePromptInputBodyProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputBody=({
className,
...props
}:PromptInputBodyProps)=>(
<divclassName={cn("contents",className)}{...props}/>
);

exporttypePromptInputTextareaProps=ComponentProps<
typeofInputGroupTextarea
>;

exportconstPromptInputTextarea=({
onChange,
onKeyDown,
className,
placeholder="Whatwouldyouliketoknow?",
...props
}:PromptInputTextareaProps)=>{
constcontroller=useOptionalPromptInputController();
constattachments=usePromptInputAttachments();
const[isComposing,setIsComposing]=useState(false);

consthandleKeyDown:KeyboardEventHandler<HTMLTextAreaElement>=useCallback(
(e)=>{
//CalltheexternalonKeyDownhandlerfirst
onKeyDown?.(e);

//Iftheexternalhandlerpreventeddefault,don'truninternallogic
if(e.defaultPrevented){
return;
}

if(e.key==="Enter"){
if(isComposing||e.nativeEvent.isComposing){
return;
}
if(e.shiftKey){
return;
}
e.preventDefault();

//Checkifthesubmitbuttonisdisabledbeforesubmitting
const{form}=e.currentTarget;
constsubmitButton=form?.querySelector(
'button[type="submit"]'
)asHTMLButtonElement|null;
if(submitButton?.disabled){
return;
}

form?.requestSubmit();
}

//RemovelastattachmentwhenBackspaceispressedandtextareaisempty
if(
e.key==="Backspace"&&
e.currentTarget.value===""&&
attachments.files.length>0
){
e.preventDefault();
constlastAttachment=attachments.files.at(-1);
if(lastAttachment){
attachments.remove(lastAttachment.id);
}
}
},
[onKeyDown,isComposing,attachments]
);

consthandlePaste:ClipboardEventHandler<HTMLTextAreaElement>=useCallback(
(event)=>{
constitems=event.clipboardData?.items;

if(!items){
return;
}

constfiles:File[]=[];

for(constitemofitems){
if(item.kind==="file"){
constfile=item.getAsFile();
if(file){
files.push(file);
}
}
}

if(files.length>0){
event.preventDefault();
attachments.add(files);
}
},
[attachments]
);

consthandleCompositionEnd=useCallback(()=>setIsComposing(false),[]);
consthandleCompositionStart=useCallback(()=>setIsComposing(true),[]);

constcontrolledProps=controller
?{
onChange:(e:ChangeEvent<HTMLTextAreaElement>)=>{
controller.textInput.setInput(e.currentTarget.value);
onChange?.(e);
},
value:controller.textInput.value,
}
:{
onChange,
};

return(
<InputGroupTextarea
className={cn("field-sizing-contentmax-h-48min-h-16",className)}
name="message"
onCompositionEnd={handleCompositionEnd}
onCompositionStart={handleCompositionStart}
onKeyDown={handleKeyDown}
onPaste={handlePaste}
placeholder={placeholder}
{...props}
{...controlledProps}
/>
);
};

exporttypePromptInputHeaderProps=Omit<
ComponentProps<typeofInputGroupAddon>,
"align"
>;

exportconstPromptInputHeader=({
className,
...props
}:PromptInputHeaderProps)=>(
<InputGroupAddon
align="block-end"
className={cn("order-firstflex-wrapgap-1",className)}
{...props}
/>
);

exporttypePromptInputFooterProps=Omit<
ComponentProps<typeofInputGroupAddon>,
"align"
>;

exportconstPromptInputFooter=({
className,
...props
}:PromptInputFooterProps)=>(
<InputGroupAddon
align="block-end"
className={cn("justify-betweengap-1",className)}
{...props}
/>
);

exporttypePromptInputToolsProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputTools=({
className,
...props
}:PromptInputToolsProps)=>(
<div
className={cn("flexmin-w-0items-centergap-1",className)}
{...props}
/>
);

exporttypePromptInputButtonTooltip=
|string
|{
content:ReactNode;
shortcut?:string;
side?:ComponentProps<typeofTooltipContent>["side"];
};

exporttypePromptInputButtonProps=ComponentProps<typeofInputGroupButton>&{
tooltip?:PromptInputButtonTooltip;
};

exportconstPromptInputButton=({
variant="ghost",
className,
size,
tooltip,
...props
}:PromptInputButtonProps)=>{
constnewSize=
size??(Children.count(props.children)>1?"sm":"icon-sm");

constbutton=(
<InputGroupButton
className={cn(className)}
size={newSize}
type="button"
variant={variant}
{...props}
/>
);

if(!tooltip){
returnbutton;
}

consttooltipContent=
typeoftooltip==="string"?tooltip:tooltip.content;
constshortcut=typeoftooltip==="string"?undefined:tooltip.shortcut;
constside=typeoftooltip==="string"?"top":(tooltip.side??"top");

return(
<Tooltip>
<TooltipTriggerasChild>{button}</TooltipTrigger>
<TooltipContentside={side}>
{tooltipContent}
{shortcut&&(
<spanclassName="ml-2text-muted-foreground">{shortcut}</span>
)}
</TooltipContent>
</Tooltip>
);
};

exporttypePromptInputActionMenuProps=ComponentProps<typeofDropdownMenu>;
exportconstPromptInputActionMenu=(props:PromptInputActionMenuProps)=>(
<DropdownMenu{...props}/>
);

exporttypePromptInputActionMenuTriggerProps=PromptInputButtonProps;

exportconstPromptInputActionMenuTrigger=({
className,
children,
...props
}:PromptInputActionMenuTriggerProps)=>(
<DropdownMenuTriggerasChild>
<PromptInputButtonclassName={className}{...props}>
{children??<PlusIconclassName="size-4"/>}
</PromptInputButton>
</DropdownMenuTrigger>
);

exporttypePromptInputActionMenuContentProps=ComponentProps<
typeofDropdownMenuContent
>;
exportconstPromptInputActionMenuContent=({
className,
...props
}:PromptInputActionMenuContentProps)=>(
<DropdownMenuContentalign="start"className={cn(className)}{...props}/>
);

exporttypePromptInputActionMenuItemProps=ComponentProps<
typeofDropdownMenuItem
>;
exportconstPromptInputActionMenuItem=({
className,
...props
}:PromptInputActionMenuItemProps)=>(
<DropdownMenuItemclassName={cn(className)}{...props}/>
);

//Note:Actionsthatperformside-effects(likeopeningafiledialog)
//areprovidedinopt-inmodules(e.g.,prompt-input-attachments).

exporttypePromptInputSubmitProps=ComponentProps<typeofInputGroupButton>&{
status?:ChatStatus;
onStop?:()=>void;
};

exportconstPromptInputSubmit=({
className,
variant="default",
size="icon-sm",
status,
onStop,
onClick,
children,
...props
}:PromptInputSubmitProps)=>{
constisGenerating=status==="submitted"||status==="streaming";

letIcon=<CornerDownLeftIconclassName="size-4"/>;

if(status==="submitted"){
Icon=<Spinner/>;
}elseif(status==="streaming"){
Icon=<SquareIconclassName="size-4"/>;
}elseif(status==="error"){
Icon=<XIconclassName="size-4"/>;
}

consthandleClick=useCallback(
(e:React.MouseEvent<HTMLButtonElement>)=>{
if(isGenerating&&onStop){
e.preventDefault();
onStop();
return;
}
onClick?.(e);
},
[isGenerating,onStop,onClick]
);

return(
<InputGroupButton
aria-label={isGenerating?"Stop":"Submit"}
className={cn(className)}
onClick={handleClick}
size={size}
type={isGenerating&&onStop?"button":"submit"}
variant={variant}
{...props}
>
{children??Icon}
</InputGroupButton>
);
};

exporttypePromptInputSelectProps=ComponentProps<typeofSelect>;

exportconstPromptInputSelect=(props:PromptInputSelectProps)=>(
<Select{...props}/>
);

exporttypePromptInputSelectTriggerProps=ComponentProps<
typeofSelectTrigger
>;

exportconstPromptInputSelectTrigger=({
className,
...props
}:PromptInputSelectTriggerProps)=>(
<SelectTrigger
className={cn(
"border-nonebg-transparentfont-mediumtext-muted-foregroundshadow-nonetransition-colors",
"hover:bg-accenthover:text-foregroundaria-expanded:bg-accentaria-expanded:text-foreground",
className
)}
{...props}
/>
);

exporttypePromptInputSelectContentProps=ComponentProps<
typeofSelectContent
>;

exportconstPromptInputSelectContent=({
className,
...props
}:PromptInputSelectContentProps)=>(
<SelectContentclassName={cn(className)}{...props}/>
);

exporttypePromptInputSelectItemProps=ComponentProps<typeofSelectItem>;

exportconstPromptInputSelectItem=({
className,
...props
}:PromptInputSelectItemProps)=>(
<SelectItemclassName={cn(className)}{...props}/>
);

exporttypePromptInputSelectValueProps=ComponentProps<typeofSelectValue>;

exportconstPromptInputSelectValue=({
className,
...props
}:PromptInputSelectValueProps)=>(
<SelectValueclassName={cn(className)}{...props}/>
);

exporttypePromptInputHoverCardProps=ComponentProps<typeofHoverCard>;

exportconstPromptInputHoverCard=({
openDelay=0,
closeDelay=0,
...props
}:PromptInputHoverCardProps)=>(
<HoverCardcloseDelay={closeDelay}openDelay={openDelay}{...props}/>
);

exporttypePromptInputHoverCardTriggerProps=ComponentProps<
typeofHoverCardTrigger
>;

exportconstPromptInputHoverCardTrigger=(
props:PromptInputHoverCardTriggerProps
)=><HoverCardTrigger{...props}/>;

exporttypePromptInputHoverCardContentProps=ComponentProps<
typeofHoverCardContent
>;

exportconstPromptInputHoverCardContent=({
align="start",
...props
}:PromptInputHoverCardContentProps)=>(
<HoverCardContentalign={align}{...props}/>
);

exporttypePromptInputTabsListProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputTabsList=({
className,
...props
}:PromptInputTabsListProps)=><divclassName={cn(className)}{...props}/>;

exporttypePromptInputTabProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputTab=({
className,
...props
}:PromptInputTabProps)=><divclassName={cn(className)}{...props}/>;

exporttypePromptInputTabLabelProps=HTMLAttributes<HTMLHeadingElement>;

exportconstPromptInputTabLabel=({
className,
...props
}:PromptInputTabLabelProps)=>(
//Contentprovidedviachildreninprops
//oxlint-disable-next-lineeslint-plugin-jsx-a11y(heading-has-content)
<h3
className={cn(
"mb-2px-3font-mediumtext-muted-foregroundtext-xs",
className
)}
{...props}
/>
);

exporttypePromptInputTabBodyProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputTabBody=({
className,
...props
}:PromptInputTabBodyProps)=>(
<divclassName={cn("space-y-1",className)}{...props}/>
);

exporttypePromptInputTabItemProps=HTMLAttributes<HTMLDivElement>;

exportconstPromptInputTabItem=({
className,
...props
}:PromptInputTabItemProps)=>(
<div
className={cn(
"flexitems-centergap-2px-3py-2text-xshover:bg-accent",
className
)}
{...props}
/>
);

exporttypePromptInputCommandProps=ComponentProps<typeofCommand>;

exportconstPromptInputCommand=({
className,
...props
}:PromptInputCommandProps)=><CommandclassName={cn(className)}{...props}/>;

exporttypePromptInputCommandInputProps=ComponentProps<typeofCommandInput>;

exportconstPromptInputCommandInput=({
className,
...props
}:PromptInputCommandInputProps)=>(
<CommandInputclassName={cn(className)}{...props}/>
);

exporttypePromptInputCommandListProps=ComponentProps<typeofCommandList>;

exportconstPromptInputCommandList=({
className,
...props
}:PromptInputCommandListProps)=>(
<CommandListclassName={cn(className)}{...props}/>
);

exporttypePromptInputCommandEmptyProps=ComponentProps<typeofCommandEmpty>;

exportconstPromptInputCommandEmpty=({
className,
...props
}:PromptInputCommandEmptyProps)=>(
<CommandEmptyclassName={cn(className)}{...props}/>
);

exporttypePromptInputCommandGroupProps=ComponentProps<typeofCommandGroup>;

exportconstPromptInputCommandGroup=({
className,
...props
}:PromptInputCommandGroupProps)=>(
<CommandGroupclassName={cn(className)}{...props}/>
);

exporttypePromptInputCommandItemProps=ComponentProps<typeofCommandItem>;

exportconstPromptInputCommandItem=({
className,
...props
}:PromptInputCommandItemProps)=>(
<CommandItemclassName={cn(className)}{...props}/>
);

exporttypePromptInputCommandSeparatorProps=ComponentProps<
typeofCommandSeparator
>;

exportconstPromptInputCommandSeparator=({
className,
...props
}:PromptInputCommandSeparatorProps)=>(
<CommandSeparatorclassName={cn(className)}{...props}/>
);
