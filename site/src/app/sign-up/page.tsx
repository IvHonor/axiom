import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";

export const metadata: Metadata = { title: "Join Axiom", description: "Create an Axiom account, or join the waiting list." };

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}
