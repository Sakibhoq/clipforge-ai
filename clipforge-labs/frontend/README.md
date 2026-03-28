# Labs Frontend

Orbito Labs Next.js app for generation, clips, and editing.

## Important folders

- `app/`: App Router pages for Labs.
- `components/`: reusable Labs UI components.
- `lib/`: Labs browser helpers.
- `proxy.ts`: route normalization, auth redirects, and security headers.
- `next.config.ts`: frontend rewrites and build config.

## Good entry points

- Generator: `app/app/generate/GenerateClient.tsx`
- Clips workspace: `app/app/clips/page.tsx`
- Editor: `components/editor/EditorWorkspace.tsx`

## Related docs

- Labs overview: `../README.md`
- Full codebase map: `../../docs/CODEBASE_MAP.md`
