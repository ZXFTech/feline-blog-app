import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  children: ReactNode;
  container?: Element | null;
}

function Portal({ children, container }: Props) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, container ?? document.body);
}

export default Portal;
