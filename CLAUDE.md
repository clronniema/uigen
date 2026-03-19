# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Next.js dev server with Turbopack
npm run build     # Production build
npm run lint      # ESLint
npm run test      # Run all Vitest unit tests
npm run setup     # Install deps + generate Prisma client + run migrations
npm run db:reset  # Force reset SQLite database
```

Run a single test file:
```bash
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx
```

## Environment

- `ANTHROPIC_API_KEY` — optional. If absent, the app uses `MockLanguageModel` and returns static demo components instead of calling Claude.
- `JWT_SECRET` — defaults to `"development-secret-key"` if unset.

## Architecture

**UIGen** is a Next.js 15 (App Router) AI-powered React component generator with live preview.

### Key layers

**Virtual File System** ([src/lib/file-system.ts](src/lib/file-system.ts))
All generated code lives in an in-memory tree of `FileNode` objects — nothing is written to disk. The file system is serialized to JSON for database persistence. Claude interacts with it exclusively via tool calls.

**AI / Chat API** ([src/app/api/chat/route.ts](src/app/api/chat/route.ts))
- POST endpoint that streams Claude responses via Vercel AI SDK (`streamText`)
- Provides two tools to Claude: `str_replace_editor` (view/create/replace/insert in files) and `file_manager`
- System prompt ([src/lib/prompts/generation.tsx](src/lib/prompts/generation.tsx)) enforces: `/App.jsx` as entry point, Tailwind CSS only (no inline styles), `@/` import alias between files
- After streaming completes, saves conversation + serialized file system to DB (authenticated users only)

**State Management**
- `FileSystemContext` ([src/lib/contexts/file-system-context.tsx](src/lib/contexts/file-system-context.tsx)) — virtual FS state
- `ChatContext` ([src/lib/contexts/chat-context.tsx](src/lib/contexts/chat-context.tsx)) — messages and chat submission

**Preview** ([src/components/preview/PreviewFrame.tsx](src/components/preview/PreviewFrame.tsx))
Renders generated code inside an iframe using `@babel/standalone` for runtime JSX transpilation.

**Database** (Prisma + SQLite at `prisma/dev.db`)
- `User`: email + bcrypt password
- `Project`: belongs to User; stores `messages` (JSON string) and `data` (serialized virtual FS as JSON string)
- Prisma client generated to `src/generated/prisma`

**Auth** ([src/lib/auth.ts](src/lib/auth.ts))
JWT sessions in HttpOnly cookies (`auth-token`), 7-day expiry, HS256.

**Server Actions** ([src/actions/](src/actions/))
`createProject`, `getProject`, `getProjects` — called from client components to manage project persistence.

### Layout

The main UI ([src/app/main-content.tsx](src/app/main-content.tsx)) is a resizable panel layout:
- Left (35%): Chat interface
- Right (65%): Preview iframe + file tree + Monaco code editor (tabbed)

### Path alias
`@/*` maps to `./src/*` throughout the codebase.
