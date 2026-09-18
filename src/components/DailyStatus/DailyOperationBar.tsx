"use client";

import { PermissionAccess } from "../Auth/PermissionAccess";
import Icon from "../Icon";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import { InputField } from "@/components/ui/input-field";

function DailyOperationBar() {
  return (
    <div className="flex flex-row flex-wrap items-center justify-between mb-2 sticky right-0 left-0 top-0 z-100">
      <div className="flex flex-row gap-2">
        <InputField prefix={<Icon icon="search" />} clearable />
      </div>

      <PermissionAccess>
        <NeuSurface elevation="flat">
          <Button>新建</Button>
        </NeuSurface>
      </PermissionAccess>
    </div>
  );
}

export default DailyOperationBar;
