#Routes

TanStackStartuses**file-basedrouting**.Every`.tsx`fileinthisdirectory
definesaroute.Do**not**create`src/pages/`,`src/routes/_app/index.tsx`,or
`app/layout.tsx`—thoseareNext.js/Remixconventions.Theonlyrootlayout
is`src/routes/__root.tsx`.

##Conventions

|File|URL|
|---|---|
|`index.tsx`|`/`|
|`about.tsx`|`/about`|
|`users/index.tsx`|`/users`|
|`users/$id.tsx`|`/users/:id`(dynamic—bare`$`,nocurlybraces)|
|`posts/{-$category}.tsx`|`/posts/:category?`(optionalsegment)|
|`files/$.tsx`|`/files/*`(splat—readvia`_splat`param,never`*`)|
|`_layout.tsx`|layoutroute(renderschildrenvia`<Outlet/>`)|
|`__root.tsx`|appshell—wrapseverypage;preserve`<Outlet/>`|

`routeTree.gen.ts`isauto-generated.Don'tedititbyhand.
