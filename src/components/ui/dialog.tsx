"useclient";

import*asReactfrom"react";
import*asDialogPrimitivefrom"@radix-ui/react-dialog";
import{X}from"lucide-react";

import{cn}from"@/lib/utils";

constDialog=DialogPrimitive.Root;

constDialogTrigger=DialogPrimitive.Trigger;

constDialogPortal=DialogPrimitive.Portal;

constDialogClose=DialogPrimitive.Close;

constDialogOverlay=React.forwardRef<
React.ElementRef<typeofDialogPrimitive.Overlay>,
React.ComponentPropsWithoutRef<typeofDialogPrimitive.Overlay>
>(({className,...props},ref)=>(
<DialogPrimitive.Overlay
ref={ref}
className={cn(
"fixedinset-0z-50bg-black/80data-[state=open]:animate-indata-[state=closed]:animate-outdata-[state=closed]:fade-out-0data-[state=open]:fade-in-0",
className,
)}
{...props}
/>
));
DialogOverlay.displayName=DialogPrimitive.Overlay.displayName;

constDialogContent=React.forwardRef<
React.ElementRef<typeofDialogPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofDialogPrimitive.Content>
>(({className,children,...props},ref)=>(
<DialogPortal>
<DialogOverlay/>
<DialogPrimitive.Content
ref={ref}
className={cn(
"fixedleft-[50%]top-[50%]z-50gridw-fullmax-w-lgtranslate-x-[-50%]translate-y-[-50%]gap-4borderbg-backgroundp-6shadow-lgduration-200data-[state=open]:animate-indata-[state=closed]:animate-outdata-[state=closed]:fade-out-0data-[state=open]:fade-in-0data-[state=closed]:zoom-out-95data-[state=open]:zoom-in-95sm:rounded-lg",
className,
)}
{...props}
>
{children}
<DialogPrimitive.CloseclassName="absoluteright-4top-4rounded-smopacity-70ring-offset-backgroundcursor-pointertransition-opacityhover:opacity-100focus:outline-nonefocus:ring-2focus:ring-ringfocus:ring-offset-2disabled:pointer-events-nonedata-[state=open]:bg-accentdata-[state=open]:text-muted-foreground">
<XclassName="h-4w-4"/>
<spanclassName="sr-only">Close</span>
</DialogPrimitive.Close>
</DialogPrimitive.Content>
</DialogPortal>
));
DialogContent.displayName=DialogPrimitive.Content.displayName;

constDialogHeader=({className,...props}:React.HTMLAttributes<HTMLDivElement>)=>(
<divclassName={cn("flexflex-colspace-y-1.5text-centersm:text-left",className)}{...props}/>
);
DialogHeader.displayName="DialogHeader";

constDialogFooter=({className,...props}:React.HTMLAttributes<HTMLDivElement>)=>(
<div
className={cn("flexflex-col-reversesm:flex-rowsm:justify-endsm:space-x-2",className)}
{...props}
/>
);
DialogFooter.displayName="DialogFooter";

constDialogTitle=React.forwardRef<
React.ElementRef<typeofDialogPrimitive.Title>,
React.ComponentPropsWithoutRef<typeofDialogPrimitive.Title>
>(({className,...props},ref)=>(
<DialogPrimitive.Title
ref={ref}
className={cn("text-lgfont-semiboldleading-nonetracking-tight",className)}
{...props}
/>
));
DialogTitle.displayName=DialogPrimitive.Title.displayName;

constDialogDescription=React.forwardRef<
React.ElementRef<typeofDialogPrimitive.Description>,
React.ComponentPropsWithoutRef<typeofDialogPrimitive.Description>
>(({className,...props},ref)=>(
<DialogPrimitive.Description
ref={ref}
className={cn("text-smtext-muted-foreground",className)}
{...props}
/>
));
DialogDescription.displayName=DialogPrimitive.Description.displayName;

export{
Dialog,
DialogPortal,
DialogOverlay,
DialogTrigger,
DialogClose,
DialogContent,
DialogHeader,
DialogFooter,
DialogTitle,
DialogDescription,
};
