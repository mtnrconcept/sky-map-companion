/*eslint-disable*/

//@ts-nocheck

//noinspectionJSUnusedGlobalSymbols

//ThisfilewasautomaticallygeneratedbyTanStackRouter.
//YoushouldNOTmakeanychangesinthisfileasitwillbeoverwritten.
//Additionally,youshouldalsoexcludethisfilefromyourlinterand/orformattertopreventitfrombeingcheckedormodified.

<<<<<<< HEAD
import{RouteasrootRouteImport}from'./routes/__root'
import{RouteasIndexRouteImport}from'./routes/index'
import{RouteasAssistantRouteImport}from'./routes/assistant'
import{RouteasAstrostackRouteImport}from'./routes/astrostack'
import{RouteasAuthRouteImport}from'./routes/auth'
import{RouteasCommunauteRouteImport}from'./routes/communaute'
import{RouteasCosmosLiveRouteImport}from'./routes/cosmos-live'
import{RouteasExplorerRouteImport}from'./routes/explorer'
import{RouteasRessourcesRouteImport}from'./routes/ressources'
import{RouteasApiChatRouteImport}from'./routes/api/chat'
import{RouteasProfilUserIdRouteImport}from'./routes/profil.$userId'
import{RouteasRessourcesIndexRouteImport}from'./routes/ressources.index'
import{RouteasRessourcesCommunauteRouteImport}from'./routes/ressources.communaute'
import{RouteasRessourcesLogicielsRouteImport}from'./routes/ressources.logiciels'
import{RouteasRessourcesPlanificationRouteImport}from'./routes/ressources.planification'
import{RouteasRessourcesTutorielsRouteImport}from'./routes/ressources.tutoriels'
import{RouteasRessourcesVideosRouteImport}from'./routes/ressources.videos'
import{RouteasApiVisionAnalyzeRouteImport}from'./routes/api/vision/analyze'
import{RouteasApiVisionCompareRouteImport}from'./routes/api/vision/compare'
import{RouteasRessourcesMaterielIndexRouteImport}from'./routes/ressources.materiel.index'
import{RouteasRessourcesMaterielSlugRouteImport}from'./routes/ressources.materiel.$slug'

