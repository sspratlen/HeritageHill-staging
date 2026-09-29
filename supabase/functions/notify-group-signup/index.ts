// Supabase Edge Function: notify-group-signup
// Called after someone submits the "Join a Group" form on the public
// Small Groups page. Sends a confirmation email to the requester via Resend,
// and a "new request" email to that group's leader.
//
// This endpoint is callable by anyone (anon key), so the leader email is
// built only from data already in the database: the matching `signups` row
// (same group + requester email, created in the last 10 minutes) and the
// group's stored leader_email -- never from addresses or text the caller
// sends. No matching row -> no leader email.
//
// Deploy: supabase functions deploy notify-group-signup
// Env vars required: RESEND_API_KEY (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// The dashboard link in the leader email points at the site this
// project serves: staging's project ref -> the staging Pages site.
function siteUrl(): string {
  const url = Deno.env.get('SUPABASE_URL') || ''
  return url.includes('govvofbrhhpowtdnuzcw')
    ? 'https://sspratlen.github.io/HeritageHill-staging'
    : 'https://heritagehill.church'
}

async function sendEmail(payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: 'Heritage Hill Church <noreply@heritagehill.church>', ...payload }),
  })
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`)
}

// Emails the group's leader about the request, if we can find the real
// signup row. Failures are logged, never surfaced to the requester.
async function notifyLeader(groupId: unknown, email: string) {
  const gid = Number(groupId)
  if (!Number.isInteger(gid) || gid <= 0 || !email) return 'skipped: no group'
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } })
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: rows, error } = await db.from('signups')
    .select('id, name, email, phone, message, created_at')
    // ilike for a case-insensitive match; escape its % and _ wildcards (common in emails)
    .eq('group_id', gid).ilike('email', email.replace(/[\\%_]/g, '\\$&')).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(`signup lookup: ${error.message}`)
  const s = rows && rows[0]
  if (!s) return 'skipped: no recent signup'
  const { data: g, error: gErr } = await db.from('groups').select('name, leader, leader_email').eq('id', gid).maybeSingle()
  if (gErr) throw new Error(`group lookup: ${gErr.message}`)
  if (!g || !g.leader_email) return 'skipped: group has no leader email'

  const leaderFirst = (g.leader || '').trim().split(/\s+/)[0] || 'there'
  const link = `${siteUrl()}/admin/dashboard.html?tab=groups`
  const row = (label: string, value: string) => value
    ? `<tr><td style="padding:6px 12px 6px 0;color:#6B6B6B;font-size:14px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:14px;color:#1C1C1E;">${value}</td></tr>` : ''
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">
      <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
        <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church · Small Groups</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;line-height:1.25;">New request to join ${esc(g.name)}</h1>
      </div>
      <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">
        <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">Hi ${esc(leaderFirst)}, someone would like to join your group. Reply to this email to reach them directly.</p>
        <table style="border-collapse:collapse;margin:0 0 20px;">
          ${row('Name', `<strong>${esc(s.name)}</strong>`)}
          ${row('Email', `<a href="mailto:${esc(s.email)}" style="color:#9A6118;">${esc(s.email)}</a>`)}
          ${row('Phone', esc(s.phone))}
          ${row('Message', esc(s.message).replace(/\n/g, '<br>'))}
        </table>
        <a href="${link}" style="display:inline-block;background:#BC7A1E;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">Review in your dashboard</a>
        <p style="margin:18px 0 0;font-size:13px;color:#6B6B6B;line-height:1.6;">Open your group's <strong>Members</strong> screen to add them to the group or dismiss the request.</p>
      </div>
    </div>`
  const text = [
    `Hi ${leaderFirst},`, ``,
    `Someone would like to join ${g.name}. Reply to this email to reach them directly.`, ``,
    `Name: ${s.name}`, `Email: ${s.email}`,
    ...(s.phone ? [`Phone: ${s.phone}`] : []),
    ...(s.message ? [`Message: ${s.message}`] : []), ``,
    `Review it in your dashboard (Members screen for your group): ${link}`,
  ].join('\n')
  await sendEmail({ to: [g.leader_email], reply_to: s.email, subject: `New request to join ${g.name}: ${s.name}`, text, html })
  return 'sent'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { name, email, groupName, leaderName, groupId } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'No email provided' }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = (name || '').trim().split(/\s+/)[0] || 'Friend'
    const group      = (groupName || 'the group').trim()
    const leaderLine = leaderName ? `<strong>${leaderName}</strong>` : 'the group leader'
    const leaderText = leaderName ? leaderName : 'the group leader'

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">

        <!-- Header -->
        <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church · Papillion, Nebraska</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25;">Request Received! 🙌</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Thanks for your interest in joining <strong>${group}</strong>! We've received your request
            and passed it along to ${leaderLine}.
          </p>

          <!-- Highlight box -->
          <div style="background:#fdf6ec;border-left:4px solid #BC7A1E;border-radius:0 8px 8px 0;padding:16px 20px;margin:24px 0;">
            <p style="margin:0;font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;">What happens next</p>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#1C1C1E;">
              <li>${leaderLine} will reach out to you directly with next steps.</li>
              <li>This usually happens within a few days.</li>
            </ul>
          </div>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            If you have any questions in the meantime, feel free to reply to this email or
            reach out to us at
            <a href="mailto:heritagehillchurch@gmail.com" style="color:#BC7A1E;font-weight:600;">heritagehillchurch@gmail.com</a>.
          </p>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            We're glad you're taking this step,
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#1C1C1E;">
            The Heritage Hill Church Team
          </p>

          <!-- Divider + footer -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e4e4e4;font-size:11.5px;color:#9ca3af;line-height:1.6;">
            Heritage Hill Church &nbsp;·&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
            <a href="https://heritagehill.church" style="color:#BC7A1E;text-decoration:none;">heritagehill.church</a>
          </div>

        </div>
      </div>
    `

    const textBody = [
      `Hi ${firstName},`,
      ``,
      `Thanks for your interest in joining "${group}"! We've received your request`,
      `and passed it along to ${leaderText}.`,
      ``,
      `What happens next:`,
      `  • ${leaderText} will reach out to you directly with next steps.`,
      `  • This usually happens within a few days.`,
      ``,
      `If you have any questions, reply to this email or reach out at heritagehillchurch@gmail.com.`,
      ``,
      `We're glad you're taking this step,`,
      `The Heritage Hill Church Team`,
      ``,
      `Heritage Hill Church · 6909 Cornhusker Rd, Papillion, NE 68133`,
      `https://heritagehill.church`,
    ].join('\n')

    await sendEmail({
      to:      [email],
      subject: `We Got Your Request to Join ${group} — Heritage Hill Church`,
      text:    textBody,
      html:    htmlBody,
    })

    let leader = 'skipped'
    try { leader = await notifyLeader(groupId, String(email)) }
    catch (e: unknown) { leader = 'failed'; console.error('[notify-group-signup] leader email:', e instanceof Error ? e.message : String(e)) }

    return new Response(
      JSON.stringify({ ok: true, leader }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[notify-group-signup]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
