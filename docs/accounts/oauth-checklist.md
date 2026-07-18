# OAuth checklist

Google Cloud Console should authorize the Supabase provider callback URL from the Supabase dashboard. Supabase should redirect back to the application return URL `/?account=profile&auth=callback` on `https://manga-anime.online`.

Do not use CDN origins for OAuth. Do not place secrets in Vite env files; only publishable browser values belong there.
