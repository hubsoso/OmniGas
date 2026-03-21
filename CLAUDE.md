# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OmniGas is a Next.js application. The project is in early stages — consult the current directory structure and `package.json` to understand what has been set up.

## MCP Servers

This project has two MCP servers enabled in `.claude/settings.local.json`:

- **apifox** — API documentation and schema reference. Use `mcp__apifox__read_project_oas_28zr5e` to read API specs.
- **lark** — Document/content processing integration.

## Development Commands

Once `package.json` is set up, standard Next.js commands apply:

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm run test     # Run tests (if configured)
```

Check `package.json` scripts for the actual commands available.
