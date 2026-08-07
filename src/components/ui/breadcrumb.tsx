import*asReactfrom"react";
import{Slot}from"@radix-ui/react-slot";
import{ChevronRight,MoreHorizontal}from"lucide-react";

import{cn}from"@/lib/utils";

constBreadcrumb=React.forwardRef<
HTMLElement,
React.ComponentPropsWithoutRef<"nav">&{
separator?:React.ReactNode;
}
>(({...props},ref)=><navref={ref}aria-label="breadcrumb"{...props}/>);
Breadcrumb.displayName="Breadcrumb";

constBreadcrumbList=React.forwardRef<HTMLOListElement,React.ComponentPropsWithoutRef<"ol">>(
({className,...props},ref)=>(
<ol
ref={ref}
className={cn(
"flexflex-wrapitems-centergap-1.5break-wordstext-smtext-muted-foregroundsm:gap-2.5",
className,
)}
{...props}
/>
),
);
BreadcrumbList.displayName="BreadcrumbList";

constBreadcrumbItem=React.forwardRef<HTMLLIElement,React.ComponentPropsWithoutRef<"li">>(
({className,...props},ref)=>(
<liref={ref}className={cn("inline-flexitems-centergap-1.5",className)}{...props}/>
),
);
BreadcrumbItem.displayName="BreadcrumbItem";

constBreadcrumbLink=React.forwardRef<
HTMLAnchorElement,
React.ComponentPropsWithoutRef<"a">&{
asChild?:boolean;
}
>(({asChild,className,...props},ref)=>{
constComp=asChild?Slot:"a";

return(
<Comp
ref={ref}
className={cn("transition-colorshover:text-foreground",className)}
{...props}
/>
);
});
BreadcrumbLink.displayName="BreadcrumbLink";

constBreadcrumbPage=React.forwardRef<HTMLSpanElement,React.ComponentPropsWithoutRef<"span">>(
({className,...props},ref)=>(
<span
ref={ref}
role="link"
aria-disabled="true"
aria-current="page"
className={cn("font-normaltext-foreground",className)}
{...props}
/>
),
);
BreadcrumbPage.displayName="BreadcrumbPage";

constBreadcrumbSeparator=({children,className,...props}:React.ComponentProps<"li">)=>(
<li
role="presentation"
aria-hidden="true"
className={cn("[&>svg]:w-3.5[&>svg]:h-3.5",className)}
{...props}
>
{children??<ChevronRight/>}
</li>
);
BreadcrumbSeparator.displayName="BreadcrumbSeparator";

constBreadcrumbEllipsis=({className,...props}:React.ComponentProps<"span">)=>(
<span
role="presentation"
aria-hidden="true"
className={cn("flexh-9w-9items-centerjustify-center",className)}
{...props}
>
<MoreHorizontalclassName="h-4w-4"/>
<spanclassName="sr-only">More</span>
</span>
);
BreadcrumbEllipsis.displayName="BreadcrumbElipssis";

export{
Breadcrumb,
BreadcrumbList,
BreadcrumbItem,
BreadcrumbLink,
BreadcrumbPage,
BreadcrumbSeparator,
BreadcrumbEllipsis,
};
