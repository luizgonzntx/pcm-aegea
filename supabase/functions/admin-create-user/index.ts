import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const allowedOrigins = new Set([
  "https://luizgonzntx.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function response(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    return response({ error: "Origem não autorizada." }, 403, null);
  }

  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    return new Response("ok", { headers });
  }

  if (request.method !== "POST") {
    return response({ error: "Método não permitido." }, 405, origin);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return response({ error: "Sessão administrativa necessária." }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "A função não está configurada no Supabase." }, 500, origin);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return response({ error: "Sessão inválida ou expirada." }, 401, origin);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("pcm_teresina_members")
    .select("role")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError) {
    return response({ error: "Não foi possível verificar o perfil administrativo." }, 500, origin);
  }
  if (membership?.role !== "admin") {
    return response({ error: "Apenas administradores podem cadastrar usuários." }, 403, origin);
  }

  let input: { email?: unknown; password?: unknown; role?: unknown };
  try {
    input = await request.json();
  } catch {
    return response({ error: "Corpo da solicitação inválido." }, 400, origin);
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "Informe um e-mail válido." }, 400, origin);
  }
  const passwordBytes = new TextEncoder().encode(password).length;
  if (passwordBytes < 8 || passwordBytes > 72) {
    return response({ error: "A senha deve ter entre 8 e 72 caracteres." }, 400, origin);
  }
  if (role !== "viewer" && role !== "admin") {
    return response({ error: "Perfil inválido." }, 400, origin);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return response({ error: createError?.message || "Não foi possível criar a conta." }, 409, origin);
  }

  const { error: insertError } = await supabase
    .from("pcm_teresina_members")
    .insert({ user_id: created.user.id, role });
  if (insertError) {
    const { error: rollbackError } = await supabase.auth.admin.deleteUser(created.user.id);
    const message = rollbackError
      ? "A conta foi criada, mas não foi possível registrar o perfil nem remover a conta. Contate o suporte."
      : "Não foi possível registrar o perfil; a conta criada foi removida.";
    return response({ error: message }, 500, origin);
  }

  return response({ email, role }, 201, origin);
});
