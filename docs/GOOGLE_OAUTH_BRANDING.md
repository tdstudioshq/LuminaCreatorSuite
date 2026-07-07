# Google OAuth consent branding

## Symptom

When a user taps **Continue with Google**, the Google account‑picker / consent screen
reads something like:

> Choose an account to continue to **rpzaeqoqcaxxavltgvpe.supabase.co**

i.e. it shows the **Supabase project URL**, not "CABANA".

## Why (this is not a code bug)

The account picker displays the **OAuth app name and authorized domain configured on
the Google Cloud OAuth Consent Screen** for the OAuth client that Supabase uses. Because
the OAuth **redirect URI** is `https://rpzaeqoqcaxxavltgvpe.supabase.co/auth/v1/callback`
(Supabase brokers the OAuth handshake), Google falls back to showing the Supabase host
until the consent screen is branded.

Nothing in this app controls that string — `supabase.auth.signInWithOAuth({ provider: "google", … })`
and the `/auth/callback` route are already correct and should **not** be changed for this.
Fixing the branding is a one‑time configuration in **Google Cloud**, not a code change.

## Fix — configure in Google Cloud Console

APIs & Services → **OAuth consent screen** (for the project that owns the OAuth client
whose Client ID/secret are set in Supabase → Auth → Providers → Google):

| Field | Value |
| --- | --- |
| App name | **CABANA** |
| User support email | **admin@cabanagrp.com** |
| App logo | CABANA logo (`public/cabana-logo.png`, 120×120 PNG, <1MB) |
| Application home page | **https://cabanagrp.com** |
| Authorized domain | **cabanagrp.com** |
| Privacy policy URL | `https://cabanagrp.com/privacy` *(if/when published)* |
| Terms of service URL | `https://cabanagrp.com/terms` *(if/when published)* |
| Developer contact email | **admin@cabanagrp.com** |

Notes:
- The **Authorized domain** (`cabanagrp.com`) must also be verified in Google Search
  Console under the same Google account, or Google won't accept it on the consent screen.
- The homepage, privacy, and terms URLs must all live under the authorized domain.
- After saving, the account picker shows "**CABANA**" + logo. If the app is still in
  **Testing**, only allow‑listed test users can sign in; move it to **In production** (or
  **Publish**) once branding is verified so any Google user can authenticate.
- Privacy/Terms URLs are required to publish; they can be simple pages. Until they exist,
  the consent screen still brands as CABANA but publishing is blocked in "Testing".

## Verifying

After configuration, sign in again on `https://cabanagrp.com/login`. The Google screen
should read "to continue to **CABANA**" with the logo. The Supabase callback host may
still appear in small print ("This will share your info with cabanagrp.com and its
service provider Supabase") — that's expected and fine.
