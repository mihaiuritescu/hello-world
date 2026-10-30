---
name: add-dependency
description: Add an npm package safely, checking need, licence, maintenance and release age before pinning it exactly. Use whenever a task seems to need a new dependency.
argument-hint: <package name>
---

# Add a dependency

1. **Challenge the need.** Could the platform, an existing dependency, or about 20 lines of our own code do the job? If so, stop and do that instead.
2. **Inspect the package:**

   ```
   npm view <pkg> version license deprecated engines time.modified dist.unpackedSize
   ```

   Reject it if any of these is true:
   - it is deprecated;
   - it is unmaintained (no release in 18 months);
   - it needs payment or a licence key;
   - its licence is not free to use;
   - its engines exclude Node 24.
3. **Respect the release age.** pnpm refuses versions published less than a day ago. Never add `minimumReleaseAgeExclude`: install the newest version that passes the check.
4. **Install it pinned:** `pnpm add -E <pkg>@<version>`.
   - Use `dependencies` only for what the server needs at runtime.
   - Use `devDependencies` (`-D`) for browser-only packages and tooling, which keeps them out of the Docker image.
5. **Check:** run `pnpm check:licenses`, then `pnpm verify`.
6. **Commit the dependency on its own:**
   - Subject: `build(deps): add <pkg> <version> (<licence>)`.
   - Body: why it is needed, and what you considered instead.
