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
  fallbacks,
}: Props) => {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center ">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (
    !loading &&
    !user &&
    allowedRoles?.length &&
    allowedRoles.includes(user!.role)
  ) {
    return <>{fallbacks}</>;
  }

  return <>{children}</>;
};
