import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { env } from "@/lib/env";

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" registrationOpen={env.allowRegistration} />
    </Suspense>
  );
}
