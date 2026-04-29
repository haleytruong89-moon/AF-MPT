# AF Master Project Tracker

Collaborative mind-map project tracker for the SmartOSC AF team. Built on React + Firebase, deployed on Vercel.

**Features:** mind map · outline · dashboard views · drag-drop editing · weekly check-ins · activity log · Excel import/export · Google sign-in restricted to `@smartosc.com` · real-time sync between teammates · **per-project roles (Owner/Operator/Viewer)** · **related parties** · **soft delete** · **server-validated activity authorship**.

## Security model (v2)

- **Domain gate:** only verified `@smartosc.com` Google accounts can read or write anything (Firestore security rules check `email_verified` + email regex).
- **Per-project RBAC:**
  - **Owner** — manages members and related parties, renames, deletes the project, edits content.
  - **Operator** — edits tasks/check-ins/structure, but cannot change membership, the project name, or delete.
  - **Viewer** — read-only.
  - Only members can see project content. Non-members get permission-denied at the Firestore layer (not just hidden in the UI).
- **Related parties:** people who don't have access to the app but should be on the record (clients, vendors, sponsors). Reference-only metadata, no permissions granted.
- **Activity log:** the `author` field on every new entry is validated server-side against the caller's verified email — teammates can't spoof each other.
- **Soft delete:** project deletion sets a `deletedAt` field instead of hard-deleting. The doc remains in Firestore for recovery (use the Firebase console). Hard delete from the rules is restricted to owners.
- **Security headers:** `vercel.json` configures CSP, HSTS, X-Frame-Options, Referrer-Policy and Permissions-Policy on every response.

---

## Setup (one-time, ~30 minutes)

You'll do these steps **once**. Your teammates just sign in and use the deployed URL.

### Prerequisites

