# Repository Cleanup Guide

This guide helps you clean the EUTLAS repository by removing unnecessary files, build artifacts, and temporary files.

## Quick Start

### Option 1: Local Cleanup (Recommended)

1. **Clone the repository** (if not already cloned):
   ```powershell
   git clone https://github.com/stschuer/EUTLAS.git
   cd EUTLAS
   ```

2. **Run the cleanup script**:
   ```powershell
   .\clean-repo.ps1
   ```

3. **Review changes**:
   ```powershell
   git status
   ```

4. **Commit and push**:
   ```powershell
   git add .
   git commit -m "chore: clean repository - remove build artifacts and temporary files"
   git push origin main
   ```

### Option 2: Analyze Remote Repository First

1. **Analyze what needs cleaning**:
   ```powershell
   .\clean-remote-repo.ps1
   ```

2. **Then follow Option 1 steps**

## What Gets Cleaned

The cleanup script removes:

### Build Artifacts
- `node_modules/` - Dependencies (will be regenerated with `pnpm install`)
- `.next/` - Next.js build output
- `dist/` - TypeScript compiled output
- `build/` - Build directories
- `.turbo/` - Turborepo cache
- `.pnpm-store/` - pnpm store

### Log Files
- `*.log` - All log files
- `npm-debug.log*`
- `yarn-debug.log*`
- `pnpm-debug.log*`

### Environment Files
- `.env` (keeps `.env.example`, `.env.development`, `.env.production`)

### Test Artifacts
- `coverage/` - Test coverage reports
- `.nyc_output/` - NYC test output

### OS Files
- `.DS_Store` - macOS
- `Thumbs.db` - Windows
- `desktop.ini` - Windows

### IDE Files
- `.vscode/` (keeps `settings.json`)
- `.idea/` - IntelliJ IDEA
- `*.swp`, `*.swo` - Vim swap files

### Temporary Files
- `*.tmp`
- `*.temp`
- `.cache/`

## After Cleanup

1. **Restore dependencies**:
   ```powershell
   pnpm install
   ```

2. **Rebuild shared types**:
   ```powershell
   cd shared
   pnpm build
   cd ..
   ```

3. **Verify everything works**:
   ```powershell
   pnpm build
   pnpm test
   ```

## .gitignore

A comprehensive `.gitignore` file has been created/updated to prevent these files from being committed in the future.

## Important Notes

⚠️ **Before running cleanup:**
- Make sure you have a backup or can restore from git
- Review the script output before committing
- Test the application after cleanup

✅ **Safe to remove:**
- Build artifacts (regenerated on build)
- Dependencies (restored with `pnpm install`)
- Log files
- OS/IDE files

❌ **Never remove:**
- Source code files
- Configuration files (unless temporary)
- Documentation
- `.gitignore` itself

## Troubleshooting

### Script fails with permission errors
Run PowerShell as Administrator or check file permissions.

### Missing dependencies after cleanup
Run `pnpm install` to restore all dependencies.

### Build fails after cleanup
1. Clean and rebuild: `pnpm build`
2. Check for missing environment files
3. Verify all dependencies are installed

## Manual Cleanup

If you prefer to clean manually, here are common commands:

```powershell
# Remove node_modules
Get-ChildItem -Path . -Recurse -Directory -Filter "node_modules" | Remove-Item -Recurse -Force

# Remove build artifacts
Get-ChildItem -Path . -Recurse -Directory -Filter ".next" | Remove-Item -Recurse -Force
Get-ChildItem -Path . -Recurse -Directory -Filter "dist" | Remove-Item -Recurse -Force

# Remove log files
Get-ChildItem -Path . -Recurse -Filter "*.log" | Remove-Item -Force
```

