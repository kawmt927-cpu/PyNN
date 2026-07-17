import { LoginForm } from "./login-form";
import { resolveReturnTo } from "@/lib/navigation/return-to";

type SearchParams = Promise<{ returnTo?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = resolveReturnTo(params.returnTo, "/mobile");
  return <LoginForm returnTo={returnTo} wecomError={params.error ?? null} />;
}
