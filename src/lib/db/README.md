# Database Access Layer

Prisma client instantiation and repository-style query functions. Route
handlers and server components should call functions here, not import
PrismaClient directly, so tenant-scoping (src/lib/tenant) and query patterns
stay consistent. Also the intended seam if the provider changes later
(Supabase-specific features should be isolated here, not spread through the
app, per the M0 "provider-independent through Prisma" decision).
