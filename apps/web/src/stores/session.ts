import { acceptHMRUpdate, defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../lib/api";
import type { Role, User } from "../types";

export type DemoStoreCode = "ROMA" | "CENTRO";

export const useSessionStore = defineStore("session", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref("");

  const globalEmails: Record<"ADMIN" | "FINANCE", string> = {
    ADMIN: "ines@lucerna.demo",
    FINANCE: "valeria@lucerna.demo"
  };
  const operationalEmails: Record<"SUPERVISOR" | "CASHIER", Record<DemoStoreCode, string>> = {
    SUPERVISOR: { ROMA: "mateo@lucerna.demo", CENTRO: "diego@lucerna.demo" },
    CASHIER: { ROMA: "luz@lucerna.demo", CENTRO: "camila@lucerna.demo" }
  };

  async function demoLogin(role: Role, storeCode: DemoStoreCode = "ROMA") {
    loading.value = true;
    error.value = "";
    try {
      const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;
      if (!demoPassword) throw new Error("VITE_DEMO_PASSWORD is required for demo access.");
      const email = role === "ADMIN" || role === "FINANCE" ? globalEmails[role] : operationalEmails[role][storeCode];
      const result = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: demoPassword })
      });
      localStorage.setItem("posflow_token", result.token);
      user.value = result.user;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "No pudimos iniciar la demostración.";
    } finally {
      loading.value = false;
    }
  }

  async function restore() {
    if (!localStorage.getItem("posflow_token")) return;
    try {
      user.value = (await api<{ user: User }>("/auth/me")).user;
    } catch {
      localStorage.removeItem("posflow_token");
    }
  }

  function logout() {
    localStorage.removeItem("posflow_token");
    user.value = null;
  }

  return { user, loading, error, demoLogin, restore, logout };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
