# Security Hardening for Mint-Lite

## Current Security Status

### ✅ Already Implemented
- Environment variables for secrets (.env file)
- .gitignore excludes .env and .db files
- SQLite with local file storage (no network exposure)
- Input validation on Plaid token exchange
- Single-user architecture (no multi-tenant issues)
- HTTPS to Plaid API

### ⚠️ Security Concerns to Address

## 1. Database Security

**Current Risk:** Database file is unencrypted
**Recommendation:**
- Use SQLCipher for encrypted SQLite database
- Add database password to .env
- Encrypt access tokens at rest

**Quick Fix:**
```bash
npm install @journeyapps/sqlcipher
# Update lib.js to use encrypted database
```

## 2. Access Token Storage

**Current Risk:** Plaid access tokens stored in plain text
**Recommendation:**
- Encrypt access tokens before storing
- Use node's crypto module with a master key
- Store master key in .env (or use system keychain)

## 3. Network Security

**Current Risk:** Server binds to 0.0.0.0 (all interfaces)
**Recommendation:**
- Bind only to localhost (127.0.0.1)
- If remote access needed, use reverse proxy with SSL
- Add rate limiting

**Quick Fix:**
```javascript
// In server.js, change:
await app.listen({ port: env.port, host: '127.0.0.1' });
```

## 4. Authentication

**Current Risk:** No authentication on API endpoints
**Recommendation:**
- Add API key authentication for local use
- Add session-based auth if exposing to network
- Use Fastify's auth plugins

**Quick Fix (API Key):**
```javascript
// Add to .env
API_KEY=your-random-api-key-here

// Add middleware to server.js
app.addHook('preHandler', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

## 5. CORS Configuration

**Current Risk:** No CORS policy defined
**Recommendation:**
- Explicitly define allowed origins
- Restrict to localhost only

**Quick Fix:**
```bash
npm install @fastify/cors
```

## 6. Input Validation

**Current Risk:** Minimal input validation
**Recommendation:**
- Validate all user inputs
- Use schema validation (Fastify has built-in support)
- Sanitize inputs before database operations

## 7. Logging & Monitoring

**Current Risk:** Logs may contain sensitive data
**Recommendation:**
- Never log access tokens or secrets
- Redact sensitive fields in logs
- Add audit trail for account access

## 8. File Permissions

**Current Risk:** Default file permissions
**Recommendation:**
```bash
# Restrict database and .env file permissions
chmod 600 mint.db
chmod 600 .env
```

## 9. Dependency Security

**Recommendation:**
```bash
# Regular security audits
npm audit
npm audit fix

# Keep dependencies updated
npm outdated
npm update
```

## 10. Environment Isolation

**Current Risk:** Production credentials in development
**Recommendation:**
- Use .env.development and .env.production
- Use Plaid Sandbox for testing
- Never commit real credentials

## Quick Hardening Script

Run this to apply basic security improvements:

```bash
# File permissions (Unix/Mac only, skip on Windows)
chmod 600 .env
chmod 600 mint.db

# Install security packages
npm install helmet @fastify/rate-limit @fastify/cors

# Run security audit
npm audit
```

## Priority Actions (Recommended Order)

### High Priority (Do Now):
1. ✅ Change server binding to localhost only
2. ✅ Add API key authentication
3. ✅ Add rate limiting
4. ✅ Add Helmet for security headers
5. ✅ Set file permissions (Unix/Mac)

### Medium Priority (This Week):
6. Encrypt access tokens in database
7. Add input validation schemas
8. Implement proper error handling (no stack traces in production)
9. Add audit logging

### Low Priority (As Needed):
10. Move to SQLCipher for encrypted database
11. Add session management if exposing to network
12. Implement OAuth for multi-user support
13. Add 2FA for sensitive operations

## Production Deployment Checklist

If deploying to a server:
- [ ] Use HTTPS only (reverse proxy with nginx/caddy)
- [ ] Enable firewall rules
- [ ] Use environment-specific .env files
- [ ] Set NODE_ENV=production
- [ ] Disable debug logging
- [ ] Use process manager (PM2)
- [ ] Set up automated backups
- [ ] Monitor for suspicious activity
- [ ] Implement proper session management
- [ ] Add CSRF protection
- [ ] Use secure cookies

## References
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Fastify Security Best Practices](https://www.fastify.io/docs/latest/Guides/Security/)
- [Plaid Security](https://plaid.com/security/)
