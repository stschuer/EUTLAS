"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Copy,
  Upload,
  Download,
  Filter,
  Star,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";

interface Template {
  id: string;
  name: string;
  description?: string;
  type: "dashboard" | "schema" | "document" | "report";
  category: string;
  visibility: "global" | "tenant" | "private";
  isActive: boolean;
  isFeatured: boolean;
  isSystem: boolean;
  tags: string[];
  usageCount: number;
  fileName?: string;
  fileSize?: number;
  createdAt: string;
  updatedAt: string;
}

const templateTypes = [
  { value: "dashboard", label: "Dashboard" },
  { value: "schema", label: "Schema" },
  { value: "document", label: "Document (PPT/DOCX)" },
  { value: "report", label: "Report" },
];

const templateCategories = [
  { value: "monitoring", label: "Monitoring" },
  { value: "analytics", label: "Analytics" },
  { value: "validation", label: "Validation" },
  { value: "documentation", label: "Documentation" },
  { value: "presentation", label: "Presentation" },
  { value: "compliance", label: "Compliance" },
  { value: "custom", label: "Custom" },
];

const visibilityOptions = [
  { value: "global", label: "Global (All Tenants)" },
  { value: "tenant", label: "Tenant Specific" },
  { value: "private", label: "Private" },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "document" as any,
    category: "documentation" as any,
    visibility: "global" as any,
    tags: "",
    isFeatured: false,
    content: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("accessToken");
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);

      const url = `/api/v1/admin/templates${params.toString() ? `?${params}` : ""}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.data.templates || []);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [search, typeFilter]);

  const handleCreate = async () => {
    if (!formData.name || !formData.type || !formData.category) {
      toast({ variant: "destructive", title: "Please fill all required fields" });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("accessToken");
      const payload: any = {
        ...formData,
        tags: formData.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };

      if (formData.content && formData.type !== "document") {
        try {
          payload.content = JSON.parse(formData.content);
        } catch (e) {
          toast({ variant: "destructive", title: "Invalid JSON content" });
          setSubmitting(false);
          return;
        }
      }

      const response = await fetch("/api/v1/admin/templates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast({ title: "Template created successfully" });
        setCreateOpen(false);
        setFormData({
          name: "",
          description: "",
          type: "document",
          category: "documentation",
          visibility: "global",
          tags: "",
          isFeatured: false,
          content: "",
        });
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({ variant: "destructive", title: error.message || "Failed to create template" });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to create template" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedTemplate || !uploadFile) {
      toast({ variant: "destructive", title: "Please select a file" });
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("accessToken");
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await fetch(`/api/v1/admin/templates/${selectedTemplate.id}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        toast({ title: "File uploaded successfully" });
        setUploadOpen(false);
        setUploadFile(null);
        setSelectedTemplate(null);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({ variant: "destructive", title: error.message || "Failed to upload file" });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to upload file" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("accessToken");
      const response = await fetch(`/api/v1/admin/templates/${selectedTemplate.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok || response.status === 204) {
        toast({ title: "Template deleted successfully" });
        setDeleteOpen(false);
        setSelectedTemplate(null);
        fetchTemplates();
      } else {
        const error = await response.json();
        toast({ variant: "destructive", title: error.message || "Failed to delete template" });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to delete template" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDuplicate = async (template: Template) => {
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("accessToken");
      const response = await fetch(`/api/v1/admin/templates/${template.id}/duplicate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `${template.name} (Copy)` }),
      });

      if (response.ok) {
        toast({ title: "Template duplicated successfully" });
        fetchTemplates();
      } else {
        toast({ variant: "destructive", title: "Failed to duplicate template" });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to duplicate template" });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "-";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      dashboard: "bg-blue-500/10 text-blue-500",
      schema: "bg-green-500/10 text-green-500",
      document: "bg-purple-500/10 text-purple-500",
      report: "bg-orange-500/10 text-orange-500",
    };
    return colors[type] || "bg-gray-500/10 text-gray-500";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage dashboard, schema, and document templates
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                {templateTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-center">Usage</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {template.name}
                            {template.isFeatured && (
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            )}
                            {template.isSystem && (
                              <Badge variant="secondary" className="text-xs">
                                System
                              </Badge>
                            )}
                          </div>
                          {template.description && (
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {template.description}
                            </div>
                          )}
                          {template.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {template.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadgeColor(template.type)}>
                        {template.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{template.category}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{template.visibility}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm">{template.usageCount}</span>
                    </TableCell>
                    <TableCell>
                      {template.fileName ? (
                        <div className="text-sm">
                          <div className="font-medium">{template.fileName}</div>
                          <div className="text-muted-foreground">
                            {formatFileSize(template.fileSize)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">No file</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedTemplate(template);
                              setUploadOpen(true);
                            }}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Upload File
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          {!template.isSystem && (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setSelectedTemplate(template);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a new template for dashboards, schemas, or documents
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="My Template"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description of this template..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateCategories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility *</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value: any) => setFormData({ ...formData, visibility: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibilityOptions.map((vis) => (
                    <SelectItem key={vis.value} value={vis.value}>
                      {vis.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                placeholder="mongodb, analytics, production"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              />
            </div>
            {formData.type !== "document" && (
              <div className="space-y-2">
                <Label htmlFor="content">Content (JSON)</Label>
                <Textarea
                  id="content"
                  placeholder='{"key": "value"}'
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Optional: Provide JSON content for dashboard/schema templates
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
            <DialogDescription>
              Upload a PPT, PPTX, DOC, DOCX, or PDF file for "{selectedTemplate?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                accept=".ppt,.pptx,.doc,.docx,.pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">
                Max file size: 50MB. Allowed formats: PPT, PPTX, DOC, DOCX, PDF
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={submitting || !uploadFile}>
              {submitting ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? "Deleting..." : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
