import { FC, ReactNode } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import Link from "next/link";
import { IconNeonCat } from "../Icon/presetIcon";

interface NavbarProps {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onNavigation?: () => void;
  routeList: string[];
}

const Navbar: FC<NavbarProps> = ({ leftSlot, rightSlot, routeList }) => {
  return (
    <NeuDiv className="navbar m-0! fixed top-0 left-0 right-0 flex items-center justify-between z-999 neu-light">
      <div className="flex items-center justify-center text-center ">
        <IconNeonCat />
      </div>
      <ul className="flex flex-row items-center justify-center p-0! gap-2 xs:mx-0!">
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
    </NeuDiv>
  );
};

export default Navbar;
