import{GripVertical}from"lucide-react";
import{Group,Panel,Separator}from"react-resizable-panels";

import{cn}from"@/lib/utils";

constResizablePanelGroup=({className,...props}:React.ComponentProps<typeofGroup>)=>(
<Group
className={cn("flexh-fullw-fulldata-[panel-group-direction=vertical]:flex-col",className)}
{...props}
/>
);

constResizablePanel=Panel;

constResizableHandle=({
withHandle,
className,
...props
}:React.ComponentProps<typeofSeparator>&{
withHandle?:boolean;
})=>(
<Separator
className={cn(
"relativeflexw-pxitems-centerjustify-centerbg-borderafter:absoluteafter:inset-y-0after:left-1/2after:w-1after:-translate-x-1/2focus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringfocus-visible:ring-offset-1data-[panel-group-direction=vertical]:h-pxdata-[panel-group-direction=vertical]:w-fulldata-[panel-group-direction=vertical]:after:left-0data-[panel-group-direction=vertical]:after:h-1data-[panel-group-direction=vertical]:after:w-fulldata-[panel-group-direction=vertical]:after:-translate-y-1/2data-[panel-group-direction=vertical]:after:translate-x-0[&[data-panel-group-direction=vertical]>div]:rotate-90",
className,
)}
{...props}
>
{withHandle&&(
<divclassName="z-10flexh-4w-3items-centerjustify-centerrounded-smborderbg-border">
<GripVerticalclassName="h-2.5w-2.5"/>
</div>
)}
</Separator>
);

export{ResizablePanelGroup,ResizablePanel,ResizableHandle};
