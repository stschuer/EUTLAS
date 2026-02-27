# User Impersonation - Testing Guide

## Quick Start Testing

Follow these steps to test the user impersonation feature:

### Prerequisites

1. **Create a Global Admin User** (if you don't have one):
```javascript
// In MongoDB shell or Compass
db.users.updateOne(
  { email: "your-admin@email.com" },
  { $set: { isGlobalAdmin: true, verified: true, isActive: true } }
)
```

2. **Create a Test User** (non-admin):
```javascript
// Sign up normally through the app, or insert directly:
db.users.insertOne({
  email: "testuser@example.com",
  name: "Test User",
  passwordHash: "<bcrypt-hashed-password>",
  verified: true,
  isActive: true,
  isGlobalAdmin: false,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

### Testing Steps

#### 1. Backend Setup

Make sure the backend server is running:
```bash
cd backend
npm install  # If first time
npm run start:dev
```

The server should start and create the `impersonationlogs` collection automatically.

#### 2. Frontend Setup

Make sure the frontend is running:
```bash
cd frontend
npm install  # If first time
npm run dev
```

#### 3. Test Impersonation Flow

**Step 1: Log in as Global Admin**
1. Navigate to `http://localhost:3000/login`
2. Log in with your global admin account
3. You should see the dashboard

**Step 2: Navigate to Admin Panel**
1. Go to `/dashboard/admin/users` (or wherever your admin users page is)
2. You should see a list of all users

**Step 3: Impersonate a User**
1. Find a non-admin user in the list
2. Click the three-dot menu (⋯) next to the user
3. Click "Login as User"
4. Expected results:
   - Success toast notification
   - Redirect to `/dashboard`
   - **Yellow banner appears at top** showing:
     - "You are impersonating: [user email]"
     - Your admin email in smaller text
     - "Stop Impersonating" button

**Step 4: Browse as Impersonated User**
1. Navigate around the dashboard
2. Access the user's organizations, projects, etc.
3. Verify you see exactly what the user would see
4. Yellow banner should persist across all pages

**Step 5: Stop Impersonating**
1. Click "Stop Impersonating" button in yellow banner
2. Expected results:
   - Success toast notification
   - Yellow banner disappears
   - You're back in your admin account
   - Can navigate to admin panel again

#### 4. Verify Audit Logs

**Via API** (using Postman, curl, or browser dev tools):
```bash
curl -X GET "http://localhost:8000/api/v1/auth/impersonation-logs" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

Expected response:
```json
{
  "logs": [
    {
      "adminEmail": "your-admin@email.com",
      "impersonatedEmail": "testuser@example.com",
      "startedAt": "2024-01-15T10:30:00.000Z",
      "endedAt": "2024-01-15T10:35:00.000Z",
      "isActive": false,
      "clientIp": "::1",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "total": 1,
  "pages": 1
}
```

**Via MongoDB**:
```javascript
db.impersonationlogs.find().sort({ createdAt: -1 }).pretty()
```

### Edge Cases to Test

#### Test 1: Cannot Impersonate Admin
1. Try to impersonate another global admin user
2. Expected: "Login as User" button should be **disabled**
3. If you bypass UI and call API directly:
   - Expected: 403 error "Cannot impersonate other global administrators"

#### Test 2: Cannot Impersonate Inactive User
1. Deactivate a user (set `isActive: false`)
2. Try to impersonate them
3. Expected: "Login as User" button should be **disabled**
4. If you bypass UI and call API directly:
   - Expected: 400 error "Cannot impersonate inactive users"

#### Test 3: Non-Admin Cannot Impersonate
1. Log in as a regular (non-admin) user
2. Try to access `/dashboard/admin/users` - should be blocked
3. If you bypass and call API directly:
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/impersonate" \
     -H "Authorization: Bearer NON_ADMIN_JWT" \
     -H "Content-Type: application/json" \
     -d '{"userId": "some-user-id"}'
   ```
4. Expected: 403 error "Global admin access required"

#### Test 4: Stop Impersonating When Not Impersonating
1. Log in as admin normally (not impersonating)
2. Call stop-impersonating endpoint
3. Expected: Success response with message "Not currently impersonating"

#### Test 5: Token Expiration
1. Start impersonation
2. Wait for JWT to expire (or modify JWT_EXPIRES_IN to be very short for testing)
3. Try to make an API call
4. Expected: 401 Unauthorized, must re-authenticate

#### Test 6: Rate Limiting
1. Rapidly click "Login as User" 10+ times
2. Expected: After 10 requests in 1 minute, receive 429 error

### Integration Tests

If you have automated tests, add these test cases:

```typescript
// backend/test/auth.e2e-spec.ts

describe('User Impersonation (e2e)', () => {
  it('should allow global admin to impersonate user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUser.id })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(testUser.email);
    expect(response.body.data.impersonatedBy.email).toBe(adminUser.email);
  });

  it('should prevent non-admin from impersonating', async () => {
    await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${regularUserToken}`)
      .send({ userId: testUser.id })
      .expect(403);
  });

  it('should prevent impersonating other admins', async () => {
    await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: otherAdminUser.id })
      .expect(403);
  });

  it('should create audit log entry', async () => {
    await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUser.id })
      .expect(200);

    const logs = await impersonationLogModel.find().lean();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].adminEmail).toBe(adminUser.email);
    expect(logs[0].impersonatedEmail).toBe(testUser.email);
  });

  it('should allow stopping impersonation', async () => {
    // Start impersonation
    const impersonateResponse = await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: testUser.id })
      .expect(200);

    const impersonationToken = impersonateResponse.body.data.accessToken;

    // Stop impersonation
    const stopResponse = await request(app.getHttpServer())
      .post('/auth/stop-impersonating')
      .set('Authorization', `Bearer ${impersonationToken}`)
      .expect(200);

    expect(stopResponse.body.success).toBe(true);
    expect(stopResponse.body.data.user.email).toBe(adminUser.email);
  });
});
```

### Manual Testing Checklist

- [ ] Backend server starts without errors
- [ ] Frontend builds without errors
- [ ] Can log in as global admin
- [ ] Can access admin users page
- [ ] Can see "Login as User" in dropdown menu
- [ ] Button is disabled for admin users
- [ ] Button is disabled for inactive users
- [ ] Clicking "Login as User" shows success toast
- [ ] Yellow impersonation banner appears
- [ ] Banner shows correct user email
- [ ] Banner shows admin email
- [ ] Can navigate as impersonated user
- [ ] Banner persists across pages
- [ ] Can click "Stop Impersonating"
- [ ] Banner disappears after stopping
- [ ] Returned to admin account
- [ ] Impersonation logs are created in database
- [ ] Can retrieve logs via API
- [ ] Non-admin users cannot impersonate
- [ ] Cannot impersonate other admins
- [ ] Cannot impersonate inactive users

### Common Issues

**Issue**: Yellow banner doesn't show
- Check browser console for errors
- Verify `ImpersonationBanner` is imported in `layout.tsx`
- Check if `impersonation` state exists in auth store
- Clear browser cache

**Issue**: API returns 403 Forbidden
- Verify user has `isGlobalAdmin: true` in database
- Check JWT token is valid and not expired
- Verify GlobalAdminGuard is properly configured

**Issue**: "Login as User" button missing
- Check if you have the latest code
- Verify imports in `page.tsx`
- Check if `LogIn` icon is imported from lucide-react

**Issue**: MongoDB errors
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify `impersonationlogs` collection exists (auto-created)

### Performance Testing

Test with large numbers of users:

1. Create 1000+ test users
2. Load admin users page
3. Verify pagination works
4. Test search functionality
5. Test impersonation still works quickly

### Security Testing

1. **JWT Tampering**: Try to modify JWT payload to add impersonation fields
   - Expected: Signature verification fails, 401 error

2. **SQL Injection**: Try injecting malicious userId values
   - Expected: MongoDB handles safely, no injection

3. **XSS**: Try creating user with malicious email/name containing `<script>` tags
   - Expected: Properly escaped in UI

4. **CSRF**: Try impersonation from different origin
   - Expected: CORS policy blocks (if enabled)

## Success Criteria

The feature is working correctly if:

✅ Global admins can impersonate non-admin users
✅ Impersonation creates audit log entries
✅ Yellow banner appears during impersonation
✅ Can stop impersonation and return to admin account
✅ Non-admins cannot access impersonation features
✅ Cannot impersonate other global admins
✅ Cannot impersonate inactive users
✅ All API endpoints return expected responses
✅ No console errors or warnings
✅ Database logs are created correctly

## Next Steps After Testing

Once testing is complete:

1. **Deploy to staging environment**
2. **Test with real user data** (with permission)
3. **Train support team** on proper usage
4. **Document internal procedures** for when to use impersonation
5. **Set up monitoring** for impersonation logs
6. **Create alerts** for unusual impersonation patterns
7. **Deploy to production**

## Rollback Plan

If issues are found in production:

1. **Immediate**: Remove "Login as User" button from UI
2. **Quick**: Add feature flag to disable impersonation endpoint
3. **Full rollback**: Revert all changes using git

```bash
# Quick disable (add to AuthController)
if (process.env.IMPERSONATION_ENABLED !== 'true') {
  throw new ForbiddenException('Feature disabled');
}
```
