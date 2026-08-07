//@lovable.dev/vite-tanstack-configalreadyincludesthefollowing—doNOTaddthemmanually
//ortheappwillbreakwithduplicateplugins:
//-TanStackdevtools(dev-only,first),tanstackStart,viteReact,tailwindcss,tsConfigPaths,
//nitro(build-onlyusingcloudflareasadefaulttarget),VITE_*envinjection,@pathalias,
//React/TanStackdedupe,errorloggerplugins,andsandboxdetection(port/host/strictPort).
//YoucanpassadditionalconfigviadefineConfig({vite:{...},etc...})ifneeded.
import{defineConfig}from"@lovable.dev/vite-tanstack-config";

exportdefaultdefineConfig({
tanstackStart:{
//RedirectTanStackStart'sbundledserverentrytosrc/server.ts(ourSSRerrorwrapper).
//nitro/vitebuildsfromthis
server:{entry:"server"},
},
});
