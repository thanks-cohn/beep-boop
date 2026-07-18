# Supabase setup

Configure the Supabase project `https://jewdjzitstpnpmoljsae.supabase.co` in the dashboard, not from this repository.

- Site URL: `https://manga-anime.online`
- Production return URL: `https://manga-anime.online/?account=profile&auth=callback`
- Local development return URL: `${window.location.origin}/?account=profile&auth=callback`
- Enable anonymous sign-ins if anonymous bookmarks/comments are desired.
- Apply repository migrations, including discussion/bookmarks and `user_tag_preferences`, with own-row RLS.
- If `www.manga-anime.online` is reachable, redirect it to the apex domain so browser session storage stays same-origin.
