# Pinpanacraft website setup

This guide puts pnpcraft.com on GitHub Pages and connects the email-to-store robot. Plan on about an hour, done once.

## How it fits together

```
Phone: email a photo + "denim pouch $15"  ->  phinphana2+store@gmail.com
                                                     |
                     Google Apps Script (runs every 5 minutes, free)
                       - AI writes the name and description
                       - adds a row to the "Pinpanacraft Store" Google Sheet
                       - commits the photo + products.json to GitHub
                       - replies with the item code (P013)
                                                     |
                     GitHub Pages rebuilds pnpcraft.com in about a minute

Customer reserves on pnpcraft.com  ->  same Apps Script, deployed as a web app
                       - checks the items are still available
                       - marks them "On hold" and republishes the site
                       - adds a row to the Reservations tab
                       - emails the store (and the customer, if they gave an email)
```

The Google Sheet is the master list. Editing a row by hand works too, and the site picks it up within 5 minutes.

## What it costs

| Piece | Cost |
|---|---|
| GitHub Pages hosting (public repo, free SSL) | $0 |
| Google Sheet, Gmail, Drive, Apps Script | $0 |
| AI listing writer, Gemini free tier (default) | $0 |
| AI listing writer, Claude Haiku (optional) | well under 1 cent per item |
| Reservations backend (Apps Script web app) | $0 |
| pnpcraft.com domain at GoDaddy | your existing renewal only |

Note on the Gemini free tier: Google may use free-tier requests to improve its products. For product photos that is usually fine. If you would rather it not, switch to Claude in step 5.

---

## 1. Put the site on GitHub (10 min)

1. Create a free account at github.com, or sign in.
2. Click **New repository**. Name it `pnpcraft-site`, set it to **Public**, and click **Create repository**.
3. Click **uploading an existing file**. Drag in everything from this folder: `index.html`, `products.json`, `CNAME`, `.nojekyll`, and the `img` and `apps-script` folders. Click **Commit changes**.
   - `.nojekyll` is hidden on Mac. In Finder, press Cmd+Shift+. to show it.
4. Go to **Settings > Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and click **Save**.
5. Still on Settings > Pages, enter `pnpcraft.com` as the **Custom domain** and click **Save**. The DNS check fails until step 2 is done.

Everything in this repo is public. That's fine, because no passwords or keys are ever stored in it.

## 2. Point pnpcraft.com at GitHub (10 min, then wait up to a few hours)

At GoDaddy, open **My Products > pnpcraft.com > DNS**.

1. Under **Forwarding**, delete the forward to Facebook.
2. Delete any existing `A` record for `@` (often called "Parked").
3. Add four `A` records, each with Name `@`:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
4. Add or edit the `CNAME` record with Name `www`, Value `YOUR-GITHUB-USERNAME.github.io`.
5. Back in GitHub Settings > Pages, wait until the DNS check turns green. Then tick **Enforce HTTPS**.

## 3. Make the GitHub key for the robot (5 min)

1. In GitHub, click your picture, then **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.
2. Name it `pinpanacraft robot`. Set **Expiration** to 1 year, and put a reminder in your calendar to renew it.
3. Under **Repository access**, choose **Only select repositories** and pick `pnpcraft-site`.
4. Under **Permissions > Repository permissions**, set **Contents** to **Read and write**.
5. Click **Generate token** and copy it. It is shown only once.

## 4. Get the AI key (3 min)

- **Gemini (free, the default):** go to aistudio.google.com, sign in with the store's Google account, click **Get API key > Create API key**, and copy it.
- **Claude (optional, paid):** go to console.anthropic.com, add a small credit (such as $5, which lasts a long time), create a key, and copy it.

## 5. Create the store sheet and robot (15 min)

Sign in to the Google account that receives the store email (phinphana2@gmail.com).

