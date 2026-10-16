"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="sidebar__link"
      style={{
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        padding: "8px 12px",
      }}
      onClick={async () => {
        await signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
