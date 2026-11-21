# Contributing

Thank you for your interest in contributing to Dracula CMS.

## Before you start

- Read the setup and architecture notes in [README.md](README.md).
- Search existing issues before opening a new one.
- For a significant feature or behavior change, open an issue to discuss the proposal first.
- By contributing, you agree that your contributions are licensed under the Mozilla Public License 2.0.

## Development setup

Requirements:

- Node.js 18.17.1 or newer (Node.js 20 or 22 is recommended)
- An Appwrite Cloud project and API key

```bash
npm install
cp .env.example .env
```

Fill in `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, and `SITE_URL`, then provision the local Appwrite resources:

```bash
npm run setup
npm run dev
```

The development server uses `http://localhost:3000`.

## Making changes

1. Fork the repository and create a focused branch.
2. Make the smallest coherent change for one issue or feature.
3. Follow the existing TypeScript, Astro, and Markdown conventions.
4. Keep credentials, session secrets, and personal data out of commits.
5. Update documentation and tests when behavior or configuration changes.
6. Run checks before submitting:

```bash
npm run check
npm run build
```

The repository does not currently include an automated test suite. You should manually verify affected authentication, editor, rendering, and Appwrite setup flows.

## Pull requests

- Explain the problem and the proposed solution.
- Include relevant issue numbers, screenshots, and test steps when applicable.
- Keep pull requests small and focused.
- Confirm that `npm run check` and `npm run build` pass.
- Never include `.env` files or Appwrite credentials.

## Reporting bugs and requesting features

Open a GitHub issue with:

- A clear description and expected behavior
- Actual behavior and reproduction steps
- Environment details
- Relevant logs with secrets removed
- Screenshots or recordings for UI issues

## Security issues

Do not disclose security vulnerabilities in public issues. Contact the maintainer privately through the repository owner's GitHub profile and include affected components, reproduction steps, and impact.

## Code of conduct

Participation in this project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
