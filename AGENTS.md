# Architecture
- E-signature Markdown documents use the existing bundled pdf-lib/Liberation Serif renderer, with opt-in page headers and page breaks, to preserve the existing DOCX and legal-package rendering paths.
- MCP Markdown preview and creation require the administrator role checked through the caller-scoped client before privileged e-signature storage operations.