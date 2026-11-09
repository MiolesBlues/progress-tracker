# Routes

TanStack Start uses file-based routing. Each route file in this directory defines a route. The application's root layout is `src/routes/__root.tsx`.

Do not add `src/pages/`, `src/routes/_app/index.tsx`, or `app/layout.tsx`; those are conventions from other frameworks. `routeTree.gen.ts` is generated and must not be edited by hand.

## File naming examples

| File                     | URL                 | Notes                                                      |
| ------------------------ | ------------------- | ---------------------------------------------------------- |
| `index.tsx`              | `/`                 | Index route                                                |
| `about.tsx`              | `/about`            | Static segment                                             |
| `users/index.tsx`        | `/users`            | Nested index route                                         |
| `users/$id.tsx`          | `/users/:id`        | Dynamic parameter                                          |
| `posts/{-$category}.tsx` | `/posts/:category?` | Optional segment                                           |
| `files/$.tsx`            | `/files/*`          | Splat, read from `_splat`                                  |
| `_layout.tsx`            | —                   | Layout route; renders children through `<Outlet />`        |
| `__root.tsx`             | —                   | Application shell; wraps routes and preserves `<Outlet />` |
