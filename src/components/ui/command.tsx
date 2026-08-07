"useclient";

import*asReactfrom"react";
import{typeDialogProps}from"@radix-ui/react-dialog";
import{CommandasCommandPrimitive}from"cmdk";
import{Search}from"lucide-react";

import{cn}from"@/lib/utils";
import{Dialog,DialogContent}from"@/components/ui/dialog";

constCommand=React.forwardRef<
React.ElementRef<typeofCommandPrimitive>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive>
>(({className,...props},ref)=>(
<CommandPrimitive
ref={ref}
className={cn(
"flexh-fullw-fullflex-coloverflow-hiddenrounded-mdbg-popovertext-popover-foreground",
className,
)}
{...props}
/>
));
Command.displayName=CommandPrimitive.displayName;

constCommandDialog=({children,...props}:DialogProps)=>{
return(
<Dialog{...props}>
<DialogContentclassName="overflow-hiddenp-0">
<CommandclassName="[&_[cmdk-group-heading]]:px-2[&_[cmdk-group-heading]]:font-medium[&_[cmdk-group-heading]]:text-muted-foreground[&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0[&_[cmdk-group]]:px-2[&_[cmdk-input-wrapper]_svg]:h-5[&_[cmdk-input-wrapper]_svg]:w-5[&_[cmdk-input]]:h-12[&_[cmdk-item]]:px-2[&_[cmdk-item]]:py-3[&_[cmdk-item]_svg]:h-5[&_[cmdk-item]_svg]:w-5">
{children}
</Command>
</DialogContent>
</Dialog>
);
};

constCommandInput=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.Input>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.Input>
>(({className,...props},ref)=>(
<divclassName="flexitems-centerborder-bpx-3"cmdk-input-wrapper="">
<SearchclassName="mr-2h-4w-4shrink-0opacity-50"/>
<CommandPrimitive.Input
ref={ref}
className={cn(
"flexh-10w-fullrounded-mdbg-transparentpy-3text-smoutline-noneplaceholder:text-muted-foregrounddisabled:cursor-not-alloweddisabled:opacity-50",
className,
)}
{...props}
/>
</div>
));

CommandInput.displayName=CommandPrimitive.Input.displayName;

constCommandList=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.List>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.List>
>(({className,...props},ref)=>(
<CommandPrimitive.List
ref={ref}
className={cn("max-h-[300px]overflow-y-autooverflow-x-hidden",className)}
{...props}
/>
));

CommandList.displayName=CommandPrimitive.List.displayName;

constCommandEmpty=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.Empty>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.Empty>
>((props,ref)=>(
<CommandPrimitive.Emptyref={ref}className="py-6text-centertext-sm"{...props}/>
));

CommandEmpty.displayName=CommandPrimitive.Empty.displayName;

constCommandGroup=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.Group>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.Group>
>(({className,...props},ref)=>(
<CommandPrimitive.Group
ref={ref}
className={cn(
"overflow-hiddenp-1text-foreground[&_[cmdk-group-heading]]:px-2[&_[cmdk-group-heading]]:py-1.5[&_[cmdk-group-heading]]:text-xs[&_[cmdk-group-heading]]:font-medium[&_[cmdk-group-heading]]:text-muted-foreground",
className,
)}
{...props}
/>
));

CommandGroup.displayName=CommandPrimitive.Group.displayName;

constCommandSeparator=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.Separator>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.Separator>
>(({className,...props},ref)=>(
<CommandPrimitive.Separator
ref={ref}
className={cn("-mx-1h-pxbg-border",className)}
{...props}
/>
));
CommandSeparator.displayName=CommandPrimitive.Separator.displayName;

constCommandItem=React.forwardRef<
React.ElementRef<typeofCommandPrimitive.Item>,
React.ComponentPropsWithoutRef<typeofCommandPrimitive.Item>
>(({className,...props},ref)=>(
<CommandPrimitive.Item
ref={ref}
className={cn(
"relativeflexcursor-defaultgap-2select-noneitems-centerrounded-smpx-2py-1.5text-smoutline-nonedata-[disabled=true]:pointer-events-nonedata-[selected=true]:bg-accentdata-[selected=true]:text-accent-foregrounddata-[disabled=true]:opacity-50[&_svg]:pointer-events-none[&_svg]:size-4[&_svg]:shrink-0",
className,
)}
{...props}
/>
));

CommandItem.displayName=CommandPrimitive.Item.displayName;

constCommandShortcut=({className,...props}:React.HTMLAttributes<HTMLSpanElement>)=>{
return(
<span
className={cn("ml-autotext-xstracking-widesttext-muted-foreground",className)}
{...props}
/>
);
};
CommandShortcut.displayName="CommandShortcut";

export{
Command,
CommandDialog,
CommandInput,
CommandList,
CommandEmpty,
CommandGroup,
CommandItem,
CommandShortcut,
CommandSeparator,
};
