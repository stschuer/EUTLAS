# User Impersonation Feature

## Overview

The User Impersonation feature allows Global Administrators to securely log in as any non-admin user for support, debugging, and troubleshooting purposes. This feature includes comprehensive audit logging and a clear UI indication when impersonating.

## Security Features

### Access Control
- **Global Admin Only**: Only users with `isGlobalAdmin: true` can impersonate
- **No Admin Impersonation**: Cannot impersonate other global administrators
- **Active Users Only**: Cannot impersonate inactive/deactivated users
- **Rate Limited**: Maximum 10 impersonations per minute per IP

### Audit Trail
- **Complete Logging**: Every impersonation session is logged with:
  - Admin user ID and email
  - Target user ID and email
  - Start timestamp
  - End timestamp (when stopped)
  - Client IP address
  - User agent
  - Active status
- **Persistent Records**: Logs are stored permanently in the database
- **Admin Dashboard**: View all impersonation history via API endpoint

### JWT Security
- **Metadata in Token**: JWT includes impersonation metadata:
  - `impersonatedBy`: Original admin user ID
  - `impersonatedByEmail`: Original admin email
  - `impersonationLogId`: Reference to audit log entry
- **Standard Expiration**: Follows same JWT expiration rules as normal logins

## How to Use

### Starting Impersonation

1. **Navigate to Admin Panel**
   ```
   /dashboard/admin/users
   ```

2. **Find Target User**
   - Use the search box to filter users
   - Locate the user you want to impersonate

3. **Click "Login as User"**
   - Click the three-dot menu (⋯) next to the user
   - Select "Login as User" from the dropdown
   - The option is disabled for:
     - Global administrators (cannot impersonate admins)
     - Inactive users

4. **Confirm Impersonation**
   - You'll see a success toast notification
   - Automatically redirected to `/dashboard`
   - Yellow banner appears at top of page

### While Impersonating

- **Visual Indicator**: Prominent yellow banner at the top shows:
  - Current impersonated user email
  - Your admin email (in smaller text)
  - "Stop Impersonating" button

- **Full Access**: You have complete access to:
  - User's organizations
  - User's projects
  - User's clusters
  - User's settings
  - Everything the user can see/do

- **No Password Required**: You are logged in as the user without needing their password

### Stopping Impersonation

Click the **"Stop Impersonating"** button in the yellow banner:
- Immediately ends the impersonation session
- Returns you to your admin account
- Generates fresh JWT token for your admin session
- Updates the audit log with end timestamp

## API Endpoints

### POST /api/v1/auth/impersonate
**Description**: Start impersonating a user

**Auth Required**: Yes (JWT + Global Admin)

**Request Body**:
```json
{
  "userId": "507f1f77bcf86cd799439011"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 604800,
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "verified": true
    },
    "impersonatedBy": {
      "id": "507f1f77bcf86cd799439012",
      "email": "admin@example.com",
      "name": "Admin User"
    }
  }
}
```

**Error Responses**:
- `403 Forbidden`: Not a global admin
- `400 Bad Request`: Target user not found or cannot be impersonated
- `429 Too Many Requests`: Rate limit exceeded

### POST /api/v1/auth/stop-impersonating
**Description**: Stop current impersonation session

**Auth Required**: Yes (JWT)

**Request Body**: None

**Success Response** (200):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 604800,
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "email": "admin@example.com",
      "name": "Admin User",
      "verified": true
    }
  }
}
```

**Notes**:
- If not currently impersonating, returns success without changing token
- Automatically updates audit log

### GET /api/v1/auth/impersonation-logs
**Description**: Retrieve impersonation audit logs

**Auth Required**: Yes (JWT + Global Admin)

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 50, max: 1000)

**Success Response** (200):
```json
{
  "logs": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "adminUserId": "507f1f77bcf86cd799439012",
      "adminEmail": "admin@example.com",
      "impersonatedUserId": "507f1f77bcf86cd799439011",
      "impersonatedEmail": "user@example.com",
      "startedAt": "2024-01-15T10:30:00.000Z",
      "endedAt": "2024-01-15T10:45:00.000Z",
      "clientIp": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "isActive": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:45:00.000Z"
    }
  ],
  "total": 42,
  "pages": 1
}
```

## Database Schema

### ImpersonationLog Collection
```typescript
{
  adminUserId: ObjectId;        // Admin who initiated impersonation
  adminEmail: string;           // Admin's email
  impersonatedUserId: ObjectId; // Target user ID
  impersonatedEmail: string;    // Target user's email
  startedAt: Date;              // When impersonation started
  endedAt?: Date;               // When impersonation ended (null if active)
  clientIp?: string;            // Client IP address
  userAgent?: string;           // Client user agent
  isActive: boolean;            // Whether session is currently active
  createdAt: Date;              // Record creation timestamp
  updatedAt: Date;              // Record update timestamp
}
```

**Indexes**:
- `{ adminUserId: 1, createdAt: -1 }`
- `{ impersonatedUserId: 1, createdAt: -1 }`
- `{ isActive: 1 }`

## Frontend Components

### ImpersonationBanner
**Location**: `frontend/src/components/auth/impersonation-banner.tsx`

**Description**: Yellow banner displayed at top of dashboard when impersonating

**Features**:
- Shows impersonated user email
- Shows admin user email
- "Stop Impersonating" button
- Auto-hides when not impersonating
- Handles errors gracefully

### Updated Auth Store
**Location**: `frontend/src/stores/auth-store.ts`

**New State**:
```typescript
interface ImpersonationInfo {
  originalAdminId: string;
  originalAdminEmail: string;
  originalAdminName?: string;
  impersonationLogId: string;
}