- A Google account that's an admin of the `smartosc.com` Workspace
- Node.js 18+ installed locally ([download](https://nodejs.org/))
- A GitHub account (free) — for hosting the source code
- A Vercel account (free) — for hosting the deployed app
- Access to your domain DNS settings (to point `afmpt.smartosc.com` to Vercel)

### Step 1 — Create the Firebase project (5 min)

1. Go to https://console.firebase.google.com/ and click **Add project**
2. Project name: `afmpt-tracker` (or anything you like — this becomes your project ID)
3. **Disable Google Analytics** when asked (we don't need it; keeps things clean and faster)
4. Wait for project creation, then click **Continue**

### Step 2 — Enable Google sign-in (3 min)

1. In the Firebase console left sidebar: **Build → Authentication → Get started**
2. Click the **Google** provider
3. Toggle **Enable**, set the **Project support email** to your `@smartosc.com` address, click **Save**
4. (Optional, for a cleaner sign-in URL later) **Authentication → Settings → Authorized domains → Add domain →** add `afmpt.smartosc.com` (you'll do this again after DNS is set up — for now, the default `<project-id>.firebaseapp.com` and `localhost` are auto-added)

### Step 3 — Create the Firestore database (2 min)

1. Left sidebar: **Build → Firestore Database → Create database**
2. **Location:** pick `asia-southeast1` (Singapore — closest to Vietnam, lowest latency)
3. Start in **production mode** (rules will be set in step 6 below)
4. Click **Create**

### Step 4 — Register a Web app and get the config (3 min)

1. Top of Firebase console → click the **gear icon ⚙ → Project settings**
2. Scroll to **Your apps** → click the **`</>`** (web) icon
3. App nickname: `afmpt-web` → click **Register app** (skip Firebase Hosting setup; we'll use Vercel)
4. You'll see a code block with a `firebaseConfig` object. Copy these six values — you'll paste them into `.env.local` next.

### Step 5 — Configure the project locally (5 min)

Open a terminal:

```bash
git clone <your-repo-url>   # see Step 7 if you haven't pushed to GitHub yet
cd afmpt-tracker
npm install
cp .env.example .env.local
```

Open `.env.local` in a text editor and fill in the six Firebase values from Step 4:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=afmpt-tracker.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=afmpt-tracker
VITE_FIREBASE_STORAGE_BUCKET=afmpt-tracker.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
VITE_ALLOWED_DOMAIN=smartosc.com
```

Test it locally:

```bash
npm run dev
```

Open http://localhost:5173 — you should see the sign-in screen. Try signing in with your `@smartosc.com` Google account. If you see an error like "missing or insufficient permissions" it's because the Firestore rules haven't been deployed yet — that's the next step.

### Step 6 — Deploy Firestore security rules (5 min)

This is the **critical** step that actually enforces the `@smartosc.com` restriction on the server side. Without it, the client-side check can be bypassed.

1. Open `firestore.rules` in this project
2. Copy its entire contents
3. In Firebase console: **Firestore Database → Rules tab**
4. Paste, replacing what's there
5. Click **Publish**

Test again at http://localhost:5173 — sign in should now work, and you should see the seeded CRP project appear after a moment. (If you previously had a personal Gmail account in your browser, sign out and sign back in with `@smartosc.com`.)

### Step 7 — Push to GitHub (5 min)

Skip this if you already cloned from GitHub.

1. Create a new repo at https://github.com/new (name it `afmpt-tracker`, set it to **Private** since the smartosc.com domain is in the source)
2. From the project root:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:your-username/afmpt-tracker.git
git push -u origin main
```

(`.env.local` is already in `.gitignore` — your Firebase keys won't be committed.)

### Step 8 — Deploy to Vercel (5 min)

1. Go to https://vercel.com/new
2. Sign in with GitHub
3. Import the `afmpt-tracker` repo you just pushed
4. Vercel will auto-detect Vite — leave defaults as-is
5. Expand **Environment Variables** and paste in the same 7 lines from your `.env.local`:

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | (from Firebase) |
   | `VITE_FIREBASE_AUTH_DOMAIN` | (from Firebase) |
   | `VITE_FIREBASE_PROJECT_ID` | (from Firebase) |
   | `VITE_FIREBASE_STORAGE_BUCKET` | (from Firebase) |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | (from Firebase) |
   | `VITE_FIREBASE_APP_ID` | (from Firebase) |
   | `VITE_ALLOWED_DOMAIN` | `smartosc.com` |

6. Click **Deploy**. After ~1 minute you'll get a URL like `afmpt-tracker.vercel.app`

7. **Add this Vercel URL to Firebase authorized domains:** Firebase console → Authentication → Settings → Authorized domains → Add `afmpt-tracker.vercel.app` (otherwise Google sign-in will fail on the deployed app)

Test the deployed URL — sign in, verify everything works.

### Step 9 — Set up the custom domain `afmpt.smartosc.com` (10 min, requires DNS access)

1. In Vercel project → **Settings → Domains → Add → enter `afmpt.smartosc.com`**
2. Vercel will show you a CNAME record to add. Typically something like:
   ```
   Type: CNAME
   Name: afmpt
   Value: cname.vercel-dns.com
   ```
3. Add this record at your domain registrar / DNS provider (whoever manages `smartosc.com` DNS — likely your IT team)
4. Wait 5-30 min for DNS propagation. Vercel will auto-issue an HTTPS certificate.
5. **Add `afmpt.smartosc.com` to Firebase authorized domains** (same as Step 8.7)

You can now share `https://afmpt.smartosc.com` with the team.

---

## Removing the "This app isn't verified" Google warning

After deploying, the OAuth consent screen is in **Testing** mode by default —
new users see a *"Google hasn't verified this app"* warning and must click
*Advanced → Continue to project*. To remove the warning permanently, submit
the OAuth client for verification:

1. **Make sure `privacy.html` and `terms.html` are reachable on your custom domain.**
   They're served from `public/` automatically by Vercel:
   - `https://afmpt.smartosc.com/privacy.html`
   - `https://afmpt.smartosc.com/terms.html`
   Open both URLs in a browser to confirm they load.

2. **Add your domain in Google Search Console** (https://search.google.com/search-console)
   and verify ownership (DNS TXT record or HTML meta tag). This proves to
   Google that you control the domain referenced from the OAuth consent screen.

3. **Configure the OAuth consent screen** in Google Cloud Console (the same
   project that backs your Firebase app):
   - APIs & Services → **OAuth consent screen**
   - User type: **Internal** if your Workspace admin allows it (skips most of
     verification — `@smartosc.com` users won't see the warning anymore).
   - Otherwise **External** + the steps below.
   - App name: `AF Master Project Tracker`
   - Support email: `ai-bo-02@smartosc.com`
   - App logo: a 120×120 PNG of your team logo (optional but recommended).
   - **Application home page**: `https://afmpt.smartosc.com`
   - **Privacy policy**: `https://afmpt.smartosc.com/privacy.html`
   - **Terms of service**: `https://afmpt.smartosc.com/terms.html`
   - Authorised domains: add `smartosc.com`.
   - Developer contact: your `@smartosc.com` address.

4. **Scopes**: only request `email`, `profile`, `openid` (the defaults). With
   non-sensitive scopes, verification is fast — usually a few business days.

5. **Submit for verification** (External user type only). If asked for a demo
   video, screen-record a 30-second walkthrough showing sign-in and the main
   views; upload to YouTube unlisted and paste the URL.

6. **Easier alternative** — if your Google Workspace admin is fine with it,
   set the OAuth consent screen to **Internal**. Internal apps don't need the
   verification process and immediately suppress the warning for any
   `@smartosc.com` user. This is the recommended path for an internal-only
   tool like AFMPT.

After verification (or after switching to Internal), the warning disappears
and users see the standard Google consent screen with your app branding.

---

## Migrating from v1 to v2 (RBAC) — for existing deployments

If you already have data from the v1 app (no per-project roles) and are upgrading:

1. **Find your Firebase Auth uid.** Sign into the app once with your `@smartosc.com` account, then go to Firebase console → **Authentication → Users** and copy your User UID.
2. **Get a service-account key.** Firebase console → **Project Settings → Service accounts → Generate new private key** → save as `service-account.json` in the project root. This is admin-level — `.gitignore` already excludes it; delete it when done.
3. **Claim ownership of all legacy projects:**
   ```bash
   npm install
   node scripts/setup-rbac.js <your-uid> <your-email@smartosc.com>
   ```
   This adds you as the `owner` of every project that lacks a `roles` field. Idempotent — safe to re-run.
4. **Deploy the new `firestore.rules`** (Firebase console → Firestore → Rules → paste → Publish).
5. **Deploy the new app code** (push to GitHub; Vercel auto-deploys). The `vercel.json` will start applying security headers on the next deploy.
6. **Sign in to the app** — projects you claimed now show the Owner badge. Click the people icon on each project to add teammates as Operator or Viewer.
7. Delete `service-account.json` from your machine.

> **Order matters.** If you publish the new rules without running `setup-rbac.js` first, the legacy-fallback rule still allows reads, but no one will have edit permissions on those projects until they click the "Claim ownership (legacy project)" menu item.

## Importing a JSON backup (one-shot, ~5 min)

If you have a JSON backup from another deployment:

1. Save the backup as `backup.json` in the project root
2. Get a service-account key (see step 2 above)
3. Run:

```bash
node scripts/migrate.js <admin-uid> <admin-email@smartosc.com> backup.json
```

The script handles both backup formats (the per-project format and the older workspace-wide format). The admin uid you pass becomes the owner of every imported project. Delete `service-account.json` when done.

---

## Daily use (for your teammates)

You just send them: `https://afmpt.smartosc.com`

They:
1. Click **Sign in with Google**
2. Pick their `@smartosc.com` account
3. See the same shared workspace as everyone else
4. Edits sync in real-time (within 1-2 seconds)

---

## Costs

For a 10-person team using this daily, you'll stay comfortably inside Firebase's free Spark plan:
- **Firestore:** 50K reads/day, 20K writes/day, 1 GB storage — you'll use ~5% of this
- **Firebase Auth:** unlimited Google sign-ins
- **Vercel Hobby:** 100 GB bandwidth/month — way more than you need

You only need to upgrade if usage explodes (say, 50+ active users or hundreds of thousands of changes). The next tier (Blaze / Pay-as-you-go) is still typically a few dollars per month at moderate scale.

---

## Architecture notes

- **Storage:** each project = one Firestore document under `workspaces/main/projects/{id}`. Activity log is a separate document `workspaces/main/activity/{id}` (capped at 500 entries). Per-user prefs (currentProjectId) live at `users/{uid}`.
- **Real-time sync:** uses Firestore's `onSnapshot` listeners. When teammate A saves a change, teammate B's browser receives the update within 1-2 seconds without refreshing.
- **Conflict model:** still last-write-wins per project document. With real-time sync, collisions are much rarer than the artifact version, but two people editing the same task simultaneously can still overwrite each other. For a 10-person team this is fine in practice.
- **Doc size limit:** 1 MB per Firestore document. The seed CRP project (188 tasks) is ~46 KB. You can grow ~20x before hitting the limit. If you ever do, the next refactor would be to split tasks into a subcollection.
- **Auth enforcement:** three layers — `hd` parameter (UX hint), client-side check + sign-out, Firestore security rules (the only real enforcement).

---

## Troubleshooting

**"Missing or insufficient permissions" when loading**
You forgot Step 6 (deploying `firestore.rules`). Or you signed in with a non-`@smartosc.com` account.

**"This app isn't verified" warning at Google sign-in**
First-time only. Click "Advanced → Continue to project". Once a few teammates sign in successfully, Google stops showing the warning. To remove it permanently, you'd need to verify the OAuth client — overkill for internal use.

**Sign-in popup blocked**
Browser blocked the popup. Allow popups for the site, try again.

**Changes don't appear for teammates**
Either Firestore rules aren't deployed (check Step 6), or the teammate's browser tab is suspended (refresh).

**Custom domain doesn't work**
DNS propagation can take up to 24 hours. Check with `dig afmpt.smartosc.com` — it should resolve to a Vercel IP. Also ensure the domain is in Firebase Authorized Domains (Step 9.5).

**"VITE_FIREBASE_API_KEY is missing" at startup**
You didn't fill in `.env.local`, or you're running on Vercel and forgot to add env vars there (Step 8.5).

---

## Updating the app

Make changes locally, commit, push to GitHub. Vercel auto-deploys every push to `main`. Your teammates see the new version on their next page load.

```bash
git add .
git commit -m "describe what changed"
git push
```

If you change Firestore schema, you may need to update `firestore.rules` and re-publish from the Firebase console.

---

## Project structure

```
afmpt-tracker/
├── package.json
├── vite.config.js
├── index.html
├── .env.example          ← template; copy to .env.local
├── .gitignore
├── firestore.rules       ← deploy to Firebase Console manually
├── README.md             ← this file
├── public/
│   └── favicon.svg
├── scripts/
│   └── migrate.js        ← one-time JSON-backup importer
└── src/
    ├── main.jsx          ← React entry; wires AuthProvider + AuthGate
    ├── firebase.js       ← Firebase SDK initialization
    ├── auth.jsx          ← Google sign-in + domain restriction
    ├── data.js           ← Firestore real-time hooks
    ├── seed.js           ← starter CRP project data
    └── App.jsx           ← the entire app UI (~1750 lines)
```

---

## Questions or need to extend it?

The original build conversation with Claude has the full design rationale and trade-off discussion. For new features (e.g., notifications, Gantt view, dependency arrows, per-task subscriptions instead of whole-project), come back and ask Claude — the data layer in `data.js` is the right place to add new capabilities, the UI layer in `App.jsx` mostly just consumes them.
