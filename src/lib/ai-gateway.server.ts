import{createOpenAICompatible}from"@ai-sdk/openai-compatible";

exportfunctioncreateLovableAiGatewayProvider(apiKey:string){
returncreateOpenAICompatible({
name:"lovable-ai-gateway",
baseURL:"https://ai.gateway.lovable.dev/v1",
headers:{
"Lovable-API-Key":apiKey,
"X-Lovable-AIG-SDK":"vercel-ai-sdk",
},
});
}
