import { FC, ReactNode } from "react";
import NeuDiv from "../NeuDiv";
import Link from "next/link";
import { IconNeonCat } from "../Icon/presetIcon";
import { UserMenu } from "../Profile/UserMenu";

interface NavbarProps {
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  onNavigation?: () => void;
  routeList: string[];
}

const Navbar: FC<NavbarProps> = ({ routeList }) => {
  const isDev = process.env.NODE_ENV === "development";
  return (
    <NeuDiv className="navbar m-0! fixed top-0 left-0 right-0 flex items-center z-999 neu-light">
      <div className="flex items-center justify-center text-center w-20">
        <IconNeonCat />
      </div>
      <ul className="flex flex-row items-center justify-center p-0! gap-2 xs:mx-0! grow-1">
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
      <div className="w-20">{isDev ? <UserMenu /> : null}</div>
    </NeuDiv>
  );
};

export default Navbar;