1. Go to sheets.google.com and create a blank sheet named **Pinpanacraft Store**.
2. Click **Extensions > Apps Script**. Delete the sample code, paste in all of `apps-script/Code.gs`, and click **Save**.
3. At the top of the code, edit `CONFIG`:
   - `GITHUB_REPO`: `your-github-username/pnpcraft-site`
   - `ALLOWED_SENDERS`: the email addresses allowed to post. Only these can change the store.
   - To use Claude instead of Gemini, set `AI_PROVIDER: 'claude'`.
4. Click the gear icon (**Project Settings**). Under **Script Properties > Add script property**, add:
   - `GITHUB_TOKEN`: the token from step 3
   - `GEMINI_API_KEY` (or `ANTHROPIC_API_KEY`): the key from step 4
5. Back in the editor, choose `setup` in the function menu and click **Run**.
   - Google asks for permission. Click **Review permissions**, pick the account, then **Advanced > Go to project (unsafe) > Allow**. The warning appears because this is your own private script, not a published app.
6. Reload the sheet. You should see a **Products** tab with the 12 starting items, a **Log** tab, and a **Pinpanacraft** menu.
7. Click **Pinpanacraft > Publish to website now**. It should report "Published 12 items".

## 6. Test it

1. From an approved address, email one photo to **phinphana2+store@gmail.com** with the note `test pouch $5`.
2. Within 5 minutes you get a reply like `Posted P013: ...`, and the item appears on pnpcraft.com.
3. Reply `hide P013` to take it down.

## 7. Turn on reservations (10 min)

The same script is also the website's backend for reservations. It saves each one to the **Reservations** tab, marks the items "On hold", emails the store, and emails the customer if they gave an email address.

1. In the Apps Script editor, click **Deploy > New deployment**. Click the gear next to "Select type" and choose **Web app**.
2. Set **Execute as** to **Me**, and **Who has access** to **Anyone**. Click **Deploy** and approve the permissions.
3. Copy the **Web app URL** (it ends in `/exec`). Open it in a browser. It should show `{"ok":true,...}`.
4. In GitHub, open `index.html`, click the pencil icon, find `var BACKEND_URL = "";`, paste the URL between the quotes, and click **Commit changes**.
5. On pnpcraft.com, reserve one item with your own phone or email. Check that it shows "On hold", that the store email arrives, and that the row appears in the Reservations tab. Then reply `available P0xx` to release it.

If you change the script later, use **Deploy > Manage deployments > Edit > New version** so the same URL keeps working.

If `BACKEND_URL` is left empty, the site falls back to emailing reservations through FormSubmit. That needs a one-time activation link FormSubmit sends to phinphana2@gmail.com.

---

## Editing by hand in the sheet

| Column | What to put |
|---|---|
| Status | `available`, `reserved` (shows "On hold"), `sold`, `hidden`, or `draft` |
| Category | `denim`, `bags`, `clothing`, `resin-home` (coasters, trays, vases), `resin-gifts` (keychains, pens), `jewelry`, or `gifts` |
| Price | a number, or leave blank for "Price at booth" |
| Image | path of the photo in the repo. The robot fills this in. |
| Photo File / Uploaded | used by the robot. Leave alone. |

Only `available` and `reserved` items show on the site.

## If something goes wrong

- **No reply from the robot:** check the **Log** tab. "Ignored: sender not on the approved list" means you need to add that address to `ALLOWED_SENDERS`. If the Log is empty, open Apps Script and check **Triggers** (clock icon) for a `processInbox` trigger. Run `setup` again if it's missing.
- **The reply says "Publish failed: GitHub 401":** the GitHub token expired or was pasted wrong. Make a new one (step 3) and update `GITHUB_TOKEN`.
- **The reply mentions Gemini or Claude with a 404:** the AI model name was retired. Update `GEMINI_MODEL` or `CLAUDE_MODEL` in `CONFIG` to the current name listed on the provider's site.
- **The site didn't update:** wait 5 minutes and hard-refresh the page. GitHub Pages can take a few minutes to rebuild.
