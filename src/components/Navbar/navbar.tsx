import { FC, ReactNode } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import Link from "next/link";

interface NavbarProps {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onNavigation?: () => void;
  routeList: string[];
}

const Navbar: FC<NavbarProps> = ({ leftSlot, rightSlot, routeList }) => {
  return (
    <NeuDiv className="flex items-center justify-between mx-0 mt-0">
      <div className="items-center justify-center hidden p-1 md:flex">
        {leftSlot}
      </div>
      <ul className="flex flex-row items-center justify-center flex-1 gap-4 p-0 ">
        {routeList.map((route) => {
          return (
            <NeuDiv className="!p-0 mx-0 my-2" neuType="raised" key={route}>
              <Link
                className="block px-4 py-1 mx-2 my-1 font-medium rounded-md navbar-link"
                href={`/${route === "home" ? "" : route}`}
              >
                {route.toUpperCase()}
              </Link>
            </NeuDiv>
          );
        })}
      </ul>
      <div className="items-center justify-center px-3 py-1 sm:hidden md:flex">
        {rightSlot}
      </div>
    </NeuDiv>
  );
};

export default Navbar;
