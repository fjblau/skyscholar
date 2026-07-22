# Project Instructions

## Git & Pull Requests

**ALL pull requests MUST target `main`.**

- When creating a PR for any feature, fix, or follow-on work, always use `--base main`.
- Railway deployment is triggered by merges to `main`. A PR targeting any other branch will NOT deploy.

## Deployment

- Production deploys are handled by Railway on merge to `main`.
- Do not manually trigger deploys; merging a PR to `main` is sufficient.
