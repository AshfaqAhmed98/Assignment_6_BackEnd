export const roles = Object.freeze(["Customer", "Owner", "Admin"]);

const permissionRoles = Object.freeze({
  "equipment:read": roles,
  "equipment:create": ["Owner", "Admin"],
  "equipment:manage-own": ["Owner", "Admin"],
  "equipment:approve": ["Admin"],
  "favorites:manage-own": ["Customer"],
  "booking:create": ["Customer"],
  "booking:read-own": ["Customer"],
  "booking:read-own-equipment": ["Owner"],
});

export function requirePermission(permission) {
  const allowedRoles = permissionRoles[permission];
  if (!allowedRoles) {
    throw new Error(`Unknown permission: ${permission}`);
  }

  return (request, response, next) => {
    if (!allowedRoles.includes(request.auth?.role)) {
      return response.status(403).json({
        message: "You do not have permission to perform this action.",
      });
    }

    return next();
  };
}
