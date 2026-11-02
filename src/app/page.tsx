import { redirect } from "next/navigation";
import { Desk } from "@/components/desk";
import { getConfig } from "@/lib/config";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await hasSession())) {
    redirect("/login");
  }
  const config = getConfig();
  return (
    <Desk
      deleteAfterMinutes={config.deleteAfterMinutes}
      maxDurationMinutes={config.maxDurationSeconds / 60}
      maxFileBytes={config.maxFileBytes}
      maxPlaylistItems={config.maxPlaylistItems}
    />
  );
}
