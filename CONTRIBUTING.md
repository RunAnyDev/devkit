# Contributing to DevKit

Thanks for helping improve DevKit. This project is a browser-based collection of developer tools built with React, Vite, and TailwindCSS.

## Ways to contribute

- Report bugs with clear reproduction steps.
- Suggest focused tool improvements or new utilities.
- Fix UI, accessibility, performance, or documentation issues.
- Add tests or validation where practical.

## Development setup

```bash
npm install
npm run dev
```

Before opening a pull request, run:

```bash
npm run build
```

## Pull request guidelines

- Keep changes focused and small enough to review.
- Describe user-facing behavior and any tradeoffs.
- Include screenshots or recordings for UI changes.
- Avoid adding backend services; tools should run in-browser unless discussed first.
- Do not commit secrets, real tokens, private keys, or production credentials.

## Code style

- Follow existing React component patterns in `src/features` and `src/components`.
- Prefer simple, readable state and utility functions.
- Keep UI consistent with existing TailwindCSS styling.
- Use descriptive names; avoid broad refactors in feature PRs.

## New tool checklist

- Add feature component under `src/features`.
- Export it from `src/features/index.js` if needed.
- Add route/navigation entry in app layout files.
- Update `README.md` feature list.
- Confirm production build succeeds.

## Security

If you find a security issue, do not open a public issue. Follow `SECURITY.md` instead.
