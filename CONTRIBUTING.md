# Contributing

Thank you for contributing to `elysia-graceful-shutdown`.

## Scope

This repository is focused on a small, explicit DI core for standard ECMAScript decorators. Please keep proposals aligned with that goal and avoid bundling unrelated framework abstractions into the base package.

## Before you open a pull request

1. Open or reference an issue when the change affects public API or package behavior.
2. Keep changes narrowly scoped and explain the motivation.
3. Update docs when user-facing behavior changes.

## Git hooks

This repository uses Lefthook.

- `pre-commit` runs fast staged-file checks for lint and formatting.
- hooks are contributor-local and are not installed for package consumers.

Install or reinstall them locally with `bun run hooks:install`.

## Pull request checklist

- PR CI runs lint, format, typecheck, test, and build checks automatically.
- the change is focused and documented;
- scripts in the local checks section pass;
- package exports and Node compatibility were kept intact;
- new behavior includes tests or a clear explanation for why tests are not needed.
