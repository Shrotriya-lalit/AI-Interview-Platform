// components/SignOutButton.tsx
"use client";
import { signOut as firebaseSignOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/firebase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      // 1) clear Firebase client state
      await firebaseSignOut(auth);

      // 2) clear the server session cookie
      await fetch("/api/auth/signout", { method: "POST" });

      // 3) redirect to /sign-in
      router.push("/sign-in");
    } catch (err) {
      console.error("Sign-out failed:", err);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700"
    >
      Sign Out
    </button>
  );
}
