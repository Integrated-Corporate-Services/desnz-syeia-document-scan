# Contributing

Thank you for contributing to this project.

## Reporting bugs

[Open an issue](https://github.com/DESNZ/document-scan/issues/new) with:
- Environment (Node.js version, deployment type)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact sensitive data)

## Suggesting features

Open an issue describing:
- The problem it solves
- Proposed solution
- Alternatives considered

## Submitting changes

### Setup

```bash
git clone https://github.com/YOUR-USERNAME/document-scan.git
cd document-scan
npm install
cp .env.example .env.local
# Edit .env.local
npm test
```

### Development

```bash
git checkout -b feature/my-change
# Make changes
npm run type-check
npm test
npm run build
# Optional: npm run lint (requires an ESLint config file, e.g. eslint.config.js)
git commit -m "feat: description"
git push origin feature/my-change
```

**Commit format:** `type: description`
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `perf:` Performance
- `chore:` Tooling

### Code standards

- TypeScript strict mode
- ES modules
- Parameterized SQL queries
- Structured logging (no `console.log`)
- 80%+ test coverage

### Security

Never commit:
- AWS credentials
- Database passwords
- Real S3 bucket names
- PII or file content

Use `.env.local` for secrets.

Report vulnerabilities: [SECURITY.md](SECURITY.md)

## License

By contributing, you agree your contributions are licensed under [MIT License](LICENSE).

