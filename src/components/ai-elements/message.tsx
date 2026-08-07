"useclient";

import{Button}from"@/components/ui/button";
import{
ButtonGroup,
ButtonGroupText,
}from"@/components/ui/button-group";
import{
Tooltip,
TooltipContent,
TooltipProvider,
TooltipTrigger,
}from"@/components/ui/tooltip";
import{cn}from"@/lib/utils";
import{cjk}from"@streamdown/cjk";
import{code}from"@streamdown/code";
import{math}from"@streamdown/math";
import{mermaid}from"@streamdown/mermaid";
importtype{UIMessage}from"ai";
import{ChevronLeftIcon,ChevronRightIcon}from"lucide-react";
importtype{ComponentProps,HTMLAttributes,ReactElement}from"react";
import{
createContext,
memo,
useCallback,
useContext,
useEffect,
useMemo,
useState,
}from"react";
import{Streamdown}from"streamdown";

exporttypeMessageProps=HTMLAttributes<HTMLDivElement>&{
from:UIMessage["role"];
};

exportconstMessage=({className,from,...props}:MessageProps)=>(
<div
className={cn(
"groupflexw-fullmax-w-[95%]flex-colgap-2",
from==="user"?"is-userml-autojustify-end":"is-assistant",
className
)}
{...props}
/>
);

exporttypeMessageContentProps=HTMLAttributes<HTMLDivElement>;

exportconstMessageContent=({
children,
className,
...props
}:MessageContentProps)=>(
<div
className={cn(
"is-user:darkflexw-fitmin-w-0max-w-fullflex-colgap-2overflow-hiddentext-sm",
"group-[.is-user]:ml-autogroup-[.is-user]:rounded-lggroup-[.is-user]:bg-secondarygroup-[.is-user]:px-4group-[.is-user]:py-3group-[.is-user]:text-foreground",
"group-[.is-assistant]:text-foreground",
className
)}
{...props}
>
{children}
</div>
);

exporttypeMessageActionsProps=ComponentProps<"div">;

exportconstMessageActions=({
className,
children,
...props
}:MessageActionsProps)=>(
<divclassName={cn("flexitems-centergap-1",className)}{...props}>
{children}
</div>
);

exporttypeMessageActionProps=ComponentProps<typeofButton>&{
tooltip?:string;
label?:string;
};

exportconstMessageAction=({
tooltip,
children,
label,
variant="ghost",
size="icon-sm",
...props
}:MessageActionProps)=>{
constbutton=(
<Buttonsize={size}type="button"variant={variant}{...props}>
{children}
<spanclassName="sr-only">{label||tooltip}</span>
</Button>
);

if(tooltip){
return(
<TooltipProvider>
<Tooltip>
<TooltipTriggerasChild>{button}</TooltipTrigger>
<TooltipContent>
<p>{tooltip}</p>
</TooltipContent>
</Tooltip>
</TooltipProvider>
);
}

returnbutton;
};

interfaceMessageBranchContextType{
currentBranch:number;
totalBranches:number;
goToPrevious:()=>void;
goToNext:()=>void;
branches:ReactElement[];
setBranches:(branches:ReactElement[])=>void;
}

constMessageBranchContext=createContext<MessageBranchContextType|null>(
null
);

constuseMessageBranch=()=>{
constcontext=useContext(MessageBranchContext);

if(!context){
thrownewError(
"MessageBranchcomponentsmustbeusedwithinMessageBranch"
);
}

returncontext;
};

exporttypeMessageBranchProps=HTMLAttributes<HTMLDivElement>&{
defaultBranch?:number;
onBranchChange?:(branchIndex:number)=>void;
};

exportconstMessageBranch=({
defaultBranch=0,
onBranchChange,
className,
...props
}:MessageBranchProps)=>{
const[currentBranch,setCurrentBranch]=useState(defaultBranch);
const[branches,setBranches]=useState<ReactElement[]>([]);

consthandleBranchChange=useCallback(
(newBranch:number)=>{
setCurrentBranch(newBranch);
onBranchChange?.(newBranch);
},
[onBranchChange]
);

constgoToPrevious=useCallback(()=>{
constnewBranch=
currentBranch>0?currentBranch-1:branches.length-1;
handleBranchChange(newBranch);
},[currentBranch,branches.length,handleBranchChange]);

constgoToNext=useCallback(()=>{
constnewBranch=
currentBranch<branches.length-1?currentBranch+1:0;
handleBranchChange(newBranch);
},[currentBranch,branches.length,handleBranchChange]);

constcontextValue=useMemo<MessageBranchContextType>(
()=>({
branches,
currentBranch,
goToNext,
goToPrevious,
setBranches,
totalBranches:branches.length,
}),
[branches,currentBranch,goToNext,goToPrevious]
);

return(
<MessageBranchContext.Providervalue={contextValue}>
<div
className={cn("gridw-fullgap-2[&>div]:pb-0",className)}
{...props}
/>
</MessageBranchContext.Provider>
);
};

