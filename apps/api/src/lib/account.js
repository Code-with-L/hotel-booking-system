// Account shape shared by auth and account modules.
export const accountPayload = (user, guest) => ({
  id: user.id,
  guestId: guest?.id ?? null,
  firstName: guest?.firstName ?? user.name.split(' ')[0] ?? user.name,
  lastName: guest?.lastName ?? user.name.split(' ').slice(1).join(' ') ?? '',
  name: user.name,
  email: user.email,
  phone: guest?.phone ?? '',
  country: guest?.country ?? 'Kenya',
  notes: guest?.notes ?? '',
  roles: user.roles.map((ur) => ur.role.key),
});
