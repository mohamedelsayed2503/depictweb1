# Security Guidelines

## Overview
This document outlines the security measures implemented in this Next.js application to protect against common web vulnerabilities.

## Security Features Implemented

### 1. Environment Variables Protection
- ✅ API keys moved to environment variables
- ✅ `.env.example` template provided
- ✅ Sensitive data excluded from version control
- ✅ Environment validation implemented

### 2. Input Validation & Sanitization
- ✅ Request body validation
- ✅ Input sanitization for XSS prevention
- ✅ File size limits enforced
- ✅ Image format validation

### 3. Rate Limiting
- ✅ API endpoint rate limiting
- ✅ Configurable limits via environment variables
- ✅ IP-based tracking
- ✅ Proper error responses

### 4. Security Headers
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Content Security Policy (CSP)
- ✅ Permissions Policy
- ✅ Strict Transport Security (HSTS)

### 5. CSRF Protection
- ✅ CSRF token validation for state-changing requests
- ✅ Origin validation
- ✅ Referer checking

### 6. Error Handling
- ✅ Generic error messages to prevent information disclosure
- ✅ Detailed logging for debugging (development only)
- ✅ Security event logging

### 7. Path Protection
- ✅ Blocking access to sensitive paths
- ✅ Automatic redirects for admin paths
- ✅ 404 responses for suspicious requests

## Environment Variables Required

```bash
# Copy .env.example to .env.local and fill in your values
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain_here
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id_here
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket_here
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id_here
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id_here
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_firebase_measurement_id_here
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## Security Best Practices

### For Developers
1. **Never commit sensitive data** to version control
2. **Always validate user input** before processing
3. **Use HTTPS** in production
4. **Keep dependencies updated** regularly
5. **Monitor security logs** for suspicious activity

### For Deployment
1. **Set strong environment variables** in production
2. **Enable HTTPS** with valid SSL certificates
3. **Configure proper CORS** settings
4. **Set up monitoring** and alerting
5. **Regular security audits** and penetration testing

## Security Monitoring

The application logs the following security events:
- Rate limit violations
- Invalid request origins
- CSRF validation failures
- Suspicious path access attempts
- API errors and exceptions
- Invalid input formats

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do not** create a public issue
2. Contact the development team directly
3. Provide detailed information about the vulnerability
4. Allow time for the issue to be addressed before disclosure

## Security Checklist for Production

- [ ] All environment variables properly set
- [ ] HTTPS enabled with valid certificates
- [ ] Rate limiting configured appropriately
- [ ] Security headers verified
- [ ] CORS settings configured
- [ ] Monitoring and logging enabled
- [ ] Regular security updates scheduled
- [ ] Backup and recovery procedures tested

## Additional Security Considerations

### Database Security (if applicable)
- Use parameterized queries to prevent SQL injection
- Implement proper access controls
- Encrypt sensitive data at rest
- Regular database backups

### Authentication & Authorization
- Implement strong password policies
- Use multi-factor authentication where possible
- Regular session management
- Proper role-based access control

### Infrastructure Security
- Keep servers and dependencies updated
- Use firewalls and network segmentation
- Regular security patches
- Intrusion detection systems

---

**Last Updated:** $(date)
**Security Review:** Pending
**Next Review:** $(date +30 days)