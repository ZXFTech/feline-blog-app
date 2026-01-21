"use client";

import { PermissionAccess } from "../Auth/PermissionAccess";
import Icon from "../Icon";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import NeuInput from "../NeuInput";

function DailyOperationBar() {
  return (
    <div className="flex flex-row flex-wrap items-center justify-between mb-2 sticky right-0 left-0 top-0 z-100">
      <div className="flex flex-row gap-2">
        <NeuInput prefix={<Icon icon="search" />} allowClear />
      </div>

      <PermissionAccess>
        <NeuDiv neuType="flat">
          <NeuButton>新建</NeuButton>
        </NeuDiv>
      </PermissionAccess>
    </div>
  );
}

export default DailyOperationBar;
