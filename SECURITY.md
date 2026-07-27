# Security Policy

## Reporting a vulnerability

**DO NOT** open public issues for security vulnerabilities.
 
**GitHub:** [Private Security Advisory](https://github.com/DESNZ/document-scan/security/advisories/new)

Include:
- Vulnerability description
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

**Response time:**
- Acknowledgment: 2 business days
- Fix: Based on severity (24h-90d)

## Severity levels

| Level | Examples | Response |
|-------|----------|----------|
| **Critical** | RCE, data breach | 24-48h |
| **High** | Auth bypass, file access | 7 days |
| **Medium** | DoS, info disclosure | 30 days |
| **Low** | Config issues | 90 days |

## Security features

- AWS Secrets Manager for credentials
- IAM roles (no hardcoded keys)
- TLS 1.3 for database
- S3 bucket encryption (AES-256)
- ClamAV auto-updates
- SQL parameterized queries
- Log sanitization

## Best practices

### For deployers
- Use private subnets
- Rotate secrets every 90 days
- Monitor ClamAV updates
- Configure S3 bucket policies

### For developers
- Never commit secrets
- Use `.env.local` (gitignored)
- Validate all inputs
- Use parameterized queries
- Log metadata only, not content

## Dependencies

```bash
npm audit          # Check vulnerabilities
npm audit fix      # Auto-fix (safe)
```

## Compliance

- NCSC Cloud Security Principles
- GDS Service Standard
- GDPR Article 32
- ISO 27001

---

