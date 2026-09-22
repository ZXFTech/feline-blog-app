"use client";

import { FC, ReactNode } from "react";
import { NeuPanel } from "@/components/ui/neu-panel";
import { neuSurface } from "@/components/ui/neu-surface";
import Link from "next/link";
import { IconNeonCat } from "../Icon/presetIcon";
import { UserMenu } from "../Profile/UserMenu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import PomodoroGlobalStatus from "../pomodoro/PomodoroGlobalStatus";
import { usePathname } from "next/navigation";

interface NavbarProps {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onNavigation?: () => void;
  routeList: string[];
}

const Navbar: FC<NavbarProps> = ({ routeList }) => {
  const pathname = usePathname();
  const prefetch = pathname === "/album" ? false : undefined;

  return (
    <NeuPanel
      density="compact"
      layout="row"
      className="navbar no-scrollbar m-0! fixed top-0 left-0 right-0 z-999 items-center overflow-x-auto neu-light"
    >
      <div className="flex min-w-max w-full items-center justify-between text-center">
        <div className="flex shrink-0 justify-start items-center px-2">
          <IconNeonCat prefetch={prefetch} />
        </div>
        <ul className="flex shrink-0 flex-row items-center justify-center p-0! gap-2 xs:mx-0!">
          {routeList.map((route) => {
            return (
              <li key={route}>
                <Link
                  className={neuSurface({
                    elevation: "flat",
                    className: "block p-0 mx-0 my-2",
                  })}
                  href={`/${route === "home" ? "" : route}`}
                  prefetch={prefetch}
                >
                  <span className="block px-4 py-1 mx-2 my-1 font-medium rounded-md navbar-link text-foreground!">
                    {route === "checklists" ? "清单" : route.toUpperCase()}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex shrink-0 justify-between items-center gap-2 px-2 ">
          <PomodoroGlobalStatus prefetch={prefetch} />
          <ThemeSwitcher />
          <div className="w-20">
            <UserMenu prefetch={prefetch} />
          </div>
        </div>
      </div>
    </NeuPanel>
  );
};

export default Navbar;
