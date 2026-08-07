import*asReactfrom"react";

import{cn}from"@/lib/utils";

constTable=React.forwardRef<HTMLTableElement,React.HTMLAttributes<HTMLTableElement>>(
({className,...props},ref)=>(
<divclassName="relativew-fulloverflow-auto">
<tableref={ref}className={cn("w-fullcaption-bottomtext-sm",className)}{...props}/>
</div>
),
);
Table.displayName="Table";

constTableHeader=React.forwardRef<
HTMLTableSectionElement,
React.HTMLAttributes<HTMLTableSectionElement>
>(({className,...props},ref)=>(
<theadref={ref}className={cn("[&_tr]:border-b",className)}{...props}/>
));
TableHeader.displayName="TableHeader";

constTableBody=React.forwardRef<
HTMLTableSectionElement,
React.HTMLAttributes<HTMLTableSectionElement>
>(({className,...props},ref)=>(
<tbodyref={ref}className={cn("[&_tr:last-child]:border-0",className)}{...props}/>
));
TableBody.displayName="TableBody";

constTableFooter=React.forwardRef<
HTMLTableSectionElement,
React.HTMLAttributes<HTMLTableSectionElement>
>(({className,...props},ref)=>(
<tfoot
ref={ref}
className={cn("border-tbg-muted/50font-medium[&>tr]:last:border-b-0",className)}
{...props}
/>
));
TableFooter.displayName="TableFooter";

constTableRow=React.forwardRef<HTMLTableRowElement,React.HTMLAttributes<HTMLTableRowElement>>(
({className,...props},ref)=>(
<tr
ref={ref}
className={cn(
"border-btransition-colorshover:bg-muted/50data-[state=selected]:bg-muted",
className,
)}
{...props}
/>
),
);
TableRow.displayName="TableRow";

constTableHead=React.forwardRef<
HTMLTableCellElement,
React.ThHTMLAttributes<HTMLTableCellElement>
>(({className,...props},ref)=>(
<th
ref={ref}
className={cn(
"h-10px-2text-leftalign-middlefont-mediumtext-muted-foreground[&:has([role=checkbox])]:pr-0[&>[role=checkbox]]:translate-y-[2px]",
className,
)}
{...props}
/>
));
TableHead.displayName="TableHead";

constTableCell=React.forwardRef<
HTMLTableCellElement,
React.TdHTMLAttributes<HTMLTableCellElement>
>(({className,...props},ref)=>(
<td
ref={ref}
className={cn(
"p-2align-middle[&:has([role=checkbox])]:pr-0[&>[role=checkbox]]:translate-y-[2px]",
className,
)}
{...props}
/>
));
TableCell.displayName="TableCell";

constTableCaption=React.forwardRef<
HTMLTableCaptionElement,
React.HTMLAttributes<HTMLTableCaptionElement>
>(({className,...props},ref)=>(
<captionref={ref}className={cn("mt-4text-smtext-muted-foreground",className)}{...props}/>
));
TableCaption.displayName="TableCaption";

export{Table,TableHeader,TableBody,TableFooter,TableHead,TableRow,TableCell,TableCaption};
