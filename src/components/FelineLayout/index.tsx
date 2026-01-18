"use client";

import { pathMeta, SidebarComp } from "@/app/pathMeta";
import { usePathname } from "next/navigation";
import React, { ReactNode } from "react";
import Content from "../Content";
import { ProfileCard } from "../Profile/ProfileCard";

interface Props {
  children: ReactNode;
}

function FelineLayout({ children }: Props) {
  const pathname = usePathname();

  const meta = pathMeta.find((item) => item.path === pathname)?.meta;

  const left = meta?.left || [];
  const right = meta?.left || [];

  return (
    <Content leftSideBar={left} rightSideBar={right}>
      {children}
    </Content>
  );
}

export default FelineLayout;
