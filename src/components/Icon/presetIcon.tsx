import { FC } from "react";

// import NextSvg from "../../../public/next.svg";
import Icon, { IconProps } from ".";
import Image from "next/image";
import Link from "next/link";

export const IconSpinner: FC<Partial<IconProps>> = (props) => {
  // return <Icon icon={icon || "spinner"} {...restProps} />;
  const { icon, ...restProps } = props;
  return (
    <Icon
      icon={icon || "progress_activity"}
      className="animate-spin"
      {...restProps}
    />
  );
};

export const IconNeonCat = () => {
  return (
    <div className="cursor-pointer icon-neon-cat">
      <Link href="/playground">
        <Image
          src="/neoncat.svg"
          alt="neoncat-icon"
          width={48}
          height={48}
          className="w-10 neon-light"
        />
      </Link>
    </div>
  );
};
