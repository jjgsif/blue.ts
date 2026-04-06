# create-blue

Scaffold a new [blue.ts](https://github.com/jjgsif/blue.ts) project interactively.

## Usage

```bash
# bun
bunx create-blue

# npm
npx create-blue

# deno
deno run npm:create-blue
```

The CLI will prompt you for:

- **Project name** — directory to create
- **Runtime** — Bun, Node.js, or Deno
- **Optional packages** — any combination of `@blue.ts/auth`, `@blue.ts/logging`, `@blue.ts/middleware`
- **Auth strategies** (if auth is selected) — JWT, Session, API Key, Basic Auth

## Generated project structure

```
my-app/
├── index.ts              # Entry point — starts the server
├── package.json
├── tsconfig.json
└── src/
    ├── app.ts            # App wiring — providers, middleware, routes
    └── handlers/
        └── IndexHandler.ts
```

## Getting started after scaffolding

**Bun**
```bash
cd my-app && bun install && bun run dev
```

**Node.js**
```bash
cd my-app && npm install && npm run dev
```

**Deno**
```bash
cd my-app && deno run --watch --allow-net index.ts
```

## Repository

[github.com/jjgsif/blue.ts](https://github.com/jjgsif/blue.ts)