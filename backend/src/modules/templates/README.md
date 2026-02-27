# Templates Module

A unified template management system for EUTLAS that supports multiple template types including dashboards, schemas, documents (PPT/DOCX), and reports.

## Features

- ✅ **Multiple Template Types**: Dashboard, Schema, Document, Report
- ✅ **Visibility Control**: Global, Tenant-specific, or Private templates
- ✅ **File Upload Support**: Upload PPT, PPTX, DOC, DOCX, PDF files
- ✅ **Version Tracking**: Automatic versioning with history
- ✅ **Usage Analytics**: Track template usage across the platform
- ✅ **Full-text Search**: Search templates by name, description, and tags
- ✅ **Featured Templates**: Mark templates as featured for discovery
- ✅ **System Templates**: Protected templates that can't be deleted
- ✅ **Admin UI**: Complete admin interface for template management

## Template Types

### Dashboard Templates
JSON-based templates for monitoring dashboards with pre-configured widgets and layouts.

```typescript
{
  type: 'dashboard',
  category: 'monitoring',
  content: {
    widgets: [
      {
        id: 'cpu-gauge',
        title: 'CPU Usage',
        type: 'gauge',
        query: { metric: 'cpu_percent' },
        position: { x: 0, y: 0, width: 3, height: 2 }
      }
    ]
  }
}
```

### Schema Templates
MongoDB schema validation templates for data quality and compliance.

```typescript
{
  type: 'schema',
  category: 'validation',
  content: {
    bsonType: 'object',
    required: ['email', 'createdAt'],
    properties: {
      email: { bsonType: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
    }
  }
}
```

### Document Templates
File-based templates (PPT, DOCX, PDF) for presentations and documentation.

```typescript
{
  type: 'document',
  category: 'presentation',
  fileUrl: '/uploads/templates/...',
  fileName: 'quarterly-report.pptx',
  fileSize: 2048576,
  mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}
```

## API Endpoints

### Admin Endpoints (Global Admin only)

```
GET    /admin/templates              - List all templates
GET    /admin/templates/stats        - Get template statistics
GET    /admin/templates/:id          - Get template by ID
POST   /admin/templates              - Create new template
PUT    /admin/templates/:id          - Update template
DELETE /admin/templates/:id          - Delete template
POST   /admin/templates/:id/duplicate   - Duplicate template
POST   /admin/templates/:id/upload      - Upload file for template
POST   /admin/templates/:id/increment-usage - Increment usage count
```

### Tenant Endpoints (All authenticated users)

```
GET    /tenant/templates             - List templates (global + tenant)
GET    /tenant/templates/:id         - Get template by ID
POST   /tenant/templates/:id/increment-usage - Increment usage count
```

## Query Parameters

```typescript
{
  type?: 'dashboard' | 'schema' | 'document' | 'report',
  category?: 'monitoring' | 'analytics' | 'validation' | 'documentation' | 'presentation' | 'compliance' | 'custom',
  visibility?: 'global' | 'tenant' | 'private',
  tenantId?: string,
  activeOnly?: boolean,
  featuredOnly?: boolean,
  tag?: string,
  search?: string,
  page?: number,
  limit?: number
}
```

## Usage Examples

### Create a Dashboard Template

```typescript
const template = await templatesApi.create({
  name: 'Production Monitoring',
  description: 'Real-time production cluster monitoring',
  type: 'dashboard',
  category: 'monitoring',
  visibility: 'global',
  tags: ['production', 'monitoring', 'realtime'],
  isFeatured: true,
  content: {
    widgets: [/* widget definitions */]
  }
});
```

### Upload a Document Template

```typescript
// First create the template
const template = await templatesApi.create({
  name: 'Q4 Board Presentation',
  type: 'document',
  category: 'presentation',
  visibility: 'tenant',
  tenantId: 'org123'
});

// Then upload the file
await templatesApi.uploadFile(template.data.id, pptxFile);
```

### List Templates for Tenant

```typescript
const result = await templatesApi.listForTenant({
  type: 'dashboard',
  activeOnly: true,
  featuredOnly: true,
  page: 1,
  limit: 20
});
```

## File Upload

Supported file types:
- **Presentations**: .ppt, .pptx
- **Documents**: .doc, .docx
- **PDFs**: .pdf

Maximum file size: **50MB**

Files are stored in: `./uploads/templates/`

## Seeding Default Templates

The module includes a seed service that creates default system templates:

```typescript
import { SeedTemplatesService } from './seed-templates.service';

// In your seed script
const seedService = app.get(SeedTemplatesService);
await seedService.seedDefaultTemplates(adminUserId);
```

## Database Schema

### Template Collection

```typescript
{
  name: string;
  description?: string;
  type: 'dashboard' | 'schema' | 'document' | 'report';
  category: string;
  visibility: 'global' | 'tenant' | 'private';
  tenantId?: ObjectId;
  createdBy: ObjectId;
  updatedBy?: ObjectId;
  content?: Record<string, any>;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isActive: boolean;
  isFeatured: boolean;
  isSystem: boolean;
  tags: string[];
  usageCount: number;
  previewUrl?: string;
  metadata?: Record<string, any>;
  version: number;
  previousVersion?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes

- `{ type: 1, category: 1 }`
- `{ visibility: 1, isActive: 1 }`
- `{ tenantId: 1, isActive: 1 }`
- `{ tags: 1 }`
- Text index on `name`, `description`, `tags`

## Migration from Old System

The old hardcoded templates in `DashboardsService.getTemplates()` and `SchemaValidationService.getTemplates()` should be migrated to use this new system:

1. Run the seed script to populate system templates
2. Update dashboard and schema modules to fetch templates from the database
3. Remove hardcoded template arrays

## Future Enhancements

- [ ] Template preview generation
- [ ] Template marketplace
- [ ] Template versioning and rollback
- [ ] Template collaboration features
- [ ] Template export/import
- [ ] Cloud storage integration (S3/MinIO)
- [ ] Template analytics dashboard
- [ ] Template recommendations based on usage

## Security Considerations

- Only global admins can create/edit/delete global templates
- Tenant admins can only manage their tenant's templates
- System templates are protected and cannot be modified or deleted
- File uploads are validated for type and size
- All operations are logged in audit trails

## Testing

```bash
# Run unit tests
npm test templates.service.spec.ts

# Run e2e tests
npm run test:e2e -- --grep "Templates"
```

## License

Internal EUTLAS module - All rights reserved
