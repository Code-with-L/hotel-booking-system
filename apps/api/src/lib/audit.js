// Append-only audit log writer. Call inside transactions where possible.
export async function audit(tx, { actorUserId = null, action, entity, entityId = null, before = null, after = null, ip = null }) {
  const client = tx || (await import('./prisma.js')).prisma;
  return client.auditLog.create({
    data: {
      actorUserId,
      action,
      entity,
      entityId: entityId != null ? String(entityId) : null,
      before: before ?? undefined,
      after: after ?? undefined,
      ip,
    },
  });
}
