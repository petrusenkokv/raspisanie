# Generate VAPID keys for Web Push (run once, add to Vercel env):
#   npx web-push generate-vapid-keys
#
# Vercel → Settings → Environment Variables:
#   VAPID_PUBLIC_KEY
#   VAPID_PRIVATE_KEY
#   VAPID_EMAIL=mailto:your@email.ru
#   CRON_SECRET=<random long string>
#
# Reminders on Vercel Free run once/day via vercel.json cron.
# For "1 hour before training" use external cron every 5-15 min, e.g. cron-job.org:
#   GET https://raspisaniepetrusenko.vercel.app/api/cron/reminders
#   Header: Authorization: Bearer <CRON_SECRET>

Write-Host "Generating VAPID keys..."
npx web-push generate-vapid-keys

Write-Host ""
Write-Host "Add keys to Vercel env, redeploy, then users: bell icon -> Включить push"