exporttypeMessageBranchContentProps=HTMLAttributes<HTMLDivElement>;

exportconstMessageBranchContent=({
children,
...props
}:MessageBranchContentProps)=>{
const{currentBranch,setBranches,branches}=useMessageBranch();
constchildrenArray=useMemo(
()=>(Array.isArray(children)?children:[children]),
[children]
);

//UseuseEffecttoupdatebrancheswhentheychange
useEffect(()=>{
if(branches.length!==childrenArray.length){
setBranches(childrenArray);
}
},[childrenArray,branches,setBranches]);

returnchildrenArray.map((branch,index)=>(
<div
className={cn(
"gridgap-2overflow-hidden[&>div]:pb-0",
index===currentBranch?"block":"hidden"
)}
key={branch.key}
{...props}
>
{branch}
</div>
));
};

exporttypeMessageBranchSelectorProps=ComponentProps<typeofButtonGroup>;

exportconstMessageBranchSelector=({
className,
...props
}:MessageBranchSelectorProps)=>{
const{totalBranches}=useMessageBranch();

//Don'trenderifthere'sonlyonebranch
if(totalBranches<=1){
returnnull;
}

return(
<ButtonGroup
className={cn(
"[&>*:not(:first-child)]:rounded-l-md[&>*:not(:last-child)]:rounded-r-md",
className
)}
orientation="horizontal"
{...props}
/>
);
};

exporttypeMessageBranchPreviousProps=ComponentProps<typeofButton>;

exportconstMessageBranchPrevious=({
children,
...props
}:MessageBranchPreviousProps)=>{
const{goToPrevious,totalBranches}=useMessageBranch();

return(
<Button
aria-label="Previousbranch"
disabled={totalBranches<=1}
onClick={goToPrevious}
size="icon-sm"
type="button"
variant="ghost"
{...props}
>
{children??<ChevronLeftIconsize={14}/>}
</Button>
);
};

exporttypeMessageBranchNextProps=ComponentProps<typeofButton>;

exportconstMessageBranchNext=({
children,
...props
}:MessageBranchNextProps)=>{
const{goToNext,totalBranches}=useMessageBranch();

return(
<Button
aria-label="Nextbranch"
disabled={totalBranches<=1}
onClick={goToNext}
size="icon-sm"
type="button"
variant="ghost"
{...props}
>
{children??<ChevronRightIconsize={14}/>}
</Button>
);
};

exporttypeMessageBranchPageProps=HTMLAttributes<HTMLSpanElement>;

exportconstMessageBranchPage=({
className,
...props
}:MessageBranchPageProps)=>{
const{currentBranch,totalBranches}=useMessageBranch();

return(
<ButtonGroupText
className={cn(
"border-nonebg-transparenttext-muted-foregroundshadow-none",
className
)}
{...props}
>
{currentBranch+1}of{totalBranches}
</ButtonGroupText>
);
};

exporttypeMessageResponseProps=ComponentProps<typeofStreamdown>;

conststreamdownPlugins={cjk,code,math,mermaid};

exportconstMessageResponse=memo(
({className,...props}:MessageResponseProps)=>(
<Streamdown
className={cn(
"size-full[&>*:first-child]:mt-0[&>*:last-child]:mb-0",
className
)}
plugins={streamdownPlugins}
{...props}
/>
),
(prevProps,nextProps)=>
prevProps.children===nextProps.children&&
nextProps.isAnimating===prevProps.isAnimating
);

MessageResponse.displayName="MessageResponse";

exporttypeMessageToolbarProps=ComponentProps<"div">;

exportconstMessageToolbar=({
className,
children,
...props
}:MessageToolbarProps)=>(
<div
className={cn(
"mt-4flexw-fullitems-centerjustify-betweengap-4",
className
)}
{...props}
>
{children}
</div>
);
