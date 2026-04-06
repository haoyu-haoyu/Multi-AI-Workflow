# Contributing to Multi-AI Workflow (MAW)

## Development Setup

```bash
# Clone the repository
git clone https://github.com/haoyu-haoyu/Multi-AI-Workflow.git
cd Multi-AI-Workflow

# Install MAW CLI dependencies
cd maw && npm install && npm run build

# Install Dashboard dependencies
cd ../dashboard && npm install && npm run build

# Install Python bridges (optional)
cd ../bridges && pip install -e ".[dev]"
```

## Running Tests

```bash
# MAW CLI tests
cd maw && npm test

# Type checking
cd maw && npx tsc --noEmit
```

## Code Style

- **TypeScript**: Strict mode enabled, avoid `any` types
- **Formatting**: Use consistent indentation (2 spaces)
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure type checking passes: `npx tsc --noEmit`
5. Write clear commit messages
