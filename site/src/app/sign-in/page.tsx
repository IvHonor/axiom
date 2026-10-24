import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to your Axiom account." };

export default function SignInPage() {
  return <AuthPage mode="sign-in" />;
}
