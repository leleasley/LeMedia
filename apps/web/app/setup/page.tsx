import { redirect } from "next/navigation";
import { isSetupComplete } from "@/db";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Welcome to LeMedia",
};

export default async function SetupPage() {
  // If setup is complete, redirect to login
  const setupComplete = await isSetupComplete();
  if (setupComplete) {
    redirect("/login");
  }

  return <SetupWizard />;
}
