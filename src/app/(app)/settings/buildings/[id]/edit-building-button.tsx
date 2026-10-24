"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { BuildingInput } from "@/schemas/property";
import { BuildingDialog } from "../building-dialog";

export function EditBuildingButton({ building }: { building: BuildingInput & { id: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Pencil aria-hidden /> Edit building
      </Button>
      {open ? <BuildingDialog building={building} open onOpenChange={setOpen} /> : null}
    </>
  );
}
