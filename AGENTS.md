# AI Agent Development Guidelines

This document outlines key instructions and workflows for AI agents working in this codebase.

## Formatting and Code Style

To ensure pull requests pass CI checks, all frontend code modifications must be formatted using Prettier.

### How to Run Prettier Formatting

Before committing changes in the `frontend` directory, run the following commands:

```bash
# Navigate to the frontend directory
cd frontend

# Check if there are any formatting issues
npm run format

# Or format the files directly
npx prettier --write .
```

Always verify formatting and run the linter (`npm run lint`) and tests (`npm run test`) before pushing changes to GitHub.

## UI Components (shadcn)

`frontend/components.json` uses the `radix-maia` style, so `npx shadcn add <component>` generates rounded components. Most components in `frontend/src/components/ui/` were generated with the earlier square `radix-sera` style and then rounded by hand to match Maia: pill buttons and inputs (`rounded-4xl`), menus, popovers and tooltips `rounded-2xl`, menu items `rounded-xl`, dialogs `rounded-4xl`. Re-adding an existing component with `--overwrite` replaces those edits and Maia's spacing, so check the diff.