constIndexRoute=IndexRouteImport.update({
id:'/',
path:'/',
getParentRoute:()=>rootRouteImport,
}asany)
constAssistantRoute=AssistantRouteImport.update({
id:'/assistant',
path:'/assistant',
getParentRoute:()=>rootRouteImport,
}asany)
constAstrostackRoute=AstrostackRouteImport.update({
id:'/astrostack',
path:'/astrostack',
getParentRoute:()=>rootRouteImport,
}asany)
constAuthRoute=AuthRouteImport.update({
id:'/auth',
path:'/auth',
getParentRoute:()=>rootRouteImport,
}asany)
constCommunauteRoute=CommunauteRouteImport.update({
id:'/communaute',
path:'/communaute',
getParentRoute:()=>rootRouteImport,
}asany)
constCosmosLiveRoute=CosmosLiveRouteImport.update({
id:'/cosmos-live',
path:'/cosmos-live',
getParentRoute:()=>rootRouteImport,
}asany)
constExplorerRoute=ExplorerRouteImport.update({
id:'/explorer',
path:'/explorer',
getParentRoute:()=>rootRouteImport,
}asany)
constRessourcesRoute=RessourcesRouteImport.update({
id:'/ressources',
path:'/ressources',
getParentRoute:()=>rootRouteImport,
}asany)
constApiChatRoute=ApiChatRouteImport.update({
id:'/api/chat',
path:'/api/chat',
getParentRoute:()=>rootRouteImport,
}asany)
constProfilUserIdRoute=ProfilUserIdRouteImport.update({
id:'/profil/$userId',
path:'/profil/$userId',
getParentRoute:()=>rootRouteImport,
}asany)
constRessourcesIndexRoute=RessourcesIndexRouteImport.update({
id:'/',
path:'/',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesCommunauteRoute=RessourcesCommunauteRouteImport.update({
id:'/communaute',
path:'/communaute',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesLogicielsRoute=RessourcesLogicielsRouteImport.update({
id:'/logiciels',
path:'/logiciels',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesPlanificationRoute=RessourcesPlanificationRouteImport.update({
id:'/planification',
path:'/planification',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesTutorielsRoute=RessourcesTutorielsRouteImport.update({
id:'/tutoriels',
path:'/tutoriels',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesVideosRoute=RessourcesVideosRouteImport.update({
id:'/videos',
path:'/videos',
getParentRoute:()=>RessourcesRoute,
}asany)
constApiVisionAnalyzeRoute=ApiVisionAnalyzeRouteImport.update({
id:'/api/vision/analyze',
path:'/api/vision/analyze',
getParentRoute:()=>rootRouteImport,
}asany)
constApiVisionCompareRoute=ApiVisionCompareRouteImport.update({
id:'/api/vision/compare',
path:'/api/vision/compare',
getParentRoute:()=>rootRouteImport,
}asany)
constRessourcesMaterielIndexRoute=RessourcesMaterielIndexRouteImport.update({
id:'/materiel/',
path:'/materiel/',
getParentRoute:()=>RessourcesRoute,
}asany)
constRessourcesMaterielSlugRoute=RessourcesMaterielSlugRouteImport.update({
id:'/materiel/$slug',
path:'/materiel/$slug',
getParentRoute:()=>RessourcesRoute,
}asany)

exportinterfaceFileRoutesByFullPath{
'/':typeofIndexRoute
'/assistant':typeofAssistantRoute
'/astrostack':typeofAstrostackRoute
'/auth':typeofAuthRoute
'/communaute':typeofCommunauteRoute
'/cosmos-live':typeofCosmosLiveRoute
'/explorer':typeofExplorerRoute
'/ressources':typeofRessourcesRouteWithChildren
'/api/chat':typeofApiChatRoute
'/profil/$userId':typeofProfilUserIdRoute
'/ressources/communaute':typeofRessourcesCommunauteRoute
'/ressources/logiciels':typeofRessourcesLogicielsRoute
'/ressources/planification':typeofRessourcesPlanificationRoute
'/ressources/tutoriels':typeofRessourcesTutorielsRoute
'/ressources/videos':typeofRessourcesVideosRoute
'/ressources/':typeofRessourcesIndexRoute
'/api/vision/analyze':typeofApiVisionAnalyzeRoute
'/api/vision/compare':typeofApiVisionCompareRoute
'/ressources/materiel/$slug':typeofRessourcesMaterielSlugRoute
'/ressources/materiel/':typeofRessourcesMaterielIndexRoute
}
exportinterfaceFileRoutesByTo{
'/':typeofIndexRoute
'/assistant':typeofAssistantRoute
'/astrostack':typeofAstrostackRoute
'/auth':typeofAuthRoute
'/communaute':typeofCommunauteRoute
'/cosmos-live':typeofCosmosLiveRoute
'/explorer':typeofExplorerRoute
'/api/chat':typeofApiChatRoute
'/profil/$userId':typeofProfilUserIdRoute
'/ressources/communaute':typeofRessourcesCommunauteRoute
'/ressources/logiciels':typeofRessourcesLogicielsRoute
'/ressources/planification':typeofRessourcesPlanificationRoute
'/ressources/tutoriels':typeofRessourcesTutorielsRoute
'/ressources/videos':typeofRessourcesVideosRoute
'/ressources':typeofRessourcesIndexRoute
'/api/vision/analyze':typeofApiVisionAnalyzeRoute
'/api/vision/compare':typeofApiVisionCompareRoute
'/ressources/materiel/$slug':typeofRessourcesMaterielSlugRoute
'/ressources/materiel':typeofRessourcesMaterielIndexRoute
}
exportinterfaceFileRoutesById{
__root__:typeofrootRouteImport
'/':typeofIndexRoute
'/assistant':typeofAssistantRoute
'/astrostack':typeofAstrostackRoute
'/auth':typeofAuthRoute
'/communaute':typeofCommunauteRoute
'/cosmos-live':typeofCosmosLiveRoute
'/explorer':typeofExplorerRoute
'/ressources':typeofRessourcesRouteWithChildren
'/api/chat':typeofApiChatRoute
'/profil/$userId':typeofProfilUserIdRoute
'/ressources/communaute':typeofRessourcesCommunauteRoute
'/ressources/logiciels':typeofRessourcesLogicielsRoute
'/ressources/planification':typeofRessourcesPlanificationRoute
'/ressources/tutoriels':typeofRessourcesTutorielsRoute
'/ressources/videos':typeofRessourcesVideosRoute
'/ressources/':typeofRessourcesIndexRoute
'/api/vision/analyze':typeofApiVisionAnalyzeRoute
'/api/vision/compare':typeofApiVisionCompareRoute
'/ressources/materiel/$slug':typeofRessourcesMaterielSlugRoute
'/ressources/materiel/':typeofRessourcesMaterielIndexRoute
}
exportinterfaceFileRouteTypes{
fileRoutesByFullPath:FileRoutesByFullPath
fullPaths:
|'/'
|'/assistant'
|'/astrostack'
|'/auth'
|'/communaute'
|'/cosmos-live'
|'/explorer'
|'/ressources'
|'/api/chat'
|'/profil/$userId'
|'/ressources/communaute'
|'/ressources/logiciels'
|'/ressources/planification'
|'/ressources/tutoriels'
|'/ressources/videos'
|'/ressources/'
|'/api/vision/analyze'
|'/api/vision/compare'
|'/ressources/materiel/$slug'
|'/ressources/materiel/'
fileRoutesByTo:FileRoutesByTo
to:
|'/'
|'/assistant'
|'/astrostack'
|'/auth'
|'/communaute'
|'/cosmos-live'
|'/explorer'
|'/api/chat'
|'/profil/$userId'
|'/ressources/communaute'
|'/ressources/logiciels'
|'/ressources/planification'
|'/ressources/tutoriels'
|'/ressources/videos'
|'/ressources'
|'/api/vision/analyze'
|'/api/vision/compare'
|'/ressources/materiel/$slug'
|'/ressources/materiel'
id:
|'__root__'
|'/'
|'/assistant'
|'/astrostack'
|'/auth'
|'/communaute'
|'/cosmos-live'
|'/explorer'
|'/ressources'
|'/api/chat'
|'/profil/$userId'
|'/ressources/communaute'
|'/ressources/logiciels'
|'/ressources/planification'
|'/ressources/tutoriels'
|'/ressources/videos'
|'/ressources/'
|'/api/vision/analyze'
|'/api/vision/compare'
|'/ressources/materiel/$slug'
|'/ressources/materiel/'
fileRoutesById:FileRoutesById
}
exportinterfaceRootRouteChildren{
IndexRoute:typeofIndexRoute
AssistantRoute:typeofAssistantRoute
AstrostackRoute:typeofAstrostackRoute
AuthRoute:typeofAuthRoute
CommunauteRoute:typeofCommunauteRoute
CosmosLiveRoute:typeofCosmosLiveRoute
ExplorerRoute:typeofExplorerRoute
RessourcesRoute:typeofRessourcesRouteWithChildren
ApiChatRoute:typeofApiChatRoute
ProfilUserIdRoute:typeofProfilUserIdRoute
ApiVisionAnalyzeRoute:typeofApiVisionAnalyzeRoute
ApiVisionCompareRoute:typeofApiVisionCompareRoute
}

declaremodule'@tanstack/react-router'{
interfaceFileRoutesByPath{
'/':{
id:'/'
path:'/'
fullPath:'/'
preLoaderRoute:typeofIndexRouteImport
parentRoute:typeofrootRouteImport
}
'/assistant':{
id:'/assistant'
path:'/assistant'
fullPath:'/assistant'
preLoaderRoute:typeofAssistantRouteImport
parentRoute:typeofrootRouteImport
}
'/astrostack':{
id:'/astrostack'
path:'/astrostack'
fullPath:'/astrostack'
preLoaderRoute:typeofAstrostackRouteImport
parentRoute:typeofrootRouteImport
}
'/auth':{
id:'/auth'
path:'/auth'
fullPath:'/auth'
preLoaderRoute:typeofAuthRouteImport
parentRoute:typeofrootRouteImport
}
'/communaute':{
id:'/communaute'
path:'/communaute'
fullPath:'/communaute'
preLoaderRoute:typeofCommunauteRouteImport
parentRoute:typeofrootRouteImport
}
'/cosmos-live':{
id:'/cosmos-live'
path:'/cosmos-live'
fullPath:'/cosmos-live'
preLoaderRoute:typeofCosmosLiveRouteImport
parentRoute:typeofrootRouteImport
}
'/explorer':{
id:'/explorer'
path:'/explorer'
fullPath:'/explorer'
preLoaderRoute:typeofExplorerRouteImport
parentRoute:typeofrootRouteImport
}
'/ressources':{
id:'/ressources'
path:'/ressources'
fullPath:'/ressources'
preLoaderRoute:typeofRessourcesRouteImport
parentRoute:typeofrootRouteImport
}
'/api/chat':{
id:'/api/chat'
path:'/api/chat'
fullPath:'/api/chat'
preLoaderRoute:typeofApiChatRouteImport
parentRoute:typeofrootRouteImport
}
'/profil/$userId':{
id:'/profil/$userId'
path:'/profil/$userId'
fullPath:'/profil/$userId'
preLoaderRoute:typeofProfilUserIdRouteImport
parentRoute:typeofrootRouteImport
}
'/ressources/':{
id:'/ressources/'
path:'/'
fullPath:'/ressources/'
preLoaderRoute:typeofRessourcesIndexRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/communaute':{
id:'/ressources/communaute'
path:'/communaute'
fullPath:'/ressources/communaute'
preLoaderRoute:typeofRessourcesCommunauteRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/logiciels':{
id:'/ressources/logiciels'
path:'/logiciels'
fullPath:'/ressources/logiciels'
preLoaderRoute:typeofRessourcesLogicielsRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/planification':{
id:'/ressources/planification'
path:'/planification'
fullPath:'/ressources/planification'
preLoaderRoute:typeofRessourcesPlanificationRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/tutoriels':{
id:'/ressources/tutoriels'
path:'/tutoriels'
fullPath:'/ressources/tutoriels'
preLoaderRoute:typeofRessourcesTutorielsRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/videos':{
id:'/ressources/videos'
path:'/videos'
fullPath:'/ressources/videos'
preLoaderRoute:typeofRessourcesVideosRouteImport
parentRoute:typeofRessourcesRoute
}
'/api/vision/analyze':{
id:'/api/vision/analyze'
path:'/api/vision/analyze'
fullPath:'/api/vision/analyze'
preLoaderRoute:typeofApiVisionAnalyzeRouteImport
parentRoute:typeofrootRouteImport
}
'/api/vision/compare':{
id:'/api/vision/compare'
path:'/api/vision/compare'
fullPath:'/api/vision/compare'
preLoaderRoute:typeofApiVisionCompareRouteImport
parentRoute:typeofrootRouteImport
}
'/ressources/materiel/':{
id:'/ressources/materiel/'
path:'/materiel'
fullPath:'/ressources/materiel/'
preLoaderRoute:typeofRessourcesMaterielIndexRouteImport
parentRoute:typeofRessourcesRoute
}
'/ressources/materiel/$slug':{
id:'/ressources/materiel/$slug'
path:'/materiel/$slug'
fullPath:'/ressources/materiel/$slug'
preLoaderRoute:typeofRessourcesMaterielSlugRouteImport
parentRoute:typeofRessourcesRoute
}
}
=======
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as AssistantRouteImport } from './routes/assistant'
import { Route as AuthRouteImport } from './routes/auth'
import { Route as CommunauteRouteImport } from './routes/communaute'
import { Route as ExplorerRouteImport } from './routes/explorer'
import { Route as RessourcesRouteImport } from './routes/ressources'
import { Route as ApiChatRouteImport } from './routes/api/chat'
import { Route as ProfilUserIdRouteImport } from './routes/profil.$userId'
import { Route as RessourcesIndexRouteImport } from './routes/ressources.index'
import { Route as RessourcesCommunauteRouteImport } from './routes/ressources.communaute'
import { Route as RessourcesLogicielsRouteImport } from './routes/ressources.logiciels'
import { Route as RessourcesPlanificationRouteImport } from './routes/ressources.planification'
import { Route as RessourcesTutorielsRouteImport } from './routes/ressources.tutoriels'
import { Route as RessourcesVideosRouteImport } from './routes/ressources.videos'
import { Route as ApiVisionAnalyzeRouteImport } from './routes/api/vision/analyze'
import { Route as ApiVisionCompareRouteImport } from './routes/api/vision/compare'
import { Route as RessourcesMaterielIndexRouteImport } from './routes/ressources.materiel.index'
import { Route as RessourcesMaterielSlugRouteImport } from './routes/ressources.materiel.$slug'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const AssistantRoute = AssistantRouteImport.update({
  id: '/assistant',
  path: '/assistant',
  getParentRoute: () => rootRouteImport,
} as any)
const AuthRoute = AuthRouteImport.update({
  id: '/auth',
  path: '/auth',
  getParentRoute: () => rootRouteImport,
} as any)
const CommunauteRoute = CommunauteRouteImport.update({
  id: '/communaute',
  path: '/communaute',
  getParentRoute: () => rootRouteImport,
} as any)
const ExplorerRoute = ExplorerRouteImport.update({
  id: '/explorer',
  path: '/explorer',
  getParentRoute: () => rootRouteImport,
} as any)
const RessourcesRoute = RessourcesRouteImport.update({
  id: '/ressources',
  path: '/ressources',
  getParentRoute: () => rootRouteImport,
} as any)
const ApiChatRoute = ApiChatRouteImport.update({
  id: '/api/chat',
  path: '/api/chat',
  getParentRoute: () => rootRouteImport,
} as any)
const ProfilUserIdRoute = ProfilUserIdRouteImport.update({
  id: '/profil/$userId',
  path: '/profil/$userId',
  getParentRoute: () => rootRouteImport,
} as any)
const RessourcesIndexRoute = RessourcesIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesCommunauteRoute = RessourcesCommunauteRouteImport.update({
  id: '/communaute',
  path: '/communaute',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesLogicielsRoute = RessourcesLogicielsRouteImport.update({
  id: '/logiciels',
  path: '/logiciels',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesPlanificationRoute = RessourcesPlanificationRouteImport.update({
  id: '/planification',
  path: '/planification',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesTutorielsRoute = RessourcesTutorielsRouteImport.update({
  id: '/tutoriels',
  path: '/tutoriels',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesVideosRoute = RessourcesVideosRouteImport.update({
  id: '/videos',
  path: '/videos',
  getParentRoute: () => RessourcesRoute,
} as any)
const ApiVisionAnalyzeRoute = ApiVisionAnalyzeRouteImport.update({
  id: '/api/vision/analyze',
  path: '/api/vision/analyze',
  getParentRoute: () => rootRouteImport,
} as any)
const ApiVisionCompareRoute = ApiVisionCompareRouteImport.update({
  id: '/api/vision/compare',
  path: '/api/vision/compare',
  getParentRoute: () => rootRouteImport,
} as any)
const RessourcesMaterielIndexRoute = RessourcesMaterielIndexRouteImport.update({
  id: '/materiel/',
  path: '/materiel/',
  getParentRoute: () => RessourcesRoute,
} as any)
const RessourcesMaterielSlugRoute = RessourcesMaterielSlugRouteImport.update({
  id: '/materiel/$slug',
  path: '/materiel/$slug',
  getParentRoute: () => RessourcesRoute,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/assistant': typeof AssistantRoute
  '/auth': typeof AuthRoute
  '/communaute': typeof CommunauteRoute
  '/explorer': typeof ExplorerRoute
  '/ressources': typeof RessourcesRouteWithChildren
  '/api/chat': typeof ApiChatRoute
  '/profil/$userId': typeof ProfilUserIdRoute
  '/ressources/communaute': typeof RessourcesCommunauteRoute
  '/ressources/logiciels': typeof RessourcesLogicielsRoute
  '/ressources/planification': typeof RessourcesPlanificationRoute
  '/ressources/tutoriels': typeof RessourcesTutorielsRoute
  '/ressources/videos': typeof RessourcesVideosRoute
  '/ressources/': typeof RessourcesIndexRoute
  '/api/vision/analyze': typeof ApiVisionAnalyzeRoute
  '/api/vision/compare': typeof ApiVisionCompareRoute
  '/ressources/materiel/$slug': typeof RessourcesMaterielSlugRoute
  '/ressources/materiel/': typeof RessourcesMaterielIndexRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/assistant': typeof AssistantRoute
  '/auth': typeof AuthRoute
  '/communaute': typeof CommunauteRoute
  '/explorer': typeof ExplorerRoute
  '/api/chat': typeof ApiChatRoute
  '/profil/$userId': typeof ProfilUserIdRoute
  '/ressources/communaute': typeof RessourcesCommunauteRoute
  '/ressources/logiciels': typeof RessourcesLogicielsRoute
  '/ressources/planification': typeof RessourcesPlanificationRoute
  '/ressources/tutoriels': typeof RessourcesTutorielsRoute
  '/ressources/videos': typeof RessourcesVideosRoute
  '/ressources': typeof RessourcesIndexRoute
  '/api/vision/analyze': typeof ApiVisionAnalyzeRoute
  '/api/vision/compare': typeof ApiVisionCompareRoute
  '/ressources/materiel/$slug': typeof RessourcesMaterielSlugRoute
  '/ressources/materiel': typeof RessourcesMaterielIndexRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/assistant': typeof AssistantRoute
  '/auth': typeof AuthRoute
  '/communaute': typeof CommunauteRoute
  '/explorer': typeof ExplorerRoute
  '/ressources': typeof RessourcesRouteWithChildren
  '/api/chat': typeof ApiChatRoute
  '/profil/$userId': typeof ProfilUserIdRoute
  '/ressources/communaute': typeof RessourcesCommunauteRoute
  '/ressources/logiciels': typeof RessourcesLogicielsRoute
  '/ressources/planification': typeof RessourcesPlanificationRoute
  '/ressources/tutoriels': typeof RessourcesTutorielsRoute
  '/ressources/videos': typeof RessourcesVideosRoute
  '/ressources/': typeof RessourcesIndexRoute
  '/api/vision/analyze': typeof ApiVisionAnalyzeRoute
  '/api/vision/compare': typeof ApiVisionCompareRoute
  '/ressources/materiel/$slug': typeof RessourcesMaterielSlugRoute
  '/ressources/materiel/': typeof RessourcesMaterielIndexRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/assistant'
    | '/auth'
    | '/communaute'
    | '/explorer'
    | '/ressources'
    | '/api/chat'
    | '/profil/$userId'
    | '/ressources/communaute'
    | '/ressources/logiciels'
    | '/ressources/planification'
    | '/ressources/tutoriels'
    | '/ressources/videos'
    | '/ressources/'
    | '/api/vision/analyze'
    | '/api/vision/compare'
    | '/ressources/materiel/$slug'
    | '/ressources/materiel/'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/assistant'
    | '/auth'
    | '/communaute'
    | '/explorer'
    | '/api/chat'
    | '/profil/$userId'
    | '/ressources/communaute'
    | '/ressources/logiciels'
    | '/ressources/planification'
    | '/ressources/tutoriels'
    | '/ressources/videos'
    | '/ressources'
    | '/api/vision/analyze'
    | '/api/vision/compare'
    | '/ressources/materiel/$slug'
    | '/ressources/materiel'
  id:
    | '__root__'
    | '/'
    | '/assistant'
    | '/auth'
    | '/communaute'
    | '/explorer'
    | '/ressources'
    | '/api/chat'
    | '/profil/$userId'
    | '/ressources/communaute'
    | '/ressources/logiciels'
    | '/ressources/planification'
    | '/ressources/tutoriels'
    | '/ressources/videos'
    | '/ressources/'
    | '/api/vision/analyze'
    | '/api/vision/compare'
    | '/ressources/materiel/$slug'
    | '/ressources/materiel/'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AssistantRoute: typeof AssistantRoute
  AuthRoute: typeof AuthRoute
  CommunauteRoute: typeof CommunauteRoute
  ExplorerRoute: typeof ExplorerRoute
  RessourcesRoute: typeof RessourcesRouteWithChildren
  ApiChatRoute: typeof ApiChatRoute
  ProfilUserIdRoute: typeof ProfilUserIdRoute
  ApiVisionAnalyzeRoute: typeof ApiVisionAnalyzeRoute
  ApiVisionCompareRoute: typeof ApiVisionCompareRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/assistant': {
      id: '/assistant'
      path: '/assistant'
      fullPath: '/assistant'
      preLoaderRoute: typeof AssistantRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/auth': {
      id: '/auth'
      path: '/auth'
      fullPath: '/auth'
      preLoaderRoute: typeof AuthRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/communaute': {
      id: '/communaute'
      path: '/communaute'
      fullPath: '/communaute'
      preLoaderRoute: typeof CommunauteRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/explorer': {
      id: '/explorer'
      path: '/explorer'
      fullPath: '/explorer'
      preLoaderRoute: typeof ExplorerRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/ressources': {
      id: '/ressources'
      path: '/ressources'
      fullPath: '/ressources'
      preLoaderRoute: typeof RessourcesRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/api/chat': {
      id: '/api/chat'
      path: '/api/chat'
      fullPath: '/api/chat'
      preLoaderRoute: typeof ApiChatRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/profil/$userId': {
      id: '/profil/$userId'
      path: '/profil/$userId'
      fullPath: '/profil/$userId'
      preLoaderRoute: typeof ProfilUserIdRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/ressources/': {
      id: '/ressources/'
      path: '/'
      fullPath: '/ressources/'
      preLoaderRoute: typeof RessourcesIndexRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/communaute': {
      id: '/ressources/communaute'
      path: '/communaute'
      fullPath: '/ressources/communaute'
      preLoaderRoute: typeof RessourcesCommunauteRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/logiciels': {
      id: '/ressources/logiciels'
      path: '/logiciels'
      fullPath: '/ressources/logiciels'
      preLoaderRoute: typeof RessourcesLogicielsRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/planification': {
      id: '/ressources/planification'
      path: '/planification'
      fullPath: '/ressources/planification'
      preLoaderRoute: typeof RessourcesPlanificationRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/tutoriels': {
      id: '/ressources/tutoriels'
      path: '/tutoriels'
      fullPath: '/ressources/tutoriels'
      preLoaderRoute: typeof RessourcesTutorielsRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/videos': {
      id: '/ressources/videos'
      path: '/videos'
      fullPath: '/ressources/videos'
      preLoaderRoute: typeof RessourcesVideosRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/api/vision/analyze': {
      id: '/api/vision/analyze'
      path: '/api/vision/analyze'
      fullPath: '/api/vision/analyze'
      preLoaderRoute: typeof ApiVisionAnalyzeRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/api/vision/compare': {
      id: '/api/vision/compare'
      path: '/api/vision/compare'
      fullPath: '/api/vision/compare'
      preLoaderRoute: typeof ApiVisionCompareRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/ressources/materiel/': {
      id: '/ressources/materiel/'
      path: '/materiel'
      fullPath: '/ressources/materiel/'
      preLoaderRoute: typeof RessourcesMaterielIndexRouteImport
      parentRoute: typeof RessourcesRoute
    }
    '/ressources/materiel/$slug': {
      id: '/ressources/materiel/$slug'
      path: '/materiel/$slug'
      fullPath: '/ressources/materiel/$slug'
      preLoaderRoute: typeof RessourcesMaterielSlugRouteImport
      parentRoute: typeof RessourcesRoute
    }
  }
>>>>>>> parent of 1574b2d (feat: Cosmos Live — observatoire collaboratif en te)
}

interfaceRessourcesRouteChildren{
RessourcesCommunauteRoute:typeofRessourcesCommunauteRoute
RessourcesLogicielsRoute:typeofRessourcesLogicielsRoute
RessourcesPlanificationRoute:typeofRessourcesPlanificationRoute
RessourcesTutorielsRoute:typeofRessourcesTutorielsRoute
RessourcesVideosRoute:typeofRessourcesVideosRoute
RessourcesIndexRoute:typeofRessourcesIndexRoute
RessourcesMaterielSlugRoute:typeofRessourcesMaterielSlugRoute
RessourcesMaterielIndexRoute:typeofRessourcesMaterielIndexRoute
}

constRessourcesRouteChildren:RessourcesRouteChildren={
RessourcesCommunauteRoute:RessourcesCommunauteRoute,
RessourcesLogicielsRoute:RessourcesLogicielsRoute,
RessourcesPlanificationRoute:RessourcesPlanificationRoute,
RessourcesTutorielsRoute:RessourcesTutorielsRoute,
RessourcesVideosRoute:RessourcesVideosRoute,
RessourcesIndexRoute:RessourcesIndexRoute,
RessourcesMaterielSlugRoute:RessourcesMaterielSlugRoute,
RessourcesMaterielIndexRoute:RessourcesMaterielIndexRoute,
}

constRessourcesRouteWithChildren=RessourcesRoute._addFileChildren(
RessourcesRouteChildren,
)

<<<<<<< HEAD
constrootRouteChildren:RootRouteChildren={
IndexRoute:IndexRoute,
AssistantRoute:AssistantRoute,
AstrostackRoute:AstrostackRoute,
AuthRoute:AuthRoute,
CommunauteRoute:CommunauteRoute,
CosmosLiveRoute:CosmosLiveRoute,
ExplorerRoute:ExplorerRoute,
RessourcesRoute:RessourcesRouteWithChildren,
ApiChatRoute:ApiChatRoute,
ProfilUserIdRoute:ProfilUserIdRoute,
ApiVisionAnalyzeRoute:ApiVisionAnalyzeRoute,
ApiVisionCompareRoute:ApiVisionCompareRoute,
=======
const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AssistantRoute: AssistantRoute,
  AuthRoute: AuthRoute,
  CommunauteRoute: CommunauteRoute,
  ExplorerRoute: ExplorerRoute,
  RessourcesRoute: RessourcesRouteWithChildren,
  ApiChatRoute: ApiChatRoute,
  ProfilUserIdRoute: ProfilUserIdRoute,
  ApiVisionAnalyzeRoute: ApiVisionAnalyzeRoute,
  ApiVisionCompareRoute: ApiVisionCompareRoute,
>>>>>>> parent of 1574b2d (feat: Cosmos Live — observatoire collaboratif en te)
}
exportconstrouteTree=rootRouteImport
._addFileChildren(rootRouteChildren)
._addFileTypes<FileRouteTypes>()

importtype{getRouter}from'./router.tsx'
importtype{startInstance}from'./start.ts'
declaremodule'@tanstack/react-start'{
interfaceRegister{
ssr:true
router:Awaited<ReturnType<typeofgetRouter>>
config:Awaited<ReturnType<typeofstartInstance.getOptions>>
}
}
