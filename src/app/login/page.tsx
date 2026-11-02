import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { hasSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  credentials: "That password is not right.",
  rate: "Too many sign-in attempts. Wait a few minutes and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasSession()) {
    redirect("/");
  }
  const params = await searchParams;
  const error = params.error ? ERRORS[params.error] : undefined;
  return <LoginForm error={error} />;
}
