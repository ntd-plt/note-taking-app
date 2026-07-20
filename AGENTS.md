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
