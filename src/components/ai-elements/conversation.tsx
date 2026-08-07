"useclient";

import{Button}from"@/components/ui/button";
import{cn}from"@/lib/utils";
importtype{UIMessage}from"ai";
import{ArrowDownIcon,DownloadIcon}from"lucide-react";
importtype{ComponentProps}from"react";
import{useCallback}from"react";
import{StickToBottom,useStickToBottomContext}from"use-stick-to-bottom";

exporttypeConversationProps=ComponentProps<typeofStickToBottom>;

exportconstConversation=({className,...props}:ConversationProps)=>(
<StickToBottom
className={cn("relativeflex-1overflow-y-hidden",className)}
initial="smooth"
resize="smooth"
role="log"
{...props}
/>
);

exporttypeConversationContentProps=ComponentProps<
typeofStickToBottom.Content
>;

exportconstConversationContent=({
className,
...props
}:ConversationContentProps)=>(
<StickToBottom.Content
className={cn("flexflex-colgap-8p-4",className)}
{...props}
/>
);

exporttypeConversationEmptyStateProps=ComponentProps<"div">&{
title?:string;
description?:string;
icon?:React.ReactNode;
};

exportconstConversationEmptyState=({
className,
title="Nomessagesyet",
description="Startaconversationtoseemessageshere",
icon,
children,
...props
}:ConversationEmptyStateProps)=>(
<div
className={cn(
"flexsize-fullflex-colitems-centerjustify-centergap-3p-8text-center",
className
)}
{...props}
>
{children??(
<>
{icon&&<divclassName="text-muted-foreground">{icon}</div>}
<divclassName="space-y-1">
<h3className="font-mediumtext-sm">{title}</h3>
{description&&(
<pclassName="text-muted-foregroundtext-sm">{description}</p>
)}
</div>
</>
)}
</div>
);

exporttypeConversationScrollButtonProps=ComponentProps<typeofButton>;

exportconstConversationScrollButton=({
className,
...props
}:ConversationScrollButtonProps)=>{
const{isAtBottom,scrollToBottom}=useStickToBottomContext();

consthandleScrollToBottom=useCallback(()=>{
scrollToBottom();
},[scrollToBottom]);

return(
!isAtBottom&&(
<Button
className={cn(
"absolutebottom-4left-[50%]translate-x-[-50%]rounded-fulldark:bg-backgrounddark:hover:bg-muted",
className
)}
onClick={handleScrollToBottom}
size="icon"
type="button"
variant="outline"
{...props}
>
<ArrowDownIconclassName="size-4"/>
</Button>
)
);
};

constgetMessageText=(message:UIMessage):string=>
message.parts
.filter((part)=>part.type==="text")
.map((part)=>part.text)
.join("");

exporttypeConversationDownloadProps=Omit<
ComponentProps<typeofButton>,
"onClick"
>&{
messages:UIMessage[];
filename?:string;
formatMessage?:(message:UIMessage,index:number)=>string;
};

constdefaultFormatMessage=(message:UIMessage):string=>{
constroleLabel=
message.role.charAt(0).toUpperCase()+message.role.slice(1);
return`**${roleLabel}:**${getMessageText(message)}`;
};

exportconstmessagesToMarkdown=(
messages:UIMessage[],
formatMessage:(
message:UIMessage,
index:number
)=>string=defaultFormatMessage
):string=>messages.map((msg,i)=>formatMessage(msg,i)).join("\n\n");

exportconstConversationDownload=({
messages,
filename="conversation.md",
formatMessage=defaultFormatMessage,
className,
children,
...props
}:ConversationDownloadProps)=>{
consthandleDownload=useCallback(()=>{
constmarkdown=messagesToMarkdown(messages,formatMessage);
constblob=newBlob([markdown],{type:"text/markdown"});
consturl=URL.createObjectURL(blob);
constlink=document.createElement("a");
link.href=url;
link.download=filename;
document.body.append(link);
link.click();
link.remove();
URL.revokeObjectURL(url);
},[messages,filename,formatMessage]);

return(
<Button
className={cn(
"absolutetop-4right-4rounded-fulldark:bg-backgrounddark:hover:bg-muted",
className
)}
onClick={handleDownload}
size="icon"
type="button"
variant="outline"
{...props}
>
{children??<DownloadIconclassName="size-4"/>}
</Button>
);
};
