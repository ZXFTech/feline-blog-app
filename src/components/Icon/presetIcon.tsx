import { FC } from "react";

import SvgNeonCat from "../../../public/neoncat.svg";
// import NextSvg from "../../../public/next.svg";
import Icon, { IconProps } from "./icon";
import NeuDiv from "../NeuDiv/NeuDiv";
import Image from "next/image";
import Link from "next/link";

export const IconSpinner: FC<Partial<IconProps>> = (props) => {
  // return <Icon icon={icon || "spinner"} {...restProps} />;
  const { icon, ...restProps } = props;
  return <Icon icon={icon || "progress_activity"} {...restProps} />;
};

export const IconNeonCat: FC = () => {
  return (
    <NeuDiv neuType="embossed" className="cursor-pointer icon-neon-cat">
      <Link href="/">
        <Image
          src="/neoncat.svg"
          alt=""
          width={48}
          height={48}
          className="w-10 neon-light"
        />
      </Link>
    </NeuDiv>
  );
};
