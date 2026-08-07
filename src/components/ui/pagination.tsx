import*asReactfrom"react";
import{ChevronLeft,ChevronRight,MoreHorizontal}from"lucide-react";

import{cn}from"@/lib/utils";
import{ButtonProps,buttonVariants}from"@/components/ui/button";

constPagination=({className,...props}:React.ComponentProps<"nav">)=>(
<nav
role="navigation"
aria-label="pagination"
className={cn("mx-autoflexw-fulljustify-center",className)}
{...props}
/>
);
Pagination.displayName="Pagination";

constPaginationContent=React.forwardRef<HTMLUListElement,React.ComponentProps<"ul">>(
({className,...props},ref)=>(
<ulref={ref}className={cn("flexflex-rowitems-centergap-1",className)}{...props}/>
),
);
PaginationContent.displayName="PaginationContent";

constPaginationItem=React.forwardRef<HTMLLIElement,React.ComponentProps<"li">>(
({className,...props},ref)=><liref={ref}className={cn("",className)}{...props}/>,
);
PaginationItem.displayName="PaginationItem";

typePaginationLinkProps={
isActive?:boolean;
}&Pick<ButtonProps,"size">&
React.ComponentProps<"a">;

constPaginationLink=({className,isActive,size="icon",...props}:PaginationLinkProps)=>(
<a
aria-current={isActive?"page":undefined}
className={cn(
buttonVariants({
variant:isActive?"outline":"ghost",
size,
}),
className,
)}
{...props}
/>
);
PaginationLink.displayName="PaginationLink";

constPaginationPrevious=({
className,
...props
}:React.ComponentProps<typeofPaginationLink>)=>(
<PaginationLink
aria-label="Gotopreviouspage"
size="default"
className={cn("gap-1pl-2.5",className)}
{...props}
>
<ChevronLeftclassName="h-4w-4"/>
<span>Previous</span>
</PaginationLink>
);
PaginationPrevious.displayName="PaginationPrevious";

constPaginationNext=({className,...props}:React.ComponentProps<typeofPaginationLink>)=>(
<PaginationLink
aria-label="Gotonextpage"
size="default"
className={cn("gap-1pr-2.5",className)}
{...props}
>
<span>Next</span>
<ChevronRightclassName="h-4w-4"/>
</PaginationLink>
);
PaginationNext.displayName="PaginationNext";

constPaginationEllipsis=({className,...props}:React.ComponentProps<"span">)=>(
<span
aria-hidden
className={cn("flexh-9w-9items-centerjustify-center",className)}
{...props}
>
<MoreHorizontalclassName="h-4w-4"/>
<spanclassName="sr-only">Morepages</span>
</span>
);
PaginationEllipsis.displayName="PaginationEllipsis";

export{
Pagination,
PaginationContent,
PaginationLink,
PaginationItem,
PaginationPrevious,
PaginationNext,
PaginationEllipsis,
};
