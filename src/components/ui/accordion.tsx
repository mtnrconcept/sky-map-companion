import*asReactfrom"react";
import*asAccordionPrimitivefrom"@radix-ui/react-accordion";
import{ChevronDown}from"lucide-react";

import{cn}from"@/lib/utils";

constAccordion=AccordionPrimitive.Root;

constAccordionItem=React.forwardRef<
React.ElementRef<typeofAccordionPrimitive.Item>,
React.ComponentPropsWithoutRef<typeofAccordionPrimitive.Item>
>(({className,...props},ref)=>(
<AccordionPrimitive.Itemref={ref}className={cn("border-b",className)}{...props}/>
));
AccordionItem.displayName="AccordionItem";

constAccordionTrigger=React.forwardRef<
React.ElementRef<typeofAccordionPrimitive.Trigger>,
React.ComponentPropsWithoutRef<typeofAccordionPrimitive.Trigger>
>(({className,children,...props},ref)=>(
<AccordionPrimitive.HeaderclassName="flex">
<AccordionPrimitive.Trigger
ref={ref}
className={cn(
"flexflex-1items-centerjustify-betweenpy-4text-smfont-mediumcursor-pointertransition-allhover:underlinetext-left[&[data-state=open]>svg]:rotate-180",
className,
)}
{...props}
>
{children}
<ChevronDownclassName="h-4w-4shrink-0text-muted-foregroundtransition-transformduration-200"/>
</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>
));
AccordionTrigger.displayName=AccordionPrimitive.Trigger.displayName;

constAccordionContent=React.forwardRef<
React.ElementRef<typeofAccordionPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofAccordionPrimitive.Content>
>(({className,children,...props},ref)=>(
<AccordionPrimitive.Content
ref={ref}
className="overflow-hiddentext-smdata-[state=closed]:animate-accordion-updata-[state=open]:animate-accordion-down"
{...props}
>
<divclassName={cn("pb-4pt-0",className)}>{children}</div>
</AccordionPrimitive.Content>
));
AccordionContent.displayName=AccordionPrimitive.Content.displayName;

export{Accordion,AccordionItem,AccordionTrigger,AccordionContent};
