let clientPromise;

export const isDiscussionConfigured = () => Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export async function getSupabase() {
    if (!isDiscussionConfigured()) return null;
    if (!clientPromise) {
        clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(
            import.meta.env.VITE_SUPABASE_URL,
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
        ));
    }
    return clientPromise;
}

export async function session() {
    const client = await getSupabase();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
}

export async function ensureAnonymousSession() {
    const existing = await session();
    if (existing) return existing;
    const client = await getSupabase();
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.session;
}

function oauthRedirectTo() {
    const canonical = import.meta.env.VITE_CANONICAL_ORIGIN || "https://manga-anime.online";
    const origin = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? window.location.origin
        : canonical;
    return `${origin.replace(/\/$/, "")}/?account=profile&auth=callback`;
}

export async function continueWithGoogle() {
    const client = await getSupabase();
    if (!client) throw new Error("Discussion is not configured.");
    const existing = await session();
    const options = {
        provider: "google",
        options: { scopes: "openid email profile", redirectTo: oauthRedirectTo() }
    };
    const result = existing?.user?.is_anonymous
        ? await client.auth.linkIdentity(options)
        : await client.auth.signInWithOAuth(options);
    if (result.error) throw result.error;
    return result.data;
}
