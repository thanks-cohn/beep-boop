# Accounts implementation notes

The app uses the browser Supabase client on the canonical application origin `https://manga-anime.online`. The CDN origin `https://cdn.animeplex.lol` remains for public assets only and must not be used for OAuth callbacks, tokens, or private account routes.

Account routes are static-safe query routes: `/?account=profile`, `/?account=bookmarks`, and `/?account=settings`. Legacy `/account` paths are replaced in-app with query equivalents.
