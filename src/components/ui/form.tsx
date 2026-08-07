import*asReactfrom"react";
import*asLabelPrimitivefrom"@radix-ui/react-label";
import{Slot}from"@radix-ui/react-slot";
import{
Controller,
FormProvider,
useFormContext,
typeControllerProps,
typeFieldPath,
typeFieldValues,
}from"react-hook-form";

import{cn}from"@/lib/utils";
import{Label}from"@/components/ui/label";

constForm=FormProvider;

typeFormFieldContextValue<
TFieldValuesextendsFieldValues=FieldValues,
TNameextendsFieldPath<TFieldValues>=FieldPath<TFieldValues>,
>={
name:TName;
};

constFormFieldContext=React.createContext<FormFieldContextValue|null>(null);

constFormField=<
TFieldValuesextendsFieldValues=FieldValues,
TNameextendsFieldPath<TFieldValues>=FieldPath<TFieldValues>,
>({
...props
}:ControllerProps<TFieldValues,TName>)=>{
return(
<FormFieldContext.Providervalue={{name:props.name}}>
<Controller{...props}/>
</FormFieldContext.Provider>
);
};

constuseFormField=()=>{
constfieldContext=React.useContext(FormFieldContext);
constitemContext=React.useContext(FormItemContext);
const{getFieldState,formState}=useFormContext();

if(!fieldContext){
thrownewError("useFormFieldshouldbeusedwithin<FormField>");
}

if(!itemContext){
thrownewError("useFormFieldshouldbeusedwithin<FormItem>");
}

constfieldState=getFieldState(fieldContext.name,formState);

const{id}=itemContext;

return{
id,
name:fieldContext.name,
formItemId:`${id}-form-item`,
formDescriptionId:`${id}-form-item-description`,
formMessageId:`${id}-form-item-message`,
...fieldState,
};
};

typeFormItemContextValue={
id:string;
};

constFormItemContext=React.createContext<FormItemContextValue|null>(null);

constFormItem=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>{
constid=React.useId();

return(
<FormItemContext.Providervalue={{id}}>
<divref={ref}className={cn("space-y-2",className)}{...props}/>
</FormItemContext.Provider>
);
},
);
FormItem.displayName="FormItem";

constFormLabel=React.forwardRef<
React.ElementRef<typeofLabelPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofLabelPrimitive.Root>
>(({className,...props},ref)=>{
const{error,formItemId}=useFormField();

return(
<Label
ref={ref}
className={cn(error&&"text-destructive",className)}
htmlFor={formItemId}
{...props}
/>
);
});
FormLabel.displayName="FormLabel";

constFormControl=React.forwardRef<
React.ElementRef<typeofSlot>,
React.ComponentPropsWithoutRef<typeofSlot>
>(({...props},ref)=>{
const{error,formItemId,formDescriptionId,formMessageId}=useFormField();

return(
<Slot
ref={ref}
id={formItemId}
aria-describedby={!error?`${formDescriptionId}`:`${formDescriptionId}${formMessageId}`}
aria-invalid={!!error}
{...props}
/>
);
});
FormControl.displayName="FormControl";

constFormDescription=React.forwardRef<
HTMLParagraphElement,
React.HTMLAttributes<HTMLParagraphElement>
>(({className,...props},ref)=>{
const{formDescriptionId}=useFormField();

return(
<p
ref={ref}
id={formDescriptionId}
className={cn("text-[0.8rem]text-muted-foreground",className)}
{...props}
/>
);
});
FormDescription.displayName="FormDescription";

constFormMessage=React.forwardRef<
HTMLParagraphElement,
React.HTMLAttributes<HTMLParagraphElement>
>(({className,children,...props},ref)=>{
const{error,formMessageId}=useFormField();
constbody=error?String(error?.message??""):children;

if(!body){
returnnull;
}

return(
<p
ref={ref}
id={formMessageId}
className={cn("text-[0.8rem]font-mediumtext-destructive",className)}
{...props}
>
{body}
</p>
);
});
FormMessage.displayName="FormMessage";

export{
useFormField,
Form,
FormItem,
FormLabel,
FormControl,
FormDescription,
FormMessage,
FormField,
};
