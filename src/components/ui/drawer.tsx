import*asReactfrom"react";
import{DrawerasDrawerPrimitive}from"vaul";

import{cn}from"@/lib/utils";

constDrawer=({
shouldScaleBackground=true,
...props
}:React.ComponentProps<typeofDrawerPrimitive.Root>)=>(
<DrawerPrimitive.RootshouldScaleBackground={shouldScaleBackground}{...props}/>
);
Drawer.displayName="Drawer";

constDrawerTrigger=DrawerPrimitive.Trigger;

constDrawerPortal=DrawerPrimitive.Portal;

constDrawerClose=DrawerPrimitive.Close;

constDrawerOverlay=React.forwardRef<
React.ElementRef<typeofDrawerPrimitive.Overlay>,
React.ComponentPropsWithoutRef<typeofDrawerPrimitive.Overlay>
>(({className,...props},ref)=>(
<DrawerPrimitive.Overlay
ref={ref}
className={cn("fixedinset-0z-50bg-black/80",className)}
{...props}
/>
));
DrawerOverlay.displayName=DrawerPrimitive.Overlay.displayName;

constDrawerContent=React.forwardRef<
React.ElementRef<typeofDrawerPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofDrawerPrimitive.Content>
>(({className,children,...props},ref)=>(
<DrawerPortal>
<DrawerOverlay/>
<DrawerPrimitive.Content
ref={ref}
className={cn(
"fixedinset-x-0bottom-0z-50mt-24flexh-autoflex-colrounded-t-[10px]borderbg-background",
className,
)}
{...props}
>
<divclassName="mx-automt-4h-2w-[100px]rounded-fullbg-muted"/>
{children}
</DrawerPrimitive.Content>
</DrawerPortal>
));
DrawerContent.displayName="DrawerContent";

constDrawerHeader=({className,...props}:React.HTMLAttributes<HTMLDivElement>)=>(
<divclassName={cn("gridgap-1.5p-4text-centersm:text-left",className)}{...props}/>
);
DrawerHeader.displayName="DrawerHeader";

constDrawerFooter=({className,...props}:React.HTMLAttributes<HTMLDivElement>)=>(
<divclassName={cn("mt-autoflexflex-colgap-2p-4",className)}{...props}/>
);
DrawerFooter.displayName="DrawerFooter";

constDrawerTitle=React.forwardRef<
React.ElementRef<typeofDrawerPrimitive.Title>,
React.ComponentPropsWithoutRef<typeofDrawerPrimitive.Title>
>(({className,...props},ref)=>(
<DrawerPrimitive.Title
ref={ref}
className={cn("text-lgfont-semiboldleading-nonetracking-tight",className)}
{...props}
/>
));
DrawerTitle.displayName=DrawerPrimitive.Title.displayName;

constDrawerDescription=React.forwardRef<
React.ElementRef<typeofDrawerPrimitive.Description>,
React.ComponentPropsWithoutRef<typeofDrawerPrimitive.Description>
>(({className,...props},ref)=>(
<DrawerPrimitive.Description
ref={ref}
className={cn("text-smtext-muted-foreground",className)}
{...props}
/>
));
DrawerDescription.displayName=DrawerPrimitive.Description.displayName;

export{
Drawer,
DrawerPortal,
DrawerOverlay,
DrawerTrigger,
DrawerClose,
DrawerContent,
DrawerHeader,
DrawerFooter,
DrawerTitle,
DrawerDescription,
};