// Added to AuthState:
impersonation: ImpersonationInfo | null;
isImpersonating: () => boolean;
clearImpersonation: () => void;
```

**Usage**:
```typescript
import { useAuthStore } from '@/stores/auth-store';

const { impersonation, isImpersonating } = useAuthStore();

if (isImpersonating()) {
  console.log('Currently impersonating user');
  console.log('Original admin:', impersonation?.originalAdminEmail);
}
```

## Backend Implementation

### Files Modified/Created

1. **DTOs**:
   - `backend/src/modules/auth/dto/impersonate.dto.ts`

2. **Schemas**:
   - `backend/src/modules/auth/schemas/impersonation-log.schema.ts`

3. **Service**:
   - `backend/src/modules/auth/auth.service.ts`
     - `impersonateUser()`
     - `stopImpersonating()`
     - `getImpersonationLogs()`

4. **Controller**:
   - `backend/src/modules/auth/auth.controller.ts`
     - POST `/auth/impersonate`
     - POST `/auth/stop-impersonating`
     - GET `/auth/impersonation-logs`

5. **Module**:
   - `backend/src/modules/auth/auth.module.ts`
     - Added ImpersonationLog to MongooseModule

## Best Practices

### When to Use Impersonation

✅ **Good Use Cases**:
- Investigating user-reported bugs
- Verifying user permissions
- Testing user-specific features
- Providing direct support
- Debugging data access issues

❌ **Avoid**:
- Routine testing (use test accounts)
- Accessing sensitive user data without reason
- Long-term monitoring
- Bypassing proper access controls

### Security Guidelines

1. **Document Usage**: Always note why you're impersonating in support tickets
2. **Minimize Duration**: Only impersonate as long as necessary
3. **User Privacy**: Treat impersonated sessions with same confidentiality as passwords
4. **Regular Audits**: Review impersonation logs regularly for unusual patterns
5. **User Notification**: Consider notifying users when their account is accessed (future enhancement)

### Compliance Considerations

- **GDPR**: Audit logs help demonstrate access control compliance
- **SOC 2**: Complete audit trail of admin access to user accounts
- **HIPAA**: (If applicable) Logs support access control requirements
- **PCI DSS**: (If applicable) Demonstrates administrative access monitoring

## Troubleshooting

### Issue: "Only global admins can impersonate users"
**Solution**: Verify your user account has `isGlobalAdmin: true` in the database:
```javascript
db.users.findOne({ email: "your-admin@email.com" })
```

### Issue: "Cannot impersonate other global administrators"
**Solution**: This is by design. Cannot impersonate other admins for security.

### Issue: Impersonation banner doesn't appear
**Solution**: 
1. Check browser console for errors
2. Verify JWT token includes impersonation metadata
3. Clear browser cache and localStorage
4. Check that `ImpersonationBanner` is imported in layout

### Issue: Can't stop impersonating
**Solution**:
1. Try manually calling API: `POST /api/v1/auth/stop-impersonating`
2. Clear localStorage and log out/in normally
3. Check server logs for errors

## Future Enhancements

Potential improvements for this feature:

1. **User Notifications**:
   - Email users when their account is accessed by admin
   - In-app notification system

2. **Enhanced Audit Dashboard**:
   - Web UI for viewing impersonation logs
   - Filtering and search capabilities
   - Export to CSV for compliance

3. **Time Limits**:
   - Auto-expire impersonation sessions after X minutes
   - Configurable per admin or per organization

4. **Approval Workflow**:
   - Require approval from another admin
   - Temporary impersonation tokens

5. **Session Recording**:
   - Record actions taken during impersonation
   - Detailed activity log per session

6. **Analytics**:
   - Dashboard showing impersonation patterns
   - Alerts for unusual access patterns

## Support

For issues or questions about user impersonation:

1. Check this documentation
2. Review server logs in `backend/logs/`
3. Query impersonation logs: `GET /api/v1/auth/impersonation-logs`
4. Contact your development team
