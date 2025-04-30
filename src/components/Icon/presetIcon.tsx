import { FC } from "react";

import SvgNeonCat from "../../../public/neoncat.svg";
import Icon, { IconProps } from "./icon";

export const IconSpinner: FC<Partial<IconProps>> = (props) => {
  // return <Icon icon={icon || "spinner"} {...restProps} />;
  const { icon, ...restProps } = props;
  return <Icon icon={icon || "progress_activity"} {...restProps} />;
};

export const IconNeonCat: FC = () => {
  return (
    // <NeuDiv neuType="embossed" className="icon-neon-cat">
    <SvgNeonCat className="neon-light" />
    // </NeuDiv>
  );
};
