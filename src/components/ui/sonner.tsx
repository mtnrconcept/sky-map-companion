import{ToasterasSonner}from"sonner";

typeToasterProps=React.ComponentProps<typeofSonner>;

constToaster=({...props}:ToasterProps)=>{
return(
<Sonner
className="toastergroup"
toastOptions={{
classNames:{
toast:
"grouptoastgroup-[.toaster]:bg-backgroundgroup-[.toaster]:text-foregroundgroup-[.toaster]:border-bordergroup-[.toaster]:shadow-lg",
description:"group-[.toast]:text-muted-foreground",
actionButton:"group-[.toast]:bg-primarygroup-[.toast]:text-primary-foreground",
cancelButton:"group-[.toast]:bg-mutedgroup-[.toast]:text-muted-foreground",
},
}}
{...props}
/>
);
};

export{Toaster};
