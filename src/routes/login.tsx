import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar · Totalização Paralela 2026" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav({ to: "/", replace: true });
  }, [user, nav]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { nome } },
        });
        if (error) throw error;
        toast.success("Cadastro feito! Verifique seu email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Falha no Google Sign-In");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[440px] flex-col bg-background px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold uppercase leading-none tracking-tighter">Totalização</h1>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Paralela Cidadã 2026</p>
      </div>

      <div className="mb-4 flex gap-1 rounded-sm bg-secondary p-1">
        <button onClick={() => setTab("login")} className={`flex-1 rounded-sm py-2 text-xs font-bold uppercase ${tab === "login" ? "bg-background" : "text-muted-foreground"}`}>Entrar</button>
        <button onClick={() => setTab("signup")} className={`flex-1 rounded-sm py-2 text-xs font-bold uppercase ${tab === "signup" ? "bg-background" : "text-muted-foreground"}`}>Cadastrar</button>
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        {tab === "signup" && (
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" required className="w-full rounded-sm border border-border bg-background p-3 text-sm" />
        )}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full rounded-sm border border-border bg-background p-3 text-sm" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" minLength={6} required className="w-full rounded-sm border border-border bg-background p-3 text-sm" />
        <button disabled={loading} className="w-full rounded-sm bg-primary py-3 text-sm font-bold uppercase text-primary-foreground disabled:opacity-50">
          {loading ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-mono-label">
        <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
      </div>

      <button onClick={handleGoogle} className="rounded-sm border border-border bg-background py-3 text-sm font-bold">
        Continuar com Google
      </button>
    </div>
  );
}
