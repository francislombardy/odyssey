# Odyssey Website

Odyssey website with Cape Living by Odyssey pages, submission forms, Supabase storage, tracking hooks, video optimization, and a password-protected admin submissions dashboard.

Cape Living is implemented inside the Odyssey website for early outreach and lead capture. It is not the standalone Cape Living website.

## Project Type

This is a Node/Express website serving static HTML, CSS, and JavaScript. It is not Vite, React, or Next.js.

- Start command: `npm start`
- Build command: none required
- Publish/output folder: none for static hosting; deploy as a Node service from the project root
- Local default URL: `http://127.0.0.1:4173/`

## Run Locally

```powershell
npm install
npm start
```

Then visit:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/cape-living/`
- `http://127.0.0.1:4173/cape-living/get-featured/`
- `http://127.0.0.1:4173/cape-living/creators/`
- `http://127.0.0.1:4173/cape-living/partners/`
- `http://127.0.0.1:4173/admin/`

Set `ADMIN_PASSWORD` and `ADMIN_SECRET` before production. Use `.env.example` as the deployment reference.

## Supabase Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor.
3. Run `supabase/odyssey_supabase_setup.sql`.
4. Add the environment variables from `.env.example` to `.env` locally and to the production host.
5. Run `npm start` and test the forms.

The SQL file creates:

- `general_enquiries`
- `business_submissions`
- `creator_submissions`
- `partnership_enquiries`
- `media_files`
- `tracking_events`

It also creates private Supabase Storage buckets:

- `business-uploads`
- `creator-uploads`
- `partner-uploads`
- `general-enquiry-uploads`

Uploads are sent through the Express backend with the server-side service role key. Uploaded media is private by default; admin media links are served as short-lived signed Supabase URLs after admin authentication.

## Environment Variables

Required:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PASSWORD
ADMIN_SECRET
```

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Never expose it in frontend JavaScript.

## Forms

These forms submit to the backend and save to Supabase:

- Main Odyssey general enquiry form: `POST /api/submissions/contact`
- Cape Living business submission form: `POST /api/submissions/business`
- Cape Living creator submission form: `POST /api/submissions/creator`
- Cape Living partnership enquiry form: `POST /api/submissions/partner`

The backend validates required fields, email format, consent checkboxes, safe upload types, upload size limits, and the anti-spam honeypot. Business logos, photos, and videos are optional. Creator content upload is still required.

## Admin Dashboard

The admin dashboard is at `/admin/` and remains protected by the existing password-based system.

Admin sections:

- General enquiries
- Business submissions
- Creator submissions
- Partnership enquiries

Admins can view submissions, view uploaded media links, update status, and edit notes. Status options are:

- New
- Reviewed
- Approved
- Rejected
- Contacted
- Follow-up Needed
- Converted
- Archived

## Tracking Events

The front end can send these events to `POST /api/tracking/events`, where they are stored in Supabase:

- `cape_living_page_view`
- `get_featured_click`
- `business_submission`
- `creator_submission`
- `partner_enquiry`
- `business_website_click`
- `business_instagram_click`
- `business_whatsapp_click`
- `business_booking_click`
- `contact_enquiry`

The browser can also push to `dataLayer` or `gtag` if analytics is added later.

## Video Optimization

Portfolio source videos live in `images/videos`. Do not reference new raw portfolio videos directly in the page.

Run:

```powershell
npm run optimize:videos
```

The optimizer:

- Reads originals from `images/videos`.
- Writes compressed MP4 files to `images/optimized-videos`.
- Writes poster thumbnails to `images/video-posters`.
- Writes `images/video-manifest.json`.
- Preserves original aspect ratios.
- Creates 1080px and 720px-wide variants without upscaling smaller videos.
- Removes audio by default because portfolio videos are muted visual previews.
- Skips unchanged videos when the source file, settings, and outputs have not changed.
- Warns when source videos are over 15MB or optimized outputs are over 8MB.

Optional WebM output:

```powershell
npm run optimize:videos:webm
```

Useful options:

```powershell
node scripts/optimize-videos.js --crf 27 --preset slow --force
node scripts/optimize-videos.js --keep-audio
node scripts/optimize-videos.js --widths 1080,720,540
```

The script uses `ffmpeg-static` and `ffprobe-static` from npm, and also supports system binaries via `FFMPEG_PATH` and `FFPROBE_PATH`. If FFmpeg is unavailable, the script warns and exits without breaking deployment. Use `--require-ffmpeg` only when you want a missing FFmpeg binary to fail the run.

To add a new portfolio video:

1. Add the original video to `images/videos`.
2. Run `npm run optimize:videos`.
3. Add the filename to the `videography` list in `script.js` if it is not already listed.
4. The portfolio will automatically use `images/video-manifest.json` to load optimized MP4/WebM files and poster images.

Recommended source guidance:

- Keep original uploads under 150MB where possible.
- Keep final optimized portfolio videos under 8MB when practical.
- Use shorter clips for the portfolio grid; long videos should be linked as case studies instead.
- Re-run the optimizer before deployment whenever videos change.

## Deployment

Deploy this project as a Node/Express app, not as a static-only site.

Recommended deployment settings:

- Install command: `npm install`
- Build command: leave blank, or use `npm install` only if the host requires a build field
- Start command: `npm start`
- Output/publish directory: not used
- Environment: add all required variables from `.env.example`

Before production launch:

1. Run `supabase/odyssey_supabase_setup.sql` in the target Supabase project.
2. Confirm the four upload buckets exist and are private.
3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD`, and `ADMIN_SECRET`.
4. Start the server with `npm start`.
5. Submit each form and confirm the rows appear in `/admin/`.
6. Upload test media and confirm admin media links open after login.
7. Update a submission status and notes, then refresh admin to confirm the update saved.

## Notes

- The server no longer uses SQLite for production submissions.
- The server no longer writes submission uploads to local `.odyssey-data` storage.
- Existing portfolio media remains in the local `images` folder.
- Portfolio videos use poster images, `preload="none"`, deferred source loading, and one-video-at-a-time playback.
- Opening HTML files directly will not submit forms. Run the Node server for forms, uploads, admin, and tracking.
