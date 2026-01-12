import { useAuth } from "@/hooks/useAuth";
import React, { ReactNode } from "react";

interface Props {
  children: ReactNode;
  allowedRoles?: string[];
  fallbacks?: ReactNode;
}

export const PermissionAccess = ({
  children,
  allowedRoles,
  fallbacks = null,
}: Props) => {
  const { user } = useAuth();

  if (!user || (allowedRoles?.length && allowedRoles.includes(user!.role))) {
    return <>{fallbacks}</>;
  }

  return <>{children}</>;
};
