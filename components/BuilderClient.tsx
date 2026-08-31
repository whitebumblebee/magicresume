"use client";

import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { useBuilderStore } from "@/lib/store";
import { useFitRunner } from "@/lib/fit/useFitRunner";
import { Toolbar } from "./Toolbar";
import { EditorPanel } from "./editor/EditorPanel";
import { PreviewPane } from "./preview/PreviewPane";
import { PrintRoot } from "./PrintRoot";
import { CompressDialog } from "./CompressDialog";
import { AtsPanel } from "./AtsPanel";
import { MyResumes } from "./MyResumes";

export default function BuilderClient() {
  return (
    <SessionProvider>
      <BuilderShell />
    </SessionProvider>
  );
}

function BuilderShell() {
  useFitRunner();
  const [resumesOpen, setResumesOpen] = useState(false);

  // Restore the locally-saved draft after mount (free tier = localStorage).
  useEffect(() => {
    useBuilderStore.persist.rehydrate();
  }, []);

  return (
    <>
      <div className="screen-only flex h-screen flex-col">
        <Toolbar onOpenResumes={() => setResumesOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <EditorPanel />
          <PreviewPane />
        </div>
      </div>
      <PrintRoot />
      <CompressDialog />
      <AtsPanel />
      <MyResumes open={resumesOpen} onClose={() => setResumesOpen(false)} />
    </>
  );
}
